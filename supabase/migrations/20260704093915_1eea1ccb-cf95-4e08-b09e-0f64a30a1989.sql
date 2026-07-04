
CREATE OR REPLACE FUNCTION public.is_po_staff(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.po_user_roles WHERE user_id = _user_id) $$;
REVOKE EXECUTE ON FUNCTION public.is_po_staff(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_po_staff(uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS po_docs_select_all ON public.po_documents;
CREATE POLICY po_docs_select_staff ON public.po_documents FOR SELECT TO authenticated USING (public.is_po_staff(auth.uid()));

DROP POLICY IF EXISTS po_email_log_select ON public.po_email_log;
CREATE POLICY po_email_log_select_staff ON public.po_email_log FOR SELECT TO authenticated USING (public.is_po_staff(auth.uid()));

DROP POLICY IF EXISTS "authenticated can read factory products" ON public.po_factory_products;
DROP POLICY IF EXISTS factory_products_select ON public.po_factory_products;
CREATE POLICY factory_products_select_staff ON public.po_factory_products FOR SELECT TO authenticated USING (public.is_po_staff(auth.uid()));

DROP POLICY IF EXISTS po_goods_select_all ON public.po_goods_received;
CREATE POLICY po_goods_select_staff ON public.po_goods_received FOR SELECT TO authenticated USING (public.is_po_staff(auth.uid()));

DROP POLICY IF EXISTS transfer_items_select ON public.po_transfer_plan_items;
CREATE POLICY transfer_items_select_staff ON public.po_transfer_plan_items FOR SELECT TO authenticated USING (public.is_po_staff(auth.uid()));

DROP POLICY IF EXISTS salespersons_select_all ON public.po_salespersons;
CREATE POLICY salespersons_select_staff ON public.po_salespersons FOR SELECT TO authenticated USING (public.is_po_staff(auth.uid()));

DROP POLICY IF EXISTS addon_select_all ON public.po_addon_items;
CREATE POLICY addon_select_staff ON public.po_addon_items FOR SELECT TO authenticated USING (public.is_po_staff(auth.uid()));

DROP POLICY IF EXISTS approval_rules_select ON public.po_approval_rules;
CREATE POLICY approval_rules_select_staff ON public.po_approval_rules FOR SELECT TO authenticated USING (public.is_po_staff(auth.uid()));

DROP POLICY IF EXISTS po_rates_select_all ON public.po_exchange_rates;
CREATE POLICY po_rates_select_staff ON public.po_exchange_rates FOR SELECT TO authenticated USING (public.is_po_staff(auth.uid()));

DROP POLICY IF EXISTS groups_select_all ON public.po_shipment_groups;
CREATE POLICY groups_select_staff ON public.po_shipment_groups FOR SELECT TO authenticated USING (public.is_po_staff(auth.uid()));

DROP POLICY IF EXISTS timeline_select_all ON public.po_shipment_timeline;
CREATE POLICY timeline_select_staff ON public.po_shipment_timeline FOR SELECT TO authenticated USING (public.is_po_staff(auth.uid()));

DROP POLICY IF EXISTS "All authenticated can read settings" ON public.po_system_settings;
CREATE POLICY po_settings_select_staff ON public.po_system_settings FOR SELECT TO authenticated USING (public.is_po_staff(auth.uid()));

DROP POLICY IF EXISTS po_log_insert_any ON public.po_activity_log;
CREATE POLICY po_log_insert_staff ON public.po_activity_log FOR INSERT TO authenticated
WITH CHECK (public.is_po_staff(auth.uid()) AND user_id = auth.uid());

REVOKE SELECT ON public.blog_likes FROM anon, authenticated;
GRANT SELECT (id, post_slug, created_at) ON public.blog_likes TO anon, authenticated;
GRANT ALL ON public.blog_likes TO service_role;

ALTER VIEW public.po_rfq_quotes_status_only SET (security_invoker = true);
ALTER VIEW public.v_po_users_admin SET (security_invoker = true);
ALTER VIEW public.po_orders_sales_view SET (security_invoker = true);
ALTER VIEW public.v_po_with_aging SET (security_invoker = true);
ALTER VIEW public.v_po_summary SET (security_invoker = true);
ALTER VIEW public.v_po_monthly_transfers SET (security_invoker = true);
ALTER VIEW public.affiliates_public SET (security_invoker = true);

ALTER FUNCTION public.is_floworder_user() SET search_path = public;
ALTER FUNCTION public.check_floworder_access() SET search_path = public;
ALTER FUNCTION public.guard_po_user_roles_insert() SET search_path = public;
ALTER FUNCTION public.get_users_with_roles() SET search_path = public;
ALTER FUNCTION public.log_user_audit(text, uuid, text, text, jsonb) SET search_path = public;
ALTER FUNCTION public.log_user_audit(uuid, uuid, text, jsonb) SET search_path = public;
ALTER FUNCTION public.handle_user_login() SET search_path = public;
ALTER FUNCTION public.generate_rfq_no() SET search_path = public;
ALTER FUNCTION public.po_handle_new_user() SET search_path = public;
ALTER FUNCTION public.search_factories_by_product(text) SET search_path = public;
ALTER FUNCTION public.log_price_request_changes() SET search_path = public;
ALTER FUNCTION public.log_price_request_insert() SET search_path = public;

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    LEFT JOIN pg_depend d ON d.objid = p.oid AND d.deptype = 'e'
    WHERE n.nspname = 'public' AND p.prosecdef = true AND d.objid IS NULL
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon, PUBLIC', r.sig);
  END LOOP;
END$$;

DROP POLICY IF EXISTS "Public read documents bucket" ON storage.objects;
DROP POLICY IF EXISTS "Public read product images" ON storage.objects;
DROP POLICY IF EXISTS "Product images are publicly accessible" ON storage.objects;
DROP POLICY IF EXISTS avatars_read_public ON storage.objects;
DROP POLICY IF EXISTS company_assets_read_all ON storage.objects;

CREATE POLICY "documents_list_authenticated" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'documents');
CREATE POLICY "product_images_list_authenticated" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'product-images');
CREATE POLICY "avatars_list_authenticated" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'avatars');
CREATE POLICY "company_assets_list_authenticated" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'company-assets');
CREATE POLICY "datasheets_list_authenticated" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'datasheets');
