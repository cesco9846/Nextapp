"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  LoaderCircle,
  MapPin,
  Paintbrush,
  UserRound,
} from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function OnboardingForm() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    const fd = new FormData(event.currentTarget);
    try {
      await api("/api/workspace", {
        method: "POST",
        body: JSON.stringify({
          name: fd.get("name"),
          display_name: fd.get("display_name"),
          location: fd.get("location"),
          service: fd.get("service"),
          duration: Number(fd.get("duration")),
          price: Math.round(Number(fd.get("price")) * 100),
        }),
      });
      router.replace("/app/agenda");
      router.refresh();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Non è stato possibile configurare lo studio.",
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <form onSubmit={submit} className="mt-8 space-y-7">
      <section className="space-y-4">
        <h2 className="flex items-center gap-2 text-base">
          <UserRound className="size-4 text-primary" />
          Il tuo spazio di lavoro
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="field">
            <Label htmlFor="display_name">Il tuo nome</Label>
            <Input
              name="display_name"
              id="display_name"
              required
              minLength={2}
              maxLength={100}
              autoComplete="name"
            />
          </div>
          <div className="field">
            <Label htmlFor="name">Nome dello studio</Label>
            <Input
              name="name"
              id="name"
              required
              minLength={2}
              maxLength={100}
              placeholder="Il nome della tua attività"
            />
          </div>
        </div>
      </section>
      <section className="space-y-4">
        <h2 className="flex items-center gap-2 text-base">
          <MapPin className="size-4 text-primary" />
          La prima sede
        </h2>
        <div className="field">
          <Label htmlFor="location">Nome della sede</Label>
          <Input
            name="location"
            id="location"
            required
            minLength={2}
            maxLength={100}
            placeholder="Per esempio: Studio centro"
          />
        </div>
        <p className="text-xs text-muted-foreground">
          Potrai aggiungere altre sedi quando vuoi.
        </p>
      </section>
      <section className="space-y-4">
        <h2 className="flex items-center gap-2 text-base">
          <Paintbrush className="size-4 text-primary" />
          Il primo servizio
        </h2>
        <div className="field">
          <Label htmlFor="service">Nome del servizio</Label>
          <Input
            name="service"
            id="service"
            required
            minLength={2}
            maxLength={100}
            placeholder="Per esempio: Consulenza iniziale"
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="field">
            <Label htmlFor="duration">Durata in minuti</Label>
            <Input
              name="duration"
              id="duration"
              type="number"
              defaultValue={60}
              min={5}
              max={1440}
              required
            />
          </div>
          <div className="field">
            <Label htmlFor="price">Prezzo in euro</Label>
            <Input
              name="price"
              id="price"
              type="number"
              defaultValue={0}
              min={0}
              max={1000000}
              step="0.01"
              required
            />
          </div>
        </div>
      </section>
      {error && (
        <p role="alert" className="field-error rounded-lg bg-red-50 p-4">
          {error}
        </p>
      )}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? <LoaderCircle className="animate-spin" /> : null}Apri la mia
        agenda
        <ArrowRight className="ml-auto" />
      </Button>
    </form>
  );
}
