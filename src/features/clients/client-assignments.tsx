"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useOnline } from "@/lib/connectivity";
import type { Row } from "@/lib/types";
import { useWorkspace } from "@/components/app-shell";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { ErrorState, LoadingState } from "@/components/states";

export function ClientAssignments({ clientId }: { clientId: string }) {
  const { operators } = useWorkspace();
  const online = useOnline();
  const query = useQueryClient();
  const {
    data = [],
    isPending,
    error,
    refetch,
  } = useQuery({
    queryKey: ["assignments", clientId],
    queryFn: () =>
      api<Row<"client_assignments">[]>(`/api/clients/${clientId}/assignments`),
  });
  const mutation = useMutation({
    mutationFn: ({
      operator_id,
      assigned,
    }: {
      operator_id: string;
      assigned: boolean;
    }) =>
      api(`/api/clients/${clientId}/assignments`, {
        method: "POST",
        body: JSON.stringify({
          operator_id,
          assigned,
          version:
            data.find((a) => a.operator_id === operator_id)?.version ?? 0,
        }),
      }),
    onSuccess: () => {
      void query.invalidateQueries({ queryKey: ["assignments", clientId] });
      toast.success("Assegnazione aggiornata");
    },
    onError: (e) => {
      toast.error(e.message);
      void query.invalidateQueries({ queryKey: ["assignments", clientId] });
    },
  });
  const members = operators.filter((o) => o.role === "operator");
  if (!members.length) return null;
  return (
    <section className="border-b px-7 py-7">
      <h3 className="text-lg">Persone assegnate</h3>
      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
        Per consultare i dossier servono sia l’assegnazione alla cliente sia
        l’abilitazione della titolare. L’assegnazione resta valida finché viene
        revocata.
      </p>
      {isPending ? (
        <LoadingState />
      ) : error ? (
        <ErrorState error={error} retry={() => void refetch()} />
      ) : (
        <div className="mt-4 space-y-2">
          {members.map((member) => (
            <Label
              key={member.id}
              className="flex min-h-11 cursor-pointer items-center gap-3 text-sm font-normal"
            >
              <Checkbox
                checked={data.some(
                  (a) => a.operator_id === member.id && a.active,
                )}
                onCheckedChange={(v) =>
                  mutation.mutate({
                    operator_id: member.id,
                    assigned: v === true,
                  })
                }
                disabled={mutation.isPending || !online}
                aria-label={`Assegna ${member.display_name}`}
              />
              <span>
                {member.display_name}
                {!member.clinical_access && (
                  <span className="mt-1 block text-xs text-muted-foreground">
                    Accesso ai dossier non abilitato
                  </span>
                )}
              </span>
            </Label>
          ))}
        </div>
      )}
    </section>
  );
}
