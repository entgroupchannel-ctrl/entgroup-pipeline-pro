// ⚠️ DO NOT auto-trigger any side effects
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ── helpers ───────────────────────────────────────────────────────────────────

function trimKey(v: string | undefined) {
  if (!v) return "";
  return v.trim().replace(/^["']|["']$/g, "");
}

// ── Load Resend email config from crm.integrations (id='email') ───────────────

async function loadEmailConfig(supabaseAdmin: any) {
  const { data } = await (supabaseAdmin as any)
    .schema("crm").from("integrations")
    .select("*").eq("id", "email").maybeSingle();
  const key       = trimKey(data?.resend_api_key || process.env.RESEND_API_KEY || "");
  const fromEmail = (data?.from_email   || process.env.FROM_EMAIL   || "").trim();
  const company   = (data?.company_name || process.env.COMPANY_NAME || "ENTGROUP").trim();
  const replyTo   = (data?.reply_to     || "").trim();
  const isActive  = data?.is_active ?? false;
  return { key, fromEmail, company, replyTo, isActive };
}

// ── Load Claude AI config from crm.integrations (id='claude_ai') ──────────────

async function loadClaudeConfig(supabaseAdmin: any) {
  const { data } = await (supabaseAdmin as any)
    .schema("crm").from("integrations")
    .select("*").eq("id", "claude_ai").maybeSingle();

  const apiKey            = trimKey(data?.claude_api_key || process.env.ANTHROPIC_API_KEY || "");
  const model             = (data?.ai_model as string)       || "claude-sonnet-4-6";
  const maxTokens         = (data?.max_tokens as number)      || 1000;
  const isActive          = data?.is_active          ?? false;
  const emailDraftEnabled = data?.email_draft_enabled ?? true;

  return { apiKey, model, maxTokens, isActive, emailDraftEnabled };
}

// ── AI draft email ─────────────────────────────────────────────────────────────

export const draftLeadEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      brief:        z.string().min(1),
      lead_title:   z.string().optional(),
      contact_name: z.string().optional(),
      company_name: z.string().optional(),
      stage:        z.string().optional(),
      sender_name:  z.string().optional(),
    }).parse(input)
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const ai = await loadClaudeConfig(supabaseAdmin);

    // Guard: check settings in order of clarity
    if (!ai.apiKey) {
      throw new Error(
        "ยังไม่ได้ตั้งค่า Claude API Key — ไปที่ ตั้งค่า > AI ✦ เพื่อกรอก key"
      );
    }
    if (!ai.isActive) {
      throw new Error(
        "ฟีเจอร์ AI ยังปิดอยู่ — ไปที่ ตั้งค่า > AI ✦ แล้วเปิดสวิตช์"
      );
    }
    if (!ai.emailDraftEnabled) {
      throw new Error(
        "ฟีเจอร์ร่างอีเมลด้วย AI ถูกปิดอยู่ — ไปที่ ตั้งค่า > AI ✦ เพื่อเปิด"
      );
    }

    const contextParts = [
      data.company_name ? `บริษัทลูกค้า: ${data.company_name}` : null,
      data.contact_name ? `ชื่อผู้ติดต่อ: ${data.contact_name}` : null,
      data.lead_title   ? `ชื่อดีล: ${data.lead_title}`         : null,
      data.stage        ? `สถานะดีล: ${data.stage}`             : null,
      data.sender_name  ? `ชื่อผู้ส่ง: ${data.sender_name}`     : null,
    ].filter(Boolean).join("\n");

    const prompt = `คุณเป็น Sales Professional ของบริษัท ENTGROUP
ช่วยร่างอีเมลภาษาไทยแบบมืออาชีพ ตามข้อมูลต่อไปนี้

${contextParts ? `== ข้อมูลลูกค้า ==\n${contextParts}\n` : ""}== สิ่งที่ต้องการสื่อ ==
${data.brief}

กรุณาตอบในรูปแบบ JSON เท่านั้น ไม่มี markdown หรือ backtick:
{
  "subject": "หัวเรื่องอีเมล",
  "body": "เนื้อหาอีเมลแบบ plain text (ใส่ newline แทน <br>)"
}

หลักการ:
- ใช้ภาษาสุภาพ เป็นกันเอง ไม่เป็นทางการเกินไป
- ไม่ยาวเกิน 5-7 ประโยค
- ปิดท้ายด้วยการเปิดให้ตอบกลับ
- ถ้ามีชื่อผู้ติดต่อ ให้ขึ้นต้นด้วย "เรียน คุณ[ชื่อ],"`;

    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type":      "application/json",
        "x-api-key":         ai.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model:      ai.model,
        max_tokens: ai.maxTokens,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text().catch(() => "");
      if (resp.status === 401) {
        throw new Error(
          "Claude API Key ไม่ถูกต้องหรือหมดอายุ — ไปที่ ตั้งค่า > AI ✦ เพื่ออัปเดต key"
        );
      }
      throw new Error(`AI ตอบกลับ ${resp.status}: ${errText.slice(0, 120)}`);
    }

    const json: any = await resp.json();
    const raw = json?.content?.[0]?.text ?? "";

    // strip any accidental backticks
    const cleaned = raw.replace(/```json\n?|```\n?/g, "").trim();
    try {
      const parsed = JSON.parse(cleaned);
      return { subject: parsed.subject ?? "", body: parsed.body ?? "" };
    } catch {
      return { subject: "", body: raw };
    }
  });

