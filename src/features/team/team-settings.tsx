"use client";
import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Copy, Link2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import type { CreatedInvitation, Invitation, Profile, Team } from "@/lib/types";
import { formatDate } from "@/lib/dates";
import { useOnline } from "@/lib/connectivity";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { ErrorState, LoadingState } from "@/components/states";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

function invitationStatus(invitation: Invitation) {
  if (invitation.accepted_at) return "Accettato";
  if (invitation.revoked_at) return "Revocato";
  return new Date(invitation.expires_at).getTime() <= Date.now()
    ? "Scaduto"
    : "In attesa";
}
export function TeamSettings() {
  const online = useOnline();
  const query = useQueryClient();
  const [email, setEmail] = useState("");
  const [clinical, setClinical] = useState(false);
  const [created, setCreated] = useState<CreatedInvitation | null>(null);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState("");
  const { data, error, isPending, refetch } = useQuery({
    queryKey: ["team"],
    queryFn: () => api<Team>("/api/team"),
    refetchInterval: 30000,
  });
  function refresh() {
    void query.invalidateQueries({ queryKey: ["team"] });
    void query.invalidateQueries({ queryKey: ["workspace"] });
  }
  const invite = useMutation({
    mutationFn: () =>
      api<CreatedInvitation>("/api/team/invitations", {
        method: "POST",
        body: JSON.stringify({
          email: email.trim(),
          clinical_access: clinical,
        }),
      }),
    onSuccess: (result) => {
      setCreated(result);
      setCopied(false);
      setCopyError("");
      setEmail("");
      setClinical(false);
      refresh();
      toast.success("Invito creato. Copia il collegamento e condividilo.");
    },
    onError: (e) => toast.error(e.message),
  });
  const update = useMutation({
    mutationFn: ({
      member,
      active = member.active,
      clinical_access = member.clinical_access,
    }: {
      member: Profile;
      active?: boolean;
      clinical_access?: boolean;
    }) =>
      api(`/api/team/members/${member.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          version: member.version,
          active,
          clinical_access,
        }),
      }),
    onSuccess: () => {
      refresh();
      toast.success("Accesso aggiornato");
    },
    onError: (e) => {
      toast.error(e.message);
      refresh();
    },
  });
  const revoke = useMutation({
    mutationFn: (id: string) =>
      api(`/api/team/invitations/${id}`, { method: "DELETE" }),
    onSuccess: (_result, id) => {
      if (created?.id === id) setCreated(null);
      refresh();
      toast.success("Invito revocato");
    },
    onError: (e) => {
      toast.error(e.message);
      refresh();
    },
  });
  const url = created
    ? `${process.env.NEXT_PUBLIC_APP_URL}/invito#${created.token}`
    : "";
  async function copy() {
    setCopyError("");
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      setCopyError("Seleziona e copia il collegamento nel campo qui sopra.");
    }
  }
  return (
    <div className="page-container max-w-6xl">
      <Button variant="link" className="mb-3 px-0" asChild>
        <Link href="/app/impostazioni">
          <ArrowLeft />
          Il tuo studio
        </Link>
      </Button>
      <h1 className="text-[32px]">Le persone del tuo studio</h1>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
        Invita chi lavora con te e scegli a quali dossier può accedere. L’agenda
        e i contatti restano condivisi all’interno dello studio.
      </p>
      <div className="mt-8 grid items-start gap-8 xl:grid-cols-[minmax(0,1fr)_320px]">
        <section className="min-w-0" aria-label="Membri dello studio">
          <h2 className="mb-4 text-xl">Accessi attivi e sospesi</h2>
          {isPending ? (
            <LoadingState />
          ) : error ? (
            <ErrorState error={error} retry={() => void refetch()} />
          ) : (
            <div className="divide-y overflow-hidden rounded-xl border bg-white">
              {data?.members.map((member) => (
                <div key={member.id} className="px-5 py-5 sm:px-6">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="break-words text-base font-semibold">
                        {member.display_name}
                      </h3>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <Badge variant="secondary">
                          {member.role === "owner" ? "Titolare" : "Operatrice"}
                        </Badge>
                        {!member.active && (
                          <Badge variant="outline">Accesso sospeso</Badge>
                        )}
                      </div>
                    </div>
                    {member.role === "operator" &&
                      (member.active ? (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="outline"
                              disabled={update.isPending || !online}
                              aria-label={`Sospendi accesso di ${member.display_name}`}
                            >
                              Sospendi accesso
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>
                                Sospendere {member.display_name}?
                              </AlertDialogTitle>
                              <AlertDialogDescription>
                                Perderà l’accesso allo studio. Gli appuntamenti
                                e lo storico resteranno conservati. Le
                                assegnazioni alle clienti saranno revocate: una
                                successiva riattivazione non le ripristinerà.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Annulla</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() =>
                                  update.mutate({ member, active: false })
                                }
                              >
                                Sospendi accesso
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      ) : (
                        <Button
                          variant="outline"
                          disabled={update.isPending || !online}
                          onClick={() =>
                            update.mutate({ member, active: true })
                          }
                          aria-label={`Riattiva accesso di ${member.display_name}`}
                        >
                          Riattiva accesso
                        </Button>
                      ))}
                  </div>
                  {member.role === "owner" ? (
                    <p className="mt-4 text-xs text-muted-foreground">
                      L’accesso della titolare è protetto e non può essere
                      sospeso da questo pannello.
                    </p>
                  ) : (
                    <Label className="mt-4 flex min-h-11 cursor-pointer items-center gap-3 text-sm font-normal">
                      <Checkbox
                        checked={member.clinical_access}
                        disabled={!member.active || update.isPending || !online}
                        onCheckedChange={(value) =>
                          update.mutate({
                            member,
                            clinical_access: value === true,
                          })
                        }
                        aria-label={`Abilita dossier per ${member.display_name}`}
                      />
                      Accesso ai dossier delle clienti assegnate
                    </Label>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
        <section
          className="min-w-0 border-t pt-6 xl:border-t-0 xl:pt-0"
          aria-labelledby="invite-heading"
        >
          <h2 id="invite-heading" className="flex items-center gap-2 text-xl">
            <UserPlus className="size-5 text-primary" />
            Invita un’operatrice
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            Crea un collegamento valido per 72 ore e condividilo direttamente.
            Non viene inviata un’email automatica.
          </p>
          <form
            className="mt-5 space-y-5"
            onSubmit={(event) => {
              event.preventDefault();
              invite.mutate();
            }}
          >
            <div className="field">
              <Label htmlFor="team-email">Email dell’operatrice</Label>
              <Input
                id="team-email"
                type="email"
                maxLength={254}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="off"
                placeholder="nome@studio.it"
                required
              />
            </div>
            <Label className="flex min-h-11 cursor-pointer items-start gap-3 text-sm font-normal leading-relaxed">
              <Checkbox
                className="mt-0.5"
                checked={clinical}
                onCheckedChange={(v) => setClinical(v === true)}
                disabled={invite.isPending}
                aria-label="Abilita accesso ai dossier nell’invito"
              />
              Accesso ai dossier delle clienti assegnate
            </Label>
            <Button type="submit" disabled={invite.isPending || !online}>
              <Link2 />
              {invite.isPending ? "Creazione invito…" : "Crea collegamento"}
            </Button>
          </form>
          {created && (
            <div className="mt-6 border-t pt-5">
              <p role="status" className="break-all text-sm font-medium">
                Invito per {created.email}
              </p>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                Il collegamento è visibile solo ora. Se lo perdi, crea un nuovo
                invito per invalidare quello precedente.
              </p>
              <Label htmlFor="invite-link" className="mt-4 block">
                Collegamento da condividere
              </Label>
              <Input
                id="invite-link"
                className="mt-2"
                value={url}
                readOnly
                onFocus={(event) => event.currentTarget.select()}
              />
              <div className="mt-3 flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => void copy()}>
                  <Copy />
                  {copied ? "Copiato" : "Copia collegamento"}
                </Button>
                <Button variant="ghost" onClick={() => setCreated(null)}>
                  Nascondi
                </Button>
              </div>
              {copyError && (
                <p role="status" className="mt-3 text-sm">
                  {copyError}
                </p>
              )}
            </div>
          )}
        </section>
      </div>
      <section
        className="mt-10 border-t pt-7"
        aria-labelledby="invitations-heading"
      >
        <h2 id="invitations-heading" className="text-xl">
          Inviti recenti
        </h2>
        <p className="mt-2 text-xs text-muted-foreground">
          Ultimi 50 inviti. Un nuovo invito allo stesso indirizzo invalida il
          precedente ancora in attesa.
        </p>
        {!data?.invitations.length ? (
          <p className="mt-5 text-sm text-muted-foreground">
            Gli inviti creati compariranno qui con il loro stato.
          </p>
        ) : (
          <div className="mt-4 divide-y">
            {data.invitations.map((invitation) => (
              <div
                key={invitation.id}
                className="flex flex-wrap items-center justify-between gap-3 py-4"
              >
                <div className="min-w-0">
                  <p className="break-all text-sm font-medium">
                    {invitation.email}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Scadenza:{" "}
                    {formatDate(invitation.expires_at, undefined, {
                      year: "numeric",
                    })}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <Badge variant="outline">
                    {invitationStatus(invitation)}
                  </Badge>
                  {!invitation.accepted_at && !invitation.revoked_at && (
                    <Button
                      variant="ghost"
                      disabled={revoke.isPending || !online}
                      onClick={() => revoke.mutate(invitation.id)}
                      aria-label={`Revoca invito per ${invitation.email}`}
                    >
                      Revoca invito
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
