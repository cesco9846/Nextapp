import { expect, it } from "vitest";
import { initialAgendaRange } from "@/lib/calendar-range";

it("starts the Italian week on Monday and includes the DST fall-back hour", () => {
  expect(
    initialAgendaRange("2026-10-25", "timeGridWeek", "Europe/Rome"),
  ).toEqual({
    start: "2026-10-18T22:00:00.000Z",
    end: "2026-10-25T23:00:00.000Z",
  });
});
it("a mobile day is a civil day, not a fixed 24-hour window", () => {
  const spring = initialAgendaRange("2026-03-29", "timeGridDay", "Europe/Rome");
  expect(Date.parse(spring.end) - Date.parse(spring.start)).toBe(23 * 3600000);
  const fall = initialAgendaRange("2026-10-25", "timeGridDay", "Europe/Rome");
  expect(Date.parse(fall.end) - Date.parse(fall.start)).toBe(25 * 3600000);
});
