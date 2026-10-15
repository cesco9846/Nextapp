"use client";
import { AlertCircle, LoaderCircle, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function LoadingState({
  label = "Caricamento in corso…",
}: {
  label?: string;
}) {
  return (
    <div
      className="flex min-h-48 items-center justify-center gap-3 text-muted-foreground"
      role="status"
    >
      <LoaderCircle className="size-5 animate-spin" />
      {label}
    </div>
  );
}
export function ErrorState({
  error,
  retry,
}: {
  error?: Error | null;
  retry?: () => void;
}) {
  return (
    <div
      className="flex min-h-48 flex-col items-center justify-center gap-3 p-6 text-center"
      role="alert"
    >
      <AlertCircle className="size-7 text-destructive" />
      <p className="max-w-md text-sm">
        {error?.message ?? "Non è stato possibile caricare i dati."}
      </p>
      {retry && (
        <Button variant="outline" onClick={retry}>
          Riprova
        </Button>
      )}
    </div>
  );
}
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  compact = false,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: React.ReactNode;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center",
        compact ? "px-5 py-10" : "min-h-80 px-6 py-12",
      )}
    >
      <div className="mb-5 flex size-14 items-center justify-center rounded-2xl bg-secondary text-primary">
        <Icon className="size-6" strokeWidth={1.5} />
      </div>
      <h2 className="text-xl">{title}</h2>
      <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
        {description}
      </p>
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}
