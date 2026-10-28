"use client";
import { useEffect, useRef, useState } from "react";
import { api, RequestError } from "@/lib/api";
import { formatDate, formatTime } from "@/lib/dates";
import { usePrivateDocument } from "@/lib/private-document";
import { useOnline } from "@/lib/connectivity";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Brand } from "@/components/brand";
import { FormSelect } from "@/components/form-select";
import { SignaturePad } from "@/features/consents/signature-pad";
import { PacketLabel } from "./packet-label";
import { PacketDocument } from "./packet-document";
import { packetSignSchema, type PacketContext } from "@/lib/packages";
import { signedSnapshotSchema, type Handwriting } from "@/lib/consents";
export function ClientPacket() {
  usePrivateDocument();
  useEffect(() => {
    const newDocument = () => {
      if (window.location.hash.length > 1) window.location.reload();
    };
    window.addEventListener("hashchange", newDocument);
    return () => window.removeEventListener("hashchange", newDocument);
  }, []);
  const token = useRef("");
  const pending = useRef<{ action: string; input: unknown } | null>(null);
  const [hasToken, setHasToken] = useState(false);
  const [context, setContext] = useState<PacketContext | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const online = useOnline();
  const [answers, setAnswers] = useState<Record<string, boolean | string>>({});
  const [signature, setSignature] = useState<Handwriting>([]);
  const [confirmed, setConfirmed] = useState(false);
  const [received, setReceived] = useState(false);
  const [authority, setAuthority] = useState(false);
  const [photos, setPhotos] = useState({
    photo_documentation: false,
    photo_demonstration: false,
    photo_scope: "none" as "none" | "detail" | "recognizable",
  });
  async function load() {
    if (!token.current) return;
    setBusy(true);
    setError("");
    try {
      const c = await api<PacketContext>("/api/packets/access", {
        method: "POST",
        credentials: "omit",
        body: JSON.stringify({ token: token.current, action: "read" }),
      });
      setContext(c);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Documento non disponibile.");
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    token.current = window.location.hash.slice(1) || token.current;
    window.history.replaceState(null, "", window.location.pathname);
    if (!/^[a-f0-9]{64}$/.test(token.current)) {
      setError("Riapri il collegamento completo ricevuto dallo studio.");
      return;
    }
    setHasToken(true);
    void load();
  }, []);
  async function act(action: string, input: unknown) {
    setBusy(true);
    setError("");
    const attempt = pending.current ?? { action, input };
    pending.current = attempt;
    try {
      const c = await api<PacketContext>("/api/packets/access", {
        method: "POST",
        credentials: "omit",
        body: JSON.stringify({ token: token.current, ...attempt }),
      });
      setContext(c);
      setUncertain(false);
      pending.current = null;
    } catch (e) {
      const ambiguous =
        !(e instanceof RequestError) ||
        e.status >= 500 ||
        e.code === "CONNECTION_LOST" ||
        e.code === "INCOMPLETE_RESPONSE";
      setUncertain(ambiguous);
      if (!ambiguous) pending.current = null;
      setError(
        e instanceof Error
          ? e.message
          : "Esito non verificato. Riprova lo stesso invio.",
      );
    } finally {
      setBusy(false);
    }
  }
  const disabled = busy || !online || uncertain;
  const c = context;
  return (
    <div className="min-h-dvh bg-background px-5 py-7 sm:px-8">
      <main className="mx-auto max-w-3xl pb-12 [overflow-wrap:anywhere]">
        <Brand />
        <div className="mt-8">
          {!c ? (
            <>
              <h1 className="text-[32px]">Il tuo modulo</h1>
              <p role="status" className="mt-4 text-sm">
                {busy
                  ? "Apertura del documento…"
                  : "Apri il modulo dal collegamento personale."}
              </p>
              {!busy && hasToken && (
                <Button
                  className="mt-5"
                  disabled={!online}
                  onClick={() => void load()}
                >
                  Riprova apertura
                </Button>
              )}
            </>
          ) : (
            <>
              <h1 className="text-[32px]">{c.content.title}</h1>
              <p className="mt-3 text-sm">
                Studio: {c.studio}
                <br />
                Cliente: {c.client_name}
                <br />
                Appuntamento:{" "}
                {formatDate(c.starts_at, c.timezone, {
                  year: "numeric",
                })} alle {formatTime(c.starts_at, c.timezone)} ({c.timezone})
                <br />
                Firmatario: {c.signer_name} ·{" "}
                {c.role === "self"
                  ? "Cliente"
                  : c.role === "parent"
                    ? "Genitore"
                    : "Tutore"}
              </p>
              <p className="mt-3 text-sm text-muted-foreground">
                Se la persona o il ruolo indicati non sono corretti, interrompi
                e contatta lo studio. Il collegamento è personale e non dà
                accesso ad altri documenti.
              </p>
              {c.stage === "health" && (
                <section className="mt-8 space-y-6">
                  <h2 className="text-xl">
                    Privacy e dati relativi alla salute
                  </h2>
                  <p className="text-sm">
                    Titolare: {c.professional.data_controller}
                    <br />
                    {c.professional.address}
                    <br />
                    {c.professional.email}
                    {c.professional.pec ? ` · PEC: ${c.professional.pec}` : ""}
                  </p>
                  <p className="whitespace-pre-wrap text-sm leading-relaxed">
                    {c.content.privacy_notice}
                  </p>
                  <p className="whitespace-pre-wrap text-sm leading-relaxed">
                    {c.content.health_statement}
                  </p>
                  {c.role !== "self" && (
                    <p className="text-sm">
                      La scelta è resa per la cliente minorenne indicata sopra,
                      nel ruolo verificato dallo studio.
                    </p>
                  )}
                  <p className="text-sm text-muted-foreground">
                    Il questionario viene raccolto solo dopo il consenso
                    esplicito di tutti i firmatari richiesti. Puoi rifiutare e
                    contattare lo studio; la prenotazione non verrà annullata
                    automaticamente.
                  </p>
                  <div className="flex flex-wrap gap-3">
                    <Button
                      disabled={disabled}
                      onClick={() => void act("health", { allowed: true })}
                    >
                      Acconsento ai dati sanitari
                    </Button>
                    <Button
                      variant="outline"
                      disabled={disabled}
                      onClick={() => void act("health", { allowed: false })}
                    >
                      Non acconsento
                    </Button>
                  </div>
                </section>
              )}
              {c.stage === "declined" && (
                <section className="mt-8">
                  <h2 className="text-xl">Raccolta sanitaria non avviata</h2>
                  <p className="mt-3 text-sm">
                    È stato registrato un rifiuto al trattamento dei dati
                    sanitari. Contatta lo studio per chiarire come procedere;
                    non sono state raccolte risposte tramite questo modulo.
                  </p>
                </section>
              )}
              {c.stage === "waiting" && (
                <section className="mt-8">
                  <h2 className="text-xl">In attesa degli altri passaggi</h2>
                  <p className="mt-3 text-sm">
                    Prima di continuare servono le scelte degli altri
                    rappresentanti oppure la compilazione del questionario da
                    parte del primo rappresentante indicato dallo studio.
                  </p>
                  <Button
                    className="mt-5"
                    variant="outline"
                    disabled={disabled}
                    onClick={() => void load()}
                  >
                    Verifica se puoi continuare
                  </Button>
                </section>
              )}
              {c.stage === "answers" && (
                <form
                  className="mt-8 space-y-7"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void act("answers", { answers });
                  }}
                >
                  <h2 className="text-xl">Dichiarazioni pre-trattamento</h2>
                  <p className="whitespace-pre-wrap text-sm leading-relaxed">
                    {c.content.introduction}
                  </p>
                  <fieldset disabled={disabled} className="space-y-6">
                    {c.content.questions.map((q, i) => (
                      <div className="field" key={q.id}>
                        <Label htmlFor={`packet-answer-${q.id}`}>
                          {i + 1}. {q.label}
                          {q.required ? " · richiesta" : ""}
                        </Label>
                        {q.type === "yes_no" ? (
                          <FormSelect
                            id={`packet-answer-${q.id}`}
                            value={
                              answers[q.id] === true
                                ? "yes"
                                : answers[q.id] === false
                                  ? "no"
                                  : ""
                            }
                            onChange={(v) =>
                              setAnswers((a) => {
                                const next = { ...a };
                                if (v) next[q.id] = v === "yes";
                                else delete next[q.id];
                                return next;
                              })
                            }
                            options={[
                              { value: "", label: "Scegli la risposta" },
                              { value: "yes", label: "Sì" },
                              { value: "no", label: "No" },
                            ]}
                          />
                        ) : (
                          <Textarea
                            id={`packet-answer-${q.id}`}
                            value={
                              typeof answers[q.id] === "string"
                                ? (answers[q.id] as string)
                                : ""
                            }
                            maxLength={500}
                            rows={4}
                            onChange={(e) =>
                              setAnswers({ ...answers, [q.id]: e.target.value })
                            }
                          />
                        )}
                      </div>
                    ))}
                  </fieldset>
                  <p className="text-sm text-muted-foreground">
                    Dichiaro che le informazioni fornite sono, per quanto a mia
                    conoscenza, complete e corrette e mi impegno a segnalare
                    variazioni importanti prima delle sedute successive. Dopo
                    l’invio le risposte di questo documento restano fissate; per
                    correggerle contatta lo studio.
                  </p>
                  <Button type="submit" disabled={disabled}>
                    Invia risposte e controlla il documento
                  </Button>
                </form>
              )}
              {c.stage === "sign" && (
                <form
                  className="mt-8 space-y-7"
                  onSubmit={(e) => {
                    e.preventDefault();
                    try {
                      const payload = packetSignSchema.parse({
                        request_id: crypto.randomUUID(),
                        snapshot_hash: c.snapshot_hash,
                        confirmed,
                        aftercare_received: received,
                        authority_confirmed: authority,
                        signature,
                        ...photos,
                      });
                      void act("sign", payload);
                    } catch {
                      setError(
                        "Completa conferme, ambito delle foto autorizzate e firma prima di inviare.",
                      );
                    }
                  }}
                >
                  <PacketDocument
                    content={c.content}
                    professional={c.professional}
                    clientName={c.client_name}
                    details={c.details}
                    answers={c.answers}
                  />
                  {!!c.snapshot && (
                    <section>
                      <h2 className="text-xl">Pigmenti e lotti</h2>
                      {signedSnapshotSchema
                        .parse(c.snapshot)
                        .lots.map((l, i) => (
                          <div key={i} className="mt-3 text-sm">
                            <p>
                              {l.brand} · {l.name} · lotto {l.lot_number} ·
                              scadenza {l.expires_on}
                              <br />
                              {l.label_text}
                              <br />
                              {l.label_file_id
                                ? "Etichetta conservata nel documento finale."
                                : "Foto dell’etichetta non allegata."}
                            </p>
                            {l.label_file_id && (
                              <PacketLabel
                                token={() => token.current}
                                id={l.label_file_id}
                              />
                            )}
                          </div>
                        ))}
                    </section>
                  )}
                  <fieldset disabled={disabled} className="space-y-6">
                    <section className="space-y-4 border-y py-6">
                      <h2 className="text-xl">
                        Fotografie: scelte facoltative
                      </h2>
                      <p className="text-sm leading-relaxed">
                        {c.content.photo_notice}
                      </p>
                      <label className="flex min-h-11 items-start gap-3 text-sm leading-relaxed">
                        <Checkbox
                          checked={photos.photo_documentation}
                          onCheckedChange={(v) =>
                            setPhotos({
                              photo_documentation: v === true,
                              photo_demonstration:
                                v === true && photos.photo_demonstration,
                              photo_scope:
                                v === true ? photos.photo_scope : "none",
                            })
                          }
                        />
                        {c.content.photo_documentation}
                      </label>
                      <label className="flex min-h-11 items-start gap-3 text-sm leading-relaxed">
                        <Checkbox
                          checked={photos.photo_demonstration}
                          disabled={!photos.photo_documentation}
                          onCheckedChange={(v) =>
                            setPhotos({
                              ...photos,
                              photo_demonstration: v === true,
                              photo_scope:
                                v === true ? photos.photo_scope : "none",
                            })
                          }
                        />
                        {c.content.photo_demonstration}
                      </label>
                      {photos.photo_demonstration && (
                        <div className="field">
                          <Label htmlFor="packet-photo-scope">
                            Quali immagini autorizzi per portfolio, sito e
                            social?
                          </Label>
                          <FormSelect
                            id="packet-photo-scope"
                            value={photos.photo_scope}
                            onChange={(v) =>
                              setPhotos({
                                ...photos,
                                photo_scope: v as typeof photos.photo_scope,
                              })
                            }
                            options={[
                              {
                                value: "none",
                                label: "Seleziona l’ambito autorizzato",
                              },
                              {
                                value: "detail",
                                label: "Solo dettaglio dell’area trattata",
                              },
                              {
                                value: "recognizable",
                                label:
                                  "Volto / immagine riconoscibile consentiti",
                              },
                            ]}
                          />
                        </div>
                      )}
                    </section>
                    <label className="flex min-h-11 items-start gap-3 text-sm leading-relaxed">
                      <Checkbox
                        checked={confirmed}
                        onCheckedChange={(v) => setConfirmed(v === true)}
                      />
                      Ho letto le informazioni, verificato le risposte e
                      acconsento al trattamento indicato.
                    </label>
                    <label className="flex min-h-11 items-start gap-3 text-sm leading-relaxed">
                      <Checkbox
                        checked={received}
                        onCheckedChange={(v) => setReceived(v === true)}
                      />
                      {c.content.aftercare_statement}
                    </label>
                    <label className="flex min-h-11 items-start gap-3 text-sm leading-relaxed">
                      <Checkbox
                        checked={authority}
                        onCheckedChange={(v) => setAuthority(v === true)}
                      />
                      {c.role === "self"
                        ? "Confermo di essere la cliente maggiorenne indicata nel documento."
                        : `${c.content.guardian_statement} Persona rappresentata: ${c.client_name}.`}
                    </label>
                    <h2 className="text-xl">Firma di {c.signer_name}</h2>
                    <SignaturePad
                      value={signature}
                      onChange={setSignature}
                      disabled={disabled}
                    />
                    <p className="text-sm text-muted-foreground">
                      La firma è conservata con testo e scelte indicate. È una
                      firma disegnata, non una firma digitale qualificata. Non
                      viene salvata sul dispositivo.
                    </p>
                  </fieldset>
                  <Button type="submit" disabled={disabled}>
                    Firma il modulo e conferma le scelte
                  </Button>
                </form>
              )}
              {c.stage === "signed" && (
                <section className="mt-8">
                  <h2 className="text-xl">Firma ricevuta</h2>
                  <p className="mt-3 text-sm">
                    La tua firma e le scelte sono conservate. Lo studio
                    completerà il documento con le altre firme richieste e la
                    controfirma dell’operatrice.
                  </p>
                </section>
              )}
            </>
          )}
          {error && (
            <p
              role="alert"
              className="mt-6 whitespace-pre-wrap text-sm text-destructive"
            >
              {error}
            </p>
          )}
          {uncertain && (
            <div className="mt-4 space-y-3">
              <p className="text-sm">
                Mantieni aperta questa pagina. Il nuovo tentativo riutilizza
                esattamente i dati già inviati.
              </p>
              <Button
                disabled={!online || busy}
                onClick={() =>
                  pending.current &&
                  void act(pending.current.action, pending.current.input)
                }
              >
                Riprova lo stesso invio
              </Button>
            </div>
          )}
          {!online && (
            <p role="status" className="mt-5 text-sm">
              Serve una connessione Internet. I dati non verranno inviati
              automaticamente al ritorno della rete.
            </p>
          )}
        </div>
      </main>
    </div>
  );
}
