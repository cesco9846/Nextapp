import type { Metadata } from "next";
import { ClientIntake } from "@/features/intake/client-intake";
export const metadata: Metadata = {
  title: "Compilazione cliente",
  referrer: "no-referrer",
  robots: { index: false, follow: false },
};
export default function Page() {
  return <ClientIntake />;
}
