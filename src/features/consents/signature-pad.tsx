"use client";
import { useEffect, useRef, useState } from "react";
import { Eraser } from "lucide-react";
import type { Handwriting } from "@/lib/consents";
import { Button } from "@/components/ui/button";

export function SignaturePad({
  value,
  onChange,
  disabled = false,
}: {
  value: Handwriting;
  onChange: (v: Handwriting) => void;
  disabled?: boolean;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const current = useRef<[number, number][]>([]);
  const pointer = useRef<number | null>(null);
  const [keyboard, setKeyboard] = useState(false);
  const cursor = useRef<[number, number]>([0.2, 0.5]);
  const [full, setFull] = useState(false);
  function redraw(strokes: Handwriting) {
    const ctx = canvas.current?.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, 1000, 400);
    ctx.strokeStyle = "#263e36";
    ctx.lineWidth = 4;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (const stroke of strokes) {
      ctx.beginPath();
      stroke.forEach(([x, y], i) =>
        i ? ctx.lineTo(x * 1000, y * 400) : ctx.moveTo(x * 1000, y * 400),
      );
      ctx.stroke();
    }
  }
  useEffect(() => {
    redraw(value);
  }, [value]);
  const rounded = (n: number) =>
    Math.round(Math.max(0, Math.min(1, n)) * 1000) / 1000;
  const locate = (
    e: React.PointerEvent<HTMLCanvasElement>,
  ): [number, number] => {
    const r = e.currentTarget.getBoundingClientRect();
    return [
      rounded((e.clientX - r.left) / r.width),
      rounded((e.clientY - r.top) / r.height),
    ];
  };
  function append(point: [number, number]) {
    if (
      value.flat().length + current.current.length >= 2000 ||
      current.current.length >= 500
    ) {
      setFull(true);
      return;
    }
    current.current.push(point);
    redraw([...value, current.current]);
  }
  function finish() {
    if (current.current.length >= 2) onChange([...value, [...current.current]]);
    current.current = [];
    pointer.current = null;
    setKeyboard(false);
  }
  return (
    <div>
      <canvas
        ref={canvas}
        width={1000}
        height={400}
        tabIndex={disabled ? -1 : 0}
        role="application"
        aria-label="Spazio per la firma"
        aria-describedby="signature-help"
        aria-disabled={disabled}
        className="block aspect-[5/2] h-auto w-full touch-none rounded-xl border border-input bg-white outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        onPointerDown={(e) => {
          if (disabled || value.length >= 40) return;
          e.preventDefault();
          pointer.current = e.pointerId;
          e.currentTarget.setPointerCapture(e.pointerId);
          current.current = [locate(e)];
        }}
        onPointerMove={(e) => {
          if (!disabled && pointer.current === e.pointerId) append(locate(e));
        }}
        onPointerUp={(e) => {
          if (pointer.current === e.pointerId) finish();
        }}
        onPointerCancel={() => {
          current.current = [];
          pointer.current = null;
          redraw(value);
        }}
        onKeyDown={(e) => {
          if (disabled) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            if (keyboard) finish();
            else if (value.length < 40) {
              current.current = [cursor.current];
              setKeyboard(true);
            }
            return;
          }
          const steps: Record<string, [number, number]> = {
            ArrowLeft: [-0.02, 0],
            ArrowRight: [0.02, 0],
            ArrowUp: [0, -0.05],
            ArrowDown: [0, 0.05],
          };
          const step = steps[e.key];
          if (!step) return;
          e.preventDefault();
          cursor.current = [
            rounded(cursor.current[0] + step[0]),
            rounded(cursor.current[1] + step[1]),
          ];
          if (keyboard) append(cursor.current);
        }}
        onBlur={() => {
          if (keyboard) finish();
        }}
      />
      <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
        <p
          id="signature-help"
          className="max-w-prose flex-1 text-sm leading-relaxed text-muted-foreground"
        >
          Firma con il dito, la penna o il mouse. Con la tastiera: Invio per
          iniziare, frecce per tracciare, Invio per terminare.
        </p>
        <Button
          type="button"
          variant="outline"
          disabled={disabled || !value.length}
          onClick={() => {
            current.current = [];
            pointer.current = null;
            setKeyboard(false);
            setFull(false);
            onChange([]);
          }}
        >
          <Eraser />
          Cancella firma
        </Button>
      </div>
      {keyboard && (
        <p role="status" className="mt-2 text-sm">
          Stai tracciando la firma con le frecce. Premi Invio per terminare il
          tratto.
        </p>
      )}
      {full && (
        <p role="status" className="mt-2 text-sm">
          Spazio per i tratti esaurito. Se necessario cancella la firma e
          riprova.
        </p>
      )}
    </div>
  );
}
