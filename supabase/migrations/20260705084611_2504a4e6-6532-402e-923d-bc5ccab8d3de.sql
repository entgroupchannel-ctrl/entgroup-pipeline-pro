DROP POLICY IF EXISTS "service role full access" ON crm.user_profiles;
CREATE POLICY "service role full access" ON crm.user_profiles FOR ALL TO service_role USING (true) WITH CHECK (true);