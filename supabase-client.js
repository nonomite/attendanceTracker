const SUPABASE_URL = "https://uoxdthgyekhvcvcpnjtu.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_e4luH-dzNIr88tS4FGe0IA_8L1ZeogS";

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// supabase-js only gives a generic "non-2xx status code" message on function
// errors -- the real body (e.g. {status: "already_checked_in"} or
// {error: "..."}) has to be read off the underlying Response separately.
async function readEdgeFunctionBody(error) {
  if (error?.context && typeof error.context.json === "function") {
    try {
      return await error.context.json();
    } catch {
      return {};
    }
  }
  return {};
}
