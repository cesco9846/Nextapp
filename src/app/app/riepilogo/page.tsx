"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { money } from "@/lib/dates";
import { ErrorState, LoadingState } from "@/components/states";
import { FormSelect } from "@/components/form-select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type Report = {
  year: number;
  years: number[];
  months: { month: number; count: number; value_cents: number }[];
};
const monthName = (month: number) =>
  new Intl.DateTimeFormat("it-IT", { month: "long", timeZone: "UTC" }).format(
    new Date(Date.UTC(2000, month - 1, 1)),
  );
export default function ReportPage() {
  const [year, setYear] = useState("");
  const { data, error, isPending, refetch } = useQuery({
    queryKey: ["report", year],
    queryFn: () => api<Report>(`/api/report${year ? `?year=${year}` : ""}`),
  });
  if (isPending) return <LoadingState label="Preparazione del riepilogo…" />;
  if (error || !data)
    return <ErrorState error={error} retry={() => void refetch()} />;
  const total = data.months.reduce((sum, m) => sum + m.value_cents, 0);
  const count = data.months.reduce((sum, m) => sum + m.count, 0);
  const maximum = Math.max(1, ...data.months.map((m) => m.value_cents));
  return (
    <div className="page-container max-w-6xl">
      <div className="flex flex-wrap items-start justify-between gap-5">
        <div>
          <h1 className="text-[32px]">Il valore del tuo lavoro</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Le sedute completate, mese dopo mese.
          </p>
        </div>
        <div className="w-28">
          <FormSelect
            id="report-year"
            value={String(data.year)}
            onChange={setYear}
            options={data.years.map((y) => ({
              value: String(y),
              label: String(y),
            }))}
          />
        </div>
      </div>
      <section className="mt-8 rounded-xl border bg-white p-6 sm:p-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm text-muted-foreground">
              Valore delle sedute completate nel {data.year}
            </p>
            <p className="data-number mt-3 font-display text-4xl">
              {money(total)}
            </p>
          </div>
          <p className="text-sm text-muted-foreground">
            {count} {count === 1 ? "seduta completata" : "sedute completate"}
          </p>
        </div>
        <div
          aria-hidden="true"
          className="mt-10 flex h-44 items-end gap-2 border-b px-1 sm:gap-4"
        >
          {data.months.map((m) => (
            <div key={m.month} className="flex h-full flex-1 items-end">
              <div
                className="w-full rounded-t bg-[#83b49a]"
                style={{
                  height: m.value_cents
                    ? `${Math.max(4, (m.value_cents / maximum) * 100)}%`
                    : "2px",
                }}
              />
            </div>
          ))}
        </div>
        <div aria-hidden="true" className="mt-3 flex gap-2 px-1 sm:gap-4">
          {data.months.map((m) => (
            <span
              key={m.month}
              className="flex-1 text-center text-[10px] capitalize text-muted-foreground sm:text-xs"
            >
              {monthName(m.month).slice(0, 3)}
            </span>
          ))}
        </div>
        <p className="mt-6 max-w-2xl text-xs leading-relaxed text-muted-foreground">
          Il riepilogo usa il prezzo registrato per ciascuna seduta completata.
          Mostra il valore delle prestazioni, non i pagamenti ricevuti.
          Appuntamenti futuri, annullati e assenze sono esclusi.
        </p>
      </section>
      <div className="mt-6 overflow-hidden rounded-xl border bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-6">Mese</TableHead>
              <TableHead className="text-right">Sedute</TableHead>
              <TableHead className="pr-6 text-right">Valore</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.months.map((m) => (
              <TableRow key={m.month}>
                <TableCell className="py-4 pl-6 capitalize">
                  {monthName(m.month)}
                </TableCell>
                <TableCell className="data-number text-right text-muted-foreground">
                  {m.count}
                </TableCell>
                <TableCell className="data-number pr-6 text-right font-medium">
                  {money(m.value_cents)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
