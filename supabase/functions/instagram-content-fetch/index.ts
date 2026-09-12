import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import { createClient } from 'npm:@supabase/supabase-js@2'
import { textCostUsd, imageCostUsd, toBrl } from '../_shared/pricing.ts'
import { embedTexts, toVectorLiteral, EMBEDDING_MODEL } from '../_shared/knowledge.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY')!
const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY')
const CRON_SECRET = Deno.env.get('LOVABLE_CRON_SECRET')

const admin = createClient(SUPABASE_URL, SERVICE_KEY)

type Preset = {
  id: string
  name: string
  instructions: string
  provider: string
  text_model: string
  image_model: string
  formats: string[]
  carousel_slides: number
  image_budget: number
}

const FALLBACK_PRESET: Preset = {
  id: '',
  name: 'Padrão',
  instructions: '',
  provider: 'lovable',
  text_model: 'google/gemini-3.8-flash',
  image_model: 'google/gemini-3.1-flash-image',
  formats: ['card', 'carousel', 'story'],
  carousel_slides: 4,
  image_budget: 6,
}

type Ctx = {
  runId: string | null
  preset: Preset
  totals: { usd: number; brl: number; tokens: number; images: number }
}

function endpoint(preset: Preset, path: string) {
  const useOpenAI = preset.provider === 'openai' && OPENAI_API_KEY
  return useOpenAI ? `https://api.openai.com/v1${path}` : `https://ai.gateway.lovable.dev/v1${path}`
}

function apiKey(preset: Preset) {
  return preset.provider === 'openai' && OPENAI_API_KEY ? OPENAI_API_KEY : LOVABLE_API_KEY
}

async function logUsage(
  ctx: Ctx,
  entry: {
    step: string
    model: string
    input_tokens?: number
    output_tokens?: number
    images?: number
    cost_usd: number
    duration_ms: number
    success?: boolean
  },
) {
  const cost_brl = toBrl(entry.cost_usd)
  ctx.totals.usd += entry.cost_usd
  ctx.totals.brl += cost_brl
  ctx.totals.tokens += (entry.input_tokens ?? 0) + (entry.output_tokens ?? 0)
  ctx.totals.images += entry.images ?? 0
  try {
    await admin.from('ai_usage_events').insert({
      run_id: ctx.runId,
      step: entry.step,
      provider: ctx.preset.provider === 'openai' && OPENAI_API_KEY ? 'openai' : 'lovable',
      model: entry.model,
      input_tokens: entry.input_tokens ?? 0,
      output_tokens: entry.output_tokens ?? 0,
      images: entry.images ?? 0,
      cost_usd: Number(entry.cost_usd.toFixed(6)),
      cost_brl: Number(cost_brl.toFixed(4)),
      duration_ms: entry.duration_ms,
      success: entry.success ?? true,
    })
  } catch {
    // registro de custo nunca derruba a rodada
  }
}


type Slide = {
  order: number
  headline: string
  body: string
  kicker?: string
  emphasis?: string
  image_prompt: string
  image_url?: string
  source_name?: string
  source_link?: string
}

type CreativeDraft = {
  format: 'card' | 'carousel' | 'story'
  caption: string
  hashtags: string[]
  slides: Slide[]
}

type Headline = {
  source: string
  title: string
  summary: string
  link?: string
  image?: string
}

function stripTags(s: string) {
  return s.replace(/<!\[CDATA\[|\]\]>/g, '').replace(/<[^>]+>/g, '').trim()
}

function decodeEntities(s: string) {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
}

