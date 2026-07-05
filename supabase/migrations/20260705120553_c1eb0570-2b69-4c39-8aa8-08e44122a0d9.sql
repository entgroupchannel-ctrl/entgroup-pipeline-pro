CREATE TABLE IF NOT EXISTS crm.stage_change_requests (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id         uuid NOT NULL REFERENCES crm.leads(id) ON DELETE CASCADE,
  requested_by    uuid NOT NULL REFERENCES auth.users(id),
  from_stage      text NOT NULL,
  to_stage        text NOT NULL,
  reason          text NOT NULL,
  status          text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  reviewed_by     uuid REFERENCES auth.users(id),
  reviewed_at     timestamptz,
  review_note     text,
  created_at      timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS crm.delete_requests (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requested_by    uuid NOT NULL REFERENCES auth.users(id),
  target_type     text NOT NULL CHECK (target_type IN ('lead','quotation','account')),
  target_id       uuid NOT NULL,
  target_label    text,
  reason          text NOT NULL,
  status          text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  reviewed_by     uuid REFERENCES auth.users(id),
  reviewed_at     timestamptz,
  review_note     text,
  created_at      timestamptz DEFAULT now()
);

ALTER TABLE crm.stage_change_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm.delete_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth users can manage stage_change_requests"
  ON crm.stage_change_requests FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "auth users can manage delete_requests"
  ON crm.delete_requests FOR ALL USING (auth.role() = 'authenticated');