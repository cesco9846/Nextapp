import { reminderInvocation } from "@/server/reminder-runner";
export const runtime = "nodejs";
export const maxDuration = 60;
export const POST = (request: Request) => reminderInvocation(request, "run");
