import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

type Sched = { next_run_at: string; last_success_at: string | null; frequency_days: number } | null;
type Run = { status: string; started_at: string; error_details: string | null } | null;

const fmt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' }) : 'Never';

export default function Dashboard() {
  const [counts, setCounts] = useState({ total: 0, pending: 0, approved: 0, ig: 0, fb: 0, upcoming: 0 });
  const [sched, setSched] = useState<Sched>(null);
  const [run, setRun] = useState<Run>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    const count = (table: string, filter: (q: any) => any = (q) => q): Promise<number> =>
      filter(supabase.from(table).select('id', { count: 'exact', head: true })).then((r: any) => r.count ?? 0);

    Promise.all([
      count('campaigns'),
      count('campaigns', (q) => q.eq('status', 'pending_approval')),
      count('campaigns', (q) => q.eq('status', 'approved')),
      count('publishing_history', (q) => q.eq('platform', 'instagram').eq('status', 'success')),
      count('publishing_history', (q) => q.eq('platform', 'facebook').eq('status', 'success')),
      count('events', (q) => q.gte('event_start', today)),
      supabase.from('automation_schedules').select('next_run_at,last_success_at,frequency_days').eq('job_name', 'event_discovery').maybeSingle(),
      supabase.from('discovery_runs').select('status,started_at,error_details').order('started_at', { ascending: false }).limit(1).maybeSingle(),
    ])
      .then(([total, pending, approved, ig, fb, upcoming, s, r]) => {
        setCounts({ total, pending, approved, ig, fb, upcoming });
        setSched((s.data as Sched) ?? null);
        setRun((r.data as Run) ?? null);
      })
      .catch((e) => setError((e as Error).message));
  }, []);

  const stats = [
    ['Total content generated', counts.total],
    ['Pending approvals', counts.pending],
    ['Approved posts', counts.approved],
    ['Published Instagram posts', counts.ig],
    ['Published Facebook posts', counts.fb],
    ['Upcoming Tiruvannamalai events', counts.upcoming],
  ] as const;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="text-sm text-stone-600">Hotel marketing at a glance.</p>
      </header>
      {error && <div className="card text-sm text-red-700">{error}</div>}
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-3">
        {stats.map(([label, value]) => (
          <div key={label} className="card">
            <p className="text-sm text-stone-600">{label}</p>
            <p className="mt-1 text-3xl font-semibold text-amber-800">{value}</p>
          </div>
        ))}
      </div>
      <div className="card grid gap-4 sm:grid-cols-3">
        <div>
          <p className="text-sm text-stone-600">Last successful event research</p>
          <p className="mt-1 font-medium">{fmt(sched?.last_success_at ?? null)}</p>
        </div>
        <div>
          <p className="text-sm text-stone-600">Next scheduled research</p>
          <p className="mt-1 font-medium">{fmt(sched?.next_run_at ?? null)}</p>
        </div>
        <div>
          <p className="text-sm text-stone-600">Latest run</p>
          <p className="mt-1 font-medium capitalize">{run ? `${run.status} (${fmt(run.started_at)})` : 'No runs yet'}</p>
          {run?.error_details && <p className="mt-1 text-xs text-red-700">{run.error_details}</p>}
        </div>
      </div>
    </div>
  );
}
