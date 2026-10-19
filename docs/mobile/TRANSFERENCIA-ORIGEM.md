# Transferir o aplicativo para outro projeto

Este pacote contém o módulo móvel usado no APK 0.2.0, testes, projeto Android e
migrações. Não contém credenciais, dados de usuários, APK, dependências instaladas,
cache de build ou chave de assinatura. A marca RJ continua nos arquivos como
referência; adapte-a à segunda empresa.

## 1. Abrir a segunda conta sem misturar sessões

Use um perfil separado do navegador (ou janela anônima). Entre no GitHub com a
segunda conta, abra o repositório de destino e escolha Code → Codespaces → Create
codespace on main (ou a branch desejada). Continue no VS Code do navegador desse
perfil. Assim este Codespace e suas credenciais permanecem separados.

No Explorer do novo Codespace, envie este ZIP para a raiz do repositório usando
Upload ou arrastando o arquivo. Extraia em uma pasta temporária:

    unzip RJ-Mobile-Transferencia.zip -d /tmp/rj-transferencia

O conteúdo estará em /tmp/rj-transferencia/RJ-Mobile-Transferencia.
Não extraia diretamente por cima dos arquivos do outro projeto.

## 2. Integrar o código

Crie uma branch de trabalho. Leia as instruções AGENTS.md do repositório destino.
Copie apps/mobile para apps/mobile do destino, se esse módulo ainda não existir.
Se existir, compare e mescle os arquivos. Preserve o painel web e as alterações
locais do segundo projeto.

Mescle as entradas de integracao/package-scripts.json no campo scripts do
package.json da raiz. Não substitua o package.json inteiro. Inclua apps/* no
pnpm-workspace.yaml existente (ou use o exemplo em integracao/). Acrescente as
regras de integracao/gitignore-mobile.txt ao .gitignore.

O pnpm-lock de origem está em referencia/ apenas para consulta às versões usadas.
Não substitua o lockfile do outro projeto. Execute pnpm install na raiz para
resolver o workspace de destino e confira o diff do lockfile.

## 3. Supabase da segunda empresa

Copie apps/mobile/.env.example para apps/mobile/.env.local e preencha SOMENTE a
URL e a chave pública do SEGUNDO Supabase. Não reutilize os valores do primeiro.
Não use service_role. O arquivo local tem prioridade sobre o .env.local da raiz.

Compare o banco destino com a estrutura de supabase/migrations. A migração
20260910002000_initial_schema.sql é uma referência exigida pelos testes locais;
NÃO a execute novamente num banco existente. As migrações móveis pressupõem as
mesmas tabelas, colunas e regras de negócio. Se houver diferenças, adapte antes.

Após conferir a compatibilidade, use docs/ATUALIZAR_SUPABASE_APP.sql no SQL Editor
do SEGUNDO Supabase. Ele reúne as migrações móveis na ordem certa, sem recriar o
schema inicial. Não execute automaticamente sem conferir qual projeto está aberto.
Confira usuários Auth/perfis, cartões por usuário, tipos de despesa, veículos e
políticas de leitura existentes. Os nomes dos aprovadores dependem da leitura da
relação despesas.gestor_aprovador_id → profiles.nome.

## 4. Identidade própria do novo Android

Defina um applicationId diferente, por exemplo br.com.suaempresa.despesas, para
instalar os dois aplicativos no mesmo telefone. Atualize de forma consistente:

- apps/mobile/capacitor.config.ts: appId e appName.
- android/app/build.gradle: applicationId e namespace.
- android/app/src/main/res/values/strings.xml: nomes, package_name e custom_url_scheme.
- Declaração package e diretórios das classes Java em android/app/src/main/java.
- Logo em apps/mobile/public, nomes em Login.tsx e ícones Android em res/mipmap-*.

Não execute cap add android sobre o projeto existente. cap sync não renomeia o
applicationId de um projeto Android já criado. Crie e mantenha uma chave de
assinatura própria para o segundo app; atualizações futuras precisam da mesma
chave. A chave da primeira empresa não está no pacote.

## 5. Testar e gerar

    pnpm install
    pnpm mobile:dev

Abra a porta 5173 em Ports → Open in Browser. Depois:

    pnpm mobile:test
    pnpm mobile:build
    pnpm --filter @rj/mobile exec playwright install --with-deps chromium
    MOBILE_E2E_PORT=5175 pnpm --filter @rj/mobile test:e2e

Para compilar Android, use Node 22+, JDK 21 e Android SDK 36, com JAVA_HOME e
ANDROID_HOME configurados nesse novo ambiente. O SDK instalado no Codespace
original não é transferido.

    pnpm android:apk

O comando executa cap sync, regenerando também os caminhos das dependências
nativas. APK: apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk.
Teste no telefone login, envio offline, câmera, aprovação/reprovação, parcelamento,
KM e notificações. Veja docs/ANDROID.md para limites e detalhes.

## Mensagem para iniciar o trabalho no novo projeto

Adapte o módulo apps/mobile deste pacote ao repositório atual. Mantenha as contas,
credenciais, Supabase e identidade Android separados do projeto de origem. Leia
LEIA-ME.md do pacote, compare os schemas e integre scripts/dependências sem
sobrescrever o painel. Use somente o Supabase deste projeto, peça o nome e o
applicationId da nova empresa se ainda não estiverem definidos. Não execute a
migração inicial no banco existente. Valide a integração e prepare o novo APK.
