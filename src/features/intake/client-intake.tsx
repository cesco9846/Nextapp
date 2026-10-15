"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Check, LoaderCircle } from "lucide-react";
import { api, RequestError } from "@/lib/api";
import {
  intakeTokenSchema,
  type IntakeContext,
  type IntakeReceipt,
} from "@/lib/intake";
import { Brand } from "@/components/brand";
import { ConnectivityNotice } from "@/components/connectivity-notice";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FormSelect } from "@/components/form-select";
import { usePrivateDocument } from "@/lib/private-document";
function useIntakeAttempt() {
  const attempt = useRef({ body: "", key: "" });
  const reset = useCallback(() => {
    attempt.current = { body: "", key: "" };
  }, []);
  function withKey<T extends object>(body: T) {
    const serialized = JSON.stringify(body);
    if (attempt.current.body !== serialized)
      attempt.current = { body: serialized, key: crypto.randomUUID() };
    return { ...body, request_id: attempt.current.key };
  }
  return { withKey, reset };
}
export function ClientIntake() {
  usePrivateDocument();
  const token = useRef("");
  const { withKey, reset } = useIntakeAttempt();
  const [context, setContext] = useState<IntakeContext | null>(null);
  const [receipt, setReceipt] = useState<IntakeReceipt | null>(null);
  const [answers, setAnswers] = useState<Record<string, boolean | string>>({});
  const [confirmed, setConfirmed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [unavailable, setUnavailable] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    const raw = window.location.hash.slice(1) || token.current;
    window.history.replaceState(null, "", window.location.pathname);
    token.current = raw;
    async function load() {
      const parsed = intakeTokenSchema.safeParse(raw);
      if (!parsed.success)
        throw new RequestError(
          "Riapri il collegamento completo ricevuto dallo studio. Non è necessario accedere con un account.",
          410,
          "INTAKE_UNAVAILABLE",
        );
      const result = await api<{ context: IntakeContext }>("/api/intake/read", {
        method: "POST",
        credentials: "omit",
        body: JSON.stringify({ token: raw }),
        signal: controller.signal,
      });
      if (!controller.signal.aborted) setContext(result.context);
    }
    void load()
      .catch((e) => {
        if (!controller.signal.aborted) {
          setError(
            e instanceof Error ? e.message : "Compilazione non disponibile.",
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
        setAnswers({});
        token.current = "";
        reset();
        setUnavailable(true);
        setError(
          "Il collegamento è scaduto. Chiedi allo studio di aprire una nuova compilazione.",
        );
      },
      Math.max(0, new Date(context.expires_at).getTime() - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [context, reset]);
  async function retryRead() {
    setLoading(true);
    setError("");
    try {
      const r = await api<{ context: IntakeContext }>("/api/intake/read", {
        method: "POST",
        credentials: "omit",
        body: JSON.stringify({ token: token.current }),
      });
      setContext(r.context);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Riapri il collegamento ricevuto.",
      );
      if (e instanceof RequestError && e.status === 410) setUnavailable(true);
    } finally {
      setLoading(false);
    }
  }
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (!confirmed) {
      setError("Conferma di avere letto il testo e controllato le risposte.");
      return;
    }
    const missing = context?.anamnesis?.questions.find(
      (q) =>
        q.required &&
        (answers[q.id] === undefined ||
          (q.type === "text" && String(answers[q.id]).trim() === "")),
    );
    if (missing) {
      setError(`Completa la risposta: ${missing.label}`);
      document.getElementById(`answer-${missing.id}`)?.focus();
      return;
    }
    setBusy(true);
    try {
      const r = await api<{ receipt: IntakeReceipt }>("/api/intake/submit", {
        method: "POST",
        credentials: "omit",
        body: JSON.stringify(
          withKey({ token: token.current, answers, confirm_read: true }),
        ),
      });
      setReceipt(r.receipt);
      setContext(null);
      setAnswers({});
      token.current = "";
      reset();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Invio non confermato. Riprova con le stesse risposte.",
      );
      if (e instanceof RequestError && e.status === 410) {
        setContext(null);
        setAnswers({});
        token.current = "";
        reset();
        setUnavailable(true);
      }
    } finally {
      setBusy(false);
    }
  }
  const date = context
    ? new Intl.DateTimeFormat("it-IT", {
        dateStyle: "long",
        timeStyle: "short",
        timeZone: context.timezone,
      }).format(new Date(context.starts_at))
    : "";
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
        className="mx-auto max-w-3xl px-5 py-9 sm:px-8 sm:py-12"
        id="contenuto"
      >
        {loading ? (
          <div
            role="status"
            className="flex items-center gap-3 py-8 text-muted-foreground"
          >
            <LoaderCircle className="size-5 animate-spin" />
            Apertura della compilazione…
          </div>
        ) : receipt ? (
          <section className="py-8">
            <div className="mb-6 flex size-12 items-center justify-center rounded-xl bg-accent text-primary">
              <Check />
            </div>
            <h1 className="text-[32px]">Compilazione ricevuta</h1>
            <p className="mt-4 max-w-prose">
              Le tue risposte sono state inviate allo studio. La professionista
              le ritroverà nella preparazione del trattamento.
            </p>
            <p className="mt-4 text-sm text-muted-foreground">
              Non hai ancora firmato un consenso. Puoi chiudere questa pagina o
              restituire il tablet alla professionista.
            </p>
          </section>
        ) : context ? (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h1 className="text-[32px]">Prima del tuo appuntamento</h1>
              {context.mode === "tablet" && (
                <Badge variant="secondary">Modalità cliente</Badge>
              )}
            </div>
            <p className="mt-3 text-base">
              {context.first_name}, questa compilazione è per {context.studio}.
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              {context.service_name} · {date}
            </p>
            <p className="mt-5 rounded-xl bg-accent px-4 py-3 text-sm text-accent-foreground">
              Leggi il testo e completa le domande. Questo invio non raccoglie
              una firma e non sostituisce il consenso al trattamento.
            </p>
            <form
              className="mt-8 space-y-8"
              onSubmit={submit}
              autoComplete="off"
            >
              <fieldset disabled={busy} className="space-y-8">
                <section aria-labelledby="consent-title">
                  <h2 id="consent-title" className="text-xl">
                    {context.consent.title}
                  </h2>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Versione {context.consent.revision}
                  </p>
                  <div className="mt-4 whitespace-pre-wrap break-words rounded-xl border bg-white p-5 text-base leading-relaxed sm:p-7">
                    {context.consent.body}
                  </div>
                </section>
                {context.anamnesis && (
                  <section
                    aria-labelledby="anam-title"
                    className="border-t pt-8"
                  >
                    <h2 id="anam-title" className="text-xl">
                      {context.anamnesis.title}
                    </h2>
                    <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-relaxed text-muted-foreground">
                      {context.anamnesis.body}
                    </p>
                    <div className="mt-6 space-y-6">
                      {context.anamnesis.questions.map((q) => (
                        <div key={q.id} className="field">
                          <Label
                            htmlFor={`answer-${q.id}`}
                            className="leading-relaxed"
                          >
                            {q.label}
                            {q.required && (
                              <span className="text-sm font-normal text-muted-foreground">
                                {" "}
                                (richiesta)
                              </span>
                            )}
                          </Label>
                          {q.type === "yes_no" ? (
                            <FormSelect
                              id={`answer-${q.id}`}
                              ariaLabel={`${q.label}${q.required ? " (richiesta)" : ""}`}
                              value={
                                answers[q.id] === undefined
                                  ? ""
                                  : String(answers[q.id])
                              }
                              onChange={(value) =>
                                setAnswers((old) => ({
                                  ...old,
                                  [q.id]: value === "true",
                                }))
                              }
                              options={[
                                { value: "true", label: "Sì" },
                                { value: "false", label: "No" },
                              ]}
                              placeholder="Scegli una risposta"
                            />
                          ) : (
                            <Textarea
                              id={`answer-${q.id}`}
                              maxLength={500}
                              value={String(answers[q.id] ?? "")}
                              onChange={(e) =>
                                setAnswers((old) => ({
                                  ...old,
                                  [q.id]: e.target.value,
                                }))
                              }
                              aria-required={q.required}
                            />
                          )}
                        </div>
                      ))}
                    </div>
                  </section>
                )}
                <div className="border-t pt-6">
                  <label className="flex min-h-11 items-start gap-3 text-sm leading-relaxed">
                    <Checkbox
                      className="mt-1"
                      checked={confirmed}
                      onCheckedChange={(value) => setConfirmed(value === true)}
                    />
                    <span>
                      Ho letto il testo e controllato le risposte da inviare
                      allo studio.
                    </span>
                  </label>
                  <p className="mt-4 text-sm text-muted-foreground">
                    Il collegamento è personale e scade alle{" "}
                    {new Intl.DateTimeFormat("it-IT", {
                      timeStyle: "short",
                      timeZone: context.timezone,
                    }).format(new Date(context.expires_at))}{" "}
                    del{" "}
                    {new Intl.DateTimeFormat("it-IT", {
                      dateStyle: "short",
                      timeZone: context.timezone,
                    }).format(new Date(context.expires_at))}
                    . Le risposte non vengono salvate su questo dispositivo.
                  </p>
                </div>
                {error && (
                  <p role="alert" className="text-sm text-destructive">
                    {error}
                  </p>
                )}
                <Button
                  className="w-full sm:w-auto"
                  type="submit"
                  disabled={busy}
                >
                  {busy ? "Invio in corso…" : "Invia compilazione"}
                </Button>
              </fieldset>
            </form>
          </>
        ) : (
          <section className="py-6">
            <h1 className="text-[32px]">
              {unavailable
                ? "Compilazione non disponibile"
                : "Compilazione non raggiungibile"}
            </h1>
            <p role="alert" className="mt-4 text-sm leading-relaxed">
              {error}
            </p>
            {!unavailable && (
              <Button
                className="mt-6"
                variant="outline"
                onClick={() => void retryRead()}
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
