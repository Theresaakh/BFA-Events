/**
 * Public Supabase settings. The publishable (anon) key is designed to be public: all access is
 * enforced by Row Level Security. The service-role key must NEVER appear in this file or any
 * NEXT_PUBLIC_ variable.
 */
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
export const SUPABASE_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '';

/** False until the Supabase project exists → the app runs in demo mode (fictional data, no login). */
export const supabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY);
