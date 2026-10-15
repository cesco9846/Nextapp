# Architettura di implementazione

Stato al 15 ottobre 2026: Next.js/SSR Auth, API con sessione utente, RLS/RPC,
React Query, Monarch/shadcn, team, Storage privata e preparazione clinica non firmata
implementati. Undici migrazioni applicate al progetto ufficiale. Worker email,
compilazione cliente, firme/PDF e foto restano pianificati.
La pulizia file ha un comando recuperabile, senza scheduler
remoto ancora attivo. Offline rimosso dal perimetro per scelta utente. Requisiti in [SPEC.md](SPEC.md), schema in [DATA_MODEL.md](DATA_MODEL.md),
consegne in [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md).

## Componenti e confini

| Componente       | Scelta e responsabilità                                                                                                                                                                                   |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Applicazione     | Next.js App Router, React, TypeScript strict. Route e API organizzate per dominio; un'applicazione modulare, senza microservizi di dominio.                                                               |
| Interfaccia      | shadcn/ui e Tailwind; FullCalendar React 7.1.2 con Monarch. Form con validazione condivisa Zod; accessibilità delle personalizzazioni verificata.                                                         |
| Identità         | Supabase Auth con integrazione SSR/cookie supportata; sessione verificata sul server per ogni operazione riservata. Middleware solo per navigazione, non come unica autorizzazione.                       |
| Persistenza      | Postgres Supabase, migrazioni versionate, RLS, FK tra tenant e RPC per operazioni atomiche. Tipi generati dallo schema.                                                                                   |
| File             | Supabase Storage privato; metadati autorizzativi, staging/finalizzazione, URL firmati brevi e documenti immutabili.                                                                                       |
| Lavori asincroni | Outbox in Postgres; pg_cron invoca worker Supabase Edge Functions autenticati. Batch limitati, lease, idempotenza e heartbeat. Nessun timer in memoria del server web.                                    |
| PDF              | Worker con renderer e font versionati, verificati con firma, etichette, accenti e documenti lunghi; non dipende dal browser della cliente. Scegliere una libreria compatibile con il runtime durante W13. |
| Email            | Adapter server minimo per invio con chiave idempotente ed esiti; provider da selezionare prima dell'invio reale. Auth SMTP e reminder sono due configurazioni distinte.                                   |
| PWA              | Manifest installabile e istruzioni, connessione necessaria. Nessun service worker con dati riservati e nessuno snapshot IndexedDB. React Query mantiene soltanto memoria temporanea della sessione.       |

## Calendario: integrazione verificata

L'utente ha fornito repository e demo ufficiali. La ricerca del 15 ottobre 2026
ha confermato nel registry npm **@fullcalendar/react 7.1.2**, licenza MIT, peer
React 17/18/19 e `temporal-polyfill ^1.0.1`. Nel pacchetto sono pubblicati:

- `@fullcalendar/react/themes/monarch`;
- `@fullcalendar/react/themes/monarch/theme.css`;
- `@fullcalendar/react/themes/monarch/palettes/{blue,green,purple,red,yellow}.css`;
- `@fullcalendar/react/skeleton.css`, plugin `/daygrid`, `/timegrid`, `/list`, `/interaction`.

