import { describe, expect, it } from "vitest";
import {
  appointmentSchema,
  appointmentUpdateSchema,
  clientSchema,
} from "@/lib/contracts";
import {
  addMinutes,
  instantToLocal,
  localToInstant,
  money,
  whatsappUrl,
} from "@/lib/dates";

describe("date and timezone boundaries", () => {
  it("interprets local studio time independently of the browser timezone", () => {
    expect(localToInstant("2026-10-15T10:00")).toBe("2026-10-15T08:00:00Z");
    expect(instantToLocal("2026-10-15T08:00:00Z")).toBe("2026-10-15T10:00");
  });
  it("rejects nonexistent spring hours instead of moving an appointment silently", () =>
    expect(() => localToInstant("2026-03-29T02:30")).toThrow());
  it("rejects ambiguous autumn hours", () =>
    expect(() => localToInstant("2026-10-25T02:30")).toThrow());
  it("adds actual elapsed duration across midnight", () =>
    expect(addMinutes("2026-10-15T23:30:00Z", 90)).toBe(
      "2026-10-16T01:00:00Z",
    ));
});
describe("contact validation", () => {
  it("normalizes an Italian mobile to E.164 and allows optional email", () =>
    expect(
      clientSchema.parse({
        first_name: "Elena",
        last_name: "Rossi",
        email: "",
        phone: "333 123 4567",
      }),
    ).toMatchObject({ phone: "+393331234567", email: null }));
  it("rejects an invalid telephone and unknown privileged fields", () => {
    expect(
      clientSchema.safeParse({
        first_name: "E",
        last_name: "R",
        email: "",
        phone: "123",
      }).success,
    ).toBe(false);
    expect(
      clientSchema.safeParse({
        first_name: "E",
        last_name: "R",
        email: "",
        phone: "",
        tenant_id: "other",
      }).success,
    ).toBe(false);
  });
  it("encodes WhatsApp text without inventing a send result", () => {
    const url = whatsappUrl("+393331234567", "Ciao Èva & Anna\nAlle 10:00?");
    expect(new URL(url!).pathname).toBe("/393331234567");
    expect(new URL(url!).searchParams.get("text")).toBe(
      "Ciao Èva & Anna\nAlle 10:00?",
    );
    expect(whatsappUrl("123", "test")).toBeNull();
  });
});
describe("appointment contracts", () => {
  const input = {
    client_id: "aaaaaaaa-3333-4333-8333-333333333333",
    service_id: "aaaaaaaa-2222-4222-8222-222222222222",
    location_id: "aaaaaaaa-1111-4111-8111-111111111111",
    operator_id: "11111111-1111-4111-8111-111111111111",
    starts_at: "2026-10-15T10:00:00Z",
    ends_at: "2026-10-15T11:00:00Z",
    price_cents: 5000,
  };
  it("rejects negative durations and caller-controlled tenant IDs", () => {
    expect(
      appointmentSchema.safeParse({ ...input, ends_at: input.starts_at })
        .success,
    ).toBe(false);
    expect(
      appointmentSchema.safeParse({ ...input, tenant_id: "other" }).success,
    ).toBe(false);
  });
  it("requires a version for a meaningful update", () => {
    expect(
      appointmentUpdateSchema.safeParse({ status: "cancelled" }).success,
    ).toBe(false);
    expect(appointmentUpdateSchema.safeParse({ version: 1 }).success).toBe(
      false,
    );
    expect(
      appointmentUpdateSchema.safeParse({ version: 1, status: "cancelled" })
        .success,
    ).toBe(true);
  });
  it("formats historical amounts with cents", () => {
    expect(money(12345)).toMatch(/123,45/);
  });
});
