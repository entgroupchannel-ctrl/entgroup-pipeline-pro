// ⚠️ DO NOT auto-trigger any side effects
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ── helpers ───────────────────────────────────────────────────────────────────

function trimKey(v: string | undefined) {
  if (!v) return "";
  return v.trim().replace(/^["']|["']$/g, "");
}

function keyShape(key: string) {
  const valid = /^re_[A-Za-z0-9_-]{10,}$/.test(key);
  const masked = key ? `${key.slice(0, 6)}…${key.slice(-4)} (len ${key.length})` : "";
  return { valid, masked };
}

async function readBody(resp: Response) {
  const text = await resp.text().catch(() => "");
  try { return text ? JSON.parse(text) : {}; } catch { return { raw: text }; }
}

function apiMsg(body: any, fallback: string) {
  return body?.message || body?.error || body?.name || fallback;
}

async function assertAdmin(supabase: any, userId: string) {
  const { data, error } = await (supabase as any)
    .schema("crm").from("user_profiles")
    .select("role").eq("id", userId).maybeSingle();
  if (error) throw new Error(`ตรวจสอบสิทธิ์ไม่สำเร็จ: ${error.message}`);
  if ((data as any)?.role !== "admin") throw new Error("Forbidden: admin only");
}

async function loadEmailRow(supabaseAdmin: any) {
  const { data } = await (supabaseAdmin as any)
    .schema("crm").from("integrations")
    .select("*").eq("id", "email").maybeSingle();
  return data as any;
}

// ── Load email config (status check + Resend domain verify) ───────────────────

export const getEmailConfig = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const row = await loadEmailRow(supabaseAdmin);

    // Pull from DB row, fallback to env (backward compat)
    const rawKey   = trimKey(row?.resend_api_key  || process.env.RESEND_API_KEY  || "");
    const fromEmail = (row?.from_email  || process.env.FROM_EMAIL   || "").trim();
    const companyName = (row?.company_name || process.env.COMPANY_NAME || "").trim();
    const isActive = row?.is_active ?? false;
    const shape = keyShape(rawKey);

    let resendStatus: "ok" | "invalid" | "limited" | "no_key" | "error" = "no_key";
    let resendMessage = "ยังไม่ได้ตั้งค่า Resend API Key";
    let domains: Array<{ id: string; name: string; status: string; region?: string }> = [];
    let fromDomainMatch: { domain: string; found: boolean; verified: boolean } | null = null;

    if (rawKey && !shape.valid) {
      resendStatus = "invalid";
      resendMessage = "รูปแบบ API Key ไม่ถูกต้อง — ต้องขึ้นต้นด้วย re_";
    } else if (rawKey) {
      try {
        const resp = await fetch("https://api.resend.com/domains", {
          headers: { Authorization: `Bearer ${rawKey}` },
        });
        if (resp.status === 401 || resp.status === 403) {
          const body = await readBody(resp);
          resendStatus = "limited";
          resendMessage = `Domains API ตรวจไม่ได้ (${resp.status}: ${apiMsg(body, resp.statusText)}) — Key อาจเป็น Sending access เท่านั้น ใช้ปุ่มส่งทดสอบเพื่อยืนยัน`;
        } else if (!resp.ok) {
          const body = await readBody(resp);
          resendStatus = "error";
          resendMessage = `Domains API ตอบกลับ ${resp.status}: ${apiMsg(body, resp.statusText)}`;
        } else {
          const json: any = await resp.json();
          domains = (json?.data ?? []).map((d: any) => ({
            id: d.id, name: d.name, status: d.status, region: d.region,
          }));
          resendStatus = "ok";
          resendMessage = `โอเค — พบ ${domains.length} โดเมน`;
          if (fromEmail.includes("@")) {
            const dom = fromEmail.split("@")[1]!.toLowerCase();
            const match = domains.find((d) => d.name.toLowerCase() === dom);
            fromDomainMatch = { domain: dom, found: !!match, verified: match?.status === "verified" };
          }
        }
      } catch (err: any) {
        resendStatus = "error";
        resendMessage = err?.message ?? "เรียก Resend API ไม่สำเร็จ";
      }
    }

    return {
      hasKey: !!rawKey,
      keyShape: shape,
      fromEmail,
      companyName,
      isActive,
      resendStatus,
      resendMessage,
      domains,
      fromDomainMatch,
      lastTestedAt: row?.last_tested_at ?? null,
      testError: row?.test_error ?? null,
      source: row ? "db" : "env",
    };
  });