Fonti: [README React ufficiale](https://github.com/fullcalendar/fullcalendar/blob/5160c2c953c349996b0e34a09faa77b759995a2b/packages/react/README.md),
[manifest pubblicato](https://registry.npmjs.org/@fullcalendar/react/7.1.2),
[licenza del repository](https://github.com/fullcalendar/fullcalendar/blob/5160c2c953c349996b0e34a09faa77b759995a2b/LICENSE.md).
La pagina [demo](https://fullcalendar.io/demos) ha restituito HTTP 403 durante la
consultazione: il tema è verificato nel codice/pacchetto, non mediante un confronto
visivo della demo in browser.

W02 deve verificare render client in Next.js, CSS, locale, timezone, import dei
plugin e interazioni reali. Fissare le versioni compatibili nel lockfile e non
mescolare esempi/API della versione 6 con la 7. Nessuna vista risorse/timeline
Premium è necessaria alla baseline: si filtrano le operatrici. Se richiesta una
vista Premium, verificarne la licenza prima di aggiungerla. Palette armonizzata
con i token shadcn senza sostituire Monarch.

## Struttura prevista del repository

```text
src/app/                  pagine, layout, Route Handlers
src/features/             moduli UI/domain: clienti, agenda, dossier, cataloghi
src/components/ui/        componenti shadcn/ui
src/lib/contracts/        schemi input/output e codici errore
src/server/               sessioni, servizi applicativi, accesso DB e file
supabase/migrations/      SQL versionato e ricreabile
supabase/functions/       worker e webhook asincroni
supabase/tests/           test pgTAP/policy
tests/                    integrazione, browser, fixture sintetiche
scripts/                  generazione tipi, migrazioni e controlli ripetibili
docs/runbooks/            rilascio, incidenti, code, backup e ripristino
```

Creare le directory quando servono a una consegna. La logica condivisa con i
worker resta TypeScript portabile senza dipendenze browser/Node implicite;
verificare il runtime Edge, senza assumere che ogni pacchetto npm vi funzioni.

## Accesso applicativo e privilegi

Il client usa solo URL e chiave publishable pubblica; chiave da recuperare in
modo sicuro durante W01 se non ancora configurata. Sessione e JWT verificati
con le API server supportate; nessuna fiducia in user ID o tenant inviati dal client.
Le normali operazioni usano il token dell'utente e mantengono RLS attiva.

Le variabili già disponibili hanno ruoli separati:

| Variabile                      | Uso consentito dal progetto                                                                                                   |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| `Nextapp_token_access`         | Personal Access Token per amministrazione, inventario e migrazioni; escluso dal bundle e dal runtime pubblico dell'app.       |
| `supabase_secret`              | Chiave privilegiata server per operazioni circoscritte, worker e flussi pubblici autorizzati da token.                        |
| `supabase_service_role_secret` | Credenziale privilegiata legacy già verificata; alternativa server quando necessaria, non doppia autenticazione obbligatoria. |

Le chiavi privilegiate bypassano RLS: non usarle per tutte le richieste degli utenti.
Modulo di accesso privilegiato marcato `server-only`, import vietato nei client,
operazioni limitate e testate. Per RPC sanitarie usare i permessi della sessione
e registrare l'accesso prima di restituire i dati. Nessun valore segreto negli
esempi `.env`, nei log, nei messaggi di errore o nei report dei test.

## Contratti HTTP e concorrenza

- Input Zod con allowlist dei campi: tenant, ruoli, autore, revisione risultante
  e timestamp autorevoli sono calcolati dal server/database.
- Risposte coerenti: 400/422 validazione, 401 sessione, 403/404 autorizzazione,
  409 versione/sovrapposizione/idempotenza, 410 link non più valido, 429 limite,
  5xx errore interno. Errori pubblici con codice stabile e correlation ID.
- POST di creazione usa una chiave idempotente associata ad attore e payload;
  PATCH richiede versione attesa. UI aggiorna dopo successo o ripristina l'ottimismo.
- API riservate no-store e protezioni Origin/CSRF per cookie; richieste GET non
  producono mutazioni. Le query Supabase dirette restano protette da RLS.
- GET del link pubblico mostra solo la pagina necessaria; POST esplicito consuma
  lo scopo. Link intake e conferma/disdetta hanno privilegi e scadenze differenti.

## Connettività, cache e revoca

Scelta utente del 15 ottobre 2026: PWA installabile con rete necessaria. Nessuna
consultazione offline, snapshot di agenda, coda di modifiche o sincronizzazione
in background. Non precache HTML autenticato, RSC, API, foto, PDF e URL firmati.
Il browser può conservare asset statici pubblici con i normali URL versionati.

React Query conserva dati soltanto in memoria, senza persister. Le mutation sono
`networkMode: always` con retry disabilitato: falliscono esplicitamente quando
manca la rete e non rimangono sospese per un invio automatico alla riconnessione.
`navigator.onLine` è un segnale, non una prova di raggiungibilità: gli errori fetch
restano gestiti. Una risposta persa non prova che il server non abbia salvato;
l’UI dichiara esito non confermato e preserva l’idempotenza della prenotazione.

Le richieste sono session-bound e senza cache HTTP condivisa. Logout svuota la
memoria; sospensione impedisce nuove letture tramite RLS. L’agenda verifica la
membership anche periodicamente (15 secondi mentre la pagina è attiva) e al
ritorno in primo piano. Un diniego per revoca svuota la cache e apre una pagina
esplicita, evitando il loop agenda/configurazione. La revoca non può cancellare
informazioni già lette o viste su un dispositivo disconnesso.

## Ambienti, migrazioni e rilascio

Produzione designata: `mexokvvvxdyekauupwvt`, nome Nextapp, regione `eu-west-1`.
Accesso amministrativo e CREATE verificati in lettura; schema public e bucket
vuoti al controllo del 15 ottobre 2026. Non serve ricreare il progetto.

Sviluppo/CI su Supabase locale isolato; verificare Docker e risorse in W01. Se non
disponibile, predisporre un progetto remoto di test separato prima di eseguire
test d'integrazione. Prima dei piloti serve staging remoto per OAuth/redirect,
email, cron, PWA HTTPS e Storage reali. Nessun reset o seed di test sul progetto ufficiale.

Mantenere un solo percorso di migrazione ripetibile. La Management API con il PAT
attuale consente SQL ma non implica che `supabase db push` funzioni senza connessione
PostgreSQL. W03 deve implementare/verificare il runner: file SQL ordinati, target
esplicito, lock, transazione quando supportata, checksum e registro privato delle
migrazioni. Non fingere una cronologia CLI per query eseguite manualmente. Se si
adotta la CLI con connessione dedicata, allineare il runner locale/CI e documentare
il passaggio prima di applicare migrazioni.

Usare modifiche espansive compatibili con la versione precedente; rimozioni di
colonne solo dopo migrazione dati e rilascio delle letture nuove. Rollback app
distinto da rollback DB; per il DB preferire correzioni successive testate. Prima
di cambiamenti distruttivi verificare backup/restore e scopo concreto della modifica.

## Assunzioni da chiudere al momento giusto

Hosting e dominio prima delle verifiche HTTPS/email; provider email e SMTP prima
degli invii reali; modelli/retention prima dei dati clinici reali; Stripe e
fatturazione prima della vendita automatizzata. Il backlog esplicita quali
consegne dipendono da queste scelte. Le altre possono proseguire con fixture
locali e integrazioni di prova chiaramente identificate.

## Modelli e preparazione implementati (W11)

Il catalogo clinico è leggibile da titolare e operatrici abilitate; solo la
titolare pubblica modelli e modifica pigmenti/lotti. Le pubblicazioni sono
immutabili anche per accessi SQL privilegiati ordinari. Ogni nuova pubblicazione
richiede la versione attesa del modello; tipo e servizio restano stabili.
Archiviare impedisce nuove scelte senza riscrivere preparazioni esistenti.

La preparazione appartiene a un solo appuntamento/cliente. Per le operatrici
occorrono abilitazione clinica e assegnazione attiva. Le risposte non sono
esposte dalla Data API: `app_private.preparation_answers` non ha grant client.
La lettura usa POST esplicito, registra `anamnesis.read` prima di restituire le
risposte e fallisce se l’audit fallisce. Letture e scritture acquisiscono il lock
del tenant usato dalle revoche; dopo l’attesa ricontrollano l’accesso. Il limite
di lettura basato sull’audit è così serializzato. Il salvataggio controlla anche
versione della preparazione e revisione dell’appuntamento, con chiave idempotente.

Il browser conserva le risposte solo nello stato del form fino allo smontaggio,
senza cache React Query o persistenza. Un errore mantiene l’input in memoria;
nessun invio si accoda alla riconnessione. Il catalogo può usare React Query.
Le selezioni conservano la versione del modello e uno snapshot del lotto con
etichetta/hash; modificare il catalogo non li aggiorna automaticamente. Un lotto
deve essere valido sia oggi sia alla data locale dell’appuntamento. Il massimo
è 12 lotti e 30 domande; le risposte richieste potranno essere completate prima
della firma. Lo stato corrente è sempre `draft`, senza firma o PDF.

Le etichette usano lo stesso ciclo Storage delle immagini. Il loro ambito è il
pigmento, senza cliente o appuntamento; preparazione upload riservata alla
titolare, lettura consentita anche alle operatrici cliniche dello studio.
I link brevi sono aperti direttamente, senza cache dell’ottimizzatore immagini.
Le opzioni provider/mittente restano una proposta in [EMAIL_DELIVERY.md](EMAIL_DELIVERY.md).

## Archivio privato implementato (W10)

`src/server/private-storage.ts` è marcato server-only. Le API preparano e
autorizzano con la sessione dell’utente; solo verifica, normalizzazione, firma
degli URL e pulizia usano la credenziale server. Nessun percorso finale o ruolo
è deciso dal client. Accesso aggiornato anche durante la finalizzazione e
audit dell’attore prima di emettere un link.

Bucket privato, INSERT limitato all’operazione Storage `object.upload`, oggetti
finali senza scritture dirette/overwrite da utenti. Nessun token di upload firmato
che possa sopravvivere alla revoca. URL di lettura 30 secondi; quelli già emessi
scadono naturalmente. Verifica hash/dimensione/contenuto, decodifica massima
20 MP, ricodifica e rimozione EXIF/GPS. Dettagli in [STORAGE.md](STORAGE.md).

Il comando Node di pulizia usa claim con lease e token, cancella solo oggetti
temporanei o non finalizzati e preserva i ready. Il deployment dello scheduler
è ancora una dipendenza operativa dell’hosting; nessun timer nel processo web.
