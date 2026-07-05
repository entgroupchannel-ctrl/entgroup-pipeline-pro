ALTER TABLE crm.accounts ADD COLUMN IF NOT EXISTS registered_capital numeric(15,2) DEFAULT NULL;
COMMENT ON COLUMN crm.accounts.registered_capital IS 'ทุนจดทะเบียน (บาท)';