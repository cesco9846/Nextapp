# Glow — modello dati logico

Stato: proposta progettuale derivata da T (`GlowTrace_Piano_Tecnico.pdf`, pp.
10–18, 20) e adattata alle richieste dell'utente. Il modello descrive il perimetro
completo. Il sottoinsieme eseguibile corrente è nelle migrazioni 202610150001–011:
tenants, users, locations, services, clients, appointments, messages, audit_log,
user_invitations, client_assignments, stored_files, clinical_templates,
clinical_template_versions, pigments, pigment_lots, treatment_preparations e
treatment_lots, oltre a ledger/idempotenza e preparation_answers privati.
Tutte e undici sono applicate al progetto ufficiale; diciassette tabelle pubbliche con RLS.
Gli inviti conservano soltanto l’hash del token. I file usano staging, verifica
server, oggetti immutabili, audit e pulizia con lease: vedere [STORAGE.md](STORAGE.md).
L’accesso ai file delle clienti richiede abilitazione clinica e assegnazione per
le operatrici; le etichette di catalogo richiedono l’abilitazione clinica. La
titolare resta circoscritta al proprio studio. Link cliente, firme/PDF e foto
per categoria restano da collegare nei successivi incrementi.
Requisiti: `SPEC.md`; architettura: `ARCHITECTURE.md`; consegne: `IMPLEMENTATION_PLAN.md`.

## Confine dei dati

Il sottoinsieme clinico implementato usa un modello distinto dalle firme future:
`clinical_templates` punta alla pubblicazione corrente, mentre
`clinical_template_versions` conserva testi/domande e hash immutabili.
`pigment_lots` richiede un file pronto dello stesso pigmento e tenant.
`treatment_preparations` è una bozza univoca per appuntamento, con versioni dei
modelli e versione attesa dell’appuntamento. `treatment_lots` conserva i valori
selezionati e il riferimento/hash dell’etichetta senza aggiornarli agli edit del
catalogo. Le risposte sono solo in `app_private.preparation_answers`: nessun
SELECT diretto per authenticated; la RPC verificata e auditata è l’unico percorso
utente. Non sono ancora snapshot di un consenso firmato.

`tenant` è l'account professionale; `location` è una sede. Due sedi dello stesso
tenant condividono i dati secondo i permessi; due tenant restano isolati.
Ogni tabella di dominio porta `tenant_id`, con RLS e controllo del tenant anche
nelle relazioni. Un filtro API da solo non è sufficiente.

Il piano associa l'utente a un tenant in `users`. Come proposta iniziale si
mantiene questa cardinalità come baseline: un utente appartiene a un tenant. Se occorrerà
lavorare su account professionali diversi con lo stesso login, si introdurranno
appartenenze esplicite; non si userà `locations` per aggirare questa decisione.

## Catalogo delle entità

I campi elencati sono i minimi logici, oltre a ID e timestamp. **Integrazione**
indica dettagli progettuali necessari, non campi dichiarati testualmente nel PDF.

