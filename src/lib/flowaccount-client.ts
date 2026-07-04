import { crmDb } from "./crm";

export interface FADocument {
  id: string;
  document_serial: string;
  document_type: "quotation" | "billing_note";
  contact_name: string | null;
  contact_id: number | null;
  grand_total: number | null;
  published_on: string | null;
  status_string: string | null;
  sales_name: string | null;
  sales_email: string | null;
  raw_data: any;
  created_rfq_id: string | null;
  created_at: string;
}

// Phase 1: read from crm.flowaccount_documents view (mirrors floworder inbound).
// Phase 2: swap this file to call the FlowAccount API directly — no other file changes needed.
export async function fetchFADocuments(): Promise<FADocument[]> {
  const { data, error } = await crmDb()
    .from("flowaccount_documents")
    .select("*")
    .order("published_on", { ascending: false, nullsFirst: false })
    .limit(500);
  if (error) throw new Error(error.message);
  return (data ?? []) as FADocument[];
}

export async function fetchFADocument(id: string): Promise<FADocument | null> {
  const { data, error } = await crmDb()
    .from("flowaccount_documents")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) return null;
  return (data as FADocument | null) ?? null;
}

export async function fetchFALastSync(): Promise<string | null> {
  const { data } = await crmDb()
    .from("flowaccount_documents")
    .select("created_at")
    .order("created_at", { ascending: false })
    .limit(1);
  const row = (data ?? [])[0] as { created_at?: string } | undefined;
  return row?.created_at ?? null;
}
