CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE public.knowledge_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  doc_type TEXT NOT NULL DEFAULT 'brand_manual',
  source_type TEXT NOT NULL DEFAULT 'upload',
  storage_path TEXT,
  mime TEXT,
  bytes INTEGER NOT NULL DEFAULT 0,
  char_count INTEGER NOT NULL DEFAULT 0,
  raw_text TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  error_message TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  preset_id UUID REFERENCES public.agent_presets(id) ON DELETE SET NULL,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.knowledge_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES public.knowledge_documents(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL DEFAULT 0,
  content TEXT NOT NULL,
  embedding vector(3072),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX knowledge_chunks_document_idx ON public.knowledge_chunks(document_id);
CREATE INDEX knowledge_chunks_embedding_idx ON public.knowledge_chunks USING hnsw ((embedding::halfvec(3072)) halfvec_cosine_ops);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.knowledge_documents TO authenticated;
GRANT ALL ON public.knowledge_documents TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.knowledge_chunks TO authenticated;
GRANT ALL ON public.knowledge_chunks TO service_role;

ALTER TABLE public.knowledge_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_chunks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage knowledge documents" ON public.knowledge_documents
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage knowledge chunks" ON public.knowledge_chunks
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_knowledge_documents_updated_at
  BEFORE UPDATE ON public.knowledge_documents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.match_knowledge_chunks(
  query_embedding vector(3072),
  match_count INT DEFAULT 8,
  filter_doc_types TEXT[] DEFAULT NULL,
  filter_preset UUID DEFAULT NULL
)
RETURNS TABLE (
  chunk_id UUID,
  document_id UUID,
  title TEXT,
  doc_type TEXT,
  content TEXT,
  similarity FLOAT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    c.id,
    d.id,
    d.title,
    d.doc_type,
    c.content,
    1 - (c.embedding::halfvec(3072) <=> query_embedding::halfvec(3072)) AS similarity
  FROM public.knowledge_chunks c
  JOIN public.knowledge_documents d ON d.id = c.document_id
  WHERE d.active
    AND d.status = 'ready'
    AND c.embedding IS NOT NULL
    AND (filter_doc_types IS NULL OR d.doc_type = ANY(filter_doc_types))
    AND (filter_preset IS NULL OR d.preset_id IS NULL OR d.preset_id = filter_preset)
  ORDER BY c.embedding::halfvec(3072) <=> query_embedding::halfvec(3072)
  LIMIT match_count;
$$;

REVOKE ALL ON FUNCTION public.match_knowledge_chunks(vector, INT, TEXT[], UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.match_knowledge_chunks(vector, INT, TEXT[], UUID) TO authenticated, service_role;