| Entità                     | Contenuto e relazioni                                                                                                                                                                                                                                             | Fonte                                                         |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `tenants`                  | Account professionale, impostazioni, fuso IANA (inizialmente Europe/Rome), valuta.                                                                                                                                                                                | T p. 12; fuso T p. 15.                                        |
| `users`                    | Riferimento univoco a `auth.users`, tenant, ruolo titolare/operatrice, stato accesso, abilitazione clinica esplicita.                                                                                                                                             | T pp. 10–12; abilitazione: affinamento.                       |
| `user_invitations`         | Tenant, destinatario, ruolo proposto, hash del token, scadenza, consumo/revoca.                                                                                                                                                                                   | Integrazione per inviti T p. 8.                               |
| `locations`                | Sede del tenant, nome e indirizzo, stato attivo/archiviato.                                                                                                                                                                                                       | T p. 12.                                                      |
| `clients`                  | Dati anagrafici e contatti, telefono normalizzato, archivio; evidenze di consenso privacy e messaggi. Identità tramite ID, mai tramite nome.                                                                                                                      | T pp. 3, 12.                                                  |
| `client_permissions`       | Tipo/scopo del consenso, versione dell'informativa, acquisizione, canale e revoca. Consensi sanitari e foto distinti dal marketing.                                                                                                                               | Integrazione normalizzata di T pp. 12, 20.                    |
| `client_assignments`       | Associazione cliente/operatrice, autore, data e revoca; creata anche quando il titolare assegna un appuntamento. Consente accesso clinico solo insieme all'abilitazione dell'utente.                                                                              | Affinamento AUTH-05.                                          |
| `services`                 | Catalogo modificabile: nome, durata, prezzo, stato attivo. I valori storici restano negli appuntamenti.                                                                                                                                                           | Integrazione per T p. 3.                                      |
| `appointments`             | Cliente, sede, operatrice, servizio, `starts_at`/`ends_at` timestamptz, stato, valori storici di nome/prezzo/durata, `version` per concorrenza e `schedule_revision` per reminder e link.                                                                         | T p. 12; snapshot/revisioni: integrazione.                    |
| `consent_templates`        | Tipo, versione, contenuto e stato pubblicato. Versioni pubblicate immutabili.                                                                                                                                                                                     | T pp. 12, 16.                                                 |
| `consents`                 | Cliente, appuntamento se pertinente, versione modello, snapshot esatto e hash, nome firmatario, firma privata, ora server, stato documento `pending/ready/failed`, riferimento PDF e checksum. Documento successivo collegato al precedente senza sovrascrittura. | T pp. 12, 16; elaborazione e integrità: affinamento.          |
| `anamnesis`                | Cliente, questionario e risposte versionati, consensi pertinenti; accesso ristretto e letture registrate.                                                                                                                                                         | T pp. 12, 16, 20.                                             |
| `photos`                   | Cliente e appuntamento se pertinente, categoria prima/dopo/guarito, oggetto Storage privato, metadati minimi e scopo autorizzato.                                                                                                                                 | T pp. 12, 16.                                                 |
| `pigments`                 | Anagrafica pigmento del tenant, produttore e identificazione commerciale.                                                                                                                                                                                         | T pp. 12, 16.                                                 |
| `pigment_lots`             | Pigmento, codice lotto, scadenza, etichetta privata e informazioni di etichetta versionate.                                                                                                                                                                       | T p. 16.                                                      |
| `treatment_lots`           | Collegamento tra trattamento e lotti usati. Proposta iniziale: il trattamento è l'appuntamento, con FK `appointment_id`; snapshot della documentazione consegnata.                                                                                                | T pp. 12, 16; FK e snapshot: integrazione.                    |
| `messages`                 | Outbox email: appuntamento, tipo, canale, revisione, pianificazione, stato, tentativi, lease, ID provider, errore tecnico non sensibile.                                                                                                                          | T pp. 14–15 adattato a U: email automatica, WhatsApp manuale. |
| `intake_links`             | Hash token, tenant, scopo, cliente/appuntamento ove applicabile, scadenza, consumo, revoca. Nessun token in chiaro persistito.                                                                                                                                    | T p. 11; scopo e revoca: integrazione.                        |
| `appointment_action_links` | Hash token per conferma/disdetta, appuntamento, revisione attesa, scadenza, consumo/revoca. Nessun accesso al dossier clinico.                                                                                                                                    | Affinamento LINK-02.                                          |
| `audit_log`                | Attore, tenant, azione, tipo/ID risorsa e ora server. Append-only; senza risposte sanitarie, token o contenuti dei messaggi.                                                                                                                                      | T pp. 12, 16.                                                 |

Supporti tecnici da creare con il relativo incremento, in schema privato se non
destinati al client:

| Entità                 | Responsabilità                                                                                                                                                                          |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `idempotency_requests` | Tenant, attore, operazione, chiave, hash del payload e risorsa risultante. Stessa chiave/payload → stesso risultato; payload diverso → conflitto. Mai corpo clinico o token nei record. |
| `stored_files`         | Oggetto privato immutabile, proprietario, tipo documento, MIME/dimensione/hash verificati, stato staged/ready/failed, legame a risorsa e scadenza degli orfani.                         |
| `document_jobs`        | Elaborazione PDF dallo snapshot firmato; unicità per documento/versione, lease, retry e stato. Il job non duplica la firma.                                                             |
| `provider_events`      | Identificativo provider univoco, tipo evento e risultato di elaborazione; payload minimizzato. Consegne duplicate/fuori ordine non regrediscono lo stato.                               |
| `worker_runs`          | Heartbeat e contatori tecnici dei processi; nessuna anagrafica o risposta sanitaria.                                                                                                    |

Il catalogo viene implementato per incrementi: non creare tabelle vuote per
funzioni future senza un flusso e un test che le eserciti.

