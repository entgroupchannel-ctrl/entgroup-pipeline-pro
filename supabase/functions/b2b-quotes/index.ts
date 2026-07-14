/**
 * b2b-quotes — Edge Function
 * Deploy to the B2B Supabase project (ugzdwmyylqmirrljtuej)
 *
 * GET  /b2b-quotes?limit=50                 → unmatched quote_requests
 * GET  /b2b-quotes?b2b_ids=id1,id2          → quote_requests by id
 * GET  /b2b-quotes?b2b_ids=id1&detail=1     → quote_requests with full details
 * POST /b2b-quotes                          → claim quote_request with crm_lead_id
 *
 * Auth: x-crm-secret header must match CRM_SECRET.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CRM_SECRET = Deno.env.get("CRM_SECRET") ?? "entgroup-crm-secret-2026";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-crm-secret",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

function getAdminClient() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }

  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function toNumber(value: unknown, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeQuote(row: any) {
  const items = Array.isArray(row.quote_items) ? row.quote_items : [];
  const products = Array.isArray(row.products) ? row.products : null;

  return {
    id: row.id,
    quote_number: row.quote_number ?? row.request_number ?? row.id,
    customer_name: row.customer_name ?? row.contact_name ?? "",
    customer_company: row.customer_company ?? row.company_name ?? row.account_name ?? "",
    customer_email: row.customer_email ?? row.email ?? null,
    customer_phone: row.customer_phone ?? row.phone ?? null,
    customer_address: row.customer_address ?? row.address ?? null,
    customer_tax_id: row.customer_tax_id ?? row.tax_id ?? null,
    customer_line: row.customer_line ?? row.line_id ?? null,
    grand_total: toNumber(row.grand_total ?? row.total_amount ?? row.total),
    subtotal: row.subtotal ?? null,
    discount_percent: row.discount_percent ?? null,
    discount_amount: row.discount_amount ?? null,
    vat_percent: row.vat_percent ?? null,
    vat_amount: row.vat_amount ?? null,
    payment_terms: row.payment_terms ?? null,
    delivery_terms: row.delivery_terms ?? null,
    warranty_terms: row.warranty_terms ?? null,
    valid_until: row.valid_until ?? null,
    notes: row.notes ?? row.remark ?? null,
    products,
    status: row.status ?? "pending",
    created_at: row.created_at,
    sla_po_review_due: row.sla_po_review_due ?? null,
    crm_lead_id: row.crm_lead_id ?? null,
    items: items.map((item: any) => ({
      id: item.id ?? crypto.randomUUID(),
      product_name: item.product_name ?? item.name ?? item.model ?? item.sku ?? "สินค้า",
      quantity: toNumber(item.quantity, 1),
      unit_price: toNumber(item.unit_price ?? item.price),
      total_price: toNumber(item.total_price ?? item.total ?? (toNumber(item.quantity, 1) * toNumber(item.unit_price ?? item.price))),
      description: item.description ?? null,
    })),
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  try {
    const secret = req.headers.get("x-crm-secret");
    if (secret !== CRM_SECRET) {
      return json({ error: "Unauthorized" }, 403);
    }

    const admin = getAdminClient();
    const url = new URL(req.url);

    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      const quoteRequestId = body.quote_request_id ?? body.id;
      const crmLeadId = body.crm_lead_id;

      if (!quoteRequestId || !crmLeadId) {
        return json({ error: "quote_request_id and crm_lead_id are required" }, 400);
      }

      const { data: current, error: currentError } = await admin
        .from("quote_requests")
        .select("id, crm_lead_id")
        .eq("id", quoteRequestId)
        .maybeSingle();

      if (currentError) return json({ error: currentError.message }, 500);
      if (!current) return json({ error: "Quote request not found" }, 404);
      if (current.crm_lead_id && current.crm_lead_id !== crmLeadId) {
        return json({ error: "Quote request has already been claimed", conflict: true }, 409);
      }

      const { data, error } = await admin
        .from("quote_requests")
        .update({ crm_lead_id: crmLeadId })
        .eq("id", quoteRequestId)
        .select("id, crm_lead_id")
        .single();

      if (error) return json({ error: error.message }, 500);
      return json({ ok: true, data });
    }

    if (req.method !== "GET") {
      return json({ error: "Method not allowed" }, 405);
    }

    const limit = Math.min(Math.max(toNumber(url.searchParams.get("limit"), 50), 1), 200);
    const b2bIds = (url.searchParams.get("b2b_ids") ?? "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);
    const detail = url.searchParams.get("detail") === "1";

    let query = admin
      .from("quote_requests")
      .select(`
        id, quote_number, customer_name, customer_company,
        customer_email, customer_phone, customer_address, customer_tax_id, customer_line,
        grand_total, subtotal, discount_percent, discount_amount, vat_percent, vat_amount,
        payment_terms, delivery_terms, warranty_terms, valid_until, notes, products,
        status, created_at, sla_po_review_due, crm_lead_id,
        quote_items:quote_items(id, product_name, quantity, unit_price, total_price, description)
      `)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (b2bIds.length > 0) {
      query = query.in("id", b2bIds);
    } else if (!detail) {
      query = query.is("crm_lead_id", null);
    }

    const { data, error } = await query;
    if (error) return json({ error: error.message }, 500);

    return json({ data: (data ?? []).map(normalizeQuote), total: data?.length ?? 0 });
  } catch (error) {
    console.error("b2b-quotes error", error);
    return json({ error: error instanceof Error ? error.message : "Unexpected error" }, 500);
  }
});