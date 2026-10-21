import { describe, expect, it } from "vitest";
import {
  csvCell,
  csvRows,
  exportFileSchema,
  privacySettingsInput,
} from "@/lib/privacy";

describe("portable CSV", () => {
  it.each([
    '=HYPERLINK("https://example.invalid")',
    "+393331234567",
    "-42",
    "@SUM(1)",
    "  =1+1",
    "\t=1",
    "\rordinary",
    "\nordinary",
    "\u0001+1",
  ])("neutralizes spreadsheet prefixes: %j", (value) => {
    expect(csvCell(value)).toBe(`"'${value.replaceAll('"', '""')}"`);
  });
  it("escapes commas, quotes and newlines without changing ordinary names", () => {
    expect(csvCell('Elena, "E"')).toBe('"Elena, ""E"""');
    expect(csvRows(["Nome"], [["Elena"], [null]])).toBe(
      '\ufeff"Nome"\r\n"Elena"\r\n""\r\n',
    );
  });
});
describe("privacy boundaries", () => {
  it("permits an unfinished retention draft without invented terms", () => {
    expect(
      privacySettingsInput.parse({
        version: 0,
        rules: {
          contacts: { months: null, basis: "" },
          clinical: { months: null, basis: "" },
          audit: { months: null, basis: "" },
        },
        notice: "",
        contact_email: "",
        reviewed: false,
      }).reviewed,
    ).toBe(false);
  });
  it("rejects paths outside the fixed export namespaces", () => {
    const file = {
      id: crypto.randomUUID(),
      bucket: "glow-private",
      path: `${crypto.randomUUID()}/${crypto.randomUUID()}/image`,
      name: `allegati/${crypto.randomUUID()}.jpg`,
      sha256: "a".repeat(64),
      size: 100,
    };
    expect(exportFileSchema.safeParse(file).success).toBe(true);
    expect(
      exportFileSchema.safeParse({ ...file, name: "../../account.csv" })
        .success,
    ).toBe(false);
    expect(
      exportFileSchema.safeParse({
        ...file,
        path: "https://example.invalid/file",
      }).success,
    ).toBe(false);
    expect(
      exportFileSchema.safeParse({ ...file, bucket: "public" }).success,
    ).toBe(false);
  });
});
