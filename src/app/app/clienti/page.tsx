"use client";
import { useDeferredValue, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ChevronLeft,
  ChevronRight,
  Mail,
  Phone,
  Plus,
  Search,
  UsersRound,
} from "lucide-react";
import { api } from "@/lib/api";
import type { ClientPage } from "@/lib/types";
import { initials } from "@/lib/dates";
import { ClientEditor } from "@/components/client-editor";
import { ClientDetails } from "@/features/clients/client-details";
import { EmptyState, ErrorState, LoadingState } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default function ClientsPage() {
  const [search, setSearch] = useState("");
  const q = useDeferredValue(search);
  const [page, setPage] = useState(1);
  const [archived, setArchived] = useState(false);
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const { data, isPending, error, refetch } = useQuery({
    queryKey: ["clients", q, page, archived],
    queryFn: () =>
      api<ClientPage>(
        `/api/clients?q=${encodeURIComponent(q)}&page=${page}&archived=${archived}`,
      ),
  });
  return (
    <div className="page-container">
      <div className="flex flex-wrap items-start justify-between gap-5">
        <div>
          <h1 className="text-[32px]">Le tue clienti</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Una scheda per ogni persona. Tutto parte da qui.
          </p>
        </div>
        <Button onClick={() => setCreating(true)}>
          <Plus />
          Nuova cliente
        </Button>
      </div>
      <div className="mt-8 flex flex-wrap items-center justify-between gap-4">
        <div className="relative w-full sm:max-w-sm">
          <Search className="pointer-events-none absolute left-3.5 top-3.5 size-4 text-muted-foreground" />
          <Input
            aria-label="Cerca clienti"
            placeholder="Cerca per nome o cognome…"
            className="bg-white pl-10"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            maxLength={100}
          />
        </div>
        <Tabs
          value={archived ? "archived" : "active"}
          onValueChange={(v) => {
            setArchived(v === "archived");
            setPage(1);
          }}
        >
          <TabsList className="h-11">
            <TabsTrigger value="active">Attive</TabsTrigger>
            <TabsTrigger value="archived">Archiviate</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      <div className="soft-panel mt-5 overflow-hidden">
        {isPending ? (
          <LoadingState label="Caricamento clienti…" />
        ) : error ? (
          <ErrorState error={error} retry={() => void refetch()} />
        ) : !data?.clients.length ? (
          <EmptyState
            icon={UsersRound}
            title={
              search
                ? "Nessuna corrispondenza"
                : archived
                  ? "Nessuna cliente archiviata"
                  : "Diamo un nome alla prima seduta"
            }
            description={
              search
                ? "Prova con un altro nome o cognome."
                : archived
                  ? "Le clienti archiviate resteranno consultabili qui, insieme al loro storico."
                  : "Aggiungi la prima cliente: bastano nome e cognome. Potrai completare i contatti in seguito."
            }
            action={
              !search && !archived ? (
                <Button onClick={() => setCreating(true)}>
                  <Plus />
                  Aggiungi la prima cliente
                </Button>
              ) : undefined
            }
          />
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow className="bg-[#fafcfb] hover:bg-[#fafcfb]">
                  <TableHead className="pl-6">Cliente</TableHead>
                  <TableHead className="hidden md:table-cell">Email</TableHead>
                  <TableHead className="hidden sm:table-cell">
                    Telefono
                  </TableHead>
                  <TableHead className="w-20 pr-6">
                    <span className="sr-only">Apri scheda</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.clients.map((c) => (
                  <TableRow key={c.id} className="group">
                    <TableCell className="py-5 pl-6">
                      <button
                        className="flex min-h-11 items-center gap-3 text-left"
                        onClick={() => setSelected(c.id)}
                      >
                        <span
                          aria-hidden="true"
                          className="flex size-11 shrink-0 items-center justify-center rounded-full bg-[#eef1f7] text-sm font-medium text-[#63618b]"
                        >
                          {initials(c.first_name, c.last_name)}
                        </span>
                        <span>
                          <span className="font-semibold group-hover:text-primary">
                            {c.first_name} {c.last_name}
                          </span>
                          <span className="mt-1 block text-xs text-muted-foreground sm:hidden">
                            {c.phone ?? c.email ?? "Contatti da completare"}
                          </span>
                        </span>
                      </button>
                    </TableCell>
                    <TableCell className="hidden max-w-64 truncate md:table-cell">
                      {c.email ? (
                        <a
                          className="inline-flex min-h-11 items-center gap-2 text-sm text-muted-foreground hover:text-primary"
                          href={`mailto:${c.email}`}
                        >
                          <Mail className="size-3.5" />
                          {c.email}
                        </a>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          Non inserita
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      {c.phone ? (
                        <a
                          href={`tel:${c.phone}`}
                          className="inline-flex min-h-11 items-center gap-2 text-sm text-muted-foreground hover:text-primary"
                        >
                          <Phone className="size-3.5" />
                          {c.phone}
                        </a>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          Non inserito
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="pr-6 text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setSelected(c.id)}
                        aria-label={`Apri scheda di ${c.first_name} ${c.last_name}`}
                      >
                        <ChevronRight className="size-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t px-6 py-4">
              <p className="text-xs text-muted-foreground">
                {data.total} {data.total === 1 ? "cliente" : "clienti"}
                {data.total > 50 && ` · Pagina ${page}`}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  disabled={page === 1}
                  onClick={() => setPage(page - 1)}
                  aria-label="Pagina precedente"
                >
                  <ChevronLeft />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  disabled={page * data.pageSize >= data.total}
                  onClick={() => setPage(page + 1)}
                  aria-label="Pagina successiva"
                >
                  <ChevronRight />
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
      {creating && <ClientEditor onClose={() => setCreating(false)} />}
      {selected && (
        <ClientDetails id={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}
