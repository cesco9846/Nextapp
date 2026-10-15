import { Brand } from "@/components/brand";
import { AuthForm } from "@/components/auth-form";
import { CalendarDays, MapPin, UsersRound } from "lucide-react";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ errore?: string }>;
}) {
  const { errore } = await searchParams;
  return (
    <main className="grid min-h-screen lg:grid-cols-[0.95fr_1.05fr]">
      <section className="relative hidden flex-col justify-between overflow-hidden bg-[#edf3ef] px-14 py-12 lg:flex xl:px-20">
        <Brand />
        <div className="relative z-10 my-16 max-w-md">
          <h2 className="display-title text-[52px] leading-[1.1]">
            Ogni seduta,
            <br />
            il suo spazio.
          </h2>
          <p className="mt-6 max-w-[32ch] text-lg leading-relaxed text-[#4b6758]">
            Un’agenda chiara per dedicare più attenzione alle persone che scegli
            di seguire.
          </p>
          <div className="mt-12 space-y-5 text-sm font-medium text-[#345a45]">
            <p className="flex items-center gap-3">
              <CalendarDays className="size-5" strokeWidth={1.5} />
              La giornata, a colpo d’occhio
            </p>
            <p className="flex items-center gap-3">
              <UsersRound className="size-5" strokeWidth={1.5} />
              Le tue clienti, sempre ritrovabili
            </p>
            <p className="flex items-center gap-3">
              <MapPin className="size-5" strokeWidth={1.5} />
              Tutte le sedi in cui lavori
            </p>
          </div>
        </div>
        <p className="text-sm text-[#597363]">
          Pensato per il ritmo del tuo lavoro.
        </p>
        <div
          className="pointer-events-none absolute -bottom-28 -right-24 size-96 rounded-full border-[40px] border-[#dae8dc]"
          aria-hidden="true"
        />
      </section>
      <section className="flex flex-col px-6 py-8 sm:px-12">
        <div className="lg:hidden">
          <Brand />
        </div>
        <div className="flex flex-1 items-center justify-center py-12">
          <AuthForm
            initialError={
              errore === "collegamento"
                ? "Il collegamento di conferma è scaduto o non è valido. Accedi oppure richiedi un nuovo recupero password."
                : ""
            }
          />
        </div>
        <p className="text-center text-xs text-muted-foreground">
          Glow · Il tuo studio, in ordine
        </p>
      </section>
    </main>
  );
}
