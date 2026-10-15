"use client";
import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import {
  templatePublishSchema,
  type TemplateDetail,
  type Question,
} from "@/lib/clinical";
import { useWorkspace } from "@/components/app-shell";
import { ErrorState, LoadingState } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { FormSelect } from "@/components/form-select";
import { useRequestKey } from "./use-request-key";
export function TemplateEditor({
  id,
  kind,
}: {
  id?: string;
  kind: "consent" | "anamnesis";
}) {
  const query = useQuery({
    queryKey: ["clinical-template", id],
    queryFn: () => api<TemplateDetail>(`/api/clinical/templates/${id}`),
    enabled: !!id,
    gcTime: 0,
  });
  if (id && query.isPending) return <LoadingState />;
  if (query.error && !query.data)
    return (
      <ErrorState error={query.error} retry={() => void query.refetch()} />
    );
  return <TemplateForm key={id ?? kind} initial={query.data} kind={kind} />;
}
function TemplateForm({
  initial: loaded,
  kind,
}: {
  initial?: TemplateDetail;
  kind: "consent" | "anamnesis";
}) {
  const [initial] = useState(loaded);
  const { services, profile } = useWorkspace();
  const router = useRouter();
  const cache = useQueryClient();
  const withKey = useRequestKey();
  const actualKind = initial?.template.kind ?? kind;
  const [title, setTitle] = useState(initial?.current.title ?? "");
  const [body, setBody] = useState(initial?.current.body ?? "");
  const [questions, setQuestions] = useState<Question[]>(
    initial?.current.questions ?? [],
  );
  const [service, setService] = useState(initial?.template.service_id ?? "all");
  const [validation, setValidation] = useState("");
  const mutation = useMutation({
    mutationFn: (payload: ReturnType<typeof templatePublishSchema.parse>) =>
      api("/api/clinical/templates", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      void cache.invalidateQueries({ queryKey: ["clinical"] });
      void cache.invalidateQueries({ queryKey: ["clinical-template"] });
      toast.success("Versione pubblicata");
      router.push("/app/documenti");
    },
  });
  const owner = profile.role === "owner";
  function submit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = templatePublishSchema.safeParse(
      withKey({
        template_id: initial?.template.id ?? null,
        version: initial?.template.version ?? 0,
        kind: actualKind,
        title,
        body,
        questions,
        service_id: service === "all" ? null : service,
      }),
    );
    if (!parsed.success) {
      setValidation(parsed.error.issues[0].message);
      return;
    }
    setValidation("");
    mutation.mutate(parsed.data);
  }
  function update(index: number, patch: Partial<Question>) {
    setQuestions((items) =>
      items.map((q, i) => (i === index ? { ...q, ...patch } : q)),
    );
  }
  if (!owner && initial)
    return (
      <div className="page-container max-w-5xl">
        <Button variant="ghost" asChild className="mb-5 -ml-3">
          <Link href="/app/documenti">
            <ArrowLeft />
            Consensi e pigmenti
          </Link>
        </Button>
        <h1 className="text-[32px]">{initial.current.title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Versione {initial.current.revision} · Modello pubblicato dalla
          titolare
        </p>
        <article className="mt-7 rounded-xl border bg-white p-5 sm:p-8">
          <p className="whitespace-pre-wrap text-sm leading-relaxed">
            {initial.current.body}
          </p>
          {initial.current.questions.length > 0 && (
            <ol className="mt-6 divide-y">
              {initial.current.questions.map((q) => (
                <li key={q.id} className="py-4">
                  <p className="font-medium">{q.label}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {q.type === "yes_no" ? "Sì o no" : "Risposta libera"}
                    {q.required ? " · Richiesta alla firma" : ""}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </article>
      </div>
    );
  return (
    <div className="page-container max-w-5xl">
      <Button variant="ghost" asChild className="mb-5 -ml-3">
        <Link href="/app/documenti">
          <ArrowLeft />
          Consensi e pigmenti
        </Link>
      </Button>
      <h1 className="text-[32px]">
        {initial
          ? "Una nuova versione"
          : actualKind === "consent"
            ? "Nuovo modello di consenso"
            : "Nuovo modello di anamnesi"}
      </h1>
      <p className="mt-2 max-w-prose text-sm text-muted-foreground">
        Ogni pubblicazione conserva il testo precedente. Inserisci i contenuti e
        le domande approvati per il tuo studio; questa operazione non raccoglie
        una firma.
      </p>
      <form onSubmit={submit} className="mt-8 space-y-7">
        <fieldset disabled={!owner || mutation.isPending} className="space-y-6">
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="field">
              <Label htmlFor="template-title">Titolo del modello</Label>
              <Input
                id="template-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                minLength={2}
                maxLength={120}
              />
            </div>
            <div className="field">
              <Label htmlFor="template-service">Servizio</Label>
              <FormSelect
                id="template-service"
                value={service}
                onChange={setService}
                disabled={!!initial}
                options={[
                  { value: "all", label: "Tutti i servizi" },
                  ...services.map((s) => ({ value: s.id, label: s.name })),
                ]}
              />
            </div>
          </div>
          <div className="field">
            <Label htmlFor="template-body">
              {actualKind === "consent"
                ? "Testo del consenso"
                : "Introduzione al questionario"}
            </Label>
            <Textarea
              id="template-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={12}
              minLength={10}
              maxLength={12000}
              required
              className="bg-white leading-relaxed"
            />
            <p className="text-xs text-muted-foreground">
              {body.length.toLocaleString("it-IT")} / 12.000 caratteri · testo
              semplice
            </p>
          </div>
          {actualKind === "anamnesis" && (
            <section>
              <h2 className="text-xl">Le domande da compilare</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Le risposte restano nel dossier autorizzato, escluse da email e
                WhatsApp.
              </p>
              <div className="mt-5 divide-y rounded-xl border bg-white">
                {questions.map((q, i) => (
                  <div key={q.id} className="space-y-4 p-5">
                    <div className="flex items-end gap-3">
                      <div className="field flex-1">
                        <Label htmlFor={`question-${q.id}`}>
                          Domanda {i + 1}
                        </Label>
                        <Input
                          id={`question-${q.id}`}
                          value={q.label}
                          onChange={(e) => update(i, { label: e.target.value })}
                          required
                          maxLength={200}
                        />
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Rimuovi domanda ${i + 1}`}
                        onClick={() =>
                          setQuestions((items) =>
                            items.filter((item) => item.id !== q.id),
                          )
                        }
                      >
                        <Trash2 />
                      </Button>
                    </div>
                    <div className="flex flex-wrap items-center gap-4">
                      <div className="w-52">
                        <FormSelect
                          ariaLabel={`Tipo risposta domanda ${i + 1}`}
                          value={q.type}
                          onChange={(value) =>
                            update(i, { type: value as Question["type"] })
                          }
                          options={[
                            { value: "yes_no", label: "Sì o no" },
                            { value: "text", label: "Risposta libera" },
                          ]}
                        />
                      </div>
                      <label className="flex min-h-11 items-center gap-3 text-sm">
                        <Checkbox
                          checked={q.required}
                          onCheckedChange={(v) =>
                            update(i, { required: v === true })
                          }
                        />
                        Obbligatoria alla firma
                      </label>
                    </div>
                  </div>
                ))}
              </div>
              <Button
                type="button"
                variant="outline"
                className="mt-4"
                disabled={questions.length >= 30}
                onClick={() =>
                  setQuestions((items) => [
                    ...items,
                    {
                      id: crypto.randomUUID(),
                      label: "",
                      type: "yes_no",
                      required: true,
                    },
                  ])
                }
              >
                <Plus />
                Aggiungi domanda
              </Button>
            </section>
          )}
        </fieldset>
        {(validation || mutation.error) && (
          <p role="alert" className="text-sm text-destructive">
            {validation || mutation.error?.message}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-4 border-t pt-6">
          <Button type="submit" disabled={!owner || mutation.isPending}>
            {mutation.isPending
              ? "Pubblicazione…"
              : initial
                ? "Pubblica nuova versione"
                : "Pubblica versione"}
          </Button>
          <span className="text-sm text-muted-foreground">
            {initial
              ? `Versione attuale ${initial.current.revision}. Lo storico rimane disponibile.`
              : "Il modello sarà disponibile nelle preparazioni dello studio."}
          </span>
        </div>
      </form>
      {initial && (
        <section className="mt-10 border-t pt-6">
          <h2 className="text-xl">Pubblicazioni precedenti</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Ultime dieci versioni. I documenti già preparati conservano il testo
            scelto.
          </p>
          <ol className="mt-4 divide-y">
            {initial.history.map((v) => (
              <li
                key={v.id}
                className="flex flex-wrap justify-between gap-2 py-4 text-sm"
              >
                <span>
                  Versione {v.revision} · {v.title}
                </span>
                <time className="text-muted-foreground">
                  {new Date(v.published_at).toLocaleDateString("it-IT")}
                </time>
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}
