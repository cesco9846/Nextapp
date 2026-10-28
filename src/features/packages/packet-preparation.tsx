"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { api, RequestError } from "@/lib/api";
import { formatDate, formatTime } from "@/lib/dates";
import { useOnline } from "@/lib/connectivity";
import { useWorkspace } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { FormSelect } from "@/components/form-select";
import { SignaturePad } from "@/features/consents/signature-pad";
import { ConsentPanel } from "@/features/consents/consent-panel";
import { PacketDocument } from "./packet-document";
import {
  packetIssueSchema,
  packetSnapshotSchema,
  type PacketState,
  type Professional,
} from "@/lib/packages";
import { signedSnapshotSchema, type Handwriting } from "@/lib/consents";
import type {
  PreparationContext,
  CatalogPage,
  LotListEntry,
} from "@/lib/clinical";
type Available = {
  id: string;
  title: string;
  revision: number;
  minors_enabled: boolean;
};
type IssuedLink = {
  name: string;
  role: string;
  contact: string;
  token: string;
};
export function PackagePreparation({
  context: c,
  back,
}: {
  context: PreparationContext;
  back: () => void;
}) {
  const online = useOnline();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);
  const cache = useQueryClient();
  const { tenant } = useWorkspace();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const issueAttempt = useRef<ReturnType<
    typeof packetIssueSchema.parse
  > | null>(null);
  const counterAttempt = useRef<{
    snapshot_hash: string | null;
    confirmed: boolean;
    signature: Handwriting;
  } | null>(null);
  const [issueUncertain, setIssueUncertain] = useState(false);
  const [counterUncertain, setCounterUncertain] = useState(false);
  const query = useQuery({
    queryKey: ["packet-states", c.appointment.id],
    queryFn: () =>
      api<{ packages: Available[]; sessions: PacketState[] }>(
        `/api/appointments/${c.appointment.id}/packets`,
      ),
    gcTime: 0,
  });
  const [draft, setDraft] = useState({
    date_of_birth: "",
    birthplace: "",
    session_kind: "first" as "first" | "retouch" | "maintenance",
    identity_verified: false,
    verification_method: "",
    representatives: [] as {
      name: string;
      role: "parent" | "guardian";
      contact: string;
      verification_method: string;
      verified: boolean;
    }[],
  });
  const [selected, setSelected] = useState("");
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [links, setLinks] = useState<IssuedLink[]>([]);
  const [lotIds, setLotIds] = useState(c.lots.map((l) => l.lot_id));
  const [lotSearch, setLotSearch] = useState("");
  const [lotPage, setLotPage] = useState(1);
  const lots = useQuery({
    queryKey: ["clinical", "packet-lots", lotSearch, lotPage],
    queryFn: () =>
      api<CatalogPage<LotListEntry>>(
        `/api/clinical/lots?active=true&page=${lotPage}&q=${encodeURIComponent(lotSearch)}`,
      ),
  });
  const [review, setReview] = useState<{
    session: PacketState;
    snapshot: ReturnType<typeof signedSnapshotSchema.parse>;
    packet: ReturnType<typeof packetSnapshotSchema.parse>;
  } | null>(null);
  const [signature, setSignature] = useState<Handwriting>([]);
  const [confirmed, setConfirmed] = useState(false);
  async function issue(tablet = false) {
    setBusy(true);
    setError("");
    let navigating = false;
    if (tablet)
      document.documentElement.setAttribute("data-glow-handoff", "true");
    try {
      const payload =
        issueAttempt.current ??
        packetIssueSchema.parse({
          request_id: requestId,
          appointment_version: c.appointment.version,
          package_version_id: selected,
          details: draft,
          lot_ids: lotIds,
          mode: tablet ? "tablet" : "link",
        });
      issueAttempt.current = payload;
      const r = await api<{ id: string; links: IssuedLink[] }>(
        `/api/appointments/${c.appointment.id}/packets`,
        { method: "POST", body: JSON.stringify(payload) },
      );
      if (tablet && r.links[0]) {
        cache.clear();
        navigating = true;
        window.location.replace(`/documento#${r.links[0].token}`);
        return;
      }
      issueAttempt.current = null;
      setIssueUncertain(false);
      if (!r.links.length)
        setError(
          "Il documento era già stato creato. Rigenera i collegamenti personali dall’elenco delle raccolte.",
        );
      setLinks(r.links);
      setRequestId(crypto.randomUUID());
      void query.refetch();
    } catch (e) {
      if (
        tablet &&
        e instanceof RequestError &&
        ["CONNECTION_LOST", "INCOMPLETE_RESPONSE"].includes(e.code ?? "")
      ) {
        cache.clear();
        navigating = true;
        window.location.replace("/accedi");
        return;
      }
      const ambiguous =
        !(e instanceof RequestError) || e.status === 0 || e.status >= 500;
      setIssueUncertain(ambiguous);
      if (!ambiguous) issueAttempt.current = null;
      setError(e instanceof Error ? e.message : "Creazione non riuscita.");
    } finally {
      if (!navigating) {
        document.documentElement.removeAttribute("data-glow-handoff");
        setBusy(false);
      }
    }
  }
  async function rotate(partyId: string, tablet = false) {
    setBusy(true);
    setError("");
    let navigating = false;
    if (tablet)
      document.documentElement.setAttribute("data-glow-handoff", "true");
    try {
      const r = await api<IssuedLink>(`/api/packets/parties/${partyId}`, {
        method: "POST",
        body: JSON.stringify({ tablet }),
      });
      if (tablet) {
        cache.clear();
        navigating = true;
        window.location.replace(`/documento#${r.token}`);
        return;
      }
      setLinks([r]);
    } catch (e) {
      if (
        tablet &&
        e instanceof RequestError &&
        (e.status === 401 ||
          ["CONNECTION_LOST", "INCOMPLETE_RESPONSE"].includes(e.code ?? ""))
      ) {
        cache.clear();
        navigating = true;
        window.location.replace("/accedi");
        return;
      }
      setError(e instanceof Error ? e.message : "Collegamento non rigenerato.");
    } finally {
      if (!navigating) {
        document.documentElement.removeAttribute("data-glow-handoff");
        setBusy(false);
      }
    }
  }
  async function openReview(session: PacketState) {
    setBusy(true);
    setError("");
    try {
      const r = await api<{ snapshot: unknown }>(`/api/packets/${session.id}`);
      const snapshot = signedSnapshotSchema.parse(r.snapshot);
      setReview({
        session,
        snapshot,
        packet: packetSnapshotSchema.parse(snapshot.packet),
      });
      counterAttempt.current = null;
      setCounterUncertain(false);
      setSignature([]);
      setConfirmed(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Documento non disponibile.");
    } finally {
      setBusy(false);
    }
  }
  async function countersign() {
    if (!review) return;
    setBusy(true);
    setError("");
    try {
      const input = counterAttempt.current ?? {
        snapshot_hash: review.session.snapshot_hash,
        confirmed,
        signature,
      };
      counterAttempt.current = input;
      await api(`/api/packets/${review.session.id}`, {
        method: "POST",
        body: JSON.stringify(input),
      });
      counterAttempt.current = null;
      setCounterUncertain(false);
      setReview(null);
      void query.refetch();
      void cache.invalidateQueries({
        queryKey: ["consents", c.appointment.id],
      });
    } catch (e) {
      const ambiguous =
        !(e instanceof RequestError) || e.status === 0 || e.status >= 500;
      setCounterUncertain(ambiguous);
      if (!ambiguous) counterAttempt.current = null;
      setError(
        e instanceof Error
          ? e.message
          : "Controfirma non ricevuta; riprova con la stessa firma.",
      );
    } finally {
      setBusy(false);
    }
  }
  const sessions = query.data?.sessions ?? [];
  return (
    <div className="page-container max-w-5xl [overflow-wrap:anywhere]">
      <Button variant="ghost" asChild className="mb-5 -ml-3">
        <Link href="/app/agenda">
          <ArrowLeft />
          Agenda
        </Link>
      </Button>
      <h1 className="text-[32px]">Prepara il modulo predefinito</h1>
      <p className="mt-2">
        {review?.snapshot.client_name ??
          `${c.client.first_name} ${c.client.last_name}`}{" "}
        · {review?.snapshot.service_name ?? c.appointment.service_name}
      </p>
      <p className="mt-1 text-sm text-muted-foreground">
        Appuntamento:{" "}
        {formatDate(
          review?.snapshot.starts_at ?? c.appointment.starts_at,
          review?.snapshot.timezone ?? tenant.timezone,
          { year: "numeric" },
        )}{" "}
        alle{" "}
        {formatTime(
          review?.snapshot.starts_at ?? c.appointment.starts_at,
          review?.snapshot.timezone ?? tenant.timezone,
        )}{" "}
        ({review?.snapshot.timezone ?? tenant.timezone})
      </p>
      <p className="mt-3 max-w-prose text-sm text-muted-foreground">
        Verifica dati e rappresentanti prima di condividere i link. Le
        informazioni sanitarie verranno raccolte dopo il consenso esplicito del
        firmatario.
      </p>
      {!c.native_packet && (
        <Button variant="ghost" className="mt-4" onClick={back}>
          Torna ai modelli personalizzati
        </Button>
      )}
      {review ? (
        <section className="mt-8 space-y-6">
          <h2 className="text-2xl">Verifica e controfirma</h2>
          <PacketDocument
            content={review.packet.content}
            professional={review.packet.professional as Professional}
            clientName={review.snapshot.client_name}
            details={review.packet.details}
            answers={review.snapshot.answers}
          />
          <section>
            <h3 className="text-lg">Pigmenti e lotti</h3>
            {review.snapshot.lots.length ? (
              review.snapshot.lots.map((l, i) => (
                <p className="mt-3 text-sm" key={i}>
                  {l.brand} · {l.name} · lotto {l.lot_number} · scadenza{" "}
                  {l.expires_on}
                </p>
              ))
            ) : (
              <p className="mt-3 text-sm">Nessun lotto selezionato.</p>
            )}
          </section>
          <label className="flex min-h-11 items-start gap-3 text-sm">
            <Checkbox
              checked={confirmed}
              disabled={busy || counterUncertain}
              onCheckedChange={(v) => setConfirmed(v === true)}
            />
            Confermo la verifica delle identità e dei poteri di rappresentanza,
            l’esame delle risposte e la consegna delle informazioni del
            trattamento.
          </label>
          <SignaturePad
            value={signature}
            onChange={setSignature}
            disabled={busy || counterUncertain}
          />
          <div className="flex flex-wrap gap-3">
            <Button
              disabled={!online || busy || !confirmed || !signature.length}
              onClick={() => void countersign()}
            >
              {counterUncertain
                ? "Riprova controfirma"
                : "Controfirma e genera PDF"}
            </Button>
            <Button
              variant="outline"
              onClick={() => setReview(null)}
              disabled={busy || counterUncertain}
            >
              Chiudi verifica
            </Button>
          </div>
        </section>
      ) : (
        <>
          <section className="mt-8">
            <h2 className="text-xl">Dati della seduta</h2>
            <fieldset
              disabled={busy || issueUncertain}
              className="mt-5 space-y-5"
            >
              <div className="field">
                <Label htmlFor="packet-package">
                  Pacchetto pubblicato per questo servizio
                </Label>
                <FormSelect
                  id="packet-package"
                  value={selected}
                  onChange={setSelected}
                  options={[
                    { value: "", label: "Seleziona il pacchetto" },
                    ...(query.data?.packages ?? []).map((p) => ({
                      value: p.id,
                      label: `${p.title} · versione ${p.revision}`,
                    })),
                  ]}
                />
              </div>
              <div className="grid gap-5 sm:grid-cols-2">
                <div className="field">
                  <Label htmlFor="packet-dob">
                    Data di nascita della cliente
                  </Label>
                  <Input
                    id="packet-dob"
                    type="date"
                    value={draft.date_of_birth}
                    onChange={(e) =>
                      setDraft({ ...draft, date_of_birth: e.target.value })
                    }
                  />
                </div>
                <div className="field">
                  <Label htmlFor="packet-birthplace">Luogo di nascita</Label>
                  <Input
                    id="packet-birthplace"
                    value={draft.birthplace}
                    maxLength={150}
                    onChange={(e) =>
                      setDraft({ ...draft, birthplace: e.target.value })
                    }
                  />
                </div>
              </div>
              <div className="field">
                <Label htmlFor="packet-kind">Tipo di seduta</Label>
                <FormSelect
                  id="packet-kind"
                  value={draft.session_kind}
                  onChange={(v) =>
                    setDraft({
                      ...draft,
                      session_kind: v as typeof draft.session_kind,
                    })
                  }
                  options={[
                    { value: "first", label: "Prima seduta" },
                    { value: "retouch", label: "Ritocco" },
                    { value: "maintenance", label: "Mantenimento" },
                  ]}
                />
              </div>
              <div className="field">
                <Label htmlFor="packet-identity">
                  Come hai verificato l’identità della cliente?
                </Label>
                <Textarea
                  id="packet-identity"
                  value={draft.verification_method}
                  maxLength={1000}
                  rows={3}
                  onChange={(e) =>
                    setDraft({ ...draft, verification_method: e.target.value })
                  }
                />
              </div>
              <label className="flex min-h-11 items-start gap-3 text-sm">
                <Checkbox
                  checked={draft.identity_verified}
                  onCheckedChange={(v) =>
                    setDraft({ ...draft, identity_verified: v === true })
                  }
                />
                Ho verificato identità e data di nascita della cliente
              </label>
              <section className="space-y-4 border-y py-5">
                <h3 className="text-lg">Rappresentanti della minorenne</h3>
                <p className="text-sm text-muted-foreground">
                  Compila soltanto per una cliente minorenne. Il modello
                  stabilisce età minima e numero di rappresentanti verificati.
                  Ogni persona riceverà un link personale; il primo
                  rappresentante compilerà il questionario dopo le scelte sui
                  dati sanitari di tutti.
                </p>
                {draft.representatives.map((p, i) => (
                  <div className="space-y-4 border-b pb-5" key={i}>
                    {(
                      [
                        ["name", "Nome e cognome"],
                        ["contact", "Contatto del rappresentante"],
                        [
                          "verification_method",
                          "Come hai verificato identità e poteri?",
                        ],
                      ] as const
                    ).map(([key, label]) => (
                      <div className="field" key={key}>
                        <Label htmlFor={`packet-person-${i}-${key}`}>
                          {label} · rappresentante {i + 1}
                        </Label>
                        <Input
                          id={`packet-person-${i}-${key}`}
                          value={p[key]}
                          maxLength={key === "verification_method" ? 1000 : 254}
                          onChange={(e) =>
                            setDraft({
                              ...draft,
                              representatives: draft.representatives.map(
                                (x, j) =>
                                  i === j ? { ...x, [key]: e.target.value } : x,
                              ),
                            })
                          }
                        />
                      </div>
                    ))}
                    <div className="field">
                      <Label htmlFor={`packet-role-${i}`}>
                        Ruolo del rappresentante {i + 1}
                      </Label>
                      <FormSelect
                        id={`packet-role-${i}`}
                        value={p.role}
                        onChange={(v) =>
                          setDraft({
                            ...draft,
                            representatives: draft.representatives.map(
                              (x, j) =>
                                i === j
                                  ? { ...x, role: v as "parent" | "guardian" }
                                  : x,
                            ),
                          })
                        }
                        options={[
                          { value: "parent", label: "Genitore" },
                          { value: "guardian", label: "Tutore" },
                        ]}
                      />
                    </div>
                    <label className="flex min-h-11 items-start gap-3 text-sm">
                      <Checkbox
                        checked={p.verified}
                        onCheckedChange={(v) =>
                          setDraft({
                            ...draft,
                            representatives: draft.representatives.map(
                              (x, j) =>
                                i === j ? { ...x, verified: v === true } : x,
                            ),
                          })
                        }
                      />
                      Ho verificato identità e poteri del rappresentante {i + 1}
                    </label>
                    <Button
                      variant="ghost"
                      onClick={() =>
                        setDraft({
                          ...draft,
                          representatives: draft.representatives.filter(
                            (_, j) => i !== j,
                          ),
                        })
                      }
                    >
                      Rimuovi rappresentante {i + 1}
                    </Button>
                  </div>
                ))}
                <Button
                  variant="outline"
                  disabled={draft.representatives.length >= 2}
                  onClick={() =>
                    setDraft({
                      ...draft,
                      representatives: [
                        ...draft.representatives,
                        {
                          name: "",
                          role: "parent",
                          contact: "",
                          verification_method: "",
                          verified: false,
                        },
                      ],
                    })
                  }
                >
                  Aggiungi rappresentante
                </Button>
              </section>
              <details>
                <summary className="min-h-11 cursor-pointer py-3 font-medium">
                  Pigmenti e lotti · {lotIds.length} selezionati
                </summary>
                <div className="field mt-3">
                  <Label htmlFor="packet-lot-search">Cerca lotti</Label>
                  <Input
                    id="packet-lot-search"
                    value={lotSearch}
                    onChange={(e) => {
                      setLotSearch(e.target.value);
                      setLotPage(1);
                    }}
                  />
                </div>
                <div className="mt-3 space-y-3">
                  {lots.data?.items.map((l) => (
                    <label
                      key={l.id}
                      className="flex min-h-11 items-start gap-3 text-sm"
                    >
                      <Checkbox
                        checked={lotIds.includes(l.id)}
                        onCheckedChange={(v) =>
                          setLotIds(
                            v === true
                              ? [...lotIds, l.id]
                              : lotIds.filter((id) => id !== l.id),
                          )
                        }
                      />
                      {l.pigment.brand} · {l.pigment.name} · lotto{" "}
                      {l.lot_number} · {l.expires_on}
                    </label>
                  ))}
                </div>
                <div className="mt-3 flex gap-3">
                  <Button
                    variant="outline"
                    disabled={lotPage === 1}
                    onClick={() => setLotPage((p) => p - 1)}
                  >
                    Lotti precedenti
                  </Button>
                  <Button
                    variant="outline"
                    disabled={
                      !lots.data || lots.data.page * 50 >= lots.data.total
                    }
                    onClick={() => setLotPage((p) => p + 1)}
                  >
                    Altri lotti
                  </Button>
                </div>
                {lots.error && (
                  <p role="alert" className="text-sm text-destructive">
                    {lots.error.message}
                  </p>
                )}
              </details>
              <p className="text-sm text-muted-foreground">
                Avviare un nuovo documento revoca i link ancora aperti della
                preparazione precedente. Le prove e i documenti già firmati
                restano conservati.
              </p>
              <div className="flex flex-wrap gap-3">
                <Button
                  disabled={!online || busy || !selected}
                  onClick={() => void issue()}
                >
                  Crea link personali del modulo
                </Button>
                <Button
                  variant="outline"
                  disabled={!online || busy || !selected}
                  onClick={() => void issue(true)}
                >
                  Disconnetti e apri modulo su tablet
                </Button>
              </div>
              <p className="text-sm text-muted-foreground">
                Il passaggio al tablet disconnette lo studio; per controfirmare
                dovrai accedere nuovamente. Con più rappresentanti, riaccedi
                dopo ogni firma e usa «Passa tablet» per la persona successiva.
              </p>
            </fieldset>
            {issueUncertain && (
              <Button
                className="mt-4"
                disabled={!online || busy}
                onClick={() => void issue(false)}
              >
                Riprova creazione con gli stessi dati
              </Button>
            )}
          </section>
          {!!links.length && (
            <section className="mt-7 space-y-5 rounded-xl border bg-white p-5">
              <h2 className="text-xl">Collegamenti personali</h2>
              {links.map((l, i) => (
                <div key={i} className="space-y-2">
                  <p className="text-sm">
                    {l.name} · destinatario verificato: {l.contact}
                  </p>
                  <Input
                    readOnly
                    aria-label={`Link modulo ${l.name}`}
                    value={`${typeof window !== "undefined" ? window.location.origin : ""}/documento#${l.token}`}
                  />
                  <p className="text-sm text-muted-foreground">
                    Condividi soltanto con questa persona. Il token rimane
                    visibile qui fino alla chiusura.
                  </p>
                </div>
              ))}
            </section>
          )}
          <section className="mt-9">
            <h2 className="text-xl">Raccolte e firme</h2>
            <Button
              className="mt-3"
              variant="outline"
              disabled={!online || busy || query.isFetching}
              onClick={() => void query.refetch()}
            >
              Aggiorna stato firme
            </Button>
            {!sessions.length && (
              <p className="mt-3 text-sm text-muted-foreground">
                Nessun modulo predefinito avviato per questa seduta.
              </p>
            )}
            <ul className="mt-4 divide-y">
              {sessions.map((s) => (
                <li className="space-y-4 py-5" key={s.id}>
                  <Badge variant="secondary">
                    {s.document_id
                      ? "Documento controfirmato"
                      : s.revoked
                        ? "Revocato"
                        : new Date(s.expires_at).getTime() <= now
                          ? "Scaduto"
                          : s.ready_to_countersign
                            ? "Firme ricevute · attende controfirma"
                            : "Compilazione e firme in corso"}
                  </Badge>
                  {s.parties.map((p) => (
                    <div
                      key={p.id}
                      className="flex flex-wrap items-center justify-between gap-3 text-sm"
                    >
                      <p>
                        {p.identity.name} ·{" "}
                        {p.identity.role === "self"
                          ? "Cliente"
                          : p.identity.role === "parent"
                            ? "Genitore"
                            : "Tutore"}
                        <br />
                        {p.health?.allowed === false
                          ? "Dati sanitari: consenso negato"
                          : !p.health
                            ? "Consenso sanitario da raccogliere"
                            : p.signed
                              ? "Firma ricevuta"
                              : "Dati sanitari: consenso ricevuto · firma da raccogliere"}
                      </p>
                      {!s.revoked && !s.document_id && (
                        <>
                          <Button
                            variant="outline"
                            disabled={!online || busy}
                            onClick={() => void rotate(p.id)}
                          >
                            Rigenera link personale
                          </Button>
                          <Button
                            variant="outline"
                            disabled={!online || busy}
                            onClick={() => void rotate(p.id, true)}
                          >
                            Disconnetti e passa tablet
                          </Button>
                        </>
                      )}
                    </div>
                  ))}
                  {s.ready_to_countersign && !s.document_id && (
                    <Button
                      disabled={!online || busy}
                      onClick={() => void openReview(s)}
                    >
                      Verifica risposte e controfirma
                    </Button>
                  )}
                  {!s.revoked && !s.document_id && (
                    <Button
                      variant="ghost"
                      disabled={!online || busy}
                      onClick={async () => {
                        setBusy(true);
                        setError("");
                        try {
                          await api(`/api/signature-requests/${s.id}`, {
                            method: "DELETE",
                            body: JSON.stringify({ version: s.version }),
                          });
                          void query.refetch();
                        } catch (e) {
                          setError(
                            e instanceof Error
                              ? e.message
                              : "Revoca non riuscita.",
                          );
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      Revoca questo modulo
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
      {(error || query.error) && (
        <p
          role="alert"
          className="mt-5 whitespace-pre-wrap text-sm text-destructive"
        >
          {error || query.error?.message}
        </p>
      )}
      <ConsentPanel
        id={c.appointment.id}
        appointmentVersion={c.appointment.version}
        preparationVersion={c.preparation?.version ?? 0}
        timezone={tenant.timezone}
        editable={false}
        dirty={false}
        documentsOnly
      />
    </div>
  );
}
