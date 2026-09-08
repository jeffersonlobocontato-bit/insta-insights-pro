CREATE POLICY "Admins read instagram creatives"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'instagram-creatives' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins upload instagram creatives"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'instagram-creatives' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins update instagram creatives"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'instagram-creatives' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins delete instagram creatives"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'instagram-creatives' AND public.has_role(auth.uid(), 'admin'));