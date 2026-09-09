# Extrato de custo por ciclo + agente com preset

Duas entregas ligadas: registrar quanto custa cada rodada de criação e permitir rodar o agente com um preset seu (opcionalmente na sua conta OpenAI).

## 1. Extrato de custo por ciclo

Hoje cada rodada grava tema, imagens e peças, mas não grava consumo. Vamos passar a registrar, a cada chamada de IA dentro da rodada:

- etapa (escolha do tema, escrita das peças, geração de imagem)
- modelo usado
- tokens de entrada e saída (ou número de imagens)
- custo estimado em dólar e em real
- duração

No painel admin entra uma aba **Custos** com:

- custo total do mês e média por rodada
- lista de rodadas com data, tema, nº de peças, nº de imagens e custo
- ao abrir uma rodada, o detalhamento linha a linha das chamadas
- filtro por período e exportação em CSV

Cada peça na fila de revisão e na Biblioteca passa a mostrar seu custo proporcional.

## 2. Quanto custa hoje e quanto cairia

Estimativa por rodada completa (1 card + 1 carrossel de 5 + 1 story), com imagens das notícias reaproveitadas:

- Hoje (IA inclusa da plataforma): cerca de US$ 0,10 a 0,45 por rodada; se precisar gerar até 6 fundos por IA, sobe para algo entre US$ 0,30 e 0,90.
- Com sua chave OpenAI e modelo de texto leve, mantendo as imagens como estão hoje: cerca de US$ 0,01 a 0,04 por rodada — queda de aproximadamente 80% a 90%.
- Com sua chave OpenAI gerando também as imagens em qualidade baixa/média: cerca de US$ 0,05 a 0,25 por rodada.

Os números exatos só aparecem depois que o extrato estiver rodando; o painel vai mostrar o valor real de cada rodada, não a estimativa.

## 3. Agente com preset

Nova tela **Agente** no admin:

- instruções do agente (texto editável, já preenchido com o padrão atual da marca)
- escolha do modelo de texto e do modelo de imagem
- quais formatos gerar na rodada (card, carrossel, story) e quantos slides
- teto de imagens geradas por rodada
- vários presets nomeados, com um marcado como padrão
- botão "Rodar agora com este preset", com o custo estimado antes de confirmar

Se você optar por usar sua própria conta OpenAI, abro um campo seguro para colar a chave; ela fica guardada apenas no servidor e nunca aparece no navegador. Enquanto não houver chave, tudo continua na IA inclusa da plataforma.

## Detalhes técnicos

- Novas tabelas: `ai_usage_events` (run_id, etapa, provider, modelo, tokens in/out, imagens, custo_usd, custo_brl, duração) e `agent_presets` (nome, instruções, modelos, formatos, limites, padrão, owner). RLS restrita a admin, com GRANTs para `authenticated` e `service_role`; inserções feitas pela função via service role.
- Tabela de preços por modelo em código (`_shared/pricing.ts`), com cotação USD→BRL configurável, para calcular custo a partir dos tokens retornados pelo gateway.
- `instagram-content-fetch` passa a ler o preset ativo, aceitar `preset_id` no corpo e gravar um evento de uso por chamada de IA; totais agregados em `instagram_runs` (`cost_usd`, `tokens_total`, `image_count`).
- Se a chave OpenAI própria for ativada, adiciono `OPENAI_API_KEY` como secret e o provider passa a ser escolhido pelo preset; sem chave, segue no gateway atual.
- Novas telas em `src/pages/Costs.tsx` e `src/pages/Agent.tsx`, rotas `/custos` e `/agente`, links no admin.
