import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

type JsonObject = Record<string, unknown>;

type M8ErrorItem = {
  message?: string;
  mensagem?: string;
  error?: string;
  stackTrace?: string;
};

type M8Response<T = unknown> = {
  data?: T;
  errors?: M8ErrorItem[] | string[];
  message?: string;
  mensagem?: string;
  error?: string;
};

class IntegracaoError extends Error {
  etapa: number;
  statusHttp?: number;
  resposta?: unknown;

  constructor(
    etapa: number,
    message: string,
    options?: { statusHttp?: number; resposta?: unknown }
  ) {
    super(message);
    this.name = "IntegracaoError";
    this.etapa = etapa;
    this.statusHttp = options?.statusHttp;
    this.resposta = options?.resposta;
  }
}

function normalizarBaseUrl(url: string): string {
  return url.replace(/\/+$/, "");
}

function aguardar(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function paraNumero(valor: unknown): number | null {
  if (valor === null || valor === undefined || valor === "") return null;
  const numero = Number(valor);
  return Number.isFinite(numero) ? numero : null;
}

function paraIso(valor: unknown, nomeCampo: string): string {
  if (!valor) throw new Error(`${nomeCampo} não informado.`);

  const str = String(valor).trim();

  // Se o valor for apenas uma data (YYYY-MM-DD), constrói sem deslocamento de fuso
  // evitando que "2026-07-22" vire "2026-07-21T21:00:00.000Z" (UTC-3)
  const apenasData = /^\d{4}-\d{2}-\d{2}$/.test(str);
  if (apenasData) {
    const [ano, mes, dia] = str.split("-").map(Number);
    // Usa horário meio-dia BRT (15:00 UTC) para garantir que a data nunca "vire" o dia
    return new Date(Date.UTC(ano, mes - 1, dia, 15, 0, 0)).toISOString();
  }

  const data = new Date(str);
  if (Number.isNaN(data.getTime())) {
    throw new Error(`${nomeCampo} inválido: ${str}`);
  }

  return data.toISOString();
}

function valorTexto(valor: unknown): string {
  if (valor === null || valor === undefined || valor === "") {
    return "Não informado";
  }
  return String(valor);
}

function formatarValorBR(valor: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(valor);
}

function formatarDataBR(
  valor: unknown,
  incluirHora = false
): string {
  if (!valor) return "Não informado";

  const data = new Date(String(valor));
  if (Number.isNaN(data.getTime())) return valorTexto(valor);

  if (incluirHora) {
    return data.toLocaleString("pt-BR", {
      timeZone: "America/Sao_Paulo",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  return data.toLocaleDateString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatarCartao(cartao: any): string {
  if (!cartao) return "Não informado";

  const identificacao =
    cartao.nome ||
    cartao.apelido ||
    cartao.descricao ||
    cartao.bandeira ||
    null;

  const ultimosDigitos =
    cartao.ultimos_digitos ||
    cartao.ultimosDigitos ||
    cartao.final ||
    null;

  if (identificacao && ultimosDigitos) {
    return `${identificacao} - final ${ultimosDigitos}`;
  }

  if (ultimosDigitos) return `Final ${ultimosDigitos}`;
  if (identificacao) return String(identificacao);

  return "Não informado";
}

function montarResumoDespesa(
  despesa: any,
  tipo: any,
  tecnico: any,
  aprovador: any,
  cartao: any
): string {
  const dataDespesa = formatarDataBR(despesa.data_despesa);
  const dataAprovacao = formatarDataBR(despesa.data_aprovacao, true);

  return [
    `Funcionário: ${valorTexto(tecnico?.nome || tecnico?.full_name)}`,
    `Data da despesa: ${dataDespesa}`,
    `Tipo: ${valorTexto(tipo?.nome)}`,
    `Pagamento: ${valorTexto(despesa.pagamento_tipo)}`,
    `Cartão: ${formatarCartao(cartao)}`,
    `Cliente: ${valorTexto(despesa.cliente)}`,
    `OS: ${valorTexto(despesa.numero_os)}`,
    `Valor: ${formatarValorBR(Number(despesa.valor || 0))}`,
    `Observação: ${valorTexto(despesa.observacao)}`,
    `Data aprovação: ${dataAprovacao}`,
    `Aprovado por: ${valorTexto(aprovador?.nome || aprovador?.full_name)}`,
  ].join(" | ");
}

async function salvarProgresso(
  supabase: SupabaseClient,
  despesaId: string,
  campos: JsonObject
): Promise<void> {
  const { error } = await supabase
    .from("despesas")
    .update({ ...campos, updated_at: new Date().toISOString() })
    .eq("id", despesaId);

  if (error) {
    throw new Error(`Erro ao salvar o progresso da integração: ${error.message}`);
  }
}

async function obterNumeroDocumentoErp(
  supabase: SupabaseClient,
  despesaId: string,
  numeroExistente: unknown
): Promise<number> {
  const existente = paraNumero(numeroExistente);
  if (existente && existente >= 1) return existente;

  const { data, error } = await supabase.rpc("proximo_numero_documento_erp");

  if (error) {
    throw new IntegracaoError(
      2,
      `Não foi possível gerar o número sequencial do documento ERP: ${error.message}`
    );
  }

  const numero = paraNumero(data);
  if (!numero || numero < 1) {
    throw new IntegracaoError(
      2,
      `A função proximo_numero_documento_erp retornou um valor inválido: ${String(data)}`
    );
  }

  // Salva antes de chamar o M8. Assim uma nova tentativa reutiliza o mesmo número.
  await salvarProgresso(supabase, despesaId, {
    numero_documento_erp: numero,
  });

  return numero;
}

function extrairMensagemM8(body: unknown, status: number): string {
  if (!body) {
    return `Erro HTTP ${status} retornado pelo M8 sem conteúdo na resposta.`;
  }

  const resposta = body as M8Response;

  const mensagens = Array.isArray(resposta?.errors)
    ? resposta.errors
        .map((erro) => {
          if (typeof erro === "string") return erro;
          return erro?.message || erro?.mensagem || erro?.error || JSON.stringify(erro);
        })
        .filter(Boolean)
    : [];

  if (mensagens.length > 0) return mensagens.join(" | ");
  if (resposta?.message) return resposta.message;
  if (resposta?.mensagem) return resposta.mensagem;
  if (resposta?.error) return resposta.error;

  return `Erro HTTP ${status} retornado pelo M8. Resposta: ${JSON.stringify(body).slice(0, 1500)}`;
}

async function m8Request<T>(
  etapa: number,
  url: string,
  token: string | null,
  options: {
    method?: "POST" | "PUT" | "GET";
    body?: JsonObject;
    autenticado?: boolean;
  } = {}
): Promise<{ data: T; respostaCompleta: unknown; status: number }> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };

  if (options.autenticado !== false) {
    if (!token) throw new IntegracaoError(etapa, "Token M8 não disponível.");
    headers.Authorization = `Bearer ${token}`;
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method: options.method || "POST",
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
      cache: "no-store",
    });
  } catch (error: any) {
    const causa = error?.cause?.message || error?.message || "Erro desconhecido";
    throw new IntegracaoError(etapa, `Falha de conexão com o M8: ${causa}`);
  }

  const raw = await response.text();
  console.log(`[M8][Etapa ${etapa}] HTTP ${response.status}`);
  console.log(`[M8][Etapa ${etapa}] Resposta:`, raw || "<vazia>");

  let parsed: unknown = null;
  if (raw) {
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = { message: raw };
    }
  }

  const respostaM8 = parsed as M8Response<T>;
  const possuiErros =
    Array.isArray(respostaM8?.errors) && respostaM8.errors.length > 0;

  if (!response.ok || possuiErros) {
    throw new IntegracaoError(etapa, extrairMensagemM8(parsed, response.status), {
      statusHttp: response.status,
      resposta: parsed,
    });
  }

  return {
    data: respostaM8?.data as T,
    respostaCompleta: parsed,
    status: response.status,
  };
}

