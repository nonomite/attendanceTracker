// Shared Supabase browser client. Load the CDN script before this file:
// <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
//
// The anon/public key is safe to ship in browser code -- it is meant to be
// public. Row Level Security policies on the database decide what it can
// actually read, and all writes go through Edge Functions instead.

const SUPABASE_URL = "https://uoxdthgyekhvcvcpnjtu.supabase.co"; // TODO: paste your project URL
const SUPABASE_ANON_KEY = "sb_publishable_e4luH-dzNIr88tS4FGe0IA_8L1ZeogS"; // TODO: paste your anon/public key

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
