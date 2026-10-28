import { it, expect } from "vitest";
import { defaultPackages, suggestPackageUpdate } from "@/lib/packages";
it("a proposed library update preserves studio legal choices, needs a new review and leaves both source objects unchanged", () => {
  const current = {
    ...structuredClone(defaultPackages[0]),
    privacy_notice: "Informativa dello studio già revisionata",
    jurisdiction: "Ambito studio",
    minors_enabled: true,
    minimum_age: 16,
    representatives_required: 2,
    minors_basis: "Requisiti verificati dallo studio",
    reviewed: true,
  };
  const latest = {
    ...structuredClone(defaultPackages[0]),
    revision: 2,
    description: "Testo sorgente aggiornato per collaudo",
  };
  const before = JSON.stringify({ current, latest });
  const proposal = suggestPackageUpdate(current, latest);
  expect(proposal.revision).toBe(2);
  expect(proposal.reviewed).toBe(false);
  expect(proposal.privacy_notice).toBe(current.privacy_notice);
  expect(proposal.minimum_age).toBe(16);
  expect(proposal.representatives_required).toBe(2);
  expect(proposal.jurisdiction).toBe(current.jurisdiction);
  expect(JSON.stringify({ current, latest })).toBe(before);
  expect(() => suggestPackageUpdate(current, defaultPackages[1])).toThrow();
});
