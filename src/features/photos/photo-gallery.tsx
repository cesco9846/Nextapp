"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Images, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { useWorkspace } from "@/components/app-shell";
import { api } from "@/lib/api";
import { usePrivateDocument } from "@/lib/private-document";
import {
  photoCategoryLabels,
  type PhotoGallery as Gallery,
  type Photo,
  type PhotoPermission,
} from "@/lib/photos";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { ErrorState, LoadingState } from "@/components/states";
import { PrivatePhoto } from "./private-photo";
import { PhotoUpload } from "./photo-upload";
function formatPhotoDate(value: string, timezone: string) {
  return new Intl.DateTimeFormat("it-IT", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: timezone,
  }).format(new Date(value));
}
function Confirm({
  label,
  title,
  description,
  onConfirm,
  disabled = false,
}: {
  label: string;
  title: string;
  description: string;
  onConfirm: () => void;
  disabled?: boolean;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="outline" disabled={disabled}>
          {label}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Annulla</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>Conferma</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
export function PhotoGallery({
  clientId,
  initialAppointment,
}: {
  clientId: string;
  initialAppointment?: string;
}) {
  usePrivateDocument();
  const { tenant } = useWorkspace();
  const date = (value: string) => formatPhotoDate(value, tenant.timezone);
  const [appointment, setAppointment] = useState(initialAppointment ?? "");
  const [page, setPage] = useState(0);
  const [revision, setRevision] = useState(0);
  const [data, setData] = useState<Gallery | null>(null);
  const [resolvedKey, setResolvedKey] = useState("");
  const fetchKey = `${clientId}:${appointment}:${page}:${revision}`;
  const loading = resolvedKey !== fetchKey;
  const [error, setError] = useState<Error | null>(null);
  const [busy, setBusy] = useState(false);
  const [before, setBefore] = useState<Photo | null>(null);
  const [after, setAfter] = useState<Photo | null>(null);
  const reload = () => setRevision((v) => v + 1);
  useEffect(() => {
    const controller = new AbortController();

    void api<Gallery>(
      `/api/clients/${clientId}/photos?page=${page}${appointment ? `&appointment=${appointment}` : ""}`,
      { signal: controller.signal },
    )
      .then((result) => {
        if (controller.signal.aborted) return;
        if (!appointment && result.appointments.length) {
          setAppointment(result.appointments[0].id);
          return;
        }
        setError(null);
        setData(result);
      })
      .catch((e) => {
        if (!controller.signal.aborted)
          setError(
            e instanceof Error ? e : new Error("Dossier non disponibile."),
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setResolvedKey(fetchKey);
      });
    return () => controller.abort();
  }, [clientId, appointment, page, revision, fetchKey]);
  async function revoke(permission: PhotoPermission) {
    setBusy(true);
    try {
      await api(`/api/photo-permissions/${permission.id}/revoke`, {
        method: "POST",
        body: JSON.stringify({ version: permission.version }),
      });
      toast.success("Revoca registrata");
      reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Revoca non riuscita.");
    } finally {
      setBusy(false);
    }
  }
  async function archive(photo: Photo) {
    setBusy(true);
    try {
      await api(`/api/photos/${photo.id}`, {
        method: "DELETE",
        body: JSON.stringify({ version: photo.version }),
      });
      setBefore(null);
      setAfter(null);
      toast.success("Foto archiviata");
      reload();
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Archiviazione non riuscita.",
      );
    } finally {
      setBusy(false);
    }
  }
  const selected = data?.appointments.find((a) => a.id === appointment);
  const permissions =
    data?.permissions.filter((p) => p.appointment_id === appointment) ?? [];
  const active = (purpose: PhotoPermission["purpose"]) =>
    permissions.some(
      (p) => p.purpose === purpose && p.allowed && !p.revoked_at,
    );
  return (
    <div className="mx-auto max-w-6xl px-5 py-7 sm:px-8 sm:py-10">
      <Button variant="ghost" asChild className="-ml-3">
        <Link href="/app/clienti">
          <ArrowLeft />
          Clienti
        </Link>
      </Button>
      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[32px]">Foto del trattamento</h1>
          {data && (
            <p className="mt-2 text-lg">
              {data.client.first_name} {data.client.last_name}
            </p>
          )}
        </div>
        <Badge variant="secondary" className="gap-2">
          <ShieldCheck className="size-4" />
          Archivio privato
        </Badge>
      </div>
      {data && (
        <div className="mt-7 max-w-xl space-y-2">
          <Label htmlFor="photo-appointment">Appuntamento</Label>
          <Select
            value={appointment}
            onValueChange={(v) => {
              setAppointment(v);
              setPage(0);
              setBefore(null);
              setAfter(null);
            }}
            disabled={busy}
          >
            <SelectTrigger
              id="photo-appointment"
              className="h-auto min-h-11 w-full bg-white text-left whitespace-normal"
            >
              <SelectValue placeholder="Scegli una seduta" />
            </SelectTrigger>
            <SelectContent>
              {data.appointments.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.service_name} · {date(a.starts_at)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {data.appointments.length === 200 && (
            <p className="text-sm text-muted-foreground">
              Sono mostrate le ultime 200 sedute.
            </p>
          )}
        </div>
      )}
      {loading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState error={error} retry={reload} />
      ) : (
        data && (
          <>
            {!selected ? (
              <p className="mt-7 rounded-xl border bg-white p-5">
                {data.appointments.length
                  ? "Scegli un appuntamento disponibile per aprire le sue foto."
                  : "Prenota la prima seduta per raccogliere le autorizzazioni e le foto del trattamento."}
              </p>
            ) : (
              <>
                <section
                  aria-labelledby="photo-permissions-title"
                  className="mt-7 rounded-xl border bg-white p-5 sm:p-6"
                >
                  <h2 id="photo-permissions-title" className="text-xl">
                    Autorizzazioni per questa seduta
                  </h2>
                  <div className="mt-4 divide-y">
                    {(["documentation", "demonstration"] as const).map(
                      (purpose) => {
                        const permission = permissions.find(
                          (p) => p.purpose === purpose,
                        );
                        const allowed = active(purpose);
                        return (
                          <div
                            key={purpose}
                            className="flex flex-wrap items-center justify-between gap-3 py-4 first:pt-0"
                          >
                            <div>
                              <h3 className="text-base font-semibold">
                                {purpose === "documentation"
                                  ? "Documentazione riservata"
                                  : "Uso dimostrativo"}
                              </h3>
                              <p className="mt-1 text-sm text-muted-foreground">
                                {permission?.revoked_at
                                  ? "Revocata"
                                  : purpose === "demonstration" &&
                                      allowed &&
                                      !active("documentation")
                                    ? "Sospesa: documentazione revocata"
                                    : allowed
                                      ? `Autorizzata con firma il ${date(permission!.signed_at)}`
                                      : permission
                                        ? "Non autorizzata dalla cliente"
                                        : "Nessuna scelta firmata"}
                              </p>
                              {purpose === "demonstration" &&
                                allowed &&
                                permission?.image_scope && (
                                  <p className="mt-2 text-sm">
                                    {permission.image_scope === "detail"
                                      ? "Solo dettaglio dell’area trattata; nessuna immagine riconoscibile autorizzata."
                                      : permission.image_scope ===
                                          "recognizable"
                                        ? "Immagine riconoscibile autorizzata."
                                        : "Nessun uso dimostrativo autorizzato."}
                                  </p>
                                )}
                            </div>
                            {allowed && permission && (
                              <Confirm
                                label={`Revoca ${purpose === "documentation" ? "documentazione" : "uso dimostrativo"}`}
                                title="Registrare la revoca?"
                                description={
                                  purpose === "documentation"
                                    ? "Bloccherai i nuovi caricamenti. Le immagini già presenti restano nel dossier riservato. Per una nuova autorizzazione serve una nuova scelta firmata."
                                    : "L’autorizzazione all’uso dimostrativo non sarà più attiva per gli usi futuri. La revoca non richiama copie già diffuse. Le foto restano private nel dossier."
                                }
                                onConfirm={() => void revoke(permission)}
                                disabled={busy}
                              />
                            )}
                          </div>
                        );
                      },
                    )}
                  </div>
                  <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                    Le scelte sono facoltative e distinte dal consenso al
                    trattamento. Le foto non vengono pubblicate automaticamente.{" "}
                    {active("demonstration") &&
                      !active("documentation") &&
                      "L’uso dimostrativo è sospeso perché la documentazione non è autorizzata."}
                  </p>
                  {!active("documentation") && (
                    <div className="mt-5">
                      <p className="mb-3 text-sm">
                        Per acquisire foto serve la scelta firmata sulla
                        documentazione riservata. Se la revisione è già firmata,
                        salva una nuova preparazione e raccogli una nuova firma.
                      </p>
                      <Button variant="outline" asChild>
                        <Link
                          href={`/app/appuntamenti/${appointment}/preparazione`}
                        >
                          Apri preparazione e firma
                        </Link>
                      </Button>
                    </div>
                  )}
                </section>
                {active("documentation") &&
                !data.client.archived_at &&
                !["cancelled", "no_show"].includes(selected.status) ? (
                  <PhotoUpload
                    onBusyChange={setBusy}
                    key={appointment}
                    clientId={clientId}
                    appointmentId={appointment}
                    onSaved={() => {
                      toast.success("Foto salvata nel dossier");
                      setPage(0);
                      reload();
                    }}
                  />
                ) : (
                  <p className="my-7 text-sm text-muted-foreground">
                    Nuovi caricamenti non disponibili: verifica le
                    autorizzazioni, lo stato della cliente e della seduta.
                  </p>
                )}
                <section
                  aria-labelledby="photo-gallery-title"
                  className="border-t py-7"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h2 id="photo-gallery-title" className="text-xl">
                      Prima, dopo e guarito
                    </h2>
                    <Button
                      variant="ghost"
                      disabled={busy}
                      onClick={() => {
                        setBefore(null);
                        setAfter(null);
                        reload();
                      }}
                    >
                      Aggiorna galleria
                    </Button>
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Apri le immagini solo quando servono. Si nascondono dopo un
                    minuto o quando lasci la scheda del browser. Scegli una foto
                    prima e una dopo o guarito per confrontarle.
                  </p>
                  {!data.photos.length ? (
                    <div className="mt-6 flex items-start gap-4 rounded-xl border border-dashed p-6">
                      <Images className="mt-1 size-6 shrink-0 text-primary" />
                      <div>
                        <h3 className="text-lg">
                          Il confronto inizia dalla prima foto
                        </h3>
                        <p className="mt-2 text-sm text-muted-foreground">
                          Le immagini di questa seduta appariranno qui con il
                          momento del trattamento.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                      {data.photos.map((photo) => (
                        <article
                          key={photo.id}
                          className="overflow-hidden rounded-xl border bg-white"
                        >
                          <PrivatePhoto
                            id={photo.id}
                            alt={`Foto ${photoCategoryLabels[photo.category].toLowerCase()} del trattamento`}
                          />
                          <div className="p-4">
                            <div className="flex items-center justify-between gap-3">
                              <h3 className="text-lg">
                                {photoCategoryLabels[photo.category]}
                              </h3>
                              <Badge variant="secondary">
                                {before?.id === photo.id ||
                                after?.id === photo.id
                                  ? "Nel confronto"
                                  : "Riservata"}
                              </Badge>
                            </div>
                            <p className="mt-2 text-sm text-muted-foreground">
                              Caricata il {date(photo.created_at)}
                            </p>
                            <div className="mt-4 flex flex-wrap gap-2">
                              <Button
                                variant="outline"
                                onClick={() =>
                                  photo.category === "before"
                                    ? setBefore(photo)
                                    : setAfter(photo)
                                }
                              >
                                Confronta
                                {photo.category === "before"
                                  ? " come prima"
                                  : photo.category === "after"
                                    ? " come dopo"
                                    : " come guarito"}
                              </Button>
                              {(before?.id === photo.id ||
                                after?.id === photo.id) && (
                                <Button variant="ghost" asChild>
                                  <a href="#photo-comparison">
                                    Vai al confronto
                                  </a>
                                </Button>
                              )}
                              <Confirm
                                label="Archivia"
                                title="Archiviare questa foto?"
                                description="La foto uscirà dalla galleria. L’archiviazione non elimina il file né modifica il documento firmato."
                                onConfirm={() => void archive(photo)}
                                disabled={busy}
                              />
                            </div>
                          </div>
                        </article>
                      ))}
                    </div>
                  )}
                  <div className="mt-6 flex items-center justify-between gap-3">
                    <Button
                      variant="outline"
                      disabled={busy || page === 0}
                      onClick={() => setPage((v) => v - 1)}
                    >
                      Precedenti
                    </Button>
                    <span className="text-sm text-muted-foreground">
                      Pagina {page + 1}
                    </span>
                    <Button
                      variant="outline"
                      disabled={busy || !data.has_more}
                      onClick={() => setPage((v) => v + 1)}
                    >
                      Successive
                    </Button>
                  </div>
                </section>
                {(before || after) && (
                  <section
                    id="photo-comparison"
                    aria-labelledby="photo-compare-title"
                    className="border-t py-7"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <h2 id="photo-compare-title" className="text-xl">
                        Confronto della seduta
                      </h2>
                      <Button
                        variant="ghost"
                        onClick={() => {
                          setBefore(null);
                          setAfter(null);
                        }}
                      >
                        Chiudi confronto
                      </Button>
                    </div>
                    <p
                      role="status"
                      className="mt-2 text-sm text-muted-foreground"
                    >
                      {before && after
                        ? "Due immagini della stessa seduta. Inquadratura, luce e distanza possono influenzare il confronto."
                        : `Scegli anche una foto ${before ? "dopo o guarito" : "prima"} dalla galleria.`}
                    </p>
                    <div className="mt-5 grid gap-5 md:grid-cols-2">
                      {[before, after].map((photo, i) => (
                        <div
                          key={photo?.id ?? i}
                          className="overflow-hidden rounded-xl border bg-white"
                        >
                          <h3 className="px-4 py-3 text-lg">
                            {photo
                              ? photoCategoryLabels[photo.category]
                              : i === 0
                                ? "Prima"
                                : "Dopo o guarito"}
                          </h3>
                          {photo ? (
                            <PrivatePhoto
                              id={photo.id}
                              alt={`Confronto: ${photoCategoryLabels[photo.category]}`}
                            />
                          ) : (
                            <p className="p-5 text-sm text-muted-foreground">
                              Seleziona una foto dalla galleria.
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </section>
                )}
              </>
            )}
          </>
        )
      )}
    </div>
  );
}
