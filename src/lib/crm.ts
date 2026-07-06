import { supabase } from "@/integrations/supabase/client";

// The CRM tables live in the `crm` Postgres schema. The generated types.ts
// only describes the `public` schema, so we cast to `any` for now — RLS still
// applies server-side.
export const crmDb = () => (supabase as unknown as { schema: (s: string) => any }).schema("crm");

export type LeadStage = "new" | "qualified" | "proposal" | "negotiation" | "closing" | "won" | "lost";

export const ACTIVE_STAGES: LeadStage[] = ["new", "qualified", "proposal", "negotiation", "closing"];
export const OUTCOME_STAGES: LeadStage[] = ["won", "lost"];

export const STAGE_LABEL_TH: Record<LeadStage, string> = {
  new: "ใหม่",
  qualified: "คัดกรองแล้ว",
  proposal: "เสนอราคา",
  negotiation: "เจรจา",
  closing: "ปิดการขาย",
  won: "ชนะ",
  lost: "แพ้",
};

export const STAGE_TOKEN: Record<LeadStage, string> = {
  new: "stage-new",
  qualified: "stage-qualified",
  proposal: "stage-proposal",
  negotiation: "stage-negotiation",
  closing: "stage-closing",
  won: "stage-won",
  lost: "stage-lost",
};

export interface Lead {
  id: string;
  title: string;
  deal_number: string | null;  // D-YYYYMMDD-NNN auto-generated
  stage: LeadStage;
  expected_value: number | null;
  expected_close_date: string | null;
  account_id: string | null;
  contact_id: string | null;
  owner_id: string | null;
  source: string | null;
  flowaccount_quotation_no: string | null;
  flowaccount_quotation_url: string | null;
  lost_reason: string | null;
  b2b_request_id: string | null;
  b2b_quote_number: string | null;
  b2b_data: any | null;
  created_at: string;
  updated_at: string;
}

export interface Account {
  id: string;
  name: string;
  industry: string | null;
}

export interface UserProfile {
  id: string;
  full_name: string | null;
  email?: string | null;   // hydrated server-side via auth.users join
  role: "sales" | "manager" | "admin";
  is_active: boolean;
}
