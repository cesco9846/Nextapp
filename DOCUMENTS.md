# Firma e PDF — W13

## Flusso

La compilazione W12 resta una raccolta di risposte non firmate. Dalla preparazione
salvata, la professionista apre **Firma e documenti** e genera un link di firma
oppure avvia il tablet. Le risposte richieste devono essere complete. La cliente
controlla testi, risposte, informazioni ed etichette dei lotti, scrive il nome,
traccia la firma e conferma il consenso. La firma può essere tracciata anche con
la tastiera: Invio, frecce, Invio. Non raccogliamo pressione, velocità o altri
parametri biometrici; non dichiariamo una firma digitale qualificata.

Il link `/firma#token` autorizza solo quel documento. Il frammento viene rimosso
dalla barra e mantenuto in memoria; nessun token è nei parametri delle richieste
GET, nei log o nella persistenza del browser. La durata è 24 ore per il link,
30 minuti per il tablet, sempre entro la fine dell’appuntamento. GET/HEAD non
consumano il link. Un nuovo link revoca il precedente dello stesso tipo.

Il tablet effettua logout server della sessione professionale prima della
navigazione completa al documento. Risposte di avvio incomplete/ambigue portano
all’accesso svuotando la cache professionale. Cronologia, URL protetti e nuova
sessione seguono gli stessi vincoli W12. Non è un kiosk del sistema operativo.

## Snapshot e commit

`consent_requests` contiene i metadati RLS del link. `signature_payloads`, nello
schema privato, conserva soltanto hash del token, snapshot e hash dello snapshot.
Il documento da controllare fissa nome studio/cliente, servizio e data, testi e
revisioni pubblicate, risposte, dati storici dei lotti e hash delle etichette.
Il modulo W13 può leggere quelle risposte specifiche: è una capability separata
dal modulo W12, che non mostra risposte precedenti.

Al POST di firma, il server controlla hash dello snapshot, nome, dichiarazione
esplicita, struttura/limiti dei tratti, revisioni e autorizzazione corrente
dell’autrice. Archivio cliente, scadenza/revoca, appuntamento modificato o
concluso, cambio preparazione e revoca dell’assegnazione impediscono una nuova
firma. I lotti vengono ricontrollati anche dopo l’emissione del link.

Sotto lock tenant → appuntamento → richiesta/preparazione, una transazione
salva `consents`, `signed_payloads`, job PDF, consumo del token e audit.
Ora della firma e hash del contenuto provengono dal server. Il payload firmato
include snapshot, firma, firmatario, dichiarazione e timestamp; è immutabile.
Ogni revisione della preparazione ammette un solo consenso. Link paralleli e
compilazioni ancora aperte vengono invalidati. Le modifiche successive richiedono
un nuovo documento, collegato al precedente senza sovrascriverlo.

Un retry con il payload identico restituisce la ricevuta originaria, senza
riaprire i dati. Un diverso invio non può sostituire la firma. In caso di risposta
persa, il browser blocca le modifiche e conserva in memoria l’esatto tentativo
per **Riprova invio**. Nessun invio avviene automaticamente alla riconnessione.
Chiudere o ricaricare la pagina perde la memoria locale: lo studio verifica le
firme già ricevute prima di proporre un’altra firma.

## PDF recuperabile

La risposta di firma conferma il commit DB, non la disponibilità del PDF.
`after()` di Next.js avvia un lavoro limitato a un documento, con durata massima
60 secondi su Vercel. `document_jobs`, nello schema privato, conserva stato,
tentativi, lease di due minuti e token di claim. I worker condividono l’ordine
tenant → job con revoche/retry. Un worker scaduto non può finalizzare.

Il renderer `glow-pdf-v1` usa pdf-lib 1.17.1, fontkit 1.1.1, Noto Sans da
Fontsource 5.3.0, dimensioni A4 e date/font/metadata fissati. Il font WOFF viene
convertito in un sottoinsieme incorporabile dal renderer. Gli accenti e i testi
lunghi sono verificati anche con Poppler; `poppler-utils` è richiesto dai test.
L’anteprima segnala i caratteri non presenti nel font prima della firma; nomi
con simboli non supportati vengono respinti. L’espansione ad altri alfabeti
richiederà font e renderer versionati, prima di promettere tale copertura.

Il PDF contiene testi, risposte, firma, nome/ora e copie visive delle etichette
storiche verificate per SHA-256. Le immagini sono ridimensionate per il documento;
gli originali restano privati e immutabili. Un allegato JSON conserva i valori
acquisiti. Non viene pubblicato un URL dei documenti delle altre clienti.

Il bucket `glow-documents` è privato e non concede accesso Storage alle sessioni
ordinarie. Il path deterministico è tenant/documento/renderer.pdf. Stessi input
producono gli stessi byte; upload `upsert:false`, rilettura, dimensione e SHA-256
precedono lo stato `ready`. Se l’upload riesce e la finalizzazione SQL fallisce,
il tentativo successivo verifica e riusa lo stesso oggetto. Oggetti differenti
non vengono sovrascritti. Il vincolo è verificato con un vero upload e una
finalizzazione interrotta in Supabase locale.

Se `after()` non parte o il processo termina, la firma e il job restano salvati.
Da **Documenti firmati → Riprova generazione PDF**, una professionista ancora
autorizzata può riprendere il lavoro senza rifirma. Il lease attivo impedisce un
doppio lavoro; un lease scaduto è recuperabile. Non c’è ancora uno scheduler di
retry continuo: resta da collegare al runner prima del pilota. Il motore W15
consegnato in REMINDER_WORKER.md riguarda l’outbox dei reminder.

## Lettura, limiti e prove

Listing di soli metadati tramite RLS clinica. Il download è un POST con sessione
e controllo origine: RPC auditata sotto lock, rilettura Storage e checksum,
risposta binaria `private, no-store`. Nessuna URL pubblica o cache di PDF.
Le etichette nel modulo cliente passano da una RPC che limita l’ID allo snapshot
del link e audita prima di dare al server il riferimento da verificare.

Limiti iniziali: 300 richieste/minuto globali e 30 per token, contando anche i
rifiuti; finestre obsolete rimosse. Inviti alla firma: 60/studio/ora; retry manuali
PDF: cinque/persona/minuto. Questi limiti non sostituiscono i limiti HTTP hosting
prima del pilota. Il PDF ammette al massimo 25 MiB, firma massimo 2.000 punti e
40 tratti; nessuna risorsa esterna è accettata dal renderer.

Le suite usano esclusivamente database locale e persone/testi sintetici. I test
coprono grant/RLS/audit, immutabilità e consumo atomico, invii concorrenti,
risposta persa, versioni/revoca/scadenza, revoca clinica durante attesa lock,
tablet/logout, rete assente senza coda, PDF lungo/accenti e crash dopo upload.
Testi clinici, validità del consenso nel contesto professionale e dispositivi
fisici restano da approvare/collaudare prima di raccogliere documenti reali.

## Estensione W14: scelte foto

Nuovi snapshot includono la policy foto versionata; scelte facoltative e non
preselezionate sono distinte dalla conferma del trattamento. I record di
autorizzazione separati, revocabili e legati al documento sono descritti in
[PHOTOS.md](PHOTOS.md). `glow-pdf-v2` aggiunge testo e sì/no espliciti; v1 e
relativi path/byte non vengono riscritti. Le vecchie richieste e gli invii senza
scelte non concedono autorizzazioni.
