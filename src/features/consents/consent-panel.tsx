"use client";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Download, Link2, Tablet } from "lucide-react";
import { api, RequestError } from "@/lib/api";
import type { IntakeCreated, IntakeLink } from "@/lib/intake";
import type { ConsentMetadata } from "@/lib/consents";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";

export function ConsentPanel({
  id,
  appointmentVersion,
  preparationVersion,
  dirty,
  editable,
  timezone,
  documentsOnly = false,
}: {
  id: string;
  appointmentVersion: number;
  preparationVersion: number;
  dirty: boolean;
  editable: boolean;
  timezone: string;
  documentsOnly?: boolean;
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
  const [requests, setRequests] = useState(() => ({
    link: crypto.randomUUID(),
    tablet: crypto.randomUUID(),
  }));
  const query = useQuery({
    queryKey: ["consents", id],
    queryFn: () =>
      api<{ links: IntakeLink[]; documents: ConsentMetadata[] }>(
        `/api/appointments/${id}/consents`,
      ),
    refetchInterval: 10000,
  });
  const signed = query.data?.documents.some(
    (d) => d.preparation_version === preparationVersion,
  );
  const current =
    created &&
    (query.data?.links.find((l) => l.id === created.link.id) ?? created.link);
  const available = (link: IntakeLink) =>
    !link.used_at &&
    !link.revoked_at &&
    new Date(link.expires_at).getTime() > now &&
    link.appointment_version === appointmentVersion &&
    link.preparation_version === preparationVersion;
  const url =
    created?.token && current && available(current)
      ? `${window.location.origin}/firma#${created.token}`
      : "";
  const invalidate = () =>
    cache.invalidateQueries({ queryKey: ["consents", id] });
  const date = (v: string) =>
    new Intl.DateTimeFormat("it-IT", {
      dateStyle: "short",
      timeStyle: "short",
      timeZone: timezone,
    }).format(new Date(v));
  async function issue(tablet = false) {
    setBusy(true);
    setError("");
    setCopied(false);
    let navigating = false;
    if (tablet) document.documentElement.dataset.glowHandoff = "true";
    try {
      const result = await api<IntakeCreated>(
        `/api/appointments/${id}/consents${tablet ? "/tablet" : ""}`,
        {
          method: "POST",
          body: JSON.stringify({
            request_id: requests[tablet ? "tablet" : "link"],
            appointment_version: appointmentVersion,
            preparation_version: preparationVersion,
          }),
        },
      );
      if (tablet && result.token) {
        cache.clear();
        navigating = true;
        window.location.replace(`/firma#${result.token}`);
        return;
      }
      setCreated(result);
      setRequests((old) => ({ ...old, link: crypto.randomUUID() }));
      void invalidate();
    } catch (e) {
      if (
        tablet &&
        e instanceof RequestError &&
        (e.status === 401 ||
          ["CONNECTION_LOST", "INCOMPLETE_RESPONSE"].includes(e.code ?? ""))
      ) {
        navigating = true;
        cache.clear();
        window.location.replace("/accedi");
        return;
      }
      setError(
        e instanceof Error
          ? e.message
          : "Creazione del collegamento non riuscita.",
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
      await api(`/api/signature-requests/${link.id}`, {
        method: "DELETE",
        body: JSON.stringify({ version: link.version }),
      });
      void invalidate();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Revoca non riuscita.");
    } finally {
      setBusy(false);
    }
  }
  async function process(id: string) {
    setBusy(true);
    setError("");
    try {
      await api(`/api/consents/${id}/process`, { method: "POST", body: "{}" });
      void invalidate();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Generazione non avviata. Riprova.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function download(id: string) {
    setBusy(true);
    setError("");
    try {
      const r = await fetch(`/api/consents/${id}/download`, {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      if (!r.ok) {
        const problem = await r.json();
        throw new Error(problem.error ?? "Documento non disponibile.");
      }
      const object = URL.createObjectURL(await r.blob());
      const a = document.createElement("a");
      a.href = object;
      a.download = "consenso-glow.pdf";
      a.click();
      setTimeout(() => URL.revokeObjectURL(object), 1000);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Scaricamento non riuscito. Riprova.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="mt-10 border-t pt-8"
      aria-labelledby="consent-panel-title"
    >
      <h2 id="consent-panel-title" className="text-xl">
        {documentsOnly ? "Documenti firmati" : "Firma e documenti"}
      </h2>
      {!documentsOnly && (
        <p className="mt-2 max-w-prose text-sm leading-relaxed text-muted-foreground">
          Dopo aver completato la preparazione, apri il documento per la
          cliente. Potrà controllare testi, risposte e lotti e firmare il
          consenso. Ogni firma conserva i contenuti letti.
        </p>
      )}
      {editable && !signed && (
        <>
          <p className="mt-3 max-w-prose text-sm text-muted-foreground">
            Un nuovo link di firma sostituisce quello precedente dello stesso
            tipo. Per passare il tablet lo studio viene disconnesso su questo
            dispositivo.
          </p>
          {dirty && (
            <p className="mt-4 text-sm">
              Salva le modifiche alla preparazione prima di aprire la firma.
            </p>
          )}
          <div className="mt-5 flex flex-wrap gap-3">
            <Button
              disabled={dirty || busy || query.isPending}
              onClick={() => void issue()}
            >
              <Link2 />
              Genera link di firma
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="outline"
                  disabled={dirty || busy || query.isPending}
                >
                  <Tablet />
                  Firma su tablet
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    Passare il tablet per la firma?
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    Lo studio verrà disconnesso. La cliente avrà 30 minuti,
                    entro la fine dell’appuntamento, per leggere e firmare
                    questo documento. Per tornare all’agenda dovrai accedere di
                    nuovo.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Resta nello studio</AlertDialogCancel>
                  <AlertDialogAction onClick={() => void issue(true)}>
                    Disconnetti e apri firma
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </>
      )}
      {signed && (
        <p className="mt-4 text-sm">
          Questa revisione della preparazione è già firmata. Le modifiche
          successive richiederanno un nuovo consenso; il documento precedente
          resterà conservato.
        </p>
      )}
      {url && (
        <div className="mt-5 space-y-3 rounded-xl border bg-white p-5">
          <p className="text-sm">
            Condividi questo collegamento personale soltanto con la cliente.
          </p>
          <div className="flex flex-wrap gap-3">
            <Input
              aria-label="Collegamento per la firma"
              readOnly
              value={url}
              className="min-w-0 flex-1"
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
              {copied ? "Copiato" : "Copia link firma"}
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
      {!documentsOnly && !!query.data?.links.length && (
        <ul className="mt-5 divide-y rounded-xl border bg-white">
          {query.data.links.map((link) => (
            <li
              key={link.id}
              className="flex flex-wrap items-center justify-between gap-3 p-5"
            >
              <div>
                <p className="text-sm font-medium">
                  {link.mode === "tablet" ? "Firma su tablet" : "Link di firma"}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Scadenza {date(link.expires_at)}
                </p>
                <Badge variant="secondary" className="mt-2">
                  {link.used_at
                    ? "Firma ricevuta"
                    : link.revoked_at
                      ? "Revocato"
                      : available(link)
                        ? "Disponibile"
                        : "Scaduto o preparazione modificata"}
                </Badge>
              </div>
              {!link.used_at && !link.revoked_at && (
                <Button
                  variant="ghost"
                  disabled={busy}
                  onClick={() => void revoke(link)}
                >
                  Revoca firma
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {!!query.data?.documents.length && (
        <div className="mt-7">
          {!documentsOnly && <h3 className="text-lg">Documenti firmati</h3>}
          <ul className="mt-4 divide-y rounded-xl border bg-white">
            {query.data.documents.map((doc) => (
              <li
                key={doc.id}
                className="flex flex-wrap items-center justify-between gap-4 p-5"
              >
                <div>
                  <p className="font-medium">
                    Consenso del {date(doc.signed_at)}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Preparazione revisione {doc.preparation_version}
                    {doc.previous_id ? " · nuovo documento" : ""}
                  </p>
                  <Badge variant="secondary" className="mt-2">
                    {doc.document_state === "ready"
                      ? "PDF pronto"
                      : doc.document_state === "failed"
                        ? "PDF da rigenerare"
                        : "Firma ricevuta · PDF in preparazione"}
                  </Badge>
                  {doc.document_state !== "ready" && (
                    <p className="mt-2 max-w-prose text-sm text-muted-foreground">
                      La firma è conservata. Se la generazione si interrompe,
                      riprova senza far firmare di nuovo.
                    </p>
                  )}
                </div>
                {doc.document_state === "ready" ? (
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={() => void download(doc.id)}
                  >
                    <Download />
                    Scarica PDF
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={() => void process(doc.id)}
                  >
                    Riprova generazione PDF
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
