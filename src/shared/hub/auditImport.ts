import tasteone from "../../data/requirements/tasteone.json";
import autoatendimento from "../../data/requirements/tasteone-autoatendimento.json";
import degust from "../../data/requirements/degust.json";

export type HubSystem = "TasteOne PDV" | "TasteOne Autoatendimento" | "Degust PDV";
export type HubStatus = "APROVADO" | "APROVADO_RESSALVAS" | "REPROVADO";
export type CollectionSystem = HubSystem;

export interface CollectionPayload {
  schemaVersion: "1.0";
  collectionId: string;
  collectedAt: string;
  store: {
    cnpj: string;
    tradeName: string;
    legalName?: string;
    city?: string;
    state?: string;
  };
  system: CollectionSystem;
  collector: {
    name: string;
    email?: string;
    appVersion?: string;
  };
  hardware?: {
    operatingSystem?: string;
    processor?: string;
    memoryGb?: number;
    storageGb?: number;
    storageType?: "SSD" | "HDD" | "NVMe" | "eMMC" | "OUTRO";
    model?: string;
  };
  network?: {
    connectionType?: "ETHERNET" | "WIFI" | "MOBILE" | "OUTRO";
    internetMbps?: number;
    dedicated?: boolean;
    managedRouter?: boolean;
  };
  peripherals?: Array<{ type: string; manufacturer?: string; model?: string; connection?: string }>;
  metadata?: Record<string, string | number | boolean>;
}

export interface HubRecord {
  id: string;
  system: HubSystem;
  status: HubStatus;
  storeName: string;
  tradeName: string;
  cnpj: string;
  collectedBy: string;
  receivedAt: string;
  source: "Importação JSON" | "Demonstração";
  payload: Record<string, unknown>;
  report: string;
  checks: { label: string; value: string; passed: boolean }[];
}

const systemNames: HubSystem[] = ["TasteOne PDV", "TasteOne Autoatendimento", "Degust PDV"];

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function asArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.map(asRecord) : [];
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function normalizeStorageType(value: string): CollectionPayload["hardware"]["storageType"] {
  const normalized = value.toLowerCase();
  if (normalized.includes("nvme")) return "NVMe";
  if (normalized.includes("ssd")) return "SSD";
  if (normalized.includes("hdd")) return "HDD";
  if (normalized.includes("emmc")) return "eMMC";
  return "OUTRO";
}

function normalizeConnectionType(value: string): CollectionPayload["network"]["connectionType"] {
  const normalized = value.toLowerCase();
  if (normalized.includes("ethernet") || normalized.includes("cabo")) return "ETHERNET";
  if (normalized.includes("wi-fi") || normalized.includes("wifi") || normalized.includes("wireless")) return "WIFI";
  if (normalized.includes("mobile") || normalized.includes("4g") || normalized.includes("5g")) return "MOBILE";
  return "OUTRO";
}

/**
 * Adapts the Windows collector report (reportVersion 1.4+) to the Hub contract.
 * The collector can continue posting its current payload while the Hub keeps
 * one canonical shape for validation and auditing.
 */
