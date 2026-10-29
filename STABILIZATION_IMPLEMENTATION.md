# Stabilizzazione Glow — incremento del 29 ottobre 2026

Questo incremento attua una parte del [piano S00–S09](STABILIZATION_PLAN.md)
sul codice di partenza `53d0f76`. Checkpoint previsto:
`checkpoint-stabilization-2026-10-29`. Non chiude il pilota R1.

## Link pubblici: S01

Le API intake, firma legacy, pacchetti PMU, etichette e risposta appuntamento
passano da `use_public_link`, eseguibile soltanto con ruolo server. Restano
scadenze, revoche, vincoli di versione, controllo dopo lock, audit e ricevute
idempotenti delle RPC precedenti. Le RPC precedenti restano service-only;
nessuna chiave anon o sessione professionale può aggirare il gateway.

Quote atomiche in finestre di un minuto:

| Chiave | Massimo | Effetto |
| --- | --- | --- |
| Origine fidata, tutte le famiglie | 600/min | Limita la singola origine; un NAT condiviso condivide questa quota |
| Token inesistenti/scaduti/revocati per origine | 60/min | Blocca solo gli errori dell’origine; il link valido usa ancora la sua quota |
| Capability intake / risposta appuntamento | 20/min | Token abusato isolato |
| Capability firma / pacchetto | 30/min | Consente anche firma, letture e richieste etichette |
| Studio ricavato da token esistente, non scaduto né revocato | 1.200/min | Mai ricavato dal tenant dichiarato dal chiamante |

Il contatore globale 300/min è rimosso. I token casuali inesistenti non creano
righe token/tenant e non spendono quote di altri studi. Un token già oltre la
propria quota non consuma ulteriormente quella dello studio. Un 429 espone
`Retry-After: 60`. Un token non disponibile mantiene il precedente esito 410
fino alla quota di errori dell’origine. Le quote sono protezioni applicative:
un attacco distribuito richiede anche capacità e difese del proxy/hosting.

Vercel: solo `x-vercel-forwarded-for`, sovrascritto dal provider. Non si usano
`X-Forwarded-For` o `X-Real-IP` inviati liberamente dal client.
Sul futuro VPS: proxy che sovrascrive `X-Real-IP` e `X-Glow-Proxy-Key`, segreto
server `GLOW_PROXY_SECRET` di almeno 32 caratteri, porta Node non pubblica.
Origine non verificabile in produzione: 503, senza bypass. IPv6 normalizzato,
IPv4 mappato IPv6 equiparato a IPv4. Il locale diretto usa loopback.

L’IP è trasformato con HMAC e separazione di dominio/giorno usando la chiave
server già configurata. Non è anonimato legale; non viene scritto in chiaro,
né insieme a token nei log applicativi. La tabella è privata/RLS senza grant
anche a service_role. Il job orario di retention esistente elimina al massimo
5.000 finestre più vecchie di un’ora per ciascuna delle quattro tabelle
nuova/legacy; gli arretrati richiedono cicli successivi. Nessun DELETE esteso
sulle aperture, nessuna nuova coda o cron.

I body JSON sono letti in streaming entro 32 KiB anche senza Content-Length;
UTF-8 malformato o body eccedente vengono rifiutati prima delle operazioni.

## Sessione e richieste: S04/S05

Il proxy aggiorna/verifica la sessione tramite SDK `getClaims()`. Ogni API
riservata verifica firma, issuer, audience, sub e session_id; la RPC
`session_profile()` controlla la sessione corrente in Auth, scadenza, utente
eliminato/bannato e restituisce solo il profilo del soggetto autenticato.
Le azioni owner-only, inviti e configurazione mantengono `getUser()` live.
Il controllo di ruolo, active, tenant e quelli sotto lock restano presenti.

Le memoizzazioni React sono limitate al singolo render; niente profili o
permessi condivisi tra richieste. Logout globale con JWT ancora non scaduto
viene rifiutato dalle API Glow. Questo non cambia la semantica delle chiamate
dirette a Supabase REST: un access token già emesso può restare valido fino
alla scadenza, secondo le policy Supabase; RLS e controllo active restano attivi.

`Server-Timing` contiene solo etichette fisse `auth`, `profile`, `api` e durate,
senza identificativi o registrazione persistente. AsyncLocalStorage separa
misure concorrenti.

L’interfaccia controlla `/api/membership` ogni 15 secondi in primo piano online;
il caricamento completo del workspace passa da 15 secondi a cinque minuti,
con invalidazione su cambio profilo e aggiornamento al focus/reconnect.
Clienti, agenda e documenti aperti si aggiornano sempre al rientro; le query
secondarie rispettano staleTime. Logout, revoca e cambio identità svuotano la
cache; non si mantiene una lista precedente di un altro utente.

Ricerca clienti con debounce 300 ms, lista precedente visibile e indicazione
«Aggiornamento elenco…». Aperture sulle righe precedenti e paginazione sono
bloccate durante il cambio ricerca. Errori con retry esplicito; nessuna scrittura
accodata offline. Route loading dedicato. Agenda con intervallo iniziale già
coerente con vista giorno/settimana, fuso e cambio ora, senza prima query inutile.

Il polling documenti continua mentre PDF è pending, link corrente aperto o
recupero PDF fallito ancora osservabile (60 s anziché 10 s). Si ferma a lavoro
completo; un nuovo link/documento lo riattiva. Ricevere una firma non viene
scambiato per avere un PDF pronto. Nessun cambiamento a Monarch o ai token Glow.
Lazy loading degli editor rinviato: questo incremento non ne dimostra il beneficio.

## Database e spazio: porzione S06

