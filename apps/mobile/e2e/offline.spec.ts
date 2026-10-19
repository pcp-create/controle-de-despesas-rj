import { expect, test } from "@playwright/test";

test("records expenses with photos and a complete trip offline, preserving them across reload", async ({
  page,
  context,
}) => {
  // Real UI and IndexedDB; never connect this test to production services.
  await context.route("https://**", (route) => route.abort());
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Entrar na sua conta" }),
  ).toBeVisible();
  await page.evaluate(async () => {
    const path = "/src/db.ts";
    const { db } = await import(path);
    const id = "0994bd2a-1e14-42b0-ad50-0d5f43e3cd35";
    await db.profiles.put({
      id,
      nome: "Técnico Teste",
      usuario: "tecnico",
      perfil: "funcionario",
      ativo: true,
      primeiro_acesso: false,
      frota_padrao_id: "fleet",
    });
    await db.catalogs.put({
      owner: id,
      types: [
        {
          id: "type",
          nome: "Alimentação",
          ativo: true,
          exige_comprovante: true,
          calcula_diarias: false,
          limite_maximo: 100,
        },
      ],
      cards: [],
      fleets: [
        {
          id: "fleet",
          placa: "TEST001",
          modelo: "Veículo teste",
          quilometragem: 100,
          ativo: true,
        },
      ],
      refreshed: new Date().toISOString(),
    });
    localStorage.setItem("rj-mobile-active-user", id);
  });
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Olá, Técnico." }),
  ).toBeVisible();
  await context.setOffline(true);
  await page.getByRole("button", { name: "Nova despesa", exact: true }).click();
  await page
    .getByRole("combobox", { name: "Tipo de Despesa", exact: true })
    .selectOption("type");
  await page.getByLabel("Valor total (R$)").fill("4590");
  await expect(page.getByLabel("Valor total (R$)")).toHaveValue("45,90");
  await page.getByRole("combobox", { name: "Tipo de documento", exact: true }).selectOption("Cupom");
  await page
    .getByRole("radio", { name: "Dinheiro", exact: true })
    .check();
  await page.getByLabel("Escolher arquivo").setInputFiles({
    name: "foto.jpg",
    mimeType: "image/jpeg",
    buffer: Buffer.from("offline photo fixture"),
  });
  await page
    .getByRole("button", { name: "Salvar e enviar quando conectar" })
    .click();
  await expect(
    page.getByText("Aguardando envio", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Registrar KM", exact: true }).click();
  await expect(page.getByRole("spinbutton", { name: "KM inicial", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Iniciar Viagem", exact: true }).click();
  await page.getByRole("spinbutton", { name: "KM inicial", exact: true }).fill("100");
  await page.getByRole("textbox", { name: "Destino", exact: true }).fill("Cliente teste");
  await page
    .getByRole("button", { name: "Iniciar viagem", exact: true })
    .click();
  await expect(page.getByLabel("Duração da viagem").first()).toBeVisible();
  await expect(page.getByRole("spinbutton", { name: "KM final", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Finalizar", exact: true }).click();
  await page.getByRole("button", { name: "Cancelar" }).click();
  await expect(page.getByRole("spinbutton", { name: "KM final", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Início", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "KM em aberto" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Abrir viagem", exact: true }).click();
  await page.getByRole("button", { name: "Finalizar", exact: true }).click();
  await page.getByRole("spinbutton", { name: "KM final", exact: true }).fill("135");
  await expect(page.getByText("Percorrido: 35 km", { exact: true })).toBeVisible();
  await page.getByLabel("Observação final", { exact: true }).fill("Retorno ao escritório");
  await expect(page.getByRole("textbox", { name: "Ocorrência", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Sim", exact: true }).click();
  await page.getByRole("textbox", { name: "Ocorrência", exact: true }).fill("Trânsito intenso");
  await page
    .getByRole("button", { name: "Finalizar viagem", exact: true })
    .click();
  await expect(page.getByText("Finalizada", { exact: true })).toBeVisible();
  await expect(page.getByText("135 km", { exact: true })).toBeVisible();
  await expect(page.getByRole("cell", { name: "35 km", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Sincronizar", exact: true }).click();
  await expect(page.getByText("3 pendente(s)", { exact: true })).toBeVisible();
  await page.screenshot({
    path: "test-results/android-offline.png",
    fullPage: true,
  });
  await context.setOffline(false);
  await page.reload();
  await expect(page.getByText("3 pendente(s)", { exact: true })).toBeVisible();
  const persisted = await page.evaluate(async () => {
    const path = "/src/db.ts";
    const { db } = await import(path);
    return {
      count: await db.operations.count(),
      photos: await db.attachments.count(),
      trips: await db.trips.toArray(),
    };
  });
  expect(persisted.count).toBe(3);
  expect(persisted.photos).toBe(1);
  expect(persisted.trips[0].data.status).toBe("finalizado");
  expect(persisted.trips[0].data.km_final).toBe(135);
  expect(persisted.trips[0].data.observacao).toBe("Retorno ao escritório");
  expect(persisted.trips[0].data.ocorrencia).toBe("Trânsito intenso");
});

test("preserves the photo and form when navigating away before saving", async ({
  page,
  context,
}) => {
  await context.route("https://**", (route) => route.abort());
  await page.goto("/");
  await page.evaluate(async () => {
    const path = "/src/db.ts";
    const { db } = await import(path);
    const id = "draft-owner";
    await db.profiles.put({
      id,
      nome: "Teste",
      usuario: "test",
      perfil: "funcionario",
      ativo: true,
      primeiro_acesso: false,
    });
    await db.catalogs.put({
      owner: id,
      types: [
        {
          id: "type",
          nome: "Alimentação",
          ativo: true,
          exige_comprovante: true,
        },
      ],
      cards: [],
      fleets: [],
      refreshed: new Date().toISOString(),
    });
    localStorage.setItem("rj-mobile-active-user", id);
  });
  await page.reload();
  await page.getByRole("button", { name: "Nova despesa", exact: true }).click();
  await page.getByLabel("Valor total (R$)").fill("8800");
  await page.getByLabel("Escolher arquivo").setInputFiles({
    name: "rascunho.jpg",
    mimeType: "image/jpeg",
    buffer: Buffer.from("draft"),
  });
  await expect(page.getByText("rascunho.jpg", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Início", exact: true }).click();
  await page.getByRole("button", { name: "Nova despesa", exact: true }).click();
  await expect(page.getByLabel("Valor total (R$)")).toHaveValue("88,00");
  await expect(page.getByText("rascunho.jpg", { exact: true })).toBeVisible();
});

test("corrects a rejected expense without duplicating it", async ({ page, context }) => {
  await context.route("https://**", route => route.abort());
  await page.goto("/");
  await page.evaluate(async () => {
    const path = "/src/db.ts";
    const { db } = await import(path);
    const owner = "correction-owner";
    await db.profiles.put({ id: owner, nome: "Teste", usuario: "test", perfil: "funcionario", ativo: true, primeiro_acesso: false });
    await db.catalogs.put({ owner, types: [{ id: "type", nome: "Alimentação", ativo: true, exige_comprovante: false }], cards: [], fleets: [], refreshed: new Date().toISOString() });
    await db.expenses.put({ key: `${owner}:expense`, owner, pending: false, data: { id: "expense", tipo_despesa_id: "type", valor: 20, data_despesa: "2026-09-10", hora_despesa: "10:00", data_vencimento: "2026-10-19", cliente: "Cliente", documento: "Cupom", pagamento_tipo: "dinheiro", status_aprovacao: "Reprovado", justificativa_reprovacao: "Corrija o cliente", updated_at: new Date().toISOString() } });
    localStorage.setItem("rj-mobile-active-user", owner);
  });
  await page.reload();
  await context.setOffline(true);
  await expect(page.getByText("Motivo: Corrija o cliente", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Ações da despesa" }).click();
  await page.getByRole("button", { name: "Ajustar e reenviar" }).click();
  await page.getByLabel("Cliente", { exact: true }).fill("Cliente corrigido");
  await page.getByRole("button", { name: "Enviar novamente para aprovação" }).click();
  await expect(page.getByText("Aguardando envio", { exact: true })).toBeVisible();
  const result = await page.evaluate(async () => {
    const path = "/src/db.ts";
    const { db } = await import(path);
    return { records: await db.expenses.toArray(), operations: await db.operations.toArray() };
  });
  expect(result.records).toHaveLength(1);
  expect(result.operations[0].kind).toBe("expense.resubmit");
  expect(result.operations[0].payload.cliente).toBe("Cliente corrigido");
});
