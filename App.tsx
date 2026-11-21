import type { ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './lib/auth';
import { supabase } from './lib/supabase';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import GenerateContent from './pages/GenerateContent';
import Approval from './pages/Approval';
import PublishedPosts from './pages/PublishedPosts';
import EventCalendar from './pages/EventCalendar';
import HotelAssets from './pages/HotelAssets';
import Settings from './pages/Settings';

// Signed-in administrators only. Everyone else is sent to sign-in or told they lack access.
function Protected({ children }: { children: ReactNode }) {
  const { session, isAdmin, loading } = useAuth();
  if (loading) return <p className="p-8 text-stone-500">Loading...</p>;
  if (!session) return <Navigate to="/login" replace />;
  if (!isAdmin) {
    return (
      <div className="max-w-md p-8">
        <h1 className="text-xl font-semibold">Administrator access required</h1>
        <p className="mt-2 text-sm text-stone-600">This account is not an administrator. Ask the owner to grant access.</p>
        <button className="btn mt-4" onClick={() => supabase.auth.signOut()}>Sign out</button>
      </div>
    );
  }
  return <Layout>{children}</Layout>;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<Protected><Dashboard /></Protected>} />
          <Route path="/generate" element={<Protected><GenerateContent /></Protected>} />
          <Route path="/approval" element={<Protected><Approval /></Protected>} />
          <Route path="/published" element={<Protected><PublishedPosts /></Protected>} />
          <Route path="/events" element={<Protected><EventCalendar /></Protected>} />
          <Route path="/assets" element={<Protected><HotelAssets /></Protected>} />
          <Route path="/settings" element={<Protected><Settings /></Protected>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
