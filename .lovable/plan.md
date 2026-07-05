## Problem
The AI Settings tab writes to `crm.integrations` (id=`claude_ai`) using 4 columns that don't exist yet: `claude_api_key`, `ai_model`, `email_draft_enabled`, `max_tokens`.

## Fix
Single migration adding the missing columns to `crm.integrations`:

```sql
ALTER TABLE crm.integrations
  ADD COLUMN IF NOT EXISTS claude_api_key      text,
  ADD COLUMN IF NOT EXISTS ai_model            text,
  ADD COLUMN IF NOT EXISTS email_draft_enabled boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS max_tokens          integer DEFAULT 1000;
```

No code changes needed — existing `ai-settings.functions.ts` and `lead-email.functions.ts` already reference these columns correctly.