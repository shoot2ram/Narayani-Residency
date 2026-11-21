import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const META_PAGE_ACCESS_TOKEN = Deno.env.get('META_PAGE_ACCESS_TOKEN')!;
const META_INSTAGRAM_ACCOUNT_ID = Deno.env.get('META_INSTAGRAM_ACCOUNT_ID')!;
const META_FACEBOOK_PAGE_ID = Deno.env.get('META_FACEBOOK_PAGE_ID')!;
const GRAPH = 'https://graph.facebook.com/v21.0';
const PUBLISH_FORMAT = 'portrait_1080x1350';

type Platform = 'instagram' | 'facebook';
const PLATFORMS: Platform[] = ['instagram', 'facebook'];

const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

// Returns the admin's user id, or null for anyone else.
async function requireAdmin(req: Request): Promise<string | null> {
  const token = req.headers.get('Authorization')?.replace('Bearer ', '');
  if (!token) return null;
  const { data: { user } } = await db.auth.getUser(token);
  if (!user) return null;
  const { data: isAdmin } = await db.rpc('has_role', { _user_id: user.id, _role: 'admin' });
  return isAdmin ? user.id : null;
}

// Meta Graph API call. The token is read from backend secrets and never returned to the browser.
async function graph(path: string, params: Record<string, string>) {
  const body = new URLSearchParams({ ...params, access_token: META_PAGE_ACCESS_TOKEN });
  const res = await fetch(`${GRAPH}/${path}`, { method: 'POST', body });
  const data = await res.json();
  if (!res.ok || data.error) throw new Error(`Meta API: ${data.error?.message ?? res.statusText}`);
  return data;
}

async function publishInstagram(imageUrl: string, caption: string) {
  // Step 1: create a media container from the public image URL.
  const container = await graph(`${META_INSTAGRAM_ACCOUNT_ID}/media`, { image_url: imageUrl, caption });
  // Step 2: wait until Instagram finishes processing the image.
  for (let i = 0; i < 10; i++) {
    const res = await fetch(`${GRAPH}/${container.id}?fields=status_code&access_token=${META_PAGE_ACCESS_TOKEN}`);
    const st = await res.json();
    if (st.status_code === 'FINISHED') break;
    if (st.status_code === 'ERROR' || st.status_code === 'EXPIRED') throw new Error('Instagram could not process the image');
    await new Promise((r) => setTimeout(r, 3000));
  }
  // Step 3: publish the container.
  const published = await graph(`${META_INSTAGRAM_ACCOUNT_ID}/media_publish`, { creation_id: container.id });
  const info = await fetch(`${GRAPH}/${published.id}?fields=permalink&access_token=${META_PAGE_ACCESS_TOKEN}`)
    .then((r) => r.json());
  return { id: published.id as string, url: (info.permalink ?? null) as string | null };
}

async function publishFacebook(imageUrl: string, message: string) {
  const res = await graph(`${META_FACEBOOK_PAGE_ID}/photos`, { url: imageUrl, message, published: 'true' });
  const postId = res.post_id ?? res.id;
  return { id: postId as string, url: `https://www.facebook.com/${postId}` };
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const userId = await requireAdmin(req);
  if (!userId) return json({ error: 'Unauthorized' }, 401);

  const body = await req.json().catch(() => ({}));
  const { campaign_id, platforms, confirmed } = body as {
    campaign_id?: string; platforms?: Platform[]; confirmed?: boolean;
  };
  // The administrator must confirm the final publish in the UI. Nothing publishes without it.
  if (confirmed !== true) return json({ error: 'Final publishing confirmation is required' }, 400);
  if (!campaign_id) return json({ error: 'campaign_id is required' }, 400);

  const wanted = (platforms ?? []).filter((p): p is Platform => PLATFORMS.includes(p));
  if (!wanted.length) return json({ error: 'Choose at least one platform' }, 400);

  const { data: campaign } = await db.from('campaigns').select('*').eq('id', campaign_id).maybeSingle();
  if (!campaign) return json({ error: 'Campaign not found' }, 404);
  if (campaign.status !== 'approved' && campaign.status !== 'partially_published') {
    return json({ error: 'Only approved campaigns can be published' }, 409);
  }

  const { data: version } = await db.from('campaign_versions').select('*')
    .eq('campaign_id', campaign_id)
    .eq('version_number', campaign.current_version_number)
    .eq('format', PUBLISH_FORMAT).maybeSingle();
  if (!version) return json({ error: 'No image found for the current version' }, 404);

  const results: Record<string, unknown>[] = [];

  for (const platform of wanted) {
    // Claim the platform first. The unique index rejects this insert if the platform is already
    // pending or published, which prevents duplicate posts.
    const { data: claim, error: claimErr } = await db.from('publishing_history').insert({
      campaign_id, platform, version_number: version.version_number, status: 'pending', requested_by: userId,
    }).select('id').single();
    if (claimErr || !claim) {
      results.push({ platform, status: 'skipped', reason: 'Already published or publishing' });
      continue;
    }

    const caption = platform === 'instagram' ? campaign.instagram_caption : campaign.facebook_caption;
    try {
      const out = platform === 'instagram'
        ? await publishInstagram(version.image_url, caption)
        : await publishFacebook(version.image_url, caption);
      await db.from('publishing_history').update({
        status: 'success', external_id: out.id, external_url: out.url, published_at: new Date().toISOString(),
      }).eq('id', claim.id);
      results.push({ platform, status: 'success', url: out.url });
    } catch (e) {
      // Only this platform is marked failed. A retry will publish only this platform.
      const message = (e as Error).message;
      await db.from('publishing_history').update({ status: 'failed', error_message: message }).eq('id', claim.id);
      results.push({ platform, status: 'failed', reason: message });
    }
  }

  const { data: successes } = await db.from('publishing_history').select('platform')
    .eq('campaign_id', campaign_id).eq('status', 'success');
  const done = new Set((successes ?? []).map((r) => r.platform));
  const newStatus = PLATFORMS.every((p) => done.has(p)) ? 'published'
    : done.size ? 'partially_published' : 'approved';
  await db.from('campaigns').update({ status: newStatus, updated_at: new Date().toISOString() }).eq('id', campaign_id);

  await db.from('approval_history').insert({
    campaign_id, version_id: version.id, action: 'publish', actor_id: userId, note: JSON.stringify(results),
  });

  return json({ campaign_status: newStatus, results });
});
