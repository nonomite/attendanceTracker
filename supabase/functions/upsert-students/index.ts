// Edge Function: upsert-students
// Bulk-adds/updates roster rows. Admin only. Exists so roster management
// doesn't depend on the Supabase Studio CSV importer, which is picky about
// column names/types when a table has defaulted/nullable columns.

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
    const students = body?.students;

    if (!Array.isArray(students) || students.length === 0) {
      return json({ error: "students must be a non-empty array" }, 400);
    }
    if (students.length > 5000) {
      return json({ error: "too many rows in a single request (max 5000)" }, 400);
    }

    const rows = [];
    for (const [i, s] of students.entries()) {
      const studentNumber = String(s?.studentNumber ?? "").trim();
      const fullName = String(s?.fullName ?? "").trim();
      if (!studentNumber || !fullName) {
        return json({ error: `row ${i + 1}: studentNumber and fullName are required` }, 400);
      }
      rows.push({ student_number: studentNumber, full_name: fullName, active: true });
    }

    const { data, error } = await admin
      .from("students")
      .upsert(rows, { onConflict: "student_number" })
      .select("id");

    if (error) return json({ error: error.message }, 400);

    return json({ upserted: data.length });
  } catch (err) {
    console.error("upsert-students error:", err);
    return json({ error: "internal_error" }, 500);
  }
});
