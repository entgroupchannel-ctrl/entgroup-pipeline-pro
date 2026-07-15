/**
 * b2b-live-chat — Edge Function (deploy ที่ B2B Supabase project ugzdwmyylqmirrljtuej)
 *
 * ── B2B Quote Chat ──────────────────────────────────────────────
 * GET  ?action=b2b                        → list quote_requests + last_message + unread
 * GET  ?action=b2b&quote_id=XXX           → messages ของ quote นั้น
 * POST body:{action:"b2b", ...}           → send reply / mark_read
 *
 * ── Web Chat (chat_sessions user_id IS NULL) ────────────────────
 * GET  ?action=web                        → list sessions + last_message + unread
 * GET  ?action=web&session_id=XXX         → messages ของ session นั้น
 * POST body:{action:"web_send", ...}      → send reply
 * POST body:{action:"web_read", ...}      → mark read
 *
 * ── General Chat (chat_sessions user_id IS NOT NULL) ───────────
 * GET  ?action=general                    → list sessions + last_message + unread
 * GET  ?action=general&session_id=XXX     → messages ของ session นั้น
 * POST body:{action:"general_send", ...}  → send reply
 * POST body:{action:"general_read", ...}  → mark read
 *
 * Authorization: x-crm-secret: entgroup-crm-secret-2026
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CRM_SECRET           = Deno.env.get("CRM_SECRET") ?? "entgroup-crm-secret-2026";
const SUPABASE_URL          = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-crm-secret",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  if (req.headers.get("x-crm-secret") !== CRM_SECRET)
    return json({ error: "Unauthorized" }, 403);

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const url   = new URL(req.url);
  const action = url.searchParams.get("action") ?? "b2b"; // default b2b compat

  // ══════════════════════════════════════════════════════════════
  // POST
  // ══════════════════════════════════════════════════════════════
  if (req.method === "POST") {
    const body = await req.json().catch(() => ({}));
    const postAction = body.action ?? "b2b";

    // ── B2B: mark read ──────────────────────────────────────────
    if (postAction === "b2b" && body.mark_read && body.quote_id) {
      const readBy = { [body.staff_id ?? "staff"]: new Date().toISOString() };
      await admin.from("quote_messages")
        .update({ read_by: readBy })
        .eq("quote_id", body.quote_id)
        .eq("sender_role", "customer");
      return json({ ok: true });
    }

    // ── B2B: send message ───────────────────────────────────────
    if (postAction === "b2b") {
      if (!body.quote_id || !body.content) return json({ error: "quote_id and content required" }, 400);
      const { data, error } = await admin.from("quote_messages").insert({
        quote_id:        body.quote_id,
        sender_name:     body.sender_name ?? "ENT Sales",
        sender_role:     "staff",
        content:         body.content,
        message_type:    body.attachment_url ? "file" : (body.message_type ?? "text"),
        ...(body.attachment_url ? {
          attachment_url:  body.attachment_url,
          attachment_name: body.attachment_name ?? null,
        } : {}),
      }).select().single();
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true, data });
    }

    // ── Web/General: mark read ──────────────────────────────────
    if (postAction === "web_read" || postAction === "general_read") {
      if (!body.session_id) return json({ error: "session_id required" }, 400);
      await admin.from("chat_messages")
        .update({ read_at: new Date().toISOString() })
        .eq("session_id", body.session_id)
        .eq("sender_type", "guest")
        .is("read_at", null);
      return json({ ok: true });
    }

    // ── Web/General: send message ───────────────────────────────
    if (postAction === "web_send" || postAction === "general_send") {
      if (!body.session_id || !body.content) return json({ error: "session_id and content required" }, 400);
      const { data, error } = await admin.from("chat_messages").insert({
        session_id:      body.session_id,
        content:         body.content,
        sender_name:     body.sender_name ?? "ENT Support",
        sender_type:     "staff",
        message_type:    body.attachment_url ? "file" : "text",
        ...(body.attachment_url ? {
          attachment_url:  body.attachment_url,
          attachment_name: body.attachment_name ?? null,
        } : {}),
      }).select().single();
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true, data });
    }

    return json({ error: "Unknown action" }, 400);
  }

  // ══════════════════════════════════════════════════════════════
  // GET
  // ══════════════════════════════════════════════════════════════
  const limit  = Math.min(parseInt(url.searchParams.get("limit") ?? "60"), 200);
  const search = (url.searchParams.get("search") ?? "").toLowerCase();

  // ── B2B Quote Chat ──────────────────────────────────────────────
  if (action === "b2b") {
    const quoteId = url.searchParams.get("quote_id");

    // Thread: all messages
    if (quoteId) {
      const { data, error } = await admin.from("quote_messages")
        .select("id, quote_id, sender_name, sender_role, content, message_type, created_at, read_by, attachment_url, attachment_name")
        .eq("quote_id", quoteId)
        .order("created_at", { ascending: true });
      if (error) return json({ error: error.message }, 500);
      return json({ data: data ?? [] });
    }

    // List: all quotes + last message + unread
    const includeClaimed = url.searchParams.get("include_claimed") === "1";
    let q = admin.from("quote_requests")
      .select("id,quote_number,customer_name,customer_company,customer_email,customer_phone,grand_total,status,created_at,sla_po_review_due,crm_lead_id,customer_address,customer_tax_id,notes")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (!includeClaimed) q = q.is("crm_lead_id", null);

    const { data: quotes, error: qErr } = await q;
    if (qErr) return json({ error: qErr.message }, 500);

    const quoteIds = (quotes ?? []).map((r: any) => r.id);
    let lastMsgMap: Record<string, any>    = {};
    let unreadMap:  Record<string, number> = {};

    if (quoteIds.length) {
      const { data: msgs } = await admin.from("quote_messages")
        .select("quote_id, sender_name, sender_role, content, created_at, read_by")
        .in("quote_id", quoteIds)
        .order("created_at", { ascending: false });
      for (const m of (msgs ?? []) as any[]) {
        if (!lastMsgMap[m.quote_id]) lastMsgMap[m.quote_id] = m;
        if (m.sender_role === "customer" && !m.read_by)
          unreadMap[m.quote_id] = (unreadMap[m.quote_id] ?? 0) + 1;
      }
    }

    let result = (quotes ?? []).map((r: any) => ({
      ...r,
      last_message: lastMsgMap[r.id] ?? null,
      unread_count: unreadMap[r.id]  ?? 0,
      has_messages: !!lastMsgMap[r.id],
    }));

    if (search) result = result.filter((r: any) =>
      r.quote_number?.toLowerCase().includes(search) ||
      r.customer_company?.toLowerCase().includes(search) ||
      r.customer_name?.toLowerCase().includes(search) ||
      lastMsgMap[r.id]?.content?.toLowerCase().includes(search)
    );

    result.sort((a: any, b: any) => {
      if (b.unread_count !== a.unread_count) return b.unread_count - a.unread_count;
      const at = a.last_message?.created_at ?? a.created_at;
      const bt = b.last_message?.created_at ?? b.created_at;
      return bt.localeCompare(at);
    });

    return json({ data: result, total: result.length });
  }

  // ── Web Chat / General Chat ────────────────────────────────────
  if (action === "web" || action === "general") {
    const sessionId = url.searchParams.get("session_id");
    const isGuest   = action === "web"; // web = guest (user_id IS NULL), general = member

    // Thread: all messages for session
    if (sessionId) {
      const { data, error } = await admin.from("chat_messages")
        .select("id, session_id, content, sender_name, sender_type, message_type, created_at, read_at, attachment_url, attachment_name")
        .eq("session_id", sessionId)
        .order("created_at", { ascending: true });
      if (error) return json({ error: error.message }, 500);
      return json({ data: data ?? [] });
    }

    // List: all sessions + last message + unread
    let sq = admin.from("chat_sessions")
      .select("id, guest_name, guest_email, guest_phone, user_id, source, status, last_message_at, created_at, assigned_to, metadata")
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .limit(limit);

    if (isGuest) sq = sq.is("user_id", null);
    else         sq = sq.not("user_id", "is", null);

    const { data: sessions, error: sErr } = await sq;
    if (sErr) return json({ error: sErr.message }, 500);

    const sessionIds = (sessions ?? []).map((s: any) => s.id);
    let sLastMsgMap: Record<string, any>    = {};
    let sUnreadMap:  Record<string, number> = {};

    if (sessionIds.length) {
      const { data: msgs } = await admin.from("chat_messages")
        .select("session_id, content, sender_type, sender_name, created_at, read_at")
        .in("session_id", sessionIds)
        .order("created_at", { ascending: false });
      for (const m of (msgs ?? []) as any[]) {
        if (!sLastMsgMap[m.session_id]) sLastMsgMap[m.session_id] = m;
        if (m.sender_type === "guest" && !m.read_at)
          sUnreadMap[m.session_id] = (sUnreadMap[m.session_id] ?? 0) + 1;
      }
    }

    let result = (sessions ?? []).map((s: any) => ({
      ...s,
      last_message: sLastMsgMap[s.id] ?? null,
      unread_count: sUnreadMap[s.id]  ?? 0,
    }));

    if (search) result = result.filter((s: any) =>
      s.guest_name?.toLowerCase().includes(search) ||
      s.guest_email?.toLowerCase().includes(search) ||
      sLastMsgMap[s.id]?.content?.toLowerCase().includes(search)
    );

    result.sort((a: any, b: any) => {
      if (b.unread_count !== a.unread_count) return b.unread_count - a.unread_count;
      const at = a.last_message?.created_at ?? a.created_at;
      const bt = b.last_message?.created_at ?? b.created_at;
      return bt.localeCompare(at);
    });

    return json({ data: result, total: result.length });
  }

  return json({ error: `Unknown action: ${action}` }, 400);
});
