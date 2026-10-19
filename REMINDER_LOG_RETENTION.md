# Spazio e conservazione dei registri tecnici

Verifica del 19 ottobre 2026, Supabase ufficiale `mexokvvvxdyekauupwvt`, piano
Free dichiarato dall’utente. Database misurato circa **15 MB**, quota **500 MB**;
i record erano ancora pochi. Questo è un dato puntuale, non una previsione
della durata del piano gratuito.

## Due tipi di log distinti

I log di piattaforma Supabase (API, Auth, Postgres ecc.) hanno conservazione
Free di **un giorno**, **1 GB di ingestione incluso per ciclo di fatturazione**
e **100 GB di scansioni incluse**. L’eccedenza di ingestione sul Free non è
fatturata: si applicano le procedure di notifica, periodo di tolleranza e
restrizioni del provider. Le scansioni non sono fatturate, ma il superamento
può ridurre accesso e conservazione. La pulizia SQL sotto **non riduce
l’ingestione dei log di piattaforma** e non ne modifica le impostazioni.

Le tabelle di funzionamento di Glow, compreso `cron.job_run_details`, occupano
invece il database Postgres e contribuiscono alla quota di 500 MB. Sul Free
superarla può rendere il database di sola lettura. Non viene attivato un piano
a pagamento da questa implementazione. Foto e PDF hanno la quota Storage
separata di **1 GB** e vanno tenuti presenti durante l’uso reale.

## Pulizia mirata

Migrazione forward 24, funzione privata `app_private.prune_reminder_logs()`.
Job `glow-reminder-retention` ogni ora al minuto 17 UTC, indipendente dai due
job di invio e monitor che continuano ogni minuto. Non usa Resend, rete,
destinatari o dati clinici e non cambia gli interruttori degli studi.
Attivato sul progetto ufficiale e prima pulizia manuale riuscita; scheduling
ripetuto senza duplicare il job. Reminder rimasti `enabled / ok`.

| Registro | Conservazione |
| --- | --- |
| Esecuzioni worker concluse senza lavori presi né email accettate | 7 giorni |
| Esecuzioni worker fallite senza lavori presi né email accettate | 30 giorni |
| Esecuzioni concluse dei tre job cron Glow attualmente registrati | 7 giorni se riuscite, 30 giorni per gli altri esiti |
| Metadati delle chiamate HTTP concluse | 7 giorni, come nello scheduler |
| Nonce anti replay | 10 minuti, oltre la validità di firma di 90 secondi |
| Risposte transitorie pg_net | 6 ore, impostazione gestita già attiva |

Restano sempre l’ultimo successo, l’ultimo errore e l’ultima partenza del
worker, per non falsare heartbeat e ordine degli errori dopo una sospensione.
Restano tutti i run aperti, quelli con lavori presi/email accettate e quelli
referenziati da un dispatch, anche se i contatori risultassero zero. Per cron
restano le esecuzioni in corso e l’ultima di ciascun job. I job di altre
applicazioni e lo storico di job rimossi non vengono cancellati.

**Non vengono eliminati** outbox, chiavi idempotenti, snapshot di invio,
dispatch, webhook, soppressioni per bounce/complaint, audit, documenti o dati
clinici. La loro conservazione va definita separatamente in W19; crescono con
l’uso effettivo, non con ogni controllo a vuoto.

Ogni esecuzione elimina al massimo 5.000 righe per ciascuna delle quattro
tabelle, con lock di esclusione della manutenzione e `SKIP LOCKED`. Gli indici
supportano selezione temporale e verifica dei riferimenti. Non si usano
`TRUNCATE`, `VACUUM FULL` o cancellazioni generiche. L’autovacuum ordinario
riutilizza lo spazio delle righe eliminate: la dimensione allocata può non
scendere immediatamente, quindi una pulizia riuscita può rimuovere righe senza
ridurre subito il valore di `pg_database_size`.

A regime, senza errori, i due cron ogni minuto generano circa 20.160 righe
in sette giorni e i run vuoti del worker circa 10.080. La pulizia oraria
aggiunge fino a un’ora alla finestra; gli errori hanno una finestra maggiore.
Non è un tetto in MB: indici, spazio riutilizzabile e record protetti contano
anch’essi. I controlli SQL verificano anche un arretrato di 5.001 run.

## Operazioni

La migrazione installa la funzione senza avviare job. Questi comandi operativi
amministrativi sono utilizzabili anche con invii attivi e non inviano email:

```sh
node --use-env-proxy --import tsx scripts/reminder-scheduler.ts --project-ref mexokvvvxdyekauupwvt --schedule-retention
node --use-env-proxy --import tsx scripts/reminder-scheduler.ts --project-ref mexokvvvxdyekauupwvt --run-retention
node --use-env-proxy --import tsx scripts/reminder-scheduler.ts --project-ref mexokvvvxdyekauupwvt --status
node --use-env-proxy --import tsx scripts/reminder-scheduler.ts --project-ref mexokvvvxdyekauupwvt --pause-retention
```

`--status` mostra anche byte totali del database e byte delle tabelle tecniche
con i loro indici; non stampa payload, credenziali o messaggi cron. Il dato
operativo comprende l’intera tabella cron condivisa, mentre la pulizia riguarda
solo i job Glow nominati. Controllare anche **Usage** in Supabase per ingestione
log, spazio Storage e altre quote. Non sono ancora configurate notifiche
email tecniche o allarmi automatici di spazio: l’utente fornirà una casella
dedicata. Nessun cambio globale delle impostazioni di log del provider.

Fonti ufficiali consultate il 19 ottobre 2026:
[prezzi e conservazione](https://supabase.com/pricing),
[quota database e sola lettura](https://supabase.com/docs/guides/platform/database-size),
[ingestione log](https://supabase.com/docs/guides/platform/manage-your-usage/logs-ingest),
[scansioni log](https://supabase.com/docs/guides/platform/manage-your-usage/logs-query),
[Cron](https://supabase.com/docs/guides/cron),
[pg_net](https://supabase.com/docs/guides/database/extensions/pg_net).
