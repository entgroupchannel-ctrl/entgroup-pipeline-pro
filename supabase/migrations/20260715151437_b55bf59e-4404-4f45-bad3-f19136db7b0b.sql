
-- Drop overly-permissive policies on email-attachments bucket
DROP POLICY IF EXISTS "public can read email-attachments" ON storage.objects;
DROP POLICY IF EXISTS "authenticated users can upload" ON storage.objects;
DROP POLICY IF EXISTS "authenticated users can delete" ON storage.objects;

-- SELECT: only authenticated users may read (signed URLs still work server-side)
CREATE POLICY "email_attachments_auth_read"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'email-attachments');

-- INSERT: authenticated users, must be owner
CREATE POLICY "email_attachments_owner_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'email-attachments' AND owner = auth.uid());

-- UPDATE: only owner
CREATE POLICY "email_attachments_owner_update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'email-attachments' AND owner = auth.uid())
  WITH CHECK (bucket_id = 'email-attachments' AND owner = auth.uid());

-- DELETE: only owner
CREATE POLICY "email_attachments_owner_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'email-attachments' AND owner = auth.uid());
