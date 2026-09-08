import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import { createClient } from 'npm:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY')!
const CRON_SECRET = Deno.env.get('LOVABLE_CRON_SECRET')

const admin = createClient(SUPABASE_URL, SERVICE_KEY)

type Slide = {
  order: number
  headline: string
  body: string
  image_prompt: string
  image_url?: string
}

type CreativeDraft = {
  format: 'card' | 'carousel' | 'story'
  caption: string
  hashtags: string[]
  slides: Slide[]
}

function stripTags(s: string) {
  return s.replace(/<!\[CDATA\[|\]\]>/g, '').replace(/<[^>]+>/g, '').trim()
}

function parseFeed(xml: string, limit = 8) {
  const items: { title: string; summary: string }[] = []
  const blocks = xml.split(/<item[\s>]|<entry[\s>]/).slice(1)
  for (const block of blocks.slice(0, limit)) {
    const title = block.match(/<title[^>]*>([\s\S]*?)<\/title>/)?.[1]
    const desc =
      block.match(/<description[^>]*>([\s\S]*?)<\/description>/)?.[1] ??
      block.match(/<summary[^>]*>([\s\S]*?)<\/summary>/)?.[1] ??
      ''
    if (title) items.push({ title: stripTags(title), summary: stripTags(desc).slice(0, 300) })
  }
  return items
}

async function chat(messages: unknown[], schemaName: string, schema: unknown) {
  const res = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'google/gemini-3.8-flash',
      messages,
      tools: [{ type: 'function', function: { name: schemaName, parameters: schema } }],
      tool_choice: { type: 'function', function: { name: schemaName } },
    }),
  })
  if (!res.ok) {
    const text = await res.text()
    throw Object.assign(new Error(`AI ${res.status}: ${text}`), { status: res.status })
  }
  const json = await res.json()
  const args = json.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments
  if (!args) throw new Error('AI returned no structured output')
  return JSON.parse(args)
}

async function generateImage(prompt: string): Promise<string | null> {
  const res = await fetch('https://ai.gateway.lovable.dev/v1/images/generations', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'google/gemini-3.1-flash-image',
      messages: [{ role: 'user', content: prompt }],
      modalities: ['image', 'text'],
    }),
  })
  if (!res.ok) {
    const text = await res.text()
    throw Object.assign(new Error(`Image ${res.status}: ${text}`), { status: res.status })
  }
  const json = await res.json()
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
  try {
    const { data: run, error: runErr } = await admin
      .from('instagram_runs')
      .insert({ status: 'researching' })
      .select()
      .single()
    if (runErr) throw runErr
    runId = run.id

    // 1. Pesquisa de tendências
    const { data: sources } = await admin
      .from('instagram_trend_sources')
      .select('*')
      .eq('active', true)
      .limit(8)

    const headlines: { source: string; title: string; summary: string }[] = []
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
            headlines.map((h) => `- [${h.source}] ${h.title}: ${h.summary}`).join('\n'),
        },
      ],
      'escolher_tema',
      {
        type: 'object',
        properties: {
          topic_title: { type: 'string' },
          topic_summary: { type: 'string' },
          sources: { type: 'array', items: { type: 'string' } },
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

    // 2. Geração dos criativos
    const slideSchema = {
      type: 'object',
      properties: {
        order: { type: 'number' },
        headline: { type: 'string' },
        body: { type: 'string' },
        image_prompt: { type: 'string' },
      },
      required: ['order', 'headline', 'body', 'image_prompt'],
    }

    const drafts = (await chat(
      [
        {
          role: 'system',
          content:
            'Você cria conteúdo de Instagram em português do Brasil, tom direto e profissional. image_prompt deve ser escrito em inglês, descrevendo uma imagem de fundo abstrata e moderna, SEM nenhum texto na imagem.',
        },
        {
          role: 'user',
          content: `Tema do dia: ${topic.topic_title}\nResumo: ${topic.topic_summary}\n\nCrie três criativos: um "card" (1 slide), um "carousel" (4 slides) e um "story" (1 slide). Inclua legenda e de 5 a 8 hashtags para cada.`,
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

    // 3. Imagens de fundo (limite de segurança de 6 imagens por rodada)
    let imageBudget = 6
    for (const creative of drafts.creatives) {
      for (const slide of creative.slides) {
        if (imageBudget <= 0) break
        imageBudget--
        try {
          const b64 = await generateImage(
            `${slide.image_prompt}. Modern abstract social media background, vibrant purple to pink gradient, high contrast, no text, no letters, no watermark.`,
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

    await admin.from('instagram_runs').update({ status: 'pending_review' }).eq('id', runId)

    return new Response(JSON.stringify({ run_id: runId, topic: topic.topic_title }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    const message = (e as Error).message ?? 'Erro desconhecido'
    if (runId) {
      await admin
        .from('instagram_runs')
        .update({ status: 'failed', error_message: message.slice(0, 500) })
        .eq('id', runId)
    }
    const status = (e as { status?: number }).status
    return new Response(JSON.stringify({ error: message }), {
      status: status && status >= 400 ? status : 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
