import {
  createCampaign, getDb, json, loadSettings, requireAdmin, type EventInput, type Lang,
} from '../_shared/campaign-engine.ts';

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const db = getDb();
  if (!(await requireAdmin(req, db))) return json({ error: 'Unauthorized' }, 401);

  const body = await req.json().catch(() => ({}));
  const eventId: string | null = body.event_id ?? null;
  const settings = await loadSettings(db);

  let event: EventInput | null = null;
  let alreadyDone = new Set<string>();
  if (eventId) {
    const { data, error } = await db.from('events')
      .select('id, name, description, recommended_features')
      .eq('id', eventId)
      .maybeSingle();
    if (error || !data) return json({ error: 'Event not found' }, 404);
    event = data as EventInput;
    const { data: existing } = await db.from('campaigns').select('language').eq('event_id', eventId);
    alreadyDone = new Set((existing ?? []).map((r) => r.language));
  }

  let created = 0;
  const errors: string[] = [];
  for (const lang of settings.languages as Lang[]) {
    if (event && alreadyDone.has(lang)) continue; // no repeated content for the same event
    try {
      await createCampaign(db, settings, event, lang);
      created++;
    } catch (e) {
      errors.push(lang + ': ' + (e as Error).message);
    }
  }

  if (created === 0 && errors.length) return json({ error: errors.join('; ') }, 500);
  return json({ campaigns_created: created, errors });
});
