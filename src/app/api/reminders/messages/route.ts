import { z } from "zod";
import { ApiError, checkDb, handleApi, json } from "@/server/http";
import { requireWorkspace } from "@/server/session";
import type { ReminderPage } from "@/features/reminders/types";

const cursorSchema = z.tuple([z.iso.datetime({ offset: true }), z.uuid()]);
const pageSize = 25;

export async function GET(request: Request) {
  return handleApi(async () => {
    const { db, profile } = await requireWorkspace(true);
    const params = new URL(request.url).searchParams;
    const filter = z
      .enum(["all", "attention"])
      .parse(params.get("filter") ?? "all");
    const cursor = params.get("cursor");
    let boundary: z.infer<typeof cursorSchema> | undefined;
    if (cursor !== null) {
      try {
        if (cursor.length > 256 || !/^[\w-]+$/.test(cursor)) throw new Error();
        boundary = cursorSchema.parse(
          JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")),
        );
      } catch {
        throw new ApiError(
          422,
          "La pagina richiesta non è valida. Torna agli invii recenti.",
        );
      }
    }
    // Session client + RLS. Never select envelopes, recipient addresses or provider diagnostics.
    let query = db
      .from("messages")
      .select(
        "id,status,scheduled_for,updated_at,failure_code,cancellation_requested_at,appointments(clients(id,first_name,last_name))",
      )
      .eq("tenant_id", profile.tenant_id)
      .order("scheduled_for", { ascending: false })
      .order("id", { ascending: false })
      .limit(pageSize + 1);
    if (filter === "attention")
      query = query.in("status", [
        "uncertain",
        "failed",
        "bounced",
        "processing",
      ]);
    if (boundary)
      query = query.or(
        `scheduled_for.lt.${boundary[0]},and(scheduled_for.eq.${boundary[0]},id.lt.${boundary[1]})`,
      );
    const result = await query;
    checkDb(result.error);
    const rows = result.data ?? [];
    const items = rows.slice(0, pageSize).map(({ appointments, ...row }) => ({
      ...row,
      client: appointments?.clients ?? null,
    }));
    const last = items.at(-1);
    return json({
      items,
      next_cursor:
        rows.length > pageSize && last
          ? Buffer.from(JSON.stringify([last.scheduled_for, last.id])).toString(
              "base64url",
            )
          : null,
    } satisfies ReminderPage);
  });
}
