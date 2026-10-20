"use client";
import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { useWorkspace } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ErrorState } from "@/components/states";
import { api } from "@/lib/api";
import { useOnline } from "@/lib/connectivity";
import { formatDate } from "@/lib/dates";
import { messageStatus } from "./message-status";
import { ResponsePolicy } from "./response-policy";
import { ClientDetails } from "@/features/clients/client-details";
import type {
  ReminderHealth,
  ReminderPage,
  ReminderPreferences,
} from "./types";

function Pending({ label }: { label: string }) {
  return (
    <div role="status" className="space-y-3 py-6">
      <p className="text-sm text-muted-foreground">{label}</p>
      <div className="h-5 w-2/3 rounded bg-muted" />
      <div className="h-5 w-1/2 rounded bg-muted" />
    </div>
  );
}
export function ReminderSettings() {
  const online = useOnline();
  const queryClient = useQueryClient();
  const { tenant } = useWorkspace();
  const [draft, setDraft] = useState<boolean | null>(null);
  const [saved, setSaved] = useState(false);
  const [selectedClient, setSelectedClient] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "attention">("all");
  const [cursors, setCursors] = useState<(string | null)[]>([null]);
  const cursor = cursors.at(-1) ?? null;
  const settings = useQuery({
    queryKey: ["reminder-settings"],
    queryFn: () => api<ReminderPreferences>("/api/reminders/settings"),
  });
  const health = useQuery({
    queryKey: ["reminder-health"],
    queryFn: () => api<ReminderHealth>("/api/reminders/health"),
    refetchInterval: 30000,
  });
  const messages = useQuery({
    queryKey: ["reminder-messages", filter, cursor],
    queryFn: () =>
      api<ReminderPage>(
        `/api/reminders/messages?filter=${filter}${cursor ? `&cursor=${cursor}` : ""}`,
      ),
    refetchInterval: 30000,
  });
  const update = useMutation({
    mutationFn: (enabled: boolean) =>
      api<ReminderPreferences>("/api/reminders/settings", {
        method: "PUT",
        body: JSON.stringify({ enabled }),
      }),
    onSuccess: (result) => {
      queryClient.setQueryData(["reminder-settings"], result);
      setDraft(null);
      setSaved(true);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["reminder-settings"] });
      void queryClient.invalidateQueries({ queryKey: ["reminder-health"] });
    },
  });
  const enabled = draft ?? settings.data?.enabled ?? false;
  function changeFilter(value: "all" | "attention") {
    setFilter(value);
    setCursors([null]);
  }
  function refresh() {
    setCursors([null]);
    void queryClient.invalidateQueries({ queryKey: ["reminder-messages"] });
    void queryClient.invalidateQueries({ queryKey: ["reminder-health"] });
    void queryClient.invalidateQueries({ queryKey: ["reminder-settings"] });
  }
  const date = (value: string) =>
    formatDate(value, tenant.timezone, {
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  return (
    <div className="page-container max-w-6xl">
      <Button variant="link" className="mb-3 px-0" asChild>
        <Link href="/app/impostazioni">
          <ArrowLeft />
          Il tuo studio
        </Link>
      </Button>
      <h1 className="text-[32px]">Promemoria email</h1>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
        Scegli se preparare un’email 24 ore prima dell’appuntamento e controlla
        gli esiti del tuo studio.
      </p>
      <section
        className="mt-8 rounded-xl border bg-white p-5 sm:p-7"
        aria-labelledby="reminder-settings-heading"
      >
        <h2 id="reminder-settings-heading" className="text-xl">
          Preferenze di invio
        </h2>
        {settings.isPending ? (
          <Pending label="Caricamento delle preferenze…" />
        ) : settings.error ? (
          <ErrorState
            error={settings.error}
            retry={() => void settings.refetch()}
          />
        ) : (
          settings.data && (
            <>
              {!settings.data.delivery_enabled && (
                <div
                  role="status"
                  className="mt-5 rounded-lg bg-secondary p-4 text-sm leading-relaxed"
                >
                  <p className="font-semibold">
                    Invii automatici non ancora attivi
                  </p>
                  <p className="mt-1">
                    Puoi salvare la preferenza dello studio. Glow inizierà a
                    inviare solo quando il servizio sarà attivato.
                  </p>
                </div>
              )}
              <div className="mt-6 grid gap-7 lg:grid-cols-2">
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    update.mutate(enabled);
                  }}
                >
                  <div className="flex min-h-11 items-start gap-3">
                    <Checkbox
                      id="reminders-enabled"
                      className="mt-1"
                      checked={enabled}
                      disabled={
                        !online ||
                        update.isPending ||
                        (!settings.data.reply_to_verified && !enabled)
                      }
                      onCheckedChange={(value) => {
                        setDraft(value === true);
                        setSaved(false);
                        update.reset();
                      }}
                      aria-describedby="reminders-help"
                    />
                    <div>
                      <Label
                        htmlFor="reminders-enabled"
                        className="flex min-h-11 cursor-pointer items-start pt-0.5 text-base leading-relaxed"
                      >
                        Prepara promemoria email
                      </Label>
                      <p
                        id="reminders-help"
                        className="mt-1 text-sm leading-relaxed text-muted-foreground"
                      >
                        Vale per appuntamenti creati o riprogrammati dopo il
                        salvataggio, con email della cliente e più di 24 ore di
                        anticipo. Gli appuntamenti già presenti non vengono
                        aggiunti automaticamente.
                      </p>
                    </div>
                  </div>
                  <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
                    Disattivando la preferenza fermi i nuovi invii. Un’email già
                    partita non può essere richiamata.
                  </p>
                  {!settings.data.reply_to_verified && (
                    <p role="alert" className="mt-4 text-sm text-destructive">
                      Conferma l’email del tuo account prima di attivare i
                      promemoria.
                    </p>
                  )}
                  <Button
                    type="submit"
                    className="mt-5"
                    disabled={
                      !online ||
                      update.isPending ||
                      enabled === settings.data.enabled ||
                      (enabled && !settings.data.reply_to_verified)
                    }
                  >
                    {update.isPending ? "Salvataggio…" : "Salva preferenza"}
                  </Button>
                  {saved && (
                    <p role="status" className="mt-3 text-sm">
                      Preferenza salvata.{" "}
                      {settings.data.enabled
                        ? "Promemoria abilitati per lo studio."
                        : "Promemoria disattivati per lo studio."}
                    </p>
                  )}
                  {update.error && (
                    <p role="alert" className="mt-3 text-sm text-destructive">
                      {update.error.message}
                    </p>
                  )}
                </form>
                <div className="min-w-0 border-t pt-6 lg:border-l lg:border-t-0 lg:pl-7 lg:pt-0">
                  <dl className="space-y-5 text-sm">
                    <div>
                      <dt className="text-muted-foreground">Mittente</dt>
                      <dd className="mt-1 break-words font-medium">
                        {settings.data.from}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">
                        Le risposte delle clienti arrivano a
                      </dt>
                      <dd className="mt-1 break-all font-medium">
                        {settings.data.reply_to ??
                          "Email dell’account da confermare"}
                      </dd>
                    </div>
                  </dl>
                  <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
                    Usiamo l’indirizzo confermato della titolare. L’email
                    contiene studio, data e ora dell’appuntamento, senza nome
                    della cliente, servizio o dati del trattamento.
                  </p>
                </div>
              </div>
            </>
          )
        )}
      </section>
      <ResponsePolicy />
      <section className="mt-10" aria-labelledby="reminder-history-heading">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="reminder-history-heading" className="text-2xl">
            Esiti dei promemoria
          </h2>
          <Button
            variant="outline"
            disabled={!online || messages.isFetching || health.isFetching}
            onClick={refresh}
          >
            <RefreshCw className={messages.isFetching ? "animate-spin" : ""} />
            Aggiorna esiti
          </Button>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          Orario previsto di invio nel fuso {tenant.timezone}. Fino a 25
          promemoria per pagina.
        </p>
        {health.data && (
          <p className="mt-4 text-sm" role="status">
            {health.data.counts.uncertain} con esito da verificare ·{" "}
            {health.data.counts.failed} non riusciti
            {health.data.status === "degraded" &&
              ". Il servizio richiede una verifica dell’assistenza."}
          </p>
        )}
        {health.error && (
          <p role="alert" className="mt-4 text-sm text-destructive">
            Il riepilogo non è aggiornato. Usa “Aggiorna esiti” per riprovare.
          </p>
        )}
        <div
          className="my-5 flex flex-wrap gap-2"
          role="group"
          aria-label="Filtra promemoria"
        >
          <Button
            variant={filter === "all" ? "secondary" : "ghost"}
            aria-pressed={filter === "all"}
            onClick={() => changeFilter("all")}
          >
            Tutti
          </Button>
          <Button
            variant={filter === "attention" ? "secondary" : "ghost"}
            aria-pressed={filter === "attention"}
            onClick={() => changeFilter("attention")}
          >
            Da verificare
          </Button>
        </div>
        {messages.isPending ? (
          <Pending label="Caricamento degli esiti…" />
        ) : messages.error ? (
          <ErrorState
            error={messages.error}
            retry={() => void messages.refetch()}
          />
        ) : !messages.data?.items.length ? (
          <div className="rounded-xl border bg-white px-5 py-8 sm:px-7">
            <h3 className="text-lg">
              {filter === "attention"
                ? "Nessun esito da verificare"
                : "Qui troverai i promemoria del tuo studio"}
            </h3>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              {filter === "attention"
                ? "Non risultano promemoria in elaborazione, con esito incerto o invio non riuscito. Puoi consultare gli altri esiti in “Tutti”."
                : "Dopo aver abilitato la preferenza, crea o riprogramma un appuntamento con più di 24 ore di anticipo e una cliente con email. L’invio richiede anche il servizio attivo."}
            </p>
          </div>
        ) : (
          <ul className="divide-y rounded-xl border bg-white px-5 sm:px-7">
            {messages.data.items.map((message) => {
              const state = messageStatus(message);
              return (
                <li key={message.id} className="py-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      {message.client ? (
                        <Button
                          variant="link"
                          className="h-auto min-h-11 max-w-full whitespace-normal break-words px-0 text-left text-base text-foreground underline"
                          onClick={() => setSelectedClient(message.client!.id)}
                        >
                          {message.client.first_name} {message.client.last_name}
                        </Button>
                      ) : (
                        <p className="font-medium">Cliente non disponibile</p>
                      )}
                      <p className="mt-1 text-sm tabular-nums text-muted-foreground">
                        Invio previsto: {date(message.scheduled_for)}
                      </p>
                    </div>
                    <Badge
                      variant="outline"
                      className={state.attention ? "text-destructive" : ""}
                    >
                      {state.label}
                    </Badge>
                  </div>
                  <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                    {state.description}
                  </p>
                  <p className="mt-2 text-xs tabular-nums text-muted-foreground">
                    Ultimo aggiornamento: {date(message.updated_at)}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
        <div className="mt-5 flex flex-wrap gap-3">
          <Button
            variant="outline"
            disabled={cursors.length === 1 || messages.isFetching || !online}
            onClick={() => setCursors((value) => value.slice(0, -1))}
          >
            Più recenti
          </Button>
          <Button
            variant="outline"
            disabled={
              !messages.data?.next_cursor || messages.isFetching || !online
            }
            onClick={() => {
              const next = messages.data?.next_cursor;
              if (next) setCursors((value) => [...value, next]);
            }}
          >
            Meno recenti
          </Button>
        </div>
      </section>
      {selectedClient && (
        <ClientDetails
          id={selectedClient}
          onClose={() => setSelectedClient(null)}
        />
      )}
    </div>
  );
}
