# Validação da integração — 10/09/2026

**Estado atual:** diagnóstico completo revisado, migração consolidada preparada,
31 testes passaram e TypeScript mobile passou. Nenhuma migração remota executada.
Veja [COMPATIBILIDADE.md](COMPATIBILIDADE.md). As seções abaixo preservam o histórico.

- Branch: `feat/integracao-mobile`.
- `pnpm install`: workspace instalado; lockfile da raiz preservado e ampliado.
  Versões diretas do painel mantidas; Next.js passou a registrar Playwright como
  peer opcional no lockfile. pnpm fixado em 11.24.0.
- `pnpm mobile:test`: **22 testes passaram** (fila/offline, duração, contrato SQL
  em PGlite e isolamento da configuração Supabase).
- `pnpm mobile:test:e2e`: **3 testes passaram**, com Chromium: despesa com foto e
  viagem offline persistidas após reload, preservação do formulário/foto ao
  navegar e correção de despesa reprovada sem duplicação.
- `pnpm mobile:build`: passou, incluindo TypeScript estrito. Vite emitiu apenas
  aviso sobre chunk acima de 500 kB.
- `pnpm android:sync`: passou com a nova identidade e caminhos nativos regenerados.
- `pnpm build`: build do painel passou, incluindo 31 páginas estáticas. A
  configuração preexistente `ignoreBuildErrors: true` permanece igual.
- `tsc --noEmit --incremental false` no painel: **191 diagnósticos preexistentes**.
  Comparação com checkout de `HEAD` em `/tmp/rj-painel-baseline`, usando as mesmas
  dependências: saídas idênticas após normalizar o caminho do repositório.
  Nenhum diagnóstico novo da integração. Logs em `/tmp/rj-painel-*-tsc.log`.
- Supabase destino: 8 tabelas / 168 colunas da referência e relação do aprovador
  responderam HTTP 200 a projeções `limit=0`. Nenhum registro foi lido ou alterado.
- Tipos, constraints, triggers e políticas do banco real: pendentes do resultado
  de `CONFERIR_SUPABASE.sql`; SQLs mobile mantidos fora do fluxo de implantação.
- Nenhuma migração remota executada. O schema inicial é fixture exclusiva de testes.

As falhas iniciais de rede/porta e bibliotecas do Chromium foram resolvidas com
as permissões do ambiente e a instalação das dependências de sistema.

## APK

- `pnpm android:apk`: **BUILD SUCCESSFUL**, 153 tarefas executadas.
- Ambiente: JDK 21, Android SDK Platform 36, Build-Tools 35.0.0, Gradle 8.14.3.
- Arquivo: `apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk`.
- Tamanho: 8.767.088 bytes.
- `aapt dump badging`: nome **RJ Despesas**, pacote
  **br.com.rjcompressores.despesasmobile**, versão **0.2.0**, versionCode **2**,
  minSdk **24**, targetSdk **36**.
- `apksigner verify --verbose`: assinatura válida (APK Signature Scheme v2).
- SHA-256: `cfd199c06d7e61449907c71bafe65bde13ddd558618b1fa083faca19b619dc5c`.
- Assinatura debug gerada neste ambiente; nenhuma chave da origem foi importada.
- Nenhum teste em telefone/emulador Android foi executado. Câmera, notificações,
  coexistência e autenticação/sincronização reais permanecem para homologação.

## Retorno do Storage recebido

O resultado enviado pelo usuário confirmou o bucket `comprovantes` privado,
limite de 13.631.488 bytes e MIME types JPEG, PNG, GIF, WebP e PDF, todos
compatíveis com a proposta mobile. Esse retorno não inclui tabelas, constraints
ou políticas. A consulta de diagnóstico agora reúne as oito verificações em
um único JSON para evitar que apenas o último resultado seja compartilhado.
A revisão completa das migrações continua pendente.

## Revisão concluída após receber o diagnóstico completo

- Snapshot com 168 colunas, 31 constraints, 47 políticas e 218 grants revisado.
- `destination.test.ts`: 9 testes usando a estrutura do destino, constraints,
  RLS e grants relevantes; inclui reenvio, parcelas, KM, validação de recibos,
  reaplicação preservando dados/políticas e bloqueio de schema divergente.
- `pnpm mobile:test`: **31 testes passaram** no total.
- `pnpm --filter @rj/mobile exec tsc --noEmit`: passou.
- `docs/ATUALIZAR_SUPABASE_APP.sql` e a migração versionada têm conteúdo idêntico.
- Migração inicial excluída do fluxo de implantação; nenhuma alteração remota.
- Políticas antigas amplas documentadas e preservadas. Os testes de origem que
  verificam isolamento de pastas não representam a política efetiva do destino;
  o teste de destino reproduz expressamente a permissão antiga de upload amplo.
- Código de execução do APK não mudou nesta revisão; build Android e E2E já
  validados anteriormente permanecem aplicáveis.

## Integração com a main atual — 19/10/2026

Base atualizada para `2e9db00` (PR #104), incorporando os 43 commits que faltavam
no ambiente local. Alterações locais reaplicadas sem conflitos na branch
`feat/integracao-mobile-atualizada`.

- Instalação do workspace com lockfile congelado concluída.
- Mobile: 31 testes passaram; build com TypeScript estrito passou.
- Navegador: 3 testes E2E passaram.
- Painel: build passou, gerando 32 páginas, com a configuração preexistente
  de ignorar erros TypeScript mantida.
- As rotas de login/perfil e seus testes são enviados em commit próprio.
- Nenhuma migração foi executada remotamente.
- Credenciais, dependências e builds continuam fora do Git.
- ZIP de transferência e lockfile npm anterior preservados em `referencia/`.
