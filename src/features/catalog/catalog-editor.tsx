"use client";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import type { Location, Service } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function CatalogEditor({
  kind,
  entry,
  onClose,
}: {
  kind: "services" | "locations";
  entry?: Service | Location;
  onClose: () => void;
}) {
  const services = kind === "services";
  const service = entry && "price_cents" in entry ? entry : undefined;
  const query = useQueryClient();
  const [color, setColor] = useState(entry?.color ?? "#28664f");
  const [active, setActive] = useState(entry?.active ?? true);
  const mutation = useMutation({
    mutationFn: (form: FormData) => {
      const data = {
        name: form.get("name"),
        color,
        ...(entry ? { active } : {}),
        ...(services
          ? {
              duration_minutes: Number(form.get("duration")),
              price_cents: Math.round(Number(form.get("price")) * 100),
            }
          : { address: String(form.get("address") ?? "") }),
      };
      return api(`/api/${kind}${entry ? `/${entry.id}` : ""}`, {
        method: entry ? "PATCH" : "POST",
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      void query.invalidateQueries({ queryKey: ["workspace"] });
      toast.success(services ? "Servizio salvato" : "Sede salvata");
      onClose();
    },
  });
  return (
    <Dialog
      open
      onOpenChange={(v) => {
        if (!v && !mutation.isPending) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="text-2xl">
            {entry ? "Modifica" : "Aggiungi"} {services ? "servizio" : "sede"}
          </DialogTitle>
          <DialogDescription>
            {services
              ? "Prezzo e durata verranno proposti per le nuove prenotazioni. Lo storico resterà invariato."
              : "Un luogo in cui accogliere le tue clienti."}
          </DialogDescription>
        </DialogHeader>
        <form
          className="mt-3 space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            mutation.mutate(new FormData(e.currentTarget));
          }}
        >
          <div className="field">
            <Label htmlFor="catalog-name">
              Nome {services ? "del servizio" : "della sede"}
            </Label>
            <Input
              id="catalog-name"
              name="name"
              defaultValue={entry?.name}
              required
              minLength={2}
              maxLength={100}
            />
          </div>
          {services ? (
            <div className="grid grid-cols-2 gap-4">
              <div className="field">
                <Label htmlFor="catalog-duration">Durata in minuti</Label>
                <Input
                  id="catalog-duration"
                  name="duration"
                  type="number"
                  min={5}
                  max={1440}
                  defaultValue={service?.duration_minutes ?? 60}
                  required
                />
              </div>
              <div className="field">
                <Label htmlFor="catalog-price">Prezzo in euro</Label>
                <Input
                  id="catalog-price"
                  name="price"
                  type="number"
                  min={0}
                  max={1000000}
                  step="0.01"
                  defaultValue={(service?.price_cents ?? 0) / 100}
                  required
                />
              </div>
            </div>
          ) : (
            <div className="field">
              <Label htmlFor="catalog-address">Indirizzo</Label>
              <Textarea
                id="catalog-address"
                name="address"
                defaultValue={entry && "address" in entry ? entry.address : ""}
                maxLength={300}
                rows={2}
                placeholder="Via e numero civico, città"
              />
            </div>
          )}
          <fieldset>
            <legend className="mb-3 text-sm font-medium">
              Colore nell’agenda
            </legend>
            <div className="flex flex-wrap gap-2">
              {[
                "#28664f",
                "#71618d",
                "#a96e55",
                "#467e9b",
                "#a78135",
                "#ad607b",
              ].map((value) => (
                <Button
                  type="button"
                  key={value}
                  variant="outline"
                  size="icon"
                  aria-label={`Scegli colore ${value}`}
                  aria-pressed={color === value}
                  onClick={() => setColor(value)}
                  className={
                    color === value ? "ring-2 ring-primary ring-offset-2" : ""
                  }
                >
                  <span
                    className="size-6 rounded-full"
                    style={{ background: value }}
                  />
                </Button>
              ))}
            </div>
          </fieldset>
          {entry && (
            <div className="flex items-center gap-3 rounded-lg bg-muted p-3">
              <Checkbox
                id="catalog-active"
                checked={active}
                onCheckedChange={(v) => setActive(v === true)}
              />
              <Label htmlFor="catalog-active">
                Disponibile per nuove prenotazioni
              </Label>
            </div>
          )}
          {mutation.error && (
            <p role="alert" className="field-error">
              {mutation.error.message}
            </p>
          )}
          <div className="flex justify-end gap-3 border-t pt-5">
            <Button
              type="button"
              variant="outline"
              disabled={mutation.isPending}
              onClick={onClose}
            >
              Annulla
            </Button>
            <Button disabled={mutation.isPending}>
              {mutation.isPending && <LoaderCircle className="animate-spin" />}
              Salva {services ? "servizio" : "sede"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