/** Imagem pública divulgada no próprio item da notícia. */
function extractItemImage(block: string): string | undefined {
  const candidates = [
    block.match(/<media:content[^>]+url=["']([^"']+)["']/i)?.[1],
    block.match(/<media:thumbnail[^>]+url=["']([^"']+)["']/i)?.[1],
    block.match(/<enclosure[^>]+url=["']([^"']+)["'][^>]*type=["']image\//i)?.[1],
    block.match(/<enclosure[^>]+type=["']image\/[^"']*["'][^>]*url=["']([^"']+)["']/i)?.[1],
    block.match(/<img[^>]+src=["']([^"']+)["']/i)?.[1],
  ].filter(Boolean) as string[]
  const url = candidates.find((u) => /^https?:\/\//i.test(u))
  return url ? decodeEntities(url) : undefined
}

function parseFeed(xml: string, limit = 8) {
  const items: { title: string; summary: string; link?: string; image?: string }[] = []
  const blocks = xml.split(/<item[\s>]|<entry[\s>]/).slice(1)
  for (const block of blocks.slice(0, limit)) {
    const title = block.match(/<title[^>]*>([\s\S]*?)<\/title>/)?.[1]
    const desc =
      block.match(/<description[^>]*>([\s\S]*?)<\/description>/)?.[1] ??
      block.match(/<summary[^>]*>([\s\S]*?)<\/summary>/)?.[1] ??
      ''
    const link =
      block.match(/<link[^>]*>([\s\S]*?)<\/link>/)?.[1]?.trim() ??
      block.match(/<link[^>]+href=["']([^"']+)["']/i)?.[1]
    if (title) {
      items.push({
        title: stripTags(title),
        summary: stripTags(desc).slice(0, 300),
        link: link ? decodeEntities(stripTags(link)) : undefined,
        image: extractItemImage(block) ?? extractItemImage(desc),
      })
    }
  }
  return items
}

/** Fallback: og:image da página da notícia. */
async function fetchOgImage(url: string): Promise<string | undefined> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ContentBot/1.0)' },
      signal: AbortSignal.timeout(12000),
    })
    if (!res.ok) return undefined
    const html = (await res.text()).slice(0, 200000)
    const og =
      html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)?.[1] ??
      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i)?.[1] ??
      html.match(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i)?.[1]
    return og && /^https?:\/\//i.test(og) ? decodeEntities(og) : undefined
  } catch {
    return undefined
  }
}

/** Lê uma página de notícia colada manualmente: título, texto e imagem pública. */
async function fetchArticle(url: string): Promise<{ title: string; summary: string; link: string; image?: string }> {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ContentBot/1.0)' },
    signal: AbortSignal.timeout(20000),
  })
  if (!res.ok) throw new Error(`Não consegui abrir o link (HTTP ${res.status}).`)
  const html = (await res.text()).slice(0, 400000)

  const meta = (re: RegExp) => html.match(re)?.[1]
  const title =
    meta(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i) ??
    meta(/<title[^>]*>([\s\S]*?)<\/title>/i) ??
    url
  const description =
    meta(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i) ??
    meta(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i) ??
    ''
  const image =
    meta(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ??
    meta(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i)

  const bodyHtml = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
  const text = decodeEntities(stripTags(bodyHtml)).replace(/\s+/g, ' ').slice(0, 6000)

  return {
    title: decodeEntities(stripTags(title)).slice(0, 300),
    summary: (decodeEntities(description) + ' ' + text).trim().slice(0, 6000),
    link: url,
    image: image && /^https?:\/\//i.test(image) ? decodeEntities(image) : undefined,
  }
}


/** Baixa a imagem pública da notícia e regrava no bucket (evita hotlink/CORS). */
async function mirrorImage(url: string, path: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ContentBot/1.0)' },
      signal: AbortSignal.timeout(20000),
    })
    if (!res.ok) return null
    const type = res.headers.get('content-type') ?? 'image/jpeg'
    if (!type.startsWith('image/')) return null
    const bytes = new Uint8Array(await res.arrayBuffer())
    if (bytes.byteLength < 5000 || bytes.byteLength > 9_000_000) return null
    const { error } = await admin.storage
      .from('instagram-creatives')
      .upload(path, bytes, { contentType: type, upsert: true })
    if (error) return null
    return path
  } catch {
    return null
  }
}

async function chat(ctx: Ctx, step: string, messages: unknown[], schemaName: string, schema: unknown) {
  const model = ctx.preset.text_model
  const started = Date.now()
  const res = await fetch(endpoint(ctx.preset, '/chat/completions'), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey(ctx.preset)}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages,
      tools: [{ type: 'function', function: { name: schemaName, parameters: schema } }],
      tool_choice: { type: 'function', function: { name: schemaName } },
    }),
  })
  if (!res.ok) {
    const text = await res.text()
    await logUsage(ctx, { step, model, cost_usd: 0, duration_ms: Date.now() - started, success: false })
    throw Object.assign(new Error(`AI ${res.status}: ${text}`), { status: res.status })
  }
  const json = await res.json()
  const inputTokens = json?.usage?.prompt_tokens ?? 0
  const outputTokens = json?.usage?.completion_tokens ?? 0
  await logUsage(ctx, {
    step,
    model,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    cost_usd: textCostUsd(model, inputTokens, outputTokens),
    duration_ms: Date.now() - started,
  })
  const args = json.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments
  if (!args) throw new Error('AI returned no structured output')
  return JSON.parse(args)
}

