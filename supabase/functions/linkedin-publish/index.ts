import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import { createClient } from 'npm:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY')!
const LINKEDIN_API_KEY = Deno.env.get('LINKEDIN_API_KEY')!
const GATEWAY = 'https://connector-gateway.lovable.dev/linkedin'
const LI_VERSION = '202409'

const admin = createClient(SUPABASE_URL, SERVICE_KEY)

const gatewayHeaders = {
  Authorization: `Bearer ${LOVABLE_API_KEY}`,
  'X-Connection-Api-Key': LINKEDIN_API_KEY,
}

async function gateway(path: string, init: RequestInit = {}) {
  const res = await fetch(`${GATEWAY}${path}`, {
    ...init,
    headers: { ...gatewayHeaders, ...(init.headers ?? {}) },
  })
  if (!res.ok) {
    const body = await res.text()
    console.error(`LinkedIn ${path} failed [${res.status}]: ${body}`)
    throw Object.assign(new Error(`LinkedIn ${res.status} em ${path}: ${body}`), { status: res.status })
  }
  return res
}

// Envia o binário para a URL temporária devolvida pelo LinkedIn, preservando caminho + query
async function putBinary(uploadUrl: string, bytes: Uint8Array) {
  const u = new URL(uploadUrl)
  return gateway(`${u.pathname}${u.search}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'image/png' },
    body: bytes,
  })
}

/** Fluxo atual: /rest/images + /rest/posts. Retorna o id do post. */
async function publishWithImagesApi(author: string, text: string, bytes: Uint8Array) {
  const restHeaders = {
    'LinkedIn-Version': LI_VERSION,
    'X-Restli-Protocol-Version': '2.0.0',
    'Content-Type': 'application/json',
  }
  const init = await (
    await gateway('/rest/images?action=initializeUpload', {
      method: 'POST',
      headers: restHeaders,
      body: JSON.stringify({ initializeUploadRequest: { owner: author } }),
    })
  ).json()
  const imageUrn = init?.value?.image as string | undefined
  const uploadUrl = init?.value?.uploadUrl as string | undefined
  if (!imageUrn || !uploadUrl) throw new Error('LinkedIn não devolveu URL de upload da imagem')

  await putBinary(uploadUrl, bytes)

  const res = await gateway('/rest/posts', {
    method: 'POST',
    headers: restHeaders,
    body: JSON.stringify({
      author,
      commentary: text,
      visibility: 'PUBLIC',
      distribution: { feedDistribution: 'MAIN_FEED', targetEntities: [], thirdPartyDistributionChannels: [] },
      content: { media: { id: imageUrn, title: 'Jefferson Lobo' } },
      lifecycleState: 'PUBLISHED',
      isReshareDisabledByAuthor: false,
    }),
  })
  const postId = res.headers.get('x-restli-id') ?? res.headers.get('x-linkedin-id')
  return postId
}

/** Fluxo antigo: /v2/assets + /v2/ugcPosts. */
async function publishWithUgcApi(author: string, text: string, bytes: Uint8Array | null) {
  let mediaAsset: string | null = null
  if (bytes) {
    const reg = await (
      await gateway('/v2/assets?action=registerUpload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          registerUploadRequest: {
            recipes: ['urn:li:digitalmediaRecipe:feedshare-image'],
            owner: author,
            serviceRelationships: [{ relationshipType: 'OWNER', identifier: 'urn:li:userGeneratedContent' }],
          },
        }),
      })
    ).json()
    const asset = reg?.value?.asset as string | undefined
    const uploadUrl = reg?.value?.uploadMechanism?.[
      'com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest'
    ]?.uploadUrl as string | undefined
    if (!asset || !uploadUrl) throw new Error('LinkedIn não devolveu URL de upload da imagem (v2/assets)')
    await putBinary(uploadUrl, bytes)
    mediaAsset = asset
  }

  const post = await (
    await gateway('/v2/ugcPosts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Restli-Protocol-Version': '2.0.0' },
      body: JSON.stringify({
        author,
        lifecycleState: 'PUBLISHED',
        specificContent: {
          'com.linkedin.ugc.ShareContent': {
            shareCommentary: { text },
            shareMediaCategory: mediaAsset ? 'IMAGE' : 'NONE',
            ...(mediaAsset ? { media: [{ status: 'READY', media: mediaAsset }] } : {}),
          },
        },
        visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' },
      }),
    })
  ).json()
  return post?.id ?? null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const json = (payload: unknown, status = 200) =>
    new Response(JSON.stringify(payload), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  try {
    const token = /^Bearer (.+)$/.exec(req.headers.get('authorization') ?? '')?.[1]
    if (!token) return json({ error: 'Unauthorized' }, 401)
    const { data: userData } = await admin.auth.getUser(token)
    if (!userData?.user) return json({ error: 'Unauthorized' }, 401)
    const { data: isAdmin } = await admin.rpc('has_role', { _user_id: userData.user.id, _role: 'admin' })
    if (!isAdmin) return json({ error: 'Forbidden' }, 403)

    const body = await req.json().catch(() => ({}))
    const creativeId = typeof body?.creative_id === 'string' ? body.creative_id : null
    if (!creativeId) return json({ error: 'creative_id é obrigatório' }, 400)

    const { data: creative, error: cErr } = await admin
      .from('instagram_creatives')
      .select('id, caption, hashtags, final_image_urls, status')
      .eq('id', creativeId)
      .single()
    if (cErr || !creative) throw new Error('Criativo não encontrado')
    if (creative.status !== 'approved') throw new Error('Só é possível publicar peças aprovadas')

    const tags = (creative.hashtags ?? []).map((h: string) => (h.startsWith('#') ? h : `#${h}`)).join(' ')
    const text = [creative.caption ?? '', tags].filter(Boolean).join('\n\n').slice(0, 2900)

    const me = await (await gateway('/v2/userinfo')).json()
    const author = `urn:li:person:${me.sub}`

    // Baixa a arte final aprovada
    let bytes: Uint8Array | null = null
    let imageError: string | null = null
    const path = (creative.final_image_urls ?? [])[0]
    if (path) {
      const { data: file, error: dErr } = await admin.storage.from('instagram-creatives').download(path)
      if (file) bytes = new Uint8Array(await file.arrayBuffer())
      else imageError = `Não consegui baixar a arte final (${dErr?.message ?? 'arquivo ausente'})`
    } else {
      imageError = 'Esta peça não tem arte final montada'
    }

    let postId: string | null = null
    let withImage = false

    if (bytes) {
      try {
        postId = await publishWithImagesApi(author, text, bytes)
        withImage = true
      } catch (e) {
        const status = (e as { status?: number }).status
        const msg = (e as Error).message
        console.error('Fluxo /rest falhou:', msg)
        if (status === 403 || status === 426 || status === 404 || status === 400) {
          try {
            postId = await publishWithUgcApi(author, text, bytes)
            withImage = true
          } catch (e2) {
            imageError = (e2 as Error).message
            console.error('Fluxo /v2 também falhou:', imageError)
          }
        } else {
          imageError = msg
        }
      }
    }

    if (!postId) {
      // Publica somente o texto e devolve o motivo da falha da imagem
      postId = await publishWithUgcApi(author, text, null)
    }

    return json({ ok: true, post_id: postId, with_image: withImage, image_error: withImage ? null : imageError })
  } catch (e) {
    const status = (e as { status?: number }).status
    console.error('linkedin-publish erro:', (e as Error).message)
    return json({ error: (e as Error).message }, status && status >= 400 ? status : 500)
  }
})
