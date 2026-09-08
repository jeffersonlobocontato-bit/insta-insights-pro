# Publicar no LinkedIn com a imagem

O texto já sai certo. A imagem não anexa: hoje o envio usa o caminho antigo de mídia do LinkedIn e o arquivo é enviado por um endereço temporário que provavelmente não está sendo aceito no formato atual. Não há registro de erro guardado, então o primeiro passo é fazer o app registrar exatamente o que o LinkedIn respondeu.

## O que muda

1. Registrar o motivo real da falha
   - Guardar e mostrar na tela a resposta do LinkedIn em cada etapa do envio da imagem (registro, upload, publicação), em vez de silenciosamente publicar só o texto.
   - Quando a imagem falhar, o aviso na Biblioteca passa a dizer o motivo, não apenas "somente texto".

2. Usar a forma atual de enviar imagens
   - Trocar o registro antigo de mídia pela rota atual de imagens do LinkedIn (`/rest/images?action=initializeUpload`), com os cabeçalhos de versão exigidos.
   - Enviar o arquivo para o endereço temporário devolvido, mantendo a passagem pela conexão autorizada (o envio direto não teria credencial).
   - Publicar o post pela rota atual de posts, anexando a imagem devolvida.
   - Se a rota atual não for permitida pelas permissões da conexão, manter a rota antiga como alternativa automática.

3. Verificar de ponta a ponta
   - Testar a função com uma peça aprovada e conferir na resposta se a imagem foi anexada.
   - Se a resposta indicar permissão faltando, abrir a reconexão do LinkedIn pedindo a permissão de publicação necessária.

## Detalhes técnicos

- Arquivo: `supabase/functions/linkedin-publish/index.ts`.
- Fluxo novo: `POST /rest/images?action=initializeUpload` com `{ initializeUploadRequest: { owner: author } }`, cabeçalhos `LinkedIn-Version: 202409` e `X-Restli-Protocol-Version: 2.0.0`; `PUT` do binário no `uploadUrl` retornado (roteado pelo gateway, preservando caminho e query completos); depois `POST /rest/posts` com `content.media = { id: <image urn> }`.
- Fallback: em erro 403/426, repetir o fluxo antigo `/v2/assets?action=registerUpload` + `/v2/ugcPosts`.
- A resposta da função passa a incluir `image_error` (status + corpo) quando o anexo falhar; `src/pages/Library.tsx` mostra esse texto no aviso.
- Nenhuma mudança de banco de dados.
