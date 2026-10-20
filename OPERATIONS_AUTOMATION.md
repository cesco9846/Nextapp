# Automazione operativa — Glow

## Job e limiti

Migrazione 026, attivazione separata dal deploy. Tre job Supabase Cron:

| Job                        | Frequenza      | Lavoro                                                            |
| -------------------------- | -------------- | ----------------------------------------------------------------- |
| `glow-document-worker`     | Ogni minuto    | POST firmato `/api/internal/maintenance/documents`, un PDF        |
| `glow-file-cleanup`        | Ogni 10 minuti | POST firmato `/api/internal/maintenance/cleanup`, massimo 10 file |
| `glow-maintenance-monitor` | Ogni 5 minuti  | Health SQL persistente, nessuna email                             |

Le chiamate usano il segreto già presente in Vault e Vercel, HMAC legato a tipo,
timestamp e nonce monouso. Richiedono POST con corpo vuoto/`{}`, non accettano
tenant, percorsi, provider o opzioni. Nessuna sessione professionista richiesta;
le sessioni normali non possono chiamare le RPC privilegiate.
Il comando di pausa riguarda solo la manutenzione; i reminder restano attivi.

Il worker PDF prende un job non completato e scaduto/dovuto, con lease di due
minuti e fencing. Massimo cinque tentativi totali automatici, inclusi quelli
già effettuati dal worker dopo la firma; backoff esponenziale da 30 secondi.
Un errore d’integrità richiede intervento. Il retry manuale autorizzato resta
possibile e non richiede una nuova firma. Un file già caricato viene riutilizzato
solo verificandone hash e dimensione; non viene sovrascritto. Testo, firma,
etichette e renderer rimangono quelli storici dello snapshot.

La pulizia riusa `claim_file_cleanup`/`complete_file_cleanup`: elimina staging
dei file ready, upload scaduti, falliti e scartati. Riconcilia anche upload
tardivi su record già scartati. Non elimina originali ready, foto cliniche
valide o PDF firmati. Le politiche di conservazione dei contenuti sono W19.
Lease scaduti rendono ripetibili le esecuzioni interrotte.

Timeout HTTP, budget 35 secondi per nuove cancellazioni, scadenza 45 secondi
per il lavoro e hard limit Vercel 60 secondi. In caso di timeout il lease
protegge dalle doppie esecuzioni e consente il recupero successivo.

## Monitor e spazio sul piano Free

Due sole righe di heartbeat, una per worker; massimo cinque avvisi aggregati.
Segnala heartbeat PDF oltre 5 minuti, pulizia oltre 30 minuti, PDF recuperabili
in ritardo, tentativi esauriti/integrità e backlog di pulizia. Nessun contenuto
clinico, contatto, firma, token o URL privato nei risultati tecnici.
Un lavoro fallito non aggiorna l’ultimo successo.

La retention oraria già attiva viene estesa: risultati cron riusciti 7 giorni,
falliti 30, metadati HTTP completati 7 giorni. Conserva ultimo risultato per
job ed esecuzioni in corso. Cancellazioni limitate a 5.000 righe per categoria
e invocazione. Non cancella audit, ricevute, outbox, prove di consegna o file
clinici. I dati `net._http_response` mantengono la retention nativa già configurata.

Il monitor è interno. Le email di allarme attendono la casella dedicata scelta
dall’utente. Monitor esterno, backup DB+Storage e prova di ripristino restano W20.

## Comandi ufficiali

Da `/workspace/Nextapp`, Node 24, proxy e CA dell’ambiente invariati:

```sh
node --use-env-proxy --import tsx scripts/maintenance-scheduler.ts --project-ref mexokvvvxdyekauupwvt --status
node --use-env-proxy --import tsx scripts/maintenance-scheduler.ts --project-ref mexokvvvxdyekauupwvt --probe
node --use-env-proxy --import tsx scripts/maintenance-scheduler.ts --project-ref mexokvvvxdyekauupwvt --schedule
node --use-env-proxy --import tsx scripts/maintenance-scheduler.ts --project-ref mexokvvvxdyekauupwvt --pause
```

Prima attivazione: deploy Vercel READY con entrambe le route, applicare/verificare
026, probe OFF, schedule. Probe/schedule richiedono manutenzione OFF e non
disattivano i reminder. La pausa non richiama le richieste già in volo.
`--status` mostra job, ultimi HTTP e health con contatori, senza chiavi.
Non riattivare alla cieca un job in errore: diagnosticare prima configurazione,
heartbeat, lease e file originale; non modificare manualmente PDF firmati.

## SMTP di Supabase Auth

SMTP ufficiale Resend: `smtp.resend.com:465` TLS, utente `resend`, password dal
binding sicuro `RESEND_API_KEY`, mittente `Glow <reminder@glowlabs.it>`.
Limite esplicito 20 email/ora e minimo 60 secondi tra richieste per destinatario.
Template italiani versionati in `supabase/templates/`: conferma registrazione,
recupero e accesso. Canonical URL, redirect, autoconfirm e password non vengono
cambiati dal comando SMTP.

```sh
node --use-env-proxy --import tsx scripts/auth-smtp.ts --project-ref mexokvvvxdyekauupwvt --status
node --use-env-proxy --import tsx scripts/auth-smtp.ts --project-ref mexokvvvxdyekauupwvt --configure
```

Il test `--test --recipient <indirizzo-autorizzato>` invia un accesso OTP e un
recupero solo a un account confermato esistente. Non crea account ufficiali,
non usa i link, non modifica password. Richiede autorizzazione esplicita per
il destinatario. Tiene in cache ignorata il solo hash destinatario e gli esiti:
salta gli invii già accettati, consente retry del solo 429 dopo cooldown,
non ritenta esiti di rete ambigui. Non cancellare la cronologia per forzare invii.
I link di queste prove PKCE non vanno usati: il verifier viene scartato.

La prova reale di accesso/recupero verifica il trasporto SMTP di Auth.
La registrazione/conferma completa è verificata localmente con Mailpit e browser;
non si creano iscrizioni sintetiche nel database ufficiale. I test locali
non usano Resend reale e non consumano il limite ufficiale.

## Ripresa dell’ambiente locale

`npm run db:start` rende leggibili da Kong i soli tre template HTML pubblici
e mantiene il proxy esterno. Nel cloud aggiunge l’esclusione del solo hostname
Docker `supabase_kong_Nextapp` ad Auth, ricreando il container locale con tutta
la configurazione precedente in memoria. Non stampa o salva credenziali.
Il fix è idempotente; al di fuori di ambienti con proxy non ricrea Auth.
Il flusso Mailpit verifica oggetti italiani, link PKCE, conferma e reset reali
locali. I template usati da questi test sono gli stessi caricati in produzione.
