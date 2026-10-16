import type {
  Envelope,
  ReminderProvider,
  Result,
  LookupResult,
} from "./contracts";
// No network transport. Construction requires an explicit loopback target.
// A real provider adapter is W16; this class cannot submit real email.
export class TestReminderProvider implements ReminderProvider {
  readonly name = "test-v1";
  readonly accepted = new Map<string, { id: string; envelope: Envelope }>();
  calls = 0;
  lookups = 0;
  constructor(
    target: string,
    private behavior:
      | "accept"
      | "retryable"
      | "reject"
      | "accept-then-timeout"
      | "unknown" = "accept",
  ) {
    if (!["127.0.0.1", "localhost"].includes(new URL(target).hostname))
      throw new Error("Simulation requires local Supabase");
  }
  async send(
    envelope: Envelope,
    key: string,
    signal: AbortSignal,
  ): Promise<Result> {
    this.calls++;
    if (this.behavior === "retryable") return { kind: "retryable" };
    if (this.behavior === "reject") return { kind: "rejected" };
    if (this.behavior === "unknown")
      throw new Error("Synthetic network interruption");
    let prior = this.accepted.get(key);
    if (prior && JSON.stringify(prior.envelope) !== JSON.stringify(envelope))
      return { kind: "rejected" };
    if (!prior) {
      prior = { id: crypto.randomUUID(), envelope };
      this.accepted.set(key, prior);
    }
    if (this.behavior === "accept-then-timeout")
      return new Promise((resolve) => {
        if (signal.aborted) resolve({ kind: "unknown" });
        else
          signal.addEventListener("abort", () => resolve({ kind: "unknown" }), {
            once: true,
          });
      });
    return { kind: "accepted", providerId: prior.id };
  }
  async lookup(key: string): Promise<LookupResult> {
    this.lookups++;
    const item = this.accepted.get(key);
    // This in-memory simulator has no cross-process history. Absence is NOT
    // authoritative after restart, so it can never justify a new submission.
    return item
      ? { kind: "accepted", providerId: item.id }
      : { kind: "unknown" };
  }
}
