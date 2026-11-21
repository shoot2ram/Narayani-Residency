import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';

export default function Settings() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-sm text-stone-600">Changes apply to the next campaigns and research runs. No code changes needed.</p>
      </header>
      <HotelInfoForm />
      <AutomationPanel />
      <SocialPanel />
      <section className="card text-sm text-stone-600">
        Brand, content and music settings need their own database tables. They are not in the current schema yet.
      </section>
    </div>
  );
}

type HotelFields = {
  name: string;
  tagline: string;
  booking_phone: string;
  address: string | null;
  description: string | null;
  walking_minutes_to_temple: number | null;
  parking_available: boolean;
  restaurant_info: string | null;
};

const EMPTY: HotelFields = {
  name: 'Narayani Residency',
  tagline: 'Stay. Float. Refresh',
  booking_phone: '+91 6369409722',
  address: '',
  description: '',
  walking_minutes_to_temple: null,
  parking_available: true,
  restaurant_info: '',
};

function HotelInfoForm() {
  const [id, setId] = useState<string | null>(null);
  const [v, setV] = useState<HotelFields>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from('hotel_info')
      .select('*')
      .limit(1)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) return setNotice(error.message);
        if (data) {
          const { id: rowId, ...rest } = data as HotelFields & { id: string };
          setId(rowId);
          setV(rest);
        }
      });
  }, []);

  function set<K extends keyof HotelFields>(key: K, value: HotelFields[K]) {
    setV((prev) => ({ ...prev, [key]: value }));
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setNotice(null);
    const payload = { ...v, updated_at: new Date().toISOString() };
    const res = id
      ? await supabase.from('hotel_info').update(payload).eq('id', id).select('id').single()
      : await supabase.from('hotel_info').insert(payload).select('id').single();
    setSaving(false);
    if (res.error) setNotice(res.error.message);
    else {
      setId(res.data.id);
      setNotice('Saved. The next campaigns will use these details.');
    }
  }

  return (
    <form onSubmit={save} className="card grid gap-4 md:grid-cols-2">
      <h2 className="text-lg font-semibold md:col-span-2">Hotel information</h2>
      <Field label="Hotel name"><input className="input" value={v.name} onChange={(e) => set('name', e.target.value)} required /></Field>
      <Field label="Tagline"><input className="input" value={v.tagline} onChange={(e) => set('tagline', e.target.value)} required /></Field>
      <Field label="Booking phone"><input className="input" value={v.booking_phone} onChange={(e) => set('booking_phone', e.target.value)} required /></Field>
      <Field label="Walking minutes to Arunachaleswara Temple">
        <input
          className="input"
          type="number"
          min={0}
          value={v.walking_minutes_to_temple ?? ''}
          onChange={(e) => set('walking_minutes_to_temple', e.target.value === '' ? null : Number(e.target.value))}
        />
      </Field>
      <Field label="Address" wide><input className="input" value={v.address ?? ''} onChange={(e) => set('address', e.target.value)} /></Field>
      <Field label="Hotel description" wide>
        <textarea className="input" rows={3} value={v.description ?? ''} onChange={(e) => set('description', e.target.value)} />
      </Field>
      <Field label="Restaurant information" wide>
        <textarea className="input" rows={2} value={v.restaurant_info ?? ''} onChange={(e) => set('restaurant_info', e.target.value)} />
      </Field>
      <label className="flex items-center gap-2 text-sm md:col-span-2">
        <input type="checkbox" checked={v.parking_available} onChange={(e) => set('parking_available', e.target.checked)} />
        Parking available
      </label>
      <div className="flex items-center gap-3 md:col-span-2">
        <button className="btn" disabled={saving}>{saving ? 'Saving...' : 'Save hotel information'}</button>
        {notice && <span className="text-sm text-stone-600">{notice}</span>}
      </div>
    </form>
  );
}

function Field({ label, wide, children }: { label: string; wide?: boolean; children: React.ReactNode }) {
  return (
    <label className={`block text-sm ${wide ? 'md:col-span-2' : ''}`}>
      <span className="mb-1 block text-stone-600">{label}</span>
      {children}
    </label>
  );
}

type Sched = {
  enabled: boolean;
  frequency_days: number;
  timezone: string;
  next_run_at: string;
  last_success_at: string | null;
};
type Run = { status: string; started_at: string; error_details: string | null } | null;

const fmt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' }) : 'Never';

