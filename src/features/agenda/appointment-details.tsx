"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  CalendarDays,
  Check,
  Clock3,
  MapPin,
  MessageCircle,
  Pencil,
  UserRound,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { formatDate, formatTime, money, whatsappUrl } from "@/lib/dates";
import { statusLabels, type AppointmentStatus } from "@/lib/contracts";
import type { Appointment } from "@/lib/types";
import { useWorkspace } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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

export function AppointmentDetails({
  appointment: a,
  onClose,
  onEdit,
}: {
  appointment: Appointment;
  onClose: () => void;
  onEdit: () => void;
}) {
  const { profile, tenant } = useWorkspace();
  const query = useQueryClient();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60000);
    return () => window.clearInterval(timer);
  }, []);
  const terminal = ["cancelled", "completed", "no_show"].includes(a.status);
  const editable =
    !terminal && (profile.role === "owner" || profile.id === a.operator_id);
  const mutation = useMutation({
    mutationFn: (status: AppointmentStatus) =>
      api(`/api/appointments/${a.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status, version: a.version }),
      }),
    onSuccess: () => {
      void query.invalidateQueries({ queryKey: ["appointments"] });
      void query.invalidateQueries({ queryKey: ["client"] });
      toast.success("Appuntamento aggiornato");
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });
  const message = `Ciao ${a.client.first_name}, ti ricordiamo il tuo appuntamento con ${tenant.name} il ${formatDate(a.starts_at, tenant.timezone)} alle ${formatTime(a.starts_at, tenant.timezone)} presso ${a.location.name}. Per qualsiasi cambiamento, scrivici qui. A presto!`;
  const whatsapp = a.client.phone ? whatsappUrl(a.client.phone, message) : null;
  return (
    <Sheet
      open
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <SheetContent className="w-full overflow-y-auto p-0 sm:max-w-[470px]">
        <SheetHeader className="border-b bg-[#f0f5f1] px-7 pb-7 pt-12">
          <Badge variant="secondary" className="w-fit bg-white text-primary">
            {statusLabels[a.status]}
          </Badge>
          <SheetTitle className="mt-4 text-3xl">
            {a.client.first_name} {a.client.last_name}
          </SheetTitle>
          <SheetDescription className="text-base text-[#536d5d]">
            {a.service_name}
          </SheetDescription>
        </SheetHeader>
        <div className="space-y-7 p-7">
          <div className="space-y-5">
            <p className="flex items-center gap-3 text-sm">
              <CalendarDays className="size-4 text-muted-foreground" />
              <span className="capitalize">
                {formatDate(a.starts_at, tenant.timezone, {
                  weekday: "long",
                  year: "numeric",
                })}
              </span>
            </p>
            <p className="flex items-center gap-3 text-sm">
              <Clock3 className="size-4 text-muted-foreground" />
              {formatTime(a.starts_at, tenant.timezone)} –{" "}
              {formatTime(a.ends_at, tenant.timezone)}
              <span className="ml-auto text-muted-foreground">
                {Math.round(
                  (new Date(a.ends_at).getTime() -
                    new Date(a.starts_at).getTime()) /
                    60000,
                )}{" "}
                min
              </span>
            </p>
            <p className="flex items-center gap-3 text-sm">
              <MapPin className="size-4 text-muted-foreground" />
              {a.location.name}
            </p>
            <p className="flex items-center gap-3 text-sm">
              <UserRound className="size-4 text-muted-foreground" />
              {a.operator.display_name}
            </p>
          </div>
          <div className="flex items-center justify-between border-y py-5">
            <span className="text-sm text-muted-foreground">
              Prezzo della seduta
            </span>
            <span className="data-number text-xl font-semibold">
              {money(a.price_cents)}
            </span>
          </div>
          <section>
            <h3 className="text-lg">Ricorda l’appuntamento</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Apri la chat con un messaggio già pronto. Sarai tu a inviarlo da
              WhatsApp.
            </p>
            {whatsapp ? (
              <Button
                variant="outline"
                asChild
                className="mt-4 w-full border-[#c8ddcf] bg-[#f4f9f5] text-primary"
              >
                <a href={whatsapp} target="_blank" rel="noopener noreferrer">
                  <MessageCircle />
                  Apri WhatsApp
                </a>
              </Button>
            ) : (
              <p className="mt-3 rounded-lg bg-muted p-3 text-sm text-muted-foreground">
                Aggiungi il telefono nella scheda cliente per aprire WhatsApp.
              </p>
            )}
            <p className="mt-4 text-xs text-muted-foreground">
              Promemoria email automatici non attivi.
            </p>
          </section>
          {(profile.role === "owner" || profile.clinical_access) && (
            <section className="border-t pt-6">
              <h3 className="text-lg">Prima del trattamento</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Modelli, anamnesi e lotti scelti per questa seduta.
              </p>
              <Button variant="outline" asChild className="mt-4 w-full">
                <Link href={`/app/appuntamenti/${a.id}/preparazione`}>
                  Apri preparazione
                </Link>
              </Button>
            </section>
          )}
          {editable && (
            <div className="space-y-3 border-t pt-6">
              <Button variant="outline" className="w-full" onClick={onEdit}>
                <Pencil />
                Modifica appuntamento
              </Button>
              {a.status === "booked" && (
                <Button
                  className="w-full"
                  disabled={mutation.isPending}
                  onClick={() => mutation.mutate("confirmed")}
                >
                  <Check />
                  Segna come confermato
                </Button>
              )}
              {new Date(a.starts_at).getTime() <= now && (
                <div className="grid grid-cols-2 gap-3">
                  <Button
                    variant="secondary"
                    disabled={mutation.isPending}
                    onClick={() => mutation.mutate("completed")}
                  >
                    Completato
                  </Button>
                  <Button
                    variant="outline"
                    disabled={mutation.isPending}
                    onClick={() => mutation.mutate("no_show")}
                  >
                    Non presentata
                  </Button>
                </div>
              )}
            </div>
          )}
          {editable && (
            <div className="border-t pt-6">
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="ghost"
                    className="w-full text-destructive"
                    disabled={mutation.isPending}
                  >
                    <X />
                    Annulla appuntamento
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>
                      Annullare questo appuntamento?
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                      Lo slot tornerà libero. L’appuntamento resterà nello
                      storico della cliente.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Mantieni appuntamento</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => mutation.mutate("cancelled")}
                      className="bg-destructive hover:bg-destructive/90"
                    >
                      Annulla appuntamento
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
