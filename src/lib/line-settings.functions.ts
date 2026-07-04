// ⚠️ DO NOT auto-trigger any side effects
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await (supabaseAdmin as any)
    .schema("crm").from("user_profiles")
    .select("role").eq("id", userId).maybeSingle();
  if ((data as any)?.role !== "admin") throw new Error("Forbidden: admin only");
}

async function loadRow(supabaseAdmin: any) {
  const { data } = await (supabaseAdmin as any)
    .schema("crm").from("integrations")
    .select("*").eq("id", "line").maybeSingle();
  return data as any;
}

function mask(v: string | null | undefined) {
  if (!v) return null;
  return v.length > 8 ? `${"•".repeat(v.length - 4)}${v.slice(-4)}` : "••••";
}

// ── Load LINE settings ────────────────────────────────────────────────────────

export const loadLineSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const row = await loadRow(supabaseAdmin);
    return {
      channel_access_token_masked: mask(row?.channel_access_token),
      channel_secret_masked:       mask(row?.channel_secret),
      line_notify_token_masked:    mask(row?.line_notify_token),
      webhook_url:                 row?.webhook_url ?? null,
      is_active:                   row?.is_active ?? false,
      auto_create_lead:            row?.auto_create_lead ?? true,
      log_activity:                row?.log_activity ?? true,
      notify_sales:                row?.notify_sales ?? true,
      pipeline_badge:              row?.pipeline_badge ?? true,
      last_tested_at:              row?.last_tested_at ?? null,
      test_error:                  row?.test_error ?? null,
      source: row ? "db" : "none",
    };
  });

// ── Save LINE credentials ─────────────────────────────────────────────────────

export const saveLineSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      channel_access_token: z.string(),
      channel_secret:       z.string(),
      line_notify_token:    z.string(),
      webhook_url:          z.string().optional(),
      is_active:            z.boolean(),
      auto_create_lead:     z.boolean(),
      log_activity:         z.boolean(),
      notify_sales:         z.boolean(),
      pipeline_badge:       z.boolean(),
    }).parse(input)
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const payload: Record<string, any> = {
      id:               "line",
      is_active:        data.is_active,
      auto_create_lead: data.auto_create_lead,
      log_activity:     data.log_activity,
      notify_sales:     data.notify_sales,
      pipeline_badge:   data.pipeline_badge,
      updated_by:       context.userId,
      updated_at:       new Date().toISOString(),
    };

    if (data.webhook_url) payload.webhook_url = data.webhook_url;
    if (data.channel_access_token && data.channel_access_token !== "KEEP_EXISTING")
      payload.channel_access_token = data.channel_access_token;
    if (data.channel_secret && data.channel_secret !== "KEEP_EXISTING")
      payload.channel_secret = data.channel_secret;
    if (data.line_notify_token && data.line_notify_token !== "KEEP_EXISTING")
      payload.line_notify_token = data.line_notify_token;

    const { error } = await (supabaseAdmin as any)
      .schema("crm").from("integrations")
      .upsert(payload, { onConflict: "id" });

    if (error) throw new Error(`บันทึกไม่สำเร็จ: ${error.message}`);
    return { ok: true };
  });

// ── Test LINE connection ──────────────────────────────────────────────────────

export const testLineConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const row = await loadRow(supabaseAdmin);

    const token = row?.channel_access_token;
    if (!token) throw new Error("ยังไม่ได้ตั้งค่า Channel Access Token");

    const resp = await fetch("https://api.line.me/v2/bot/info", {
      headers: { Authorization: `Bearer ${token}` },
    });

    const body = await resp.json().catch(() => ({})) as any;

    await (supabaseAdmin as any)
      .schema("crm").from("integrations")
      .update({
        last_tested_at: new Date().toISOString(),
        test_error: resp.ok ? null : (body?.message ?? `HTTP ${resp.status}`),
      })
      .eq("id", "line");

    if (!resp.ok) {
      throw new Error(`LINE API ${resp.status}: ${body?.message ?? resp.statusText}`);
    }

    return {
      ok: true,
      bot_name:    body?.displayName ?? null,
      bot_user_id: body?.userId ?? null,
    };
  });

// ── Load LINE uid → Contact mappings ─────────────────────────────────────────

export const loadLineMappings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data, error } = await (supabaseAdmin as any)
      .schema("crm").from("line_contact_mapping")
      .select(`
        line_uid, display_name, mapped_at,
        contact:contact_id ( id, contact_name ),
        mapper:mapped_by ( id, full_name )
      `)
      .order("mapped_at", { ascending: false });

    if (error) throw new Error(error.message);
    return (data ?? []) as any[];
  });

// ── Upsert a mapping ─────────────────────────────────────────────────────────

export const saveLineMapping = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      line_uid:     z.string().min(1),
      display_name: z.string().optional(),
      contact_id:   z.string().uuid(),
    }).parse(input)
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { error } = await (supabaseAdmin as any)
      .schema("crm").from("line_contact_mapping")
      .upsert({
        line_uid:     data.line_uid,
        display_name: data.display_name ?? null,
        contact_id:   data.contact_id,
        mapped_by:    context.userId,
        mapped_at:    new Date().toISOString(),
      }, { onConflict: "line_uid" });

    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ── Delete a mapping ─────────────────────────────────────────────────────────

export const deleteLineMapping = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ line_uid: z.string().min(1) }).parse(input)
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { error } = await (supabaseAdmin as any)
      .schema("crm").from("line_contact_mapping")
      .delete().eq("line_uid", data.line_uid);

    if (error) throw new Error(error.message);
    return { ok: true };
  });
