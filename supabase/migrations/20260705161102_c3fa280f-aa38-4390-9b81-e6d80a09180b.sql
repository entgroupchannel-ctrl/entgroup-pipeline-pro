
CREATE TABLE IF NOT EXISTS crm.email_send_log (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_email     text NOT NULL,
  template_name       text,
  subject             text,
  status              text NOT NULL DEFAULT 'sent',
  provider_message_id text,
  error_message       text,
  related_id          uuid,
  related_type        text,
  triggered_by        uuid,
  metadata            jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at          timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON crm.email_send_log TO authenticated;
GRANT ALL ON crm.email_send_log TO service_role;

CREATE INDEX IF NOT EXISTS email_send_log_created_at_idx  ON crm.email_send_log (created_at DESC);
CREATE INDEX IF NOT EXISTS email_send_log_recipient_idx   ON crm.email_send_log (recipient_email);
CREATE INDEX IF NOT EXISTS email_send_log_related_idx     ON crm.email_send_log (related_type, related_id);
CREATE INDEX IF NOT EXISTS email_send_log_triggered_by_idx ON crm.email_send_log (triggered_by);

ALTER TABLE crm.email_send_log ENABLE ROW LEVEL SECURITY;

-- Admin/Manager see all; sales see own
CREATE POLICY "email_log_select_admin_manager"
  ON crm.email_send_log FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM crm.user_profiles up
      WHERE up.id = auth.uid()
        AND up.role IN ('admin','manager')
    )
  );

CREATE POLICY "email_log_select_own"
  ON crm.email_send_log FOR SELECT
  TO authenticated
  USING (triggered_by = auth.uid());

CREATE POLICY "email_log_insert_own"
  ON crm.email_send_log FOR INSERT
  TO authenticated
  WITH CHECK (triggered_by = auth.uid());
