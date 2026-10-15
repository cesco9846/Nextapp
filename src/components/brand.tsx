import { cn } from "@/lib/utils";

export function Brand({
  compact = false,
  className,
}: {
  compact?: boolean;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <span
        className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary text-white"
        aria-hidden="true"
      >
        <svg width="23" height="23" viewBox="0 0 24 24" fill="none">
          <path
            d="M16.7 5.8A7.6 7.6 0 1 0 18.8 14H12"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M16.6 3v5h4.3"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      {!compact && (
        <span className="display-title text-[23px]">
          Glow<span className="ml-0.5 text-primary">.</span>
        </span>
      )}
    </span>
  );
}
