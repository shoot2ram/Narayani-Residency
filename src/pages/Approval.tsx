import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

const PLATFORMS = ['instagram', 'facebook'] as const;
type Platform = (typeof PLATFORMS)[number];
const PUBLISH_FORMAT = 'portrait_1080x1350';
const PLATFORM_LABEL: Record<Platform, string> = { instagram: 'Instagram', facebook: 'Facebook' };
const STATUS_LABEL: Record<string, string> = {
  pending_approval: 'Pending Approval',
  approved: 'Approved',
  rejected: 'Rejected',
  partially_published: 'Partially published',
  published: 'Published',
};

type Version = { id: string; version_number: number; format: string; image_url: string; feedback: string | null };
type PubRow = { platform: Platform; status: string; external_url: string | null; error_message: string | null };
export type Campaign = {
  id: string;
  title: string;
  language: string;
  headline: string;
  instagram_caption: string;
  facebook_caption: string;
  hashtags: string[];
  call_to_action: string;
  music_mood: string | null;
  status: string;
  current_version_number: number;
  created_at: string;
  events: { name: string } | null;
  campaign_versions: Version[];
  publishing_history: PubRow[];
};

// Throws on a Supabase error so each action can show the message.
const check = (r: { error: { message: string } | null }) => {
  if (r.error) throw new Error(r.error.message);
};
const currentUserId = async () => (await supabase.auth.getUser()).data.user?.id ?? null;

export default function Approval() {
  const [items, setItems] = useState<Campaign[]>([]);
  const [filter, setFilter] = useState('pending_approval');
  const [error, setError] = useState<string | null>(null);
  const [publishing, setPublishing] = useState<{ campaign: Campaign; platforms: Platform[] } | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('campaigns')
      .select('*, events(name), campaign_versions(*), publishing_history(platform,status,external_url,error_message)')
      .order('created_at', { ascending: false });
    if (error) setError(error.message);
    else setItems((data ?? []) as Campaign[]);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const visible = items.filter((c) => filter === 'all' || c.status === filter);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Approval</h1>
          <p className="text-sm text-stone-600">Review each campaign. Nothing is published until you approve it and confirm.</p>
        </div>
        <select className="input w-auto" value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="all">All</option>
          <option value="pending_approval">Pending Approval</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
        </select>
      </header>
      {error && <div className="card text-sm text-red-700">{error}</div>}

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {visible.map((c) => (
          <CampaignCard
            key={c.id}
            campaign={c}
            onChanged={load}
            onPublish={(platforms) => setPublishing({ campaign: c, platforms })}
          />
        ))}
      </div>
      {visible.length === 0 && <p className="text-sm text-stone-500">No campaigns in this view.</p>}

      {publishing && (
        <PublishDialog
          campaign={publishing.campaign}
          platforms={publishing.platforms}
          onClose={() => setPublishing(null)}
          onDone={() => {
            setPublishing(null);
            load();
          }}
        />
      )}
    </div>
  );
}

