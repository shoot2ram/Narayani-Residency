import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

type Row = {
  id: string;
  platform: string;
  status: string;
  attempted_at: string;
  published_at: string | null;
  external_url: string | null;
  error_message: string | null;
  campaigns: { title: string; language: string } | null;
};

export default function PublishedPosts() {
  const [rows, setRows] = useState<Row[]>([]);
  const [filter, setFilter] = useState('all');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from('publishing_history')
      .select('*, campaigns(title, language)')
      .order('attempted_at', { ascending: false })
      .then(({ data, error }) => (error ? setError(error.message) : setRows((data ?? []) as Row[])));
  }, []);

  const visible = rows.filter((r) => filter === 'all' || r.status === filter);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Published Posts</h1>
          <p className="text-sm text-stone-600">Every publishing attempt, with links to live posts and errors for failed ones.</p>
        </div>
        <select className="input w-auto" value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="all">All</option>
          <option value="success">Published</option>
          <option value="failed">Failed</option>
          <option value="pending">Pending</option>
        </select>
      </header>
      {error && <div className="card text-sm text-red-700">{error}</div>}

      <div className="card overflow-x-auto p-0">
        <table className="w-full text-left text-sm">
          <thead className="border-b bg-stone-50 text-stone-600">
            <tr>
              <th className="p-3">When</th>
              <th className="p-3">Campaign</th>
              <th className="p-3">Platform</th>
              <th className="p-3">Status</th>
              <th className="p-3">Post or error</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => (
              <tr key={r.id} className="border-b last:border-0">
                <td className="p-3 whitespace-nowrap">{new Date(r.published_at ?? r.attempted_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</td>
                <td className="p-3">{r.campaigns?.title ?? '—'} <span className="text-xs text-stone-500">{r.campaigns?.language?.toUpperCase()}</span></td>
                <td className="p-3 capitalize">{r.platform}</td>
                <td className="p-3 capitalize">{r.status}</td>
                <td className="p-3">
                  {r.status === 'success' && r.external_url ? (
                    <a className="underline" href={r.external_url} target="_blank" rel="noreferrer">Open post</a>
                  ) : r.status === 'failed' ? (
                    <span className="text-red-700">{r.error_message}</span>
                  ) : (
                    '—'
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {visible.length === 0 && <p className="p-6 text-sm text-stone-500">No publishing activity yet.</p>}
      </div>
    </div>
  );
}
