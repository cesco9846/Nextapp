import { serverSupabase } from "@/server/supabase";
import { AcceptInvitation } from "@/features/team/accept-invitation";

export default async function InvitationPage() {
  const db = await serverSupabase();
  const {
    data: { user },
  } = await db.auth.getUser();
  return (
    <AcceptInvitation
      email={user?.email ?? null}
      verified={!!user?.email_confirmed_at}
    />
  );
}
