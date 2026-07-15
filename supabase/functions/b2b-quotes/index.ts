/**
 * b2b-quotes — Edge Function (deploy ที่ B2B Supabase project ugzdwmyylqmirrljtuej)
 *
 * แก้ไข v2: CORS ถูกต้อง OPTIONS ตอบ 200 ทันที ทุก response มี CORS headers
 * Authorization: x-crm-secret: entgroup-crm-secret-2026
 *
 * GET  ?limit=N                  → quote_requests ที่ยังไม่ match lead (crm_lead_id IS NULL)
 * GET  ?b2b_ids=id1,id2          → quote_requests ตาม id
 * GET  ?b2b_ids=id&detail=1      → พร้อม address, tax_id, products, terms
 * POST { quote_request_id, crm_lead_id }  → claim (set crm_lead_id)
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ─── CORS — must be first, must cover every response path ─────────────────────
const CORS_HEADERS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": [
    "authorization",
    "x-client-info",
    "apikey",
    "content-type",
    "x-crm-secret",
  ].join(", "),
};

function ok(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

function err(msg: string, status = 400): Response {
  return new Response(JSON.stringify({ error: msg }), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

// ─── Secret ───────────────────────────────────────────────────────────────────
const CRM_SECRET          = Deno.env.get("CRM_SECRET") ?? "entgroup-crm-secret-2026";
const SUPABASE_URL         = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// ─── Main ─────────────────────────────────────────────────────────────────────
Deno.serve(async (req: Request): Promise<Response> => {

  // 1. Preflight — must return 200 immediately, no auth check
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: CORS_HEADERS });
  }

  // 2. Auth
  const secret = req.headers.get("x-crm-secret");
  if (secret !== CRM_SECRET) return err("Unauthorized", 403);

  // 3. Supabase admin client
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false },
  });

  const url = new URL(req.url);

  // ── POST: claim quote_request ──────────────────────────────────────────────
  if (req.method === "POST") {
    let body: Record<string, string>;
    try {
      body = await req.json();
    } catch {
      return err("Invalid JSON body");
    }

    const { quote_request_id, crm_lead_id } = body;
    if (!quote_request_id || !crm_lead_id) {
      return err("quote_request_id and crm_lead_id required");
    }

    // Race-condition safe: only update if crm_lead_id is still null
    const { data, error } = await admin
      .from("quote_requests")
      .update({ crm_lead_id })
      .eq("id", quote_request_id)
      .is("crm_lead_id", null)
      .select("id, crm_lead_id")
      .maybeSingle();

    if (error) return err(error.message, 500);
    if (!data) {
      // Already claimed by someone else
      return err("Already claimed", 409);
    }
    return ok({ ok: true, data });
  }

  // ── GET ───────────────────────────────────────────────────────────────────
  if (req.method !== "GET") return err("Method not allowed", 405);

  const limit   = Math.min(parseInt(url.searchParams.get("limit") ?? "50"), 200);
  const b2bIds  = url.searchParams.get("b2b_ids");
  const detail  = url.searchParams.get("detail") === "1";

  // Base select
  const BASE_COLS = `
    id, quote_number, customer_name, customer_company,
    customer_email, customer_phone, grand_total,
    status, created_at, sla_po_review_due, crm_lead_id,
    products
  `.trim();

  const DETAIL_COLS = `
    ${BASE_COLS},
    customer_address, customer_tax_id,
    payment_terms, delivery_terms, warranty_terms,
    valid_until, notes, discount_percent, discount_amount,
    vat_percent, vat_amount, subtotal, products
  `.trim();

  // ── By IDs ─────────────────────────────────────────────────────────────────
  if (b2bIds) {
    const ids = b2bIds.split(",").map(s => s.trim()).filter(Boolean);
    if (!ids.length) return ok({ data: [] });

    const { data: quotes, error: qErr } = await admin
      .from("quote_requests")
      .select(detail ? DETAIL_COLS : BASE_COLS)
      .in("id", ids);

    if (qErr) return err(qErr.message, 500);

    // Enrich with items if detail=1
    let enriched: any[] = quotes ?? [];
    if (detail && enriched.length) {
      const { data: items } = await admin
        .from("quote_items")
        .select("id, quote_request_id, product_name, quantity, unit_price, total_price, description")
        .in("quote_request_id", ids);

      const itemMap: Record<string, any[]> = {};
      for (const item of (items ?? []) as any[]) {
        if (!itemMap[item.quote_request_id]) itemMap[item.quote_request_id] = [];
        itemMap[item.quote_request_id].push(item);
      }
      enriched = enriched.map((q: any) => ({ ...q, items: itemMap[q.id] ?? [] }));
    }

    return ok({ data: enriched });
  }

  // ── Unmatched list (crm_lead_id IS NULL) ──────────────────────────────────
  const { data: quotes, error: qErr } = await admin
    .from("quote_requests")
    .select(BASE_COLS)
    .is("crm_lead_id", null)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (qErr) return err(qErr.message, 500);

  // Enrich with items for all quotes
  const quoteIds = (quotes ?? []).map((q: any) => q.id);
  let enriched: any[] = quotes ?? [];

  if (quoteIds.length) {
    const { data: items } = await admin
      .from("quote_items")
      .select("id, quote_request_id, product_name, quantity, unit_price, total_price, description")
      .in("quote_request_id", quoteIds);

    const itemMap: Record<string, any[]> = {};
    for (const item of (items ?? []) as any[]) {
      if (!itemMap[item.quote_request_id]) itemMap[item.quote_request_id] = [];
      itemMap[item.quote_request_id].push(item);
    }
    enriched = enriched.map((q: any) => ({ ...q, items: itemMap[q.id] ?? [] }));
  }

  return ok({ data: enriched });
});
