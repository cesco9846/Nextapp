import { z } from "zod";
import { ResendReminderProvider } from "../src/reminders/resend-provider";
const args = process.argv.slice(2);
if (
  args.length !== 3 ||
  !["--simulator", "--inbox"].includes(args[0]) ||
  args[1] !== "--request-id"
)
  throw new Error(
    "Use --simulator|--inbox --request-id <uuid>; inbox requires an authorized RESEND_TEST_RECIPIENT",
  );
const id = z.uuid().parse(args[2]);
const simulator = args[0] === "--simulator";
const to = simulator
  ? "delivered+glow-integration@resend.dev"
  : z.email().parse(process.env.RESEND_TEST_RECIPIENT);
const provider = new ResendReminderProvider(
  process.env.RESEND_API_KEY ?? "",
  async () => ({ kind: "unknown" }),
);
const result = await provider.send(
  {
    version: "glow-reminder-v2",
    from: "Glow <reminder@glowlabs.it>",
    to,
    // Synthetic connection test, separate from confirmed studio Reply-To snapshots.
    reply_to: to,
    subject: "Promemoria appuntamento",
    text: "Questo è un messaggio di prova di Glow. Verifica il collegamento con Resend e il mittente reminder@glowlabs.it. Non riguarda un appuntamento reale e non contiene dati di clienti.",
  },
  `glow-reminder-v1/${id}`,
  AbortSignal.timeout(8000),
);
console.log(
  JSON.stringify({
    test: simulator ? "provider-simulator" : "authorized-inbox",
    request_id: id,
    ...result,
  }),
);
if (result.kind !== "accepted") process.exitCode = 2;
// A timeout/unknown must be investigated using this request ID, not a new key.