function CampaignCard({
  campaign: c,
  onChanged,
  onPublish,
}: {
  campaign: Campaign;
  onChanged: () => void;
  onPublish: (platforms: Platform[]) => void;
}) {
  const [mode, setMode] = useState<null | 'feedback' | 'reject'>(null);
  const [feedback, setFeedback] = useState('');
  const [rejectReason, setRejectReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const versions = c.campaign_versions
    .filter((v) => v.format === PUBLISH_FORMAT)
    .sort((a, b) => b.version_number - a.version_number);
  const current = versions.find((v) => v.version_number === c.current_version_number) ?? versions[0];
  const successful = new Set(c.publishing_history.filter((p) => p.status === 'success').map((p) => p.platform));
  const toPublish = PLATFORMS.filter((p) => !successful.has(p));

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setMsg(null);
    try {
      await action();
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
      onChanged();
    }
  }

  const approve = () =>
    run(async () => {
      check(await supabase.from('campaigns').update({ status: 'approved', updated_at: new Date().toISOString() }).eq('id', c.id));
      check(
        await supabase.from('approval_history').insert({
          campaign_id: c.id,
          version_id: current?.id ?? null,
          action: 'approve',
          actor_id: await currentUserId(),
        }),
      );
    });

  const reject = () =>
    run(async () => {
      if (!rejectReason.trim()) throw new Error('Enter a reason for rejecting this campaign');
      check(await supabase.from('campaigns').update({ status: 'rejected', updated_at: new Date().toISOString() }).eq('id', c.id));
      check(
        await supabase.from('approval_history').insert({
          campaign_id: c.id,
          version_id: current?.id ?? null,
          action: 'reject',
          note: rejectReason.trim(),
          actor_id: await currentUserId(),
        }),
      );
      setMode(null);
      setRejectReason('');
    });

  // The regenerate function creates a new image version and sets the campaign back to Pending Approval.
  // The older versions stay available for comparison.
  const requestChanges = () =>
    run(async () => {
      if (!feedback.trim()) throw new Error('Write the changes you want first');
      const { error } = await supabase.functions.invoke('regenerate-campaign', {
        body: { campaign_id: c.id, feedback: feedback.trim() },
      });
      if (error) throw new Error(`Regeneration failed: ${error.message}`);
      setFeedback('');
      setMode(null);
    });

  return (
    <article className="card flex flex-col gap-4">
      {current ? (
        <img src={current.image_url} alt={c.title} className="w-full rounded-lg bg-stone-100 object-cover" />
      ) : (
        <div className="grid aspect-[4/5] place-items-center rounded-lg bg-stone-100 text-sm text-stone-500">No image yet</div>
      )}

      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="font-semibold">{c.title}</h2>
          <p className="text-xs text-stone-500">
            {c.events?.name ?? 'General hotel content'} · {c.language.toUpperCase()} ·{' '}
            {new Date(c.created_at).toLocaleDateString('en-IN')}
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-amber-100 px-2 py-1 text-xs text-amber-900">
          {STATUS_LABEL[c.status] ?? c.status}
        </span>
      </div>

      <div className="space-y-1 text-sm">
        <p><span className="font-medium">Instagram:</span> {c.instagram_caption}</p>
        <p><span className="font-medium">Facebook:</span> {c.facebook_caption}</p>
        <p className="text-stone-600">
          <span className="font-medium">Music:</span> {c.music_mood ?? 'None'} · Version {current?.version_number ?? c.current_version_number}
        </p>
      </div>

      {versions.length > 1 && (
        <div>
          <p className="text-xs font-medium text-stone-600">Earlier versions</p>
          <div className="mt-1 flex gap-2 overflow-x-auto">
            {versions.map((v) => (
              <figure key={v.id} className="w-20 shrink-0 text-center text-xs">
                <img src={v.image_url} alt={`Version ${v.version_number}`} className="rounded border" />
                <figcaption>v{v.version_number}</figcaption>
              </figure>
            ))}
          </div>
        </div>
      )}

      {PLATFORMS.map((p) => {
        const row =
          c.publishing_history.find((r) => r.platform === p && r.status === 'success') ??
          c.publishing_history.find((r) => r.platform === p && r.status === 'failed');
        if (!row) return null;
        return (
          <p key={p} className="text-sm">
            {PLATFORM_LABEL[p]}:{' '}
            {row.status === 'success' ? (
              <a className="underline" href={row.external_url ?? '#'} target="_blank" rel="noreferrer">published</a>
            ) : (
              <span className="text-red-700">failed: {row.error_message}</span>
            )}
          </p>
        );
      })}

      {msg && <p className="text-sm text-red-700">{msg}</p>}

      <div className="flex flex-wrap gap-2">
        {c.status === 'pending_approval' && (
          <>
            <button className="btn" disabled={busy} onClick={approve}>Approve</button>
            <button className="btn-ghost" disabled={busy} onClick={() => setMode(mode === 'reject' ? null : 'reject')}>Reject</button>
          </>
        )}
        {(c.status === 'pending_approval' || c.status === 'approved' || c.status === 'partially_published') && (
          <button className="btn-ghost" disabled={busy} onClick={() => setMode(mode === 'feedback' ? null : 'feedback')}>
            Suggest changes
          </button>
        )}
        {(c.status === 'approved' || c.status === 'partially_published') && toPublish.length > 0 && (
          <button className="btn" disabled={busy} onClick={() => onPublish(toPublish)}>
            Publish to {toPublish.map((p) => PLATFORM_LABEL[p]).join(' and ')}
          </button>
        )}
      </div>

      {mode === 'feedback' && (
        <div className="space-y-2">
          <textarea
            className="input"
            rows={3}
            placeholder="For example: make the phone number larger, or use the actual Deluxe room photograph"
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
          />
          <button className="btn" disabled={busy} onClick={requestChanges}>
            {busy ? 'Regenerating...' : 'Regenerate image'}
          </button>
        </div>
      )}

      {mode === 'reject' && (
        <div className="space-y-2">
          <textarea
            className="input"
            rows={2}
            placeholder="Reason for rejecting"
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
          />
          <button className="btn-ghost" disabled={busy} onClick={reject}>Confirm rejection</button>
        </div>
      )}
    </article>
  );
}

