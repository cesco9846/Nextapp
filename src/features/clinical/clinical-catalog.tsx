"use client";
import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, FileText, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { Temporal } from "temporal-polyfill";
import { api } from "@/lib/api";
import type {
  CatalogPage,
  ClinicalTemplate,
  Pigment,
  LotListEntry,
} from "@/lib/clinical";
import { useWorkspace } from "@/components/app-shell";
import { EmptyState, ErrorState, LoadingState } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PigmentEditor, LotEditor } from "./catalog-editors";
import { LabelPreview } from "./label-preview";
type Tab = "consent" | "anamnesis" | "pigments" | "lots";
export function ClinicalCatalog() {
  const { profile, tenant } = useWorkspace();
  const owner = profile.role === "owner";
  const client = useQueryClient();
  const [tab, setTab] = useState<Tab>("consent");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [editor, setEditor] = useState<
    | { kind: "pigment"; entry?: Pigment }
    | {
        kind: "lot";
        pigment: Pick<Pigment, "id" | "name" | "brand">;
        entry?: LotListEntry;
      }
    | null
  >(null);
  const templates = tab === "consent" || tab === "anamnesis";
  const query = useQuery({
    queryKey: ["clinical", tab, search, page],
    queryFn: () =>
      api<CatalogPage<ClinicalTemplate | Pigment | LotListEntry>>(
        `/api/clinical/${templates ? "templates" : "" + tab}?page=${page}&q=${encodeURIComponent(search)}${templates ? `&kind=${tab}` : ""}`,
      ),
  });
  const archive = useMutation({
    mutationFn: (t: ClinicalTemplate) =>
      api(`/api/clinical/templates/${t.id}`, {
        method: "PATCH",
        body: JSON.stringify({ version: t.version, active: !t.active }),
      }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["clinical"] });
    },
    onError: (e) => toast.error(e.message),
  });
  const today = Temporal.Now.plainDateISO(tenant.timezone).toString();
  return (
    <div className="page-container">
      <Button variant="ghost" asChild className="mb-5 -ml-3">
        <Link href="/app/impostazioni">
          <ArrowLeft />
          Il tuo studio
        </Link>
      </Button>
      <div className="flex flex-wrap items-start justify-between gap-5">
        <div>
          <h1 className="text-[32px]">Consensi e pigmenti</h1>
          <p className="mt-2 max-w-prose text-sm text-muted-foreground">
            I testi da condividere e i materiali da ritrovare prima di ogni
            trattamento.
          </p>
        </div>
        {owner && templates && (
          <Button asChild>
            <Link href={`/app/documenti/modelli/nuovo?tipo=${tab}`}>
              <Plus />
              Nuovo modello
            </Link>
          </Button>
        )}
        {owner && tab === "pigments" && (
          <Button onClick={() => setEditor({ kind: "pigment" })}>
            <Plus />
            Aggiungi pigmento
          </Button>
        )}
      </div>
      <Tabs
        value={tab}
        onValueChange={(value) => {
          setTab(value as Tab);
          setPage(1);
          setSearch("");
        }}
        className="mt-8"
      >
        <TabsList className="grid w-full grid-cols-2 group-data-[orientation=horizontal]/tabs:h-[94px] sm:w-fit sm:grid-cols-4 sm:group-data-[orientation=horizontal]/tabs:h-[50px]">
          <TabsTrigger value="consent" className="min-h-11">
            Consensi
          </TabsTrigger>
          <TabsTrigger value="anamnesis" className="min-h-11">
            Anamnesi
          </TabsTrigger>
          <TabsTrigger value="pigments" className="min-h-11">
            Pigmenti
          </TabsTrigger>
          <TabsTrigger value="lots" className="min-h-11">
            Lotti
          </TabsTrigger>
        </TabsList>
      </Tabs>
      <div className="relative mt-6 max-w-sm">
        <Search className="absolute left-3 top-3.5 size-4 text-muted-foreground" />
        <Input
          aria-label={
            tab === "lots"
              ? "Cerca numero lotto"
              : tab === "pigments"
                ? "Cerca nome pigmento"
                : "Cerca modello"
          }
          placeholder={
            tab === "lots"
              ? "Cerca numero lotto…"
              : tab === "pigments"
                ? "Cerca nome pigmento…"
                : "Cerca modello…"
          }
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          className="bg-white pl-10"
        />
      </div>
      {query.isPending ? (
        <LoadingState />
      ) : query.error && !query.data ? (
        <ErrorState error={query.error} retry={() => void query.refetch()} />
      ) : (
        <>
          {!query.data?.items.length ? (
            <EmptyState
              icon={FileText}
              title={
                templates
                  ? "Il primo modello del tuo studio"
                  : tab === "pigments"
                    ? "Aggiungi i pigmenti che usi"
                    : "I lotti, con la loro etichetta"
              }
              description={
                templates
                  ? "Inserisci i testi approvati per il tuo studio. Ogni versione rimarrà consultabile."
                  : tab === "pigments"
                    ? "Registra il prodotto, poi aggiungi i singoli lotti con numero e scadenza."
                    : "Apri la scheda di un pigmento e scegli Aggiungi lotto."
              }
            />
          ) : (
            <div className="mt-6 divide-y overflow-hidden rounded-xl border bg-white">
              {query.data.items.map((item) =>
                templates
                  ? (() => {
                      const t = item as ClinicalTemplate;
                      return (
                        <article
                          key={t.id}
                          className="flex flex-wrap items-center justify-between gap-5 p-5 sm:p-7"
                        >
                          <div className="min-w-0">
                            <h2 className="text-lg">{t.title}</h2>
                            <p className="mt-2 text-sm text-muted-foreground">
                              Versione {t.current_revision}
                              {!t.active ? " · Archiviato" : ""}
                            </p>
                          </div>
                          <div className="flex flex-wrap gap-3">
                            <Button variant="outline" asChild>
                              <Link href={`/app/documenti/modelli/${t.id}`}>
                                {owner ? "Apri modello" : "Leggi modello"}
                              </Link>
                            </Button>
                            {owner && (
                              <Button
                                variant="ghost"
                                disabled={archive.isPending}
                                onClick={() => archive.mutate(t)}
                              >
                                {t.active ? "Archivia" : "Riattiva"}
                              </Button>
                            )}
                          </div>
                        </article>
                      );
                    })()
                  : tab === "pigments"
                    ? (() => {
                        const p = item as Pigment;
                        return (
                          <article
                            key={p.id}
                            className="flex flex-wrap items-center justify-between gap-5 p-5 sm:p-7"
                          >
                            <div>
                              <p className="text-sm text-muted-foreground">
                                {p.brand}
                              </p>
                              <h2 className="mt-1 text-lg">{p.name}</h2>
                              {p.code && (
                                <p className="mt-2 text-sm text-muted-foreground">
                                  {p.code}
                                </p>
                              )}
                              {!p.active && (
                                <Badge variant="secondary" className="mt-2">
                                  Archiviato
                                </Badge>
                              )}
                            </div>
                            {owner && (
                              <div className="flex flex-wrap gap-3">
                                <Button
                                  variant="outline"
                                  onClick={() =>
                                    setEditor({ kind: "lot", pigment: p })
                                  }
                                  disabled={!p.active}
                                >
                                  Aggiungi lotto
                                </Button>
                                <Button
                                  variant="ghost"
                                  onClick={() =>
                                    setEditor({ kind: "pigment", entry: p })
                                  }
                                >
                                  Modifica pigmento
                                </Button>
                              </div>
                            )}
                          </article>
                        );
                      })()
                    : (() => {
                        const l = item as LotListEntry;
                        const expired = l.expires_on < today;
                        return (
                          <article
                            key={l.id}
                            className="flex flex-wrap items-center justify-between gap-5 p-5 sm:p-7"
                          >
                            <div>
                              <h2 className="text-lg">
                                {l.pigment.name} · {l.lot_number}
                              </h2>
                              <p className="mt-2 text-sm text-muted-foreground">
                                {l.pigment.brand} · Scadenza{" "}
                                {new Date(
                                  l.expires_on + "T12:00:00Z",
                                ).toLocaleDateString("it-IT")}
                              </p>
                              {(expired || !l.active || !l.pigment.active) && (
                                <Badge variant="secondary" className="mt-3">
                                  {expired ? "Scaduto" : "Archiviato"}
                                </Badge>
                              )}
                            </div>
                            <div className="flex flex-wrap gap-3">
                              <LabelPreview id={l.label_file_id} />
                              {owner && (
                                <Button
                                  variant="ghost"
                                  onClick={() =>
                                    setEditor({
                                      kind: "lot",
                                      pigment: l.pigment,
                                      entry: l,
                                    })
                                  }
                                >
                                  Modifica lotto
                                </Button>
                              )}
                            </div>
                          </article>
                        );
                      })(),
              )}
            </div>
          )}
          <div className="mt-6 flex items-center justify-between gap-4 text-sm">
            <span className="text-muted-foreground">
              {query.data?.total ?? 0} risultati · pagina {page}
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                disabled={page === 1 || query.isFetching}
                onClick={() => setPage((v) => v - 1)}
              >
                Indietro
              </Button>
              <Button
                variant="outline"
                disabled={
                  page * 50 >= (query.data?.total ?? 0) || query.isFetching
                }
                onClick={() => setPage((v) => v + 1)}
              >
                Avanti
              </Button>
            </div>
          </div>
        </>
      )}
      {editor?.kind === "pigment" && (
        <PigmentEditor entry={editor.entry} onClose={() => setEditor(null)} />
      )}
      {editor?.kind === "lot" && (
        <LotEditor
          pigment={editor.pigment}
          entry={editor.entry}
          onClose={() => setEditor(null)}
        />
      )}
    </div>
  );
}
