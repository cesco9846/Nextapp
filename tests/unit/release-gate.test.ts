import { expect, it } from "vitest";
import { checkedReleaseSha } from "@/lib/release-gate";
const sha = "a".repeat(40);
const run = {
  id: 1,
  name: "Application checks",
  path: ".github/workflows/ci.yml",
  event: "push",
  head_branch: "main",
  head_sha: sha,
  status: "completed",
  conclusion: "success",
  repository: { full_name: "cesco9846/Nextapp" },
  head_repository: { full_name: "cesco9846/Nextapp" },
};
it("releases only the exact checked main revision and skips a superseded one", () => {
  expect(checkedReleaseSha(run, sha)).toBe(sha);
  expect(checkedReleaseSha(run, "b".repeat(40))).toBeNull();
});
it.each([
  { conclusion: "failure" },
  { status: "in_progress" },
  { event: "pull_request" },
  { head_branch: "feature" },
  { path: ".github/workflows/unreviewed.yml" },
  { head_repository: { full_name: "foreign/fork" } },
  { head_sha: "main" },
])("refuses unsafe release source %j", (change) => {
  expect(() => checkedReleaseSha({ ...run, ...change }, sha)).toThrow();
});
