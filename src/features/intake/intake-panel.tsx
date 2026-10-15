"use client";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Link2, Tablet } from "lucide-react";
import { api, RequestError } from "@/lib/api";
import type { IntakeCreated, IntakeLink } from "@/lib/intake";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
export function IntakePanel({
  id,
  appointmentVersion,
  preparationVersion,
  dirty,
  timezone,
  reload,
}: {
  id: string;
  appointmentVersion: number;
  preparationVersion: number;
  dirty: boolean;
  timezone: string;
  reload: () => void;
}) {
  const cache = useQueryClient();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(timer);
  }, []);
  const [created, setCreated] = useState<IntakeCreated | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [request, setRequest] = useState(() => ({
    link: crypto.randomUUID(),
    tablet: crypto.randomUUID(),
  }));
  const query = useQuery({
    queryKey: ["intake-links", id],
    queryFn: () =>
      api<{ items: IntakeLink[] }>(`/api/appointments/${id}/intake`),
    refetchInterval: 15000,
  });
  const date = (value: string) =>
    new Intl.DateTimeFormat("it-IT", {
      dateStyle: "short",
      timeStyle: "short",
      timeZone: timezone,
    }).format(new Date(value));
  const current =
    created &&
    (query.data?.items.find((l) => l.id === created.link.id) ?? created.link);
  const usable =
    current &&
    !current.used_at &&
    !current.revoked_at &&
    new Date(current.expires_at).getTime() > now &&
    current.preparation_version === preparationVersion &&
    current.appointment_version === appointmentVersion;
  const url =
    created?.token && usable
      ? `${window.location.origin}/compila#${created.token}`
      : "";
  async function issue(tablet = false) {
    let navigating = false;
    setError("");
    setBusy(true);
    setCopied(false);
    if (tablet) document.documentElement.dataset.glowHandoff = "true";
    try {
      const result = await api<IntakeCreated>(
        `/api/appointments/${id}/intake${tablet ? "/tablet" : ""}`,
        {
          method: "POST",
          body: JSON.stringify({
            request_id: request[tablet ? "tablet" : "link"],
            appointment_version: appointmentVersion,
            preparation_version: preparationVersion,
          }),
        },
      );
      if (tablet && result.token) {
        cache.clear();
        navigating = true;
        window.location.replace(`/compila#${result.token}`);
        return;
      }
      setCreated(result);
      setRequest((old) => ({ ...old, link: crypto.randomUUID() }));
      void cache.invalidateQueries({ queryKey: ["intake-links", id] });
    } catch (e) {
      if (
        tablet &&
        e instanceof RequestError &&
        (e.status === 401 ||
          ["CONNECTION_LOST", "INCOMPLETE_RESPONSE"].includes(e.code ?? ""))
      ) {
        // Logout may already have committed: discard the professional document.
        navigating = true;
        cache.clear();
        window.location.replace("/accedi");
        return;
      }
      setError(
        e instanceof Error
          ? e.message
          : "Non è stato possibile creare il collegamento.",
      );
    } finally {
      if (!navigating) {
        if (tablet) delete document.documentElement.dataset.glowHandoff;
        setBusy(false);
      }
    }
  }
  async function revoke(link: IntakeLink) {
    setBusy(true);
    setError("");
    try {
      await api(`/api/intake-links/${link.id}`, {
        method: "DELETE",
        body: JSON.stringify({ version: link.version }),
      });
      void cache.invalidateQueries({ queryKey: ["intake-links", id] });
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Revoca non riuscita. Riprova.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="mt-10 border-t pt-8"
      aria-labelledby="intake-panel-title"
    >
      <h2 id="intake-panel-title" className="text-xl">
        La compilazione della cliente
      </h2>
      <p className="mt-2 max-w-prose text-sm text-muted-foreground">
        Condividi un collegamento personale, valido fino a 24 ore, oppure passa
        il tablet. La cliente vedrà solo i testi e le domande di questo
        trattamento. Non verrà raccolta una firma.
      </p>
      <p className="mt-3 max-w-prose text-sm text-muted-foreground">
        Un nuovo collegamento sostituisce quello già condiviso. Avviare di nuovo
        il tablet chiude la precedente compilazione su tablet.
      </p>
      {dirty && (
        <p className="mt-4 text-sm text-muted-foreground">
          Salva le modifiche alla preparazione prima di creare un collegamento.
        </p>
      )}
      <div className="mt-5 flex flex-wrap gap-3">
        <Button
          variant="outline"
          disabled={dirty || busy}
          onClick={() => void issue()}
        >
          <Link2 />
          Genera collegamento
        </Button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline" disabled={dirty || busy}>
              <Tablet />
              Modalità cliente su tablet
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                Passare il tablet alla cliente?
              </AlertDialogTitle>
              <AlertDialogDescription>
                Lo studio verrà disconnesso su questo dispositivo. La cliente
                avrà 30 minuti per compilare, fino alla fine dell’appuntamento.
                Per tornare all’agenda dovrai accedere di nuovo con il tuo
                account.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Resta nello studio</AlertDialogCancel>
              <AlertDialogAction onClick={() => void issue(true)}>
                Disconnetti e apri compilazione
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
      {url && (
        <div className="mt-5 space-y-3 rounded-xl border bg-white p-5">
          <p className="text-sm">
            Questo collegamento è personale: condividilo soltanto con la
            cliente.
          </p>
          <div className="flex flex-wrap gap-3">
            <Input
              className="min-w-0 flex-1"
              aria-label="Collegamento personale"
              value={url}
              readOnly
              autoComplete="off"
            />
            <Button
              variant="outline"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(url);
                  setCopied(true);
                } catch {
                  setError("Seleziona e copia il collegamento dal campo.");
                }
              }}
            >
              <Copy />
              {copied ? "Copiato" : "Copia link"}
            </Button>
          </div>
        </div>
      )}
      {created && !created.token && (
        <p className="mt-4 text-sm">
          Il collegamento era già stato creato. Generane uno nuovo per copiarlo.
        </p>
      )}
      {(error || query.error) && (
        <p role="alert" className="mt-4 text-sm text-destructive">
          {error || query.error?.message}
        </p>
      )}
      {!!query.data?.items.length && (
        <ul className="mt-6 divide-y rounded-xl border bg-white">
          {query.data.items.map((link) => {
            const changed =
              link.preparation_version !== preparationVersion ||
              link.appointment_version !== appointmentVersion;
            const status = link.used_at
              ? "Compilazione ricevuta"
              : link.revoked_at
                ? "Revocato"
                : new Date(link.expires_at).getTime() <= now
                  ? "Scaduto"
                  : changed
                    ? "Preparazione modificata"
                    : "Disponibile";
            return (
              <li
                key={link.id}
                className="flex flex-wrap items-center justify-between gap-4 p-5"
              >
                <div>
                  <p className="font-medium">
                    {link.mode === "tablet" ? "Tablet" : "Collegamento cliente"}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Scadenza {date(link.expires_at)}
                  </p>
                  <Badge variant="secondary" className="mt-2">
                    {status}
                  </Badge>
                </div>
                {!link.revoked_at && !link.used_at && (
                  <Button
                    variant="ghost"
                    disabled={busy}
                    onClick={() => void revoke(link)}
                  >
                    Revoca
                  </Button>
                )}
                {link.used_at && changed && (
                  <Button variant="outline" onClick={reload}>
                    Ricarica preparazione
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
