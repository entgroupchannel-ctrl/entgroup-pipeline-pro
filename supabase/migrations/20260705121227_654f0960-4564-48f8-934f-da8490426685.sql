CREATE TABLE IF NOT EXISTS crm.role_permissions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action       text NOT NULL,
  role         text NOT NULL CHECK (role IN ('sales','manager','admin')),
  allowed      boolean NOT NULL DEFAULT false,
  require_approval boolean NOT NULL DEFAULT false,
  require_reason   boolean NOT NULL DEFAULT false,
  updated_at   timestamptz DEFAULT now(),
  updated_by   uuid REFERENCES auth.users(id),
  UNIQUE(action, role)
);

ALTER TABLE crm.role_permissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth users read permissions"
  ON crm.role_permissions FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "admin manage permissions"
  ON crm.role_permissions FOR ALL USING (
    EXISTS (SELECT 1 FROM crm.user_profiles WHERE id = auth.uid() AND role = 'admin')
  );

INSERT INTO crm.role_permissions (action, role, allowed, require_approval, require_reason) VALUES
  ('lead.create',       'sales',   true,  false, false),
  ('lead.create',       'manager', true,  false, false),
  ('lead.create',       'admin',   true,  false, false),
  ('lead.edit',         'sales',   true,  false, false),
  ('lead.edit',         'manager', true,  false, false),
  ('lead.edit',         'admin',   true,  false, false),
  ('stage.advance',     'sales',   true,  false, false),
  ('stage.advance',     'manager', true,  false, false),
  ('stage.advance',     'admin',   true,  false, false),
  ('stage.backward',    'sales',   false, true,  true),
  ('stage.backward',    'manager', true,  false, true),
  ('stage.backward',    'admin',   true,  false, false),
  ('lead.close',        'sales',   true,  false, false),
  ('lead.close',        'manager', true,  false, false),
  ('lead.close',        'admin',   true,  false, false),
  ('lead.delete',       'sales',   false, false, false),
  ('lead.delete',       'manager', false, true,  true),
  ('lead.delete',       'admin',   true,  false, true),
  ('activity.create',   'sales',   true,  false, false),
  ('activity.create',   'manager', true,  false, false),
  ('activity.create',   'admin',   true,  false, false),
  ('activity.delete',   'sales',   false, false, false),
  ('activity.delete',   'manager', true,  false, false),
  ('activity.delete',   'admin',   true,  false, false),
  ('quotation.create',  'sales',   true,  false, false),
  ('quotation.create',  'manager', true,  false, false),
  ('quotation.create',  'admin',   true,  false, false),
  ('quotation.delete',  'sales',   false, false, false),
  ('quotation.delete',  'manager', false, true,  true),
  ('quotation.delete',  'admin',   true,  false, true),
  ('account.create',    'sales',   true,  false, false),
  ('account.create',    'manager', true,  false, false),
  ('account.create',    'admin',   true,  false, false),
  ('account.delete',    'sales',   false, false, false),
  ('account.delete',    'manager', false, true,  true),
  ('account.delete',    'admin',   true,  false, true),
  ('stage_request.review',  'sales',   false, false, false),
  ('stage_request.review',  'manager', true,  false, false),
  ('stage_request.review',  'admin',   true,  false, false),
  ('delete_request.review', 'sales',   false, false, false),
  ('delete_request.review', 'manager', false, false, false),
  ('delete_request.review', 'admin',   true,  false, false)
ON CONFLICT (action, role) DO NOTHING;