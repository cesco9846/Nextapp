"use client";
import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, RequestError } from "@/lib/api";
import { browserSupabase } from "@/lib/supabase/browser";
import {
  pigmentSchema,
  lotSchema,
  type Pigment,
  type PigmentLot,
} from "@/lib/clinical";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useRequestKey } from "./use-request-key";
export function PigmentEditor({
  entry,
  onClose,
}: {
  entry?: Pigment;
  onClose: () => void;
}) {
  const query = useQueryClient();
  const withKey = useRequestKey();
  const [validation, setValidation] = useState("");
  const [active, setActive] = useState(entry?.active ?? true);
  const mutation = useMutation({
    mutationFn: (body: ReturnType<typeof pigmentSchema.parse>) =>
      api("/api/clinical/pigments", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      void query.invalidateQueries({ queryKey: ["clinical"] });
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
          <DialogTitle>
            {entry ? "Modifica pigmento" : "Nuovo pigmento"}
          </DialogTitle>
          <DialogDescription>
            Marca e nome identificano il prodotto; numero e scadenza
            appartengono ai singoli lotti.
          </DialogDescription>
        </DialogHeader>
        <form
          className="mt-3 space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            const form = Object.fromEntries(new FormData(e.currentTarget));
            const parsed = pigmentSchema.safeParse(
              withKey({
                ...form,
                id: entry?.id ?? null,
                version: entry?.version ?? 0,
                active,
              }),
            );
            if (!parsed.success) {
              setValidation(parsed.error.issues[0].message);
              return;
            }
            setValidation("");
            mutation.mutate(parsed.data);
          }}
        >
          <div className="field">
            <Label htmlFor="pigment-brand">Marca</Label>
            <Input
              id="pigment-brand"
              name="brand"
              defaultValue={entry?.brand}
              required
              maxLength={100}
            />
          </div>
          <div className="field">
            <Label htmlFor="pigment-name">Nome pigmento</Label>
            <Input
              id="pigment-name"
              name="name"
              defaultValue={entry?.name}
              required
              maxLength={100}
            />
          </div>
          <div className="field">
            <Label htmlFor="pigment-code">Codice prodotto (facoltativo)</Label>
            <Input
              id="pigment-code"
              name="code"
              defaultValue={entry?.code}
              maxLength={100}
            />
          </div>
          <label className="flex min-h-11 items-center gap-3 text-sm">
            <Checkbox
              checked={active}
              onCheckedChange={(v) => setActive(v === true)}
            />
            Disponibile per nuovi trattamenti
          </label>
          {(validation || mutation.error) && (
            <p role="alert" className="text-sm text-destructive">
              {validation || mutation.error?.message}
            </p>
          )}
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? "Salvataggio…" : "Salva pigmento"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
export function LotEditor({
  pigment,
  entry,
  onClose,
}: {
  pigment: Pick<Pigment, "id" | "name" | "brand">;
  entry?: PigmentLot;
  onClose: () => void;
}) {
  const query = useQueryClient();
  const withKey = useRequestKey();
  const [file, setFile] = useState<File | null>(null);
  const [active, setActive] = useState(entry?.active ?? true);
  const [validation, setValidation] = useState("");
  const [stage, setStage] = useState("");
  const upload = useRef<{
    file: File;
    request: string;
    prepared?: { id: string; upload_path: string };
    ready?: string;
  } | null>(null);
  async function label() {
    if (!file) {
      if (entry) return entry.label_file_id;
      throw new Error("Aggiungi una foto dell’etichetta del lotto.");
    }
    if (
      !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
      file.size > 10485760 ||
      file.size === 0
    )
      throw new Error(
        "Scegli una foto JPEG, PNG o WebP, fino a 10 MB. Converti prima eventuali file HEIC.",
      );
    if (upload.current?.file !== file)
      upload.current = { file, request: crypto.randomUUID() };
    const attempt = upload.current!;
    if (attempt.ready) return attempt.ready;
    setStage("Caricamento dell’etichetta…");
    const bytes = await file.arrayBuffer();
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    const sha256 = Array.from(new Uint8Array(digest), (v) =>
      v.toString(16).padStart(2, "0"),
    ).join("");
    if (!attempt.prepared)
      attempt.prepared = await api(
        `/api/clinical/pigments/${pigment.id}/labels`,
        {
          method: "POST",
          body: JSON.stringify({
            request_id: attempt.request,
            size_bytes: file.size,
            sha256,
            mime_type: file.type,
          }),
        },
      );
    await browserSupabase()
      .storage.from("glow-private")
      .upload(attempt.prepared!.upload_path, file, {
        contentType: file.type,
        upsert: false,
      });
    // Completion verifies the actual bytes; it also recovers a lost upload response.
    setStage("Verifica dell’etichetta…");
    try {
      const result = await api<{ id: string }>(
        `/api/files/${attempt.prepared!.id}/complete`,
        { method: "POST", body: "{}" },
      );
      attempt.ready = result.id;
      return result.id;
    } catch (error) {
      if (error instanceof RequestError && [400, 422].includes(error.status))
        upload.current = null;
      throw error;
    }
  }
  const mutation = useMutation({
    mutationFn: async (fields: Record<string, FormDataEntryValue>) => {
      const labelId = await label();
      const parsed = lotSchema.parse(
        withKey({
          ...fields,
          id: entry?.id ?? null,
          version: entry?.version ?? 0,
          pigment_id: pigment.id,
          label_file_id: labelId,
          active,
        }),
      );
      setStage("Salvataggio del lotto…");
      return api("/api/clinical/lots", {
        method: "POST",
        body: JSON.stringify(parsed),
      });
    },
    onSuccess: () => {
      void query.invalidateQueries({ queryKey: ["clinical"] });
      onClose();
    },
    onSettled: () => setStage(""),
  });
  return (
    <Dialog
      open
      onOpenChange={(v) => {
        if (!v && !mutation.isPending) onClose();
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{entry ? "Modifica lotto" : "Nuovo lotto"}</DialogTitle>
          <DialogDescription>
            {pigment.brand} · {pigment.name}. Le preparazioni già salvate
            conservano le informazioni scelte.
          </DialogDescription>
        </DialogHeader>
        <form
          className="mt-3 space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            setValidation("");
            const form = Object.fromEntries(new FormData(e.currentTarget));
            delete form.label;
            mutation.mutate(form);
          }}
        >
          <fieldset disabled={mutation.isPending} className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="field">
                <Label htmlFor="lot-number">Numero lotto</Label>
                <Input
                  id="lot-number"
                  name="lot_number"
                  defaultValue={entry?.lot_number}
                  required
                  maxLength={100}
                />
              </div>
              <div className="field">
                <Label htmlFor="lot-expiry">Scadenza</Label>
                <Input
                  id="lot-expiry"
                  name="expires_on"
                  type="date"
                  defaultValue={entry?.expires_on}
                  required
                />
              </div>
            </div>
            <div className="field">
              <Label htmlFor="lot-label">
                {entry
                  ? "Sostituisci etichetta (facoltativo)"
                  : "Foto dell’etichetta"}
              </Label>
              <Input
                id="lot-label"
                name="label"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(e) => {
                  setFile(e.target.files?.[0] ?? null);
                  upload.current = null;
                }}
                required={!entry}
                className="h-auto min-h-11 bg-white"
              />
              <p className="text-xs text-muted-foreground">
                JPEG, PNG o WebP, fino a 10 MB. L’immagine rimane privata.
              </p>
            </div>
            <div className="field">
              <Label htmlFor="lot-text">
                Informazioni dell’etichetta (facoltative)
              </Label>
              <Textarea
                id="lot-text"
                name="label_text"
                defaultValue={entry?.label_text ?? ""}
                maxLength={2000}
                rows={3}
              />
            </div>
            <label className="flex min-h-11 items-center gap-3 text-sm">
              <Checkbox
                checked={active}
                onCheckedChange={(v) => setActive(v === true)}
              />
              Disponibile per nuovi trattamenti
            </label>
          </fieldset>
          {(validation || mutation.error) && (
            <p role="alert" className="text-sm text-destructive">
              {validation || mutation.error?.message}
            </p>
          )}
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? stage || "Salvataggio…" : "Salva lotto"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
