"use client";
import dynamic from "next/dynamic";
import { Suspense } from "react";
import { LoadingState } from "@/components/states";
const Agenda = dynamic(
  () => import("@/features/agenda/agenda").then((module) => module.Agenda),
  {
    ssr: false,
    loading: () => <LoadingState label="Prepariamo la tua agenda…" />,
  },
);
export default function AgendaPage() {
  return (
    <Suspense fallback={<LoadingState />}>
      <Agenda />
    </Suspense>
  );
}
