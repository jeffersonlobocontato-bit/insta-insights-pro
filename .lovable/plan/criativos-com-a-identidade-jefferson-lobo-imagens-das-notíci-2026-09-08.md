# Criativos com a identidade Jefferson Lobo + imagens das notícias

## O que muda

1. **Toda peça gerada passa a seguir o manual da marca**
   - Fundo petróleo (#12201E) com neutros de apoio (#1B2824 / #232E2C).
   - Texto em papel (#F2EEE4), destaque em âmbar (#E29F65).
   - Títulos em Instrument Serif, com a palavra de ênfase em itálico âmbar.
   - Texto corrido em Manrope; rótulo/kicker em IBM Plex Mono, caixa alta com espaçamento aberto.
   - Cantos arredondados (12px), sombra suave, régua degradê entre blocos.
   - Assinatura "Jefferson Lobo" (ou "JL" no story) sempre presente, nunca dentro de selo colorido, nunca distorcida.

2. **Uso das imagens públicas das notícias pesquisadas**
   - Ao ler cada fonte, o sistema também captura a imagem divulgada na notícia (imagem de capa do item do feed).
   - Essa imagem vira o fundo do criativo, escurecida com camada petróleo para o texto ficar legível.
   - A fonte da notícia aparece como crédito discreto no rodapé da peça.
   - Se a notícia não tiver imagem utilizável, o sistema gera um fundo abstrato na paleta da marca como hoje.

3. **Prévia e exportação**
   - A fila de revisão passa a mostrar a peça montada (fundo + textos + assinatura) já no formato certo: quadrado para card e carrossel, vertical para story.
   - Ao aprovar, a peça é exportada como imagem final pronta para postar.

## Detalhes técnicos

- Tokens de cor/tipografia da marca adicionados ao `index.css` e ao `tailwind.config.ts` (Instrument Serif, Manrope, IBM Plex Mono via Google Fonts).
- `instagram-content-fetch`: parser de RSS estendido para extrair `enclosure`, `media:content`, `media:thumbnail` e `og:image` da página do item; a URL escolhida é guardada em cada slide (`source_image_url`, `source_name`, `source_link`).
- Fallback de imagem por IA passa a pedir paleta petróleo/âmbar, sem texto.
- Novo componente de composição (`CreativeCanvas`) renderiza o slide em HTML/CSS com as regras da marca; usado tanto na prévia quanto na exportação.
- Exportação no navegador via `html-to-image` no momento da aprovação, com upload do PNG para o bucket `instagram-creatives` e gravação em `final_image_urls`.
- Imagens externas são baixadas pela edge function e regravadas no bucket, evitando bloqueio de hotlink e CORS na exportação.

## Observação legal

Imagens de terceiros divulgadas em notícias podem ter direitos do veículo ou da agência. As peças sempre levarão o crédito da fonte, mas a decisão de publicar continua sendo sua na etapa de revisão.
