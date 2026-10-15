"use client";
import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  CalendarDays,
  Mail,
  MapPin,
  Pencil,
  Phone,
  RotateCcw,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { formatDate, formatTime, initials, money } from "@/lib/dates";
import { statusLabels, type AppointmentStatus } from "@/lib/contracts";
import type { Client, Location, Row } from "@/lib/types";
import { useWorkspace } from "@/components/app-shell";
import { ClientEditor } from "@/components/client-editor";
import { ClientAssignments } from "./client-assignments";
import { EmptyState, ErrorState, LoadingState } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
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

type Details = {
  client: Client;
  appointments: (Row<"appointments"> & {
    location: Pick<Location, "id" | "name" | "color">;
  })[];
};
export function ClientDetails({
  id,
  onClose,
}: {
  id: string;
  onClose: () => void;
}) {
  const { profile } = useWorkspace();
  const query = useQueryClient();
  const [editing, setEditing] = useState(false);
  const { data, error, isPending, refetch } = useQuery({
    queryKey: ["client", id],
    queryFn: () => api<Details>(`/api/clients/${id}`),
  });
  const archive = useMutation({
    mutationFn: () =>
      api(`/api/clients/${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          version: data?.client.version,
          archived: !data?.client.archived_at,
        }),
      }),
    onSuccess: () => {
      void query.invalidateQueries({ queryKey: ["clients"] });
      void query.invalidateQueries({ queryKey: ["client", id] });
      toast.success(
        data?.client.archived_at ? "Cliente riattivata" : "Cliente archiviata",
      );
    },
    onError: (error) => toast.error(error.message),
  });
  const client = data?.client;
  return (
    <>
      <Sheet
        open
        onOpenChange={(v) => {
          if (!v) onClose();
        }}
      >
        <SheetContent className="w-full overflow-y-auto p-0 sm:max-w-[520px]">
          <SheetHeader className="sr-only">
            <SheetTitle>Scheda cliente</SheetTitle>
            <SheetDescription>
              Contatti e storico degli appuntamenti.
            </SheetDescription>
          </SheetHeader>
          {isPending ? (
            <LoadingState />
          ) : error ? (
            <ErrorState error={error} retry={() => void refetch()} />
          ) : (
            client && (
              <div>
                <div className="border-b bg-[#f0f5f1] px-7 pb-7 pt-12">
                  <span className="flex size-16 items-center justify-center rounded-2xl bg-[#dce9df] font-display text-2xl text-primary">
                    {initials(client.first_name, client.last_name)}
                  </span>
                  <h2 className="mt-5 text-3xl">
                    {client.first_name} {client.last_name}
                  </h2>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Cliente dal{" "}
                    {formatDate(client.created_at, undefined, {
                      year: "numeric",
                    })}
                  </p>
                  {client.archived_at && (
                    <Badge className="mt-3" variant="secondary">
                      Archiviata
                    </Badge>
                  )}
                  <Button
                    variant="outline"
                    className="mt-5 bg-white"
                    onClick={() => setEditing(true)}
                  >
                    <Pencil className="size-4" />
                    Modifica contatti
                  </Button>
                </div>
                <section className="space-y-4 border-b px-7 py-7">
                  <h3 className="text-lg">Contatti</h3>
                  {client.phone ? (
                    <a
                      className="flex min-h-11 items-center gap-3 text-sm hover:underline"
                      href={`tel:${client.phone}`}
                    >
                      <Phone className="size-4 text-muted-foreground" />
                      {client.phone}
                    </a>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Telefono non inserito
                    </p>
                  )}
                  {client.email ? (
                    <a
                      className="flex min-h-11 items-center gap-3 break-all text-sm hover:underline"
                      href={`mailto:${client.email}`}
                    >
                      <Mail className="size-4 shrink-0 text-muted-foreground" />
                      {client.email}
                    </a>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Email non inserita
                    </p>
                  )}
                </section>
                {profile.role === "owner" && (
                  <ClientAssignments clientId={id} />
                )}
                <section className="px-7 py-7">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg">Appuntamenti</h3>
                    <Button variant="ghost" asChild size="sm">
                      <Link href={`/app/agenda?cliente=${client.id}`}>
                        Prenota
                      </Link>
                    </Button>
                  </div>
                  {!data?.appointments.length ? (
                    <EmptyState
                      compact
                      icon={CalendarDays}
                      title="La prima seduta deve ancora arrivare"
                      description="Quando prenoterai un appuntamento, lo ritroverai anche qui."
                    />
                  ) : (
                    <div className="mt-5 divide-y">
                      {data.appointments.map((a) => (
                        <div key={a.id} className="py-4">
                          <div className="flex justify-between gap-3">
                            <div>
                              <p className="text-sm font-semibold">
                                {a.service_name}
                              </p>
                              <p className="mt-1 text-sm text-muted-foreground">
                                {formatDate(a.starts_at, undefined, {
                                  year: "numeric",
                                })}
                                , {formatTime(a.starts_at)}
                              </p>
                            </div>
                            <span className="data-number text-sm font-medium">
                              {money(a.price_cents)}
                            </span>
                          </div>
                          <div className="mt-3 flex flex-wrap items-center gap-3">
                            <Badge variant="secondary">
                              {statusLabels[a.status as AppointmentStatus]}
                            </Badge>
                            <span className="flex items-center gap-1 text-xs text-muted-foreground">
                              <MapPin className="size-3" />
                              {a.location.name}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
                {profile.role === "owner" && (
                  <div className="mx-7 mb-8 border-t pt-6">
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="ghost"
                          className="text-muted-foreground"
                          disabled={archive.isPending}
                        >
                          {client.archived_at ? <RotateCcw /> : <Archive />}
                          {client.archived_at
                            ? "Riattiva cliente"
                            : "Archivia cliente"}
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>
                            {client.archived_at
                              ? "Riattivare questa cliente?"
                              : "Archiviare questa cliente?"}
                          </AlertDialogTitle>
                          <AlertDialogDescription>
                            {client.archived_at
                              ? "La scheda tornerà tra le clienti attive."
                              : "La cliente uscirà dall’elenco attivo. Lo storico resterà disponibile; prima occorre gestire eventuali appuntamenti futuri."}
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Annulla</AlertDialogCancel>
                          <AlertDialogAction onClick={() => archive.mutate()}>
                            {client.archived_at ? "Riattiva" : "Archivia"}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                )}
              </div>
            )
          )}
        </SheetContent>
      </Sheet>
      {editing && client && (
        <ClientEditor client={client} onClose={() => setEditing(false)} />
      )}
    </>
  );
}
