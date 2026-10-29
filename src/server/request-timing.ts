import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";

type Metric = "auth" | "profile";
const requests = new AsyncLocalStorage<Partial<Record<Metric, number>>>();

export async function measureRequest<T>(
  name: Metric,
  work: () => Promise<T>,
): Promise<T> {
  const start = performance.now();
  try {
    return await work();
  } finally {
    const request = requests.getStore();
    if (request)
      request[name] = (request[name] ?? 0) + performance.now() - start;
  }
}

export function withApiTiming<T extends Response>(work: () => Promise<T>) {
  return requests.run({}, async () => {
    const start = performance.now();
    const response = await work();
    const metrics = requests.getStore()!;
    response.headers.set(
      "Server-Timing",
      [
        `api;dur=${(performance.now() - start).toFixed(1)}`,
        ...Object.entries(metrics).map(
          ([name, duration]) => `${name};dur=${duration.toFixed(1)}`,
        ),
      ].join(", "),
    );
    return response;
  });
}
