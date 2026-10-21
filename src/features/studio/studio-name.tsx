"use client";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Pencil } from "lucide-react";
import { toast } from "sonner";
import { useWorkspace } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useOnline } from "@/lib/connectivity";
import { api } from "@/lib/api";

export function StudioName() {
  const { tenant } = useWorkspace();
  const [draft, setDraft] = useState<{ name: string; version: number } | null>(
    null,
  );
  const cache = useQueryClient();
  const online = useOnline();
  const save = useMutation({
    mutationFn: () =>
      api("/api/workspace", { method: "PATCH", body: JSON.stringify(draft) }),
    onSuccess: async () => {
      await cache.invalidateQueries({ queryKey: ["workspace"] });
      setDraft(null);
      toast.success("Nome dello studio aggiornato");
    },
  });
  if (!draft)
    return (
      <Button
        variant="outline"
        className="mt-5"
        onClick={() => {
          save.reset();
          setDraft({ name: tenant.name, version: tenant.name_version });
        }}
      >
        <Pencil className="size-4" />
        Modifica nome studio
      </Button>
    );
  return (
    <form
      className="mt-6 max-w-xl space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <div className="space-y-2">
        <Label htmlFor="studio-name">Nome dello studio</Label>
        <Input
          id="studio-name"
          value={draft.name}
          minLength={2}
          maxLength={100}
          required
          disabled={save.isPending}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
        />
      </div>
      <p className="text-sm text-muted-foreground">
        Il nuovo nome comparirà nello studio e nei nuovi documenti. I documenti
        già firmati manterranno il nome originale.
      </p>
      {save.error && (
        <p role="alert" className="text-sm text-destructive">
          {save.error.message}
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        <Button
          type="submit"
          disabled={!online || save.isPending || draft.name.trim().length < 2}
        >
          {save.isPending ? "Salvataggio…" : "Salva nome studio"}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={save.isPending}
          onClick={() => setDraft(null)}
        >
          Annulla modifica nome
        </Button>
      </div>
    </form>
  );
}
