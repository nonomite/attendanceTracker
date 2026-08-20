// Edge Function: start-meeting
// Creates an OPEN meeting and returns a one-time attendance URL.
// Only callers whose profiles.role = 'admin' may call this.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MAX_DURATION_MS = 6 * 60 * 60 * 1000; // 6 hours

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function randomToken(bytes = 32) {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(input: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } },
    );

    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) return json({ error: "unauthorized" }, 401);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: profile } = await admin
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (!profile || profile.role !== "admin") return json({ error: "forbidden" }, 403);

    const body = await req.json().catch(() => ({}));
    const { title, meetingCode, expiresAt } = body as Record<string, unknown>;

    if (typeof title !== "string" || !title.trim()) {
      return json({ error: "title is required" }, 400);
    }
    if (typeof meetingCode !== "string" || !meetingCode.trim()) {
      return json({ error: "meetingCode is required" }, 400);
    }
    if (typeof expiresAt !== "string") {
      return json({ error: "expiresAt is required" }, 400);
    }

    const expiresDate = new Date(expiresAt);
    const now = new Date();

    if (Number.isNaN(expiresDate.getTime()) || expiresDate <= now) {
      return json({ error: "expiresAt must be a valid future timestamp" }, 400);
    }
    if (expiresDate.getTime() - now.getTime() > MAX_DURATION_MS) {
      return json({ error: "expiresAt is too far in the future" }, 400);
    }

    const { data: existingOpen, error: openError } = await admin
      .from("meetings")
      .select("id")
      .eq("status", "OPEN")
      .limit(1);

    if (openError) return json({ error: openError.message }, 500);
    if (existingOpen && existingOpen.length > 0) {
      return json({ error: "a meeting is already open" }, 409);
    }

    const rawToken = randomToken();
    const tokenHash = await sha256Hex(rawToken);

    const { data: meeting, error: insertError } = await admin
      .from("meetings")
      .insert({
        title: title.trim(),
        meeting_code: meetingCode.trim(),
        created_by: user.id,
        expires_at: expiresDate.toISOString(),
        qr_token_hash: tokenHash,
      })
      .select()
      .single();

    if (insertError) return json({ error: insertError.message }, 400);

    const siteUrl = Deno.env.get("SITE_URL") ?? "";

    return json({
      meeting: {
        id: meeting.id,
        title: meeting.title,
        meetingCode: meeting.meeting_code,
        expiresAt: meeting.expires_at,
        status: meeting.status,
      },
      attendanceUrl: `${siteUrl}/index.html?t=${rawToken}`,
    });
  } catch {
    return json({ error: "internal_error" }, 500);
  }
});