function PublishDialog({
  campaign: c,
  platforms,
  onClose,
  onDone,
}: {
  campaign: Campaign;
  platforms: Platform[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<{ platform: string; status: string; url?: string | null; reason?: string }[] | null>(null);

  const version = c.campaign_versions
    .filter((v) => v.format === PUBLISH_FORMAT)
    .find((v) => v.version_number === c.current_version_number);
  const hashtags = c.hashtags.map((h) => (h.startsWith('#') ? h : `#${h}`)).join(' ');

  async function publish() {
    setBusy(true);
    setError(null);
    const { data, error } = await supabase.functions.invoke('publish-campaign', {
      body: { campaign_id: c.id, platforms, confirmed: true },
    });
    setBusy(false);
    if (error) setError(error.message);
    else setResults(data?.results ?? []);
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 p-4">
      <div className="mx-auto max-w-4xl space-y-5 rounded-xl bg-white p-6">
        <h2 className="text-lg font-semibold">Review before publishing</h2>
        <div className="grid gap-5 md:grid-cols-2">
          {platforms.map((p) => (
            <div key={p} className="space-y-2">
              <p className="text-sm font-medium">{PLATFORM_LABEL[p]} preview</p>
              {version && <img src={version.image_url} alt="" className="w-full rounded-lg border" />}
              <p className="whitespace-pre-line text-sm">{p === 'instagram' ? c.instagram_caption : c.facebook_caption}</p>
              <p className="text-xs text-stone-600">{hashtags}</p>
            </div>
          ))}
        </div>
        <p className="text-sm text-stone-600">
          Music: {c.music_mood ?? 'None'} · Call to action: {c.call_to_action}
        </p>

        {!results && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
            I have reviewed this and want to publish now.
          </label>
        )}
        {error && <p className="text-sm text-red-700">{error}</p>}
        {results && (
          <ul className="space-y-1 text-sm">
            {results.map((r) => (
              <li key={r.platform}>
                {PLATFORM_LABEL[r.platform as Platform] ?? r.platform}: {r.status}
                {r.url ? ` (${r.url})` : ''}
                {r.reason ? ` · ${r.reason}` : ''}
              </li>
            ))}
          </ul>
        )}

        <div className="flex justify-end gap-2">
          {results ? (
            <button className="btn" onClick={onDone}>Done</button>
          ) : (
            <>
              <button className="btn-ghost" onClick={onClose}>Cancel</button>
              <button className="btn" disabled={!confirmed || busy} onClick={publish}>
                {busy ? 'Publishing...' : 'Confirm and publish'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
