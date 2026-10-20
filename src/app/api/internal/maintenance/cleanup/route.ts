import { maintenanceInvocation } from "@/server/maintenance-runner";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(request: Request) {
  return maintenanceInvocation(request, "cleanup");
}
