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
    await assertAdmin(context.userId);
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
    await assertAdmin(context.userId);
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
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data, error } = await (supabaseAdmin as any)
      .schema("crm")
      .from("integrations")
      .select("client_id, client_secret, base_url, token_url, is_active, last_synced_at, sync_error")
      .eq("id", "flowaccount")
      .maybeSingle();

    if (error) throw new Error(`โหลด settings ไม่สำเร็จ: ${error.message}`);

    const blank = {
      client_id: "", client_secret_masked: "", base_url: "",
      token_url: "", is_active: false, last_synced_at: null, sync_error: null,
    };
    if (!data) return blank;

    const secret: string = (data as any).client_secret ?? "";
    const masked = secret.length > 4
      ? "••••••••" + secret.slice(-4)
      : secret ? "••••" : "";

    return {
      client_id:          (data as any).client_id ?? "",
      client_secret_masked: masked,
      base_url:           (data as any).base_url ?? "https://openapi.flowaccount.com/v1",
      token_url:          (data as any).token_url ?? "https://openapi.flowaccount.com/token",
      is_active:          (data as any).is_active ?? false,
      last_synced_at:     (data as any).last_synced_at ?? null,
      sync_error:         (data as any).sync_error ?? null,
    };
  });

// ── Sync documents from FA API → crm.fa_documents ────────────────────────────

export const syncFADocuments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
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
