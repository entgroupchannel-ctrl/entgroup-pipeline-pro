ALTER TABLE crm.integrations
  ADD COLUMN IF NOT EXISTS claude_api_key      text,
  ADD COLUMN IF NOT EXISTS ai_model            text,
  ADD COLUMN IF NOT EXISTS email_draft_enabled boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS max_tokens          integer DEFAULT 1000;