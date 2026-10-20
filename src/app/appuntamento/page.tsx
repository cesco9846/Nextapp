import type { Metadata } from "next";
import { ClientAppointmentResponse } from "@/features/agenda/client-appointment-response";
export const metadata: Metadata = {
  title: "Il tuo appuntamento",
  referrer: "no-referrer",
  robots: { index: false, follow: false },
};
export default function Page() {
  return <ClientAppointmentResponse />;
}
