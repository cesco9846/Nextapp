"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Download, RefreshCw, ShieldCheck } from "lucide-react";
import type { Database } from "@/lib/database.types";
import { api } from "@/lib/api";
import { useOnline } from "@/lib/connectivity";
import {
  privacyCategories,
  privacyRequestStates,
  privacySettingsInput,
  type PrivacySettingsInput,
} from "@/lib/privacy";
import { useWorkspace } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { FormSelect } from "@/components/form-select";
import { ErrorState, LoadingState } from "@/components/states";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

type Tables = Database["public"]["Tables"];
type PrivacyRequest = Tables["privacy_requests"]["Row"];
type PrivacyExport = Tables["privacy_exports"]["Row"];
type Settings = Tables["privacy_settings"]["Row"];
type Client = Pick<Tables["clients"]["Row"], "id" | "first_name" | "last_name">;
type Overview = {
  settings: Settings | null;
  requests: PrivacyRequest[];
  exports: PrivacyExport[];
  clients: Client[];
  moreRequests: boolean;
  moreExports: boolean;
};
const date = (value: string) =>
  new Intl.DateTimeFormat("it-IT", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "Operazione non riuscita. Riprova.";

export function PrivacySettings() {
  const [open, setOpen] = useState(false);
  const [requestsPage, setRequestsPage] = useState(1);
  const [exportsPage, setExportsPage] = useState(1);
  const query = useQuery({
    queryKey: ["privacy", requestsPage, exportsPage],
    queryFn: () =>
      api<Overview>(
        `/api/privacy?requestsPage=${requestsPage}&exportsPage=${exportsPage}`,
      ),
    enabled: open,
  });
  const online = useOnline();
  const cache = useQueryClient();
  const refresh = () => cache.invalidateQueries({ queryKey: ["privacy"] });
  const clientName = (id: string | null) => {
    if (!id) return "Cliente eliminata";
    const client = query.data?.clients.find((c) => c.id === id);
    return client
      ? `${client.first_name} ${client.last_name}`
      : `Cliente ${id.slice(0, 8)}`;
  };
  return (
    <section className="mt-8 border-t pt-7" id="privacy">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-3 text-xl">
            <ShieldCheck className="size-5 text-primary" />
            Dati e privacy
          </h2>
          <p className="mt-2 max-w-prose text-sm text-muted-foreground">
            Esporta il dossier di una cliente, registra una richiesta e
            definisci quando rivedere i dati conservati.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          aria-controls="privacy-content"
        >
          {open ? "Chiudi gestione privacy" : "Gestisci dati e privacy"}
        </Button>
      </div>
      {open && (
        <div id="privacy-content" className="mt-6">
          {query.isPending ? (
            <LoadingState label="Caricamento gestione privacy…" />
          ) : query.isError ? (
            <ErrorState error={query.error} retry={() => query.refetch()} />
          ) : (
            query.data && (
              <>
                <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
                  <p className="max-w-prose text-sm text-muted-foreground">
                    Riservato alla titolare. Nessuna azione qui elimina
                    automaticamente il dossier o invia comunicazioni alla
                    cliente.
                  </p>
                  <Button
                    variant="ghost"
                    disabled={!online || query.isFetching}
                    onClick={() => query.refetch()}
                  >
                    <RefreshCw className="size-4" />
                    Aggiorna stato privacy
                  </Button>
                </div>
                <ClientPrivacyActions onSaved={refresh} />
                <section
                  className="mt-8"
                  aria-labelledby="privacy-exports-title"
                >
                  <h3 id="privacy-exports-title" className="text-lg">
                    Copie da scaricare
                  </h3>
                  <p className="mt-2 text-sm text-muted-foreground">
                    ZIP privati disponibili per 24 ore. Le copie scadute o
                    revocate vengono rimosse automaticamente; i download già
                    effettuati restano sul dispositivo.
                  </p>
                  {!query.data.exports.length ? (
                    <p className="py-6 text-sm text-muted-foreground">
                      Non hai ancora preparato un export. Seleziona una cliente
                      per creare la prima copia.
                    </p>
                  ) : (
                    <div className="mt-4 divide-y border-y">
                      {query.data.exports.map((item) => (
                        <ExportRow
                          key={item.id}
                          item={item}
                          name={clientName(item.client_id)}
                          onSaved={refresh}
                        />
                      ))}
                    </div>
                  )}
                  <Pagination
                    label="export"
                    page={exportsPage}
                    more={query.data.moreExports}
                    onChange={setExportsPage}
                  />
                </section>
                <section
                  className="mt-8"
                  aria-labelledby="privacy-requests-title"
                >
                  <h3 id="privacy-requests-title" className="text-lg">
                    Richieste di cancellazione
                  </h3>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Verifica l’identità e gli obblighi di conservazione prima di
                    rispondere. La data di riesame è un promemoria operativo;
                    una richiesta registrata non equivale a dati cancellati.
                  </p>
                  {!query.data.requests.length ? (
                    <p className="py-6 text-sm text-muted-foreground">
                      Nessuna richiesta registrata. Usa il comando sopra quando
                      ricevi una richiesta dalla cliente.
                    </p>
                  ) : (
                    <div className="mt-4 divide-y border-y">
                      {query.data.requests.map((item) => (
                        <RequestRow
                          key={`${item.id}-${item.version}`}
                          item={item}
                          name={clientName(item.client_id)}
                          onSaved={refresh}
                        />
                      ))}
                    </div>
                  )}
                  <Pagination
                    label="richieste"
                    page={requestsPage}
                    more={query.data.moreRequests}
                    onChange={setRequestsPage}
                  />
                </section>
                <RetentionForm
                  key={query.data.settings?.version ?? 0}
                  current={query.data.settings}
                  onSaved={refresh}
                />
              </>
            )
          )}
        </div>
      )}
    </section>
  );
}

function ClientPrivacyActions({
  onSaved,
}: {
  onSaved: () => Promise<unknown>;
}) {
  const { profile } = useWorkspace();
  const online = useOnline();
  const [search, setSearch] = useState("");
  const [archived, setArchived] = useState(false);
  const [selected, setSelected] = useState<Client | null>(null);
  const exportKey = useRef({ client: "", id: "" });
  const requestKey = useRef({ client: "", id: "" });
  const clients = useQuery({
    queryKey: ["privacy-clients", search, archived],
    queryFn: () =>
      api<{ clients: Client[]; total: number }>(
        `/api/clients?q=${encodeURIComponent(search)}&archived=${archived}`,
      ),
    enabled: search.trim().length >= 2,
  });
  const create = useMutation({
    mutationFn: async (kind: "exports" | "requests") => {
      if (!selected) throw new Error("Seleziona una cliente.");
      const key = kind === "exports" ? exportKey : requestKey;
      if (key.current.client !== selected.id)
        key.current = { client: selected.id, id: crypto.randomUUID() };
      return api(`/api/privacy/${kind}`, {
        method: "POST",
        body: JSON.stringify({ id: key.current.id, client_id: selected.id }),
      });
    },
    onSuccess: async (_data, kind) => {
      if (kind === "exports") exportKey.current = { client: "", id: "" };
      else requestKey.current = { client: "", id: "" };
      toast.success(
        kind === "exports"
          ? "Export pronto. Scaricalo dall’elenco delle copie."
          : "Richiesta registrata. Il dossier resta conservato.",
      );
      await onSaved();
    },
    onError: async () => {
      await onSaved();
    },
  });
  return (
    <div className="rounded-xl border bg-white p-5 sm:p-6">
      <h3 className="text-lg">Scegli la cliente</h3>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="privacy-search">Cerca per nome o cognome</Label>
          <Input
            id="privacy-search"
            value={search}
            maxLength={100}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Almeno due caratteri"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="privacy-client">Cliente per questa operazione</Label>
          <FormSelect
            id="privacy-client"
            value={selected?.id ?? ""}
            onChange={(id) =>
              setSelected(
                clients.data?.clients.find((c) => c.id === id) ?? null,
              )
            }
            options={[
              ...(clients.data?.clients ?? []),
              ...(selected &&
              !clients.data?.clients.some((c) => c.id === selected.id)
                ? [selected]
                : []),
            ].map((c) => ({
              value: c.id,
              label: `${c.first_name} ${c.last_name} · ${c.id.slice(0, 8)}`,
            }))}
            placeholder="Seleziona una cliente"
          />
        </div>
      </div>
      <label className="mt-3 flex min-h-11 items-center gap-3 text-sm">
        <Checkbox
          checked={archived}
          onCheckedChange={(v) => setArchived(v === true)}
        />
        Cerca tra le clienti archiviate
      </label>
      {clients.isFetching && (
        <p role="status" className="mt-2 text-sm text-muted-foreground">
          Ricerca in corso…
        </p>
      )}
      {clients.isError && (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {clients.error.message}
        </p>
      )}
      {search.trim().length >= 2 && clients.data?.total === 0 && (
        <p className="mt-2 text-sm text-muted-foreground">
          Nessuna cliente corrispondente. Controlla il nome o cerca tra le
          archiviate.
        </p>
      )}
      {(clients.data?.total ?? 0) > 50 && (
        <p className="mt-2 text-sm text-muted-foreground">
          Sono mostrati i primi 50 risultati. Aggiungi lettere per trovare la
          cliente.
        </p>
      )}
      {selected && (
        <p className="mt-3 break-words text-sm">
          Selezionata:{" "}
          <strong>
            {selected.first_name} {selected.last_name}
          </strong>{" "}
          · {selected.id.slice(0, 8)}
        </p>
      )}
      <p className="mt-4 max-w-prose text-sm text-muted-foreground">
        L’export include dati clinici e allegati. Prima di consegnarlo verifica
        l’identità della destinataria. Il file scaricato contiene dati riservati
        e non è cifrato.
      </p>
      <div className="mt-5 flex flex-wrap gap-3">
        <Button
          disabled={
            !online || !selected || !profile.clinical_access || create.isPending
          }
          onClick={() => create.mutate("exports")}
        >
          <Download className="size-4" />
          {create.isPending && create.variables === "exports"
            ? "Preparazione export…"
            : "Prepara export cliente"}
        </Button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="outline"
              disabled={!online || !selected || create.isPending}
            >
              Registra richiesta di cancellazione
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                Registrare la richiesta di {selected?.first_name}{" "}
                {selected?.last_name}?
              </AlertDialogTitle>
              <AlertDialogDescription>
                Il dossier rimane conservato. La richiesta va verificata e
                valutata separatamente dall’archiviazione della cliente. Nessuna
                email verrà inviata.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Annulla</AlertDialogCancel>
              <AlertDialogAction onClick={() => create.mutate("requests")}>
                Registra richiesta
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
      {!profile.clinical_access && (
        <p className="mt-3 text-sm text-muted-foreground">
          Per l’export completo serve l’abilitazione clinica.
        </p>
      )}
      {create.error && (
        <p role="alert" className="mt-4 text-sm text-destructive">
          {create.error.message}
        </p>
      )}
    </div>
  );
}

function ExportRow({
  item,
  name,
  onSaved,
}: {
  item: PrivacyExport;
  name: string;
  onSaved: () => Promise<unknown>;
}) {
  const online = useOnline();
  const { profile } = useWorkspace();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(timer);
  }, []);
  const expired = new Date(item.expires_at).getTime() <= now;
  const busy = item.state === "building";
  const action = useMutation({
    mutationFn: async (kind: "retry" | "revoke" | "download") => {
      if (kind === "download") {
        const response = await fetch(`/api/privacy/exports/${item.id}`, {
          cache: "no-store",
        });
        if (!response.ok) {
          const problem = await response.json();
          throw new Error(
            problem.error ??
              "Download non riuscito. Aggiorna lo stato e riprova.",
          );
        }
        const blob = await response.blob();
        if (!navigator.onLine)
          throw new Error("Connessione interrotta. Riprova il download.");
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `glow-export-${item.id}.zip`;
        document.body.append(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 10000);
      } else if (kind === "retry")
        await api("/api/privacy/exports", {
          method: "POST",
          body: JSON.stringify({ id: item.id, client_id: item.client_id }),
        });
      else await api(`/api/privacy/exports/${item.id}`, { method: "DELETE" });
    },
    onSuccess: async (_data, kind) => {
      if (kind !== "download")
        toast.success(
          kind === "revoke"
            ? "Download revocato. La copia verrà rimossa."
            : "Export pronto.",
        );
      await onSaved();
    },
  });
  return (
    <div className="py-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="break-words font-medium">{name}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Creato {date(item.created_at)} · Disponibile fino al{" "}
            {date(item.expires_at)}
          </p>
          <Badge variant="secondary" className="mt-2">
            {item.state === "revoked"
              ? "Revocato"
              : expired
                ? "Scaduto"
                : item.state === "ready"
                  ? "Pronto"
                  : busy
                    ? "In preparazione"
                    : "Da riprovare"}
          </Badge>
        </div>
        <div className="flex flex-wrap gap-2">
          {item.state === "ready" && !expired && (
            <Button
              variant="outline"
              disabled={!online || action.isPending || !profile.clinical_access}
              onClick={() => action.mutate("download")}
            >
              Scarica ZIP
            </Button>
          )}
          {(item.state === "failed" || busy) && !expired && (
            <Button
              variant="outline"
              disabled={!online || action.isPending || !profile.clinical_access}
              onClick={() => action.mutate("retry")}
            >
              {action.isPending ? "Preparazione…" : "Riprova export"}
            </Button>
          )}
          {item.state !== "revoked" && !expired && (
            <Button
              variant="ghost"
              disabled={!online || action.isPending || !profile.clinical_access}
              onClick={() => action.mutate("revoke")}
            >
              Revoca download
            </Button>
          )}
        </div>
      </div>
      {busy && (
        <p className="mt-2 text-sm text-muted-foreground">
          Se la preparazione si è interrotta, aggiorna lo stato. Dopo due minuti
          puoi riprovare la stessa richiesta.
        </p>
      )}
      {item.failure_code && (
        <p className="mt-2 text-sm text-muted-foreground">
          {item.failure_code === "limit_exceeded"
            ? "Dossier oltre i limiti: serve un’esportazione assistita."
            : item.failure_code === "integrity_failed"
              ? "Verifica degli allegati non riuscita. Il dossier originale è conservato."
              : "Preparazione interrotta o archivio temporaneamente indisponibile."}
        </p>
      )}
      {action.error && (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {errorMessage(action.error)}
        </p>
      )}
    </div>
  );
}

