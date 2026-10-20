"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { CalendarDays, Check, Clock3, MapPin } from "lucide-react";
import { Brand } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { ConnectivityNotice } from "@/components/connectivity-notice";
import { useOnline } from "@/lib/connectivity";
import { usePrivateDocument } from "@/lib/private-document";
import { api, RequestError } from "@/lib/api";
import {
  appointmentTokenSchema,
  type ResponseContext,
  type ResponseReceipt,
} from "@/lib/appointment-response";
import { formatDate, formatTime } from "@/lib/dates";

export function ClientAppointmentResponse() {
  usePrivateDocument();
  const online = useOnline();
  const token = useRef("");
  const attempt = useRef<{ action: "confirm" | "cancel"; key: string } | null>(
    null,
  );
  const [context, setContext] = useState<ResponseContext | null>(null);
  const [receipt, setReceipt] = useState<ResponseReceipt | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [unavailable, setUnavailable] = useState(false);
  const [reviewCancel, setReviewCancel] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [clock, setClock] = useState(() => Date.now());
  const title = useRef<HTMLHeadingElement>(null);
  const cancelReview = useRef<HTMLHeadingElement>(null);
  const cancelTrigger = useRef<HTMLButtonElement>(null);
  const retryTrigger = useRef<HTMLButtonElement>(null);
  const focusIntent = useRef<"title" | "review" | "cancel" | "retry" | null>(
    null,
  );
  useEffect(() => {
    const targets = {
      title,
      review: cancelReview,
      cancel: cancelTrigger,
      retry: retryTrigger,
    };
    if (focusIntent.current) targets[focusIntent.current].current?.focus();
    focusIntent.current = null;
  }, [receipt, reviewCancel, uncertain, unavailable]);
  const load = useCallback(async (signal?: AbortSignal) => {
    if (!appointmentTokenSchema.safeParse(token.current).success)
      throw new RequestError(
        "Riapri il collegamento completo ricevuto dallo studio. Non serve un account.",
        410,
      );
    const r = await api<{
      context?: ResponseContext;
      receipt?: ResponseReceipt;
    }>("/api/appointment-response/read", {
      method: "POST",
      credentials: "omit",
      body: JSON.stringify({ token: token.current }),
      signal,
    });
    if (signal?.aborted) return;
    setContext(r.context ?? null);
    setReceipt(r.receipt ?? null);
  }, []);
  const handleError = useCallback((e: unknown) => {
    setError(
      e instanceof Error
        ? e.message
        : "Appuntamento non raggiungibile. Riprova tra poco.",
    );
    if (e instanceof RequestError && e.status === 410) {
      setUnavailable(true);
      setContext(null);
      token.current = "";
      attempt.current = null;
    }
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    token.current = window.location.hash.slice(1) || token.current;
    window.history.replaceState(null, "", window.location.pathname);
    void load(controller.signal)
      .catch((e) => {
        if (!controller.signal.aborted) handleError(e);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    const changed = () => {
      if (window.location.hash) window.location.reload();
    };
    window.addEventListener("hashchange", changed);
    const timer = window.setInterval(() => setClock(Date.now()), 30000);
    return () => {
      controller.abort();
      window.removeEventListener("hashchange", changed);
      window.clearInterval(timer);
    };
  }, [load, handleError]);
  async function reload() {
    setLoading(true);
    setError("");
    try {
      await load();
    } catch (e) {
      handleError(e);
    } finally {
      setLoading(false);
    }
  }
  async function respond(action: "confirm" | "cancel") {
    if (attempt.current && attempt.current.action !== action) return;
    attempt.current ??= { action, key: crypto.randomUUID() };
    setBusy(true);
    setError("");
    try {
      const r = await api<{ receipt: ResponseReceipt }>(
        "/api/appointment-response/submit",
        {
          method: "POST",
          credentials: "omit",
          body: JSON.stringify({
            token: token.current,
            action,
            request_id: attempt.current.key,
          }),
        },
      );
      focusIntent.current = "title";
      setReceipt(r.receipt);
      setReviewCancel(false);
      setUncertain(false);
      attempt.current = null;
      if (action === "cancel") {
        setContext(null);
        token.current = "";
      } else
        setContext((old) => (old ? { ...old, status: "confirmed" } : null));
    } catch (e) {
      handleError(e);
      const ambiguous =
        !(e instanceof RequestError) ||
        e.status === 0 ||
        e.status >= 500 ||
        e.code === "INCOMPLETE_RESPONSE";
      setUncertain(ambiguous);
      if (ambiguous) focusIntent.current = "retry";
      else if (e instanceof RequestError && [410, 422].includes(e.status))
        focusIntent.current = "title";
      if (!ambiguous) attempt.current = null;
      if (e instanceof RequestError && e.status === 422) {
        setReviewCancel(false);
        setContext((old) => (old ? { ...old, can_cancel: false } : null));
      }
    } finally {
      setBusy(false);
    }
  }
  const confirmed = context?.status === "confirmed";
  const cancelled = receipt?.action === "cancel";
  const expired = context
    ? new Date(context.expires_at).getTime() <= clock
    : false;
  const canCancel =
    context?.can_cancel &&
    !expired &&
    new Date(context.cancel_until).getTime() > clock;
  const moment = (value: string) =>
    context
      ? `${formatDate(value, context.timezone, { year: "numeric" })} alle ${formatTime(value, context.timezone)}`
      : "";
  return (
    <div className="min-h-dvh bg-background">
      <header className="border-b bg-white">
        <div className="mx-auto max-w-2xl px-5 py-5 sm:px-8">
          <Brand />
        </div>
      </header>
      <ConnectivityNotice />
      <main
        id="contenuto"
        className="mx-auto max-w-2xl px-5 py-9 sm:px-8 sm:py-12"
      >
        {loading ? (
          <p role="status" className="py-8 text-muted-foreground">
            Apertura dell’appuntamento…
          </p>
        ) : cancelled ? (
          <section>
            <Check aria-hidden="true" className="mb-5 size-8 text-primary" />
            <h1
              ref={title}
              id="response-title"
              tabIndex={-1}
              className="text-[32px]"
            >
              Appuntamento disdetto
            </h1>
            <p role="status" className="mt-4 leading-relaxed">
              La disdetta è stata registrata nell’agenda dello studio. Per
              fissare un nuovo appuntamento, contatta la professionista.
            </p>
            <p className="mt-4 text-sm text-muted-foreground">
              Puoi chiudere questa pagina.
            </p>
          </section>
        ) : context ? (
          <>
            <h1
              ref={title}
              id="response-title"
              tabIndex={-1}
              className="text-[32px]"
            >
              {confirmed ? "Appuntamento confermato" : "Il tuo appuntamento"}
            </h1>
            <p className="mt-3 break-words text-lg">{context.studio}</p>
            {confirmed && (
              <p
                role="status"
                className="mt-3 flex items-center gap-2 text-sm text-primary"
              >
                <Check aria-hidden="true" className="size-4" />
                La conferma è registrata nell’agenda dello studio.
              </p>
            )}
            <dl className="mt-7 space-y-5 rounded-xl border bg-white p-5 sm:p-7">
              <div className="flex items-start gap-3">
                <CalendarDays
                  aria-hidden="true"
                  className="mt-0.5 size-5 shrink-0 text-muted-foreground"
                />
                <div>
                  <dt className="text-sm text-muted-foreground">Data</dt>
                  <dd className="mt-1 capitalize">
                    {formatDate(context.starts_at, context.timezone, {
                      weekday: "long",
                      year: "numeric",
                    })}
                  </dd>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Clock3
                  aria-hidden="true"
                  className="mt-0.5 size-5 shrink-0 text-muted-foreground"
                />
                <div>
                  <dt className="text-sm text-muted-foreground">Orario</dt>
                  <dd className="mt-1 tabular-nums">
                    {formatTime(context.starts_at, context.timezone)} –{" "}
                    {formatTime(context.ends_at, context.timezone)}
                  </dd>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <MapPin
                  aria-hidden="true"
                  className="mt-0.5 size-5 shrink-0 text-muted-foreground"
                />
                <div className="min-w-0">
                  <dt className="text-sm text-muted-foreground">Sede</dt>
                  <dd className="mt-1 break-words">{context.location}</dd>
                </div>
              </div>
            </dl>
            <p className="mt-5 text-sm leading-relaxed text-muted-foreground">
              {expired
                ? "Questo link è scaduto. Contatta lo studio."
                : canCancel
                  ? `Puoi disdire online fino al ${moment(context.cancel_until)}. Per spostare l’appuntamento, contatta lo studio.`
                  : "Il termine per disdire online è trascorso. Per qualsiasi cambiamento, contatta direttamente lo studio."}
            </p>
            {error && (
              <p
                role="alert"
                className="mt-5 text-sm leading-relaxed text-destructive"
              >
                {error}
              </p>
            )}
            {uncertain ? (
              <div className="mt-6 space-y-3">
                <p className="text-sm">
                  L’esito non è ancora verificato. Riprova la stessa richiesta
                  prima di fare altre modifiche.
                </p>
                <Button
                  disabled={busy || !online}
                  ref={retryTrigger}
                  onClick={() => void respond(attempt.current!.action)}
                  className="w-full sm:w-auto"
                >
                  {busy ? "Verifica in corso…" : "Riprova la stessa richiesta"}
                </Button>
              </div>
            ) : reviewCancel ? (
              <section
                className="mt-7 border-t pt-6"
                aria-labelledby="cancel-review-title"
              >
                <h2
                  ref={cancelReview}
                  tabIndex={-1}
                  id="cancel-review-title"
                  className="text-xl"
                >
                  Vuoi disdire questo appuntamento?
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  Lo slot tornerà disponibile. Per prenotare di nuovo dovrai
                  contattare lo studio.
                </p>
                <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                  <Button
                    variant="destructive"
                    disabled={busy || !online || !canCancel}
                    onClick={() => void respond("cancel")}
                  >
                    {busy ? "Disdetta in corso…" : "Conferma disdetta"}
                  </Button>
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={() => {
                      focusIntent.current = "cancel";
                      setReviewCancel(false);
                    }}
                  >
                    Mantieni appuntamento
                  </Button>
                </div>
              </section>
            ) : (
              <div className="mt-7 flex flex-col gap-3 sm:flex-row">
                {!confirmed && (
                  <Button
                    disabled={busy || !online || expired}
                    onClick={() => void respond("confirm")}
                  >
                    {busy ? "Conferma in corso…" : "Conferma appuntamento"}
                  </Button>
                )}
                {canCancel && (
                  <Button
                    ref={cancelTrigger}
                    variant="outline"
                    disabled={busy || !online}
                    onClick={() => {
                      focusIntent.current = "review";
                      setReviewCancel(true);
                      setError("");
                    }}
                  >
                    Disdici appuntamento
                  </Button>
                )}
              </div>
            )}
            <p className="mt-8 text-sm leading-relaxed text-muted-foreground">
              Il collegamento è personale. L’appuntamento cambia solo quando
              confermi un’azione in questa pagina.
            </p>
          </>
        ) : (
          <section>
            <h1 ref={title} tabIndex={-1} className="text-[32px]">
              {unavailable
                ? "Collegamento non disponibile"
                : "Appuntamento non raggiungibile"}
            </h1>
            <p role="alert" className="mt-4 leading-relaxed">
              {error}
            </p>
            {!unavailable && (
              <Button
                variant="outline"
                className="mt-6"
                disabled={!online}
                onClick={() => void reload()}
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
