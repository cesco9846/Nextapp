"use client";
import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
export function PrivatePhoto({ id, alt }: { id: string; alt: string }) {
  const active = useRef<AbortController | null>(null);
  useEffect(() => () => active.current?.abort(), []);
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!url) return;
    const hide = () => {
      if (document.hidden) setUrl("");
    };
    const timer = setTimeout(() => setUrl(""), 60000);
    document.addEventListener("visibilitychange", hide);
    return () => {
      URL.revokeObjectURL(url);
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", hide);
    };
  }, [url]);
  return (
    <div className="flex min-h-48 flex-col items-center justify-center bg-muted/40 p-3">
      {url ? (
        <>
          <Image
            src={url}
            alt={alt}
            width={2400}
            height={2400}
            unoptimized
            className="max-h-[60dvh] w-full object-contain"
          />
          <Button variant="ghost" className="mt-2" onClick={() => setUrl("")}>
            Nascondi foto
          </Button>
        </>
      ) : (
        <Button
          variant="outline"
          disabled={busy}
          onClick={async () => {
            active.current?.abort();
            const controller = new AbortController();
            active.current = controller;
            setBusy(true);
            setError("");
            try {
              const r = await fetch(`/api/photos/${id}/read`, {
                method: "POST",
                signal: controller.signal,
                cache: "no-store",
                headers: { "Content-Type": "application/json" },
                body: "{}",
              });
              if (!r.ok)
                throw new Error(
                  "Foto non disponibile. Verifica la connessione e i permessi, poi riprova.",
                );
              const blob = await r.blob();
              if (!controller.signal.aborted && !document.hidden)
                setUrl(URL.createObjectURL(blob));
            } catch (e) {
              setError(
                e instanceof Error ? e.message : "Apertura non riuscita.",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Apertura…" : "Mostra foto"}
        </Button>
      )}
      {error && (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
