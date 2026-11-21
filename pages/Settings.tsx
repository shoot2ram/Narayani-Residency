import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { supabase } from '../lib/supabase';

const MUSIC_CATEGORIES = ['devotional', 'instrumental', 'traditional', 'contemporary'] as const;

// Splits on commas or new lines, for lists such as room categories and themes.
const splitList = (text: string) => text.split(/[,\n]+/).map((s) => s.trim()).filter(Boolean);
// Splits on spaces or commas, and adds # to each hashtag.
const toHashtags = (text: string) =>
  text.split(/[\s,]+/).map((t) => t.trim()).filter(Boolean).map((t) => (t.startsWith('#') ? t : '#' + t));

export default function Settings() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-sm text-stone-600">Changes apply to the next campaigns and research runs. No code changes needed.</p>
      </header>
      <HotelInfoForm />
      <BrandForm />
      <ContentForm />
      <MusicLibrary />
      <AutomationPanel />
      <SocialPanel />
    </div>
  );
}

// ---------- Hotel information ----------

type HotelFields = {
  name: string;
  tagline: string;
  booking_phone: string;
  address: string | null;
  description: string | null;
  walking_minutes_to_temple: number | null;
  parking_available: boolean;
  restaurant_info: string | null;
  room_categories: string[];
  terrace_mountain_view: string | null;
};

const EMPTY_HOTEL: HotelFields = {
  name: 'Narayani Residency',
  tagline: 'Stay. Float. Refresh',
  booking_phone: '+91 6369409722',
  address: '',
  description: '',
  walking_minutes_to_temple: null,
  parking_available: true,
  restaurant_info: '',
  room_categories: [],
  terrace_mountain_view: '',
};

function HotelInfoForm() {
  const [id, setId] = useState<string | null>(null);
  const [v, setV] = useState<HotelFields>(EMPTY_HOTEL);
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
          setV({ ...EMPTY_HOTEL, ...rest, room_categories: rest.room_categories ?? [] });
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
      <Field label="Hotel name">
        <input className="input" value={v.name} onChange={(e) => set('name', e.target.value)} required />
      </Field>
      <Field label="Tagline">
        <input className="input" value={v.tagline} onChange={(e) => set('tagline', e.target.value)} required />
      </Field>
      <Field label="Contact and booking number">
        <input className="input" value={v.booking_phone} onChange={(e) => set('booking_phone', e.target.value)} required />
      </Field>
      <Field label="Walking minutes to Arunachaleswara Temple">
        <input
          className="input"
          type="number"
          min={0}
          value={v.walking_minutes_to_temple ?? ''}
          onChange={(e) => set('walking_minutes_to_temple', e.target.value === '' ? null : Number(e.target.value))}
        />
      </Field>
      <Field label="Address" wide>
        <input className="input" value={v.address ?? ''} onChange={(e) => set('address', e.target.value)} />
      </Field>
      <Field label="Room categories (comma separated)" wide>
        <input
          className="input"
          value={v.room_categories.join(', ')}
          onChange={(e) => set('room_categories', splitList(e.target.value))}
          placeholder="Executive, Deluxe, Standard"
        />
      </Field>
      <Field label="Terrace mountain view" wide>
        <textarea
          className="input"
          rows={2}
          value={v.terrace_mountain_view ?? ''}
          onChange={(e) => set('terrace_mountain_view', e.target.value)}
        />
      </Field>
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

// ---------- Brand ----------

function BrandForm() {
  const [primaryColor, setPrimaryColor] = useState('');
  const [headingFont, setHeadingFont] = useState('');
  const [style, setStyle] = useState('');
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from('brand_settings')
      .select('primary_color,heading_font,infographic_style')
      .eq('id', 1)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) return;
        setPrimaryColor(data.primary_color);
        setHeadingFont(data.heading_font);
        setStyle(data.infographic_style);
      });
  }, []);

  async function save(e: FormEvent) {
    e.preventDefault();
    const { error } = await supabase.from('brand_settings').upsert({
      id: 1,
      primary_color: primaryColor.trim(),
      heading_font: headingFont.trim(),
      infographic_style: style.trim(),
      updated_at: new Date().toISOString(),
    });
    setNotice(error ? error.message : 'Saved.');
  }

  return (
    <form onSubmit={save} className="card grid gap-4 md:grid-cols-2">
      <h2 className="text-lg font-semibold md:col-span-2">Brand</h2>
      <p className="text-sm text-stone-600 md:col-span-2">
        Upload the logo under Hotel Assets, in the Hotel logo category. It is used without changing its proportions.
      </p>
      <Field label="Brand colours">
        <input className="input" value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} />
      </Field>
      <Field label="Preferred heading font style">
        <input className="input" value={headingFont} onChange={(e) => setHeadingFont(e.target.value)} />
      </Field>
      <Field label="Preferred infographic style" wide>
        <textarea className="input" rows={2} value={style} onChange={(e) => setStyle(e.target.value)} />
      </Field>
      <div className="flex items-center gap-3 md:col-span-2">
        <button className="btn">Save brand settings</button>
        {notice && <span className="text-sm text-stone-600">{notice}</span>}
      </div>
    </form>
  );
}

