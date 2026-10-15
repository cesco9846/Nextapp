"use client";
import { useEffect } from "react";
// Hide before a history snapshot; a restored document must obtain a fresh
// server response before becoming visible. No clinical DOM is restored to use.
export function usePrivateDocument() {
  useEffect(() => {
    const leaving = () => {
      document.documentElement.style.visibility = "hidden";
    };
    const returning = (event: PageTransitionEvent) => {
      if (event.persisted) window.location.reload();
      else document.documentElement.style.visibility = "";
    };
    window.addEventListener("pagehide", leaving);
    window.addEventListener("pageshow", returning);
    return () => {
      window.removeEventListener("pagehide", leaving);
      window.removeEventListener("pageshow", returning);
    };
  }, []);
}
