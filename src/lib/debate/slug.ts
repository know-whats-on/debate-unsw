const SLUG_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

/** Short, unambiguous, URL-safe slug for audience join links. */
export function generateSlug(length = 8): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let slug = "";
  for (const b of bytes) slug += SLUG_ALPHABET[b % SLUG_ALPHABET.length];
  return slug;
}
