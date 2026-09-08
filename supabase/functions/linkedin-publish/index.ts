import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import { createClient } from 'npm:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY')!
const LINKEDIN_API_KEY = Deno.env.get('LINKEDIN_API_KEY')!
const GATEWAY = 'https://connector-gateway.lovable.dev/linkedin'

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
    throw Object.assign(new Error(`LinkedIn ${res.status}: ${body}`), { status: res.status })
  }
  return res
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const token = /^Bearer (.+)$/.exec(req.headers.get('authorization') ?? '')?.[1]
    if (!token) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    const { data: userData } = await admin.auth.getUser(token)
    if (!userData?.user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    const { data: isAdmin } = await admin.rpc('has_role', { _user_id: userData.user.id, _role: 'admin' })
    if (!isAdmin) return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

    const body = await req.json().catch(() => ({}))
    const creativeId = typeof body?.creative_id === 'string' ? body.creative_id : null
    if (!creativeId) {
      return new Response(JSON.stringify({ error: 'creative_id é obrigatório' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const { data: creative, error: cErr } = await admin
      .from('instagram_creatives')
      .select('id, caption, hashtags, final_image_urls, status')
      .eq('id', creativeId)
      .single()
    if (cErr || !creative) throw new Error('Criativo não encontrado')
    if (creative.status !== 'approved') throw new Error('Só é possível publicar peças aprovadas')

    const tags = (creative.hashtags ?? []).map((h: string) => (h.startsWith('#') ? h : `#${h}`)).join(' ')
    const text = [creative.caption ?? '', tags].filter(Boolean).join('\n\n').slice(0, 2900)

    // Identidade do membro conectado
    const me = await (await gateway('/v2/userinfo')).json()
    const author = `urn:li:person:${me.sub}`

    // Tenta anexar a primeira arte aprovada
    let mediaAsset: string | null = null
    const path = (creative.final_image_urls ?? [])[0]
    if (path) {
      try {
        const { data: file } = await admin.storage.from('instagram-creatives').download(path)
        if (file) {
          const reg = await (
            await gateway('/v2/assets?action=registerUpload', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                registerUploadRequest: {
                  recipes: ['urn:li:digitalmediaRecipe:feedshare-image'],
                  owner: author,
                  serviceRelationships: [
                    { relationshipType: 'OWNER', identifier: 'urn:li:userGeneratedContent' },
                  ],
                },
              }),
            })
          ).json()
          const asset = reg?.value?.asset as string | undefined
          const uploadUrl = reg?.value?.uploadMechanism?.[
            'com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest'
          ]?.uploadUrl as string | undefined
          if (asset && uploadUrl) {
            const relative = uploadUrl.replace(/^https:\/\/[^/]+/, '')
            await gateway(relative, {
              method: 'PUT',
              headers: { 'Content-Type': 'image/png' },
              body: new Uint8Array(await file.arrayBuffer()),
            })
            mediaAsset = asset
          }
        }
      } catch (e) {
        console.error('Upload da imagem falhou, publicando somente texto:', (e as Error).message)
      }
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
              ...(mediaAsset
                ? { media: [{ status: 'READY', media: mediaAsset }] }
                : {}),
            },
          },
          visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' },
        }),
      })
    ).json()

    return new Response(JSON.stringify({ ok: true, post_id: post?.id ?? null, with_image: !!mediaAsset }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    const status = (e as { status?: number }).status
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: status && status >= 400 ? status : 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
