const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY')!

export const EMBEDDING_MODEL = 'google/gemini-embedding-2'

export const DOC_TYPES = [
  'brand_manual',
  'design_system',
  'writing_manual',
  'copy_semantic',
  'copy_syntactic',
  'copy_lexical',
  'policies',
  'guardrails',
] as const

export type DocType = (typeof DOC_TYPES)[number]

export function chunkText(text: string, size = 1200, overlap = 150): string[] {
  const clean = text.replace(/\r/g, '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim()
  if (!clean) return []
  const chunks: string[] = []
  let i = 0
  while (i < clean.length) {
    let end = Math.min(i + size, clean.length)
    if (end < clean.length) {
      const breakAt = clean.lastIndexOf('\n', end)
      const dotAt = clean.lastIndexOf('. ', end)
      const cut = Math.max(breakAt, dotAt)
      if (cut > i + size * 0.5) end = cut + 1
    }
    const piece = clean.slice(i, end).trim()
    if (piece) chunks.push(piece)
    if (end >= clean.length) break
    i = Math.max(end - overlap, i + 1)
  }
  return chunks
}

/** Gera embeddings em lotes de até 100 itens (limite do provedor). */
export async function embedTexts(inputs: string[]): Promise<number[][]> {
  const out: number[][] = []
  for (let i = 0; i < inputs.length; i += 100) {
    const batch = inputs.slice(i, i + 100)
    let attempt = 0
    for (;;) {
      const res = await fetch('https://ai.gateway.lovable.dev/v1/embeddings', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ model: EMBEDDING_MODEL, input: batch }),
      })
      if (res.ok) {
        const json = await res.json()
        const sorted = (json.data as { index: number; embedding: number[] }[]).sort((a, b) => a.index - b.index)
        out.push(...sorted.map((d) => d.embedding))
        break
      }
      const body = await res.text()
      const retryable = res.status === 429 || res.status >= 500
      if (!retryable || attempt >= 3) {
        throw new Error(`Embeddings ${res.status}: ${body.slice(0, 300)}`)
      }
      const wait = Number(res.headers.get('retry-after')) * 1000 || 1500 * 2 ** attempt
      await new Promise((r) => setTimeout(r, wait))
      attempt++
    }
  }
  return out
}

export function toVectorLiteral(v: number[]) {
  return `[${v.join(',')}]`
}
