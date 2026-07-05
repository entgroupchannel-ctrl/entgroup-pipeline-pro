// ⚠️ DO NOT auto-trigger any side effects
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ── Helpers ───────────────────────────────────────────────────────────────────

function trimKey(v: string | undefined): string {
  if (!v) return "";
  return v.trim().replace(/^["']|["']$/g, "");
}

function maskKey(key: string): string {
  if (!key || key.length < 10) return "";
  return `${key.slice(0, 7)}…${key.slice(-4)} (len ${key.length})`;
}

function isValidClaudeKey(key: string): boolean {
  return /^sk-ant-[A-Za-z0-9_-]{20,}$/.test(key);
}

async function assertAdmin(supabase: any, userId: string) {
  const { data, error } = await (supabase as any)
    .schema("crm")
    .from("user_profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw new Error(`ตรวจสอบสิทธิ์ไม่สำเร็จ: ${error.message}`);
  if ((data as any)?.role !== "admin") throw new Error("Forbidden: admin only");
}

async function loadAIRow(supabaseAdmin: any) {
  const { data } = await (supabaseAdmin as any)
    .schema("crm")
    .from("integrations")
    .select("*")
    .eq("id", "claude_ai")
    .maybeSingle();
  return data as any;
}

// ── Load AI settings ──────────────────────────────────────────────────────────

export const loadAISettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const row = await loadAIRow(supabaseAdmin);

    const rawKey = trimKey(row?.claude_api_key || "");
    const hasKey = rawKey.length > 0;
    const keyValid = hasKey ? isValidClaudeKey(rawKey) : null;

    // Test key validity by calling Claude models list
    let keyStatus: "ok" | "invalid" | "no_key" | "error" = "no_key";
    let keyMessage = "ยังไม่ได้ตั้งค่า Claude API Key";

    if (hasKey) {
      try {
        const resp = await fetch("https://api.anthropic.com/v1/models", {
          headers: {
            "x-api-key": rawKey,
            "anthropic-version": "2023-06-01",
          },
        });
        if (resp.status === 200) {
          keyStatus = "ok";
          keyMessage = "API Key ใช้งานได้ ✓";
        } else if (resp.status === 401) {
          keyStatus = "invalid";
          keyMessage = "API Key ไม่ถูกต้องหรือหมดอายุ";
        } else {
          keyStatus = "error";
          keyMessage = `Anthropic API ตอบกลับ ${resp.status}`;
        }
      } catch {
        keyStatus = "error";
        keyMessage = "ไม่สามารถเชื่อมต่อ Anthropic API ได้";
      }
    }

    return {
      hasKey,
      keyMasked: hasKey ? maskKey(rawKey) : "",
      keyValid,
      keyStatus,
      keyMessage,
      isActive: row?.is_active ?? false,
      model: (row?.ai_model as string) || "claude-sonnet-4-6",
      emailDraftEnabled: row?.email_draft_enabled ?? true,
      maxTokens: (row?.max_tokens as number) || 1000,
      updatedAt: row?.updated_at as string | null,
    };
  });

export type AISettings = Awaited<ReturnType<typeof loadAISettings>>;

// ── Save AI settings ──────────────────────────────────────────────────────────

const SaveAISchema = z.object({
  claude_api_key:      z.string(),
  model:               z.string(),
  email_draft_enabled: z.boolean(),
  max_tokens:          z.number().int().min(100).max(4000),
  is_active:           z.boolean(),
});

export const saveAISettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(SaveAISchema)
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const existing = await loadAIRow(supabaseAdmin);
    const keepExisting = data.claude_api_key === "KEEP_EXISTING";
    const newKey = keepExisting
      ? (existing?.claude_api_key ?? "")
      : trimKey(data.claude_api_key);

    const payload: Record<string, any> = {
      id:                  "claude_ai",
      is_active:           data.is_active,
      ai_model:            data.model,
      email_draft_enabled: data.email_draft_enabled,
      max_tokens:          data.max_tokens,
      updated_at:          new Date().toISOString(),
    };

    if (!keepExisting && newKey) {
      payload.claude_api_key = newKey;
    }

    const { error } = await (supabaseAdmin as any)
      .schema("crm")
      .from("integrations")
      .upsert(payload, { onConflict: "id" });

    if (error) throw new Error(`บันทึกไม่สำเร็จ: ${error.message}`);
    return { ok: true };
  });

// ── Test draft generation ─────────────────────────────────────────────────────

export const testAIDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(z.object({ prompt: z.string().max(500) }))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const row = await loadAIRow(supabaseAdmin);
    const rawKey = trimKey(row?.claude_api_key || "");
    if (!rawKey) throw new Error("ยังไม่มี Claude API Key");

    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": rawKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: row?.ai_model || "claude-sonnet-4-6",
        max_tokens: 300,
        messages: [
          {
            role: "user",
            content: `ร่างอีเมลธุรกิจสั้น ๆ สำหรับ: ${data.prompt}\nตอบกลับเป็นภาษาไทย ไม่ต้องมี preamble`,
          },
        ],
      }),
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error((err as any)?.error?.message || `Anthropic API error ${resp.status}`);
    }

    const result = await resp.json();
    const text = (result as any)?.content?.[0]?.text ?? "";
    return { draft: text };
  });
