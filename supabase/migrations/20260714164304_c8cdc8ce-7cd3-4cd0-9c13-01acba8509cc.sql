ALTER TABLE crm.leads ADD COLUMN IF NOT EXISTS line_user_id TEXT;
COMMENT ON COLUMN crm.leads.line_user_id IS 'LINE userId (Uxxxxxxxx) สำหรับ Push Message — ได้มาจาก webhook event';
CREATE INDEX IF NOT EXISTS idx_crm_leads_line_user_id ON crm.leads(line_user_id) WHERE line_user_id IS NOT NULL;
NOTIFY pgrst, 'reload schema';