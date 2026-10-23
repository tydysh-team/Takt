export const INVITATION_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function normalizeInvitationCode(value: string): string {
  return value.toUpperCase().replaceAll("-", "").replaceAll(" ", "");
}

export function isValidInvitationCode(value: string): boolean {
  const canonical = normalizeInvitationCode(value);
  if (canonical.length !== 10) return false;
  for (const letter of canonical) {
    if (!INVITATION_ALPHABET.includes(letter)) return false;
  }
  return true;
}

export function formatInvitationCode(value: string): string {
  const canonical = normalizeInvitationCode(value).replace(/[^A-Z0-9]/g, "").slice(0, 10);
  return [canonical.slice(0, 4), canonical.slice(4, 8), canonical.slice(8, 10)]
    .filter(Boolean)
    .join("-");
}
