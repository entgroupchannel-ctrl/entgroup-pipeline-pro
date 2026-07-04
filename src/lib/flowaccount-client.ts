// Phase 2: reads from crm.fa_documents (synced from FA API directly).
// Phase 1 read from crm.flowaccount_documents view — this file is the only thing that changed.

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
  synced_at: string;
  created_at: string;
  // Phase 1 compat field (always null in Phase 2)
  created_rfq_id: string | null;
}

export async function fetchFADocuments(): Promise<FADocument[]> {
  const { data, error } = await crmDb()
    .from("fa_documents")
    .select("*")
    .order("published_on", { ascending: false, nullsFirst: false })
    .limit(500);
  if (error) throw new Error(error.message);
  // add compat field
  return ((data ?? []) as any[]).map((d) => ({ ...d, created_rfq_id: null })) as FADocument[];
}

export async function fetchFADocument(id: string): Promise<FADocument | null> {
  const { data, error } = await crmDb()
    .from("fa_documents")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) return null;
  if (!data) return null;
  return { ...(data as any), created_rfq_id: null } as FADocument;
}

export async function fetchFALastSync(): Promise<string | null> {
  const { data } = await crmDb()
    .from("fa_documents")
    .select("synced_at")
    .order("synced_at", { ascending: false })
    .limit(1);
  const row = (data ?? [])[0] as { synced_at?: string } | undefined;
  return row?.synced_at ?? null;
}
