"use client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useOnline } from "@/lib/connectivity";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ErrorState } from "@/components/states";
type Policy = { notice_hours: number };
export function ResponsePolicy() {
  const online = useOnline();
  const cache = useQueryClient();
  const [draft, setDraft] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const policy = useQuery({
    queryKey: ["appointment-response-policy"],
    queryFn: () => api<Policy>("/api/appointment-response/preferences"),
  });
  const mutation = useMutation({
    mutationFn: (hours: number) =>
      api<Policy>("/api/appointment-response/preferences", {
        method: "PUT",
        body: JSON.stringify({ notice_hours: hours }),
      }),
    onSuccess: (r) => {
      cache.setQueryData(["appointment-response-policy"], r);
      setDraft(null);
      setSaved(true);
    },
  });
  return (
    <section
      className="mt-8 rounded-xl border bg-white p-5 sm:p-7"
      aria-labelledby="response-policy-heading"
    >
      <h2 id="response-policy-heading" className="text-xl">
        Conferma e disdetta tramite link
      </h2>
      <p className="mt-2 max-w-prose text-sm leading-relaxed text-muted-foreground">
        La cliente può confermare o disdire dalla pagina personale inclusa nei
        nuovi promemoria. Puoi anche creare un link dal dettaglio
        dell’appuntamento.
      </p>
      {policy.isPending ? (
        <p role="status" className="mt-5 text-sm text-muted-foreground">
          Caricamento delle regole…
        </p>
      ) : policy.error ? (
        <ErrorState error={policy.error} retry={() => void policy.refetch()} />
      ) : (
        <form
          className="mt-6 max-w-lg"
          onSubmit={(e) => {
            e.preventDefault();
            mutation.mutate(Number(draft ?? policy.data?.notice_hours ?? 0));
          }}
        >
          <Label htmlFor="cancellation-notice">
            Anticipo minimo per disdire online (ore)
          </Label>
          <Input
            id="cancellation-notice"
            className="mt-3 max-w-40"
            type="number"
            inputMode="numeric"
            min={0}
            max={168}
            step={1}
            required
            value={draft ?? String(policy.data?.notice_hours ?? 0)}
            disabled={!online || mutation.isPending}
            aria-describedby="cancellation-help"
            onChange={(e) => {
              setDraft(e.target.value);
              setSaved(false);
              mutation.reset();
            }}
          />
          <p
            id="cancellation-help"
            className="mt-3 text-sm leading-relaxed text-muted-foreground"
          >
            Con 0 ore si può disdire fino all’inizio dell’appuntamento. Con 24
            ore il termine è 24 ore prima dell’inizio. Oltre il termine la
            cliente dovrà contattare lo studio. La regola si applica anche ai
            link già inviati.
          </p>
          {mutation.error && (
            <p role="alert" className="mt-4 text-sm text-destructive">
              {mutation.error.message}
            </p>
          )}
          {saved && (
            <p role="status" className="mt-4 text-sm text-primary">
              Regola di disdetta salvata.
            </p>
          )}
          <Button
            className="mt-5"
            disabled={!online || mutation.isPending || draft === null}
            type="submit"
          >
            {mutation.isPending ? "Salvataggio…" : "Salva regola di disdetta"}
          </Button>
        </form>
      )}
    </section>
  );
}
