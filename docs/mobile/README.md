# RJ Despesas — integração mobile

Módulo integrado em `apps/mobile`, preservando `app/`, `components/` e `lib/` do
painel. Scripts existentes e dependências da raiz foram mantidos; o lockfile pnpm
foi ampliado para o workspace, sem substituir pelo lockfile da origem.
O lockfile npm anterior e o ZIP recebido estão preservados em
`docs/mobile/referencia/`. Use pnpm para instalar o workspace.

## Identidade e Supabase

Identidade escolhida pelo usuário:

- Nome: **RJ Despesas**.
- applicationId/namespace: **br.com.rjcompressores.despesasmobile**.
- Origem: `br.com.rjcompressores.despesas`; os identificadores diferentes permitem
  instalar os dois aplicativos no mesmo telefone.

Capacitor, Gradle, strings Android e as duas classes Java usam a nova identidade.
O FileProvider deriva sua autoridade do applicationId. Nome e imagens RJ foram
mantidos conforme o nome escolhido. A coexistência ainda exige teste no aparelho.

O mobile lê somente `NEXT_PUBLIC_SUPABASE_URL` e
`NEXT_PUBLIC_SUPABASE_ANON_KEY` da configuração da raiz. O `.env.local` local foi
configurado com o Supabase fornecido pelo usuário, `cmndhqfifljthmqiqemt.supabase.co`.
O arquivo é ignorado pelo Git. Overrides mobile divergentes são rejeitados,
assim como chaves `service_role`/`sb_secret_`. Não há credenciais ERP no bundle.

## Compatibilidade do banco

Em 10/09/2026, SELECTs com `limit=0` confirmaram as 8 tabelas e 168 colunas da
referência no Supabase destino, sem ler registros. A relação nomeada
`despesas_gestor_aprovador_id_fkey` também foi validada com projeção vazia. O script reproduzível é:

```bash
python3 scripts/mobile/check-supabase.py
```

`lib/supabase/hooks.ts` contém os campos de frota, KM, pagamento e parcelamento
usados pelo módulo; `lib/supabase/database.types.ts` está incompleto e não foi
tratado como schema autoritativo. A regra de consumo foi comparada com
`lib/consumo-frota.ts`; o mobile também usa a janela entre abastecimentos e
apontamentos inteiramente contidos nela.

**Diagnóstico recebido e revisado.** A estrutura é compatível com as operações
mobile testadas, conforme [COMPATIBILIDADE.md](COMPATIBILIDADE.md). Foram incluídos
testes com os tipos, defaults, constraints e políticas informados pelo usuário.
As políticas antigas têm permissões amplas de perfis e comprovantes; a integração
as preserva para não alterar os fluxos do painel. Veja os limites no relatório.

Para atualizar o banco existente, execute inteiro
[../ATUALIZAR_SUPABASE_APP.sql](../ATUALIZAR_SUPABASE_APP.sql) no SQL Editor do
Supabase `cmndhqfifljthmqiqemt`. A cópia versionada é
`supabase/migrations/20260910050000_mobile_integration.sql`; ambas são idênticas.
O SQL usa uma transação e verifica colunas/tipos antes de aplicar as funções mobile.
**Nenhuma migração foi executada no banco remoto nesta integração.**

Os arquivos em [sql-pendente](sql-pendente/README.md) são referências históricas
usadas pelos testes da origem. A migração inicial está apenas em
`apps/mobile/tests/fixtures/initial_schema.reference.sql`;
**nunca a execute no banco existente**.

## Desenvolvimento e testes

```bash
pnpm install --frozen-lockfile
pnpm mobile:dev
pnpm mobile:test
pnpm mobile:build
pnpm --filter @rj/mobile exec playwright install --with-deps chromium
MOBILE_E2E_PORT=5175 pnpm mobile:test:e2e
```

No Codespace desta integração o navegador de teste está em `/tmp/rj-playwright`:
use também `PLAYWRIGHT_BROWSERS_PATH=/tmp/rj-playwright` ao executar E2E.
O modo E2E serve um endereço reservado `.invalid` e bloqueia tráfego HTTPS;
não usa o Supabase real. O build de distribuição exige a configuração do painel.
O painel continua com `pnpm dev` e `pnpm build`.

## Preparar e gerar o APK

O projeto Android já foi sincronizado com `pnpm android:sync`. Não execute
`cap add android`. O bundle contém as telas e funciona sem servidor Next.js.

Requisitos: Node 22+, pnpm, JDK 21, Android SDK Platform 36, Android SDK
Build-Tools e as licenças do SDK aceitas no ambiente de compilação.
Neste Codespace foram preparados JDK 21, SDK em `/tmp/rj-android-sdk` e cache
Gradle em `/tmp/rj-gradle`. As ferramentas em `/tmp` precisam ser reinstaladas
se o ambiente for recriado. Em outras máquinas:

1. Instale o Android SDK com o Android Studio/SDK Manager.
2. Configure `ANDROID_HOME` apontando para o SDK e selecione o JDK 21.
3. Execute a checagem e a geração:

```bash
export JAVA_HOME=/usr/local/sdkman/candidates/java/21.0.12+1-ms
export ANDROID_HOME=/tmp/rj-android-sdk
export GRADLE_USER_HOME=/tmp/rj-gradle
pnpm android:check
pnpm android:apk
```

Os caminhos acima correspondem a este Codespace; ajuste em outras máquinas.
Também é possível indicar `sdk.dir` em `apps/mobile/android/local.properties`,
ignorado pelo Git. `android:apk` verifica o ambiente, recompila o mobile, executa
`cap sync` e chama `./gradlew assembleDebug`.

Saída esperada: `apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk`.
**APK de teste gerado e assinatura verificada em 10/09/2026**: versão Android
0.2.0 (versionCode 2), 8.767.088 bytes. Ver [VALIDACAO.md](VALIDACAO.md).
A operação real ainda depende da aplicação do SQL consolidado e da homologação.
O APK debug usa uma assinatura de desenvolvimento deste ambiente. Para distribuir
uma versão release, crie e guarde uma chave própria; preserve-a nas atualizações.
Não foi criada nem importada chave de assinatura da empresa de origem.

## Homologação

Após aplicar a migração mobile consolidada no Supabase destino, validar no telefone:
login e troca de senha, cadastros por usuário, despesa com câmera offline e reabertura,
reconexão sem duplicação, parcelamento, aprovação/reprovação pelo painel,
correção de despesa reprovada, início/fim de KM e notificação de viagem aberta.
Os testes automatizados não certificam câmera/notificações Android ou políticas reais.

A sincronização ocorre ao abrir/retomar o app e ao reconectar, sem serviço contínuo
com o aplicativo encerrado. A notificação de KM usa cronômetro Android; reabrir o
app restaura o lembrete após reiniciar o telefone. Não limpar dados nem desinstalar
com lançamentos pendentes. Aprovação administrativa e ERP continuam no painel.
