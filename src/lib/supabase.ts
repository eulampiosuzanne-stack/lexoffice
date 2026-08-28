import { createClient } from '@supabase/supabase-js';

const fallbackSupabaseUrl = 'https://dcpwcuototomxoiszukt.supabase.co';
const fallbackSupabasePublishableKey = 'sb_publishable_h1gal1BQha__PKo2_wxY_Q_wZfAqoEm';

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined) || fallbackSupabaseUrl;
const supabaseKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) || fallbackSupabasePublishableKey;

export const supabaseConfigured = Boolean(supabaseUrl && supabaseKey);
export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
