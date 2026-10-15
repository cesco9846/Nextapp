"use client";
import "temporal-polyfill/global";
import { useCallback, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import FullCalendar, {
  type CalendarRef,
  type DatesSetInfo,
  type EventDropInfo,
  type EventResizeDoneInfo,
} from "@fullcalendar/react";
import monarch from "@fullcalendar/react/themes/monarch";
import timeGrid from "@fullcalendar/react/timegrid";
import dayGrid from "@fullcalendar/react/daygrid";
import list from "@fullcalendar/react/list";
import interaction from "@fullcalendar/react/interaction";
import itLocale from "@fullcalendar/react/locales/it";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  MapPin,
  Plus,
  SlidersHorizontal,
  Sun,
} from "lucide-react";
import { toast } from "sonner";
import { Temporal } from "temporal-polyfill";
import { api } from "@/lib/api";
import type { Appointment, Client } from "@/lib/types";
import { formatDate, formatTime, initials, instantToLocal } from "@/lib/dates";
import { statusLabels } from "@/lib/contracts";
import { useWorkspace } from "@/components/app-shell";
import { FormSelect } from "@/components/form-select";
import { ErrorState, LoadingState } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { AppointmentEditor } from "./appointment-editor";
import { AppointmentDetails } from "./appointment-details";
import "@fullcalendar/react/skeleton.css";
import "@fullcalendar/react/themes/monarch/theme.css";
import "@fullcalendar/react/themes/monarch/palettes/green.css";

const viewOptions = [
  { value: "timeGridDay", label: "Giorno" },
  { value: "timeGridWeek", label: "Settimana" },
  { value: "dayGridMonth", label: "Mese" },
  { value: "listWeek", label: "Lista" },
];
function localDay(iso: string, timezone: string) {
  return Temporal.Instant.from(iso)
    .toZonedDateTimeISO(timezone)
    .toPlainDate()
    .toString();
}

