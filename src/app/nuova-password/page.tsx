import { AuthForm } from "@/components/auth-form";
import { Brand } from "@/components/brand";
export default function ResetPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-12 px-6">
      <Brand />
      <AuthForm recovery />
    </main>
  );
}
