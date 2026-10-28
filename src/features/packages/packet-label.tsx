"use client";
import Image from "next/image";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useOnline } from "@/lib/connectivity";
export function PacketLabel({
  token,
  id,
}: {
  token: () => string;
  id: string;
}) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const online = useOnline();
  useEffect(() => {
    if (!url) return;
    const clear = () => setUrl("");
    const hidden = () => {
      if (document.hidden) clear();
    };
    const timer = setTimeout(clear, 60000);
    document.addEventListener("visibilitychange", hidden);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", hidden);
      URL.revokeObjectURL(url);
    };
  }, [url]);
  return (
    <div className="mt-3">
      <Button
        type="button"
        variant="outline"
        disabled={!online || busy}
        onClick={async () => {
          if (url) {
            setUrl("");
            return;
          }
          setBusy(true);
          setError("");
          try {
            const r = await fetch("/api/packets/label", {
              method: "POST",
              credentials: "omit",
              cache: "no-store",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ token: token(), id }),
            });
            if (!r.ok)
              throw Error(
                "Etichetta non disponibile. Chiedi allo studio di verificarla prima di firmare.",
              );
            setUrl(URL.createObjectURL(await r.blob()));
          } catch (e) {
            setError(e instanceof Error ? e.message : "Apertura non riuscita.");
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Apertura…" : url ? "Chiudi etichetta" : "Visualizza etichetta"}
      </Button>
      {url && (
        <Image
          src={url}
          unoptimized
          width={1600}
          height={1000}
          alt="Etichetta del lotto scelto per questo trattamento"
          className="mt-4 max-h-80 w-full rounded-lg border object-contain"
        />
      )}
      {error && (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
