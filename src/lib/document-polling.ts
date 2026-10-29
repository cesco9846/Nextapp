import type { IntakeLink } from "./intake";
import type { ConsentMetadata } from "./consents";

export function hasOpenLink(
  links: IntakeLink[],
  appointment: number,
  preparation: number,
  now: number,
) {
  return links.some(
    (link) =>
      !link.used_at &&
      !link.revoked_at &&
      Date.parse(link.expires_at) > now &&
      link.appointment_version === appointment &&
      link.preparation_version === preparation,
  );
}
export function consentPollDelay(
  data: { links: IntakeLink[]; documents: ConsentMetadata[] } | undefined,
  appointment: number,
  preparation: number,
  now: number,
): number | false {
  if (!data || data.documents.some((doc) => doc.document_state === "pending"))
    return 10000;
  if (hasOpenLink(data.links, appointment, preparation, now)) return 10000;
  // Scheduled recovery may still fix a failed PDF; observe it at a lower rate.
  if (data.documents.some((doc) => doc.document_state === "failed"))
    return 60000;
  return false;
}