Migrazioni forward 030–032; i file applicati 001–029 restano immutati e il runner
verifica i checksum. Le funzioni che bloccavano la riga tenant con FOR UPDATE
usano FOR NO KEY UPDATE: resta la serializzazione fra operazioni equivalenti,
ma un inserimento non correlato con FK KEY SHARE può proseguire.
Non sono rimossi lock sui documenti né controlli dopo attesa.

Sei indici per audit attore/azione/data e tenant/risorsa, preparazioni/consensi
per tenant/cliente, appuntamenti per tenant/servizio e tenant/sede. Il conteggio
file.read è limitato anche al tenant autorizzato. EXPLAIN locale ha confermato
Index Only Scan sugli indici audit e servizio; l’indice agenda esistente resta
usato. Nessuna promessa di eliminare ogni contesa o di ridurre tutte le query.

Nessun log per richiesta o tabella eventi diagnostici è stato aggiunto.
I contatori saturano a quota+1 e sono ripuliti a lotti. Gli indici consumano
spazio e vanno osservati sul Free; non si cancellano audit, outbox e prove
firmate senza una policy di conservazione approvata. Monitor capienza/retention
generale e allarme indipendente rimangono aperti in S06/CP-04/W20.

## Baseline riproducibile S00

`scripts/benchmark-api.ts` rifiuta database non loopback. Usa Supabase locale,
build produzione E2E, 1.000 clienti e 5.000 appuntamenti sintetici, dieci contesti
autenticati concorrenti della stessa titolare, dieci warmup e cento campioni
per operazione. Queste non sono dieci identità di studi diversi.

| Operazione | Prima S04, p95 | Dopo S04, p95 |
| --- | ---: | ---: |
| Elenco clienti | 132,5 ms | 109,7 ms |
| Agenda | 186,2 ms | 177,5 ms |
| Creazione cliente | 82,5 ms | 74,9 ms |

Ricaricamento agenda fino al dato visibile: 511 → 480 ms nella singola prova.
Entrambe le baseline locali erano già entro gli obiettivi API; non rappresentano
latenza Internet, cold start Vercel, Core Web Vitals o garanzia sul VPS futuro.
Il runner registra SHA, hash diff locale, BUILD_ID e risorse/ambiente nel report
locale ignorato `.cache/benchmarks/`, senza credenziali o dati reali.
Prima dei dati reali: prova separata sul deployment Hostinger con 3–5 utenti.

## Deploy dopo CI: porzione S03

Contratto operativo in [DEPLOYMENT.md](DEPLOYMENT.md). Autodeploy Git Vercel
indipendente disabilitato da vercel.json. Workflow `deploy.yml` attende
Application checks riuscito per push main della stessa repository. Provenienza
e SHA vengono verificati prima del checkout con accesso al segreto, poi ancora
dallo script; un run PR/fork, fallito o superato da main non viene promosso.
Le pubblicazioni sono serializzate e il deployment deve essere READY sullo SHA.

Serve `VERCEL_TOKEN` nei Secrets Actions della repository. L’integrazione di
questa chat riceve 403 sul relativo endpoint e non lo può configurare. In sua
assenza si esegue lo stesso script dal workspace dopo CI verde, senza riattivare
l’autodeploy indipendente. Nessun PAT o token nel repository/runtime browser.

Staging remoto separato, parametrizzazione scheduler SQL e rollback Hostinger
restano da implementare: il gate CI non costituisce un ambiente staging.

## Verifiche e punto di ripresa

Review Impeccable 4.8.0: **ship** sulle quindici catture sintetiche a
375/820/1280 px (clienti pronta, aggiornamento, vuota, errore; agenda). Tutte
aperte e valide; nessun fix materiale. Un detector manuale, perché il runner
annidato non ha prodotto risposte dal nuovo hook: sei advisory sui preesistenti
label 10/11 px, nessun rilievo meccanico nuovo. Reviewer e documenter fresh
con ruolo equivalente a quelli distribuiti, dato il limite del relativo harness.
Brief di app, intake e firma aggiornati; DESIGN/sidecar preservati. Drift
preesistenti segnalati senza ripararli fuori ambito.

Verifiche tecniche: lint, TypeScript, build produzione, 80 unit e 722 pgTAP
su 19 file passati; reset locale da zero e seconda applicazione delle 32
migrazioni riusciti. La suite browser completa va lanciata dopo reset locale:
fixture accumulate da benchmark/esecuzioni precedenti possono superare il budget
di cinque cicli del test di pulizia. Non aumentare il budget operativo né
indebolire la verifica di integrità per mascherare un database test sporco.

Comandi finali, esclusivamente su database locale:

```sh
npm run db:reset
npm run db:migrate:local
npm run test:db
npm run test:e2e -- --config playwright.cloud.config.ts
```

La CI standard usa playwright.config.ts e dipendenze browser di sistema; il
config cloud usa librerie verificate nel workspace per WebKit senza root.
Stato CI/deployment associato al tag checkpoint: verificare lo stesso SHA in
GitHub Actions e Vercel READY, secondo DEPLOYMENT.md.
I test coprono Auth/Storage/Postgres locali reali e dati esclusivamente sintetici.
Nessun flood, nuovo account, firma o email di prova sul progetto ufficiale.

Restano necessari S02 (backup DB+Storage cifrato, off-site e restore provato),
S03 staging, S07 destinatario remoto/OTP, S08 MFA/CSP e procedure di conformità,
S09 Hostinger. Il token Management/service-role non sostituisce l’accesso
PostgreSQL richiesto da pg_dump né la scelta di destinazione/chiave del backup.
Non dichiarare questi requisiti completati e non iniziare dati reali.
