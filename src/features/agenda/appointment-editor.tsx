"use client";
import { useDeferredValue, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronDown, LoaderCircle, Plus } from "lucide-react";
import { toast } from "sonner";
import { useWorkspace } from "@/components/app-shell";
import { ClientEditor } from "@/components/client-editor";
import { FormSelect } from "@/components/form-select";
import { api } from "@/lib/api";
import { addMinutes, instantToLocal, localToInstant } from "@/lib/dates";
import type { Appointment, Client, ClientPage } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

export function AppointmentEditor({
  appointment,
  initialDate,
  initialClient,
  onClose,
}: {
  appointment?: Appointment;
  initialDate?: string;
  initialClient?: Client;
  onClose: () => void;
}) {
  const workspace = useWorkspace();
  const query = useQueryClient();
  const [client, setClient] = useState<
    Pick<Client, "id" | "first_name" | "last_name"> | undefined
  >(appointment?.client ?? initialClient);
  const [service, setService] = useState(
    appointment?.service_id ??
      workspace.services.find((s) => s.active)?.id ??
      "",
  );
  const [location, setLocation] = useState(
    appointment?.location_id ??
      workspace.locations.find((l) => l.active)?.id ??
      "",
  );
  const [operator, setOperator] = useState(
    appointment?.operator_id ?? workspace.profile.id,
  );
  const initialService = workspace.services.find((s) => s.id === service);
  const [duration, setDuration] = useState(
    appointment
      ? (new Date(appointment.ends_at).getTime() -
          new Date(appointment.starts_at).getTime()) /
          60000
      : (initialService?.duration_minutes ?? 60),
  );
  const [price, setPrice] = useState(
    (appointment?.price_cents ?? initialService?.price_cents ?? 0) / 100,
  );
  const [date, setDate] = useState(
    appointment
      ? instantToLocal(appointment.starts_at, workspace.tenant.timezone)
      : (initialDate ??
          instantToLocal(
            addMinutes(new Date().toISOString(), 60),
            workspace.tenant.timezone,
          )),
  );
  const [search, setSearch] = useState("");
  const searchValue = useDeferredValue(search);
  const [picker, setPicker] = useState(false);
  const [newClient, setNewClient] = useState(false);
  const [validation, setValidation] = useState("");
  const [requestKey] = useState(() => crypto.randomUUID());
  const clients = useQuery({
    queryKey: ["clients", "picker", searchValue],
    queryFn: () =>
      api<ClientPage>(`/api/clients?q=${encodeURIComponent(searchValue)}`),
    enabled: !appointment,
  });
  const mutation = useMutation({
    mutationFn: async () => {
      if (!client)
        throw new Error("Scegli la cliente per questo appuntamento.");
      if (!service || !location || !operator)
        throw new Error("Seleziona servizio, sede e operatrice.");
      let starts_at: string;
      try {
        starts_at = localToInstant(date, workspace.tenant.timezone);
      } catch {
        throw new Error(
          "Questo orario non esiste o è ambiguo per il cambio dell’ora. Scegli un altro orario.",
        );
      }
      const common = {
        service_id: service,
        location_id: location,
        operator_id: operator,
        starts_at,
        ends_at: addMinutes(starts_at, duration),
        price_cents: Math.round(price * 100),
      };
      return appointment
        ? api(`/api/appointments/${appointment.id}`, {
            method: "PATCH",
            body: JSON.stringify({ ...common, version: appointment.version }),
          })
        : api("/api/appointments", {
            method: "POST",
            headers: { "Idempotency-Key": requestKey },
            body: JSON.stringify({ ...common, client_id: client.id }),
          });
    },
    onSuccess: () => {
      void query.invalidateQueries({ queryKey: ["appointments"] });
      void query.invalidateQueries({ queryKey: ["client"] });
      toast.success(
        appointment ? "Appuntamento aggiornato" : "Appuntamento prenotato",
      );
      onClose();
    },
  });
  function chooseService(value: string) {
    setService(value);
    const current = workspace.services.find((s) => s.id === value);
    if (current) {
      setDuration(current.duration_minutes);
      setPrice(current.price_cents / 100);
    }
  }
  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setValidation("");
    if (!client) {
      setValidation("Scegli una cliente oppure aggiungila ora.");
      return;
    }
    mutation.mutate();
  }
  return (
    <>
      <Dialog
        open
        onOpenChange={(v) => {
          if (!v && !mutation.isPending) onClose();
        }}
      >
        <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle className="text-2xl">
              {appointment ? "Modifica appuntamento" : "Un nuovo appuntamento"}
            </DialogTitle>
            <DialogDescription>
              Scegli la persona, il servizio e il momento giusto.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submit} className="mt-3 space-y-5">
            <div className="field">
              <Label htmlFor="appointment-client">Cliente</Label>
              {appointment ? (
                <div className="rounded-lg border bg-muted px-3 py-3 text-sm font-medium">
                  {client?.first_name} {client?.last_name}
                </div>
              ) : (
                <Popover open={picker} onOpenChange={setPicker}>
                  <PopoverTrigger asChild>
                    <Button
                      id="appointment-client"
                      variant="outline"
                      role="combobox"
                      aria-expanded={picker}
                      className="justify-between font-normal"
                    >
                      {client
                        ? `${client.first_name} ${client.last_name}`
                        : "Cerca o scegli una cliente"}
                      <ChevronDown className="size-4 text-muted-foreground" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent
                    className="w-[min(460px,calc(100vw-48px))] p-0"
                    align="start"
                  >
                    <Command shouldFilter={false}>
                      <CommandInput
                        placeholder="Cerca per nome o cognome…"
                        value={search}
                        onValueChange={setSearch}
                      />
                      <CommandList>
                        <CommandEmpty>
                          {clients.isFetching
                            ? "Ricerca in corso…"
                            : clients.error
                              ? "Ricerca non riuscita. Riprova."
                              : "Nessuna cliente trovata."}
                        </CommandEmpty>
                        {clients.data?.clients.map((c) => (
                          <CommandItem
                            key={c.id}
                            value={c.id}
                            onSelect={() => {
                              setClient(c);
                              setPicker(false);
                            }}
                          >
                            <span className="flex-1">
                              {c.first_name} {c.last_name}
                            </span>
                            {client?.id === c.id && (
                              <Check className="size-4" />
                            )}
                          </CommandItem>
                        ))}
                      </CommandList>
                      <div className="border-t p-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="w-full justify-start"
                          onClick={() => {
                            setPicker(false);
                            setNewClient(true);
                          }}
                        >
                          <Plus />
                          Aggiungi una cliente
                        </Button>
                      </div>
                    </Command>
                  </PopoverContent>
                </Popover>
              )}
            </div>
            <div className="field">
              <Label htmlFor="appointment-service">Servizio</Label>
              <FormSelect
                id="appointment-service"
                value={service}
                onChange={chooseService}
                options={workspace.services
                  .filter((s) => s.active || s.id === appointment?.service_id)
                  .map((s) => ({ value: s.id, label: s.name }))}
                placeholder="Scegli un servizio"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-[1fr_140px]">
              <div className="field">
                <Label htmlFor="appointment-date">Data e ora</Label>
                <Input
                  type="datetime-local"
                  id="appointment-date"
                  required
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Orario dello studio: {workspace.tenant.timezone}
                </p>
              </div>
              <div className="field">
                <Label htmlFor="appointment-duration">Minuti</Label>
                <Input
                  type="number"
                  id="appointment-duration"
                  required
                  value={duration}
                  min={5}
                  max={1440}
                  onChange={(e) => setDuration(Number(e.target.value))}
                />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="field">
                <Label htmlFor="appointment-location">Sede</Label>
                <FormSelect
                  id="appointment-location"
                  value={location}
                  onChange={setLocation}
                  options={workspace.locations
                    .filter(
                      (l) => l.active || l.id === appointment?.location_id,
                    )
                    .map((l) => ({ value: l.id, label: l.name }))}
                  placeholder="Scegli una sede"
                />
              </div>
              <div className="field">
                <Label htmlFor="appointment-price">Prezzo in euro</Label>
                <Input
                  type="number"
                  id="appointment-price"
                  required
                  min={0}
                  max={1000000}
                  step="0.01"
                  value={price}
                  onChange={(e) => setPrice(Number(e.target.value))}
                />
              </div>
            </div>
            {workspace.operators.length > 1 && (
              <div className="field">
                <Label htmlFor="appointment-operator">Operatrice</Label>
                <FormSelect
                  id="appointment-operator"
                  value={operator}
                  onChange={setOperator}
                  disabled={workspace.profile.role !== "owner"}
                  options={workspace.operators.map((o) => ({
                    value: o.id,
                    label: o.display_name,
                  }))}
                />
              </div>
            )}
            {(validation || mutation.error) && (
              <p className="field-error rounded-lg bg-red-50 p-3" role="alert">
                {validation || mutation.error?.message}
              </p>
            )}
            <div className="flex justify-end gap-3 border-t pt-5">
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                disabled={mutation.isPending}
              >
                Annulla
              </Button>
              <Button disabled={mutation.isPending}>
                {mutation.isPending && (
                  <LoaderCircle className="animate-spin" />
                )}
                {appointment ? "Salva modifiche" : "Prenota appuntamento"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
      {newClient && (
        <ClientEditor
          onClose={() => setNewClient(false)}
          onSaved={(value) => setClient(value)}
        />
      )}
    </>
  );
}
