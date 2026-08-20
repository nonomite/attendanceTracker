// Edge Function: time-in
// Validates the scanned QR token and records exactly one attendance row
// per student per meeting. This is the source of truth for the anti-duplicate
// and expiry rules -- the browser only reflects what this function decides.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function sha256Hex(input: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ status: "method_not_allowed" }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const { token, studentNumber } = body as Record<string, unknown>;

    if (typeof token !== "string" || !token.trim()) {
      return json({ status: "invalid_request" }, 400);
    }
    if (typeof studentNumber !== "string" || !studentNumber.trim()) {
      return json({ status: "invalid_request" }, 400);
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const tokenHash = await sha256Hex(token.trim());

    const { data: meeting } = await admin
      .from("meetings")
      .select("*")
      .eq("qr_token_hash", tokenHash)
      .maybeSingle();

    if (!meeting) return json({ status: "invalid_token" }, 404);

    const isExpired = new Date(meeting.expires_at).getTime() <= Date.now();

    if (meeting.status === "OPEN" && isExpired) {
      await admin.from("meetings").update({ status: "EXPIRED" }).eq("id", meeting.id);
      return json({ status: "meeting_closed" }, 409);
    }
    if (meeting.status !== "OPEN") {
      return json({ status: "meeting_closed" }, 409);
    }

    const { data: student } = await admin
      .from("students")
      .select("id, active")
      .eq("student_number", studentNumber.trim())
      .maybeSingle();

    if (!student || !student.active) {
      return json({ status: "student_not_recognized" }, 404);
    }

    const { error: insertError } = await admin.from("attendance").insert({
      meeting_id: meeting.id,
      student_id: student.id,
    });

    if (insertError) {
      // unique_violation on (meeting_id, student_id) -> already checked in
      if (insertError.code === "23505") return json({ status: "already_checked_in" });
      return json({ status: "error" }, 500);
    }

    return json({ status: "recorded" });
  } catch (err) {
    console.error("time-in error:", err);
    return json({ status: "error" }, 500);
  }
});
