// ⚠️ DO NOT auto-trigger any side effects
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ── helpers ───────────────────────────────────────────────────────────────────

async function assertAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase
    .schema("crm")
    .from("user_profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw new Error(`ตรวจสิทธิ์ไม่สำเร็จ: ${error.message}`);
  if ((data as any)?.role !== "admin") throw new Error("Forbidden: admin only");
}

async function getIntegration(supabaseAdmin: any) {
  // Try schema chaining first (Supabase JS v2 style)
  const res = await supabaseAdmin
    .schema("crm")
    .from("integrations")
    .select("*")
    .eq("id", "flowaccount")
    .maybeSingle();
  return res;
}

// ── Test connection ────────────────────────────────────────────────────────────

export const testFAConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { faFetch } = await import("./flowaccount.server");
    const { status, body, text } = await faFetch("/quotations?currentPage=1&pageSize=1");
    if (status < 200 || status >= 300) {
      throw new Error(`HTTP ${status}: ${(text ?? JSON.stringify(body)).slice(0, 300)}`);
    }
    return { ok: true, status };
  });

// ── Save credentials ──────────────────────────────────────────────────────────

export const saveFACredentials = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      client_id:     z.string().trim().min(1, "Client ID ต้องไม่ว่าง"),
      // "KEEP_EXISTING" = don't overwrite; anything else = new secret
      client_secret: z.string().trim().min(1, "Client Secret ต้องไม่ว่าง"),
      base_url:      z.string().trim().optional(),
      token_url:     z.string().trim().optional(),
      is_active:     z.boolean(),
    }).parse(input)
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Build update payload — only overwrite secret if not sentinel
    const payload: Record<string, any> = {
      id:          "flowaccount",
      client_id:   data.client_id,
      base_url:    data.base_url  || "https://openapi.flowaccount.com/v1",
      token_url:   data.token_url || "https://openapi.flowaccount.com/token",
      is_active:   data.is_active,
      updated_by:  context.userId,
      updated_at:  new Date().toISOString(),
    };

    if (data.client_secret !== "KEEP_EXISTING") {
      payload.client_secret = data.client_secret;
    }

    const { error } = await (supabaseAdmin as any)
      .schema("crm")
      .from("integrations")
      .upsert(payload, { onConflict: "id" });

    if (error) throw new Error(`บันทึกไม่สำเร็จ: ${error.message}`);
    return { ok: true };
  });

// ── Load credentials (masked) for settings UI ─────────────────────────────────

export const loadFASettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data, error } = await (supabaseAdmin as any)
      .schema("crm")
      .from("integrations")
      .select("client_id, client_secret, base_url, token_url, is_active, last_synced_at, sync_error")
      .eq("id", "flowaccount")
      .maybeSingle();

    const blank = {
      client_id: "", client_secret_masked: "", base_url: "",
      token_url: "", is_active: false, last_synced_at: null, sync_error: null,
    };

    // Graceful fallback: treat any load error as "not configured yet"
    if (error) {
      console.warn("[loadFASettings] load error, returning blank:", error.message);
      return blank;
    }
    if (!data) return blank;

    const cfg = data as any;
    // If FlowAccount credentials aren't set yet, return blank instead of throwing
    if (!cfg.client_id || !cfg.client_secret) {
      return blank;
    }

    const secret: string = cfg.client_secret ?? "";
    const masked = secret.length > 4
      ? "••••••••" + secret.slice(-4)
      : secret ? "••••" : "";

    return {
      client_id:          cfg.client_id ?? "",
      client_secret_masked: masked,
      base_url:           cfg.base_url ?? "https://openapi.flowaccount.com/v1",
      token_url:          cfg.token_url ?? "https://openapi.flowaccount.com/token",
      is_active:          cfg.is_active ?? false,
      last_synced_at:     cfg.last_synced_at ?? null,
      sync_error:         cfg.sync_error ?? null,
    };
  });

// ── Sync documents from FA API → crm.fa_documents ────────────────────────────

