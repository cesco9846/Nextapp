import { Temporal } from "temporal-polyfill";
import { localToInstant } from "./dates";

export function initialAgendaRange(
  day: string,
  view: "timeGridDay" | "timeGridWeek",
  timezone: string,
) {
  const date = Temporal.PlainDate.from(day);
  const start =
    view === "timeGridDay" ? date : date.subtract({ days: date.dayOfWeek - 1 });
  const end = start.add({ days: view === "timeGridDay" ? 1 : 7 });
  return {
    start: new Date(localToInstant(`${start}T00:00`, timezone)).toISOString(),
    end: new Date(localToInstant(`${end}T00:00`, timezone)).toISOString(),
  };
}
