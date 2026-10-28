"use client";
import Link from "next/link";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Plus } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useOnline } from "@/lib/connectivity";
import { useWorkspace } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { FormSelect } from "@/components/form-select";
import { LoadingState, ErrorState } from "@/components/states";
import {
  defaultPackages,
  suggestPackageUpdate,
  packageSaveSchema,
  professionalSchema,
  type PackageCatalog,
  type ConsentPackage,
  type PackageContent,
  type Professional,
} from "@/lib/packages";
const professionalLabels: Record<keyof Professional, string> = {
  legal_name: "Nome o ragione sociale",
  tax_id: "Codice fiscale / Partita IVA",
  data_controller: "Titolare del trattamento dati",
  address: "Indirizzo professionale",
  email: "Email professionale",
  phone: "Telefono professionale",
  pec: "PEC (facoltativa)",
};
const contentLabels: Partial<Record<keyof PackageContent, string>> = {
  title: "Titolo",
  description: "Descrizione, rischi e informazioni specifiche",
  treatment_statement: "Dichiarazione di consenso al trattamento",
  introduction: "Introduzione al questionario",
  aftercare: "Indicazioni post-trattamento",
  aftercare_statement: "Conferma di ricezione delle istruzioni",
  health_statement: "Consenso esplicito ai dati sanitari",
  privacy_notice: "Informativa privacy dello studio",
  photo_notice: "Informazioni sulle fotografie",
  photo_documentation: "Foto riservate nel dossier",
  photo_demonstration: "Portfolio, sito e social",
  guardian_statement: "Dichiarazione del rappresentante",
};
export function PackageLibrary() {
  const query = useQuery({
    queryKey: ["consent-packages"],
    queryFn: () => api<PackageCatalog>("/api/clinical/packages"),
  });
  const { services } = useWorkspace();
  const online = useOnline();
  const cache = useQueryClient();
  const [editing, setEditing] = useState<{
    initial?: ConsentPackage;
    content: PackageContent;
  } | null>(null);
  const [profile, setProfile] = useState(false);
  const publish = useMutation({
    mutationFn: (p: ConsentPackage) =>
      api("/api/clinical/packages/publish", {
        method: "POST",
        body: JSON.stringify({ id: p.id, version: p.version }),
      }),
    onSuccess: () => {
      void cache.invalidateQueries({ queryKey: ["consent-packages"] });
      void cache.invalidateQueries({ queryKey: ["clinical"] });
      toast.success("Pacchetto pubblicato per il servizio");
    },
  });
  if (query.isPending) return <LoadingState />;
  if (query.error && !query.data)
    return (
      <ErrorState error={query.error} retry={() => void query.refetch()} />
    );
  const data = query.data!;
  return (
    <div className="page-container max-w-5xl [overflow-wrap:anywhere]">
      <Button variant="ghost" asChild className="mb-5 -ml-3">
        <Link href="/app/documenti">
          <ArrowLeft />
          Consensi e pigmenti
        </Link>
      </Button>
      <h1 className="text-[32px]">Moduli predefiniti</h1>
      <p className="mt-2 max-w-prose text-sm text-muted-foreground">
        Adotta una base per Microblading o Lip Blush e personalizzala per il tuo
        studio. Ogni pubblicazione conserva i documenti precedenti.
      </p>
      <section className="mt-8 border-y py-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-xl">Dati professionali</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {data.profile
                ? data.profile.details.legal_name
                : "Completa intestazione, titolare e contatti prima di pubblicare."}
            </p>
          </div>
          <Button variant="outline" onClick={() => setProfile((v) => !v)}>
            {profile
              ? "Chiudi dati professionali"
              : "Configura dati professionali"}
          </Button>
        </div>
        {profile && (
          <ProfessionalForm
            key={data.profile?.version ?? 0}
            initial={data.profile}
            done={() => {
              setProfile(false);
              void query.refetch();
            }}
          />
        )}
      </section>
      {editing ? (
        <PackageForm
          key={editing.initial?.id ?? editing.content.key}
          initial={editing.initial}
          base={editing.content}
          done={() => {
            setEditing(null);
            void query.refetch();
          }}
        />
      ) : (
        <>
          <section className="mt-8">
            <h2 className="text-xl">Scegli una base</h2>
            <ul className="mt-4 divide-y">
              {defaultPackages.map((p) => (
                <li
                  key={p.key}
                  className="flex flex-wrap items-center justify-between gap-4 py-5"
                >
                  <div className="min-w-0">
                    <h3 className="text-lg">{p.title}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {p.questions.filter((q) => q.type === "yes_no").length}{" "}
                      domande · istruzioni · privacy · foto · percorso minori
                    </p>
                  </div>
                  <Button
                    disabled={!online || !services.some((s) => s.active)}
                    onClick={() => setEditing({ content: p })}
                  >
                    <Plus />
                    Usa{" "}
                    {p.key === "microblading" ? "Microblading" : "Lip Blush"}
                  </Button>
                </li>
              ))}
            </ul>
            {!services.some((s) => s.active) && (
              <p className="mt-3 text-sm">
                Aggiungi prima un servizio attivo in Servizi e sedi.
              </p>
            )}
          </section>
          <section className="mt-9">
            <h2 className="text-xl">I pacchetti dello studio</h2>
            {!data.items.length ? (
              <p className="mt-3 text-sm text-muted-foreground">
                Nessun pacchetto adottato. Le basi diventano disponibili nelle
                sedute dopo la tua revisione e pubblicazione.
              </p>
            ) : (
              <ul className="mt-4 divide-y">
                {data.items.map((p) => (
                  <li key={p.id} className="space-y-3 py-5">
                    <div className="flex flex-wrap items-center gap-3">
                      <h3 className="text-lg">{p.content.title}</h3>
                      <Badge variant="secondary">
                        {p.published_revision
                          ? `Versione pubblicata ${p.published_revision}`
                          : "Bozza da rivedere"}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {services.find((s) => s.id === p.service_id)?.name ??
                        "Servizio non disponibile"}{" "}
                      · le modifiche salvate in bozza richiedono una nuova
                      pubblicazione
                    </p>
                    <div className="flex flex-wrap gap-3">
                      <Button
                        variant="outline"
                        onClick={() =>
                          setEditing({ initial: p, content: p.content })
                        }
                      >
                        Modifica bozza
                      </Button>
                      <Button
                        disabled={
                          !online ||
                          publish.isPending ||
                          !data.profile ||
                          !p.content.reviewed
                        }
                        onClick={() => publish.mutate(p)}
                      >
                        Pubblica versione per il servizio
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
      {publish.error && (
        <p role="alert" className="mt-5 text-sm text-destructive">
          {publish.error.message}
        </p>
      )}
    </div>
  );
}
function ProfessionalForm({
  initial,
  done,
}: {
  initial: PackageCatalog["profile"];
  done: () => void;
}) {
  const [values, setValues] = useState<Professional>(
    initial?.details ?? {
      legal_name: "",
      tax_id: "",
      data_controller: "",
      address: "",
      email: "",
      phone: "",
      pec: "",
    },
  );
  const online = useOnline();
  const [error, setError] = useState("");
  const save = useMutation({
    mutationFn: () =>
      api("/api/clinical/packages/profile", {
        method: "POST",
        body: JSON.stringify({
          version: initial?.version ?? 0,
          details: professionalSchema.parse(values),
        }),
      }),
    onSuccess: () => {
      toast.success("Dati professionali salvati");
      done();
    },
  });
  return (
    <form
      className="mt-6 space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        const parsed = professionalSchema.safeParse(values);
        if (!parsed.success) {
          setError(parsed.error.issues[0].message);
          return;
        }
        setError("");
        save.mutate();
      }}
    >
      <fieldset disabled={save.isPending} className="grid gap-5 sm:grid-cols-2">
        {(Object.keys(professionalLabels) as (keyof Professional)[]).map(
          (k) => (
            <div className="field" key={k}>
              <Label htmlFor={`professional-${k}`}>
                {professionalLabels[k]}
              </Label>
              <Input
                id={`professional-${k}`}
                value={values[k]}
                maxLength={k === "address" ? 300 : 254}
                type={k === "email" || k === "pec" ? "email" : "text"}
                required={k !== "pec"}
                onChange={(e) => setValues({ ...values, [k]: e.target.value })}
              />
            </div>
          ),
        )}
      </fieldset>
      {(error || save.error) && (
        <p role="alert" className="text-sm text-destructive">
          {error || save.error?.message}
        </p>
      )}
      <Button disabled={!online || save.isPending} type="submit">
        {save.isPending ? "Salvataggio…" : "Salva dati professionali"}
      </Button>
    </form>
  );
}
function PackageForm({
  initial,
  base,
  done,
}: {
  initial?: ConsentPackage;
  base: PackageContent;
  done: () => void;
}) {
  const { services } = useWorkspace();
  const online = useOnline();
  const [content, setContent] = useState(structuredClone(base));
  const latest = defaultPackages.find((p) => p.key === content.key)!;
  const updateAvailable = latest.revision > content.revision;
  const [service, setService] = useState(initial?.service_id ?? "");
  const [error, setError] = useState("");
  const save = useMutation({
    mutationFn: () =>
      api("/api/clinical/packages", {
        method: "POST",
        body: JSON.stringify(
          packageSaveSchema.parse({
            id: initial?.id ?? null,
            version: initial?.version ?? 0,
            service_id: service,
            content,
          }),
        ),
      }),
    onSuccess: () => {
      toast.success(
        "Bozza salvata; la pubblicazione resta una scelta separata",
      );
      done();
    },
  });
  function change<K extends keyof PackageContent>(
    key: K,
    value: PackageContent[K],
  ) {
    setContent((c) => ({
      ...c,
      [key]: value,
      reviewed: key === "reviewed" ? Boolean(value) : false,
    }));
  }
  return (
    <form
      className="mt-8 space-y-7"
      onSubmit={(e) => {
        e.preventDefault();
        setError("");
        const parsed = packageSaveSchema.safeParse({
          id: initial?.id ?? null,
          version: initial?.version ?? 0,
          service_id: service,
          content,
        });
        if (!parsed.success) {
          setError(parsed.error.issues[0].message);
          return;
        }
        save.mutate();
      }}
    >
      <h2 className="text-2xl">
        Personalizza{" "}
        {base.key === "microblading" ? "Microblading" : "Lip Blush"}
      </h2>
      <p className="max-w-prose text-sm text-muted-foreground">
        Fonte del {base.source_date}: {base.source_scope} I riferimenti
        territoriali e i tempi di conservazione della fonte richiedono verifica
        per il tuo studio. Le firme registrano separatamente i consensi e le
        scelte.
      </p>
      {updateAvailable && (
        <details className="border-y py-4">
          <summary className="min-h-11 cursor-pointer py-3 font-medium">
            Base aggiornata disponibile · confronta versione {content.revision}{" "}
            e {latest.revision}
          </summary>
          <p className="mt-3 text-sm text-muted-foreground">
            L’adozione cambia soltanto la bozza dopo questa scelta esplicita.
            Informativa e requisiti dello studio restano da ricontrollare. I
            documenti e le versioni pubblicate rimangono invariati.
          </p>
          <div className="mt-5 space-y-5">
            {(Object.keys(contentLabels) as (keyof PackageContent)[])
              .filter((k) => k !== "privacy_notice" && content[k] !== latest[k])
              .map((k) => (
                <section key={k}>
                  <h3 className="text-lg">{contentLabels[k]}</h3>
                  <div className="mt-3 grid gap-5 sm:grid-cols-2">
                    <div>
                      <p className="font-medium">Bozza attuale</p>
                      <p className="mt-2 whitespace-pre-wrap text-sm">
                        {String(content[k])}
                      </p>
                    </div>
                    <div>
                      <p className="font-medium">Nuova base</p>
                      <p className="mt-2 whitespace-pre-wrap text-sm">
                        {String(latest[k])}
                      </p>
                    </div>
                  </div>
                </section>
              ))}
            {JSON.stringify(content.questions) !==
              JSON.stringify(latest.questions) && (
              <section>
                <h3 className="text-lg">Questionario aggiornato</h3>
                <ol className="mt-3 list-decimal space-y-3 pl-5">
                  {latest.questions.map((q) => (
                    <li key={q.id} className="text-sm">
                      {q.label}
                    </li>
                  ))}
                </ol>
              </section>
            )}
          </div>
          <Button
            className="mt-6"
            type="button"
            variant="outline"
            disabled={!online || save.isPending}
            onClick={() => setContent(suggestPackageUpdate(content, latest))}
          >
            Usa la nuova base nella bozza
          </Button>
        </details>
      )}
      <fieldset disabled={save.isPending} className="space-y-6">
        <div className="field max-w-xl">
          <Label htmlFor="package-service">Servizio del catalogo</Label>
          <FormSelect
            id="package-service"
            value={service}
            onChange={setService}
            disabled={!!initial}
            options={[
              { value: "", label: "Seleziona un servizio" },
              ...services
                .filter((s) => s.active || s.id === service)
                .map((s) => ({ value: s.id, label: s.name })),
            ]}
          />
        </div>
        {(Object.keys(contentLabels) as (keyof PackageContent)[]).map(
          (k, i) => (
            <details
              key={k}
              open={i === 0 || k === "privacy_notice"}
              className="border-b pb-5"
            >
              <summary className="min-h-11 cursor-pointer py-3 font-medium">
                {contentLabels[k]}
              </summary>
              <div className="field mt-2">
                <Label htmlFor={`package-${k}`}>{contentLabels[k]}</Label>
                {k === "title" ? (
                  <Input
                    id={`package-${k}`}
                    value={String(content[k])}
                    maxLength={120}
                    onChange={(e) => change(k, e.target.value as never)}
                  />
                ) : (
                  <Textarea
                    id={`package-${k}`}
                    value={String(content[k])}
                    rows={k === "description" || k === "aftercare" ? 12 : 6}
                    maxLength={k === "privacy_notice" ? 10000 : 8000}
                    onChange={(e) => change(k, e.target.value as never)}
                  />
                )}
              </div>
              {k === "privacy_notice" && (
                <p className="mt-2 text-sm text-muted-foreground">
                  Inserisci il testo approvato per il tuo studio, coerente con
                  Dati e privacy. La pubblicazione di questa copia non modifica
                  l’informativa pubblica o le regole di conservazione dello
                  studio.
                </p>
              )}
            </details>
          ),
        )}
        <details className="border-b pb-5">
          <summary className="min-h-11 cursor-pointer py-3 font-medium">
            Questionario · {content.questions.length} campi
          </summary>
          <div className="mt-3 space-y-4">
            {content.questions.map((q, i) => (
              <div className="field" key={q.id}>
                <Label htmlFor={`package-q-${q.id}`}>
                  Domanda {i + 1}
                  {q.type === "text" ? " · spiegazioni" : " · Sì/No"}
                </Label>
                <Textarea
                  id={`package-q-${q.id}`}
                  value={q.label}
                  rows={2}
                  maxLength={200}
                  onChange={(e) =>
                    change(
                      "questions",
                      content.questions.map((v, j) =>
                        j === i ? { ...v, label: e.target.value } : v,
                      ),
                    )
                  }
                />
              </div>
            ))}
          </div>
        </details>
        <section className="space-y-5">
          <h3 className="text-xl">Ambito e minorenni</h3>
          <div className="field">
            <Label htmlFor="package-jurisdiction">
              Ambito territoriale verificato
            </Label>
            <Input
              id="package-jurisdiction"
              value={content.jurisdiction}
              maxLength={200}
              onChange={(e) => change("jurisdiction", e.target.value)}
            />
          </div>
          <label className="flex min-h-11 items-start gap-3 text-sm">
            <Checkbox
              checked={content.minors_enabled}
              onCheckedChange={(v) => change("minors_enabled", v === true)}
            />
            Abilita il percorso per minorenni secondo i requisiti verificati per
            questo servizio
          </label>
          {content.minors_enabled && (
            <div className="space-y-5">
              <div className="grid gap-5 sm:grid-cols-2">
                <div className="field">
                  <Label htmlFor="package-min-age">
                    Età minima ammessa, verificata
                  </Label>
                  <Input
                    id="package-min-age"
                    type="number"
                    min={0}
                    max={17}
                    value={content.minimum_age ?? ""}
                    onChange={(e) =>
                      change(
                        "minimum_age",
                        e.target.value === "" ? null : Number(e.target.value),
                      )
                    }
                  />
                </div>
                <div className="field">
                  <Label htmlFor="package-representatives">
                    Rappresentanti e firme richieste
                  </Label>
                  <FormSelect
                    id="package-representatives"
                    value={content.representatives_required?.toString() ?? ""}
                    onChange={(v) =>
                      change("representatives_required", v ? Number(v) : null)
                    }
                    options={[
                      { value: "", label: "Seleziona il requisito verificato" },
                      { value: "1", label: "Un rappresentante" },
                      { value: "2", label: "Due rappresentanti" },
                    ]}
                  />
                </div>
              </div>
              <div className="field">
                <Label htmlFor="package-minors-basis">
                  Requisiti, riferimenti e verifiche per minori
                </Label>
                <Textarea
                  id="package-minors-basis"
                  value={content.minors_basis}
                  maxLength={2000}
                  rows={5}
                  onChange={(e) => change("minors_basis", e.target.value)}
                />
              </div>
            </div>
          )}
        </section>
        <label className="flex min-h-11 items-start gap-3 text-sm leading-relaxed">
          <Checkbox
            checked={content.reviewed}
            onCheckedChange={(v) => change("reviewed", v === true)}
          />
          <span>
            Ho revisionato testi, informativa, pratiche dichiarate e requisiti
            territoriali, comprese le regole per minorenni se abilitate. Il
            pacchetto potrà essere pubblicato per il servizio scelto.
          </span>
        </label>
      </fieldset>
      {(error || save.error) && (
        <p role="alert" className="text-sm text-destructive">
          {error || save.error?.message}
        </p>
      )}
      <div className="flex flex-wrap gap-3 border-t pt-6">
        <Button type="submit" disabled={!online || save.isPending}>
          {save.isPending ? "Salvataggio…" : "Salva bozza del pacchetto"}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={save.isPending}
          onClick={done}
        >
          Annulla modifica pacchetto
        </Button>
      </div>
    </form>
  );
}
