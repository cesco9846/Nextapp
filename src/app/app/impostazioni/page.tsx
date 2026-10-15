"use client";
import Link from "next/link";
import { Building2, Globe2, KeyRound, UserRound } from "lucide-react";
import { useWorkspace } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { InstallApp } from "@/components/install-app";

export default function SettingsPage() {
  const { tenant, profile, operators } = useWorkspace();
  return (
    <div className="page-container max-w-5xl">
      <h1 className="text-[32px]">Il tuo studio</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Le informazioni del tuo spazio di lavoro e del tuo account.
      </p>
      <section className="mt-8 rounded-xl border bg-white p-6 sm:p-8">
        <h2 className="flex items-center gap-3 text-xl">
          <Building2 className="size-5 text-primary" />
          {tenant.name}
        </h2>
        <dl className="mt-6 grid gap-6 sm:grid-cols-3">
          <div>
            <dt className="text-xs text-muted-foreground">Fuso orario</dt>
            <dd className="mt-2 flex items-center gap-2 text-sm font-medium">
              <Globe2 className="size-4 text-muted-foreground" />
              {tenant.timezone}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Valuta</dt>
            <dd className="mt-2 text-sm font-medium">Euro (EUR)</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Lingua dell’app</dt>
            <dd className="mt-2 text-sm font-medium">Italiano</dd>
          </div>
        </dl>
        <Button variant="outline" asChild className="mt-7">
          <Link href="/app/catalogo">Gestisci servizi e sedi</Link>
        </Button>
      </section>
      {profile.role === "owner" && (
        <div className="mt-6">
          <Button variant="outline" asChild>
            <Link href="/app/riepilogo">Consulta il valore delle sedute</Link>
          </Button>
          <Button
            variant="outline"
            asChild
            className="ml-0 mt-3 sm:ml-3 sm:mt-0"
          >
            <Link href="/app/team">Gestisci il team</Link>
          </Button>
        </div>
      )}
      <section className="mt-6 rounded-xl border bg-white p-6 sm:p-8">
        <h2 className="flex items-center gap-3 text-xl">
          <UserRound className="size-5 text-primary" />
          Il tuo account
        </h2>
        <div className="mt-6 flex flex-wrap items-center justify-between gap-5">
          <div>
            <p className="font-semibold">{profile.display_name}</p>
            <Badge variant="secondary" className="mt-2">
              {profile.role === "owner" ? "Titolare" : "Operatrice"}
            </Badge>
          </div>
          <Button variant="outline" asChild>
            <Link href="/nuova-password">
              <KeyRound />
              Aggiorna password
            </Link>
          </Button>
        </div>
      </section>
      {operators.length > 1 && (
        <section className="mt-6 rounded-xl border bg-white p-6 sm:p-8">
          <h2 className="text-xl">Le persone del tuo studio</h2>
          <div className="mt-4 divide-y">
            {operators.map((o) => (
              <div
                key={o.id}
                className="flex justify-between gap-4 py-4 text-sm"
              >
                <span className="font-medium">{o.display_name}</span>
                <span className="text-muted-foreground">
                  {o.role === "owner" ? "Titolare" : "Operatrice"}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
      {(profile.role === "owner" || profile.clinical_access) && (
        <section className="mt-6 border-t pt-6">
          <h2 className="text-xl">Prima del trattamento</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Modelli di consenso e anamnesi, pigmenti e lotti con etichette
            private.
          </p>
          <Button variant="outline" asChild className="mt-4">
            <Link href="/app/documenti">Consensi e pigmenti</Link>
          </Button>
        </section>
      )}
      <InstallApp />
    </div>
  );
}