export function normalizeCollectorReport(value: unknown): unknown {
  const input = asRecord(value);
  if (input.schemaVersion === "1.0") return value;
  if (!text(input.reportVersion)) return value;

  const store = asRecord(input.store);
  const system = asRecord(input.system);
  const memory = asRecord(input.memory);
  const network = asRecord(input.network);
  const processors = asArray(input.processors);
  const storages = asArray(input.storage);
  const primaryStorage = storages.find((item) => text(item.driveLetter).toUpperCase() === "C:") ?? storages[0] ?? {};
  const selectedSystem = text(store.selectedSystem);
  const collectedAt = text(input.collectedAtUtc);
  const cnpj = text(store.cnpj);
  const collectionId = text(input.collectionId) || `${cnpj.replace(/\D/g, "")}-${collectedAt.replace(/[^0-9]/g, "").slice(0, 14)}`;
  const processor = processors[0];
  const adapter = text(network.adapter);
  const peripherals = asRecord(input.peripherals);
  const peripheralItems = [...asArray(peripherals.items), ...asArray(peripherals.thermalPrinters)];

  return {
    schemaVersion: "1.0",
    collectionId,
    collectedAt,
    store: {
      cnpj,
      tradeName: text(store.storeName),
    },
    system: selectedSystem,
    collector: {
      name: text(store.technicianName),
      appVersion: text(input.reportVersion),
    },
    hardware: {
      operatingSystem: text(system.operatingSystem),
      processor: text(processor.model),
      memoryGb: numberValue(memory.totalGb),
      storageGb: numberValue(primaryStorage.totalGb),
      storageType: normalizeStorageType(text(primaryStorage.storageType)),
      model: text(system.machineName),
    },
    network: {
      connectionType: normalizeConnectionType(adapter),
      internetMbps: numberValue(network.downloadMbps),
      dedicated: undefined,
      managedRouter: undefined,
    },
    peripherals: peripheralItems.map((item) => ({
      type: text(item.type) || "Periférico",
      manufacturer: text(item.manufacturer),
      model: text(item.model),
      connection: text(item.connection),
    })),
    metadata: {
      reportVersion: text(input.reportVersion),
      technicianPhone: text(store.technicianPhone),
      operatingSystemVersion: text(system.version),
      operatingSystemBuild: text(system.build),
      architecture: text(system.architecture),
      machineName: text(system.machineName),
      localIp: text(network.localIp),
      gateway: text(network.gateway),
      dns: text(network.dns),
      latencyMs: numberValue(network.latencyMs) ?? 0,
      uploadMbps: numberValue(network.uploadMbps) ?? 0,
      internetReachable: network.internetReachable === true,
      testEndpoint: text(network.testEndpoint),
      collectionCompleted: asRecord(input.status).completed === true,
    },
  };
}

export function validateCollectionPayload(value: unknown): { valid: true; payload: CollectionPayload } | { valid: false; errors: string[] } {
  const record = asRecord(normalizeCollectorReport(value));
  const errors: string[] = [];
  const store = asRecord(record.store);
  const collector = asRecord(record.collector);
  const systems = systemNames as string[];
  if (record.schemaVersion !== "1.0") errors.push("schemaVersion deve ser '1.0'.");
  if (!text(record.collectionId)) errors.push("collectionId é obrigatório.");
  if (!text(record.collectedAt) || Number.isNaN(Date.parse(text(record.collectedAt)))) errors.push("collectedAt deve ser uma data ISO 8601 válida.");
  if (!text(store.cnpj)) errors.push("store.cnpj é obrigatório.");
  if (!text(store.tradeName)) errors.push("store.tradeName é obrigatório.");
  if (!systems.includes(text(record.system))) errors.push(`system deve ser um destes valores: ${systems.join(", ")}.`);
  if (!text(collector.name)) errors.push("collector.name é obrigatório.");
  if (errors.length > 0) return { valid: false, errors };
  return { valid: true, payload: record as unknown as CollectionPayload };
}

function text(value: unknown): string {
  if (typeof value === "string" || typeof value === "number") return String(value);
  return "";
}

function truncateNumber(value: string): string {
  const parsed = Number.parseFloat(value.replace(",", "."));
  if (!Number.isFinite(parsed)) return value;
  return String(Math.trunc(parsed * 100) / 100);
}

function pick(record: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const direct = text(record[key]);
    if (direct) return direct;
  }
  return "";
}

function findSystem(record: Record<string, unknown>): HubSystem {
  const value = pick(record, ["system", "sistema", "sistemaUtilizado", "produto", "sistemaLinx"]).toLowerCase();
  if (value.includes("auto")) return "TasteOne Autoatendimento";
  if (value.includes("degust")) return "Degust PDV";
  return "TasteOne PDV";
}

