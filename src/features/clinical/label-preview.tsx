"use client";
import Image from "next/image";
import { useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
export function LabelPreview({ id }: { id: string }) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  async function show() {
    setOpen(true);
    setUrl("");
    setError("");
    setPending(true);
    try {
      const result = await api<{ url: string }>(`/api/files/${id}/read`, {
        method: "POST",
        body: "{}",
      });
      setUrl(result.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Etichetta non disponibile.");
    } finally {
      setPending(false);
    }
  }
  return (
    <>
      <Button type="button" variant="outline" onClick={() => void show()}>
        Apri etichetta
      </Button>
      <Dialog
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) setUrl("");
        }}
      >
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Etichetta del produttore</DialogTitle>
            <DialogDescription>
              Immagine privata del lotto. Chiudi e riapri per aggiornare un
              collegamento scaduto.
            </DialogDescription>
          </DialogHeader>
          {pending && <p role="status">Apertura dell’etichetta…</p>}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          {url && (
            <Image
              src={url}
              alt="Etichetta del lotto selezionato"
              width={1280}
              height={960}
              unoptimized
              className="max-h-[65vh] w-full object-contain"
              onError={() =>
                setError(
                  "Non è stato possibile aprire l’immagine. Chiudi e riprova.",
                )
              }
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
