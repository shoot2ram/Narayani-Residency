import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../lib/auth';

const ITEMS = [
  ['/', 'Dashboard'],
  ['/generate', 'Generate Content'],
  ['/approval', 'Approval'],
  ['/published', 'Published Posts'],
  ['/events', 'Event Calendar'],
  ['/assets', 'Hotel Assets'],
  ['/settings', 'Settings'],
] as const;

export default function Layout({ children }: { children: ReactNode }) {
  const { signOut } = useAuth();
  return (
    <div className="min-h-screen md:flex">
      <aside className="bg-stone-900 p-4 text-stone-100 md:min-h-screen md:w-60">
        <div className="font-semibold tracking-wide">Narayani Residency</div>
        <div className="text-xs text-amber-300">Marketing</div>
        <nav className="mt-4 flex gap-2 overflow-x-auto md:flex-col">
          {ITEMS.map(([to, label]) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `whitespace-nowrap rounded-lg px-3 py-2 text-sm ${
                  isActive ? 'bg-amber-700 text-white' : 'text-stone-300 hover:bg-stone-800'
                }`
              }
            >
              {label}
            </NavLink>
          ))}
        </nav>
        <button onClick={() => signOut()} className="mt-4 text-xs text-stone-400 underline">
          Sign out
        </button>
      </aside>
      <main className="flex-1 p-4 md:p-8">{children}</main>
    </div>
  );
}