export async function POST(request: Request) {
  if (!supabaseUrl || !supabaseServiceKey) {
    return NextResponse.json(
      { error: "Variáveis do Supabase não configuradas." },
      { status: 500 }
    );
  }

  const M8_API_URL = process.env.M8_API_URL;
  const M8_TENANT = process.env.M8_TENANT;
  const M8_USERNAME = process.env.M8_USERNAME;
  const M8_PASSWORD = process.env.M8_PASSWORD;
  const M8_COMPANY = process.env.M8_COMPANY;
  const M8_DOMAIN = process.env.M8_DOMAIN;

  const variaveis = {
    M8_API_URL,
    M8_TENANT,
    M8_USERNAME,
    M8_PASSWORD,
    M8_COMPANY,
    M8_DOMAIN,
  };

  const varsFaltando = Object.entries(variaveis)
    .filter(([, valor]) => !valor)
    .map(([nome]) => nome);

  if (varsFaltando.length > 0) {
    return NextResponse.json(
      {
        error: `Variáveis de ambiente não configuradas: ${varsFaltando.join(", ")}`,
        etapa: null,
      },
      { status: 503 }
    );
  }

  let requestBody: { despesaId?: string; userId?: string };
  try {
    requestBody = await request.json();
  } catch {
    return NextResponse.json({ error: "Body JSON inválido." }, { status: 400 });
  }

  const { despesaId, userId } = requestBody;
  if (!despesaId || !userId) {
    return NextResponse.json(
      { error: "despesaId e userId são obrigatórios." },
      { status: 400 }
    );
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: despesa, error: despesaErr } = await supabase
    .from("despesas")
    .select(`
      *,
      tipo:tipos_despesa(*),
      tecnico:profiles!despesas_tecnico_id_fkey(*),
      aprovador:profiles!despesas_gestor_aprovador_id_fkey(*)
    `)
    .eq("id", despesaId)
    .single();

  if (despesaErr || !despesa) {
    return NextResponse.json(
      { error: despesaErr?.message || "Despesa não encontrada." },
      { status: 404 }
    );
  }

  if (despesa.erp_status === "processando") {
    return NextResponse.json(
      { error: "Integração já está em andamento." },
      { status: 409 }
    );
  }

  if (despesa.erp_status === "integrado" && despesa.lancado_erp === true) {
    return NextResponse.json(
      { error: "Despesa já integrada ao ERP M8." },
      { status: 409 }
    );
  }

  const tipo = despesa.tipo as any;
  const tecnico = despesa.tecnico as any;
  const aprovador = despesa.aprovador as any;

  // Busca os dados do cartão vinculado à despesa.
  // O select("*") evita dependência de outros nomes de campos além de ultimos_digitos.
  let cartao: any = null;

  if (despesa.cartao_id) {
    const { data: cartaoEncontrado, error: cartaoError } = await supabase
      .from("cartoes")
      .select("*")
      .eq("id", despesa.cartao_id)
      .maybeSingle();

    if (cartaoError) {
      return NextResponse.json(
        {
          error: `Erro ao consultar o cartão da despesa: ${cartaoError.message}`,
          etapa: 0,
        },
        { status: 500 }
      );
    }

    cartao = cartaoEncontrado;
  }

  const { data: cc, error: ccError } = await supabase
    .from("tipos_despesa_centro_custo")
    .select("centro_custo_erp")
    .eq("tipo_despesa_id", despesa.tipo_despesa_id)
    .eq("area", tecnico?.area || "")
    .maybeSingle();

  if (ccError) {
    return NextResponse.json(
      { error: `Erro ao consultar centro de custo: ${ccError.message}`, etapa: 0 },
      { status: 500 }
    );
  }

  const codigoProduto = paraNumero(tipo?.codigo_produto_erp);
  const centroCustoId = paraNumero(cc?.centro_custo_erp);
  const valorDespesa = paraNumero(despesa.valor);

  const camposFaltando: string[] = [];
  if (!despesa.tipo_despesa_id) camposFaltando.push("Tipo de despesa");
  if (!codigoProduto) camposFaltando.push("Código de Produto ERP M8");
  if (!tecnico?.area) camposFaltando.push("Área / Setor do funcionário");
  if (!tecnico?.pessoa_id) camposFaltando.push("Pessoa ID do funcionário (configure em Administração → Usuários → Configurações ERP)");
  if (!centroCustoId) camposFaltando.push("Centro de Custo ERP M8");
  if (!despesa.data_despesa) camposFaltando.push("Data da despesa");
  if (!despesa.data_vencimento) camposFaltando.push("Data de vencimento");
  if (!valorDespesa || valorDespesa <= 0) camposFaltando.push("Valor da despesa");

  if (camposFaltando.length > 0) {
    return NextResponse.json(
      {
        error: "Campos obrigatórios incompletos para integração com o ERP M8.",
        campos: camposFaltando,
        etapa: 0,
      },
      { status: 422 }
    );
  }

  const baseUrl = normalizarBaseUrl(M8_API_URL!);
  const resumo = montarResumoDespesa(despesa, tipo, tecnico, aprovador, cartao);
  const agora = new Date().toISOString();

  let token: string | null = null;
  let erpId = paraNumero(despesa.erp_id);
  let numeroDocumentoErp = paraNumero(despesa.numero_documento_erp);

  // Se já existe erp_id, retoma na etapa que falhou sem criar outra NF.
  const etapaInicial = erpId
    ? Math.max(3, Number(despesa.erp_etapa_erro || 3))
    : 2;

  const payloads: Record<string, unknown> = {
    ...(despesa.erp_payload && typeof despesa.erp_payload === "object"
      ? despesa.erp_payload
      : {}),
    etapa1: {
      tenant: M8_TENANT,
      username: M8_USERNAME,
      company: Number(M8_COMPANY),
      domain: M8_DOMAIN,
    },
  };

  const respostas: Record<string, unknown> = {
    ...(despesa.erp_resposta && typeof despesa.erp_resposta === "object"
      ? despesa.erp_resposta
      : {}),
  };

  try {
    await salvarProgresso(supabase, despesaId, {
      lancado_sistema: true,
      lancado_sistema_em: despesa.lancado_sistema_em || agora,
      lancado_sistema_por: despesa.lancado_sistema_por || userId,
      erp_status: "processando",
      erp_erro: null,
      erp_etapa_erro: null,
    });

    // ETAPA 1 — Gerar token
    const loginBody = {
      tenant: M8_TENANT!,
      username: M8_USERNAME!,
      password: M8_PASSWORD!,
      company: Number(M8_COMPANY),
      domain: M8_DOMAIN!,
    };

    const auth = await m8Request<{ token?: string }>(
      1,
      `${baseUrl}/v1/auth/token`,
      null,
      { method: "POST", body: loginBody, autenticado: false }
    );

    token = auth.data?.token || null;
    if (!token) {
      throw new IntegracaoError(1, "O M8 não retornou data.token na autenticação.", {
        resposta: auth.respostaCompleta,
      });
    }

    respostas.etapa1 = {
      statusHttp: auth.status,
      sucesso: true,
    };

    // ETAPA 2 — Criar Nota Fiscal de Compra
    if (etapaInicial <= 2 && !erpId) {
      numeroDocumentoErp = await obterNumeroDocumentoErp(
        supabase,
        despesaId,
        numeroDocumentoErp
      );

      const pessoaId = tecnico?.pessoa_id ? Number(tecnico.pessoa_id) : null;
      if (!pessoaId) {
        throw new IntegracaoError(2, "Pessoa ID não configurado para este funcionário. Configure em Administração → Usuários → Configurações ERP.", {});
      }

      const bodyEtapa2 = {
        empresaId: 1,
        pessoaId,
        tipoCompraId: 8,
        emissao: paraIso(despesa.data_despesa, "Data da despesa"),
        lancamento: agora,
        freteId: 9,
        condicaoPagamentoId: 9,
        sintegraId: 99,
        documento: numeroDocumentoErp,
        serie: "99",
        especieDocumento: "FAT",
        especieId: 3,
        status: "Pendente",
        complemento: resumo,
        observacao: resumo,
      };

      payloads.etapa2 = bodyEtapa2;

      console.log("[M8][Etapa 2] URL:", `${baseUrl}/v1/compras/notafiscal`);
      console.log("[M8][Etapa 2] Payload:", JSON.stringify(bodyEtapa2, null, 2));

      const etapa2 = await m8Request<{ id?: number }>(
        2,
        `${baseUrl}/v1/compras/notafiscal`,
        token,
        { method: "POST", body: bodyEtapa2 }
      );

      erpId = paraNumero(etapa2.data?.id);
      if (!erpId) {
        throw new IntegracaoError(
          2,
          "O M8 não retornou data.id ao criar a Nota Fiscal de Compra.",
          { resposta: etapa2.respostaCompleta }
        );
      }

      respostas.etapa2 = etapa2.respostaCompleta;

      await salvarProgresso(supabase, despesaId, {
        erp_id: erpId,
        numero_documento_erp: numeroDocumentoErp,
        erp_payload: payloads,
        erp_resposta: respostas,
      });

      // O M8 pode retornar a NF antes de concluir toda a persistência interna.
      // Aguarda brevemente antes de cadastrar o primeiro produto.
      await aguardar(1200);
    }

    if (!erpId) {
      throw new IntegracaoError(2, "documentoFiscalId não disponível.");
    }

    // ETAPA 3 — Cadastrar produto
    if (etapaInicial <= 3) {
      const bodyEtapa3 = {
        produtoId: codigoProduto!,
        operacaoFiscalId: 37,
        destinoEstoqueId: 1,
        quantidade: 1,
        valorUnitario: valorDespesa!,
        observacao: resumo,
      };

      payloads.etapa3 = bodyEtapa3;

      let etapa3: Awaited<ReturnType<typeof m8Request>>;

      try {
        etapa3 = await m8Request(
          3,
          `${baseUrl}/v1/compras/notafiscal/${erpId}/produto`,
          token,
          { method: "POST", body: bodyEtapa3 }
        );
      } catch (erroEtapa3: any) {
        const mensagemEtapa3 = String(erroEtapa3?.message || "");

        const erroPersistenciaM8 =
          mensagemEtapa3.includes(
            "Object reference not set to an instance of an object"
          ) ||
          mensagemEtapa3.includes("VerificarStatusDocumento");

        if (!erroPersistenciaM8) {
          throw erroEtapa3;
        }

        console.warn(
          "[M8][Etapa 3] A NF ainda pode estar sendo persistida. Nova tentativa em 2 segundos."
        );

        await aguardar(2000);

        etapa3 = await m8Request(
          3,
          `${baseUrl}/v1/compras/notafiscal/${erpId}/produto`,
          token,
          { method: "POST", body: bodyEtapa3 }
        );
      }

      respostas.etapa3 = etapa3.respostaCompleta;
      await salvarProgresso(supabase, despesaId, {
        erp_payload: payloads,
        erp_resposta: respostas,
      });
    }

    // ETAPA 4 — Cadastrar parcela
    if (etapaInicial <= 4) {
      const bodyEtapa4 = {
        vencimento: paraIso(despesa.data_vencimento, "Data de vencimento"),
        valor: valorDespesa!,
        condicaoPagamentoId: 9,
      };

      payloads.etapa4 = bodyEtapa4;

      const etapa4 = await m8Request(
        4,
        `${baseUrl}/v1/compras/notafiscal/${erpId}/parcela`,
        token,
        { method: "POST", body: bodyEtapa4 }
      );

      respostas.etapa4 = etapa4.respostaCompleta;
      await salvarProgresso(supabase, despesaId, {
        erp_payload: payloads,
        erp_resposta: respostas,
      });
    }

    // ETAPA 5 — Cadastrar centro de custo
    if (etapaInicial <= 5) {
      const bodyEtapa5 = {
        centroCustoId: centroCustoId!,
        percentual: 100,
        valor: valorDespesa!,
        complemento: resumo,
      };

      payloads.etapa5 = bodyEtapa5;

      const etapa5 = await m8Request(
        5,
        `${baseUrl}/v1/compras/notafiscal/${erpId}/centrocusto`,
        token,
        { method: "POST", body: bodyEtapa5 }
      );

      respostas.etapa5 = etapa5.respostaCompleta;
      await salvarProgresso(supabase, despesaId, {
        erp_payload: payloads,
        erp_resposta: respostas,
      });
    }

    // ETAPA 6 — Processar Nota Fiscal
    if (etapaInicial <= 6) {
      payloads.etapa6 = null;

      const etapa6 = await m8Request(
        6,
        `${baseUrl}/v1/compras/notafiscal/${erpId}/processar`,
        token,
        { method: "POST" }
      );

      respostas.etapa6 = etapa6.respostaCompleta;
    }

    const integradoEm = new Date().toISOString();

    await salvarProgresso(supabase, despesaId, {
      lancado_erp: true,
      lancado_erp_em: integradoEm,
      lancado_erp_por: userId,
      erp_status: "integrado",
      erp_id: erpId,
      numero_documento_erp: numeroDocumentoErp,
      erp_etapa_erro: null,
      erp_erro: null,
      erp_payload: payloads,
      erp_resposta: respostas,
    });

    const { error: auditoriaError } = await supabase.from("auditoria").insert({
      user_id: userId,
      acao: "UPDATE",
      entidade: "despesa",
      entidade_id: despesaId,
      detalhes: `Integração ERP M8 concluída — Documento Fiscal ID: ${erpId} — Número: ${numeroDocumentoErp}`,
    });

    if (auditoriaError) {
      console.error("Falha ao registrar auditoria:", auditoriaError.message);
    }

    return NextResponse.json({
      success: true,
      erp_id: erpId,
      documentoFiscalId: erpId,
      numeroDocumentoErp,
    });
  } catch (error: any) {
    const etapa = error instanceof IntegracaoError ? error.etapa : 0;
    const mensagem = error?.message || "Erro desconhecido na integração.";

    respostas[`etapa${etapa || "desconhecida"}`] = {
      sucesso: false,
      statusHttp: error instanceof IntegracaoError ? error.statusHttp : undefined,
      mensagem,
      resposta: error instanceof IntegracaoError ? error.resposta : undefined,
      dataHora: new Date().toISOString(),
    };

    try {
      await salvarProgresso(supabase, despesaId, {
        lancado_erp: false,
        erp_status: "erro",
        erp_etapa_erro: etapa || null,
        erp_erro: mensagem,
        erp_id: erpId,
        numero_documento_erp: numeroDocumentoErp,
        erp_payload: payloads,
        erp_resposta: respostas,
      });
    } catch (saveError) {
      console.error("Falha ao salvar erro da integração:", saveError);
    }

    return NextResponse.json(
      {
        error: mensagem,
        etapa,
        erp_id: erpId,
        numeroDocumentoErp,
        statusHttpM8:
          error instanceof IntegracaoError ? error.statusHttp : undefined,
        respostaM8:
          error instanceof IntegracaoError ? error.resposta : undefined,
      },
      { status: 502 }
    );
  }
}