export const syncFADocuments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { faFetch, pickArray, pickSerial, pickNumber, extractSalesName, extractSalesEmail } =
      await import("./flowaccount.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const results: {
      type: string; fetched: number; upserted: number; skipped: number; error?: string;
    }[] = [];

    for (const [type, path] of [
      ["quotation",    "/quotations?currentPage=1&pageSize=200"],
      ["billing_note", "/billing-notes?currentPage=1&pageSize=200"],
    ] as const) {
      try {
        const { status, body, text } = await faFetch(path);
        if (status < 200 || status >= 300) {
          results.push({ type, fetched: 0, upserted: 0, skipped: 0, error: `HTTP ${status}: ${text.slice(0, 200)}` });
          continue;
        }

        const list = pickArray(body);
        let upserted = 0;
        let skipped = 0;

        for (const doc of list) {
          const serial = pickSerial(doc);
          if (!serial) { skipped++; continue; }

          const row = {
            document_serial: String(serial),
            document_type:   type,
            contact_name:    doc?.contactName ?? doc?.contact_name ?? null,
            contact_id:      pickNumber(doc?.contactId ?? doc?.contact_id),
            grand_total:     pickNumber(doc?.grandTotal ?? doc?.grand_total),
            published_on:    doc?.publishedOn ?? doc?.published_on ?? null,
            status_string:   doc?.statusString ?? doc?.status ?? null,
            sales_name:      extractSalesName(doc?.salesName ?? ""),
            sales_email:     extractSalesEmail(doc?.salesName ?? ""),
            raw_data:        doc,
            synced_at:       new Date().toISOString(),
          };

          const { error } = await (supabaseAdmin as any)
            .schema("crm")
            .from("fa_documents")
            .upsert(row, { onConflict: "document_serial", ignoreDuplicates: false });

          if (error) {
            console.error("[FA sync] upsert error", serial, error.message);
            skipped++;
          } else {
            upserted++;
          }
        }

        results.push({ type, fetched: list.length, upserted, skipped });
      } catch (e: any) {
        results.push({ type, fetched: 0, upserted: 0, skipped: 0, error: e.message });
      }
    }

    // Update sync metadata
    const hasError = results.some((r) => r.error);
    await (supabaseAdmin as any)
      .schema("crm")
      .from("integrations")
      .update({
        last_synced_at: new Date().toISOString(),
        sync_error: hasError
          ? results.filter((r) => r.error).map((r) => `${r.type}: ${r.error}`).join("; ")
          : null,
      })
      .eq("id", "flowaccount");

    return { results };
  });

// ── Create a quotation DRAFT in FlowAccount (used by "สร้าง QT" flow) ─────────

const CustomerSchema = z.object({
  company: z.string().trim().min(1, "ต้องระบุชื่อบริษัท"),
  contact_name: z.string().trim().optional().default(""),
  email: z.string().trim().optional().default(""),
  phone: z.string().trim().optional().default(""),
  address: z.string().trim().optional().default(""),
  tax_id: z.string().trim().optional().default(""),
});

const ItemSchema = z.object({
  name: z.string().trim().min(1),
  description: z.string().trim().optional().default(""),
  quantity: z.number().positive().default(1),
  unit_price: z.number().min(0).default(0),
});

