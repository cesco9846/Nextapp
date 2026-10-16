# Promemoria email — Resend e glowlabs.it

Il 16 ottobre 2026 l’utente ha ripreso la configurazione email, collegato
`glowlabs.it` a Resend e fornito `RESEND_API_KEY` tramite binding sicuro diretto.
Il mittente scelto dall’utente è **Glow <reminder@glowlabs.it>**. La chiave ha
permessi sending-only: la lettura `/domains` restituisce restricted_api_key,
mentre `/emails` accetta il mittente e il dominio. Non occorre ampliarne i permessi
per spedire; amministrazione webhook e SMTP Auth sono configurazioni separate.

## Integrazione W16.a

Adapter HTTP a origine fissa `https://api.resend.com/emails`, redirect vietati,
timeout/abort e nessun retry implicito. Snapshot `glow-reminder-v2` in SQL include
From, Reply-To, destinatario, oggetto e testo. Il Reply-To è l’indirizzo Auth
confermato della titolare attiva dello studio; non un indirizzo arbitrario
inserito da un’operatrice. Resta fissato nei retry. Il testo è generico: studio,
data/ora nella timezone dello studio e invito a contattarlo; nessun dato clinico,
nome cliente o servizio. Nessun HTML o template modificabile in questo incremento.

`GET/PUT /api/reminders/settings`: solo titolare, sessione/RLS, stessa origine
per scrivere, schema limitato a `enabled`. Restituisce anche mittente, Reply-To,
stato di verifica e interruttore operativo globale in sola lettura. Non abilita
il master switch e non crea reminder retroattivi. Interfaccia impostazioni e
stato messaggi ancora da collegare con shadcn e skill di stile nel seguito W16.

Chiave stabile `glow-reminder-v1/<message-id>`; la versione della chiave è distinta
dalla versione del contenuto. Idempotenza Resend valida **24 ore**, mentre il
motore ammette dispatch soltanto nella finestra di recupero di due ore W15.
Rifiuti documentati 429 consentono backoff; 400/401/403/422 con errore documentato
sono definitivi. Rete, risposta incompleta, 5xx e 409 restano incerti.

Resend non documenta un lookup autorevole per chiave. Un altro POST potrebbe
creare un’email dopo l’annullamento: non viene usato per riconciliare. Solo
l’evidenza webhook firmata e correlata può provare accettazione; se manca,
`unknown` resta visibile e non autorizza un nuovo invio. Snapshot v1 storici non
vengono trasformati silenziosamente in invii Resend.

## Webhook

Endpoint di produzione:
`https://glowlabs.it/api/webhooks/resend`.

Configurare in [Resend Webhooks](https://resend.com/webhooks) questi eventi:
`email.sent`, `email.delivered`, `email.bounced`, `email.complained`, `email.failed`,
`email.suppressed`. Copiare il signing secret esclusivamente nel binding sicuro
**RESEND_WEBHOOK_SECRET** dell’ambiente cloud. Il segreto dovrà essere distribuito
anche al runtime Vercel: configurazione sensitive/server-only completata e verificata.
La chiave sending-only non può creare o leggere questa configurazione.

Il route handler Node verifica il body originale con Svix 2.8, tolleranza tempo
e firme multiple, limite reale stream 64 KiB. Nessuna sessione professionale o
controllo Origin richiesto a Resend: l’autenticazione è la firma. Mancanza di
configurazione: 503; firma/body invalidi: 400; evento gestito/duplicato/estraneo:
204; errore DB: 503 per consentire il retry provider.

Dopo la verifica si conserva solo una proiezione minima: ID evento/provider,
outbox, tipo e orari. Tag opaco `glow_message_id`, From/To fissati, confine di
primo dispatch e identità provider devono coincidere. Subject, diagnosi bounce,
payload completo, indirizzi duplicati e firma non entrano nel registro eventi.
Il destinatario soppresso è invece conservato nello schema privato per tenant.

Deduplica globale dell’ID evento. La proiezione ha precedenza monotona:
sent < delivered < failed < bounced < suppressed < complained. Un evento tardivo
non cancella un fallimento definitivo. Un webhook prima dell’ack conserva la
lease; l’ack o il recupero successivo applicano l’evidenza senza un altro POST.
I conteggi CLI del batch descrivono gli esiti immediati dell’adapter; la salute
SQL e la riga messaggio rappresentano l’esito riconciliato autorevole.

Bounce Permanent, complaint e suppressed impediscono nuovi dispatch al medesimo
indirizzo normalizzato nello stesso studio e producono failure visibile nel
monitor. Il bounce Temporary non sopprime. La soppressione non viene aggirata
cambiando la chiave né cancellata automaticamente da un evento delivered.
Correzione destinatario e retention/cancellazione restano gestite separatamente.

## Prove reali e attivazione

Il simulatore ufficiale `delivered+glow-integration@resend.dev` ha accettato un
invio dal nuovo adapter con `reminder@glowlabs.it` (ID provider
`01a14505-0a62-71bb-9727-aaeda079575c`). Questo prova autenticazione e accettazione
del dominio/mittente; il webhook live resta una verifica separata. Nessuna fixture nel database ufficiale e nessun invio a clienti.

Comando riproducibile, usando lo stesso request-id per un retry entro 24h:

```sh
node --use-env-proxy --import tsx scripts/test-resend.ts --simulator --request-id 1728b6c4-21d3-43a2-8811-995d6f77a511
```

Dopo 24h non ripetere quel comando come prova di deduplica: la garanzia provider
è scaduta. Per un nuovo test usare consapevolmente un nuovo request-id.
`--inbox` richiede `RESEND_TEST_RECIPIENT` e un destinatario autorizzato; non
indovinare indirizzi dell’utente o prelevarli dai dati applicativi.

Prova separata alla casella autorizzata dall’utente accettata dal provider
(`01a14507-6f56-7184-b987-41988f8625c5`); **l’utente ha confermato la ricezione
nella posta in arrivo**, senza spam.

Webhook live configurato sul dominio canonico; simulazioni consegna/bounce
accettate e quattro chiamate aggiuntive alla RPC protetta osservate, senza
creare righe outbox/clienti/eventi sintetiche nel database ufficiale. La correlazione
su una riga reale è provata localmente; collaudo operativo completo prima dell’abilitazione.

Ancora necessari: schermata delle
impostazioni e degli esiti, runner continuo autenticato con hard timeout e canale
allarmi, prova operativa di arresto/restore. Gli interruttori ufficiali restano
OFF in questa consegna; la chiave da sola non attiva l’invio automatico.
Auth SMTP (conferma/recupero password) va collaudato separatamente.

Fonti ufficiali:
[invio](https://resend.com/docs/api-reference/emails/send-email),
[idempotenza](https://resend.com/docs/dashboard/emails/idempotency-keys),
[firme](https://resend.com/docs/dashboard/webhooks/verify-webhooks-requests),
[eventi](https://resend.com/docs/webhooks/emails/delivered),
[test ufficiali](https://resend.com/docs/dashboard/emails/send-test-emails).
