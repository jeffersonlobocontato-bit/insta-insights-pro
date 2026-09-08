-- Prereqs: roles, profiles, updated_at helper
CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'user');

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TABLE public.profiles (
  id UUID PRIMARY KEY,
  email TEXT,
  display_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own roles" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

-- New signups get a profile; the very first user becomes admin, others get 'user'
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, display_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data ->> 'display_name', split_part(NEW.email, '@', 1)))
  ON CONFLICT (id) DO NOTHING;

  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin') THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin') ON CONFLICT DO NOTHING;
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user') ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Fontes RSS
CREATE TABLE public.instagram_trend_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  last_fetch_status TEXT,
  last_fetch_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.instagram_trend_sources TO authenticated;
GRANT ALL ON public.instagram_trend_sources TO service_role;
ALTER TABLE public.instagram_trend_sources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage instagram trend sources"
  ON public.instagram_trend_sources FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Runs
CREATE TABLE public.instagram_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_date DATE NOT NULL DEFAULT CURRENT_DATE,
  status TEXT NOT NULL DEFAULT 'researching'
    CHECK (status IN ('researching', 'drafting', 'pending_review', 'failed')),
  topic_title TEXT,
  topic_summary TEXT,
  topic_sources JSONB NOT NULL DEFAULT '[]'::jsonb,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.instagram_runs TO authenticated;
GRANT ALL ON public.instagram_runs TO service_role;
ALTER TABLE public.instagram_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can view instagram runs"
  ON public.instagram_runs FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE INDEX idx_instagram_runs_date ON public.instagram_runs(run_date DESC);
CREATE TRIGGER update_instagram_runs_updated_at BEFORE UPDATE ON public.instagram_runs
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Criativos
CREATE TABLE public.instagram_creatives (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES public.instagram_runs(id) ON DELETE CASCADE,
  format TEXT NOT NULL CHECK (format IN ('card', 'carousel', 'story')),
  caption TEXT,
  hashtags TEXT[] NOT NULL DEFAULT '{}',
  slides JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending_review'
    CHECK (status IN ('pending_review', 'approved', 'rejected')),
  final_image_urls TEXT[] NOT NULL DEFAULT '{}',
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.instagram_creatives TO authenticated;
GRANT ALL ON public.instagram_creatives TO service_role;
ALTER TABLE public.instagram_creatives ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage instagram creatives"
  ON public.instagram_creatives FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE INDEX idx_instagram_creatives_run ON public.instagram_creatives(run_id);
CREATE INDEX idx_instagram_creatives_status ON public.instagram_creatives(status) WHERE status = 'pending_review';
CREATE TRIGGER update_instagram_creatives_updated_at BEFORE UPDATE ON public.instagram_creatives
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.instagram_trend_sources (name, url) VALUES
  ('TechCrunch — IA', 'https://techcrunch.com/category/artificial-intelligence/feed/'),
  ('MIT Technology Review — IA', 'https://www.technologyreview.com/topic/artificial-intelligence/feed'),
  ('Marketing Dive', 'https://www.marketingdive.com/feeds/news/'),
  ('Startups.com.br', 'https://startups.com.br/feed/');