// ---------- Content ----------

const LANGUAGE_OPTIONS = [
  ['en', 'English'],
  ['ta', 'Tamil'],
  ['te', 'Telugu'],
] as const;

function ContentForm() {
  const [languages, setLanguages] = useState<string[]>(['en', 'ta', 'te']);
  const [imagesPerEvent, setImagesPerEvent] = useState(2);
  const [tone, setTone] = useState('');
  const [themes, setThemes] = useState('');
  const [hashtags, setHashtags] = useState('');
  const [musicCategories, setMusicCategories] = useState<string[]>([]);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from('content_settings')
      .select('*')
      .eq('id', 1)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) return;
        setLanguages(data.languages);
        setImagesPerEvent(data.images_per_event);
        setTone(data.tone);
        setThemes((data.themes as string[]).join(', '));
        setHashtags((data.hashtags as string[]).join(' '));
        setMusicCategories(data.music_categories);
      });
  }, []);

  const toggle = (list: string[], value: string) =>
    list.includes(value) ? list.filter((x) => x !== value) : [...list, value];

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!languages.length) {
      setNotice('Choose at least one language');
      return;
    }
    const { error } = await supabase.from('content_settings').upsert({
      id: 1,
      languages,
      images_per_event: imagesPerEvent,
      tone: tone.trim(),
      themes: splitList(themes),
      hashtags: toHashtags(hashtags),
      music_categories: musicCategories,
      updated_at: new Date().toISOString(),
    });
    setNotice(error ? error.message : 'Saved. New campaigns will use these settings.');
  }

  return (
    <form onSubmit={save} className="card grid gap-4 md:grid-cols-2">
      <h2 className="text-lg font-semibold md:col-span-2">Content</h2>
      <div className="md:col-span-2">
        <p className="mb-1 text-sm text-stone-600">Content languages</p>
        <div className="flex flex-wrap gap-4 text-sm">
          {LANGUAGE_OPTIONS.map(([code, label]) => (
            <label key={code} className="flex items-center gap-2">
              <input type="checkbox" checked={languages.includes(code)} onChange={() => setLanguages(toggle(languages, code))} />
              {label}
            </label>
          ))}
        </div>
      </div>
      <Field label="Images generated per event and language">
        <select className="input" value={imagesPerEvent} onChange={(e) => setImagesPerEvent(Number(e.target.value))}>
          <option value={1}>Portrait only (1080 x 1350)</option>
          <option value={2}>Portrait and square (1080 x 1350 and 1080 x 1080)</option>
        </select>
      </Field>
      <Field label="Preferred marketing tone">
        <input className="input" value={tone} onChange={(e) => setTone(e.target.value)} />
      </Field>
      <Field label="Preferred promotional themes (comma separated)" wide>
        <input className="input" value={themes} onChange={(e) => setThemes(e.target.value)} placeholder="Girivalam comfort, family stays" />
      </Field>
      <Field label="Hashtag preferences (space or comma separated)" wide>
        <input className="input" value={hashtags} onChange={(e) => setHashtags(e.target.value)} placeholder="#Tiruvannamalai #NarayaniResidency" />
      </Field>
      <div className="md:col-span-2">
        <p className="mb-1 text-sm text-stone-600">Music categories to use</p>
        <div className="flex flex-wrap gap-4 text-sm">
          {MUSIC_CATEGORIES.map((c) => (
            <label key={c} className="flex items-center gap-2 capitalize">
              <input type="checkbox" checked={musicCategories.includes(c)} onChange={() => setMusicCategories(toggle(musicCategories, c))} />
              {c}
            </label>
          ))}
        </div>
        <p className="mt-1 text-xs text-stone-500">Leave all unchecked to use any approved track.</p>
      </div>
      <div className="flex items-center gap-3 md:col-span-2">
        <button className="btn">Save content settings</button>
        {notice && <span className="text-sm text-stone-600">{notice}</span>}
      </div>
    </form>
  );
}

// ---------- Music library ----------

type Track = {
  id: string;
  title: string;
  category: string;
  mood: string | null;
  license_note: string | null;
  source_url: string | null;
  approved: boolean;
};