function AutomationPanel() {
  const [sched, setSched] = useState<Sched | null>(null);
  const [run, setRun] = useState<Run>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [s, r] = await Promise.all([
      supabase.from('automation_schedules').select('*').eq('job_name', 'event_discovery').maybeSingle(),
      supabase.from('discovery_runs').select('status,started_at,error_details').order('started_at', { ascending: false }).limit(1).maybeSingle(),
    ]);
    setSched((s.data as Sched) ?? null);
    setRun((r.data as Run) ?? null);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function setEnabled(enabled: boolean) {
    const { error } = await supabase
      .from('automation_schedules')
      .update({ enabled, updated_at: new Date().toISOString() })
      .eq('job_name', 'event_discovery');
    if (error) setNotice(error.message);
    load();
  }

  async function runNow() {
    setBusy(true);
    setNotice(null);
    const { data, error } = await supabase.functions.invoke('discover-events', { body: {} });
    setBusy(false);
    if (error) setNotice(`Research failed: ${error.message}`);
    else if (data?.status === 'skipped') setNotice(`Not started: ${data.reason}`);
    else setNotice(`Research ${data?.status ?? 'finished'}. Events found: ${data?.events_discovered ?? 0}. Campaigns created: ${data?.campaigns_generated ?? 0}.`);
    load();
  }

  return (
    <section className="card space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Automation</h2>
        <button className="btn" disabled={busy || !sched} onClick={runNow}>
          {busy ? 'Running research...' : 'Run research now'}
        </button>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={sched?.enabled ?? false} disabled={!sched} onChange={(e) => setEnabled(e.target.checked)} />
        Event discovery enabled
      </label>
      <div className="grid gap-4 text-sm sm:grid-cols-3">
        <div>
          <p className="text-stone-600">Frequency</p>
          <p className="font-medium">Every {sched?.frequency_days ?? 5} days ({sched?.timezone ?? 'Asia/Kolkata'})</p>
        </div>
        <div>
          <p className="text-stone-600">Last successful run</p>
          <p className="font-medium">{fmt(sched?.last_success_at ?? null)}</p>
        </div>
        <div>
          <p className="text-stone-600">Next scheduled run</p>
          <p className="font-medium">{fmt(sched?.next_run_at ?? null)}</p>
        </div>
      </div>
      {run && (
        <p className="text-sm text-stone-600">
          Latest run: <span className="capitalize">{run.status}</span> · {fmt(run.started_at)}
          {run.error_details ? <span className="block text-xs text-red-700">{run.error_details}</span> : null}
        </p>
      )}
      {notice && <p className="text-sm text-stone-700">{notice}</p>}
    </section>
  );
}

type Conn = { platform: string; account_name: string | null; status: string; last_error: string | null; last_tested_at: string | null };
const PLATFORM_NAMES: Record<string, string> = { instagram: 'Instagram Professional account', facebook: 'Facebook Page' };

function SocialPanel() {
  const [conns, setConns] = useState<Conn[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [testing, setTesting] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase.from('social_connections').select('*');
    setConns((data ?? []) as Conn[]);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function test(platform: string) {
    setTesting(platform);
    setNotice(null);
    const { data, error } = await supabase.functions.invoke('test-social-connection', { body: { platform } });
    setTesting(null);
    setNotice(error ? `${platform}: ${error.message}` : `${platform}: ${data?.message ?? 'connection checked'}`);
    load();
  }

  return (
    <section className="card space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Social media</h2>
        <p className="text-sm text-stone-600">
          Access tokens stay in backend secrets and never appear here. To reconnect, update the Meta secrets and run a test.
        </p>
      </div>
      <div className="space-y-3">
        {['instagram', 'facebook'].map((platform) => {
          const c = conns.find((x) => x.platform === platform);
          return (
            <div key={platform} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-stone-200 p-3">
              <div>
                <p className="font-medium">{PLATFORM_NAMES[platform]}</p>
                <p className="text-sm text-stone-600">
                  {c?.account_name ?? 'Not connected'} · <span className="capitalize">{c?.status ?? 'disconnected'}</span>
                  {c?.last_tested_at ? ` · tested ${new Date(c.last_tested_at).toLocaleString('en-IN')}` : ''}
                </p>
                {c?.last_error && <p className="text-xs text-red-700">{c.last_error}</p>}
              </div>
              <button className="btn-ghost" disabled={testing !== null} onClick={() => test(platform)}>
                {testing === platform ? 'Testing...' : 'Test connection'}
              </button>
            </div>
          );
        })}
      </div>
      {notice && <p className="text-sm text-stone-700">{notice}</p>}
    </section>
  );
}
