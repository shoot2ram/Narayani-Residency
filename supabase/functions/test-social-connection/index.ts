import { getDb, json, requireAdmin } from '../_shared/campaign-engine.ts';

const GRAPH = 'https://graph.facebook.com/v21.0';

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const db = getDb();
  if (!(await requireAdmin(req, db))) return json({ error: 'Unauthorized' }, 401);

  const body = await req.json().catch(() => ({}));
  const platform: string = body.platform;
  if (platform !== 'instagram' && platform !== 'facebook') {
    return json({ error: 'platform must be instagram or facebook' }, 400);
  }

  const token = Deno.env.get('META_PAGE_ACCESS_TOKEN');
  const accountId = platform === 'instagram'
    ? Deno.env.get('META_INSTAGRAM_ACCOUNT_ID')
    : Deno.env.get('META_FACEBOOK_PAGE_ID');

  let status: 'connected' | 'error' = 'error';
  let accountName: string | null = null;
  let lastError: string | null = null;

  if (!token || !accountId) {
    lastError = 'Backend secrets are missing: add META_PAGE_ACCESS_TOKEN and the account ID';
  } else {
    // A read call checks that the token and account ID both work. The token is never returned.
    const fields = platform === 'instagram' ? 'username,name' : 'name';
    const res = await fetch(GRAPH + '/' + accountId + '?fields=' + fields + '&access_token=' + encodeURIComponent(token));
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.error) {
      lastError = data.error?.message ?? 'Meta returned status ' + res.status;
    } else {
      status = 'connected';
      accountName = platform === 'instagram' ? (data.username ?? data.name ?? null) : (data.name ?? null);
    }
  }

  const now = new Date().toISOString();
  await db.from('social_connections').upsert({
    platform,
    account_id: accountId ?? null,
    account_name: accountName,
    status,
    last_error: lastError,
    last_tested_at: now,
    updated_at: now,
  }, { onConflict: 'platform' });

  return json({
    platform,
    status,
    account_name: accountName,
    message: status === 'connected' ? 'Connected to ' + (accountName ?? 'the account') : lastError,
  });
});
