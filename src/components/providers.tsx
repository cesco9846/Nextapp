"use client";
import { useEffect, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { browserSupabase } from "@/lib/supabase/browser";
import { InstallProvider } from "@/components/install-app";

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 20000,
            retry: 1,
            // A suspended PWA may return before staleTime expires. Revalidate
            // permissions and active views even when the memory cache is fresh.
            refetchOnWindowFocus: "always",
            refetchOnReconnect: "always",
          },
          mutations: { retry: false, networkMode: "always" },
        },
      }),
  );
  useEffect(() => {
    const revoked = () => {
      client.clear();
      window.location.replace(
        new URL("/accesso-sospeso", window.location.origin).href,
      );
    };
    window.addEventListener("glow:access-revoked", revoked);
    const expired = () => {
      client.clear();
      if (document.documentElement.dataset.glowHandoff === "true") return;
      if (window.location.pathname === "/invito") window.location.reload();
      else
        window.location.replace(
          new URL("/accedi", window.location.origin).href,
        );
    };
    window.addEventListener("glow:auth-required", expired);
    const {
      data: { subscription },
    } = browserSupabase().auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        client.clear();
        // Full navigation also discards the authenticated RSC/navigation memory.
        if (
          window.location.pathname.startsWith("/app") &&
          document.documentElement.dataset.glowHandoff !== "true"
        )
          window.location.replace(
            new URL("/accedi", window.location.origin).href,
          );
      }
    });
    return () => {
      subscription.unsubscribe();
      window.removeEventListener("glow:access-revoked", revoked);
      window.removeEventListener("glow:auth-required", expired);
    };
  }, [client]);
  return (
    <QueryClientProvider client={client}>
      <TooltipProvider>
        <InstallProvider>
          {children}
          <Toaster position="bottom-right" richColors />
        </InstallProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}