Supporti alle funzioni Fase 1 pianificate in W21–W24: `calendar_feeds` per hash del
token e revoca del feed; `subscriptions` e registro degli eventi provider per
Stripe; sottoscrizioni Web Push per PUSH-01. Non si attivano
integrazioni o addebiti creando soltanto queste tabelle.

## Relazioni e invarianti da rendere vincoli SQL

1. Le FK di dominio usano la coppia `(tenant_id, resource_id)` dove necessario:
   un appuntamento di A non può riferire cliente, sede, servizio o operatrice di
   B; lo stesso vale per file, consensi, messaggi e lotti.
2. `users.auth_user_id` è univoco e il ruolo è vincolato. I campi di appartenenza
   e ruolo non sono aggiornabili dall'utente senza autorizzazione amministrativa.
3. `ends_at > starts_at`. Range semichiuso `[inizio, fine)` e vincolo di esclusione
   per `(tenant_id, operator_id)` sugli stati `booked/confirmed`, con `btree_gist`.
   Testare l'inserimento concorrente e mappare la violazione a HTTP 409.
4. Stato appuntamento e transizioni da SPEC controllati lato server; archiviazione
   e transizioni non trasferiscono il tenant. Date degli eventi in timestamptz,
   fuso dell'account separato per visualizzazione e pianificazione locale.
5. Baseline per il primo schema: un servizio per appuntamento. Se il piano
   operativo richiederà più servizi per seduta, introdurre una tabella di righe
   con snapshot; non sovraccaricare un campo JSON prima di definire il requisito.
6. Prezzi storici in unità monetarie minime intere e valuta esplicita. Cambiare
   il catalogo non riscrive il valore delle sedute storiche. Lo stato completato
   non prova il pagamento: nessun indicatore di incasso effettivo senza un registro
   dei pagamenti. Nessun anno fisso nel reporting.
7. Unicità versione per tipo/modello di consenso e immutabilità dopo la firma.
   Anche PDF ed etichette allegate devono conservare il contenuto storico:
   un URL verso un file sovrascrivibile non costituisce uno snapshot.
8. Unicità outbox su `(appointment_id, schedule_revision, kind, channel)`.
   Spostamento e annullamento aggiornano appuntamento e lavori nella stessa
   transazione. Indice sui lavori eseguibili; claim concorrente tramite lock/lease.
9. Consumo del link e scrittura del modulo in una transazione: aggiornamento
   condizionale sul token valido con `RETURNING`, per impedire due consumi
   simultanei. Scadenza e stato valutati dall'orologio server.
10. Archiviazione del cliente preserva i legami storici. La richiesta privacy di
    cancellazione è un processo separato, soggetto alle regole di conservazione
    ancora da definire; non equivale a un `ON DELETE CASCADE` indiscriminato.
11. `version` incrementa a ogni modifica; compare-and-swap con la versione inviata
    dal client evita aggiornamenti persi. `schedule_revision` cambia solo quando
    mutano dati che invalidano reminder/link (orario, destinatario, sede, operatrice
    o annullamento). Un edit irrilevante non deve creare un secondo reminder.
12. Email e telefono del cliente non sono chiavi d'identità né necessariamente
    univoci: parenti possono condividere un contatto. Segnalare possibili doppioni
    senza fondere automaticamente le schede.
13. Indici per tenant e data/intervallo, FK e ricerche clienti. Query paginate e
    limiti server; verificare piani di esecuzione con il dataset di QUALITY_PLAN.
14. Modelli e questionari hanno schema/versione validati; JSONB ammesso per le
    risposte strutturate, non per sostituire relazioni essenziali. Nessuna modifica
    retroattiva delle risposte firmate o delle informazioni sui lotti consegnate.

### Contratti delle operazioni atomiche

- Bootstrap tenant/owner idempotente rispetto all'utente Auth verificato.
- Creazione/spostamento/annullamento appuntamento: permessi, controllo versione,
  esclusione, scrittura, idempotenza e modifica outbox nella stessa transazione.
- Invito e assegnazione: ruoli, appartenenza, scadenza e ultimo owner validati.
- Firma: verifica scopo e snapshot, consumo token, consenso e job PDF nella stessa
  transazione DB. Upload Storage e transazione SQL non sono atomicamente uniti:
  oggetti preparati e verificati vengono finalizzati, i fallimenti sono recuperabili.