function MusicLibrary() {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<string>('devotional');
  const [mood, setMood] = useState('');
  const [license, setLicense] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('music_tracks').select('*').order('created_at', { ascending: false });
    if (error) setNotice(error.message);
    else setTracks((data ?? []) as Track[]);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function add(e: FormEvent) {
    e.preventDefault();
    const { error } = await supabase.from('music_tracks').insert({
      title: title.trim(),
      category,
      mood: mood.trim() || null,
      license_note: license.trim() || null,
      source_url: sourceUrl.trim() || null,
      approved: false,
    });
    if (error) setNotice(error.message);
    else {
      setTitle('');
      setMood('');
      setLicense('');
      setSourceUrl('');
      setNotice('Track added. Approve it below before campaigns can use it.');
      load();
    }
  }

  async function setApproved(t: Track, approved: boolean) {
    const { error } = await supabase.from('music_tracks').update({ approved }).eq('id', t.id);
    if (error) setNotice(error.message);
    load();
  }

  async function remove(t: Track) {
    if (!window.confirm('Remove ' + t.title + ' from the library?')) return;
    const { error } = await supabase.from('music_tracks').delete().eq('id', t.id);
    if (error) setNotice(error.message);
    load();
  }

  return (
    <section className="card space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Music library</h2>
        <p className="text-sm text-stone-600">
          Add only tracks you have licensed for commercial use. Campaigns use approved tracks only.
        </p>
      </div>

      <form onSubmit={add} className="grid gap-3 md:grid-cols-2">
        <Field label="Track title">
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} required />
        </Field>
        <Field label="Category">
          <select className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
            {MUSIC_CATEGORIES.map((c) => (
              <option key={c} value={c} className="capitalize">{c}</option>
            ))}
          </select>
        </Field>
        <Field label="Mood">
          <input className="input" value={mood} onChange={(e) => setMood(e.target.value)} placeholder="Calm, devotional, festive" />
        </Field>
        <Field label="Licence note">
          <input className="input" value={license} onChange={(e) => setLicense(e.target.value)} placeholder="Licence reference" />
        </Field>
        <Field label="Link to the licensed file" wide>
          <input className="input" type="url" value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} />
        </Field>
        <div className="md:col-span-2">
          <button className="btn">Add track</button>
        </div>
      </form>

      <ul className="divide-y text-sm">
        {tracks.length === 0 && <li className="py-3 text-stone-500">No tracks yet.</li>}
        {tracks.map((t) => (
          <li key={t.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div>
              <p className="font-medium">{t.title}</p>
              <p className="text-xs text-stone-500 capitalize">
                {t.category}
                {t.mood ? ' · ' + t.mood : ''}
                {t.license_note ? ' · Licence: ' + t.license_note : ''}
              </p>
              {t.source_url && (
                <a className="text-xs underline" href={t.source_url} target="_blank" rel="noreferrer">Open file</a>
              )}
            </div>
            <div className="flex gap-2">
              <button className="btn-ghost" onClick={() => setApproved(t, !t.approved)}>
                {t.approved ? 'Unapprove' : 'Approve'}
              </button>
              <button className="btn-ghost text-red-700" onClick={() => remove(t)}>Remove</button>
            </div>
            <span className={`rounded-full px-2 py-1 text-xs ${t.approved ? 'bg-emerald-100 text-emerald-900' : 'bg-stone-100 text-stone-600'}`}>
              {t.approved ? 'Approved' : 'Not approved'}
            </span>
          </li>
        ))}
      </ul>
      {notice && <p className="text-sm text-stone-700">{notice}</p>}
    </section>
  );
}

// ---------- Automation ----------

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
    if (error) setNotice('Research failed: ' + error.message);
    else if (data?.status === 'skipped') setNotice('Not started: ' + data.reason);
    else setNotice('Research ' + (data?.status ?? 'finished') + '. Events found: ' + (data?.events_discovered ?? 0) + '. Campaigns created: ' + (data?.campaigns_generated ?? 0) + '.');
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

// ---------- Social media ----------

type Conn = { platform: string; account_name: string | null; status: string; last_error: string | null; last_tested_at: string | null };
const PLATFORM_NAMES: Record<string, string> = {
  instagram: 'Instagram Professional account',
  facebook: 'Facebook Page',
};

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
    setNotice(error ? platform + ': ' + error.message : platform + ': ' + (data?.message ?? 'connection checked'));
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
                  {c?.last_tested_at ? ' · tested ' + new Date(c.last_tested_at).toLocaleString('en-IN') : ''}
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

// ---------- Shared field wrapper ----------

function Field({ label, wide, children }: { label: string; wide?: boolean; children: ReactNode }) {
  return (
    <label className={`block text-sm ${wide ? 'md:col-span-2' : ''}`}>
      <span className="mb-1 block text-stone-600">{label}</span>
      {children}
    </label>
  );
}