// ── Send email via Resend + log ────────────────────────────────────────────────

export const sendLeadEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      to:            z.string().trim().email("กรุณากรอก email ที่ถูกต้อง"),
      to_name:       z.string().optional(),
      subject:       z.string().min(1, "กรุณาระบุหัวเรื่อง"),
      body:          z.string().min(1, "กรุณาระบุเนื้อหา"),
      lead_id:       z.string().uuid().optional(),
      contact_id:    z.string().uuid().optional(),
    }).parse(input)
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const cfg = await loadEmailConfig(supabaseAdmin);

    if (!cfg.key)       throw new Error("ยังไม่ได้ตั้งค่า Resend API Key — ไปที่ Settings > อีเมล");
    if (!cfg.fromEmail) throw new Error("ยังไม่ได้ตั้งค่า From Email");
    if (!cfg.isActive)  throw new Error("ระบบอีเมลยังไม่ได้เปิดใช้งาน — ไปที่ Settings > อีเมล");

    // convert plain-text newlines to html
    const bodyHtml = `<div style="font-family:sans-serif;font-size:15px;line-height:1.7;color:#1a1a1a">${
      data.body
        .split("\n")
        .map((line) => `<p style="margin:0 0 8px">${line || "&nbsp;"}</p>`)
        .join("")
    }</div>`;

    const payload: any = {
      from: `${cfg.company} <${cfg.fromEmail}>`,
      to:   [data.to_name ? `${data.to_name} <${data.to}>` : data.to],
      subject: data.subject,
      html: bodyHtml,
      text: data.body,
    };
    if (cfg.replyTo) payload.reply_to = cfg.replyTo;

    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization:  `Bearer ${cfg.key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const respBody = await resp.json().catch(() => ({})) as any;

    // log to email_send_log
    await (supabaseAdmin as any)
      .schema("crm").from("email_send_log")
      .insert({
        recipient_email:     data.to,
        template_name:       "lead_email_manual",
        subject:             data.subject,
        status:              resp.ok ? "sent" : "failed",
        provider_message_id: respBody?.id ?? null,
        error_message:       resp.ok ? null : (respBody?.message ?? `HTTP ${resp.status}`),
        related_id:          data.lead_id    ?? null,
        related_type:        data.lead_id    ? "lead"    :
                             data.contact_id ? "contact" : null,
        triggered_by:        context.userId,
        metadata: {
          contact_id: data.contact_id ?? null,
          lead_id:    data.lead_id    ?? null,
        },
      });

    // log as activity on lead
    if (data.lead_id && resp.ok) {
      await (supabaseAdmin as any)
        .schema("crm").from("activities")
        .insert({
          lead_id:  data.lead_id,
          type:     "email",
          subject:  `ส่งอีเมล: ${data.subject}`,
          body:     data.body,
          done:     true,
          done_at:  new Date().toISOString(),
          owner_id: context.userId,
        });
    }

    if (!resp.ok) {
      throw new Error(
        `Resend ${resp.status}: ${respBody?.message ?? resp.statusText}`
      );
    }

    return { ok: true, id: respBody?.id ?? null };
  });