export const createFAQuotationDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      customer: CustomerSchema,
      items: z.array(ItemSchema).min(1, "ต้องมีรายการอย่างน้อย 1 รายการ"),
      issued_date: z.string().min(1),          // YYYY-MM-DD
      valid_until: z.string().min(1),          // YYYY-MM-DD
      note: z.string().optional().default(""),
      vat_rate: z.number().min(0).max(20).default(7),
      lead_id: z.string().uuid().optional(),
      b2b_request_id: z.string().optional(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { faFetch, pickSerial } = await import("./flowaccount.server");

    // ── 1. Match / create FA contact ────────────────────────────────────────
    let contactId: number | null = null;
    try {
      const search = await faFetch(
        `/contacts?keyword=${encodeURIComponent(data.customer.company)}&currentPage=1&pageSize=5`,
      );
      if (search.status >= 200 && search.status < 300) {
        const list: any[] = Array.isArray(search.body?.data?.list)
          ? search.body.data.list
          : Array.isArray(search.body?.data) ? search.body.data
          : Array.isArray(search.body) ? search.body : [];
        const norm = (s: string) => (s ?? "").toLowerCase().replace(/\s+/g, "");
        const target = norm(data.customer.company);
        const match = list.find((c) => norm(c?.contactName ?? c?.name ?? "").includes(target) ||
                                       target.includes(norm(c?.contactName ?? c?.name ?? "")));
        contactId = match?.contactId ?? match?.id ?? null;
      }
    } catch (e: any) {
      console.warn("[FA] contact search failed", e?.message);
    }

    if (!contactId) {
      const createRes = await faFetch(`/contacts`, {
        method: "POST",
        body: JSON.stringify({
          contactType: 3, // both customer + supplier (safe default)
          contactName: data.customer.company,
          taxId: data.customer.tax_id || "",
          address: data.customer.address || "",
          phoneNumber: data.customer.phone || "",
          email: data.customer.email || "",
          contactPerson: data.customer.contact_name || "",
        }),
      });
      if (createRes.status < 200 || createRes.status >= 300) {
        throw new Error(
          `สร้าง Contact ใน FlowAccount ไม่สำเร็จ (${createRes.status}): ${createRes.text.slice(0, 200)}`,
        );
      }
      contactId = createRes.body?.data?.contactId ?? createRes.body?.contactId ?? createRes.body?.id ?? null;
      if (!contactId) throw new Error("ไม่พบ contactId จาก FlowAccount response");
    }

    // ── 2. Build items ──────────────────────────────────────────────────────
    const faItems = data.items.map((it, idx) => ({
      sku: "",
      name: it.name,
      description: it.description || "",
      quantity: it.quantity,
      unitName: "หน่วย",
      pricePerUnit: it.unit_price,
      total: it.quantity * it.unit_price,
      accountCode: "",
      order: idx + 1,
    }));
    const subTotal = faItems.reduce((s, it) => s + it.total, 0);
    // vatType: 1=include, 2=exclude, 3=no vat (FA convention)
    const hasVat = data.vat_rate > 0;
    const vatType = hasVat ? 2 : 3;
    const vatAmount = hasVat ? +(subTotal * data.vat_rate / 100).toFixed(2) : 0;
    const grandTotal = +(subTotal + vatAmount).toFixed(2);

    // ── 3. POST /quotations ─────────────────────────────────────────────────
    const qtPayload = {
      contactId,
      contactName: data.customer.company,
      contactAddress: data.customer.address || "",
      contactEmail: data.customer.email || "",
      contactPhoneNumber: data.customer.phone || "",
      contactTaxId: data.customer.tax_id || "",
      contactPerson: data.customer.contact_name || "",
      publishedOn: data.issued_date,
      dueDate: data.valid_until,
      reference: data.b2b_request_id || "",
      remark: data.note || "",
      items: faItems,
      vatType,
      subTotal,
      vatAmount,
      grandTotal,
      isVatInclusive: false,
      status: 1, // 1 = draft
    };

    const qtRes = await faFetch(`/quotations`, {
      method: "POST",
      body: JSON.stringify(qtPayload),
    });

    if (qtRes.status < 200 || qtRes.status >= 300) {
      throw new Error(
        `สร้างใบเสนอราคาใน FlowAccount ไม่สำเร็จ (${qtRes.status}): ${qtRes.text.slice(0, 300)}`,
      );
    }

    const doc = qtRes.body?.data ?? qtRes.body;
    const documentSerial = pickSerial(doc) ?? "";
    const documentId = doc?.recordId ?? doc?.documentId ?? doc?.id ?? null;
    const fa_url = documentSerial
      ? `https://app.flowaccount.com/document/${documentSerial}`
      : `https://app.flowaccount.com/documents/quotations`;

    // ── 4. Insert into crm.quotations ──────────────────────────────────────
    const { error: insErr } = await context.supabase
      .schema("crm")
      .from("quotations")
      .insert({
        lead_id: data.lead_id ?? null,
        account_id: null,
        quotation_no: documentSerial || null,
        title: `${data.customer.company} — ${documentSerial || "FA Draft"}`,
        source: "flowaccount",
        grand_total: grandTotal,
        status: "draft",
        issued_date: data.issued_date,
        valid_until: data.valid_until,
        owner_id: context.userId,
        created_by: context.userId,
        fa_raw: doc,
      });

    if (insErr) {
      console.warn("[FA] CRM quotation insert failed:", insErr.message);
      // Non-fatal — FA doc was created; return URL anyway
    }

    return {
      ok: true as const,
      quotation_no: documentSerial,
      document_id: documentId,
      fa_url,
      grand_total: grandTotal,
    };
  });
