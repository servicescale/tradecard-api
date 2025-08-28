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

function createContext({ input = "", intent = "", resolve = "", metadata = {}, maxChunkSize = 2000 } = {}) {
  const inputChunks = Array.isArray(input)
    ? input.map((v) => String(v))
    : chunkText(typeof input === "string" ? input : JSON.stringify(input), maxChunkSize);
  return {
    input: inputChunks,
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

module.exports = { chunkText, createContext, formatPrompt };