async function generateImage(ctx: Ctx, prompt: string): Promise<string | null> {
  const model = ctx.preset.image_model
  const started = Date.now()
  const useOpenAI = ctx.preset.provider === 'openai' && OPENAI_API_KEY
  const body = useOpenAI
    ? { model, prompt, size: '1024x1024', n: 1 }
    : { model, messages: [{ role: 'user', content: prompt }], modalities: ['image', 'text'] }
  const res = await fetch(endpoint(ctx.preset, '/images/generations'), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey(ctx.preset)}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const text = await res.text()
    await logUsage(ctx, {
      step: 'imagem',
      model,
      cost_usd: 0,
      duration_ms: Date.now() - started,
      success: false,
    })
    throw Object.assign(new Error(`Image ${res.status}: ${text}`), { status: res.status })
  }
  const json = await res.json()
  await logUsage(ctx, {
    step: 'imagem',
    model,
    images: 1,
    cost_usd: imageCostUsd(model, 1),
    duration_ms: Date.now() - started,
  })
  return json?.data?.[0]?.b64_json ?? null

}

async function uploadImage(b64: string, path: string) {
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
  const { error } = await admin.storage
    .from('instagram-creatives')
    .upload(path, bytes, { contentType: 'image/png', upsert: true })
  if (error) throw error
  return path
}

