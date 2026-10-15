# Mittente dei promemoria — proposta, non scelta definitiva

Domanda dell’utente del 15 ottobre 2026: ogni professionista può usare la propria
email oppure serve un account Resend, un dominio e un indirizzo noreply?

Entrambe le strade sono possibili. Resend è un provider possibile, non un vincolo
tecnico del prodotto. Non è stato creato alcun account o attivato un invio reale.

## Proposta per la prima versione

Un account del provider gestito da Glow, con un dominio o sottodominio verificato
dell’app e mittente come `promemoria@<dominio-app>`. Il nome visualizzato può
identificare lo studio: “Studio Rossi tramite Glow”. Ogni tenant ha un Reply-To
verificato e le risposte delle clienti arrivano alla professionista. La verifica
serve a evitare di dirottare risposte verso indirizzi non controllati dallo studio.

Non è necessario usare `noreply`; il Reply-To non modifica il vero indirizzo From.
Il promemoria rimane generico, senza anamnesi, foto o risposte sanitarie. Ogni
messaggio è tracciato nella outbox del suo studio; l’accettazione del provider
rimane distinta dalla consegna.

Questa opzione evita collegamenti OAuth e la gestione iniziale di numerose
caselle, lasciando la migrazione verso mittenti dedicati possibile per tenant.
La proposta non autorizza acquisto del dominio o attivazione di servizi a pagamento.

## Alternative

| Opzione                                 | Mittente reale                       | Configurazione necessaria                                                                                                                                                                                    |
| --------------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Dominio Glow condiviso, Reply-To studio | Dominio verificato Glow              | Provider e DNS del dominio app; indirizzo risposte verificato per studio.                                                                                                                                    |
| Dominio della singola professionista    | Per esempio `appuntamenti@studio.it` | Verifica DNS di ciascun dominio e gestione dello stato dei mittenti per tenant; account del provider non necessariamente separati. Limiti dipendono dal piano del provider.                                  |
| Casella personale Gmail/Outlook         | La casella collegata                 | OAuth e permessi di invio, token cifrati/rinnovo/revoca, limiti e gestione degli errori del provider. SMTP è un’alternativa quando il fornitore lo supporta. Non raccogliere normali password della casella. |

Resend richiede un dominio controllato e verificato per il From. Non basta
inserire un indirizzo Gmail/Outlook personale nel campo mittente per inviare
con quell’identità attraverso Resend. I collegamenti Gmail/Outlook sarebbero
integrazioni distinte, implementate mediante le rispettive API o SMTP supportato.

## Prima dell’attivazione (W15–W17)

- Confermare modello dei mittenti, provider, dominio e casella che riceve le risposte.
- Configurare DNS/autenticazione del dominio secondo il provider e verificare
  una consegna reale verso destinatari di prova autorizzati.
- Implementare adapter del provider e worker con lease, retry, idempotenza,
  esito incerto, eventi consegna/bounce e monitoraggio.
- Conservare l’isolamento tra tenant, autorizzare la modifica del Reply-To e
  mostrare lo stato di configurazione; nessun invio da un mittente non pronto.
- Collaudare separatamente SMTP di Supabase Auth per conferma e recupero password:
  queste email di accesso appartengono all’app, non al flusso reminder dello studio.

Credenziali e token restano nei binding sicuri; nessun nuovo segreto è necessario
per proseguire con i moduli clinici. Le impostazioni email non vengono anticipate
in tabelle inutilizzate prima dell’incremento che le rende operative.

Fonti ufficiali consultate:
[verifica domini Resend](https://resend.com/docs/dashboard/domains/introduction),
[parametri From e Reply-To](https://resend.com/docs/api-reference/emails/send-email).
