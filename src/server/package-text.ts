import "server-only";
import { assertDocumentCharacters } from "@/documents/pdf-renderer";
import { ApiError } from "./http";
export async function assertPackageText(input: unknown) {
  try {
    await assertDocumentCharacters(input);
  } catch {
    throw new ApiError(
      422,
      "Il testo contiene simboli non supportati dal PDF. Usa lettere e punteggiatura senza emoji prima di salvare.",
      "UNSUPPORTED_DOCUMENT_TEXT",
    );
  }
}
