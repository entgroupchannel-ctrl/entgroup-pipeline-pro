/**
 * b2b-live-chat — Edge Function
 * Deploy ที่ B2B Supabase project (ugzdwmyylqmirrljtuej)
 *
 * GET  /b2b-live-chat                    → รายการ quote_requests + last message + unread count
 * GET  /b2b-live-chat?quote_id=XXX       → รายการ quote_messages ทั้งหมดของ quote นั้น
 * POST /b2b-live-chat                    → ส่งข้อความใหม่ (staff reply)
 * POST /b2b-live-chat  body:{mark_read, quote_id, staff_id}  → mark messages as read
 *
 * Authorization: header x-crm-secret: entgroup-crm-secret-2026
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CRM_SECRET  = Deno.env.get("CRM_SECRET") ?? "entgroup-crm-secret-2026";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-crm-secret",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

function unauthorized() {
  return json({ error: "Unauthorized" }, 403);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  // Auth check
  const secret = req.headers.get("x-crm-secret");
  if (secret !== CRM_SECRET) return unauthorized();

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const url   = new URL(req.url);

  // ══════════════════════════════════════════════════════════
  // POST — ส่งข้อความ หรือ mark as read
  // ══════════════════════════════════════════════════════════
  if (req.method === "POST") {
    const body = await req.json().catch(() => ({}));

    // mark_read: { mark_read: true, quote_id, staff_id }
    if (body.mark_read && body.quote_id) {
      const readBy = { [body.staff_id ?? "staff"]: new Date().toISOString() };
      await admin
        .from("quote_messages")
        .update({ read_by: readBy })
        .eq("quote_id", body.quote_id)
        .eq("sender_role", "customer");
      return json({ ok: true });
    }

    // send message: { quote_id, sender_name, content, message_type? }
    if (!body.quote_id || !body.content) {
      return json({ error: "quote_id and content required" }, 400);
    }
    const { data, error } = await admin.from("quote_messages").insert({
      quote_id:     body.quote_id,
      sender_name:  body.sender_name ?? "ENT Sales",
      sender_role:  "staff",
      content:      body.content,
      message_type: body.message_type ?? "text",
      metadata:     body.metadata ?? null,
    }).select().single();

    if (error) return json({ error: error.message }, 400);
    return json({ ok: true, data });
  }

  // ══════════════════════════════════════════════════════════
  // GET — conversations list OR thread
  // ══════════════════════════════════════════════════════════
  const quoteId = url.searchParams.get("quote_id");
  const limit   = Math.min(parseInt(url.searchParams.get("limit") ?? "50"), 200);
  const status  = url.searchParams.get("status"); // filter by quote status
  const search  = url.searchParams.get("search")?.toLowerCase() ?? "";

  // ── Thread: GET ?quote_id=XXX → all messages ──────────────
  if (quoteId) {
    const { data: messages, error } = await admin
      .from("quote_messages")
      .select("id, quote_id, sender_name, sender_role, content, message_type, created_at, read_by, attachment_url, attachment_name")
      .eq("quote_id", quoteId)
      .order("created_at", { ascending: true });

    if (error) return json({ error: error.message }, 500);
    return json({ data: messages ?? [] });
  }

  // ── Conversation list: GET → all quotes with last message + unread ──
  let q = admin
    .from("quote_requests")
    .select(`
      id, quote_number, customer_name, customer_company,
      customer_email, customer_phone, grand_total,
      status, created_at, sla_po_review_due, crm_lead_id,
      customer_address, customer_tax_id, notes
    `)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (status) q = q.eq("status", status);

  const { data: quotes, error: qErr } = await q;
  if (qErr) return json({ error: qErr.message }, 500);

  // For each quote, get last message + unread count
  const quoteIds = (quotes ?? []).map((r: any) => r.id);
  let lastMsgMap: Record<string, any>   = {};
  let unreadMap:  Record<string, number> = {};

  if (quoteIds.length) {
    // Last message per quote
    const { data: lastMsgs } = await admin
      .from("quote_messages")
      .select("quote_id, sender_name, sender_role, content, created_at, read_by")
      .in("quote_id", quoteIds)
      .order("created_at", { ascending: false });

    for (const m of (lastMsgs ?? []) as any[]) {
      // first occurrence per quote_id = latest message
      if (!lastMsgMap[m.quote_id]) lastMsgMap[m.quote_id] = m;
      // count unread customer messages
      if (m.sender_role === "customer" && !m.read_by) {
        unreadMap[m.quote_id] = (unreadMap[m.quote_id] ?? 0) + 1;
      }
    }
  }

  // Compose result
  let result = (quotes ?? []).map((r: any) => ({
    ...r,
    last_message:   lastMsgMap[r.id] ?? null,
    unread_count:   unreadMap[r.id]  ?? 0,
    has_messages:   !!lastMsgMap[r.id],
  }));

  // Client-side search filter (search in name/company/quote_number)
  if (search) {
    result = result.filter((r: any) =>
      r.quote_number?.toLowerCase().includes(search) ||
      r.customer_company?.toLowerCase().includes(search) ||
      r.customer_name?.toLowerCase().includes(search) ||
      lastMsgMap[r.id]?.content?.toLowerCase().includes(search)
    );
  }

  // Sort: unread first → then by last message time → then by created_at
  result.sort((a: any, b: any) => {
    if (b.unread_count !== a.unread_count) return b.unread_count - a.unread_count;
    const at = a.last_message?.created_at ?? a.created_at;
    const bt = b.last_message?.created_at ?? b.created_at;
    return bt.localeCompare(at);
  });

  return json({ data: result, total: result.length });
});
