import { Temporal } from "temporal-polyfill";

export const DEFAULT_TIMEZONE = "Europe/Rome";

export function localToInstant(value: string, timezone = DEFAULT_TIMEZONE) {
  return Temporal.PlainDateTime.from(value)
    .toZonedDateTime(timezone, { disambiguation: "reject" })
    .toInstant()
    .toString();
}
export function instantToLocal(value: string, timezone = DEFAULT_TIMEZONE) {
  return Temporal.Instant.from(value)
    .toZonedDateTimeISO(timezone)
    .toPlainDateTime()
    .toString({ smallestUnit: "minute" });
}
export function addMinutes(value: string, minutes: number) {
  return Temporal.Instant.from(value).add({ minutes }).toString();
}
export function formatTime(value: string, timezone = DEFAULT_TIMEZONE) {
  return new Intl.DateTimeFormat("it-IT", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
export function formatDate(
  value: string,
  timezone = DEFAULT_TIMEZONE,
  options: Intl.DateTimeFormatOptions = {},
) {
  return new Intl.DateTimeFormat("it-IT", {
    timeZone: timezone,
    day: "numeric",
    month: "long",
    ...options,
  }).format(new Date(value));
}
export function money(cents: number) {
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: cents % 100 ? 2 : 0,
  }).format(cents / 100);
}
export function initials(first: string, last = "") {
  return (first.slice(0, 1) + last.slice(0, 1)).toLocaleUpperCase("it-IT");
}
export function whatsappUrl(phone: string, message: string) {
  if (!/^\+[1-9]\d{6,14}$/.test(phone)) return null;
  return `https://wa.me/${phone.slice(1)}?text=${encodeURIComponent(message)}`;
}
