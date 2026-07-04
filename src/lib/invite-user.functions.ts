// ⚠️ DO NOT auto-trigger any side effects
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const CRM_ROLES = ["sales", "manager", "admin"] as const;
const SUPER_ADMIN_EMAILS = ["therdpoom@entgroup.co.th"];

async function assertAdmin(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  // super admin bypass
  try {
    const { data: u } = await supabaseAdmin.auth.admin.getUserById(userId);
    const email = (u?.user?.email ?? "").toLowerCase();
    if (SUPER_ADMIN_EMAILS.includes(email)) return;
  } catch { /* fall through */ }
  // check crm.user_profiles role
  const { data, error } = await supabaseAdmin
    .schema("crm" as any)
    .from("user_profiles" as any)
    .select("role")
    .eq("id", userId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  const role = (data as any)?.role ?? "";
  if (role !== "admin") throw new Error("Forbidden: admin only");
}

async function loadEmailConfig(supabaseAdmin: any) {
  const { data } = await (supabaseAdmin as any)
    .schema("crm").from("integrations")
    .select("*").eq("id", "email").maybeSingle();

  const key       = (data?.resend_api_key || "").trim().replace(/^["']|["']$/g, "");
  const fromEmail = (data?.from_email   || "").trim();
  const company   = (data?.company_name || "ENTGROUP").trim();
  const replyTo   = (data?.reply_to     || "").trim();
  const isActive  = data?.is_active ?? false;

  return { key, fromEmail, company, replyTo, isActive };
}

// ─── Invite new user ──────────────────────────────────────────────────────────

export const inviteCrmUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      email: z.string().trim().email().max(255),
      role: z.enum(CRM_ROLES),
      full_name: z.string().trim().max(120).optional().nullable(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // find or create auth user
    const { data: list } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 500 });
    let existing = (list?.users ?? []).find(
      (u: any) => (u.email ?? "").toLowerCase() === data.email.toLowerCase(),
    );
    let mode: "invite" | "recovery" = "invite";

    if (!existing) {
      const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
        email: data.email,
        email_confirm: false,
        user_metadata: data.full_name ? { full_name: data.full_name } : undefined,
      });
      if (createErr) throw new Error(createErr.message);
      existing = created?.user ?? null as any;
    } else {
      mode = "recovery";
    }
    if (!existing) throw new Error("ไม่สามารถสร้าง auth user ได้");

    // upsert crm.user_profiles
    const { error: profileErr } = await supabaseAdmin
      .schema("crm" as any)
      .from("user_profiles" as any)

      .upsert({
        id: existing.id,
        full_name: data.full_name ?? null,
        role: data.role,
        is_active: true,
      }, { onConflict: "id" });
    if (profileErr) throw new Error(profileErr.message);

    // generate action link
    const redirectTo = "https://entgroup-crm.lovable.app/";
    const { data: linkData, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
      type: mode === "invite" ? "invite" : "recovery",
      email: data.email,
      options: { redirectTo },
    } as any);
    if (linkErr) throw new Error(linkErr.message);
    const actionLink = (linkData as any)?.properties?.action_link;
    if (!actionLink) throw new Error("ไม่สามารถสร้างลิงก์ได้");

    // send email via Resend
    const cfg = await loadEmailConfig(supabaseAdmin);
    if (!cfg.key)       throw new Error("ยังไม่ได้ตั้งค่า Resend API Key — ไปที่ Settings > อีเมล");
    if (!cfg.fromEmail) throw new Error("ยังไม่ได้ตั้งค่า From Email");
    if (!cfg.isActive)  throw new Error("ระบบอีเมลยังไม่ได้เปิดใช้งาน");

    const displayName = data.full_name ?? data.email;
    const subject = mode === "invite"
      ? `คำเชิญเข้าใช้งาน ${cfg.company} CRM`
      : `เข้าใช้งาน ${cfg.company} CRM`;
    const html = `
      <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#0f172a">
        <h2 style="margin:0 0 12px">คำเชิญเข้าใช้งาน ${cfg.company} CRM</h2>
        <p style="margin:0 0 8px">สวัสดี ${displayName}</p>
        <p style="margin:0 0 16px">คุณได้รับสิทธิ์เข้าใช้งานระบบ CRM ในบทบาท <strong>${data.role}</strong></p>
        <p style="margin:24px 0">
          <a href="${actionLink}" style="display:inline-block;background:#2563eb;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600">
            ตั้งรหัสผ่านและเข้าสู่ระบบ
          </a>
        </p>
        <p style="margin:0 0 8px;color:#64748b;font-size:13px">ลิงก์นี้มีอายุ 24 ชั่วโมง</p>
        <p style="margin:12px 0 0;color:#94a3b8;font-size:12px">หากปุ่มไม่ทำงาน คัดลอกลิงก์นี้ไปวางในเบราว์เซอร์:<br/>${actionLink}</p>
      </div>
    `;

    let resendResp: Response;

    try {
      resendResp = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${cfg.key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: `${cfg.company} CRM <${cfg.fromEmail}>`,
          to: [data.email],
          subject,
          html,
        }),
      });
    } catch (fetchErr: any) {
      if (mode === "invite") {
        await supabaseAdmin.auth.admin.deleteUser(existing.id).catch(() => {});
      }
      throw new Error(`ส่งเมลไม่สำเร็จ: ${fetchErr?.message ?? "network error"}`);
    }

    if (!resendResp.ok) {
      const errText = await resendResp.text();
      if (mode === "invite") {
        await supabaseAdmin.auth.admin.deleteUser(existing.id).catch(() => {});
      }
      throw new Error(`Resend error ${resendResp.status}: ${errText}`);
    }

    return { ok: true, user_id: existing.id, email: data.email, resent: mode === "recovery" };
  });

// ─── List pending invites ─────────────────────────────────────────────────────

export const listPendingInvites = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 500 });
    if (error) throw new Error(error.message);
    return (data?.users ?? [])
      .filter((u: any) => !u.email_confirmed_at && !u.confirmed_at && u.invited_at)
      .map((u: any) => ({
        user_id: u.id as string,
        email: (u.email ?? null) as string | null,
        invited_at: (u.invited_at ?? null) as string | null,
      }));
  });

// ─── Resend invite ────────────────────────────────────────────────────────────

export const resendCrmInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ email: z.string().trim().email() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.inviteUserByEmail(data.email);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ─── Delete / deactivate user ─────────────────────────────────────────────────

export const deactivateCrmUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ user_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    if (data.user_id === context.userId) throw new Error("ปิดบัญชีตัวเองไม่ได้");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .schema("crm" as any)
      .from("user_profiles" as any)

      .update({ is_active: false })
      .eq("id", data.user_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