export function Agenda() {
  const { tenant, profile, locations, services, operators } = useWorkspace();
  const query = useQueryClient();
  const params = useSearchParams();
  const calendar = useRef<CalendarRef>(null);
  const [view, setView] = useState(() =>
    window.innerWidth < 768 ? "timeGridDay" : "timeGridWeek",
  );
  const [title, setTitle] = useState("");
  const [range, setRange] = useState<{ start: string; end: string } | null>(
    null,
  );
  const [location, setLocation] = useState("all");
  const [operator, setOperator] = useState("all");
  const [day, setDay] = useState(() =>
    Temporal.Now.zonedDateTimeISO(tenant.timezone).toPlainDate().toString(),
  );
  const [editor, setEditor] = useState<{
    appointment?: Appointment;
    date?: string;
  } | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const locationId = params.get("sede") ?? (location === "all" ? "" : location);
  const initialClientId = params.get("cliente");
  const initialClient = useQuery({
    queryKey: ["client", "from-link", initialClientId],
    queryFn: () => api<{ client: Client }>(`/api/clients/${initialClientId}`),
    enabled: !!initialClientId,
  });
  const [handledClient, setHandledClient] = useState<string | null>(null);
  const onDates = useCallback(
    (info: DatesSetInfo) => {
      const next = {
        start: info.start.toISOString(),
        end: info.end.toISOString(),
      };
      setRange((old) =>
        old?.start === next.start && old?.end === next.end ? old : next,
      );
      setTitle(info.view.title);
      setDay((old) =>
        old >= localDay(next.start, tenant.timezone) &&
        old < localDay(next.end, tenant.timezone)
          ? old
          : localDay(next.start, tenant.timezone),
      );
    },
    [tenant.timezone],
  );
  const {
    data = [],
    isPending,
    error,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ["appointments", range?.start, range?.end, locationId, operator],
    queryFn: () =>
      api<Appointment[]>(
        `/api/appointments?${new URLSearchParams({ start: range!.start, end: range!.end, ...(locationId ? { location: locationId } : {}), ...(operator !== "all" ? { operator } : {}) })}`,
      ),
    enabled: !!range,
  });
  const move = useMutation({
    mutationFn: ({
      appointment,
      start,
      end,
    }: {
      appointment: Appointment;
      start: string;
      end: string;
    }) =>
      api(`/api/appointments/${appointment.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          version: appointment.version,
          starts_at: start,
          ends_at: end,
        }),
      }),
    onSuccess: () => {
      toast.success("Appuntamento spostato");
      void query.invalidateQueries({ queryKey: ["appointments"] });
    },
  });
  async function changeTime(info: EventDropInfo | EventResizeDoneInfo) {
    const appointment = data.find((a) => a.id === info.event.id);
    if (
      !appointment ||
      !info.event.start ||
      !info.event.end ||
      info.event.allDay
    ) {
      info.revert();
      return;
    }
    try {
      await move.mutateAsync({
        appointment,
        start: info.event.start.toISOString(),
        end: info.event.end.toISOString(),
      });
    } catch (error) {
      info.revert();
      toast.error(
        error instanceof Error ? error.message : "Spostamento non riuscito.",
      );
      void query.invalidateQueries({ queryKey: ["appointments"] });
    }
  }
  const selected = data.find((a) => a.id === selectedId);
  const dayAppointments = data.filter(
    (a) =>
      a.status !== "cancelled" &&
      localDay(a.starts_at, tenant.timezone) === day,
  );
  const activeCount = data.filter((a) => a.status !== "cancelled").length;
  const showLinkedEditor =
    !!initialClient.data && handledClient !== initialClientId;
  function changeView(value: string) {
    setView(value);
    calendar.current?.getApi().changeView(value);
  }
  function jumpToday() {
    calendar.current?.getApi().today();
    setDay(
      Temporal.Now.zonedDateTimeISO(tenant.timezone).toPlainDate().toString(),
    );
  }
  return (
    <div className="page-container">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[32px]">La tua agenda</h1>
        </div>
        <Button onClick={() => setEditor({ date: `${day}T09:00` })}>
          <Plus />
          Nuovo appuntamento
        </Button>
      </div>
      <div className="mt-7 flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex items-center gap-0.5">
            <Button
              size="icon"
              variant="outline"
              className="bg-white"
              aria-label="Periodo precedente"
              onClick={() => calendar.current?.getApi().prev()}
            >
              <ChevronLeft />
            </Button>
            <Button
              size="icon"
              variant="outline"
              className="bg-white"
              aria-label="Periodo successivo"
              onClick={() => calendar.current?.getApi().next()}
            >
              <ChevronRight />
            </Button>
          </div>
          <h2 className="ml-1 text-lg capitalize sm:ml-2 sm:text-xl">
            {title || "Agenda"}
          </h2>
        </div>
        <div className="flex w-full items-center gap-2 sm:w-auto">
          <Button variant="outline" className="bg-white" onClick={jumpToday}>
            Oggi
          </Button>
          <div className="w-32 flex-1 sm:flex-none">
            <FormSelect
              value={view}
              onChange={changeView}
              options={viewOptions}
              id="calendar-view"
              ariaLabel="Vista calendario"
            />
          </div>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className="bg-white"
                aria-label="Filtra agenda"
              >
                <SlidersHorizontal />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-72 space-y-4">
              <div className="field">
                <Label htmlFor="filter-location">Sede</Label>
                <FormSelect
                  id="filter-location"
                  value={locationId || "all"}
                  onChange={(value) => {
                    setLocation(value);
                    if (params.has("sede"))
                      window.history.replaceState(null, "", "/app/agenda");
                  }}
                  options={[
                    { value: "all", label: "Tutte le sedi" },
                    ...locations
                      .filter((l) => l.active)
                      .map((l) => ({ value: l.id, label: l.name })),
                  ]}
                />
              </div>
              <div className="field">
                <Label htmlFor="filter-operator">Operatrice</Label>
                <FormSelect
                  id="filter-operator"
                  value={operator}
                  onChange={setOperator}
                  options={[
                    { value: "all", label: "Tutte le operatrici" },
                    ...operators.map((o) => ({
                      value: o.id,
                      label: o.display_name,
                    })),
                  ]}
                />
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>
      <div className="mt-5 grid items-start gap-5 2xl:grid-cols-[minmax(0,1fr)_272px]">
        <section
          className="min-w-0 overflow-hidden rounded-xl border bg-white"
          aria-label="Calendario appuntamenti"
        >
          <div className="flex min-h-12 flex-wrap items-center justify-between gap-2 border-b px-4 py-3 text-xs text-muted-foreground">
            <span>
              {locationId
                ? locations.find((l) => l.id === locationId)?.name
                : "Tutte le sedi"}
              <span className="mx-2 text-[#afbeb4]">·</span>
              {activeCount}{" "}
              {activeCount === 1 ? "appuntamento" : "appuntamenti"} nel periodo
            </span>
            <span className="flex items-center gap-2">
              {isFetching && (
                <span className="size-1.5 animate-pulse rounded-full bg-primary" />
              )}
              Orario{" "}
              {tenant.timezone === "Europe/Rome" ? "italiano" : tenant.timezone}
            </span>
          </div>
          {error && <ErrorState error={error} retry={() => void refetch()} />}
          <div className="calendar-frame p-2 sm:p-3">
            <FullCalendar
              ref={calendar}
              plugins={[monarch, timeGrid, dayGrid, list, interaction]}
              locale={itLocale}
              timeZone={tenant.timezone}
              initialView={view}
              firstDay={1}
              headerToolbar={false}
              height={680}
              slotMinTime="07:00:00"
              slotMaxTime="21:00:00"
              slotDuration="00:30:00"
              scrollTime="08:00:00"
              allDaySlot={false}
              nowIndicator
              selectable
              editable={view !== "dayGridMonth" && !move.isPending}
              weekends={true}
              dayMaxEvents={3}
              longPressDelay={350}
              eventDurationEditable
              datesSet={onDates}
              events={data
                .filter((a) => a.status !== "cancelled")
                .map((a) => ({
                  id: a.id,
                  title: `${a.client.first_name} ${a.client.last_name}`,
                  start: a.starts_at,
                  end: a.ends_at,
                  color: `${services.find((s) => s.id === a.service_id)?.color ?? "#28664f"}22`,
                  contrastColor: "#263e36",
                  startEditable:
                    ["booked", "confirmed"].includes(a.status) &&
                    (profile.role === "owner" || profile.id === a.operator_id),
                  durationEditable:
                    ["booked", "confirmed"].includes(a.status) &&
                    (profile.role === "owner" || profile.id === a.operator_id),
                  extendedProps: { service: a.service_name, status: a.status },
                }))}
              eventClick={(info) => {
                setSelectedId(info.event.id);
                if (info.event.start)
                  setDay(
                    localDay(info.event.start.toISOString(), tenant.timezone),
                  );
              }}
              dateClick={(info) => {
                const dayValue = info.dateStr.slice(0, 10);
                setDay(dayValue);
                setEditor({
                  date: info.allDay
                    ? `${dayValue}T09:00`
                    : instantToLocal(info.date.toISOString(), tenant.timezone),
                });
              }}
              eventDrop={(info) => void changeTime(info)}
              eventResize={(info) => void changeTime(info)}
              eventContent={(info) => (
                <div className="min-w-0 overflow-hidden px-0.5 py-0.5">
                  <div className="data-number truncate text-[11px] font-medium opacity-80">
                    {info.timeText}
                  </div>
                  <div className="truncate text-xs font-semibold">
                    {info.event.title}
                  </div>
                  <div className="mt-0.5 truncate text-[11px] opacity-80">
                    {String(info.event.extendedProps.service)}
                  </div>
                  {info.event.extendedProps.status === "confirmed" && (
                    <span className="mt-1 block text-[10px]">Confermato</span>
                  )}
                </div>
              )}
              noEventsContent="Nessun appuntamento in questo periodo"
            />
          </div>
          {!isPending && !activeCount && !error && (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t bg-[#fbfcfb] px-5 py-4">
              <p className="text-sm text-muted-foreground">
                La tua agenda ha spazio per nuovi incontri.
              </p>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setEditor({ date: `${day}T09:00` })}
              >
                <Plus />
                Prenota una seduta
              </Button>
            </div>
          )}
        </section>
        <aside className="hidden space-y-5 2xl:block">
          <section className="overflow-hidden rounded-xl border bg-white">
            <div className="border-b px-5 py-5">
              <div className="flex items-center justify-between">
                <h2 className="text-lg">La giornata</h2>
                <Sun className="size-4 text-[#9a8344]" />
              </div>
              <p className="mt-1 text-sm capitalize text-muted-foreground">
                {formatDate(`${day}T12:00:00Z`, tenant.timezone, {
                  weekday: "long",
                })}
              </p>
            </div>
            {isPending ? (
              <LoadingState label="Un momento…" />
            ) : dayAppointments.length ? (
              <div className="divide-y px-5">
                {dayAppointments.map((a) => (
                  <button
                    key={a.id}
                    onClick={() => setSelectedId(a.id)}
                    className="block w-full py-5 text-left"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="data-number text-xs font-semibold text-primary">
                        {formatTime(a.starts_at, tenant.timezone)}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {statusLabels[a.status]}
                      </span>
                    </div>
                    <div className="mt-3 flex items-center gap-2.5">
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[#f0edf5] text-[11px] text-[#716086]">
                        {initials(a.client.first_name, a.client.last_name)}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold">
                          {a.client.first_name} {a.client.last_name}
                        </span>
                        <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                          {a.service_name}
                        </span>
                      </span>
                    </div>
                    <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
                      <MapPin className="size-3" />
                      {a.location.name}
                    </p>
                  </button>
                ))}
              </div>
            ) : (
              <div className="px-5 py-10 text-center">
                <CalendarDays
                  className="mx-auto size-7 text-[#9caf9e]"
                  strokeWidth={1.5}
                />
                <p className="mt-4 text-sm font-medium">
                  Una giornata tutta da scrivere
                </p>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                  Gli appuntamenti di questo giorno compariranno qui.
                </p>
              </div>
            )}
          </section>
          <div className="px-1">
            <p className="flex items-center gap-2 text-xs font-medium text-[#526c5b]">
              <Clock3 className="size-3.5" />
              Ogni cosa al suo momento
            </p>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              Tocca uno spazio libero per prenotare. Apri una seduta per
              modificarla o ricordarla alla cliente.
            </p>
          </div>
        </aside>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2">
        {services
          .filter((s) => s.active)
          .map((s) => (
            <span
              key={s.id}
              className="inline-flex items-center gap-2 text-xs text-muted-foreground"
            >
              <span
                className="size-2 rounded-full"
                style={{ background: s.color }}
              />
              {s.name}
            </span>
          ))}
      </div>
      {editor && (
        <AppointmentEditor
          appointment={editor.appointment}
          initialDate={editor.date}
          onClose={() => setEditor(null)}
        />
      )}
      {selected && !editor && (
        <AppointmentDetails
          appointment={selected}
          onClose={() => setSelectedId(null)}
          onEdit={() => {
            setEditor({ appointment: selected });
            setSelectedId(null);
          }}
        />
      )}
      {showLinkedEditor && (
        <AppointmentEditor
          initialClient={initialClient.data.client}
          onClose={() => setHandledClient(initialClientId)}
        />
      )}
      {initialClient.error && (
        <p role="alert" className="mt-4 text-sm text-destructive">
          Non è stato possibile selezionare la cliente. Riprova dall’elenco
          clienti.
        </p>
      )}
    </div>
  );
}
