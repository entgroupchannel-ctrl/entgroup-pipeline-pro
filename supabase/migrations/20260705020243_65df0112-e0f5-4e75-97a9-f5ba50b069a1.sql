-- Expose the crm schema through PostgREST so the client can query crm.user_profiles
ALTER ROLE authenticator SET pgrst.db_schemas TO 'public, graphql_public, crm';
GRANT USAGE ON SCHEMA crm TO anon, authenticated, service_role;
GRANT SELECT ON crm.user_profiles TO authenticated;
GRANT ALL ON crm.user_profiles TO service_role;
NOTIFY pgrst, 'reload config';