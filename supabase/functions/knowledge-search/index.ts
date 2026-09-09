import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import { createClient } from 'npm:@supabase/supabase-js@2'
import { embedTexts, toVectorLiteral } from '../_shared/knowledge.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const admin = createClient(SUPABASE_URL, SERVICE_KEY)

async function authorize(req: Request): Promise<Response | null> {
  const token = /^Bearer (.+)$/.exec(req.headers.get('authorization') ?? '')?.[1]
  if (!token) return new Response('Unauthorized', { status: 401, headers: corsHeaders })
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

  try {
    const body = (await req.json().catch(() => ({}))) as {
      query?: string
      match_count?: number
      preset_id?: string | null
    }
    const query = (body.query ?? '').trim()
    if (query.length < 3) {
      return new Response(JSON.stringify({ error: 'Digite ao menos 3 caracteres' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const [embedding] = await embedTexts([query])
    const { data, error } = await admin.rpc('match_knowledge_chunks', {
      query_embedding: toVectorLiteral(embedding),
      match_count: Math.min(Math.max(body.match_count ?? 8, 1), 20),
      filter_doc_types: null,
      filter_preset: body.preset_id ?? null,
    })
    if (error) throw error

    return new Response(JSON.stringify({ matches: data ?? [] }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
