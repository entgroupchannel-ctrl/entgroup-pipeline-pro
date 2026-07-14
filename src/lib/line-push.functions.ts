// ⚠️ DO NOT auto-trigger any side effects
// Authorized by: therdpoom@entgroup.co.th
/**
 * LINE Push Message server functions
 * ส่งข้อความ LINE จาก CRM โดยตรง ผ่าน LINE Messaging API Push
 * ลูกค้าเห็นชื่อ OA เสมอ — ระบุชื่อพนักงานใน prefix ข้อความ
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function loadRow(supabaseAdmin: any) {
  const { data } = await (supabaseAdmin as any)
    .schema("crm").from("integrations")
    .select("channel_access_token, is_active").eq("id", "line").maybeSingle();
  return data as any;
}

async function getProfile(supabase: any, userId: string) {
  const { data } = await (supabase as any)
    .schema("crm").from("user_profiles")
    .select("full_name, role").eq("id", userId).maybeSingle();
  return data as { full_name: string | null; role: string } | null;
}

// ─── Send LINE Push Message ────────────────────────────────────────────────────
export const sendLinePush = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      line_user_id: z.string().min(1, "ต้องมี LINE User ID"),
      message:      z.string().min(1, "ต้องมีข้อความ"),
      lead_id:      z.string().uuid().optional(),
      show_sender:  z.boolean().default(true), // แสดงชื่อพนักงานใน prefix
    }).parse(input)
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const row = await loadRow(supabaseAdmin);

    if (!row?.channel_access_token)
      throw new Error("ยังไม่ได้ตั้งค่า Channel Access Token");
    if (!row?.is_active)
      throw new Error("LINE integration ถูกปิดอยู่ — เปิดใน ตั้งค่า → LINE OA");

    // ─ ดึงชื่อพนักงานเพื่อใส่ prefix ─────────────────────────────────────
    const profile = await getProfile(context.supabase, context.userId);
    const senderLabel = data.show_sender && profile?.full_name
      ? `[${profile.full_name}]: `
      : "";

    const finalText = `${senderLabel}${data.message}`;

    // ─ Call LINE Push API ──────────────────────────────────────────────────
    const resp = await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${row.channel_access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        to: data.line_user_id,
        messages: [{ type: "text", text: finalText }],
      }),
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({})) as any;
      throw new Error(`LINE API ${resp.status}: ${err?.message ?? resp.statusText}`);
    }

    // ─ Log activity ────────────────────────────────────────────────────────
    if (data.lead_id) {
      await (supabaseAdmin as any).schema("crm").from("activities").insert({
        lead_id:  data.lead_id,
        type:     "line",
        kind:     "line",
        subject:  `ส่งข้อความ LINE (${profile?.full_name ?? "admin"})`,
        body:     JSON.stringify({
          kind: "line", message_type: "text",
          read_status: "sent",
          sent_text: finalText,
          sent_by: profile?.full_name ?? context.userId,
        }),
        done:     true,
        done_at:  new Date().toISOString(),
        owner_id: context.userId,
      });
    }

    return { ok: true, sent_text: finalText };
  });

// ─── Get LINE User ID for a lead ──────────────────────────────────────────────
// ดึง line_user_id จาก lead → contact → line_contact_mapping
export const getLeadLineUserId = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ lead_id: z.string().uuid() }).parse(input)
  )
  .handler(async ({ data, context }) => {
    // 1. ดึง lead → contact_id
    const { data: lead } = await (context.supabase as any)
      .schema("crm").from("leads")
      .select("contact_id, title")
      .eq("id", data.lead_id).maybeSingle();

    if (!lead?.contact_id) return { line_user_id: null, display_name: null };

    // 2. ดึง contact → line_id
    const { data: contact } = await (context.supabase as any)
      .schema("crm").from("contacts")
      .select("id, name, line_id, mobile_phone")
      .eq("id", lead.contact_id).maybeSingle();

    if (!contact) return { line_user_id: null, display_name: null };

    // 3. ถ้า contact มี line_id โดยตรง ใช้เลย
    if (contact.line_id) {
      return { line_user_id: contact.line_id, display_name: contact.name };
    }

    // 4. fallback: ค้นจาก line_contact_mapping
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: mapping } = await (supabaseAdmin as any)
      .schema("crm").from("line_contact_mapping")
      .select("line_uid, display_name")
      .eq("contact_id", contact.id).maybeSingle();

    return {
      line_user_id: mapping?.line_uid ?? null,
      display_name: mapping?.display_name ?? contact.name ?? null,
      contact_phone: contact.mobile_phone ?? null,
    };
  });