async function authorize(req: Request): Promise<Response | null> {
  const auth = req.headers.get('authorization') ?? ''
  const token = /^Bearer (.+)$/.exec(auth)?.[1]
  if (!token) return new Response('Unauthorized', { status: 401, headers: corsHeaders })
  if (CRON_SECRET && token === CRON_SECRET) return null
  if (token === SERVICE_KEY) return null
  const { data, error } = await admin.auth.getUser(token)
  if (error || !data.user) return new Response('Unauthorized', { status: 401, headers: corsHeaders })
  const { data: isAdmin } = await admin.rpc('has_role', { _user_id: data.user.id, _role: 'admin' })
  if (!isAdmin) return new Response('Forbidden', { status: 403, headers: corsHeaders })
  return null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const denied = await authorize(req)
  if (denied) return denied

  let runId: string | null = null
  const ctx: Ctx = { runId: null, preset: FALLBACK_PRESET, totals: { usd: 0, brl: 0, tokens: 0, images: 0 } }
  try {
    let body: { preset_id?: string } = {}
    try {
      body = (await req.json()) ?? {}
    } catch {
      body = {}
    }

    const presetQuery = admin.from('agent_presets').select('*').limit(1)
    const { data: presetRow } = body.preset_id
      ? await presetQuery.eq('id', body.preset_id).maybeSingle()
      : await presetQuery.eq('is_default', true).maybeSingle()
    if (presetRow) ctx.preset = { ...FALLBACK_PRESET, ...(presetRow as Preset) }

    const { data: run, error: runErr } = await admin
      .from('instagram_runs')
      .insert({ status: 'researching', preset_id: ctx.preset.id || null })
      .select()
      .single()
    if (runErr) throw runErr
    runId = run.id
    ctx.runId = runId


    // 1. Pesquisa de tendências
    const { data: sources } = await admin
      .from('instagram_trend_sources')
      .select('*')
      .eq('active', true)
      .limit(8)

    const headlines: Headline[] = []
    for (const s of sources ?? []) {
      try {
        const res = await fetch(s.url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ContentBot/1.0)' } })
        const xml = await res.text()
        const items = parseFeed(xml, 6)
        headlines.push(...items.map((i) => ({ source: s.name, ...i })))
        await admin
          .from('instagram_trend_sources')
          .update({ last_fetch_status: `ok (${items.length})`, last_fetch_at: new Date().toISOString() })
          .eq('id', s.id)
      } catch (e) {
        await admin
          .from('instagram_trend_sources')
          .update({ last_fetch_status: `erro: ${(e as Error).message}`.slice(0, 200), last_fetch_at: new Date().toISOString() })
          .eq('id', s.id)
      }
    }

    if (headlines.length === 0) throw new Error('Nenhuma fonte retornou conteúdo hoje.')

    const topic = await chat(
      ctx,
      'tema',
      [

        {
          role: 'system',
          content:
            'Você é um estrategista de conteúdo de IA e marketing. Responda sempre em português do Brasil.',
        },
        {
          role: 'user',
          content:
            'Com base nestas manchetes de hoje, escolha O tema mais comentado e relevante para um público de marketing e IA no Instagram.\n\n' +
            headlines.map((h, i) => `${i}. [${h.source}] ${h.title}: ${h.summary}`).join('\n'),
        },
      ],
      'escolher_tema',
      {
        type: 'object',
        properties: {
          topic_title: { type: 'string' },
          topic_summary: { type: 'string' },
          sources: { type: 'array', items: { type: 'string' } },
          headline_indexes: {
            type: 'array',
            items: { type: 'number' },
            description: 'Índices das manchetes usadas, em ordem de relevância',
          },
        },
        required: ['topic_title', 'topic_summary', 'sources'],
      },
    )

    await admin
      .from('instagram_runs')
      .update({
        status: 'drafting',
        topic_title: topic.topic_title,
        topic_summary: topic.topic_summary,
        topic_sources: topic.sources ?? [],
      })
      .eq('id', runId)

    // 1b. Imagens públicas divulgadas nas notícias escolhidas
    const chosen: Headline[] = (topic.headline_indexes ?? [])
      .map((i: number) => headlines[i])
      .filter(Boolean)
    const pool: Headline[] = chosen.length > 0 ? chosen : headlines
    const newsImages: { path: string; source_name: string; source_link?: string }[] = []
    for (const item of pool.slice(0, 8)) {
      if (newsImages.length >= 4) break
      const src = item.image ?? (item.link ? await fetchOgImage(item.link) : undefined)
      if (!src) continue
      const path = await mirrorImage(src, `${runId}/news-${crypto.randomUUID()}.img`)
      if (path) newsImages.push({ path, source_name: item.source, source_link: item.link })
    }

    // 1c. Conhecimento da marca (RAG): regras duras sempre + trechos relevantes ao tema
    const knowledgeBlocks: string[] = []
    try {
      const { data: hardRules } = await admin
        .from('knowledge_documents')
        .select('id, title, doc_type, preset_id')
        .eq('active', true)
        .eq('status', 'ready')
        .in('doc_type', ['policies', 'guardrails'])
      for (const doc of hardRules ?? []) {
        if (ctx.preset.id && doc.preset_id && doc.preset_id !== ctx.preset.id) continue
        const { data: parts } = await admin
          .from('knowledge_chunks')
          .select('content')
          .eq('document_id', doc.id)
          .order('chunk_index')
          .limit(12)
        const full = (parts ?? []).map((p) => p.content).join('\n')
        if (full.trim()) knowledgeBlocks.push(`### ${doc.title} (${doc.doc_type})\n${full.slice(0, 6000)}`)
      }

      const startedAt = Date.now()
      const [queryEmbedding] = await embedTexts([`${topic.topic_title}\n${topic.topic_summary}`])
      const { data: matches } = await admin.rpc('match_knowledge_chunks', {
        query_embedding: toVectorLiteral(queryEmbedding),
        match_count: 8,
        filter_doc_types: ['brand_manual', 'design_system', 'writing_manual', 'copy_semantic', 'copy_syntactic', 'copy_lexical'],
        filter_preset: ctx.preset.id || null,
      })
      for (const m of (matches ?? []) as { title: string; doc_type: string; content: string }[]) {
        knowledgeBlocks.push(`### ${m.title} (${m.doc_type})\n${m.content}`)
      }
      await logUsage(ctx, {
        step: 'knowledge_retrieval',
        model: EMBEDDING_MODEL,
        input_tokens: Math.ceil((topic.topic_title.length + topic.topic_summary.length) / 4),
        cost_usd: 0.0000002 * Math.ceil((topic.topic_title.length + topic.topic_summary.length) / 4),
        duration_ms: Date.now() - startedAt,
      })
    } catch (e) {
      console.error('knowledge retrieval falhou', (e as Error).message)
    }

    const knowledgeContext = knowledgeBlocks.length
      ? `\n\nMATERIAL OFICIAL DA EMPRESA (siga rigorosamente; policies e guardrails são obrigatórios):\n${knowledgeBlocks.join('\n\n').slice(0, 20000)}`
      : ''

    // 2. Geração dos criativos, dentro da identidade da marca
    const slideSchema = {
      type: 'object',
      properties: {
        order: { type: 'number' },
        kicker: { type: 'string', description: 'Rótulo curto em caixa alta, até 4 palavras' },
        headline: { type: 'string', description: 'Título curto, até 9 palavras' },
        emphasis: {
          type: 'string',
          description: 'Trecho exato do headline que receberá o itálico âmbar da marca (1 a 3 palavras)',
        },
        body: { type: 'string', description: 'Texto de apoio, até 240 caracteres' },
        image_prompt: { type: 'string' },
      },
      required: ['order', 'kicker', 'headline', 'emphasis', 'body', 'image_prompt'],
    }

    const formatSpec = ctx.preset.formats
      .map((f) =>
        f === 'carousel'
          ? `um "carousel" (${ctx.preset.carousel_slides} slides)`
          : `um "${f}" (1 slide)`,
      )
      .join(', ')

    const drafts = (await chat(
      ctx,
      'criativos',
      [
        {
          role: 'system',
          content:
            (ctx.preset.instructions?.trim() ||
              'Você cria conteúdo de Instagram para a marca pessoal de Jefferson Lobo — head executivo de marketing, consultor em IA e palestrante. ' +
                'Tom direto, autoral e profissional, em português do Brasil, sem emojis nos títulos. ' +
                'A identidade visual é fundo petróleo (#12201E), texto papel (#F2EEE4) e destaque âmbar (#E29F65), com títulos em serifa e rótulos em monoespaçada caixa alta.') +
            ' image_prompt deve ser escrito em inglês, descrevendo um fundo abstrato e sofisticado nessa paleta, SEM nenhum texto na imagem.' +
            knowledgeContext,
        },
        {
          role: 'user',
          content: `Tema do dia: ${topic.topic_title}\nResumo: ${topic.topic_summary}\n\nCrie os seguintes criativos: ${formatSpec}. Inclua legenda e de 5 a 8 hashtags para cada.`,
        },
      ],

      'gerar_criativos',
      {
        type: 'object',
        properties: {
          creatives: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                format: { type: 'string', enum: ['card', 'carousel', 'story'] },
                caption: { type: 'string' },
                hashtags: { type: 'array', items: { type: 'string' } },
                slides: { type: 'array', items: slideSchema },
              },
              required: ['format', 'caption', 'hashtags', 'slides'],
            },
          },
        },
        required: ['creatives'],
      },
    )) as { creatives: CreativeDraft[] }

    // 3. Fundo de cada slide: primeiro a imagem pública da notícia, senão fundo por IA
    let imageBudget = ctx.preset.image_budget ?? 6
    let newsCursor = 0
    for (const creative of drafts.creatives) {
      for (const slide of creative.slides) {
        const news = newsImages[newsCursor % Math.max(newsImages.length, 1)]
        if (news) {
          slide.image_url = news.path
          slide.source_name = news.source_name
          slide.source_link = news.source_link
          newsCursor++
          continue
        }
        if (imageBudget <= 0) continue
        imageBudget--
        try {
          const b64 = await generateImage(
            ctx,
            `${slide.image_prompt}. Abstract editorial background for social media, deep petrol green (#12201E) base with warm amber (#E29F65) light accents, soft grain, high contrast, no text, no letters, no watermark.`,
          )
          if (b64) {
            slide.image_url = await uploadImage(
              b64,
              `${runId}/${creative.format}-${slide.order}-${crypto.randomUUID()}.png`,
            )
          }
        } catch (e) {
          const status = (e as { status?: number }).status
          if (status === 402 || status === 403) throw e
        }
      }
    }

    for (const creative of drafts.creatives) {
      await admin.from('instagram_creatives').insert({
        run_id: runId,
        format: creative.format,
        caption: creative.caption,
        hashtags: creative.hashtags ?? [],
        slides: creative.slides,
      })
    }

    await admin
      .from('instagram_runs')
      .update({
        status: 'pending_review',
        cost_usd: Number(ctx.totals.usd.toFixed(6)),
        cost_brl: Number(ctx.totals.brl.toFixed(4)),
        tokens_total: ctx.totals.tokens,
        image_count: ctx.totals.images,
      })
      .eq('id', runId)

    return new Response(
      JSON.stringify({
        run_id: runId,
        topic: topic.topic_title,
        news_images: newsImages.length,
        cost_usd: Number(ctx.totals.usd.toFixed(6)),
        cost_brl: Number(ctx.totals.brl.toFixed(4)),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (e) {
    const message = (e as Error).message ?? 'Erro desconhecido'
    if (runId) {
      await admin
        .from('instagram_runs')
        .update({
          status: 'failed',
          error_message: message.slice(0, 500),
          cost_usd: Number(ctx.totals.usd.toFixed(6)),
          cost_brl: Number(ctx.totals.brl.toFixed(4)),
          tokens_total: ctx.totals.tokens,
          image_count: ctx.totals.images,
        })
        .eq('id', runId)
    }

    const status = (e as { status?: number }).status
    return new Response(JSON.stringify({ error: message }), {
      status: status && status >= 400 ? status : 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
