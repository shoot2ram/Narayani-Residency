import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

type Ev = {
  id: string;
  name: string;
  event_start: string;
  event_end: string | null;
  location: string;
  description: string | null;
  source_url: string;
  verified_on: string;
  confidence: string;
  marketing_relevance: number;
  status: string;
};
type Rev = { id: string; previous_data: Partial<Ev>; changed_at: string };

export default function EventCalendar() {
  const today = new Date().toISOString().slice(0, 10);
  const [events, setEvents] = useState<Ev[]>([]);
  const [upcomingOnly, setUpcomingOnly] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const [revisions, setRevisions] = useState<Rev[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let query = supabase.from('events').select('*').order('event_start');
    if (upcomingOnly) query = query.gte('event_start', today);
    query.then(({ data, error }) => (error ? setError(error.message) : setEvents((data ?? []) as Ev[])));
  }, [upcomingOnly, today]);

  async function toggleHistory(id: string) {
    if (openId === id) {
      setOpenId(null);
      return;
    }
    setOpenId(id);
    const { data } = await supabase
      .from('event_revisions')
      .select('*')
      .eq('event_id', id)
      .order('changed_at', { ascending: false });
    setRevisions((data ?? []) as Rev[]);
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Event Calendar</h1>
          <p className="text-sm text-stone-600">Events found by research, with the source and when each was last verified.</p>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={upcomingOnly} onChange={(e) => setUpcomingOnly(e.target.checked)} />
          Upcoming only
        </label>
      </header>
      {error && <div className="card text-sm text-red-700">{error}</div>}

      <div className="space-y-3">
        {events.length === 0 && <p className="text-sm text-stone-500">No events to show yet.</p>}
        {events.map((ev) => (
          <div key={ev.id} className="card space-y-2">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <h2 className="font-medium">{ev.name}</h2>
                <p className="text-sm text-stone-600">
                  {ev.event_start}
                  {ev.event_end && ev.event_end !== ev.event_start ? ` to ${ev.event_end}` : ''} · {ev.location}
                </p>
              </div>
              <div className="flex gap-2 text-xs">
                <span className="rounded-full bg-stone-100 px-2 py-1">{ev.confidence} confidence</span>
                <span className="rounded-full bg-amber-100 px-2 py-1">Relevance {ev.marketing_relevance}</span>
                <span className="rounded-full bg-stone-100 px-2 py-1 capitalize">{ev.status}</span>
              </div>
            </div>
            {ev.description && <p className="text-sm text-stone-700">{ev.description}</p>}
            <p className="text-xs text-stone-500">
              Verified {ev.verified_on} ·{' '}
              <a className="underline" href={ev.source_url} target="_blank" rel="noreferrer">Source</a>
            </p>
            <button className="text-xs underline" onClick={() => toggleHistory(ev.id)}>
              {openId === ev.id ? 'Hide history' : 'Show history'}
            </button>
            {openId === ev.id && (
              <ul className="space-y-1 rounded-lg bg-stone-50 p-3 text-xs">
                {revisions.length === 0 && <li>No earlier versions.</li>}
                {revisions.map((r) => (
                  <li key={r.id}>
                    Changed {new Date(r.changed_at).toLocaleString('en-IN')}: was {r.previous_data.event_start}
                    {r.previous_data.description ? ` - ${r.previous_data.description}` : ''}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
