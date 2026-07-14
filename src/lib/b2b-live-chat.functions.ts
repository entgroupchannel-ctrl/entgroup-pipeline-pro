import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type LiveChatPayload = {
  method: "GET" | "POST";
  params?: Record<string, string | number | boolean | null | undefined>;
  body?: Record<string, unknown>;
};

export type LiveChatResponse = {
  ok?: boolean;
  data?: any[];
  total?: number;
  status?: number;
  error?: string;
  fallback?: boolean;
};

export const callB2BLiveChat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: LiveChatPayload) => {
    if (!input || (input.method !== "GET" && input.method !== "POST")) {
      throw new Error("Invalid live chat request");
    }
    return {
      method: input.method,
      params: input.params ?? {},
      body: input.body ?? {},
    } satisfies LiveChatPayload;
  })
  .handler(async ({ data }) => {
    const endpoint =
      process.env.B2B_LIVE_CHAT_URL ??
      "https://ugzdwmyylqmirrljtuej.supabase.co/functions/v1/b2b-live-chat";
    const crmSecret = process.env.CRM_SECRET ?? "entgroup-crm-secret-2026";

    const url = new URL(endpoint);
    if (data.method === "GET") {
      Object.entries(data.params ?? {}).forEach(([key, value]) => {
        if (value !== null && value !== undefined) url.searchParams.set(key, String(value));
      });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12_000);

    try {
      const response = await fetch(url.toString(), {
        method: data.method,
        headers: {
          "x-crm-secret": crmSecret,
          ...(data.method === "POST" ? { "content-type": "application/json" } : {}),
        },
        body: data.method === "POST" ? JSON.stringify(data.body ?? {}) : undefined,
        signal: controller.signal,
      });

      const text = await response.text();
      let body: any = null;
      try {
        body = text ? JSON.parse(text) : null;
      } catch {
        body = null;
      }

      if (!response.ok) {
        const isTimeout = response.status >= 500 || text.includes("522") || /connection timed out/i.test(text);
        console.warn("[b2b-live-chat] upstream error", response.status, text.slice(0, 180));
        return {
          ok: false,
          data: [],
          status: response.status,
          error: isTimeout ? "B2B live chat temporarily unavailable" : body?.error ?? `HTTP ${response.status}`,
          fallback: isTimeout,
        } satisfies LiveChatResponse;
      }

      if (!body || typeof body !== "object") {
        return { ok: false, data: [], error: "Invalid B2B live chat response", fallback: true } satisfies LiveChatResponse;
      }

      return body as LiveChatResponse;
    } catch (error: any) {
      console.warn("[b2b-live-chat] upstream fetch failed", error?.name ?? error?.message ?? error);
      return {
        ok: false,
        data: [],
        status: 0,
        error: error?.name === "AbortError" ? "B2B live chat request timed out" : "B2B live chat temporarily unavailable",
        fallback: true,
      } satisfies LiveChatResponse;
    } finally {
      clearTimeout(timeout);
    }
  });