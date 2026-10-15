import "server-only";
import { NextResponse } from "next/server";
import { z } from "zod";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code = "REQUEST_FAILED",
  ) {
    super(message);
  }
}

const dbErrors: Record<string, [number, string]> = {
  "54000": [
    429,
    "Hai effettuato molte operazioni. Attendi prima di riprovare.",
  ],
  "23P01": [409, "Questo orario è già occupato. Scegli un altro orario."],
  "40001": [
    409,
    "L'elemento è stato modificato da un altro dispositivo. Ricarica i dati e riprova.",
  ],
  "23505": [
    409,
    "La richiesta è già stata utilizzata con dati diversi. Riprova con una nuova operazione.",
  ],
  "23503": [
    400,
    "Uno dei riferimenti non è più disponibile. Ricarica la pagina.",
  ],
  "23514": [400, "Controlla i dati inseriti e riprova."],
  "42501": [403, "Non hai i permessi per questa operazione."],
  P0002: [404, "L'elemento non è stato trovato."],
};
const reasons: Record<string, string> = {
  INVALID_TEMPLATE: "Controlla tipo, testo e servizio del modello selezionato.",
  INVALID_QUESTIONS:
    "Controlla le domande: massimo 30, con etichetta e tipo di risposta.",
  INVALID_PIGMENT: "Inserisci marca e nome del pigmento.",
  INVALID_LOT: "Controlla numero, scadenza ed etichetta del lotto.",
  INVALID_PREPARATION: "Controlla modelli e lotti della preparazione.",
  INVALID_ANSWERS:
    "Le risposte non corrispondono al questionario selezionato. Ricarica il modello.",
  LOT_UNAVAILABLE:
    "Un lotto è archiviato o scade prima del trattamento. Scegli un lotto utilizzabile.",
  INVALID_FILE: "Seleziona un’immagine JPEG, PNG o WebP, fino a 10 MB.",
  FILE_EXPIRED:
    "Il caricamento è scaduto o è stato annullato. Avviane uno nuovo.",
  FILE_NOT_UPLOADED: "Attendi la fine del caricamento e riprova.",
  FILE_ALREADY_READY:
    "Il file è già confermato e non può essere annullato come caricamento.",
  INVALID_INVITATION:
    "L’invito è scaduto, revocato o già utilizzato. Chiedi alla titolare un nuovo collegamento.",
  INVITATION_EMAIL_MISMATCH:
    "Accedi con l’indirizzo email a cui è destinato l’invito, poi riapri il collegamento.",
  INVITATION_ALREADY_USED:
    "L’invito è già stato accettato. Per revocare l’accesso, sospendi la persona dal team.",
  ACCOUNT_ALREADY_ASSIGNED:
    "Questo account appartiene già a uno studio. Usa l’account invitato o contatta la titolare.",
  ALREADY_TEAM_MEMBER:
    "Questo indirizzo appartiene già a una persona attiva nel tuo studio.",
  OWNER_PROTECTED:
    "L’accesso della titolare non può essere sospeso da questo pannello.",
  INVALID_EMAIL: "Inserisci un indirizzo email valido.",
  INVALID_NAME: "Inserisci un nome da 2 a 100 caratteri.",
  INVALID_REFERENCE:
    "Seleziona cliente, sede, servizio e operatrice disponibili nel tuo studio.",
  TERMINAL_APPOINTMENT:
    "Questo appuntamento è già concluso o annullato e non può essere modificato.",
  INVALID_STATUS: "Il cambio di stato richiesto non è consentito.",
  APPOINTMENT_IN_FUTURE:
    "Puoi completare o segnare un'assenza solo dopo l'inizio dell'appuntamento.",
  UPCOMING_APPOINTMENTS:
    "Prima di archiviare la cliente, annulla o completa i suoi appuntamenti futuri.",
};
export function checkDb(error: { code?: string; message?: string } | null) {
  if (!error) return;
  if (error.code === "22023")
    throw new ApiError(
      400,
      reasons[error.message ?? ""] ?? "Controlla i dati inseriti.",
      "INVALID_DATA",
    );
  const mapped = dbErrors[error.code ?? ""];
  if (mapped) throw new ApiError(mapped[0], mapped[1], error.code);
  console.error("Database request failed", { code: error.code });
  throw new ApiError(
    500,
    "Non è stato possibile salvare i dati. Riprova tra poco.",
  );
}
export function requireSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const expected = new URL(process.env.NEXT_PUBLIC_APP_URL ?? request.url)
    .origin;
  if (origin !== expected)
    throw new ApiError(403, "Richiesta non autorizzata.", "ORIGIN_REJECTED");
  if (Number(request.headers.get("content-length") ?? 0) > 32768)
    throw new ApiError(413, "La richiesta contiene troppi dati.");
}
export async function readBody<T>(
  request: Request,
  schema: z.ZodType<T>,
): Promise<T> {
  requireSameOrigin(request);
  const text = await request.text();
  if (text.length > 32768)
    throw new ApiError(413, "La richiesta contiene troppi dati.");
  try {
    return schema.parse(JSON.parse(text));
  } catch (error) {
    if (error instanceof z.ZodError) throw error;
    throw new ApiError(400, "Il formato della richiesta non è valido.");
  }
}
export function json(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}
export async function handleApi(action: () => Promise<NextResponse>) {
  try {
    return await action();
  } catch (error) {
    if (error instanceof z.ZodError)
      return json(
        {
          error: error.issues[0]?.message ?? "Controlla i dati inseriti.",
          code: "VALIDATION_ERROR",
        },
        422,
      );
    if (error instanceof ApiError)
      return json({ error: error.message, code: error.code }, error.status);
    const id = crypto.randomUUID();
    console.error("Request failed", {
      id,
      type: error instanceof Error ? error.name : "unknown",
    });
    return json(
      {
        error: "Si è verificato un errore. Riprova tra poco.",
        code: "INTERNAL_ERROR",
        reference: id,
      },
      500,
    );
  }
}
