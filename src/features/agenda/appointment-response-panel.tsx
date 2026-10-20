"use client";
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Link2, MessageCircle, RefreshCw } from "lucide-react";
import { api, RequestError } from "@/lib/api";
import { useOnline } from "@/lib/connectivity";
import { formatDate, formatTime, whatsappUrl } from "@/lib/dates";
import type { Appointment } from "@/lib/types";
import type {
  ActionLinks,
  CreatedActionLink,
} from "@/lib/appointment-response";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function AppointmentResponsePanel({
  appointment: a,
  timezone,
}: {
  appointment: Appointment;
  timezone: string;
}) {
  const online = useOnline();
  const cache = useQueryClient();
  const requestId = useRef<string | null>(null);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [issuedId, setIssuedId] = useState("");
  const [retrying, setRetrying] = useState(false);
  const [clock, setClock] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 30000);
    return () => window.clearInterval(timer);
  }, []);
  const links = useQuery({
    queryKey: ["appointment-response", a.id],
    queryFn: () => api<ActionLinks>(`/api/appointments/${a.id}/response-links`),
  });
  const eligible =
    ["booked", "confirmed"].includes(a.status) &&
    new Date(a.starts_at).getTime() > clock;
  const active =
    links.data?.links.filter(
      (l) =>
        !l.revoked_at &&
        l.schedule_revision === a.schedule_revision &&
        new Date(l.expires_at).getTime() > clock,
    ) ?? [];
  async function create() {
    setBusy(true);
    setError("");
    setCopied(false);
    setUrl("");
    setIssuedId("");
    requestId.current ??= crypto.randomUUID();
    try {
      const r = await api<CreatedActionLink>(
        `/api/appointments/${a.id}/response-links`,
        {
          method: "POST",
          body: JSON.stringify({
            request_id: requestId.current,
            appointment_version: a.version,
          }),
        },
      );
      requestId.current = null;
      setRetrying(false);
      if (!r.token) {
        setUrl("");
        setError(
          "Il link è stato creato ma non è recuperabile. Crea un nuovo link: il precedente verrà revocato.",
        );
      } else {
        setUrl(
          `${process.env.NEXT_PUBLIC_APP_URL ?? window.location.origin}/appuntamento#${r.token}`,
        );
        setIssuedId(r.id);
      }
      await links.refetch();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Impossibile creare il link. Riprova.",
      );
      if (e instanceof RequestError && e.status >= 400 && e.status < 500) {
        requestId.current = null;
        setRetrying(false);
      } else setRetrying(true);
    } finally {
      setBusy(false);
    }
  }
  async function revoke(id: string) {
    setBusy(true);
    setError("");
    try {
      await api(`/api/appointments/${a.id}/response-links`, {
        method: "DELETE",
        body: JSON.stringify({ link_id: id }),
      });
      if (issuedId === id) {
        setUrl("");
        setIssuedId("");
      }
      await links.refetch();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Revoca non confermata. Riprova.",
      );
    } finally {
      setBusy(false);
    }
  }
  const date = (v: string) =>
    `${formatDate(v, timezone, { year: "numeric" })} alle ${formatTime(v, timezone)}`;
  const share =
    a.client.phone && url
      ? whatsappUrl(
          a.client.phone,
          `Questo è il collegamento personale per confermare o disdire il tuo appuntamento del ${date(a.starts_at)}: ${url}`,
        )
      : null;
  return (
    <section className="border-t pt-6" aria-labelledby="response-panel-heading">
      <h3 id="response-panel-heading" className="text-lg">
        Conferma e disdetta
      </h3>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        La cliente può rispondere tramite un link personale, senza account. I
        nuovi promemoria email includono il collegamento automaticamente.
      </p>
      {eligible && (
        <Button
          variant="outline"
          className="mt-4 w-full"
          disabled={!online || busy || links.isPending || !!links.error}
          onClick={() => void create()}
        >
          <Link2 />
          {busy
            ? "Operazione in corso…"
            : retrying
              ? "Riprova creazione link"
              : "Crea link personale"}
        </Button>
      )}
      {eligible && (
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
          Un nuovo link manuale revoca il precedente link manuale. Copialo prima
          di chiudere questo pannello.
        </p>
      )}
      {url && (
        <div className="mt-4 space-y-3">
          <Label htmlFor="appointment-personal-link">
            Link personale da condividere
          </Label>
          <Input
            id="appointment-personal-link"
            value={url}
            readOnly
            onFocus={(e) => e.target.select()}
          />
          <Button
            variant="secondary"
            className="w-full"
            onClick={() => {
              void navigator.clipboard
                .writeText(url)
                .then(() => setCopied(true))
                .catch(() =>
                  setError("Seleziona e copia il link dal campo qui sopra."),
                );
            }}
          >
            <Copy />
            {copied ? "Link copiato" : "Copia link"}
          </Button>
          {share && (
            <Button variant="outline" className="w-full" asChild>
              <a href={share} target="_blank" rel="noopener noreferrer">
                <MessageCircle />
                Apri WhatsApp con il link
              </a>
            </Button>
          )}
        </div>
      )}
      {error && (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {error}
        </p>
      )}
      {links.isPending ? (
        <p role="status" className="mt-4 text-sm text-muted-foreground">
          Caricamento dei collegamenti…
        </p>
      ) : links.error ? (
        <div className="mt-4">
          <p role="alert" className="text-sm text-destructive">
            {links.error.message}
          </p>
          <Button
            variant="outline"
            className="mt-3"
            disabled={!online}
            onClick={() => void links.refetch()}
          >
            Riprova caricamento
          </Button>
        </div>
      ) : (
        <>
          {active.length > 0 && (
            <ul className="mt-5 space-y-3">
              {active.map((l) => (
                <li key={l.id} className="border-t pt-3">
                  <p className="text-sm font-medium">
                    {l.source === "email"
                      ? "Link nel promemoria email"
                      : "Link condiviso dallo studio"}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Scade il {date(l.expires_at)}
                  </p>
                  <Button
                    variant="ghost"
                    className="mt-1 px-0 text-destructive"
                    disabled={!online || busy}
                    onClick={() => void revoke(l.id)}
                  >
                    Revoca collegamento
                  </Button>
                </li>
              ))}
            </ul>
          )}
          {links.data?.events.length ? (
            <div className="mt-5 border-t pt-4">
              <h4 className="text-sm font-semibold">Risposte della cliente</h4>
              <ul className="mt-3 space-y-3">
                {links.data.events.map((e) => (
                  <li key={e.id} className="text-sm">
                    <p>
                      {e.action === "confirm"
                        ? "Appuntamento confermato dalla cliente"
                        : "Appuntamento disdetto dalla cliente"}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {date(e.responded_at)}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="mt-4 text-sm text-muted-foreground">
              Nessuna risposta ricevuta tramite link.
            </p>
          )}
          <Button
            variant="ghost"
            className="mt-3 px-0"
            disabled={!online || busy || links.isFetching}
            onClick={() => {
              void links.refetch();
              void cache.invalidateQueries({ queryKey: ["appointments"] });
            }}
          >
            <RefreshCw />
            Aggiorna risposte
          </Button>
        </>
      )}
    </section>
  );
}
