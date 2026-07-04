
CREATE OR REPLACE VIEW crm.flowaccount_documents AS
SELECT
  id,
  document_serial,
  document_type,
  contact_name,
  contact_id,
  grand_total,
  published_on,
  status_string,
  sales_name,
  sales_email,
  raw_data,
  processed_at,
  created_rfq_id,
  created_at
FROM public.po_flowaccount_inbound;

GRANT SELECT ON crm.flowaccount_documents TO authenticated;
