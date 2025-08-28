"use strict";

function chunkText(text = "", maxLen = 2000) {
  const chunks = [];
  let idx = 0;
  const str = String(text);
  while (idx < str.length) {
    chunks.push(str.slice(idx, idx + maxLen));
    idx += maxLen;
  }
  return chunks;
}

function serializeFields(data, prefix = []) {
  const lines = [];
  if (Array.isArray(data)) {
    data.forEach((value, index) => {
      lines.push(...serializeFields(value, [...prefix, index]));
    });
  } else if (data && typeof data === "object") {
    Object.entries(data).forEach(([key, value]) => {
      lines.push(...serializeFields(value, [...prefix, key]));
    });
  } else {
    const key = prefix.join(".");
    lines.push(`${key}: ${data}`);
  }
  return lines;
}

function createContext({ input = "", intent = "", resolve = "", metadata = {}, maxChunkSize = 2000 } = {}) {
  let formatted;
  if (Array.isArray(input)) {
    formatted = input.map((v) => String(v));
  } else if (input && typeof input === "object") {
    const lines = serializeFields(input).join("\n");
    formatted = chunkText(lines, maxChunkSize);
  } else {
    formatted = chunkText(String(input), maxChunkSize);
  }
  return {
    input: formatted,
    intent,
    resolve,
    metadata: metadata || {}
  };
}

function formatPrompt(ctx = {}) {
  const sections = [];
  (ctx.input || []).forEach((chunk, i) => {
    const label = ctx.input.length > 1 ? `Input ${i + 1}` : "Input";
    sections.push(`${label}:\n${chunk}`);
  });
  if (ctx.intent) sections.push(`Intent:\n${ctx.intent}`);
  if (ctx.resolve) sections.push(`Resolve:\n${ctx.resolve}`);
  if (ctx.metadata && Object.keys(ctx.metadata).length) {
    sections.push(`Metadata:\n${JSON.stringify(ctx.metadata)}`);
  }
  return sections.join("\n\n");
}

module.exports = { chunkText, serializeFields, createContext, formatPrompt };