// ── Save email credentials to crm.integrations ────────────────────────────────

export const saveEmailConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      resend_api_key: z.string().trim().min(1),
      from_email:     z.string().trim().email("กรุณากรอก email ที่ถูกต้อง"),
      company_name:   z.string().trim().min(1, "กรุณากรอกชื่อบริษัท"),
      reply_to:       z.string().trim().optional(),
      is_active:      z.boolean(),
    }).parse(input)
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const payload: Record<string, any> = {
      id:           "email",
      from_email:   data.from_email,
      company_name: data.company_name,
      reply_to:     data.reply_to || null,
      is_active:    data.is_active,
      updated_by:   context.userId,
      updated_at:   new Date().toISOString(),
    };

    if (data.resend_api_key !== "KEEP_EXISTING") {
      payload.resend_api_key = data.resend_api_key;
    }

    const { error } = await (supabaseAdmin as any)
      .schema("crm").from("integrations")
      .upsert(payload, { onConflict: "id" });

    if (error) throw new Error(`บันทึกไม่สำเร็จ: ${error.message}`);
    return { ok: true };
  });

// ── Send diagnostic test email ─────────────────────────────────────────────────

export const sendDiagnosticEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ to: z.string().trim().email("กรุณากรอก email ที่ถูกต้อง") }).parse(input)
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const row = await loadEmailRow(supabaseAdmin);

    const key     = trimKey(row?.resend_api_key || process.env.RESEND_API_KEY || "");
    const from    = (row?.from_email   || process.env.FROM_EMAIL   || "").trim();
    const company = (row?.company_name || process.env.COMPANY_NAME || "ENTGROUP CRM").trim();
    const replyTo = (row?.reply_to     || "").trim();
    const shape   = keyShape(key);

    if (!key)        throw new Error("ยังไม่ได้ตั้งค่า Resend API Key");
    if (!shape.valid) throw new Error("รูปแบบ API Key ไม่ถูกต้อง — ต้องขึ้นต้นด้วย re_");
    if (!from)       throw new Error("ยังไม่ได้ตั้งค่า From Email");

    const body: any = {
      from:    `${company} <${from}>`,
      to:      [data.to],
      subject: `[Diagnostic] Email config ทดสอบ — ${new Date().toLocaleString("th-TH")}`,
      html:    `<p>อีเมลทดสอบจากระบบ <b>${company} CRM</b></p>
                <p>หากได้รับอีเมลนี้ แสดงว่า Resend API Key และ From Email ตั้งค่าถูกต้องแล้ว ✓</p>
                <p style="color:#6b7280;font-size:12px">ส่งจาก: ${from} · เวลา: ${new Date().toISOString()}</p>`,
    };
    if (replyTo) body.reply_to = replyTo;

    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const respBody = await readBody(resp);

    // update test timestamp
    await (supabaseAdmin as any)
      .schema("crm").from("integrations")
      .update({
        last_tested_at: new Date().toISOString(),
        test_error: resp.ok ? null : `${resp.status}: ${apiMsg(respBody, resp.statusText)}`,
      })
      .eq("id", "email");

    if (!resp.ok) {
      throw new Error(
        `Resend ${resp.status}: ${apiMsg(respBody, resp.statusText)} — ตรวจว่า API Key ใช้ส่งอีเมลได้ และ From Email (${from}) อยู่บนโดเมนที่ verified`
      );
    }
    return { ok: true, id: respBody?.id ?? null };
  });