- Lettura anamnesi: RPC autorizzata registra l'audit prima di restituire il dato;
  se l'audit fallisce, nessun dato sanitario viene restituito.

Eseguire queste operazioni con RPC SQL o servizio transazionale: chiamate REST
separate dal browser non costituiscono una transazione. Le funzioni privilegiate
non accettano tenant/ruolo autorevoli forniti dal client e hanno EXECUTE limitato.

## Autorizzazione e Storage

- RLS attiva su tutte le tabelle esposte; anon non accede alle tabelle di dominio.
  Il modulo pubblico passa da endpoint limitato con token, mai da credenziali studio.
- API con sessione verificata e client soggetto a RLS. Chiavi privilegiate solo
  server, per operazioni circoscritte e con controlli espliciti.
- Funzioni per l'identificazione del tenant con privilegi minimi, search path
  controllato e permessi di esecuzione limitati; test per evitare ricorsione RLS.
- Anamnesi accessibile solo attraverso un percorso autorizzato che registra la
  lettura. Non lasciare una policy SELECT diretta che aggiri l'audit.
- Bucket privati per foto, PDF, firme ed etichette; path basato su tenant e ID
  risorsa. Policy verificate sui metadati e sull'appartenenza, non solo sul prefisso
  del nome oggetto. URL firmati con durata breve.
- PIN della modalità cliente è protezione dell'interfaccia; l'API limita comunque
  il flusso alla cliente e al consenso autorizzati.
- PWA installabile con connessione necessaria, scelta utente del 15 ottobre 2026.
  Nessuno snapshot locale dell’agenda o dei contatti e nessun dato clinico nel
  service worker o in IndexedDB. La memoria di sessione viene invalidata al logout;
  una revoca viene applicata online alle nuove richieste.

## Affidabilità messaggi

Stati proposti: `queued`, `processing`, `accepted`, `delivered`, `bounced`,
`failed`, `cancelled`, `skipped`, `uncertain`. `accepted` indica soltanto
l'accettazione del provider; nessuna lettura email viene dichiarata. Retry
transitorio riporta in coda con `next_attempt_at`; esito esterno sconosciuto va
in `uncertain` e richiede riconciliazione o idempotenza garantita dal provider.
Un webhook non può annullare una decisione più recente soltanto perché arriva
più tardi: conservare ID, istante e semantica dell'evento secondo il provider.

Il SQL del PDF è uno schema illustrativo: unicità e `SKIP LOCKED` impediscono
duplicazioni della coda e claim simultanei, ma non garantiscono da soli un unico
invio esterno. Un crash dopo l'accettazione del provider e prima del salvataggio
dell'ID può lasciare esito ambiguo. Prima del retry usare idempotenza del provider
o riconciliazione; non rimettere ciecamente in coda un invio con esito sconosciuto.

Il worker rilegge stato e revisione prima di contattare il provider. Un messaggio
già accettato dal provider non può essere richiamato semplicemente annullando
l'appuntamento: il confine va esplicitato e coperto dai test di concorrenza.

WhatsApp manuale non crea un messaggio dichiarato inviato/consegnato. Se si
registra l'apertura del collegamento, l'evento descrive solo quell'azione.

## Prima delle migrazioni

Il progetto Supabase ufficiale scelto dall'utente è `mexokvvvxdyekauupwvt`.
Verifica amministrativa del 15 ottobre 2026: `Nextapp_token_access` valido sulla
Management API, progetto `Nextapp`, stato `ACTIVE_HEALTHY`, regione `eu-west-1`.
Query SQL eseguita con ruolo `postgres`, permessi CREATE nel database e nello
schema public; quest'ultimo senza tabelle, routine o policy, Storage senza bucket.
Questo inventario iniziale precede le migrazioni: il 15 ottobre 2026 sono poi
state applicate 202610150001/002, verificate RLS/privilegi e assenza di fixture.
L’inventario non dichiara vuoti
gli schemi gestiti da Supabase. Le chiavi server `supabase_service_role_secret`
e `supabase_secret` sono inoltre verificate per Data API e Storage.

Il progetto ufficiale è la destinazione di produzione. Per test distruttivi
usare Supabase locale/CI e, prima dei piloti, un ambiente remoto separato. Preparare
migrazioni versionate, seed sintetici, pgTAP e generazione dei tipi. Eseguire su
istanza vuota e testare FK/RLS/Storage prima dell'applicazione remota. Backup e
restore devono comprendere anche i file Storage, non soltanto le righe SQL.
