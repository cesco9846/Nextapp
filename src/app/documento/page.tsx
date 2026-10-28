import type { Metadata } from "next";
import { ClientPacket } from "@/features/packages/client-packet";
export const metadata: Metadata = {
  title: "Il tuo modulo | Glow",
  referrer: "no-referrer",
  robots: { index: false, follow: false },
};
export default function Page() {
  return <ClientPacket />;
}
