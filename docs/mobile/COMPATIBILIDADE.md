# Revisão do Supabase destino — 10/09/2026

A estrutura informada é compatível com as operações do mobile testadas. A
migração final foi preparada em
[20260910050000_mobile_integration.sql](../../supabase/migrations/20260910050000_mobile_integration.sql),
com cópia idêntica para o SQL Editor em
[ATUALIZAR_SUPABASE_APP.sql](../ATUALIZAR_SUPABASE_APP.sql).
**A migração ainda não foi executada no Supabase remoto.**

## Evidência

Diagnóstico fornecido pelo usuário para o projeto `cmndhqfifljthmqiqemt`:
8 tabelas de negócio, 168 colunas presentes, 31 constraints, 47 políticas,
218 grants e nenhum trigger retornado. As oito tabelas têm RLS habilitado.
Os tipos básicos, defaults, nulabilidade, chaves e checks necessários às
operações foram revisados e reproduzidos em PostgreSQL embarcado (PGlite).

- UUIDs e FKs ligam perfis a Auth, cartões aos usuários, despesas a perfis/tipos/
  cartões/frotas e KM a perfis/frotas. A FK do aprovador mantém a leitura de `nome`.
- Os checks aceitam os status e as quatro formas de pagamento emitidos pela RPC.
- As PKs de despesas, KM e alertas atendem às operações e aos `ON CONFLICT`.
- Nenhuma coluna obrigatória adicional sem default impede os INSERTs mobile.
- As políticas permitem leitura dos próprios cartões, despesas e KM; usuários
  autenticados podem ler tipos e frotas. Os grants correspondentes estão presentes.
- O bucket `comprovantes` é privado, permite 13 MiB e JPEG, PNG, GIF, WebP e PDF.

O snapshot está em `apps/mobile/tests/fixtures/destination-diagnostic.json`,
somente com metadados. `destination-schema.sql` reconstrói a parte relevante
para os testes; Auth/Storage são simulados e o alvo externo `backup_comprovantes`
é representado apenas pela PK. Não contém registros do banco real.
A consulta recebida não inclui precisão/escala numérica, índices independentes,
corpos de funções, nem autenticação com contas reais; os testes não substituem
homologação no Supabase. “Nenhum trigger retornado” descreve o diagnóstico recebido.

## Políticas existentes que exigem atenção

A compatibilidade funcional não significa isolamento completo dos dados:

- `Lookup público de email por usuario` tem `SELECT USING (true)` para `public`.
  Com o grant de SELECT de `anon`, ela permite ler perfis, sem limitar a consulta
  apenas ao email. A tabela inclui campos como telefone, chave_pix e senha;
  nenhum conteúdo dessas colunas foi consultado.
- As quatro políticas antigas de `storage.objects` permitem que qualquer usuário
  autenticado leia, insira, atualize e exclua objetos no bucket `comprovantes`,
  independentemente da pasta do proprietário.
- O usuário pode atualizar seu próprio perfil e suas próprias despesas pelas
  políticas existentes. Elas não impõem as validações de campos da RPC mobile.

A migração **preserva essas políticas do painel**. As políticas mobile são
permissivas e não restringem permissões concedidas pelas antigas. A RPC verifica
proprietário, cartão e caminho do comprovante, mas isso não bloqueia acesso direto
permitido pelas políticas antigas. A revisão dessas permissões requer considerar
os fluxos do painel; ela não foi incluída silenciosamente nesta integração.

## Aplicação

1. Abra o SQL Editor do Supabase `cmndhqfifljthmqiqemt`.
2. Execute inteiro `docs/ATUALIZAR_SUPABASE_APP.sql`.
3. Não execute a fixture inicial nem os três arquivos de referência separadamente.
4. Faça a homologação do login, cadastros, comprovantes, sincronização, reenvio,
   parcelamento e KM com contas reais de funcionário e gestor.

O arquivo consolida offline → observação final de KM → reenvio de despesas em
uma única transação. Antes de alterar objetos, confere a existência e o tipo
básico das 168 colunas revisadas. Se houver divergência, aborta sem aplicar o SQL
mobile. Essa checagem não substitui nova revisão de políticas se o banco mudar.

Cria recibos de sincronização com RLS, funções mobile e duas políticas próprias
de Storage. Não recria tabelas de negócio, não executa o schema inicial e não
remove políticas antigas. O teste de reaplicação compara despesas e políticas
antes/depois para verificar sua preservação.

O APK 0.2.0 já gerado é compatível com esse contrato; a conclusão da revisão SQL
não alterou seu código nem exige gerar outro APK.
