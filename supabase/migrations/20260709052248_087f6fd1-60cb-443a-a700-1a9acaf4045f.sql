DROP POLICY IF EXISTS "admin can update user_profiles" ON crm.user_profiles;
CREATE POLICY "admin can update user_profiles"
  ON crm.user_profiles
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM crm.user_profiles me
      WHERE me.id = auth.uid() AND me.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM crm.user_profiles me
      WHERE me.id = auth.uid() AND me.role = 'admin'
    )
  );

DROP POLICY IF EXISTS "user can update own profile" ON crm.user_profiles;
CREATE POLICY "user can update own profile"
  ON crm.user_profiles
  FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());