/**
 * B2B Platform client
 * ดึงข้อมูล quote_requests จาก B2B Supabase project
 * ผ่าน Edge Function เพื่อ bypass RLS
 */

const B2B_EDGE_URL = "https://ugzdwmyylqmirrljtuej.supabase.co/functions/v1/b2b-quotes";
const B2B_SECRET = "entgroup-crm-secret-2026";

export interface B2BProductItem {
  model?: string;
  name?: string;
  sku?: string;
  description?: string;
  quantity?: number;
  unit_price?: number;
  price?: number;
  total?: number;
  [k: string]: any;
}

export interface B2BQuoteItem {
  id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  description?: string;
}

export interface B2BQuoteRequest {
  id: string;
  quote_number: string;
  customer_name: string;
  customer_company: string;
  customer_email?: string;
  customer_phone?: string;
  customer_address?: string | null;
  customer_tax_id?: string | null;
  customer_line?: string | null;
  grand_total: number;
  subtotal?: number | null;
  discount_percent?: number | null;
  discount_amount?: number | null;
  vat_percent?: number | null;
  vat_amount?: number | null;
  payment_terms?: string | null;
  delivery_terms?: string | null;
  warranty_terms?: string | null;
  valid_until?: string | null;
  notes?: string | null;
  products?: B2BProductItem[] | null;
  status: "pending" | "quote_sent" | "po_uploaded" | "completed";
  created_at: string;
  sla_po_review_due?: string;
  items?: B2BQuoteItem[];
}

const STATUS_LABEL: Record<string, string> = {
  pending:     "รอดำเนินการ",
  quote_sent:  "ส่งใบเสนอราคาแล้ว",
  po_uploaded: "อัปโหลด PO แล้ว",
  completed:   "เสร็จสิ้น",
};

const STATUS_COLOR: Record<string, string> = {
  pending:     "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
  quote_sent:  "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300",
  po_uploaded: "bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300",
  completed:   "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
};

export { STATUS_LABEL, STATUS_COLOR };

async function b2bFetch(params: Record<string, string>): Promise<B2BQuoteRequest[]> {
  const url = new URL(B2B_EDGE_URL);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const resp = await fetch(url.toString(), {
    headers: { "x-crm-secret": B2B_SECRET },
  });
  if (!resp.ok) throw new Error(`B2B API error: ${resp.status}`);
  const { data, error } = await resp.json();
  if (error) throw new Error(error);
  return data ?? [];
}

/** ดึง quote_requests ที่ยังไม่ได้ match กับ lead ใดเลย */
export async function fetchUnmatchedQuotes(limit = 50): Promise<B2BQuoteRequest[]> {
  return b2bFetch({ limit: String(limit) });
}

/** ดึงรายละเอียดเต็ม (address, tax_id, products, terms) — ต้อง edge function รองรับ ?detail=1 */
export async function fetchQuoteDetail(id: string): Promise<B2BQuoteRequest | null> {
  const res = await b2bFetch({ b2b_ids: id, detail: "1" });
  return res[0] ?? null;
}

/** ดึง quote_requests ตาม b2b_request_id หลายๆ id */
export async function fetchQuotesByIds(ids: string[]): Promise<B2BQuoteRequest[]> {
  if (!ids.length) return [];
  return b2bFetch({ b2b_ids: ids.join(",") });
}

/** ดึง quote_request เดียวตาม id */
export async function fetchQuoteById(id: string): Promise<B2BQuoteRequest | null> {
  const results = await fetchQuotesByIds([id]);
  return results[0] ?? null;
}

/** Claim quote_request → set crm_lead_id ใน B2B (ป้องกัน race condition) */
export interface ClaimResult {
  ok: boolean;
  status: number;
  conflict?: boolean;
  error?: string;
}

export async function claimQuoteRequest(quoteRequestId: string, crmLeadId: string): Promise<ClaimResult> {
  try {
    const resp = await fetch(B2B_EDGE_URL, {
      method: "POST",
      headers: {
        "x-crm-secret": B2B_SECRET,
        "content-type": "application/json",
      },
      body: JSON.stringify({ quote_request_id: quoteRequestId, crm_lead_id: crmLeadId }),
    });
    if (resp.ok) return { ok: true, status: resp.status };
    const body = await resp.json().catch(() => ({} as any));
    return {
      ok: false,
      status: resp.status,
      conflict: resp.status === 409,
      error: body?.error ?? `HTTP ${resp.status}`,
    };
  } catch (e: any) {
    return { ok: false, status: 0, error: e?.message ?? "network error" };
  }
}
