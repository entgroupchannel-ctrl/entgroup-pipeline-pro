
-- Fix po_buckets_overly_broad_storage_access: restrict to po_staff
DROP POLICY IF EXISTS po_buckets_select ON storage.objects;
DROP POLICY IF EXISTS po_buckets_insert ON storage.objects;
DROP POLICY IF EXISTS po_buckets_update ON storage.objects;
DROP POLICY IF EXISTS po_buckets_delete ON storage.objects;

CREATE POLICY po_buckets_select ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = ANY (ARRAY['po-documents','transfer-slips','goods-photos']) AND public.is_po_staff(auth.uid()));

CREATE POLICY po_buckets_insert ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = ANY (ARRAY['po-documents','transfer-slips','goods-photos']) AND public.is_po_staff(auth.uid()));

CREATE POLICY po_buckets_update ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = ANY (ARRAY['po-documents','transfer-slips','goods-photos']) AND public.is_po_staff(auth.uid()))
WITH CHECK (bucket_id = ANY (ARRAY['po-documents','transfer-slips','goods-photos']) AND public.is_po_staff(auth.uid()));

CREATE POLICY po_buckets_delete ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = ANY (ARRAY['po-documents','transfer-slips','goods-photos']) AND public.is_po_staff(auth.uid()));

-- Fix rfq_quotes_bucket_broad_access
DROP POLICY IF EXISTS rfq_quotes_auth_rw ON storage.objects;
CREATE POLICY rfq_quotes_staff_rw ON storage.objects FOR ALL TO authenticated
USING (bucket_id = 'rfq-quotes' AND public.is_po_staff(auth.uid()))
WITH CHECK (bucket_id = 'rfq-quotes' AND public.is_po_staff(auth.uid()));

-- Fix quote_files_insert: require ownership or staff on quote_id
DROP POLICY IF EXISTS quote_files_insert ON public.quote_files;
CREATE POLICY quote_files_insert ON public.quote_files FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.quote_requests qr
    WHERE qr.id = quote_files.quote_id
      AND (
        qr.customer_email = (SELECT u.email FROM public.users u WHERE u.id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role::text = ANY(ARRAY['super_admin','admin','sales']))
      )
  )
);

-- Fix quote_messages_insert: same ownership check
DROP POLICY IF EXISTS quote_messages_insert ON public.quote_messages;
CREATE POLICY quote_messages_insert ON public.quote_messages FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.quote_requests qr
    WHERE qr.id = quote_messages.quote_id
      AND (
        qr.customer_email = (SELECT u.email FROM public.users u WHERE u.id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role::text = ANY(ARRAY['super_admin','admin','sales']))
      )
  )
);

-- Fix storage: "Authenticated users can upload quote files" (broad insert into quote-files bucket)
DROP POLICY IF EXISTS "Authenticated users can upload quote files" ON storage.objects;
CREATE POLICY "Authenticated users can upload quote files" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'quote-files' AND (
    -- staff can upload anywhere in this bucket
    EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role::text = ANY(ARRAY['super_admin','admin','sales']))
    -- customers can upload under a folder matching a quote they own
    OR EXISTS (
      SELECT 1 FROM public.quote_requests qr
      JOIN public.users u ON u.email = qr.customer_email
      WHERE u.id = auth.uid()
        AND (storage.foldername(name))[1] = qr.id::text
    )
  )
);

-- Fix career_attachments_anon_upload: constrain to a specific folder pattern and reasonable name length
DROP POLICY IF EXISTS "Anon can upload career attachments" ON storage.objects;
CREATE POLICY "Anon can upload career attachments" ON storage.objects FOR INSERT TO anon, authenticated
WITH CHECK (
  bucket_id = 'career-attachments'
  AND (storage.foldername(name))[1] = 'applications'
  AND length(name) < 512
);

-- Fix documents_bucket_chat_attachments_public_write: require authenticated + chat session folder
DROP POLICY IF EXISTS "Anyone can upload chat attachments" ON storage.objects;
CREATE POLICY "Authenticated can upload chat attachments" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'documents'
  AND (storage.foldername(name))[1] = 'chat-attachments'
  AND length(name) < 512
);

-- Fix signage_leads_anon_upload_quote_files: tighten path + size
DROP POLICY IF EXISTS "Anon can upload signage lead files" ON storage.objects;
CREATE POLICY "Anon can upload signage lead files" ON storage.objects FOR INSERT TO anon
WITH CHECK (
  bucket_id = 'quote-files'
  AND (storage.foldername(name))[1] = 'signage-leads'
  AND array_length(storage.foldername(name), 1) >= 2
  AND length(name) < 512
);

-- Fix SUPA_public_bucket_allows_listing: drop broad list policies on public buckets
DROP POLICY IF EXISTS avatars_list_authenticated ON storage.objects;
DROP POLICY IF EXISTS company_assets_list_authenticated ON storage.objects;
DROP POLICY IF EXISTS datasheets_list_authenticated ON storage.objects;
DROP POLICY IF EXISTS documents_list_authenticated ON storage.objects;
DROP POLICY IF EXISTS product_images_list_authenticated ON storage.objects;
