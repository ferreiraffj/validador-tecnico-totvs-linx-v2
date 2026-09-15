import React, { useEffect, useState } from "react";
import { LayoutDashboard, MessageSquare, Sparkles } from "lucide-react";
import { HubDashboard } from "./components/HubDashboard";
import { ChatInterface } from "./components/ChatInterface";
import { DocumentationDrawer } from "./components/DocumentationDrawer";
import { SpecBuilderModal } from "./components/SpecBuilderModal";
import { HubRecord, createDemoRecords } from "./shared/hub/auditImport";
import { ImageAttachment, Message, HardwarePreset } from "./types";
import totvsLogo from "./assets/logo-totvs-branco.svg";

const STORAGE_KEY = "linx-taste-one:hub-records";
const CHAT_STORAGE_KEY = "linx-taste-one:recent-chat";
const INITIAL_GREETING: Message = { id: "initial-greeting", role: "assistant", content: "Olá! Sou o **Validador Técnico**. Informe o sistema e as especificações da loja para emitir um diagnóstico.", timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) };

export default function App() {
  const [records, setRecords] = useState<HubRecord[]>(() => {
    try { const stored = window.localStorage.getItem(STORAGE_KEY); return stored ? JSON.parse(stored) as HubRecord[] : createDemoRecords(); }
    catch (error) { console.warn("Não foi possível restaurar as auditorias.", error); return createDemoRecords(); }
  });
  const [view, setView] = useState<"hub" | "chat">("hub");
  const [messages, setMessages] = useState<Message[]>(() => { try { const stored = window.localStorage.getItem(CHAT_STORAGE_KEY); return stored ? JSON.parse(stored) as Message[] : [INITIAL_GREETING]; } catch { return [INITIAL_GREETING]; } });
  const [isLoading, setIsLoading] = useState(false);
  const [isDocOpen, setIsDocOpen] = useState(false);
  const [isWizardOpen, setIsWizardOpen] = useState(false);

  useEffect(() => { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(records)); }, [records]);
  useEffect(() => { window.localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(messages)); }, [messages]);
  const refreshRecords = () => {
    return fetch("/api/collections")
      .then((response) => response.ok ? response.json() as Promise<{ records: HubRecord[] }> : Promise.reject(new Error(`HTTP ${response.status}`)))
      .then((data) => { if (data.records.length > 0) setRecords(data.records); })
      .catch((error) => console.warn("API de coletas indisponível; usando registros locais.", error));
  };
  useEffect(() => { void refreshRecords(); }, []);

  const handleSendMessage = async (text: string, images: ImageAttachment[] = []) => {
    const userMsg: Message = { id: Date.now().toString(), role: "user", content: text, images: images.length ? images : undefined, timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) };
    const updated = [...messages, userMsg]; setMessages(updated); setIsLoading(true);
    try {
      const payload = updated.map((message) => ({ role: message.role, content: message.content, ...(message.images ? { images: message.images } : {}) }));
      const response = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages: payload }) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      setMessages((current) => [...current, { id: `${Date.now()}-reply`, role: "assistant", content: data.reply || "Resposta não recebida.", timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) }]);
    } catch (error) { console.error("Erro ao enviar mensagem:", error); setMessages((current) => [...current, { id: `${Date.now()}-error`, role: "assistant", content: "⚠️ Não foi possível consultar o auditor agora. Verifique o serviço e tente novamente.", timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) }]); }
    finally { setIsLoading(false); }
  };

  return <div className="flex h-screen w-screen flex-col overflow-hidden bg-[#f4f7fb] font-sans text-slate-800">
    <header className="z-30 border-b border-slate-800 bg-slate-950 text-white shadow-md"><div className="mx-auto flex h-[72px] max-w-[1600px] items-center justify-between px-5 lg:px-9"><div className="flex items-center gap-4"><img src={totvsLogo} alt="TOTVS" className="w-24" /><div className="h-8 w-px bg-slate-700" /><div><div className="flex items-center gap-2"><h1 className="text-base font-bold">Validador Técnico</h1><span className="hidden rounded-full border border-cyan-800 bg-cyan-950 px-2 py-0.5 text-[10px] font-semibold text-cyan-300 sm:inline">HUB DE AUDITORIAS</span></div><p className="hidden text-xs text-slate-400 sm:block">Infraestrutura e homologação de lojas</p></div></div><div className="flex items-center gap-2"><nav className="hidden rounded-xl bg-slate-900 p-1 md:flex"><button onClick={() => setView("hub")} className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold ${view === "hub" ? "bg-slate-700 text-white" : "text-slate-400 hover:text-white"}`}><LayoutDashboard className="h-4 w-4" /> Hub</button><button onClick={() => setView("chat")} className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold ${view === "chat" ? "bg-slate-700 text-white" : "text-slate-400 hover:text-white"}`}><MessageSquare className="h-4 w-4" /> Auditoria manual</button></nav><button onClick={() => setIsDocOpen(true)} className="hidden items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-800 lg:flex">Documentação</button><div className="hidden items-center gap-1.5 rounded-full border border-slate-700 bg-slate-900 px-3 py-1.5 text-[11px] text-slate-300 sm:flex"><Sparkles className="h-3 w-3 text-cyan-400" /> Auditor ativo</div></div></div></header>
    <div className="flex min-h-0 flex-1">{view === "hub" ? <HubDashboard records={records} onRefresh={() => void refreshRecords()} onRecordsImported={(newRecords) => { setRecords((current) => [...newRecords, ...current]); const canonicalPayloads = newRecords.filter((record) => record.payload.schemaVersion === "1.0"); void Promise.all(canonicalPayloads.map((record) => fetch("/api/collections", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(record.payload) }))).catch((error) => console.warn("Não foi possível sincronizar a importação com a API.", error)); }} onOpenChat={() => setView("chat")} /> : <ChatInterface messages={messages} onSendMessage={handleSendMessage} isLoading={isLoading} onOpenWizard={() => setIsWizardOpen(true)} onSelectPreset={(preset: HardwarePreset) => void handleSendMessage(preset.prompt)} />}</div>
    <DocumentationDrawer isOpen={isDocOpen} onClose={() => setIsDocOpen(false)} /><SpecBuilderModal isOpen={isWizardOpen} onClose={() => setIsWizardOpen(false)} onSubmit={handleSendMessage} />
  </div>;
}
