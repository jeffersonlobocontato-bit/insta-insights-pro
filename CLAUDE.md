# insta-insights-pro

⚠️ **O nome engana.** Apesar de "insta-insights-pro" / "InstaAnalytics", isso **não** é uma ferramenta de scraping/análise de engajamento do Instagram. É um pipeline de geração de conteúdo por IA para a marca pessoal do Jefferson: busca notícias de IA/marketing em alta (RSS ou uma URL colada), escolhe um tema com uma LLM, gera rascunhos de post pro Instagram (card/carrossel/story — legenda, hashtags, texto de slide), gera ou espelha imagens de fundo, manda pra uma fila de aprovação humana, e publica os aprovados no **LinkedIn** (não existe API de publicação no Instagram). Também rastreia custo de IA por execução (USD/BRL) e tem uma biblioteca RAG de "conhecimento de marca" pra manter tom/design consistentes. Gerenciado via Lovable.

## Stack
Vite + React + TS + shadcn/ui + Tailwind + Supabase (Postgres/Auth/Storage/Edge Functions) + React Query + React Router.

## Drizzle vs Supabase — cuidado
`drizzle-orm`/`drizzle-kit` estão no projeto e `drizzle.config.ts` existe, mas **`drizzle/schema.ts` está intencionalmente vazio** ("auto-generated and intentionally left blank, do not edit") e não há nenhum `import` de `drizzle-orm` em `src/` ou nas edge functions. Drizzle-kit é usado só como organizador dos arquivos de migration SQL (`drizzle/migrations/*.sql`) — **todo acesso real ao banco em runtime é via `@supabase/supabase-js`**, não assuma que dá pra usar o query builder do Drizzle.

## Modelo de dados
- `instagram_trend_sources` (feeds RSS semeados: TechCrunch AI, MIT Tech Review, Marketing Dive, Startups.com.br)
- `instagram_runs` (uma linha por execução, máquina de estado: researching → drafting → pending_review/failed)
- `instagram_creatives` (posts gerados, status pending_review/approved/rejected)
- `ai_usage_events` + colunas de custo em `instagram_runs` (custo por passo, tokens/imagem)
- `agent_presets` (configuração de prompt/modelo/formato, um marcado como default)
- `knowledge_documents`/`knowledge_chunks` (pgvector 3072 dim + índice HNSW — base RAG do manual de marca)
- RLS gateado por `has_role()` em tudo (admin)

## Edge functions
- **`instagram-content-fetch`** — o pipeline principal: busca RSS ou raspa uma URL colada (parsing HTML por regex, sem API real), escolhe tema via tool-call de LLM, espelha imagens de notícia pro storage, puxa contexto do RAG, gera rascunhos + imagens de fundo (Lovable AI Gateway ou OpenAI), loga custo, salva run+creatives
- **`linkedin-publish`** — publica um creative aprovado no LinkedIn via `connector-gateway.lovable.dev/linkedin`, com cadeia de fallback (API moderna → legada → só texto) — **frágil**, vários endpoints/versões hardcoded
- **`knowledge-ingest`** — processa PDF/DOCX/texto enviado em chunks, gera embedding (Gemini), salva em `knowledge_chunks`
- **`knowledge-search`** — embedda a busca, chama RPC `match_knowledge_chunks`
- `_shared/pricing.ts` — tabela de preço por modelo hardcoded (USD→BRL); `_shared/cron-auth.ts` existe mas é **código morto**, `instagram-content-fetch` faz sua própria checagem de `CRON_SECRET` inline

## Páginas
- **`Index.tsx` (`/`) é sobra do scaffold do Lovable** — UI de "adicionar perfil do Instagram" com dado mockado (`Math.random()`), nunca chama o Supabase. Não confundir com a entrada real do produto.
- `Admin.tsx`/`Agent.tsx` (`/admin`, `/agente`) — dispara `instagram-content-fetch`, revisa/aprova creatives, configura `agent_presets`
- `Library.tsx` (`/biblioteca`) — creatives aprovados + publicar no LinkedIn + biblioteca de conhecimento (upload pro RAG)
- `Costs.tsx` (`/custos`) — dashboard de `ai_usage_events`

## Cuidados conhecidos
- "Buscar do Instagram" é na real RSS + regex de HTML/og:image — não é a API do Instagram nem raspa perfis de verdade
- Publicação no LinkedIn é real mas frágil (cadeia de fallback de versão/endpoint hardcoded em `LI_VERSIONS`)
- Sem agendamento/cron visível pra publicação — nenhum `pg_cron` configurado
- Tabela de preço (`pricing.ts`) cai silenciosamente no preço default pra modelo não listado
- Sem testes automatizados no repositório
