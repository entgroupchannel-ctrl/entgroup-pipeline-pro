// Server-only FlowAccount API helpers for CRM.
// Never import from route/component files — only from *.functions.ts handlers.

type CachedToken = { token: string; expiresAt: number };
let _cached: CachedToken | null = null;

// ── Load credentials from crm.integrations (admin-only table) ────────────────
async function loadCredentials(): Promise<{
  clientId: string;
  clientSecret: string;
  baseUrl: string;
  tokenUrl: string;
}> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data, error } = await (supabaseAdmin as any)
    .schema("crm")
    .from("integrations")
    .select("client_id, client_secret, base_url, token_url, is_active")
    .eq("id", "flowaccount")
    .maybeSingle();

  if (error) throw new Error(`Cannot load FA credentials: ${error.message}`);
  if (!data) throw new Error("FlowAccount integration not configured");
  if (!data.is_active) throw new Error("FlowAccount integration is disabled — เปิดใช้งานใน Settings ก่อน");

  const clientId = (data.client_id ?? "").trim();
  const clientSecret = (data.client_secret ?? "").trim();
  if (!clientId || !clientSecret) {
    throw new Error("FlowAccount Client ID / Secret ยังไม่ได้กรอก — ไปที่ Settings → FlowAccount");
  }

  const baseUrl = (data.base_url ?? "https://openapi.flowaccount.com/v1").replace(/\/$/, "");
  const tokenUrl = data.token_url ?? "https://openapi.flowaccount.com/token";
  return { clientId, clientSecret, baseUrl, tokenUrl };
}

// ── OAuth2 client_credentials token (cached, auto-refresh) ───────────────────
export async function getFlowaccountToken(force = false): Promise<string> {
  const now = Date.now();
  if (!force && _cached && _cached.expiresAt - 60_000 > now) return _cached.token;

  const { clientId, clientSecret, tokenUrl } = await loadCredentials();

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
    scope: "flowaccount-api",
  });

  const resp = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const text = await resp.text();
  if (!resp.ok) throw new Error(`FlowAccount token error ${resp.status}: ${text.slice(0, 300)}`);

  let json: any;
  try { json = JSON.parse(text); } catch {
    throw new Error(`FlowAccount token: invalid JSON: ${text.slice(0, 300)}`);
  }

  const token = json.access_token as string | undefined;
  const expiresIn = Number(json.expires_in ?? 86400);
  if (!token) throw new Error(`FlowAccount token missing access_token: ${text.slice(0, 300)}`);

  _cached = { token, expiresAt: now + expiresIn * 1000 };
  return token;
}

// ── Generic authenticated fetch ───────────────────────────────────────────────
export async function faFetch(
  path: string,
  init: RequestInit = {},
): Promise<{ status: number; body: any; text: string }> {
  const { baseUrl } = await loadCredentials();
  const token = await getFlowaccountToken();
  const url = path.startsWith("http") ? path : `${baseUrl}${path.startsWith("/") ? "" : "/"}${path}`;

  const headers = new Headers(init.headers || {});
  headers.set("Authorization", `Bearer ${token}`);
  headers.set("Accept", "application/json");
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");

  const resp = await fetch(url, { ...init, headers });
  const text = await resp.text();
  let body: any = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = { raw: text }; }
  return { status: resp.status, body, text };
}

// ── Helper: extract array from various FA response shapes ─────────────────────
export function pickArray(body: any): any[] {
  if (Array.isArray(body)) return body;
  if (Array.isArray(body?.data?.list)) return body.data.list;
  if (Array.isArray(body?.data)) return body.data;
  if (Array.isArray(body?.items)) return body.items;
  if (Array.isArray(body?.list)) return body.list;
  if (Array.isArray(body?.result)) return body.result;
  return [];
}

export function pickSerial(doc: any): string | null {
  return doc?.documentSerial ?? doc?.document_serial ?? doc?.number ?? doc?.recordId?.toString() ?? null;
}

export function pickNumber(v: any): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function extractSalesEmail(salesName: string): string {
  if (!salesName) return "";
  const match = salesName.match(/[\w.+-]+@[\w.-]+\.\w+/);
  return match ? match[0].toLowerCase() : "";
}

export function extractSalesName(salesName: string): string {
  if (!salesName) return "";
  const beforeParen = salesName.match(/^([^(]+)\s*\(/);
  if (beforeParen) return beforeParen[1].trim();
  if (/^[\w.+-]+@/.test(salesName.trim())) return salesName.split("@")[0].trim();
  const match = salesName.match(/^([^\d(]+)/);
  return match ? match[1].trim() : salesName.trim();
}
