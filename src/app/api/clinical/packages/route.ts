import { packageSaveSchema } from "@/lib/packages";
import { requireWorkspace } from "@/server/session";
import { checkDb, handleApi, json, readBody } from "@/server/http";
import { assertPackageText } from "@/server/package-text";
export async function GET() {
  return handleApi(async () => {
    const { db } = await requireWorkspace(true);
    const r = await db.rpc("consent_package_catalog");
    checkDb(r.error);
    return json(r.data);
  });
}
export async function POST(request: Request) {
  return handleApi(async () => {
    const b = await readBody(request, packageSaveSchema);
    await assertPackageText(b.content);
    const { db } = await requireWorkspace(true);
    const r = await db.rpc("save_consent_package", {
      p_id: b.id!,
      p_version: b.version,
      p_service_id: b.service_id,
      p_content: b.content,
    });
    checkDb(r.error);
    return json(r.data, 201);
  });
}
