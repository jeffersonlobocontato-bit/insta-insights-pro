/** Tabela de preços por modelo, em dólar. */
export const USD_TO_BRL = Number(Deno.env.get('USD_TO_BRL') ?? '5.40')

type TextPrice = { in: number; out: number } // USD por 1 milhão de tokens
type ImagePrice = { image: number } // USD por imagem

const TEXT_PRICES: Record<string, TextPrice> = {
  'google/gemini-3.8-flash': { in: 0.3, out: 2.5 },
  'google/gemini-2.5-flash': { in: 0.3, out: 2.5 },
  'openai/gpt-6-astra': { in: 1.25, out: 10 },
  'gpt-5-mini': { in: 0.25, out: 2 },
  'gpt-4.1-mini': { in: 0.4, out: 1.6 },
  'gpt-4o-mini': { in: 0.15, out: 0.6 },
}

const IMAGE_PRICES: Record<string, ImagePrice> = {
  'google/gemini-3.1-flash-image': { image: 0.039 },
  'google/gemini-3-pro-image': { image: 0.12 },
  'gpt-image-1': { image: 0.04 },
}

const DEFAULT_TEXT: TextPrice = { in: 0.5, out: 2.5 }
const DEFAULT_IMAGE: ImagePrice = { image: 0.05 }

export function textCostUsd(model: string, inputTokens: number, outputTokens: number) {
  const p = TEXT_PRICES[model] ?? DEFAULT_TEXT
  return (inputTokens / 1_000_000) * p.in + (outputTokens / 1_000_000) * p.out
}

export function imageCostUsd(model: string, images: number) {
  const p = IMAGE_PRICES[model] ?? DEFAULT_IMAGE
  return images * p.image
}

export function toBrl(usd: number) {
  return usd * USD_TO_BRL
}
