export function formatInvitationCode(value: string): string {
  const canonical = value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10);
  return [canonical.slice(0, 4), canonical.slice(4, 8), canonical.slice(8, 10)]
    .filter(Boolean)
    .join("-");
}
