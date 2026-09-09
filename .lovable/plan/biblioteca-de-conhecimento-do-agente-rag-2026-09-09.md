# Biblioteca de conhecimento do agente (RAG)

Nova aba dentro de **Agente**, onde você envia e consulta todos os documentos que ensinam o agente a escrever e desenhar como a marca.

## O que você vai poder fazer

- Enviar arquivos em PDF, Word (.docx), texto (.txt/.md) — ou colar o texto direto.
- Classificar cada documento por tipo:
  - Manual da marca
  - Design system
  - Manual de redação
  - Padrão semântico de copy
  - Padrão sintático de copy
  - Padrão lexical de copy
  - Policies
  - Guardrails
- Ver a lista com nome, tipo, tamanho, data de envio e situação do processamento (enviado → processando → pronto → falhou).
- Abrir/baixar o arquivo original, editar o tipo, ativar/desativar (desativado deixa de influenciar as gerações) e excluir.
- Campo de busca de teste: você digita um tema e vê quais trechos o agente traria — assim dá para conferir se o material está sendo entendido.
- Documentos ficam ligados ao preset: "usar em todos os presets" ou só no preset escolhido.

Observação: PDFs escaneados (foto de página, sem texto selecionável) não conseguem ser lidos; nesse caso o item aparece como falha e você pode colar o texto.

## Como o agente passa a usar

Em cada rodada de criação:

1. Policies e Guardrails ativos entram sempre por inteiro (são curtos e são regras duras).
2. Dos manuais longos, o sistema busca automaticamente os trechos mais ligados ao tema do dia e injeta só eles nas instruções.
3. O texto gerado passa por uma verificação final contra os Guardrails antes de virar peça na fila de revisão.

O custo dessa busca é pequeno e entra no extrato da aba **Custos** como uma etapa própria, junto do resto da rodada.

## Detalhes técnicos

**Banco (nova migration)**
- `pgvector` habilitado.
- `knowledge_documents`: id, título, `doc_type` (enum das 8 categorias), `source_type` (upload/colado), `storage_path`, `mime`, `bytes`, `char_count`, `status` (pending/processing/ready/failed), `error_message`, `active`, `preset_id` (nullable = vale para todos), `created_by`, timestamps.
- `knowledge_chunks`: id, `document_id` (cascade), `chunk_index`, `content`, `embedding vector(3072)`, `tokens`. Índice HNSW sobre `(embedding::halfvec(3072)) halfvec_cosine_ops`.
- Função `match_knowledge_chunks(query_embedding, match_count, doc_types text[], preset uuid)` retornando conteúdo + similaridade.
- RLS: só admin (`has_role`), com `GRANT SELECT/INSERT/UPDATE/DELETE ... TO authenticated` e `GRANT ALL ... TO service_role` em ambas as tabelas.
- Bucket privado `knowledge-docs` (limite 20MB) criado via ferramenta de storage, com policies em `storage.objects` restritas a admin.

**Edge functions**
- `knowledge-ingest`: recebe `document_id`, baixa o arquivo do bucket, extrai texto (PDF via `unpdf`, DOCX via descompactação do `word/document.xml`, texto puro direto), divide em blocos de ~1200 caracteres com sobreposição de 150, gera embeddings em lotes de até 100 com `google/gemini-embedding-2` no Lovable AI Gateway, grava os chunks e atualiza o status. Erros do gateway seguem a semântica padrão (retry só em 429/5xx).
- `knowledge-search`: usada pela busca de teste na UI; embeda a consulta e retorna os trechos.
- `instagram-content-fetch`: antes de montar o prompt, carrega policies/guardrails ativos por inteiro e chama `match_knowledge_chunks` com o tema do dia (top 8 trechos); registra o consumo em `ai_usage_events` com `step = 'knowledge_retrieval'`.

**Frontend**
- `src/pages/Agent.tsx` passa a ter abas (`Tabs` do shadcn): "Preset" (conteúdo atual) e "Biblioteca".
- Novo componente `src/components/KnowledgeLibrary.tsx`: upload (drag & drop + seletor), formulário de texto colado, lista com filtros por tipo, ações de editar/ativar/excluir, painel de busca de teste. Estilo seguindo a identidade já existente (tokens do design system, sem cores fixas).
