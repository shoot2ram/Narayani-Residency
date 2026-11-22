import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

const CATEGORIES = [
  ['hotel_exterior', 'Hotel exterior'],
  ['reception', 'Reception'],
  ['executive_rooms', 'Executive rooms'],
  ['deluxe_rooms', 'Deluxe rooms'],
  ['standard_rooms', 'Standard rooms'],
  ['restaurant', 'Aaryas pure vegetarian restaurant'],
  ['terrace_mountain_view', 'Terrace and Arunachaleswara mountain view'],
  ['logo', 'Hotel logo'],
] as const;
const LABEL: Record<string, string> = Object.fromEntries(CATEGORIES);
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const ACCEPT = ALLOWED_TYPES.join(',');
const BUCKET = 'hotel-assets';

type Asset = {
  id: string;
  category: string;
  storage_path: string;
  public_url: string;
  file_name: string;
  description: string | null;
  mime_type: string;
};

const safeName = (name: string) => name.replace(/[^\w.-]+/g, '_');

export default function HotelAssets() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [filter, setFilter] = useState('all');
  const [uploadCategory, setUploadCategory] = useState<string>('hotel_exterior');
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('hotel_assets').select('*').order('created_at', { ascending: false });
    if (error) setNotice(error.message);
    else setAssets((data ?? []) as Asset[]);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Stores one file in the bucket and returns its path and public URL.
  async function store(category: string, file: File) {
    if (!ALLOWED_TYPES.includes(file.type)) throw new Error(`${file.name}: only JPG, JPEG, PNG and WebP are allowed`);
    const path = `${category}/${crypto.randomUUID()}-${safeName(file.name)}`;
    const { error } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type });
    if (error) throw new Error(error.message);
    const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
    return { path, url: data.publicUrl };
  }

  async function upload(files: FileList | null) {
    if (!files) return;
    setBusy(true);
    setNotice(null);
    for (const file of Array.from(files)) {
      try {
        const { path, url } = await store(uploadCategory, file);
        const { error } = await supabase.from('hotel_assets').insert({
          category: uploadCategory,
          storage_path: path,
          public_url: url,
          file_name: file.name,
          mime_type: file.type,
        });
        if (error) throw new Error(error.message);
      } catch (e) {
        setNotice((e as Error).message);
      }
    }
    setBusy(false);
    load();
  }

  async function replace(asset: Asset, files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    setBusy(true);
    setNotice(null);
    try {
      const { path, url } = await store(asset.category, file);
      const { error } = await supabase
        .from('hotel_assets')
        .update({
          storage_path: path,
          public_url: url,
          file_name: file.name,
          mime_type: file.type,
          updated_at: new Date().toISOString(),
        })
        .eq('id', asset.id);
      if (error) throw new Error(error.message);
      await supabase.storage.from(BUCKET).remove([asset.storage_path]);
    } catch (e) {
      setNotice((e as Error).message);
    }
    setBusy(false);
    load();
  }

  async function rename(asset: Asset) {
    const name = window.prompt('New file name', asset.file_name)?.trim();
    if (!name) return;
    const { error } = await supabase
      .from('hotel_assets')
      .update({ file_name: name, updated_at: new Date().toISOString() })
      .eq('id', asset.id);
    if (error) setNotice(error.message);
    load();
  }

  async function editDescription(asset: Asset) {
    const text = window.prompt('Description', asset.description ?? '');
    if (text === null) return;
    const { error } = await supabase
      .from('hotel_assets')
      .update({ description: text.trim() || null, updated_at: new Date().toISOString() })
      .eq('id', asset.id);
    if (error) setNotice(error.message);
    load();
  }

  async function remove(asset: Asset) {
    if (!window.confirm(`Delete ${asset.file_name}? This cannot be undone.`)) return;
    await supabase.storage.from(BUCKET).remove([asset.storage_path]);
    const { error } = await supabase.from('hotel_assets').delete().eq('id', asset.id);
    if (error) setNotice(error.message);
    load();
  }

  const visible = assets.filter((a) => filter === 'all' || a.category === filter);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Hotel Assets</h1>
        <p className="text-sm text-stone-600">
          Real photographs and the logo. Campaigns use only these images, so never upload anything that misrepresents the hotel.
        </p>
      </header>
      {notice && <div className="card text-sm text-red-700">{notice}</div>}

      <section className="card flex flex-wrap items-end gap-3">
        <label className="text-sm">
          <span className="mb-1 block text-stone-600">Category</span>
          <select className="input w-auto" value={uploadCategory} onChange={(e) => setUploadCategory(e.target.value)}>
            {CATEGORIES.map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </label>
        <label className={`btn cursor-pointer ${busy ? 'opacity-50' : ''}`}>
          {busy ? 'Working...' : 'Upload images'}
          <input type="file" multiple accept={ACCEPT} className="hidden" disabled={busy} onChange={(e) => upload(e.target.files)} />
        </label>
        <p className="text-xs text-stone-500">JPG, JPEG, PNG or WebP.</p>
      </section>

      <div className="flex flex-wrap gap-2">
        {[['all', 'All'], ...CATEGORIES].map(([value, label]) => (
          <button
            key={value}
            onClick={() => setFilter(value)}
            className={`rounded-full px-3 py-1 text-sm ${filter === value ? 'bg-amber-700 text-white' : 'bg-white text-stone-700 border border-stone-300'}`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
        {visible.map((a) => (
          <div key={a.id} className="card space-y-2 p-3">
            <img src={a.public_url} alt={a.description ?? a.file_name} className="aspect-square w-full rounded-lg bg-stone-100 object-cover" />
            <p className="truncate text-sm font-medium" title={a.file_name}>{a.file_name}</p>
            <p className="text-xs text-stone-500">{LABEL[a.category]}</p>
            {a.description && <p className="line-clamp-2 text-xs text-stone-600">{a.description}</p>}
            <div className="flex flex-wrap gap-1 text-xs">
              <button className="btn-ghost px-2 py-1" onClick={() => rename(a)}>Rename</button>
              <button className="btn-ghost px-2 py-1" onClick={() => editDescription(a)}>Describe</button>
              <label className="btn-ghost cursor-pointer px-2 py-1">
                Replace
                <input type="file" accept={ACCEPT} className="hidden" onChange={(e) => replace(a, e.target.files)} />
              </label>
              <button className="btn-ghost px-2 py-1 text-red-700" onClick={() => remove(a)}>Delete</button>
            </div>
          </div>
        ))}
      </div>
      {visible.length === 0 && <p className="text-sm text-stone-500">No images in this category yet.</p>}
    </div>
  );
}
