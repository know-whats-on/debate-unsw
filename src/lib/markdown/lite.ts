/**
 * Minimal parser for the AI summary's plain-markdown output ("### " headings,
 * "- " bullets, "**bold**" spans). Shared by the on-screen renderer (React
 * elements) and the PDF exporter (manual word-wrapped drawing), so a stray
 * asterisk or hash never reaches either surface as visible text.
 */
export type LiteBlockType = "heading" | "bullet" | "paragraph";

export interface LiteBlock {
  type: LiteBlockType;
  text: string;
}

export function parseLiteBlocks(markdown: string): LiteBlock[] {
  return markdown
    .split("\n")
    .map((raw) => raw.trim())
    .filter(Boolean)
    .map((trimmed) => {
      if (/^#{1,6}\s*/.test(trimmed)) {
        return { type: "heading" as const, text: trimmed.replace(/^#{1,6}\s*/, "") };
      }
      if (/^[-*•]\s+/.test(trimmed)) {
        return { type: "bullet" as const, text: trimmed.replace(/^[-*•]\s+/, "") };
      }
      return { type: "paragraph" as const, text: trimmed };
    });
}

/** Splits a line into {word, bold} tokens for manual word-wrap (PDF). */
export function tokenizeRich(text: string): { word: string; bold: boolean }[] {
  const tokens: { word: string; bold: boolean }[] = [];
  const parts = text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
  for (const part of parts) {
    const isBold = part.startsWith("**") && part.endsWith("**");
    const clean = isBold ? part.slice(2, -2) : part;
    for (const word of clean.split(/\s+/).filter(Boolean)) {
      tokens.push({ word, bold: isBold });
    }
  }
  return tokens;
}
