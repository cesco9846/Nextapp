export const MIN_PASSWORD_LENGTH = 10;
export const PASSWORD_TOO_SHORT = `La password deve contenere almeno ${MIN_PASSWORD_LENGTH} caratteri.`;

// HTML minLength counts UTF-16 units and can be skipped by autofill or scripts.
// Keep Supabase's policy authoritative; this guard gives useful feedback first.
export function passwordTooShort(password: string) {
  return Array.from(password).length < MIN_PASSWORD_LENGTH;
}

export function weakPasswordMessage(error: {
  code?: string;
  reasons?: readonly string[];
}) {
  if (error.code !== "weak_password") return null;
  return error.reasons?.includes("length")
    ? PASSWORD_TOO_SHORT
    : `Scegli una password di almeno ${MIN_PASSWORD_LENGTH} caratteri, più difficile da indovinare.`;
}
