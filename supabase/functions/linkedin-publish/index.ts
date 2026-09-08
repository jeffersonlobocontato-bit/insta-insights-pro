import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import { createClient } from 'npm:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY')!
const LINKEDIN_API_KEY = Deno.env.get('LINKEDIN_API_KEY')!
const GATEWAY = 'https://connector-gateway.lovable.dev/linkedin'
const LI_VERSIONS = ['202508', '202506', '202504', '202501', '202411']

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

// A URL de upload do LinkedIn é pré-assinada e vive em outro host (dms-uploads).
// Precisa ir direto, não pelo gateway (o gateway aponta para api.linkedin.com → 405).
async function putBinary(uploadUrl: string, bytes: Uint8Array) {
  const attempts: Array<{ label: string; run: () => Promise<Response> }> = [
    {
      label: 'direto',
      run: () => fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': 'image/png' }, body: bytes }),
    },
    {
      label: 'direto POST',
      run: () => fetch(uploadUrl, { method: 'POST', headers: { 'Content-Type': 'image/png' }, body: bytes }),
    },
  ]
  let last = ''
  for (const a of attempts) {
    try {
      const res = await a.run()
      if (res.ok || res.status === 201) return res
      last = `upload ${a.label} [${res.status}]: ${(await res.text()).slice(0, 300)}`
      console.error(last)
    } catch (e) {
      last = `upload ${a.label} falhou: ${(e as Error).message}`
      console.error(last)
    }
  }
  throw new Error(last || 'Falha no upload da imagem para o LinkedIn')
}

/** Fluxo atual: /rest/images + /rest/posts. Suporta 1 imagem ou carrossel (multiImage). */
async function publishWithImagesApi(author: string, text: string, images: Uint8Array[]) {
  let version = ''
  const urns: string[] = []

  for (const bytes of images) {
    let init: any = null
    let lastErr: unknown = null
    for (const v of version ? [version] : LI_VERSIONS) {
      try {
        init = await (
          await gateway('/rest/images?action=initializeUpload', {
            method: 'POST',
            headers: {
              'LinkedIn-Version': v,
              'X-Restli-Protocol-Version': '2.0.0',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ initializeUploadRequest: { owner: author } }),
          })
        ).json()
        version = v
        break
      } catch (e) {
        lastErr = e
        if ((e as { status?: number }).status !== 426) throw e
      }
    }
    if (!init) throw lastErr ?? new Error('Nenhuma versão da API do LinkedIn aceita')

    const imageUrn = init?.value?.image as string | undefined
    const uploadUrl = init?.value?.uploadUrl as string | undefined
    if (!imageUrn || !uploadUrl) throw new Error('LinkedIn não devolveu URL de upload da imagem')
    await putBinary(uploadUrl, bytes)
    urns.push(imageUrn)
  }

  const restHeaders = {
    'LinkedIn-Version': version,
    'X-Restli-Protocol-Version': '2.0.0',
    'Content-Type': 'application/json',
  }

  const content =
    urns.length > 1
      ? { multiImage: { images: urns.map((id) => ({ id })) } }
      : { media: { id: urns[0], title: 'Jefferson Lobo' } }

  const res = await gateway('/rest/posts', {
    method: 'POST',
    headers: restHeaders,
    body: JSON.stringify({
      author,
      commentary: text,
      visibility: 'PUBLIC',
      distribution: { feedDistribution: 'MAIN_FEED', targetEntities: [], thirdPartyDistributionChannels: [] },
      content,
      lifecycleState: 'PUBLISHED',
      isReshareDisabledByAuthor: false,
    }),
  })
  const postId = res.headers.get('x-restli-id') ?? res.headers.get('x-linkedin-id')
  return postId
}


/** Fluxo antigo: /v2/assets + /v2/ugcPosts. */
async function publishWithUgcApi(author: string, text: string, images: Uint8Array[]) {
  const assets: string[] = []
  for (const bytes of images) {
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
    assets.push(asset)
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
            shareMediaCategory: assets.length ? 'IMAGE' : 'NONE',
            ...(assets.length ? { media: assets.map((a) => ({ status: 'READY', media: a })) } : {}),
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
        console.error('Fluxo /rest falhou:', msg, status ?? '')
        try {
          postId = await publishWithUgcApi(author, text, bytes)
          withImage = true
        } catch (e2) {
          imageError = `${msg} | v2: ${(e2 as Error).message}`
          console.error('Fluxo /v2 também falhou:', imageError)
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
