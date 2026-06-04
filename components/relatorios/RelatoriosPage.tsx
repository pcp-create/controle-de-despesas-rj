"use client";

import { useState } from "react";
import { useAppStore } from "@/lib/store";
import { Download, FileSpreadsheet } from "lucide-react";
import { formatCurrency, formatDate, erpStatusLabel, approvalStatusLabel } from "@/lib/helpers";

export default function RelatoriosPage() {
  const { despesas, users, tiposDespesa, cartoes } = useAppStore();

  const [filtros, setFiltros] = useState({
    dataInicial: "",
    dataFinal: "",
    tecnicoId: "",
    cliente: "",
    numeroOS: "",
    tipoDespesaId: "",
    cartaoId: "",
    statusERP: "",
    statusAprovacao: "",
  });

  const tecnicos = users.filter((u) => u.perfil === "tecnico");

  const filtered = despesas.filter((d) => {
    // Normaliza a data da despesa para YYYY-MM-DD para comparação correta
    // Fallback para dataCriacao se dataDespesa não existir (dados antigos do mock)
    const dataStr = (d.dataDespesa || d.dataCriacao || "").slice(0, 10);
    
    // Usa >= e <= para incluir as datas de inicio e fim no intervalo
    if (filtros.dataInicial && dataStr < filtros.dataInicial) return false;
    if (filtros.dataFinal && dataStr > filtros.dataFinal) return false;
    if (filtros.tecnicoId && d.tecnicoId !== filtros.tecnicoId) return false;
    if (filtros.cliente && !d.cliente.toLowerCase().includes(filtros.cliente.toLowerCase())) return false;
    if (filtros.numeroOS && !d.numeroOS.toLowerCase().includes(filtros.numeroOS.toLowerCase())) return false;
    if (filtros.tipoDespesaId && d.tipoDespesaId !== filtros.tipoDespesaId) return false;
    if (filtros.cartaoId && d.cartaoId !== filtros.cartaoId) return false;
    if (filtros.statusERP && d.statusERP !== filtros.statusERP) return false;
    if (filtros.statusAprovacao && d.statusAprovacao !== filtros.statusAprovacao) return false;
    return true;
  }).sort((a, b) => {
    const dataA = (a.dataDespesa || a.dataCriacao || "").slice(0, 10);
    const dataB = (b.dataDespesa || b.dataCriacao || "").slice(0, 10);
    return dataB.localeCompare(dataA);
  });

  const totalValor = filtered.reduce((s, d) => s + d.valor, 0);

  const exportCSV = () => {
    const headers = [
      "Data Despesa","Data Lançamento","Técnico","Cliente","N° OS","Tipo","Valor",
      "Cartão","Documento","Status Aprovação","Status ERP","ID ERP",
      "Gestor Aprovador","Data Aprovação","Justif. Reprovação","Observação"
    ];
    const rows = filtered.map((d) => {
      const tipo = tiposDespesa.find((t) => t.id === d.tipoDespesaId);
      const tecnico = users.find((u) => u.id === d.tecnicoId);
      const cartao = cartoes.find((c) => c.id === d.cartaoId);
      const gestor = users.find((u) => u.id === d.gestorAprovadorId);
      return [
        d.dataDespesa,
        d.dataCriacao,
        tecnico?.nome ?? "",
        d.cliente,
        d.numeroOS,
        tipo?.nome ?? "",
        d.valor.toFixed(2),
        cartao ? `${cartao.nome} *${cartao.ultimos4}` : "",
        d.documento ?? "",
        approvalStatusLabel[d.statusAprovacao],
        erpStatusLabel[d.statusERP],
        d.erpId ?? "",
        gestor?.nome ?? "",
        d.dataAprovacao ?? "",
        d.justificativaReprovacao ?? "",
        d.observacao ?? "",
      ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",");
    });
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `despesas-${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const fieldClass = "w-full px-3 py-2.5 rounded-lg border border-input bg-white text-sm focus:outline-none focus:ring-2 focus:ring-ring";

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-lg font-bold text-foreground">Relatórios</h1>
          <p className="text-sm text-muted-foreground">{filtered.length} registro(s) · Total: {formatCurrency(totalValor)}</p>
        </div>
        <button onClick={exportCSV}
          className="flex items-center gap-2 px-4 py-2 bg-success/15 text-success rounded-lg text-sm font-medium hover:bg-success/25 transition border border-success/30">
          <FileSpreadsheet className="w-4 h-4" />
          Exportar CSV
        </button>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-xl border border-border shadow-sm p-4">
        <h2 className="text-sm font-semibold text-foreground mb-3">Filtros</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground">Data Inicial</label>
            <input type="date" value={filtros.dataInicial}
              onChange={(e) => setFiltros({ ...filtros, dataInicial: e.target.value })}
              className={fieldClass} />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground">Data Final</label>
            <input type="date" value={filtros.dataFinal}
              onChange={(e) => setFiltros({ ...filtros, dataFinal: e.target.value })}
              className={fieldClass} />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground">Técnico</label>
            <select value={filtros.tecnicoId}
              onChange={(e) => setFiltros({ ...filtros, tecnicoId: e.target.value })}
              className={fieldClass}>
              <option value="">Todos</option>
              {tecnicos.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground">Tipo de Despesa</label>
            <select value={filtros.tipoDespesaId}
              onChange={(e) => setFiltros({ ...filtros, tipoDespesaId: e.target.value })}
              className={fieldClass}>
              <option value="">Todos</option>
              {tiposDespesa.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground">Status Aprovação</label>
            <select value={filtros.statusAprovacao}
              onChange={(e) => setFiltros({ ...filtros, statusAprovacao: e.target.value })}
              className={fieldClass}>
              <option value="">Todos</option>
              <option value="AguardandoGestor">Aguardando Gestor</option>
              <option value="AprovadoGestor">Aprovado</option>
              <option value="Reprovado">Reprovado</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground">Status ERP</label>
            <select value={filtros.statusERP}
              onChange={(e) => setFiltros({ ...filtros, statusERP: e.target.value })}
              className={fieldClass}>
              <option value="">Todos</option>
              <option value="EnviadoAguardandoGestor">Aguardando Gestor</option>
              <option value="AprovadoGestorERPAtualizado">Aprovado - ERP Atualizado</option>
              <option value="ReprovadoERPAtualizado">Reprovado - ERP Atualizado</option>
              <option value="ErroEnvioERP">Erro ao Enviar</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground">Cliente</label>
            <input type="text" placeholder="Nome do cliente" value={filtros.cliente}
              onChange={(e) => setFiltros({ ...filtros, cliente: e.target.value })}
              className={fieldClass} />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground">N° OS</label>
            <input type="text" placeholder="OS-..." value={filtros.numeroOS}
              onChange={(e) => setFiltros({ ...filtros, numeroOS: e.target.value })}
              className={fieldClass} />
          </div>
        </div>
        <div className="mt-3 flex justify-end">
          <button onClick={() => setFiltros({ dataInicial:"",dataFinal:"",tecnicoId:"",cliente:"",numeroOS:"",tipoDespesaId:"",cartaoId:"",statusERP:"",statusAprovacao:"" })}
            className="text-sm text-muted-foreground hover:text-foreground transition">
            Limpar filtros
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-border shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                {["Data","Técnico","Cliente","OS","Tipo","Valor","Cartão","Status Aprov.","Status ERP","ID ERP"].map((h) => (
                  <th key={h} className="text-left px-4 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={10} className="text-center py-10 text-muted-foreground text-sm">
                    Nenhum registro encontrado com os filtros aplicados.
                  </td>
                </tr>
              )}
              {filtered.map((d) => {
                const tipo = tiposDespesa.find((t) => t.id === d.tipoDespesaId);
                const tecnico = users.find((u) => u.id === d.tecnicoId);
                const cartao = cartoes.find((c) => c.id === d.cartaoId);
                return (
                  <tr key={d.id} className="border-b border-border last:border-0 hover:bg-muted/20 transition">
                    <td className="px-4 py-3 whitespace-nowrap">{formatDate(d.dataDespesa || d.dataCriacao)}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{tecnico?.nome.split(" ")[0]}</td>
                    <td className="px-4 py-3">{d.cliente}</td>
                    <td className="px-4 py-3 text-muted-foreground">{d.numeroOS}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{tipo?.nome}</td>
                    <td className="px-4 py-3 font-semibold whitespace-nowrap">{formatCurrency(d.valor)}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">{cartao ? `*${cartao.ultimos4}` : "-"}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="text-xs">{approvalStatusLabel[d.statusAprovacao]}</span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="text-xs">{erpStatusLabel[d.statusERP]}</span>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{d.erpId ?? "-"}</td>
                  </tr>
                );
              })}
            </tbody>
            {filtered.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-border bg-muted/30">
                  <td colSpan={5} className="px-4 py-3 text-sm font-semibold">
                    Total ({filtered.length} registros)
                  </td>
                  <td className="px-4 py-3 font-bold text-foreground">{formatCurrency(totalValor)}</td>
                  <td colSpan={4} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}
