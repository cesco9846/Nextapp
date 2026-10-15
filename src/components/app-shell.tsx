"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useContext } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarDays,
  ChevronDown,
  Layers2,
  LogOut,
  Settings2,
  UsersRound,
} from "lucide-react";
import { api, RequestError } from "@/lib/api";
import type { Workspace } from "@/lib/types";
import { initials } from "@/lib/dates";
import { browserSupabase } from "@/lib/supabase/browser";
import { Brand } from "./brand";
import { ConnectivityNotice } from "./connectivity-notice";
import { ErrorState } from "./states";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const Context = createContext<Workspace | null>(null);
export function useWorkspace() {
  const value = useContext(Context);
  if (!value) throw new Error("Workspace context required");
  return value;
}
const navigation = [
  { href: "/app/agenda", title: "Agenda", icon: CalendarDays },
  { href: "/app/clienti", title: "Clienti", icon: UsersRound },
  { href: "/app/catalogo", title: "Servizi e sedi", icon: Layers2 },
  { href: "/app/impostazioni", title: "Il tuo studio", icon: Settings2 },
];
export function AppShell({
  initial,
  children,
}: {
  initial: Workspace;
  children: React.ReactNode;
}) {
  const path = usePathname();
  const navigationPath =
    path.startsWith("/app/team") || path.startsWith("/app/documenti")
      ? "/app/impostazioni"
      : path.startsWith("/app/appuntamenti")
        ? "/app/agenda"
        : path;
  const queryClient = useQueryClient();
  const { data, error, refetch } = useQuery({
    queryKey: ["workspace"],
    queryFn: () => api<Workspace>("/api/workspace"),
    initialData: initial,
    refetchInterval: 15000,
  });
  async function logout() {
    await browserSupabase().auth.signOut();
    queryClient.clear();
    window.location.replace(new URL("/accedi", window.location.origin).href);
  }
  const currentTitle = path.startsWith("/app/team")
    ? "Team"
    : path.startsWith("/app/documenti")
      ? "Consensi e pigmenti"
      : path.startsWith("/app/appuntamenti")
        ? "Preparazione trattamento"
        : (navigation.find((n) => path.startsWith(n.href))?.title ?? "Studio");
  const accessError =
    error instanceof RequestError && [401, 403].includes(error.status);
  return (
    <Context.Provider value={data}>
      <a
        href="#contenuto"
        className="sr-only z-50 focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:rounded-lg focus:bg-white focus:p-3"
      >
        Vai al contenuto
      </a>
      <aside className="app-sidebar fixed inset-y-0 left-0 z-30 hidden w-[232px] flex-col border-r border-[#dce6de] px-5 py-7 lg:flex">
        <Link
          href="/app/agenda"
          className="px-2"
          aria-label="Glow, apri l’agenda"
        >
          <Brand />
        </Link>
        <div className="mt-9 flex items-center gap-3 rounded-xl border border-[#d9e4dc] bg-[#f6f9f6] p-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[#dae9df] text-primary">
            <Layers2 className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{data.tenant.name}</p>
            <p className="mt-0.5 text-xs text-[#5a7463]">
              Il tuo spazio di lavoro
            </p>
          </div>
        </div>
        <nav aria-label="Navigazione principale" className="mt-7 space-y-1.5">
          {navigation.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className="nav-link"
              data-active={navigationPath.startsWith(n.href)}
              aria-current={
                navigationPath.startsWith(n.href) ? "page" : undefined
              }
            >
              <n.icon className="size-[19px]" strokeWidth={1.65} />
              {n.title}
            </Link>
          ))}
        </nav>
        <div className="mt-9 border-t border-[#d5e2d8] pt-5">
          <p className="mb-3 px-3 text-xs font-medium text-[#5a7463]">
            Le tue sedi
          </p>
          <div className="space-y-1">
            {data.locations
              .filter((l) => l.active)
              .map((l) => (
                <Link
                  href={`/app/agenda?sede=${l.id}`}
                  key={l.id}
                  className="flex min-h-10 items-center gap-3 rounded-lg px-3 text-sm text-[#4d6757] hover:bg-[#e2ebe4]"
                >
                  <span
                    className="size-2 rounded-full"
                    style={{ background: l.color }}
                  />
                  <span className="truncate">{l.name}</span>
                </Link>
              ))}
          </div>
        </div>
        <div className="mt-auto px-3 pt-8">
          <div className="mb-3 h-px w-8 bg-[#a7bcae]" />
          <p className="text-sm leading-relaxed text-[#526d5c]">
            Più spazio alle persone.
            <br />
            <span className="text-[#6a8172]">Un appuntamento alla volta.</span>
          </p>
        </div>
      </aside>
      <div className="min-h-screen pb-24 lg:ml-[232px] lg:pb-0">
        <header className="flex h-[76px] items-center justify-between border-b bg-white px-5 md:px-8 lg:px-10">
          <div className="lg:hidden">
            <Brand />
          </div>
          <p className="hidden text-sm font-medium text-muted-foreground lg:block">
            Il tuo studio <span className="mx-2 text-[#a8b6ad]">/</span>
            <span className="text-foreground">{currentTitle}</span>
          </p>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                className="gap-2.5 px-1.5"
                aria-label={`Apri menu di ${data.profile.display_name}`}
              >
                <Avatar className="size-8">
                  <AvatarFallback className="bg-[#e7efea] text-xs font-semibold text-[#3c634d]">
                    {initials(
                      data.profile.display_name.split(" ")[0],
                      data.profile.display_name.split(" ")[1],
                    )}
                  </AvatarFallback>
                </Avatar>
                <span className="hidden text-sm font-medium sm:block">
                  {data.profile.display_name}
                </span>
                <ChevronDown className="size-3.5 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>
                {data.profile.display_name}
                <span className="mt-1 block text-xs font-normal text-muted-foreground">
                  {data.profile.role === "owner"
                    ? "Titolare dello studio"
                    : "Operatrice"}
                </span>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/app/impostazioni">
                  <Settings2 />
                  Il tuo studio
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={logout}>
                <LogOut />
                Esci dal tuo account
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>
        <main id="contenuto">
          <ConnectivityNotice />
          {error && !accessError && (
            <div
              role="alert"
              className="flex flex-wrap items-center justify-between gap-3 border-b bg-secondary px-5 py-3 text-sm md:px-8"
            >
              <p>
                Non è stato possibile aggiornare lo studio. I dati già aperti
                potrebbero non essere aggiornati; i campi compilati sono
                conservati.
              </p>
              <Button variant="outline" onClick={() => void refetch()}>
                Riprova aggiornamento
              </Button>
            </div>
          )}
          {accessError ? (
            <ErrorState error={error} retry={() => void refetch()} />
          ) : (
            children
          )}
        </main>
      </div>
      <nav
        aria-label="Navigazione mobile"
        className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t bg-white px-2 pb-[max(12px,env(safe-area-inset-bottom))] pt-2 lg:hidden"
      >
        {navigation.map((n) => (
          <Link
            key={n.href}
            href={n.href}
            aria-current={
              navigationPath.startsWith(n.href) ? "page" : undefined
            }
            className={`flex min-h-12 flex-col items-center justify-center gap-1 rounded-lg px-1 text-[11px] font-medium ${navigationPath.startsWith(n.href) ? "bg-secondary text-primary" : "text-muted-foreground"}`}
          >
            <n.icon className="size-5" strokeWidth={1.75} />
            {n.title}
          </Link>
        ))}
      </nav>
    </Context.Provider>
  );
}
