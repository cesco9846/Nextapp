"use client";
import { WifiOff } from "lucide-react";
import { useOnline } from "@/lib/connectivity";

export function ConnectivityNotice() {
  const online = useOnline();
  if (online) return null;
  return (
    <div
      role="alert"
      className="flex items-start gap-3 border-b border-[#d9c496] bg-[#fff5df] px-5 py-4 text-sm text-[#624b22] md:px-8"
    >
      <WifiOff className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
      <div>
        <p className="font-semibold">Connessione assente</p>
        <p className="mt-1">
          Glow richiede Internet. I dati già aperti potrebbero non essere
          aggiornati. Riconnettiti e riprova: le modifiche non vengono messe in
          coda.
        </p>
      </div>
    </div>
  );
}
