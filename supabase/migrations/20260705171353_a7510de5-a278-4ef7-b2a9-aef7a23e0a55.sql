-- Custom events table — วันสำคัญที่ user เพิ่มเองบนปฏิทิน
CREATE TABLE IF NOT EXISTS crm.custom_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title       text NOT NULL,
  event_date  date NOT NULL,
  event_type  text NOT NULL DEFAULT 'custom',
  description text,
  account_id  uuid REFERENCES crm.accounts(id) ON DELETE SET NULL,
  is_recurring boolean NOT NULL DEFAULT false,
  color       text DEFAULT '#185FA5',
  created_by  uuid REFERENCES auth.users(id),
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON crm.custom_events TO authenticated;
GRANT ALL ON crm.custom_events TO service_role;

ALTER TABLE crm.custom_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "all authenticated can read custom events"
  ON crm.custom_events FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "users can manage own custom events"
  ON crm.custom_events FOR ALL
  TO authenticated
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "admin can manage all custom events"
  ON crm.custom_events FOR ALL
  TO authenticated
  USING (EXISTS (SELECT 1 FROM crm.user_profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM crm.user_profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE INDEX IF NOT EXISTS idx_custom_events_date ON crm.custom_events(event_date);
CREATE INDEX IF NOT EXISTS idx_custom_events_month ON crm.custom_events(EXTRACT(MONTH FROM event_date), EXTRACT(DAY FROM event_date));