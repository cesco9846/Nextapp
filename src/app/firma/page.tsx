import type { Metadata } from "next";
import { ClientSignature } from "@/features/consents/client-signature";
export const metadata: Metadata = {
  title: "Firma il consenso | Glow",
  robots: { index: false, follow: false },
};
export default function SignaturePage() {
  return <ClientSignature />;
}
