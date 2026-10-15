"use client";

export class RequestError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
  ) {
    super(message);
  }
}
export async function api<T>(path: string, options?: RequestInit): Promise<T> {
  if (typeof navigator !== "undefined" && !navigator.onLine)
    throw new RequestError(
      "Connessione assente. Riconnettiti e riprova: la richiesta non è stata inviata.",
      0,
      "OFFLINE",
    );
  let response: Response;
  try {
    response = await fetch(path, {
      ...options,
      headers: { "Content-Type": "application/json", ...options?.headers },
      cache: "no-store",
    });
  } catch {
    throw new RequestError(
      "La connessione si è interrotta e non è stato possibile confermare l’esito. Controlla la rete e verifica i dati prima di riprovare.",
      0,
      "CONNECTION_LOST",
    );
  }
  let data: unknown;
  try {
    data = await response.json();
  } catch {
    throw new RequestError(
      "La risposta del server è incompleta. Verifica i dati e riprova quando la connessione è stabile.",
      response.status,
      "INCOMPLETE_RESPONSE",
    );
  }
  const problem =
    typeof data === "object" && data !== null
      ? (data as Record<string, unknown>)
      : {};
  if (response.status === 401 && typeof window !== "undefined")
    window.dispatchEvent(new Event("glow:auth-required"));
  if (
    response.status === 403 &&
    problem.code === "ACCESS_REVOKED" &&
    typeof window !== "undefined"
  )
    window.dispatchEvent(new Event("glow:access-revoked"));
  if (!response.ok)
    throw new RequestError(
      typeof problem.error === "string"
        ? problem.error
        : "La richiesta non è riuscita. Riprova.",
      response.status,
      typeof problem.code === "string" ? problem.code : undefined,
    );
  return data as T;
}