function findData(record: Record<string, unknown>, names: string[]): string {
  const nested = [record, asRecord(record.store), asRecord(record.collector), asRecord(record.hardware), asRecord(record.computer), asRecord(record.computador), asRecord(record.network), asRecord(record.rede)];
  for (const item of nested) {
    const result = pick(item, names);
    if (result) return result;
  }
  return "";
}

function statusFromPayload(record: Record<string, unknown>): HubStatus | undefined {
  const value = pick(record, ["status", "resultado", "auditStatus"]).toUpperCase();
  if (value.includes("REPROV")) return "REPROVADO";
  if (value.includes("RESSAL")) return "APROVADO_RESSALVAS";
  if (value.includes("APROV")) return "APROVADO";
  return undefined;
}

function auditPayload(record: Record<string, unknown>, system: HubSystem): {
  status: HubStatus;
  checks: HubRecord["checks"];
  report: string;
} {
  const os = findData(record, ["os", "sistemaOperacional", "operatingSystem", "operating_system"]);
  const processor = findData(record, ["processador", "processor", "cpu"]);
  const memory = findData(record, ["ram", "memoriaRam", "memory", "memoria", "memoryGb"]);
  const storage = findData(record, ["armazenamento", "storage", "disco", "storageGb"]);
  const network = findData(record, ["conectividade", "connection", "tipoRede", "networkType", "rede", "connectionType"]);
  const internet = findData(record, ["internetMbps", "velocidadeInternet", "internet", "downloadMbps"]);
  const device = findData(record, ["modelo", "model", "deviceModel"]);
  const evidence = [os, processor, memory, storage, network].filter(Boolean).length;
  const isWifi = /wi-?fi|wireless/i.test(`${network} ${JSON.stringify(record)}`);
  const internetNumber = Number.parseFloat(internet.replace(",", "."));
  const hasSlowInternet = Number.isFinite(internetNumber) && internetNumber < 15;
  const hasBlockingNetwork = isWifi || hasSlowInternet;
  const explicitStatus = statusFromPayload(record);
  const status = explicitStatus ?? (hasBlockingNetwork ? "REPROVADO" : evidence < 3 ? "APROVADO_RESSALVAS" : "APROVADO");
  const requirements = system === "TasteOne Autoatendimento" ? autoatendimento : system === "Degust PDV" ? degust : tasteone;
  const hardware = asRecord(record.hardware);
  const memoryDisplay = memory ? `${truncateNumber(memory)} GB` : "Não informado";
  const storageType = text(hardware.storageType);
  const storageDisplay = storage
    ? `${truncateNumber(storage)} GB${storageType ? ` (${storageType})` : ""}`
    : "Não informado";
  const internetDisplay = internet ? `${truncateNumber(internet)} Mbps` : "Não informado";
  const checks = [
    { label: "Sistema operacional", value: os || "Não informado", passed: Boolean(os) },
    { label: "Processador e memória", value: [processor, memoryDisplay].filter(Boolean).join(" · ") || "Não informado", passed: Boolean(processor && memory) },
    { label: "Armazenamento", value: storageDisplay, passed: Boolean(storage) },
    { label: "Rede e internet", value: [network, internetDisplay].filter(Boolean).join(" · ") || "Não informado", passed: Boolean(network && !hasBlockingNetwork) },
    { label: "Matriz aplicada", value: `Requisitos ${text((requirements as { version?: unknown }).version) || "oficial"} · ${system}`, passed: true },
  ];
  const statusLabel = status === "APROVADO" ? "APROVADO" : status === "REPROVADO" ? "REPROVADO" : "APROVADO COM RESSALVAS";
  const action = status === "REPROVADO"
    ? "Corrigir os bloqueios de rede ou infraestrutura antes de iniciar a implantação."
    : status === "APROVADO_RESSALVAS"
      ? "Complementar os dados pendentes e validar os itens destacados pela equipe técnica."
      : "Ambiente apto para seguir para a próxima etapa de implantação.";
  const report = `# Diagnóstico de Viabilidade Técnica - ${system}
**Status Geral:** ${statusLabel}

## 1. Resumo da coleta
- **Sistema:** ${system}
- ${checks[0].passed ? "✅" : "⚠️"} **Sistema operacional:** ${os || "Não informado"}
- ${checks[1].passed ? "✅" : "⚠️"} **Processador:** ${processor || "Não informado"}
- ${checks[1].passed ? "✅" : "⚠️"} **Memória Ram:** ${memoryDisplay}
- ${checks[2].passed ? "✅" : "⚠️"} **Armazenamento:** ${storageDisplay}
- ${checks[3].passed ? "✅" : "⚠️"} **Rede:** ${network || "Não informado"}
- ${checks[3].passed ? "✅" : "⚠️"} **Internet:** ${internetDisplay}
- **Equipamento:** ${device || "Não informado"}

## 2. Plano de ação
${action}

_Auditoria automática baseada na matriz oficial TOTVS Linx Taste/Degust One._`;
  return { status, checks, report };
}

