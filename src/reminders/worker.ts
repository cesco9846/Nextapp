import type {
  ReminderProvider,
  ReminderStore,
  Result,
  LookupResult,
} from "./contracts";
// No timers or queues survive this bounded invocation. Scheduling belongs to
// the runner; persisted SQL state is the source of truth across processes.
async function bounded<T>(
  invoke: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
): Promise<T | { kind: "unknown" }> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<{ kind: "unknown" }>((resolve) => {
    timer = setTimeout(() => {
      controller.abort();
      resolve({ kind: "unknown" });
    }, timeoutMs);
  });
  try {
    return await Promise.race([
      Promise.resolve()
        .then(() => invoke(controller.signal))
        .catch(() => ({ kind: "unknown" as const })),
      timeout,
    ]);
  } finally {
    clearTimeout(timer);
  }
}
export async function runReminderBatch(
  store: ReminderStore,
  provider: ReminderProvider,
  options: {
    limit?: number;
    timeoutMs?: number;
    budgetMs?: number;
    signal?: AbortSignal;
  } = {},
) {
  const limit = options.limit ?? 5,
    timeout = options.timeoutMs ?? 8000,
    budget = options.budgetMs ?? 45000;
  if (
    !Number.isFinite(timeout) ||
    !Number.isFinite(budget) ||
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 10 ||
    timeout < 1 ||
    timeout > 10000 ||
    budget < 1 ||
    budget > 45000
  )
    throw new Error("Invalid worker bounds");
  const run = crypto.randomUUID();
  const counts = {
    mode: "disabled" as "disabled" | "enabled",
    claimed: 0,
    accepted: 0,
    uncertain: 0,
    deferred: 0,
    cancelled: 0,
  };
  if (options.signal?.aborted) return counts;
  if (!(await store.start(run, provider.name))) return counts;
  counts.mode = "enabled";
  const deadline = Date.now() + budget;
  try {
    for (
      let i = 0;
      i < limit && !options.signal?.aborted && Date.now() + timeout < deadline;
      i++
    ) {
      const job = await store.claim(run);
      if (!job) break;
      counts.claimed++;
      // An aborted invocation leaves a claimed lease recoverable without sending.
      if (options.signal?.aborted) break;
      let result: Result | LookupResult;
      if (job.action === "reconcile")
        result = await bounded(
          (signal) => provider.lookup(job.key, signal),
          timeout,
        );
      else {
        const envelope = await store.begin(job);
        if (!envelope) {
          counts.cancelled++;
          continue;
        }
        // Once the SQL dispatch boundary commits, cancellation cannot recall an
        // external request. A crash in this gap is conservatively reconciled.
        result = await bounded(
          (signal) => provider.send(envelope, job.key, signal),
          timeout,
        );
      }
      // A lost DB acknowledgement stops the batch. Never turn an accepted result
      // into a retry; the lease recovers through provider reconciliation.
      await store.finish(job, result);
      if (result.kind === "accepted") counts.accepted++;
      else if (result.kind === "unknown") counts.uncertain++;
      else counts.deferred++;
    }
    await store.end(run, true);
    return counts;
  } catch {
    try {
      await store.end(run, false);
    } catch {
      /* The absent heartbeat itself degrades health. */
    }
    throw new Error(
      "Reminder batch incomplete; inspect persisted state before retrying",
    );
  }
}
