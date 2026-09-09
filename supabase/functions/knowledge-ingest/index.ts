import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import { createClient } from 'npm:@supabase/supabase-js@2'
import { extractText, getDocumentProxy } from 'npm:unpdf@0.12.1'
import JSZip from 'npm:jszip@3.10.1'
import { chunkText, embedTexts, toVectorLiteral } from '../_shared/knowledge.ts'

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

async function pdfToText(buf: ArrayBuffer) {
  const pdf = await getDocumentProxy(new Uint8Array(buf))
  const { text } = await extractText(pdf, { mergePages: true })
  return Array.isArray(text) ? text.join('\n\n') : text
}

async function docxToText(buf: ArrayBuffer) {
  const zip = await JSZip.loadAsync(buf)
  const xml = await zip.file('word/document.xml')?.async('string')
  if (!xml) throw new Error('Arquivo .docx inválido')
  return xml
    .replace(/<\/w:p>/g, '\n')
    .replace(/<w:tab[^>]*\/>/g, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const denied = await authorize(req)
  if (denied) return denied

  let documentId: string | null = null
  try {
    const body = (await req.json().catch(() => ({}))) as { document_id?: string }
    documentId = body.document_id ?? null
    if (!documentId) {
      return new Response(JSON.stringify({ error: 'document_id é obrigatório' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: doc, error: docErr } = await admin
      .from('knowledge_documents')
      .select('*')
      .eq('id', documentId)
      .maybeSingle()
    if (docErr || !doc) throw new Error('Documento não encontrado')

    await admin.from('knowledge_documents').update({ status: 'processing', error_message: null }).eq('id', documentId)
    await admin.from('knowledge_chunks').delete().eq('document_id', documentId)

    let text = (doc.raw_text ?? '').trim()
    if (!text && doc.storage_path) {
      const { data: file, error: dlErr } = await admin.storage.from('knowledge-docs').download(doc.storage_path)
      if (dlErr || !file) throw new Error('Não consegui baixar o arquivo enviado')
      const buf = await file.arrayBuffer()
      const name = (doc.storage_path as string).toLowerCase()
      if (name.endsWith('.pdf') || doc.mime === 'application/pdf') text = await pdfToText(buf)
      else if (name.endsWith('.docx')) text = await docxToText(buf)
      else text = new TextDecoder().decode(buf)
    }

    text = (text ?? '').trim()
    if (text.length < 40) {
      throw new Error('Não encontrei texto legível neste arquivo (PDF escaneado?). Cole o texto manualmente.')
    }

    const chunks = chunkText(text)
    const embeddings = await embedTexts(chunks)

    const rows = chunks.map((content, idx) => ({
      document_id: documentId,
      chunk_index: idx,
      content,
      embedding: toVectorLiteral(embeddings[idx]),
    }))

    for (let i = 0; i < rows.length; i += 50) {
      const { error } = await admin.from('knowledge_chunks').insert(rows.slice(i, i + 50))
      if (error) throw error
    }

    await admin
      .from('knowledge_documents')
      .update({ status: 'ready', char_count: text.length, error_message: null })
      .eq('id', documentId)

    return new Response(JSON.stringify({ ok: true, chunks: rows.length, chars: text.length }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    const message = (e as Error).message ?? 'Falha ao processar'
    if (documentId) {
      await admin
        .from('knowledge_documents')
        .update({ status: 'failed', error_message: message.slice(0, 400) })
        .eq('id', documentId)
    }
    return new Response(JSON.stringify({ error: message }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
