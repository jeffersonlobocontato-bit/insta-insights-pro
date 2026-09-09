-- Extrato de custo por rodada
CREATE TABLE public.ai_usage_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid REFERENCES public.instagram_runs(id) ON DELETE CASCADE,
  step text NOT NULL,
  provider text NOT NULL DEFAULT 'lovable',
  model text NOT NULL,
  input_tokens integer NOT NULL DEFAULT 0,
  output_tokens integer NOT NULL DEFAULT 0,
  images integer NOT NULL DEFAULT 0,
  cost_usd numeric(12,6) NOT NULL DEFAULT 0,
  cost_brl numeric(12,4) NOT NULL DEFAULT 0,
  duration_ms integer NOT NULL DEFAULT 0,
  success boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.ai_usage_events TO authenticated;
GRANT ALL ON public.ai_usage_events TO service_role;
ALTER TABLE public.ai_usage_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view ai usage events"
ON public.ai_usage_events FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_ai_usage_events_run ON public.ai_usage_events(run_id);
CREATE INDEX idx_ai_usage_events_created ON public.ai_usage_events(created_at DESC);

-- Totais agregados na rodada
ALTER TABLE public.instagram_runs
  ADD COLUMN cost_usd numeric(12,6) NOT NULL DEFAULT 0,
  ADD COLUMN cost_brl numeric(12,4) NOT NULL DEFAULT 0,
  ADD COLUMN tokens_total integer NOT NULL DEFAULT 0,
  ADD COLUMN image_count integer NOT NULL DEFAULT 0,
  ADD COLUMN preset_id uuid;

-- Presets do agente
CREATE TABLE public.agent_presets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  instructions text NOT NULL DEFAULT '',
  provider text NOT NULL DEFAULT 'lovable',
  text_model text NOT NULL DEFAULT 'google/gemini-3.8-flash',
  image_model text NOT NULL DEFAULT 'google/gemini-3.1-flash-image',
  formats text[] NOT NULL DEFAULT ARRAY['card','carousel','story']::text[],
  carousel_slides integer NOT NULL DEFAULT 4,
  image_budget integer NOT NULL DEFAULT 6,
  is_default boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_presets TO authenticated;
GRANT ALL ON public.agent_presets TO service_role;
ALTER TABLE public.agent_presets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage agent presets"
ON public.agent_presets FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_agent_presets_updated_at
BEFORE UPDATE ON public.agent_presets
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE UNIQUE INDEX idx_agent_presets_single_default ON public.agent_presets(is_default) WHERE is_default;

INSERT INTO public.agent_presets (name, instructions, is_default)
VALUES (
  'Padrão Jefferson Lobo',
  'Você cria conteúdo de Instagram para a marca pessoal de Jefferson Lobo — head executivo de marketing, consultor em IA e palestrante. Tom direto, autoral e profissional, em português do Brasil, sem emojis nos títulos. A identidade visual é fundo petróleo (#12201E), texto papel (#F2EEE4) e destaque âmbar (#E29F65), com títulos em serifa e rótulos em monoespaçada caixa alta.',
  true
);