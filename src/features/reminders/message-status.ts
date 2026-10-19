import type { ReminderMessage } from "./types";

export function messageStatus(message: ReminderMessage) {
  const status: Record<string, [string, string]> = {
    queued: [
      "In programma",
      "L’invio è previsto all’orario indicato, se il servizio e i promemoria dello studio sono attivi.",
    ],
    processing: [
      "In elaborazione",
      "L’esito non è ancora disponibile. Aggiorna tra poco prima di contattare la cliente.",
    ],
    accepted: [
      "Accettata per l’invio",
      "Il servizio email ha accettato il messaggio. La consegna non è ancora confermata.",
    ],
    delivered: [
      "Consegnata",
      "Il server di posta della destinataria ha ricevuto il messaggio. Non conferma la lettura o la presenza nella posta in arrivo.",
    ],
    uncertain: [
      "Esito da verificare",
      "L’email potrebbe essere partita. Attendi la verifica dell’assistenza prima di inviare un altro promemoria.",
    ],
    bounced: [
      "Non recapitata",
      "Controlla il recapito con la cliente e contatta l’assistenza. Il promemoria non viene reinviato da questa schermata.",
    ],
    failed: [
      "Invio non riuscito",
      "Contatta l’assistenza per verificare il problema. Il promemoria non viene reinviato da questa schermata.",
    ],
    cancelled: ["Annullata", "Il promemoria è stato fermato prima dell’invio."],
    skipped: [
      "Non inviata",
      "Le condizioni o i tempi per inviare il promemoria non erano più validi.",
    ],
  };
  const [label, detail] = status[message.status] ?? [
    "Stato da verificare",
    "Aggiorna gli esiti o contatta l’assistenza.",
  ];
  let description = detail;
  if (message.failure_code === "no_recipient")
    description =
      "Il recapito email non era disponibile. Controlla la scheda della cliente.";
  if (message.failure_code === "recipient_changed")
    description =
      "Il recapito della cliente è cambiato. Il messaggio preparato per il vecchio indirizzo non viene inviato.";
  if (
    [
      "recipient_suppressed",
      "provider_suppressed",
      "provider_complained",
    ].includes(message.failure_code ?? "")
  )
    description =
      "Gli invii a questo indirizzo sono bloccati. Contatta l’assistenza prima di inviare altre email alla cliente.";
  if (message.failure_code === "delivery_window_expired")
    description =
      "È trascorso il tempo utile per questo promemoria. Non verrà inviato in ritardo.";
  if (
    message.cancellation_requested_at &&
    [
      "processing",
      "uncertain",
      "accepted",
      "delivered",
      "bounced",
      "failed",
    ].includes(message.status)
  )
    description +=
      " È stato richiesto l’annullamento, ma un’email già partita non può essere richiamata.";
  return {
    label,
    description,
    attention: ["uncertain", "failed", "bounced"].includes(message.status),
  };
}
