import React, { useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronRight, FileJson, Filter, Inbox, Plus, RefreshCw, Search, ShieldCheck, Upload, X, XCircle } from "lucide-react";
import Markdown from "react-markdown";
import { HubRecord, HubStatus, HubSystem, normalizeImportedPayload } from "../shared/hub/auditImport";

interface HubDashboardProps {
  records: HubRecord[];
  isRefreshing: boolean;
  lastSyncAt: Date | null;
  onRecordsImported: (records: HubRecord[]) => void;
  onRefresh: () => void;
  onOpenChat: () => void;
}

const columns: { system: HubSystem; description: string; color: string }[] = [
  { system: "TasteOne PDV", description: "Pontos de venda", color: "blue" },
  { system: "TasteOne Autoatendimento", description: "Totens e autoatendimento", color: "violet" },
  { system: "Degust PDV", description: "Operação Degust", color: "orange" },
];

const statusConfig: Record<HubStatus, { label: string; icon: typeof CheckCircle2; classes: string }> = {
  APROVADO: { label: "Aprovado", icon: CheckCircle2, classes: "text-emerald-700 bg-emerald-50 border-emerald-200" },
  APROVADO_RESSALVAS: { label: "Com ressalvas", icon: AlertTriangle, classes: "text-amber-700 bg-amber-50 border-amber-200" },
  REPROVADO: { label: "Reprovado", icon: XCircle, classes: "text-rose-700 bg-rose-50 border-rose-200" },
};

export const HubDashboard: React.FC<HubDashboardProps> = ({ records, isRefreshing, lastSyncAt, onRecordsImported, onRefresh, onOpenChat }) => {
  const [selected, setSelected] = useState<HubRecord | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<HubStatus | "TODOS">("TODOS");
  const [importError, setImportError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const visibleRecords = useMemo(() => records.filter((record) => {
    const matchesQuery = `${record.storeName} ${record.cnpj} ${record.collectedBy}`.toLowerCase().includes(query.toLowerCase());
    return matchesQuery && (filter === "TODOS" || record.status === filter);
  }), [records, query, filter]);

  const importFiles = async (files: FileList | null) => {
    if (!files) return;
    const imported: HubRecord[] = [];
    for (const file of Array.from(files)) {
      if (file.type && file.type !== "application/json" && !file.name.endsWith(".json")) continue;
      try {
        const content = await file.text();
        imported.push(...normalizeImportedPayload(JSON.parse(content.replace(/^\uFEFF/, ""))));
      } catch (error) {
        console.error(`Não foi possível importar ${file.name}.`, error);
        setImportError(`Não foi possível ler ${file.name}. Confira se o arquivo contém um JSON válido.`);
      }
    }
    if (imported.length) {
      setImportError("");
      onRecordsImported(imported);
    }
  };

  const totals = {
    total: records.length,
    approved: records.filter((record) => record.status === "APROVADO").length,
    pending: records.filter((record) => record.status === "APROVADO_RESSALVAS").length,
    rejected: records.filter((record) => record.status === "REPROVADO").length,
  };

  return (
    <main className="flex-1 overflow-y-auto bg-[#f4f7fb]">
      <div className="mx-auto max-w-[1600px] px-5 py-7 lg:px-9">
        <section className="mb-7 flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
          <div>
            <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-blue-600"><ShieldCheck className="h-4 w-4" /> Central de auditorias</div>
            <h2 className="text-3xl font-bold tracking-tight text-slate-950">Visão geral das lojas</h2>
            <p className="mt-2 max-w-2xl text-sm text-slate-500">Receba as coletas do executável, acompanhe a auditoria e avance cada implantação com contexto.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={onRefresh} disabled={isRefreshing} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 disabled:cursor-wait disabled:opacity-60"><RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} /> {isRefreshing ? "Sincronizando..." : "Atualizar"}</button>
            <button onClick={onOpenChat} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-300"><Plus className="h-4 w-4" /> Auditoria manual</button>
            <button onClick={() => inputRef.current?.click()} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"><Upload className="h-4 w-4" /> Importar JSON</button>
            <input ref={inputRef} type="file" accept=".json,application/json" multiple className="hidden" onChange={(event) => void importFiles(event.target.files)} />
          </div>
        </section>

        <section className="mb-7 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[["Total de auditorias", totals.total, "text-slate-950"], ["Aprovadas", totals.approved, "text-emerald-600"], ["Com ressalvas", totals.pending, "text-amber-600"], ["Reprovadas", totals.rejected, "text-rose-600"]].map(([label, value, color]) => (
            <div key={String(label)} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-xs font-medium text-slate-500">{label}</p><p className={`mt-2 text-2xl font-bold ${color}`}>{value}</p></div>
          ))}
        </section>

        <section className="mb-5 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:flex-row">
          <div className="relative flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por loja, CNPJ ou responsável..." className="w-full rounded-xl bg-slate-50 py-2.5 pl-9 pr-3 text-sm outline-none ring-blue-500 transition focus:ring-2" /></div>
          <div className="flex items-center gap-2 overflow-x-auto"><Filter className="h-4 w-4 text-slate-400" />{[["TODOS", "Todos"], ["APROVADO", "Aprovadas"], ["APROVADO_RESSALVAS", "Ressalvas"], ["REPROVADO", "Reprovadas"]].map(([value, label]) => <button key={value} onClick={() => setFilter(value as HubStatus | "TODOS")} className={`whitespace-nowrap rounded-lg px-3 py-2 text-xs font-semibold transition ${filter === value ? "bg-slate-900 text-white" : "text-slate-500 hover:bg-slate-100"}`}>{label}</button>)}</div>
        </section>
        {importError && <div role="alert" className="mb-5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{importError}</div>}

        <section className="grid gap-5 xl:grid-cols-3">
          {columns.map((column) => {
            const columnRecords = visibleRecords.filter((record) => record.system === column.system);
            return <div key={column.system} className="min-h-[330px] rounded-2xl border border-slate-200 bg-slate-100/80 p-3">
              <div className="mb-3 flex items-center justify-between px-2"><div><h3 className="font-bold text-slate-800">{column.system}</h3><p className="mt-0.5 text-xs text-slate-500">{column.description}</p></div><span className="rounded-full bg-white px-2.5 py-1 text-xs font-bold text-slate-500 shadow-sm">{columnRecords.length}</span></div>
              <div className="space-y-3">{columnRecords.map((record) => <RecordCard key={record.id} record={record} onClick={() => setSelected(record)} />)}{columnRecords.length === 0 && <div className="flex min-h-[210px] flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 text-center"><Inbox className="mb-2 h-6 w-6 text-slate-300" /><p className="text-xs text-slate-400">Nenhuma auditoria encontrada</p></div>}</div>
            </div>;
          })}
        </section>
        <p className="mt-6 text-center text-xs text-slate-400"><FileJson className="mr-1 inline h-3.5 w-3.5" /> Atualização automática a cada 10 segundos{lastSyncAt ? ` · última sincronização às ${lastSyncAt.toLocaleTimeString("pt-BR")}` : ""}</p>
      </div>
      {selected && <DetailDrawer record={selected} onClose={() => setSelected(null)} />}
    </main>
  );
};

