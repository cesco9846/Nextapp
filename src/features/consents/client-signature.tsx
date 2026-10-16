"use client";
import { useEffect, useRef, useState } from "react";
import { Check, LoaderCircle } from "lucide-react";
import Image from "next/image";
import { api, RequestError } from "@/lib/api";
import {
  signatureSubmitSchema,
  type SignatureContext,
  type ConsentReceipt,
  type Handwriting,
} from "@/lib/consents";
import { intakeTokenSchema } from "@/lib/intake";
import { usePrivateDocument } from "@/lib/private-document";
import { Brand } from "@/components/brand";
import { ConnectivityNotice } from "@/components/connectivity-notice";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { SignaturePad } from "./signature-pad";

function PublicLabel({ token, id }: { token: () => string; id: string }) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(
    () => () => {
      if (url) URL.revokeObjectURL(url);
    },
    [url],
  );
  return (
    <div className="mt-3">
      <Button
        type="button"
        variant="outline"
        disabled={busy}
        onClick={async () => {
          if (url) {
            setUrl("");
            return;
          }
          setError("");
          setBusy(true);
          try {
            const r = await fetch("/api/consent/label", {
              method: "POST",
              credentials: "omit",
              cache: "no-store",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ token: token(), id }),
            });
            if (!r.ok)
              throw new Error(
                "Etichetta non disponibile. Chiedi allo studio di verificarla prima di firmare.",
              );
            setUrl(URL.createObjectURL(await r.blob()));
          } catch (e) {
            setError(
              e instanceof Error
                ? e.message
                : "Controlla la connessione e riprova.",
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Apertura…" : url ? "Chiudi etichetta" : "Visualizza etichetta"}
      </Button>
      {url && (
        <Image
          src={url}
          unoptimized
          width={1600}
          height={1000}
          alt="Etichetta del lotto scelto per questo trattamento"
          className="mt-4 max-h-80 max-w-full rounded-lg border object-contain"
        />
      )}
      {error && (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
export function ClientSignature() {
  usePrivateDocument();
  const token = useRef("");
  const attempt = useRef<ReturnType<typeof signatureSubmitSchema.parse> | null>(
    null,
  );
  const [context, setContext] = useState<SignatureContext | null>(null);
  const [receipt, setReceipt] = useState<ConsentReceipt | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [name, setName] = useState("");
  const [signature, setSignature] = useState<Handwriting>([]);
  const [photoChoices, setPhotoChoices] = useState({
    documentation: false,
    demonstration: false,
  });
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const raw = window.location.hash.slice(1) || token.current;
    token.current = raw;
    window.history.replaceState(null, "", window.location.pathname);
    const controller = new AbortController();
    async function load() {
      if (!intakeTokenSchema.safeParse(raw).success)
        throw new RequestError(
          "Riapri il collegamento completo ricevuto dallo studio.",
          410,
        );
      const r = await api<{ context: SignatureContext }>("/api/consent/read", {
        method: "POST",
        credentials: "omit",
        body: JSON.stringify({ token: raw }),
        signal: controller.signal,
      });
      if (!controller.signal.aborted) setContext(r.context);
    }
    void load()
      .catch((e) => {
        if (!controller.signal.aborted) {
          setError(
            e instanceof Error ? e.message : "Collegamento non disponibile.",
          );
          if (e instanceof RequestError && e.status === 410)
            setUnavailable(true);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    const changed = () => {
      if (window.location.hash) {
        document.documentElement.style.visibility = "hidden";
        window.location.reload();
      }
    };
    window.addEventListener("hashchange", changed);
    return () => {
      controller.abort();
      window.removeEventListener("hashchange", changed);
    };
  }, []);
  useEffect(() => {
    if (!context) return;
    const timer = setTimeout(
      () => {
        setContext(null);
        setSignature([]);
        setName("");
        setConfirmed(false);
        setPhotoChoices({ documentation: false, demonstration: false });
        attempt.current = null;
        token.current = "";
        setUnavailable(true);
        setError(
          uncertain
            ? "Il collegamento è scaduto e l’esito dell’invio non è confermato. Chiedi allo studio di verificare se la firma è stata ricevuta."
            : "Il collegamento è scaduto. Chiedi allo studio un nuovo link.",
        );
      },
      Math.max(0, new Date(context.expires_at).getTime() - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [context, uncertain]);
  async function loadAgain() {
    setLoading(true);
    setError("");
    try {
      const r = await api<{ context: SignatureContext }>("/api/consent/read", {
        method: "POST",
        credentials: "omit",
        body: JSON.stringify({ token: token.current }),
      });
      setContext(r.context);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Apertura non riuscita.");
      if (e instanceof RequestError && e.status === 410) setUnavailable(true);
    } finally {
      setLoading(false);
    }
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!attempt.current) {
      const parsed = signatureSubmitSchema.safeParse({
        token: token.current,
        request_id: crypto.randomUUID(),
        snapshot_hash: context?.snapshot_hash,
        signer_name: name,
        confirmed,
        signature,
        ...(context?.snapshot.photo_policy
          ? { photo_choices: photoChoices }
          : {}),
      });
      if (!parsed.success) {
        setError(
          "Scrivi nome e cognome, traccia una firma completa e conferma di aver verificato il documento.",
        );
        return;
      }
      attempt.current = parsed.data;
    }
    setBusy(true);
    try {
      const r = await api<{ receipt: ConsentReceipt }>("/api/consent/sign", {
        method: "POST",
        credentials: "omit",
        body: JSON.stringify(attempt.current),
      });
      setReceipt(r.receipt);
      setContext(null);
      setSignature([]);
      setName("");
      setConfirmed(false);
      setPhotoChoices({ documentation: false, demonstration: false });
      token.current = "";
      attempt.current = null;
      setUncertain(false);
    } catch (e) {
      const ambiguous =
        e instanceof RequestError &&
        (["CONNECTION_LOST", "INCOMPLETE_RESPONSE"].includes(e.code ?? "") ||
          e.status >= 500);
      if (ambiguous) {
        setUncertain(true);
        setError(
          "L’esito dell’invio non è confermato. Mantieni aperta questa pagina e premi Riprova invio quando la rete è stabile. La stessa richiesta non registra una seconda firma.",
        );
      } else {
        setError(
          e instanceof Error ? e.message : "Invio non riuscito. Riprova.",
        );
        if (!uncertain) attempt.current = null;
      }
      if (e instanceof RequestError && e.status === 410) {
        setContext(null);
        setSignature([]);
        setName("");
        token.current = "";
        attempt.current = null;
        setUnavailable(true);
        setError(
          "Collegamento non disponibile. Se avevi già inviato, chiedi allo studio di verificare la firma ricevuta.",
        );
      }
    } finally {
      setBusy(false);
    }
  }
  const s = context?.snapshot;
  return (
    <div className="min-h-dvh bg-background">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-4 px-5 py-5 sm:px-8">
          <Brand />
          <Button variant="ghost" asChild>
            <a href="/accedi">Accesso professionista</a>
          </Button>
        </div>
      </header>
      <ConnectivityNotice />
      <main
        id="contenuto"
        className="mx-auto max-w-3xl px-5 py-9 sm:px-8 sm:py-12"
      >
        {loading ? (
          <p
            role="status"
            className="flex items-center gap-3 py-8 text-muted-foreground"
          >
            <LoaderCircle className="size-5 animate-spin" />
            Apertura del documento…
          </p>
        ) : receipt ? (
          <section className="py-8">
            <div className="mb-6 flex size-12 items-center justify-center rounded-xl bg-accent text-primary">
              <Check />
            </div>
            <h1 className="text-[32px]">Firma ricevuta</h1>
            <p className="mt-4 max-w-prose">
              Il consenso e la tua firma sono conservati. Il PDF è in
              preparazione: lo studio potrà scaricarlo quando sarà pronto, senza
              chiederti di firmare di nuovo.
            </p>
            <p className="mt-4 text-sm text-muted-foreground">
              Puoi chiudere questa pagina o restituire il tablet alla
              professionista.
            </p>
          </section>
        ) : context && s ? (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h1 className="text-[32px]">Il tuo consenso al trattamento</h1>
              {context.mode === "tablet" && (
                <Badge variant="secondary">Modalità cliente</Badge>
              )}
            </div>
            <p className="mt-3 text-base">
              {s.client_name}, questo documento è per {s.studio}.
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              {s.service_name} ·{" "}
              {new Intl.DateTimeFormat("it-IT", {
                dateStyle: "long",
                timeStyle: "short",
                timeZone: s.timezone,
              }).format(new Date(s.starts_at))}
            </p>
            <p className="mt-5 rounded-xl bg-accent px-4 py-3 text-sm leading-relaxed text-accent-foreground">
              Controlla testi, risposte e lotti prima di firmare. Se trovi un
              errore, chiedi allo studio di correggere la preparazione e aprire
              un nuovo documento.
            </p>
            <section className="mt-8" aria-labelledby="signed-consent-title">
              <h2 id="signed-consent-title" className="text-xl">
                {s.consent.title}
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Versione {s.consent.revision}
              </p>
              <div className="mt-4 whitespace-pre-wrap break-words rounded-xl border bg-white p-5 text-base leading-relaxed sm:p-7">
                {s.consent.body}
              </div>
            </section>
            {s.anamnesis && (
              <section className="mt-8 border-t pt-7">
                <h2 className="text-xl">{s.anamnesis.title}</h2>
                <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-relaxed">
                  {s.anamnesis.body}
                </p>
                <dl className="mt-5 space-y-5">
                  {s.anamnesis.questions.map((q) => (
                    <div key={q.id}>
                      <dt className="text-sm font-medium">{q.label}</dt>
                      <dd className="mt-2 whitespace-pre-wrap break-words text-sm text-muted-foreground">
                        {s.answers[q.id] === true
                          ? "Sì"
                          : s.answers[q.id] === false
                            ? "No"
                            : s.answers[q.id] === undefined
                              ? "Non compilata (facoltativa)"
                              : String(s.answers[q.id])}
                      </dd>
                    </div>
                  ))}
                </dl>
              </section>
            )}
            {!!s.lots.length && (
              <section className="mt-8 border-t pt-7">
                <h2 className="text-xl">I lotti del tuo trattamento</h2>
                <div className="mt-5 divide-y">
                  {s.lots.map((lot, i) => (
                    <div key={i} className="py-5 first:pt-0">
                      <h3 className="text-lg">
                        {lot.brand} · {lot.name}
                      </h3>
                      <p className="mt-2 text-sm">
                        Lotto {lot.lot_number} · scadenza {lot.expires_on}
                      </p>
                      {lot.code && (
                        <p className="mt-1 text-sm text-muted-foreground">
                          Codice {lot.code}
                        </p>
                      )}
                      {lot.label_text && (
                        <p className="mt-3 whitespace-pre-wrap break-words text-sm">
                          {lot.label_text}
                        </p>
                      )}
                      <PublicLabel
                        token={() => token.current}
                        id={lot.label_file_id}
                      />
                    </div>
                  ))}
                </div>
              </section>
            )}
            <form
              onSubmit={submit}
              className="mt-8 border-t pt-7"
              autoComplete="off"
            >
              {s.photo_policy && (
                <fieldset
                  disabled={busy || uncertain}
                  className="mb-8 space-y-4 border-b pb-7"
                >
                  <legend className="mb-3 font-display text-xl">
                    Le tue scelte sulle foto
                  </legend>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {s.photo_policy.notice}
                  </p>
                  <label className="flex min-h-11 items-start gap-3 text-sm leading-relaxed">
                    <Checkbox
                      className="mt-1"
                      checked={photoChoices.documentation}
                      onCheckedChange={(v) =>
                        setPhotoChoices({
                          documentation: v === true,
                          demonstration:
                            v === true && photoChoices.demonstration,
                        })
                      }
                    />
                    <span>{s.photo_policy.documentation}</span>
                  </label>
                  <label className="flex min-h-11 items-start gap-3 text-sm leading-relaxed">
                    <Checkbox
                      className="mt-1"
                      checked={photoChoices.demonstration}
                      disabled={!photoChoices.documentation}
                      onCheckedChange={(v) =>
                        setPhotoChoices({
                          ...photoChoices,
                          demonstration: v === true,
                        })
                      }
                    />
                    <span>{s.photo_policy.demonstration}</span>
                  </label>
                  <p className="text-sm text-muted-foreground">
                    Puoi firmare il trattamento lasciando entrambe le scelte
                    vuote.
                  </p>
                </fieldset>
              )}
              <h2 className="text-xl">Conferma e firma</h2>
              <fieldset disabled={busy || uncertain} className="mt-5 space-y-5">
                <div className="field">
                  <Label htmlFor="signer-name">Il tuo nome e cognome</Label>
                  <Input
                    id="signer-name"
                    value={name}
                    maxLength={150}
                    onChange={(e) => setName(e.target.value)}
                    className="bg-white"
                  />
                </div>
                <SignaturePad
                  value={signature}
                  onChange={setSignature}
                  disabled={busy || uncertain}
                />
                <label className="flex min-h-11 items-start gap-3 text-sm leading-relaxed">
                  <Checkbox
                    className="mt-1"
                    checked={confirmed}
                    onCheckedChange={(v) => setConfirmed(v === true)}
                  />
                  <span>
                    Ho letto il consenso, verificato le risposte e le
                    informazioni sui lotti e acconsento al trattamento.
                  </span>
                </label>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  La firma disegnata viene conservata con questo documento. Non
                  è una firma digitale qualificata. I contenuti firmati non
                  verranno riscritti dalle modifiche successive dello studio.
                </p>
              </fieldset>
              {error && (
                <p
                  role="alert"
                  className="mt-5 text-sm leading-relaxed text-destructive"
                >
                  {error}
                </p>
              )}
              <Button
                className="mt-6 w-full sm:w-auto"
                disabled={busy}
                type="submit"
              >
                {busy
                  ? "Invio della firma…"
                  : uncertain
                    ? "Riprova invio"
                    : "Firma e conferma consenso"}
              </Button>
              <p className="mt-4 text-sm text-muted-foreground">
                Il collegamento è personale e scade il{" "}
                {new Intl.DateTimeFormat("it-IT", {
                  dateStyle: "short",
                  timeStyle: "short",
                  timeZone: s.timezone,
                }).format(new Date(context.expires_at))}
                . La firma non viene salvata su questo dispositivo.
              </p>
            </form>
          </>
        ) : (
          <section className="py-6">
            <h1 className="text-[32px]">
              {unavailable
                ? "Firma non disponibile"
                : "Documento non raggiungibile"}
            </h1>
            <p role="alert" className="mt-4 text-sm leading-relaxed">
              {error}
            </p>
            {!unavailable && (
              <Button
                variant="outline"
                className="mt-6"
                onClick={() => void loadAgain()}
              >
                Riprova apertura
              </Button>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
