import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

type EventRow = {
  id: string;
  name: string;
  event_start: string;
  event_end: string | null;
  description: string | null;
  marketing_relevance: number;
  confidence: string;
};

export default function GenerateContent() {
  const [events, setEvents] = useState<EventRow[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const today = new Date().toISOString().slice(0, 10);

  useEffect(() => {
    supabase
      .from('events')
      .select('*')
      .gte('event_start', today)
      .order('event_start')
      .then(({ data, error }) => (error ? setMessage(error.message) : setEvents((data ?? []) as EventRow[])));
  }, [today]);

  async function generate(eventId: string | null) {
    const key = eventId ?? 'general';
    setBusy(key);
    setMessage(null);
    const { data, error } = await supabase.functions.invoke('generate-campaign', { body: { event_id: eventId } });
    setBusy(null);
    setMessage(
      error
        ? `Could not generate content: ${error.message}`
        : `Created ${data?.campaigns_created ?? 0} campaign(s). They are now in Approval.`,
    );
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Generate Content</h1>
        <p className="text-sm text-stone-600">
          Pick an upcoming event to create campaigns in English, Tamil and Telugu. Nothing is published automatically.
        </p>
      </header>
      {message && <div className="card text-sm">{message}</div>}

      <div className="card flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-medium">General hotel promotion</h2>
          <p className="text-sm text-stone-600">Use this when no significant event is coming up.</p>
        </div>
        <button className="btn" disabled={busy !== null} onClick={() => generate(null)}>
          {busy === 'general' ? 'Generating...' : 'Generate general content'}
        </button>
      </div>

      <div className="space-y-3">
        {events.length === 0 && (
          <p className="text-sm text-stone-500">No upcoming events yet. Run event research from Settings.</p>
        )}
        {events.map((ev) => (
          <div key={ev.id} className="card flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="font-medium">{ev.name}</div>
              <div className="text-sm text-stone-600">
                {ev.event_start}
                {ev.event_end && ev.event_end !== ev.event_start ? ` to ${ev.event_end}` : ''} · Relevance{' '}
                {ev.marketing_relevance}/100 · {ev.confidence} confidence
              </div>
              {ev.description && <p className="mt-2 text-sm text-stone-700">{ev.description}</p>}
            </div>
            <button className="btn" disabled={busy !== null} onClick={() => generate(ev.id)}>
              {busy === ev.id ? 'Generating...' : 'Generate content'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
