"use client";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import type { Client } from "@/lib/types";
import { clientSchema } from "@/lib/contracts";
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

export function ClientEditor({
  client,
  onClose,
  onSaved,
}: {
  client?: Client;
  onClose: () => void;
  onSaved?: (client: Client) => void;
}) {
  const query = useQueryClient();
  const [validation, setValidation] = useState("");
  const mutation = useMutation({
    mutationFn: (values: Record<string, FormDataEntryValue>) =>
      api<Client>(client ? `/api/clients/${client.id}` : "/api/clients", {
        method: client ? "PATCH" : "POST",
        body: JSON.stringify({
          ...values,
          ...(client ? { version: client.version } : {}),
        }),
      }),
    onSuccess: (result) => {
      void query.invalidateQueries({ queryKey: ["clients"] });
      void query.invalidateQueries({ queryKey: ["client"] });
      void query.invalidateQueries({ queryKey: ["appointments"] });
      toast.success(client ? "Cliente aggiornata" : "Cliente aggiunta");
      onSaved?.(result);
      onClose();
    },
  });
  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    const parsed = clientSchema.safeParse(values);
    if (!parsed.success) {
      setValidation(parsed.error.issues[0].message);
      return;
    }
    setValidation("");
    mutation.mutate(values);
  }
  return (
    <Dialog
      open
      onOpenChange={(v) => {
        if (!v && !mutation.isPending) onClose();
      }}
    >
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle className="text-2xl">
            {client ? "Modifica cliente" : "Una nuova cliente"}
          </DialogTitle>
          <DialogDescription>
            I contatti per ritrovarla e organizzare i suoi appuntamenti.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="mt-4 space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div className="field">
              <Label htmlFor="first_name">Nome</Label>
              <Input
                id="first_name"
                name="first_name"
                defaultValue={client?.first_name}
                maxLength={100}
                required
                autoComplete="given-name"
              />
            </div>
            <div className="field">
              <Label htmlFor="last_name">Cognome</Label>
              <Input
                id="last_name"
                name="last_name"
                defaultValue={client?.last_name}
                maxLength={100}
                required
                autoComplete="family-name"
              />
            </div>
          </div>
          <div className="field">
            <Label htmlFor="client_email">
              Email{" "}
              <span className="font-normal text-muted-foreground">
                (facoltativa)
              </span>
            </Label>
            <Input
              id="client_email"
              name="email"
              type="email"
              maxLength={254}
              defaultValue={client?.email ?? ""}
              placeholder="nome@email.it"
              autoComplete="email"
            />
          </div>
          <div className="field">
            <Label htmlFor="phone">
              Telefono{" "}
              <span className="font-normal text-muted-foreground">
                (facoltativo)
              </span>
            </Label>
            <Input
              id="phone"
              name="phone"
              type="tel"
              defaultValue={client?.phone ?? ""}
              placeholder="+39 333 123 4567"
              autoComplete="tel"
            />
            <p className="text-xs leading-relaxed text-muted-foreground">
              Aggiungilo per aprire la chat WhatsApp dall’appuntamento.
            </p>
          </div>
          {(validation || mutation.error) && (
            <p role="alert" className="field-error">
              {validation || mutation.error?.message}
            </p>
          )}
          <div className="flex justify-end gap-3 border-t pt-5">
            <Button
              variant="outline"
              type="button"
              onClick={onClose}
              disabled={mutation.isPending}
            >
              Annulla
            </Button>
            <Button disabled={mutation.isPending}>
              {mutation.isPending && <LoaderCircle className="animate-spin" />}
              {client ? "Salva modifiche" : "Salva cliente"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
