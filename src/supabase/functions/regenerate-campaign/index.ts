import { getDb, json, loadSettings, regenerateCampaign, requireAdmin } from '../_shared/campaign-engine.ts';

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const db = getDb();
  const adminId = await requireAdmin(req, db);
  if (!adminId) return json({ error: 'Unauthorized' }, 401);

  const body = await req.json().catch(() => ({}));
  const campaignId: string | undefined = body.campaign_id;
  const feedback: string = (body.feedback ?? '').trim();
  if (!campaignId || !feedback) return json({ error: 'campaign_id and feedback are required' }, 400);

  const { data: campaign } = await db.from('campaigns').select('status').eq('id', campaignId).maybeSingle();
  if (!campaign) return json({ error: 'Campaign not found' }, 404);
  if (campaign.status === 'published' || campaign.status === 'partially_published') {
    return json({ error: 'This campaign is already live on a platform, so it cannot be regenerated.' }, 409);
  }

  try {
    const settings = await loadSettings(db);
    const version = await regenerateCampaign(db, settings, campaignId, feedback);
    await db.from('approval_history').insert({
      campaign_id: campaignId,
      action: 'regenerate',
      note: feedback,
      actor_id: adminId,
    });
    return json({ version_number: version, status: 'pending_approval' });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
