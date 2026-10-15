"use client";
import { useState } from "react";
import { Clock3, MapPin, Paintbrush, Pencil, Plus } from "lucide-react";
import { useWorkspace } from "@/components/app-shell";
import { CatalogEditor } from "@/features/catalog/catalog-editor";
import { EmptyState } from "@/components/states";
import { money } from "@/lib/dates";
import type { Location, Service } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function CatalogPage() {
  const { services, locations, profile } = useWorkspace();
  const [tab, setTab] = useState("services");
  const [editor, setEditor] = useState<{
    kind: "services" | "locations";
    entry?: Service | Location;
  } | null>(null);
  const owner = profile.role === "owner";
  return (
    <div className="page-container">
      <div className="flex flex-wrap items-start justify-between gap-5">
        <div>
          <h1 className="text-[32px]">Il lavoro, organizzato.</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            I servizi che offri e i luoghi in cui accogli le tue clienti.
          </p>
        </div>
        {owner && (
          <Button
            onClick={() =>
              setEditor({ kind: tab === "services" ? "services" : "locations" })
            }
          >
            <Plus />
            {tab === "services" ? "Aggiungi servizio" : "Aggiungi sede"}
          </Button>
        )}
      </div>
      <Tabs value={tab} onValueChange={setTab} className="mt-8">
        <TabsList className="h-11">
          <TabsTrigger value="services">
            <Paintbrush className="mr-1.5 size-4" />
            Servizi{" "}
            <span className="ml-1 text-xs text-muted-foreground">
              {services.length}
            </span>
          </TabsTrigger>
          <TabsTrigger value="locations">
            <MapPin className="mr-1.5 size-4" />
            Sedi{" "}
            <span className="ml-1 text-xs text-muted-foreground">
              {locations.length}
            </span>
          </TabsTrigger>
        </TabsList>
        <TabsContent value="services" className="mt-5">
          <div className="overflow-hidden rounded-xl border bg-white">
            {services.length ? (
              <div className="divide-y">
                {services.map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center gap-4 px-5 py-6 sm:px-7"
                  >
                    <span
                      className="size-3 shrink-0 rounded-full"
                      style={{ background: s.color }}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold">{s.name}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                        <span className="inline-flex items-center gap-1.5">
                          <Clock3 className="size-3.5" />
                          {s.duration_minutes} min
                        </span>
                        {!s.active && (
                          <Badge variant="secondary">Non attivo</Badge>
                        )}
                      </div>
                    </div>
                    <span className="data-number text-lg font-semibold">
                      {money(s.price_cents)}
                    </span>
                    {owner && (
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Modifica ${s.name}`}
                        onClick={() =>
                          setEditor({ kind: "services", entry: s })
                        }
                      >
                        <Pencil className="size-4" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                icon={Paintbrush}
                title="Ogni servizio ha il suo tempo"
                description="Aggiungi il primo servizio con durata e prezzo. Sarà pronto per le tue prenotazioni."
              />
            )}
          </div>
          <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
            Le modifiche al catalogo si applicano alle nuove prenotazioni. I
            prezzi delle sedute già registrate restano invariati.
          </p>
        </TabsContent>
        <TabsContent value="locations" className="mt-5">
          <div className="overflow-hidden rounded-xl border bg-white">
            {locations.length ? (
              <div className="divide-y">
                {locations.map((l) => (
                  <div
                    key={l.id}
                    className="flex items-center gap-4 px-5 py-6 sm:px-7"
                  >
                    <span
                      className="flex size-11 shrink-0 items-center justify-center rounded-xl"
                      style={{ background: `${l.color}15`, color: l.color }}
                    >
                      <MapPin className="size-5" strokeWidth={1.6} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold">{l.name}</p>
                      <p className="mt-1.5 text-sm text-muted-foreground">
                        {l.address || "Indirizzo da completare"}
                      </p>
                      {!l.active && (
                        <Badge variant="secondary" className="mt-2">
                          Non attiva
                        </Badge>
                      )}
                    </div>
                    {owner && (
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Modifica ${l.name}`}
                        onClick={() =>
                          setEditor({ kind: "locations", entry: l })
                        }
                      >
                        <Pencil className="size-4" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                icon={MapPin}
                title="Dove ricevi le tue clienti?"
                description="Aggiungi una sede per ritrovarla nell’agenda e nelle prenotazioni."
              />
            )}
          </div>
        </TabsContent>
      </Tabs>
      {editor && (
        <CatalogEditor
          kind={editor.kind}
          entry={editor.entry}
          onClose={() => setEditor(null)}
        />
      )}
    </div>
  );
}
