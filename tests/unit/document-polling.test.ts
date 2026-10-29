import { expect, it } from "vitest";
import { consentPollDelay, hasOpenLink } from "@/lib/document-polling";
import type { ConsentMetadata } from "@/lib/consents";
import type { IntakeLink } from "@/lib/intake";

const now = Date.parse("2026-10-29T12:00Z");
const link = {
  id: crypto.randomUUID(),
  mode: "link",
  created_at: new Date(now).toISOString(),
  expires_at: new Date(now + 3600000).toISOString(),
  revoked_at: null,
  used_at: null,
  appointment_version: 1,
  preparation_version: 1,
  version: 1,
} satisfies IntakeLink;
const doc = {
  id: crypto.randomUUID(),
  signed_at: new Date(now).toISOString(),
  preparation_version: 1,
  previous_id: null,
  document_state: "pending",
  content_hash: "a".repeat(64),
} satisfies ConsentMetadata;
it("does not stop at signature receipt while the PDF is pending or recovering", () => {
  expect(
    consentPollDelay(
      {
        links: [{ ...link, used_at: new Date(now).toISOString() }],
        documents: [doc],
      },
      1,
      1,
      now,
    ),
  ).toBe(10000);
  expect(
    consentPollDelay(
      { links: [], documents: [{ ...doc, document_state: "failed" }] },
      1,
      1,
      now,
    ),
  ).toBe(60000);
  expect(
    consentPollDelay(
      { links: [], documents: [{ ...doc, document_state: "ready" }] },
      1,
      1,
      now,
    ),
  ).toBe(false);
});
it("stops completed/expired/revoked/stale links and restarts for a new valid one", () => {
  expect(hasOpenLink([link], 1, 1, now)).toBe(true);
  expect(
    hasOpenLink([{ ...link, used_at: new Date(now).toISOString() }], 1, 1, now),
  ).toBe(false);
  expect(
    hasOpenLink(
      [{ ...link, revoked_at: new Date(now).toISOString() }],
      1,
      1,
      now,
    ),
  ).toBe(false);
  expect(hasOpenLink([link], 1, 1, now + 3600000)).toBe(false);
  expect(hasOpenLink([link], 2, 1, now)).toBe(false);
  expect(consentPollDelay({ links: [], documents: [] }, 1, 1, now)).toBe(false);
  expect(consentPollDelay({ links: [link], documents: [] }, 1, 1, now)).toBe(
    10000,
  );
});
