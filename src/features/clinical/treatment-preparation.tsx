"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { Temporal } from "temporal-polyfill";
import { toast } from "sonner";
import { api } from "@/lib/api";
import {
  preparationSaveSchema,
  type PreparationContext,
  type TemplateVersion,
  type ClinicalTemplate,
  type CatalogPage,
  type LotListEntry,
} from "@/lib/clinical";
import { formatDate, formatTime } from "@/lib/dates";
import { useWorkspace } from "@/components/app-shell";
import { ErrorState, LoadingState } from "@/components/states";
import { FormSelect } from "@/components/form-select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { LabelPreview } from "./label-preview";
import { useRequestKey } from "./use-request-key";

// Sensitive answers stay only in this mounted view, never in a query cache or
// browser persistence. Every opening/refetch goes through the audited RPC.
export function TreatmentPreparation({ id }: { id: string }) {
  const [revision, setRevision] = useState(0);
  return (
    <PreparationLoader
      key={`${id}:${revision}`}
      id={id}
      reload={() => setRevision((value) => value + 1)}
    />
  );
}
function PreparationLoader({ id, reload }: { id: string; reload: () => void }) {
  const [data, setData] = useState<PreparationContext | null>(null);
  const [error, setError] = useState<Error | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    void api<PreparationContext>(`/api/appointments/${id}/preparation/read`, {
      method: "POST",
      body: "{}",
      signal: controller.signal,
    })
      .then((result) => {
        if (!controller.signal.aborted) setData(result);
      })
      .catch((e) => {
        if (!controller.signal.aborted)
          setError(
            e instanceof Error ? e : new Error("Preparazione non disponibile."),
          );
      });
    return () => controller.abort();
  }, [id]);
  if (error) return <ErrorState error={error} retry={reload} />;
  if (!data) return <LoadingState />;
  return <PreparationForm context={data} onSaved={reload} />;
}
function PreparationForm({
  context: c,
  onSaved,
}: {
  context: PreparationContext;
  onSaved: () => void;
}) {
  const { tenant } = useWorkspace();
  const withKey = useRequestKey();
  const [consentId, setConsentId] = useState(c.consent?.id ?? "");
  const [anamId, setAnamId] = useState(c.anamnesis?.id ?? "none");
  const [answers, setAnswers] = useState(c.answers);
  const drafts = useRef(new Map<string, Record<string, boolean | string>>());
  const [lotIds, setLotIds] = useState(c.lots.map((l) => l.lot_id));
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [templateSearch, setTemplateSearch] = useState("");
  const [templatePage, setTemplatePage] = useState(1);
  const [validation, setValidation] = useState("");
  const [showText, setShowText] = useState(false);
  const templates = useQuery({
    queryKey: [
      "clinical",
      "preparation-templates",
      c.appointment.service_id,
      templateSearch,
      templatePage,
    ],
    queryFn: () =>
      api<CatalogPage<ClinicalTemplate>>(
        `/api/clinical/templates?active=true&service_id=${c.appointment.service_id}&page=${templatePage}&q=${encodeURIComponent(templateSearch)}`,
      ),
  });
  const consent = useQuery({
    queryKey: ["clinical-version", consentId],
    queryFn: () => api<TemplateVersion>(`/api/clinical/versions/${consentId}`),
    enabled: !!consentId,
    initialData: c.consent?.id === consentId ? c.consent : undefined,
    staleTime: Infinity,
  });
  const anam = useQuery({
    queryKey: ["clinical-version", anamId],
    queryFn: () => api<TemplateVersion>(`/api/clinical/versions/${anamId}`),
    enabled: anamId !== "none",
    initialData: c.anamnesis?.id === anamId ? c.anamnesis : undefined,
    staleTime: Infinity,
  });
  const lots = useQuery({
    queryKey: ["clinical", "preparation-lots", search, page],
    queryFn: () =>
      api<CatalogPage<LotListEntry>>(
        `/api/clinical/lots?page=${page}&q=${encodeURIComponent(search)}`,
      ),
  });
  const today = Temporal.Now.plainDateISO(tenant.timezone).toString();
  const day = Temporal.Instant.from(c.appointment.starts_at)
    .toZonedDateTimeISO(tenant.timezone)
    .toPlainDate()
    .toString();
  const minDate = today > day ? today : day;
  const mutation = useMutation({
    mutationFn: (payload: ReturnType<typeof preparationSaveSchema.parse>) =>
      api(`/api/appointments/${c.appointment.id}/preparation`, {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      toast.success("Preparazione salvata in bozza");
      onSaved();
    },
  });
  const choices = (kind: string, selected: TemplateVersion | null) => {
    const map = new Map<string, string>();
    if (selected)
      map.set(
        selected.id,
        `${selected.title} · v${selected.revision} già scelta`,
      );
    for (const t of templates.data?.items ?? [])
      if (t.kind === kind)
        map.set(t.current_version_id, `${t.title} · v${t.current_revision}`);
    return [...map].map(([value, label]) => ({ value, label }));
  };
  const editable = ["booked", "confirmed"].includes(c.appointment.status);
  function submit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = preparationSaveSchema.safeParse(
      withKey({
        appointment_version: c.appointment.version,
        version: c.preparation?.version ?? 0,
        consent_version_id: consentId,
        anamnesis_version_id: anamId === "none" ? null : anamId,
        answers: anamId === "none" ? {} : answers,
        lot_ids: lotIds,
      }),
    );
    if (!parsed.success) {
      setValidation(
        "Scegli un modello di consenso e controlla i dati della preparazione.",
      );
      return;
    }
    setValidation("");
    mutation.mutate(parsed.data);
  }
  return (
    <div className="page-container max-w-6xl">
      <Button variant="ghost" asChild className="mb-5 -ml-3">
        <Link href="/app/agenda">
          <ArrowLeft />
          Agenda
        </Link>
      </Button>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[32px]">Prepara il trattamento</h1>
          <p className="mt-2 text-base">
            {c.client.first_name} {c.client.last_name} ·{" "}
            {c.appointment.service_name}
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            {formatDate(c.appointment.starts_at, tenant.timezone)} alle{" "}
            {formatTime(c.appointment.starts_at, tenant.timezone)}
          </p>
        </div>
        <Badge variant="secondary">Preparazione in bozza</Badge>
      </div>
      <p className="mt-6 rounded-lg bg-secondary px-4 py-3 text-sm text-secondary-foreground">
        Questa preparazione non è un consenso firmato. Puoi salvare risposte
        ancora da completare.
      </p>
      {c.preparation &&
        c.preparation.appointment_version !== c.appointment.version && (
          <p role="status" className="mt-4 text-sm text-muted-foreground">
            L’appuntamento è cambiato dall’ultimo salvataggio. Ricontrolla data,
            testi e scadenze dei lotti.
          </p>
        )}
      {!editable && (
        <p role="alert" className="mt-4 text-sm text-destructive">
          L’appuntamento è concluso o annullato: la preparazione è consultabile.
        </p>
      )}
      <form onSubmit={submit} className="mt-8 space-y-9">
        <fieldset
          disabled={!editable || mutation.isPending}
          className="space-y-9"
        >
          <section>
            <h2 className="text-xl">I testi scelti</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Le versioni già selezionate restano disponibili anche dopo una
              nuova pubblicazione.
            </p>
            <Input
              aria-label="Cerca modelli per la preparazione"
              placeholder="Cerca un modello…"
              value={templateSearch}
              onChange={(e) => {
                setTemplateSearch(e.target.value);
                setTemplatePage(1);
              }}
              className="mt-4 max-w-sm bg-white"
            />
            <div className="mt-5 grid gap-5 sm:grid-cols-2">
              <div className="field">
                <Label htmlFor="preparation-consent">Modello di consenso</Label>
                <FormSelect
                  id="preparation-consent"
                  placeholder="Scegli il consenso"
                  value={consentId}
                  onChange={setConsentId}
                  options={choices("consent", c.consent)}
                />
              </div>
              <div className="field">
                <Label htmlFor="preparation-anamnesis">
                  Questionario di anamnesi
                </Label>
                <FormSelect
                  id="preparation-anamnesis"
                  value={anamId}
                  onChange={(value) => {
                    drafts.current.set(anamId, answers);
                    setAnamId(value);
                    setAnswers(drafts.current.get(value) ?? {});
                  }}
                  options={[
                    { value: "none", label: "Nessun questionario" },
                    ...choices("anamnesis", c.anamnesis),
                  ]}
                />
              </div>
            </div>
            {templates.error && (
              <p role="alert" className="mt-3 text-sm text-destructive">
                {templates.error.message}
              </p>
            )}
            <div className="mt-3 flex gap-2">
              <Button
                type="button"
                variant="ghost"
                disabled={templatePage === 1 || templates.isFetching}
                onClick={() => setTemplatePage((v) => v - 1)}
              >
                Modelli precedenti
              </Button>
              <Button
                type="button"
                variant="ghost"
                disabled={
                  templatePage * 50 >= (templates.data?.total ?? 0) ||
                  templates.isFetching
                }
                onClick={() => setTemplatePage((v) => v + 1)}
              >
                Altri modelli
              </Button>
            </div>
            {consent.data && (
              <div className="mt-3">
                <Button
                  type="button"
                  variant="outline"
                  aria-expanded={showText}
                  aria-controls="chosen-consent"
                  onClick={() => setShowText((v) => !v)}
                >
                  {showText ? "Chiudi testo" : "Leggi testo selezionato"}
                </Button>
                {showText && (
                  <div
                    id="chosen-consent"
                    className="mt-4 rounded-xl border bg-white p-5 sm:p-7"
                  >
                    <h3 className="text-lg">
                      {consent.data.title} · versione {consent.data.revision}
                    </h3>
                    <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed">
                      {consent.data.body}
                    </p>
                  </div>
                )}
              </div>
            )}
          </section>
          {anamId !== "none" && (
            <section className="border-t pt-7">
              <h2 className="text-xl">Anamnesi in preparazione</h2>
              {anam.isPending ? (
                <LoadingState />
              ) : anam.error ? (
                <p role="alert" className="mt-3 text-sm text-destructive">
                  {anam.error.message}
                </p>
              ) : (
                <>
                  <p className="mt-3 whitespace-pre-wrap text-sm text-muted-foreground">
                    {anam.data?.body}
                  </p>
                  <div className="mt-5 space-y-5">
                    {anam.data?.questions.map((q) => (
                      <div className="field" key={q.id}>
                        <Label htmlFor={`answer-${q.id}`}>
                          {q.label}
                          {q.required && (
                            <span className="font-normal text-muted-foreground">
                              {" "}
                              (richiesta alla firma)
                            </span>
                          )}
                        </Label>
                        {q.type === "text" ? (
                          <Textarea
                            id={`answer-${q.id}`}
                            rows={3}
                            maxLength={500}
                            value={
                              typeof answers[q.id] === "string"
                                ? (answers[q.id] as string)
                                : ""
                            }
                            onChange={(e) =>
                              setAnswers((prev) => ({
                                ...prev,
                                [q.id]: e.target.value,
                              }))
                            }
                            className="bg-white"
                          />
                        ) : (
                          <FormSelect
                            id={`answer-${q.id}`}
                            value={
                              answers[q.id] === true
                                ? "yes"
                                : answers[q.id] === false
                                  ? "no"
                                  : "unset"
                            }
                            onChange={(value) =>
                              setAnswers((prev) => {
                                const next = { ...prev };
                                if (value === "unset") delete next[q.id];
                                else next[q.id] = value === "yes";
                                return next;
                              })
                            }
                            options={[
                              { value: "unset", label: "Da compilare" },
                              { value: "yes", label: "Sì" },
                              { value: "no", label: "No" },
                            ]}
                          />
                        )}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </section>
          )}
          <section className="border-t pt-7">
            <h2 className="text-xl">I lotti del trattamento</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Solo lotti disponibili e validi sia oggi sia il giorno
              dell’appuntamento. Massimo dodici.
            </p>
            {c.lots
              .filter((l) => lotIds.includes(l.lot_id))
              .map((l) => (
                <div
                  key={l.lot_id}
                  className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-white p-5"
                >
                  <div>
                    <p className="font-medium">
                      {l.snapshot.name} · {l.snapshot.lot_number}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Informazioni già scelte · {l.snapshot.brand} ·{" "}
                      {l.snapshot.expires_on}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <LabelPreview id={l.snapshot.label_file_id} />
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() =>
                        setLotIds((ids) => ids.filter((id) => id !== l.lot_id))
                      }
                    >
                      Rimuovi lotto
                    </Button>
                  </div>
                </div>
              ))}
            <Input
              aria-label="Cerca lotto per la preparazione"
              placeholder="Cerca numero lotto…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="mt-5 max-w-sm bg-white"
            />
            {lots.isPending ? (
              <LoadingState />
            ) : lots.error ? (
              <p role="alert" className="mt-3 text-sm text-destructive">
                {lots.error.message}
              </p>
            ) : (
              <div className="mt-4 divide-y rounded-xl border bg-white">
                {lots.data?.items.map((l) => {
                  const selected = lotIds.includes(l.id);
                  const unavailable =
                    !l.active || !l.pigment.active || l.expires_on < minDate;
                  return (
                    <div
                      key={l.id}
                      className="flex flex-wrap items-center justify-between gap-3 p-5"
                    >
                      <label className="flex min-h-11 flex-1 items-center gap-3">
                        <Checkbox
                          aria-label={`Usa lotto ${l.lot_number}`}
                          checked={selected}
                          disabled={unavailable && !selected}
                          onCheckedChange={(v) =>
                            setLotIds((ids) =>
                              v === true
                                ? [...ids, l.id]
                                : ids.filter((id) => id !== l.id),
                            )
                          }
                        />
                        <span>
                          <span className="block text-sm font-medium">
                            {l.pigment.name} · {l.lot_number}
                          </span>
                          <span className="mt-1 block text-xs text-muted-foreground">
                            {l.pigment.brand} · scadenza {l.expires_on}
                            {unavailable ? " · Non utilizzabile" : ""}
                          </span>
                        </span>
                      </label>
                      <LabelPreview id={l.label_file_id} />
                    </div>
                  );
                })}
                {!lots.data?.items.length && (
                  <p className="p-5 text-sm text-muted-foreground">
                    Nessun lotto trovato. La titolare può registrarli in
                    Consensi e pigmenti.
                  </p>
                )}
              </div>
            )}
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">
                {lotIds.length}{" "}
                {lotIds.length === 1
                  ? "lotto selezionato"
                  : "lotti selezionati"}
              </p>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={page === 1 || lots.isFetching}
                  onClick={() => setPage((v) => v - 1)}
                >
                  Lotti precedenti
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={
                    page * 50 >= (lots.data?.total ?? 0) || lots.isFetching
                  }
                  onClick={() => setPage((v) => v + 1)}
                >
                  Altri lotti
                </Button>
              </div>
            </div>
          </section>
        </fieldset>
        {(validation || mutation.error || consent.error) && (
          <p role="alert" className="text-sm text-destructive">
            {validation || mutation.error?.message || consent.error?.message}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-4 border-t pt-6">
          <Button
            type="submit"
            disabled={
              !editable ||
              mutation.isPending ||
              !consent.data ||
              (anamId !== "none" && !anam.data)
            }
          >
            {mutation.isPending ? "Salvataggio…" : "Salva preparazione"}
          </Button>
          <span className="text-sm text-muted-foreground">
            {c.preparation
              ? `Bozza salvata · revisione ${c.preparation.version}`
              : "Nessuna preparazione ancora salvata"}
          </span>
        </div>
      </form>
    </div>
  );
}
