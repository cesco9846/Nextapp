"use client";
import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Camera, ImagePlus } from "lucide-react";
import { api } from "@/lib/api";
import { browserSupabase } from "@/lib/supabase/browser";
import { photoCategoryLabels, type PhotoCategory } from "@/lib/photos";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { compressPhoto } from "./compress-photo";
type Compressed = Awaited<ReturnType<typeof compressPhoto>>;
type Prepared = {
  photo_id: string;
  id: string;
  bucket: string;
  upload_path: string;
  state: string;
};
type Attempt = {
  request_id: string;
  size_bytes: number;
  sha256: string;
  mime_type: "image/jpeg";
  appointment_id: string;
  category: PhotoCategory;
  prepared?: Prepared;
  uploaded?: boolean;
};
export function PhotoUpload({
  clientId,
  appointmentId,
  onSaved,
  onBusyChange,
}: {
  clientId: string;
  appointmentId: string;
  onSaved: () => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const [category, setCategory] = useState<PhotoCategory>("before");
  const [image, setImage] = useState<Compressed | null>(null);
  const [preview, setPreview] = useState("");
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState("");
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const fileInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const attempt = useRef<Attempt | null>(null);
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );
  function processing(value: boolean) {
    setBusy(value);
    onBusyChange(value);
  }
  async function choose(file?: File) {
    if (!file) return;
    processing(true);
    setError("");
    setPhase("Preparazione della foto…");
    setImage(null);
    setPreview("");
    try {
      const compressed = await compressPhoto(file);
      if (!mounted.current) return;
      setImage(compressed);
      setPreview(URL.createObjectURL(compressed.blob));
      attempt.current = null;
      setRetry(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Foto non disponibile.");
    } finally {
      processing(false);
      setPhase("");
    }
  }
  async function upload() {
    if (!image) return;
    processing(true);
    setError("");
    setPhase("Caricamento privato…");
    try {
      if (!attempt.current) {
        const digest = await crypto.subtle.digest(
          "SHA-256",
          await image.blob.arrayBuffer(),
        );
        attempt.current = {
          request_id: crypto.randomUUID(),
          size_bytes: image.blob.size,
          sha256: Array.from(new Uint8Array(digest), (b) =>
            b.toString(16).padStart(2, "0"),
          ).join(""),
          mime_type: "image/jpeg",
          appointment_id: appointmentId,
          category,
        };
      }
      const current = attempt.current;
      current.prepared ??= await api<Prepared>(
        `/api/clients/${clientId}/photos`,
        { method: "POST", body: JSON.stringify(current) },
      );
      if (!current.uploaded && current.prepared.state !== "ready") {
        const result = await browserSupabase()
          .storage.from(current.prepared.bucket)
          .upload(current.prepared.upload_path, image.blob, {
            contentType: "image/jpeg",
            upsert: false,
            cacheControl: "0",
          });
        if (
          result.error &&
          !["409", "400"].includes(String(result.error.statusCode))
        )
          throw new Error(
            "Upload interrotto. Mantieni aperta la pagina e riprova quando la rete è stabile.",
          );
        current.uploaded = true;
      }
      setPhase("Verifica della foto…");
      await api(`/api/photos/${current.prepared.photo_id}/complete`, {
        method: "POST",
        body: "{}",
      });
      setImage(null);
      setPreview("");
      attempt.current = null;
      setRetry(false);
      onSaved();
    } catch (e) {
      setRetry(true);
      setError(
        e instanceof Error ? e.message : "Caricamento non riuscito. Riprova.",
      );
    } finally {
      processing(false);
      setPhase("");
    }
  }
  return (
    <section aria-labelledby="photo-upload-heading" className="border-t py-7">
      <h2 id="photo-upload-heading" className="text-xl">
        Aggiungi una foto
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">
        La foto viene ridimensionata a massimo 2400 px e salvata nel dossier
        privato, senza i metadati originali.
      </p>
      <div className="mt-5 max-w-sm space-y-2">
        <Label htmlFor="photo-category">Momento del trattamento</Label>
        <Select
          value={category}
          onValueChange={(v) => setCategory(v as PhotoCategory)}
          disabled={busy || retry}
        >
          <SelectTrigger id="photo-category" className="w-full bg-white">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(photoCategoryLabels).map(([v, label]) => (
              <SelectItem key={v} value={v}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <input
        ref={fileInput}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        aria-label="Scegli foto dal dispositivo"
        className="sr-only"
        tabIndex={-1}
        onChange={(e) => {
          void choose(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <input
        ref={cameraInput}
        type="file"
        accept="image/*"
        capture="environment"
        aria-label="Scatta foto con la fotocamera"
        className="sr-only"
        tabIndex={-1}
        onChange={(e) => {
          void choose(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <div className="mt-4 flex flex-wrap gap-3">
        <Button
          variant="outline"
          disabled={busy || retry}
          onClick={() => fileInput.current?.click()}
        >
          <ImagePlus />
          Scegli foto
        </Button>
        <Button
          variant="outline"
          disabled={busy || retry}
          onClick={() => cameraInput.current?.click()}
        >
          <Camera />
          Scatta foto
        </Button>
      </div>
      <p className="mt-3 text-sm text-muted-foreground">
        JPEG, PNG o WebP. Per HEIC scegli una copia JPEG. Nulla viene caricato
        finché non premi Salva foto.
      </p>
      {image && (
        <div className="mt-5">
          <Image
            src={preview}
            width={image.width}
            height={image.height}
            unoptimized
            alt="Anteprima della foto da caricare"
            className="max-h-72 max-w-full rounded-lg border object-contain"
          />
          <p className="mt-3 text-sm text-muted-foreground">
            {image.width} × {image.height} px ·{" "}
            {Math.round(image.blob.size / 1024)} KB (originale{" "}
            {Math.round(image.originalSize / 1024)} KB)
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Button disabled={busy} onClick={() => void upload()}>
              {retry ? "Riprova salvataggio" : "Salva foto"}
            </Button>
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() => {
                setImage(null);
                setPreview("");
                attempt.current = null;
                setRetry(false);
                setError("");
              }}
            >
              Scarta selezione
            </Button>
          </div>
        </div>
      )}
      {phase && (
        <p role="status" className="mt-4 text-sm">
          {phase}
        </p>
      )}
      {error && (
        <p
          role="alert"
          className="mt-4 text-sm leading-relaxed text-destructive"
        >
          {error}
        </p>
      )}
      {retry && (
        <p className="mt-3 text-sm text-muted-foreground">
          Il nuovo tentativo usa la stessa richiesta. Se lasci questa pagina la
          selezione non viene conservata.
        </p>
      )}
    </section>
  );
}
