/** Readable characters only — no 0/O/1/I (PRD §8.7). */
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const JOIN_CODE_LENGTH = 6;

export function generateJoinCode(): string {
  const bytes = new Uint8Array(JOIN_CODE_LENGTH);
  crypto.getRandomValues(bytes);
  let code = "";
  for (const b of bytes) code += ALPHABET[b % ALPHABET.length];
  return code;
}

/** Generates `count` codes, all unique, excluding any in `taken`. */
export function generateUniqueJoinCodes(
  count: number,
  taken: Set<string> = new Set()
): string[] {
  const codes: string[] = [];
  const seen = new Set(taken);
  while (codes.length < count) {
    const code = generateJoinCode();
    if (seen.has(code)) continue;
    seen.add(code);
    codes.push(code);
  }
  return codes;
}

export function normalizeJoinCode(input: string): string {
  return input.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}