function RecordCard({ record, onClick }: { record: HubRecord; onClick: () => void }) {
  const config = statusConfig[record.status];
  const Icon = config.icon;
  return <button onClick={onClick} className="group w-full rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md">
    <div className="mb-3 flex items-start justify-between gap-2"><div><h4 className="font-bold text-slate-800">{record.storeName}</h4><p className="mt-1 text-xs text-slate-500">{record.cnpj}</p></div><ChevronRight className="h-4 w-4 text-slate-300 transition group-hover:text-blue-500" /></div>
    <div className={`mb-3 inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[11px] font-bold ${config.classes}`}><Icon className="h-3.5 w-3.5" />{config.label}</div>
    <div className="border-t border-slate-100 pt-3 text-xs text-slate-500"><span className="font-medium text-slate-700">{record.collectedBy}</span><span className="mx-1.5 text-slate-300">·</span>{new Date(record.receivedAt).toLocaleDateString("pt-BR")}</div>
  </button>;
}

function DetailDrawer({ record, onClose }: { record: HubRecord; onClose: () => void }) {
  const config = statusConfig[record.status];
  const Icon = config.icon;
  return <div className="fixed inset-0 z-50 bg-slate-950/40 backdrop-blur-sm" onClick={onClose}><aside onClick={(event) => event.stopPropagation()} className="absolute right-0 top-0 flex h-full w-full max-w-2xl flex-col overflow-hidden bg-white shadow-2xl">
    <header className="flex items-start justify-between border-b border-slate-200 p-6"><div><p className="text-xs font-bold uppercase tracking-widest text-blue-600">{record.system}</p><h2 className="mt-2 text-2xl font-bold text-slate-950">{record.storeName}</h2><p className="mt-1 text-sm text-slate-500">{record.cnpj} · coletado por {record.collectedBy}</p></div><button onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Fechar detalhe"><X className="h-5 w-5" /></button></header>
    <div className="flex-1 overflow-y-auto p-6"><div className={`mb-6 inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-bold ${config.classes}`}><Icon className="h-5 w-5" />{config.label}</div><div className="mb-7 grid gap-2 sm:grid-cols-2">{record.checks.map((check) => <div key={check.label} className="rounded-xl border border-slate-200 p-3"><p className="text-xs text-slate-500">{check.label}</p><p className="mt-1 text-sm font-semibold text-slate-800">{check.value}</p></div>)}</div><article className="prose prose-sm max-w-none leading-relaxed text-slate-700"><h3 className="text-lg font-bold text-slate-900">Resultado completo</h3><Markdown>{record.report}</Markdown></article></div>
  </aside></div>;
}
