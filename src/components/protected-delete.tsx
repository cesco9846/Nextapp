"use client";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useOnline } from "@/lib/connectivity";
import { deletionReasons, type DeletionStatus } from "@/lib/management";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "./ui/alert-dialog";

export function ProtectedDelete({
  kind,
  id,
  version,
  name,
  disabled,
  onDeleted,
}: {
  kind: "clients" | "services";
  id: string;
  version: number;
  name: string;
  disabled?: boolean;
  onDeleted: () => void;
}) {
  const client = kind === "clients";
  const noun = client ? "cliente" : "servizio";
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [reviewed, setReviewed] = useState({ version, name });
  const online = useOnline();
  const cache = useQueryClient();
  const query = useQuery({
    queryKey: ["deletion", kind, id],
    queryFn: () => api<DeletionStatus>(`/api/${kind}/${id}/deletion`),
    enabled: open,
    staleTime: 0,
  });
  const deletion = useMutation({
    mutationFn: () =>
      api(`/api/${kind}/${id}`, {
        method: "DELETE",
        body: JSON.stringify({
          version: reviewed.version,
          confirmation: "ELIMINA",
        }),
      }),
    onSuccess: async () => {
      setOpen(false);
      onDeleted();
      cache.removeQueries({ queryKey: ["client", id] });
      await Promise.all([
        cache.invalidateQueries({ queryKey: ["workspace"] }),
        cache.invalidateQueries({ queryKey: ["clients"] }),
        cache.invalidateQueries({ queryKey: ["privacy"] }),
        cache.invalidateQueries({ queryKey: ["privacy-clients"] }),
      ]);
      toast.success(
        client ? "Cliente eliminata definitivamente" : "Servizio eliminato",
      );
    },
    onError: () => {
      void query.refetch();
    },
  });
  const stale =
    version !== reviewed.version ||
    (!!query.data && query.data.version !== reviewed.version);
  const allowed = query.data?.allowed && !stale && !query.isError;
  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!deletion.isPending) {
          if (next) setReviewed({ version, name });
          setOpen(next);
          setConfirmation("");
          deletion.reset();
        }
      }}
    >
      <AlertDialogTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          className="text-destructive"
          disabled={disabled || !online}
        >
          <Trash2 className="size-4" />
          Elimina {noun}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
        <AlertDialogHeader>
          <AlertDialogTitle className="break-words [overflow-wrap:anywhere]">
            Eliminare {reviewed.name}?
          </AlertDialogTitle>
          <AlertDialogDescription>
            {client
              ? "L’eliminazione rimuove definitivamente l’anagrafica. Per conservare la scheda e lo storico usa Archivia cliente."
              : "Il servizio verrà rimosso dal catalogo. Per mantenerne lo storico puoi renderlo non disponibile per le nuove prenotazioni."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-4 text-sm">
          {query.isPending && (
            <p role="status" className="text-muted-foreground">
              Verifica dei dati collegati…
            </p>
          )}
          {query.error && (
            <div role="alert">
              <p className="text-destructive">{query.error.message}</p>
              <Button
                type="button"
                className="mt-3"
                variant="outline"
                disabled={!online || query.isFetching}
                onClick={() => query.refetch()}
              >
                Riprova verifica
              </Button>
            </div>
          )}
          {query.data && !query.data.allowed && (
            <div>
              <p className="font-semibold">Eliminazione bloccata</p>
              <ul className="mt-3 list-disc space-y-2 pl-5">
                {query.data.reasons.map((reason) => (
                  <li key={reason}>{deletionReasons[reason]}</li>
                ))}
              </ul>
              <p className="mt-3 text-muted-foreground">
                {client
                  ? "Puoi archiviare la cliente mantenendo i dati che devono essere conservati. Per richieste sui dati usa la gestione privacy."
                  : "Puoi disattivare il servizio togliendo la disponibilità per nuove prenotazioni e salvando la modifica."}
              </p>
            </div>
          )}
          {stale && (
            <p role="alert" className="text-destructive">
              Questo elemento è stato modificato. Chiudi la finestra e riapri la
              scheda aggiornata prima di eliminarlo.
            </p>
          )}
          {allowed && (
            <>
              <p>
                Nessun collegamento da conservare rilevato. L’operazione verrà
                verificata di nuovo al momento della conferma.
              </p>
              {client && (
                <div className="space-y-2">
                  <Label htmlFor={`delete-${id}`}>
                    Scrivi ELIMINA per confermare
                  </Label>
                  <Input
                    id={`delete-${id}`}
                    autoComplete="off"
                    value={confirmation}
                    onChange={(e) => setConfirmation(e.target.value)}
                    disabled={deletion.isPending}
                  />
                </div>
              )}
            </>
          )}
          {deletion.error && (
            <p role="alert" className="text-destructive">
              {deletion.error.message}
            </p>
          )}
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deletion.isPending}>
            {allowed ? "Annulla" : "Chiudi"}
          </AlertDialogCancel>
          {allowed && (
            <Button
              type="button"
              variant="destructive"
              disabled={
                !online ||
                deletion.isPending ||
                query.isFetching ||
                (client && confirmation !== "ELIMINA")
              }
              onClick={() => deletion.mutate()}
            >
              {deletion.isPending
                ? "Eliminazione…"
                : `Elimina ${noun} definitivamente`}
            </Button>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