export function normalizeImportedPayload(value: unknown): HubRecord[] {
  const candidates = Array.isArray(value) ? value : [value];
  return candidates.map((candidate, index) => {
    const payload = asRecord(normalizeCollectorReport(candidate));
    const system = findSystem(payload);
    const result = auditPayload(payload, system);
    const now = new Date();
    const storeName = findData(payload, ["nomeFantasia", "nome_fantasia", "tradeName", "loja", "storeName"]) || `Nova loja ${index + 1}`;
    return {
      id: `hub-${Date.now()}-${index}`,
      system,
      status: result.status,
      storeName,
      tradeName: storeName,
      cnpj: findData(payload, ["cnpj", "documento", "taxId"]) || "CNPJ não informado",
      collectedBy: findData(payload, ["coletadoPor", "nomeColetor", "collector", "responsavel", "colaborador", "name"]) || "Responsável não informado",
      receivedAt: now.toISOString(),
      source: "Importação JSON",
      payload,
      report: result.report,
      checks: result.checks,
    };
  });
}

export function normalizeCollectionPayload(payload: CollectionPayload): HubRecord {
  const [record] = normalizeImportedPayload(payload);
  return {
    ...record,
    id: payload.collectionId,
    receivedAt: new Date().toISOString(),
    source: "Importação JSON",
  };
}

export function createDemoRecords(): HubRecord[] {
  return normalizeImportedPayload([
    { sistema: "TasteOne PDV", nomeFantasia: "Casa do Sabor", cnpj: "12.345.678/0001-90", coletadoPor: "Mariana Costa", os: "Windows 11 Pro 64 bits", processador: "Intel Core i5 10ª geração", ram: "16 GB", armazenamento: "SSD 512 GB", conectividade: "Ethernet Gigabit", internetMbps: 100 },
    { sistema: "TasteOne Autoatendimento", nomeFantasia: "Bistrô Central", cnpj: "98.765.432/0001-10", coletadoPor: "Rafael Lima", os: "Android 9", processador: "Octa-Core 2.0 GHz", ram: "4 GB", armazenamento: "16 GB", conectividade: "Ethernet", internetMbps: 50, modelo: "Sunmi K2" },
    { sistema: "Degust PDV", nomeFantasia: "Empório da Praça", cnpj: "45.678.901/0001-22", coletadoPor: "Camila Souza", os: "Windows 10", processador: "Intel Core i5", ram: "8 GB", armazenamento: "SSD 128 GB", conectividade: "Wi-Fi", internetMbps: 10 },
  ]).map((record) => ({ ...record, source: "Demonstração" }));
}

export function isHubSystem(value: string): value is HubSystem {
  return systemNames.includes(value as HubSystem);
}
