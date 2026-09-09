CREATE POLICY "Admins read knowledge docs" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'knowledge-docs' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins upload knowledge docs" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'knowledge-docs' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins update knowledge docs" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'knowledge-docs' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins delete knowledge docs" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'knowledge-docs' AND public.has_role(auth.uid(), 'admin'));