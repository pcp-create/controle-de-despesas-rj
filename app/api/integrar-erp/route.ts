import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

type JsonObject = Record<string, unknown>;

type M8ErrorItem = {
  message?: string;
  stackTrace?: string;
};

type M8Response<T = unknown> = {
  data?: T;
  errors?: M8ErrorItem[];
  message?: string;
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

function paraNumero(valor: unknown): number | null {
  if (valor === null || valor === undefined || valor === "") return null;
  const numero = Number(valor);
  return Number.isFinite(numero) ? numero : null;
}

function paraIso(valor: unknown, nomeCampo: string): string {
  if (!valor) {
    throw new Error(`${nomeCampo} não informado.`);
  }

  const data = new Date(String(valor));
  if (Number.isNaN(data.getTime())) {
    throw new Error(`${nomeCampo} inválido: ${String(valor)}`);
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

function montarResumoDespesa(despesa: any, tipo: any, tecnico: any, aprovador: any): string {
  const dataDespesa = despesa.data_despesa
    ? new Date(despesa.data_despesa).toLocaleDateString("pt-BR", {
        timeZone: "America/Sao_Paulo",
      })
    : "Não informado";

  const dataAprovacao = despesa.aprovado_em
    ? new Date(despesa.aprovado_em).toLocaleString("pt-BR", {
        timeZone: "America/Sao_Paulo",
      })
    : "Não informado";

  return [
    `Funcionário: ${valorTexto(tecnico?.nome || tecnico?.full_name)}`,
    `Data da despesa: ${dataDespesa}`,
    `Tipo: ${valorTexto(tipo?.nome)}`,
    `Pagamento: ${valorTexto(despesa.forma_pagamento || despesa.pagamento)}`,
    `Cliente: ${valorTexto(despesa.cliente)}`,
    `OS: ${valorTexto(despesa.numero_os)}`,
    `Valor: ${formatarValorBR(Number(despesa.valor || 0))}`,
    `Observação: ${valorTexto(despesa.observacao)}`,
    `Documento: ${valorTexto(despesa.documento)}`,
    `Cartão: ${valorTexto(despesa.cartao || despesa.cartao_nome)}`,
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

function extrairMensagemM8(body: unknown, status: number): string {
  const resposta = body as M8Response;
  const mensagens = Array.isArray(resposta?.errors)
    ? resposta.errors.map((erro) => erro?.message).filter(Boolean)
    : [];

  if (mensagens.length > 0) return mensagens.join(" | ");
  if (resposta?.message) return resposta.message;
  return `Erro HTTP ${status} retornado pelo M8.`;
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
    if (!token) {
      throw new IntegracaoError(etapa, "Token M8 não disponível.");
    }
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
  let parsed: unknown = null;

  if (raw) {
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = { message: raw };
    }
  }

  const respostaM8 = parsed as M8Response<T>;
  const possuiErros = Array.isArray(respostaM8?.errors) && respostaM8.errors.length > 0;

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

  // IMPORTANTE: esta coluna deve ser preenchida por uma sequência segura no banco.
  // Não use o número do cupom/nota do usuário como sequência da integração.
  const numeroDocumentoErp = paraNumero(
    despesa.numero_documento_erp ?? despesa.erp_documento_numero
  );

  const camposFaltando: string[] = [];
  if (!despesa.tipo_despesa_id) camposFaltando.push("Tipo de despesa");
  if (!codigoProduto) camposFaltando.push("Código de Produto ERP M8");
  if (!tecnico?.area) camposFaltando.push("Área / Setor do funcionário");
  if (!centroCustoId) camposFaltando.push("Centro de Custo ERP M8");
  if (!despesa.data_despesa) camposFaltando.push("Data da despesa");
  if (!despesa.data_vencimento) camposFaltando.push("Data de vencimento");
  if (!valorDespesa || valorDespesa <= 0) camposFaltando.push("Valor da despesa");
  if (!numeroDocumentoErp) {
    camposFaltando.push(
      "Número sequencial do documento ERP (numero_documento_erp ou erp_documento_numero)"
    );
  }

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
  const resumo = montarResumoDespesa(despesa, tipo, tecnico, aprovador);
  const agora = new Date().toISOString();

  let token: string | null = null;
  let erpId = paraNumero(despesa.erp_id);

  // Se já existe erp_id, retoma na etapa que falhou, sem criar outra NF.
  const etapaInicial = erpId
    ? Math.max(3, Number(despesa.erp_etapa_erro || 3))
    : 2;

  const payloads: Record<string, unknown> = {
    etapa1: {
      tenant: M8_TENANT,
      username: M8_USERNAME,
      company: Number(M8_COMPANY),
      domain: M8_DOMAIN,
      // senha propositalmente não registrada
    },
  };

  const respostas: Record<string, unknown> = {};

  try {
    await salvarProgresso(supabase, despesaId, {
      lancado_sistema: true,
      lancado_sistema_em: despesa.lancado_sistema_em || agora,
      lancado_sistema_por: despesa.lancado_sistema_por || userId,
      erp_status: "processando",
      erp_erro: null,
      erp_etapa_erro: null,
    });

    // ETAPA 1 — Token
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
      // token propositalmente não registrado
    };

    // ETAPA 2 — Criar NF de compra
    if (etapaInicial <= 2 && !erpId) {
      const bodyEtapa2 = {
        empresaId: 1,
        pessoaId: 27977,
        tipoCompraId: 1,
        emissao: paraIso(despesa.data_despesa, "Data da despesa"),
        lancamento: agora,
        freteId: 9,
        condicaoPagamentoId: 9,
        sintegraId: 99,
        documento: numeroDocumentoErp!,
        serie: "99",
        especieDocumento: "FAT",
        especieId: 3,
        status: "Pendente",
        complemento: resumo,
        observacao: resumo,
      };

      payloads.etapa2 = bodyEtapa2;

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

      // Salva imediatamente para permitir retomada sem duplicar a NF.
      await salvarProgresso(supabase, despesaId, {
        erp_id: erpId,
        erp_payload: payloads,
        erp_resposta: respostas,
      });
    }

    if (!erpId) {
      throw new IntegracaoError(2, "documentoFiscalId não disponível.");
    }

    // ETAPA 3 — Produto
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

      const etapa3 = await m8Request(
        3,
        `${baseUrl}/v1/compras/notafiscal/${erpId}/produto`,
        token,
        { method: "POST", body: bodyEtapa3 }
      );

      respostas.etapa3 = etapa3.respostaCompleta;
      await salvarProgresso(supabase, despesaId, {
        erp_payload: payloads,
        erp_resposta: respostas,
      });
    }

    // ETAPA 4 — Parcela
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

    // ETAPA 5 — Centro de custo
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

    // ETAPA 6 — Processar
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
      detalhes: `Integração ERP M8 concluída — Documento Fiscal ID: ${erpId}`,
    });

    if (auditoriaError) {
      console.error("Falha ao registrar auditoria:", auditoriaError.message);
    }

    return NextResponse.json({
      success: true,
      erp_id: erpId,
      documentoFiscalId: erpId,
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
        statusHttpM8:
          error instanceof IntegracaoError ? error.statusHttp : undefined,
        respostaM8:
          error instanceof IntegracaoError ? error.resposta : undefined,
      },
      { status: 502 }
    );
  }
}