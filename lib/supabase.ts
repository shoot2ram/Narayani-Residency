import { createClient } from '@supabase/supabase-js';

// Only the publishable key is used in the browser. Admin-only work runs in edge functions.
export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL as string,
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string,
);
