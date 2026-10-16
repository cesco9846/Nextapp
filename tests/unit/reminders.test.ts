import { describe, expect, it, vi } from "vitest";
import { runReminderBatch } from "@/reminders/worker";
import { TestReminderProvider } from "@/reminders/test-provider";
import type { ReminderStore, Claim } from "@/reminders/contracts";
const envelope = {
  version: "glow-reminder-v1" as const,
  to: "synthetic@example.invalid",
  subject: "Promemoria appuntamento" as const,
  text: "Promemoria generico",
};
function fixture(action: Claim["action"] = "send") {
  const job: Claim = {
    id: crypto.randomUUID(),
    claim: crypto.randomUUID(),
    key: `glow-reminder-v1/${crypto.randomUUID()}`,
    action,
    envelope: action === "reconcile" ? envelope : null,
  };
  const store: ReminderStore = {
    start: vi.fn(async () => true),
    claim: vi.fn().mockResolvedValueOnce(job).mockResolvedValue(null),
    begin: vi.fn(async () => envelope),
    finish: vi.fn(async () => {}),
    end: vi.fn(async () => {}),
  };
  const provider = new TestReminderProvider("http://127.0.0.1:54321");
  return { store, provider, job };
}
describe("Reminder execution safety", () => {
  it("rejects invalid batch and timeout bounds before touching the outbox", async () => {
    const f = fixture();
    await expect(
      runReminderBatch(f.store, f.provider, { timeoutMs: NaN }),
    ).rejects.toThrow("Invalid worker bounds");
    await expect(
      runReminderBatch(f.store, f.provider, { limit: 11 }),
    ).rejects.toThrow("Invalid worker bounds");
    expect(f.store.start).not.toHaveBeenCalled();
  });
  it("does nothing when delivery is disabled", async () => {
    const f = fixture();
    vi.mocked(f.store.start).mockResolvedValue(false);
    expect((await runReminderBatch(f.store, f.provider)).mode).toBe("disabled");
    expect(f.store.claim).not.toHaveBeenCalled();
    expect(f.provider.calls).toBe(0);
  });
  it("does not send when the final schedule gate refuses", async () => {
    const f = fixture();
    vi.mocked(f.store.begin).mockResolvedValue(null);
    expect((await runReminderBatch(f.store, f.provider)).cancelled).toBe(1);
    expect(f.provider.calls).toBe(0);
  });
  it("looks up uncertainty instead of resubmitting", async () => {
    const f = fixture("reconcile");
    await runReminderBatch(f.store, f.provider);
    expect(f.provider.calls).toBe(0);
    expect(f.provider.lookups).toBe(1);
    expect(f.store.finish).toHaveBeenCalledWith(f.job, { kind: "unknown" });
  });
  it("turns acceptance followed by timeout into uncertainty, not a retry", async () => {
    const f = fixture();
    const provider = new TestReminderProvider(
      "http://127.0.0.1:54321",
      "accept-then-timeout",
    );
    await runReminderBatch(f.store, provider, { timeoutMs: 20 });
    expect(provider.accepted.size).toBe(1);
    expect(f.store.finish).toHaveBeenCalledWith(f.job, { kind: "unknown" });
    expect(provider.calls).toBe(1);
  });
  it("times out even an adapter that ignores abort, leaving a late result to reconciliation", async () => {
    const f = fixture();
    const send = vi.fn(
      () =>
        new Promise<{ kind: "accepted"; providerId: string }>((resolve) =>
          setTimeout(
            () => resolve({ kind: "accepted", providerId: "late-123" }),
            40,
          ),
        ),
    );
    await runReminderBatch(
      f.store,
      { name: "test-v1", send, lookup: async () => ({ kind: "unknown" }) },
      { timeoutMs: 10 },
    );
    expect(f.store.finish).toHaveBeenCalledTimes(1);
    expect(f.store.finish).toHaveBeenCalledWith(f.job, { kind: "unknown" });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(f.store.finish).toHaveBeenCalledTimes(1);
  });
  it("stops on lost SQL acknowledgement without converting acceptance into a retry", async () => {
    const f = fixture();
    vi.mocked(f.store.finish).mockRejectedValue(
      new Error("lost acknowledgement"),
    );
    await expect(runReminderBatch(f.store, f.provider)).rejects.toThrow(
      "inspect persisted state",
    );
    expect(f.provider.calls).toBe(1);
    expect(f.store.claim).toHaveBeenCalledTimes(1);
    expect(f.store.end).toHaveBeenCalledWith(expect.any(String), false);
  });
  it("does not work after shutdown and refuses a remote simulator", async () => {
    const f = fixture();
    const controller = new AbortController();
    controller.abort();
    await runReminderBatch(f.store, f.provider, { signal: controller.signal });
    expect(f.store.start).not.toHaveBeenCalled();
    expect(
      () =>
        new TestReminderProvider("https://mexokvvvxdyekauupwvt.supabase.co"),
    ).toThrow("local");
  });
});
