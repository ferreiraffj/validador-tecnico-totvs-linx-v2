import type { Request, Response } from "express";
import {
  HubRecord,
  normalizeCollectionPayload,
  validateCollectionPayload,
} from "../src/shared/hub/auditImport.js";

const records: HubRecord[] = [];

function setCors(res: Response): void {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
}

function getPayloads(body: unknown): unknown[] {
  if (Array.isArray(body)) return body;
  if (typeof body === "object" && body !== null && "collections" in body && Array.isArray(body.collections)) {
    return body.collections;
  }
  if (typeof body === "object" && body !== null && "collection" in body) {
    return [body.collection];
  }
  return [body];
}

function parseRequestBody(body: unknown): { value: unknown } | { error: string } {
  if (typeof body === "string") {
    try {
      return { value: JSON.parse(body.replace(/^\uFEFF/, "")) };
    } catch {
      return { error: "O corpo da requisição não contém um JSON válido." };
    }
  }
  if (Buffer.isBuffer(body)) {
    try {
      return { value: JSON.parse(body.toString("utf8").replace(/^\uFEFF/, "")) };
    } catch {
      return { error: "O corpo da requisição não contém um JSON válido." };
    }
  }
  return { value: body };
}

export default function collectionsHandler(req: Request, res: Response): void {
  setCors(res);
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  if (req.method === "GET") {
    res.status(200).json({ count: records.length, records });
    return;
  }
  if (req.method !== "POST") {
    res.status(405).json({ error: "Método não permitido. Use GET ou POST." });
    return;
  }

  const parsedBody = parseRequestBody(req.body);
  if ("error" in parsedBody) {
    res.status(400).json({ error: parsedBody.error });
    return;
  }

  const payloads = getPayloads(parsedBody.value);
  const errors: Array<{ index: number; errors: string[] }> = [];
  const received: HubRecord[] = [];
  payloads.forEach((value, index) => {
    try {
      const result = validateCollectionPayload(value);
      if (result.valid === false) {
        errors.push({ index, errors: result.errors });
        return;
      }
      const record = normalizeCollectionPayload(result.payload);
      const existingIndex = records.findIndex((item) => item.id === record.id);
      if (existingIndex >= 0) records.splice(existingIndex, 1, record);
      else records.unshift(record);
      received.push(record);
    } catch (error) {
      console.error(`Falha ao processar a coleta no índice ${index}.`, error);
      errors.push({ index, errors: ["Não foi possível processar esta coleta no Hub."] });
    }
  });

  if (errors.length > 0) {
    res.status(400).json({
      error: "Uma ou mais coletas não atendem ao contrato JSON.",
      details: errors,
      received: received.length,
    });
    return;
  }
  res.status(201).json({ message: "Coleta(s) recebida(s) e auditada(s).", count: received.length, records: received });
}