function RequestRow({
  item,
  name,
  onSaved,
}: {
  item: PrivacyRequest;
  name: string;
  onSaved: () => Promise<unknown>;
}) {
  const online = useOnline();
  const [verified, setVerified] = useState(item.identity_verified);
  const [state, setState] = useState("reviewing");
  const [note, setNote] = useState("");
  const open = ["received", "reviewing"].includes(item.state);
  const save = useMutation({
    mutationFn: () =>
      api(`/api/privacy/requests/${item.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          version: item.version,
          state,
          identity_verified: verified,
          note: state === "retained" ? note : null,
        }),
      }),
    onSuccess: async () => {
      toast.success(
        "Stato della richiesta aggiornato. Nessun dato cancellato.",
      );
      await onSaved();
    },
  });
  return (
    <div className="py-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="font-medium">{name}</p>
        <Badge variant="secondary">
          {
            privacyRequestStates[
              item.state as keyof typeof privacyRequestStates
            ]
          }
        </Badge>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">
        Ricevuta {date(item.received_at)} · Riesame entro{" "}
        {date(item.review_due_at)}
      </p>
      {open ? (
        <form
          className="mt-4 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <label className="flex min-h-11 items-center gap-3 text-sm">
            <Checkbox
              checked={verified}
              disabled={item.identity_verified || save.isPending}
              onCheckedChange={(v) => setVerified(v === true)}
            />
            Ho verificato l’identità della richiedente
          </label>
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-full space-y-2 sm:max-w-sm">
              <Label htmlFor={`request-state-${item.id}`}>
                Esito della valutazione
              </Label>
              <FormSelect
                id={`request-state-${item.id}`}
                value={state}
                onChange={setState}
                options={[
                  { value: "reviewing", label: "Mantieni in verifica" },
                  {
                    value: "retained",
                    label: "Conserva: obblighi da rispettare",
                  },
                  { value: "rejected", label: "Identità non verificata" },
                  {
                    value: "withdrawn",
                    label: "Richiesta ritirata dalla cliente",
                  },
                ]}
              />
            </div>
            <Button
              variant="outline"
              type="submit"
              disabled={
                !online ||
                save.isPending ||
                (state === "retained" && !verified) ||
                (state === "rejected" && verified)
              }
            >
              {save.isPending ? "Salvataggio…" : "Aggiorna richiesta"}
            </Button>
          </div>
          {state === "retained" && (
            <div className="space-y-2">
              <Label htmlFor={`request-note-${item.id}`}>
                Motivo e riferimenti della conservazione
              </Label>
              <Textarea
                id={`request-note-${item.id}`}
                required
                minLength={10}
                maxLength={1000}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
              <p className="text-sm text-muted-foreground">
                Indica obblighi e tempi da comunicare alla cliente, senza
                dettagli sanitari.
              </p>
            </div>
          )}
          <p className="text-sm text-muted-foreground">
            La cancellazione definitiva richiede una procedura approvata
            separata. Se la richiesta è fondata, mantienila in verifica fino al
            completamento di quella procedura.
          </p>
        </form>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">
          {item.state === "retained"
            ? "Dossier conservato per obblighi da verificare con il consulente. Comunica alla cliente motivi e tempi applicabili."
            : item.state === "withdrawn"
              ? "Richiesta ritirata; dossier conservato."
              : "Richiesta non accolta perché l’identità non è stata verificata; dossier conservato."}
        </p>
      )}
      {item.resolution_note && (
        <p className="mt-3 whitespace-pre-wrap break-words text-sm">
          {item.resolution_note}
        </p>
      )}
      {save.error && (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {save.error.message}
        </p>
      )}
    </div>
  );
}

function RetentionForm({
  current,
  onSaved,
}: {
  current: Settings | null;
  onSaved: () => Promise<unknown>;
}) {
  const { tenant } = useWorkspace();
  const online = useOnline();
  const [value, setValue] = useState<PrivacySettingsInput>(() =>
    current
      ? privacySettingsInput.parse({
          version: current.version,
          rules: current.rules,
          notice: current.notice,
          contact_email: current.contact_email,
          reviewed: current.reviewed,
        })
      : {
          version: 0,
          rules: {
            contacts: { months: null, basis: "" },
            clinical: { months: null, basis: "" },
            audit: { months: null, basis: "" },
          },
          notice: "",
          contact_email: "",
          reviewed: false,
        },
  );
  const [validation, setValidation] = useState("");
  const save = useMutation({
    mutationFn: () =>
      api("/api/privacy/settings", {
        method: "PUT",
        body: JSON.stringify(value),
      }),
    onSuccess: async () => {
      toast.success("Regole di conservazione salvate.");
      await onSaved();
    },
  });
  return (
    <section className="mt-10 border-t pt-7" aria-labelledby="retention-title">
      <h3 id="retention-title" className="text-lg">
        Conservazione e informativa
      </h3>
      <p className="mt-2 max-w-prose text-sm text-muted-foreground">
        Definisci con il consulente i tempi e le basi applicabili al tuo studio.
        I mesi indicano quando rivedere i dati dall’ultima attività; non avviano
        cancellazioni automatiche.
      </p>
      <Badge variant="secondary" className="mt-3">
        {current?.reviewed
          ? `Revisione registrata · versione ${current.version}`
          : "Da definire e rivedere prima del pilota"}
      </Badge>
      {current?.reviewed && (
        <p className="mt-4 text-sm">
          <a
            className="inline-flex min-h-11 items-center underline underline-offset-4"
            href={`/informativa/${tenant.id}`}
            target="_blank"
            rel="noreferrer"
          >
            Apri l’informativa pubblicata dello studio
          </a>
          <span className="mt-1 block text-muted-foreground">
            Puoi condividere questo collegamento con le clienti. Non contiene
            accessi al dossier.
          </span>
        </p>
      )}
      <form
        className="mt-6 space-y-6"
        onSubmit={(e) => {
          e.preventDefault();
          const result = privacySettingsInput.safeParse(value);
          if (!result.success) {
            setValidation(
              "Controlla indirizzo email e tempi: da 1 a 600 mesi oppure lascia vuoto.",
            );
            return;
          }
          setValidation("");
          save.mutate();
        }}
      >
        {Object.entries(privacyCategories).map(([key, title]) => {
          const category = key as keyof typeof privacyCategories;
          return (
            <fieldset
              key={key}
              className="grid gap-4 border-b pb-6 sm:grid-cols-[150px_1fr]"
            >
              <legend className="mb-3 text-sm font-semibold">{title}</legend>
              <div className="space-y-2">
                <Label htmlFor={`retention-${key}`}>Rivedi dopo (mesi)</Label>
                <Input
                  id={`retention-${key}`}
                  type="number"
                  min={1}
                  max={600}
                  step={1}
                  value={value.rules[category].months ?? ""}
                  onChange={(e) =>
                    setValue({
                      ...value,
                      reviewed: false,
                      rules: {
                        ...value.rules,
                        [category]: {
                          ...value.rules[category],
                          months:
                            e.target.value === ""
                              ? null
                              : Number(e.target.value),
                        },
                      },
                    })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor={`basis-${key}`}>
                  Base e motivazione della conservazione
                </Label>
                <Textarea
                  id={`basis-${key}`}
                  maxLength={1000}
                  rows={2}
                  value={value.rules[category].basis}
                  onChange={(e) =>
                    setValue({
                      ...value,
                      reviewed: false,
                      rules: {
                        ...value.rules,
                        [category]: {
                          ...value.rules[category],
                          basis: e.target.value,
                        },
                      },
                    })
                  }
                />
              </div>
            </fieldset>
          );
        })}
        <div className="space-y-2">
          <Label htmlFor="privacy-email">Contatto privacy dello studio</Label>
          <Input
            id="privacy-email"
            type="email"
            maxLength={254}
            value={value.contact_email}
            onChange={(e) =>
              setValue({
                ...value,
                contact_email: e.target.value,
                reviewed: false,
              })
            }
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="privacy-notice">Informativa dello studio</Label>
          <Textarea
            id="privacy-notice"
            rows={7}
            maxLength={12000}
            value={value.notice}
            onChange={(e) =>
              setValue({ ...value, notice: e.target.value, reviewed: false })
            }
          />
          <p className="text-sm text-muted-foreground">
            Inserisci il testo approvato per il tuo studio. Salvare qui non
            dimostra che sia stato consegnato o accettato dalle clienti.
          </p>
        </div>
        <label className="flex min-h-11 items-start gap-3 text-sm">
          <Checkbox
            className="mt-1"
            checked={value.reviewed}
            onCheckedChange={(v) =>
              setValue({ ...value, reviewed: v === true })
            }
          />
          <span>
            Ho rivisto tempi, basi e informativa con il consulente competente e
            rendo l’informativa disponibile tramite il collegamento pubblico
            dello studio. Questa registrazione non è una certificazione di
            conformità.
          </span>
        </label>
        {(validation || save.error) && (
          <p role="alert" className="text-sm text-destructive">
            {validation || save.error?.message}
          </p>
        )}
        <Button type="submit" disabled={!online || save.isPending}>
          {save.isPending ? "Salvataggio…" : "Salva regole e informativa"}
        </Button>
      </form>
    </section>
  );
}

function Pagination({
  label,
  page,
  more,
  onChange,
}: {
  label: string;
  page: number;
  more: boolean;
  onChange: (value: number) => void;
}) {
  if (page === 1 && !more) return null;
  return (
    <nav
      aria-label={`Pagine ${label}`}
      className="mt-4 flex flex-wrap items-center justify-between gap-3"
    >
      <Button
        variant="outline"
        disabled={page === 1}
        onClick={() => onChange(page - 1)}
      >
        Precedenti {label}
      </Button>
      <span className="text-sm text-muted-foreground">Pagina {page}</span>
      <Button
        variant="outline"
        disabled={!more}
        onClick={() => onChange(page + 1)}
      >
        Altri {label}
      </Button>
    </nav>
  );
}
