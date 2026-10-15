# Archivio privato — incrementi W10–W11

Questa consegna implementa API, ciclo di vita e UI delle etichette dei pigmenti. La schermata foto,
le categorie prima/dopo/guarito, i consensi d’uso e gli upload da fotocamera
saranno collegati in W14. Non è ancora il dossier clinico completo.

## Confini attuali

- Bucket `glow-private`, privato, massimo 10 MiB per oggetto. Tipi supportati:
  `client_photo` e `pigment_label`, immagini statiche JPEG, PNG e WebP fino a 20 megapixel.
- HEIC, SVG, immagini animate, PDF e firme non entrano in questo percorso.
  PDF/firma avranno contratti e permessi specifici nei rispettivi incrementi.
- Metadati in `stored_files` con tenant, cliente, eventuale appuntamento della
  stessa cliente, autore e richiesta idempotente. Nessun nome file o PII nel path:
  `<tenant UUID>/<file UUID>/upload` e `/image`.
- Una titolare accede solo alle proprie clienti. Per un’operatrice servono
  membership attiva, abilitazione clinica e assegnazione attiva alla cliente.
  La sola disponibilità della chiave pubblica o del percorso non dà accesso.
- Un’etichetta appartiene invece al pigmento del tenant, con cliente e
  appuntamento nulli. Solo la titolare prepara l’upload; titolare e operatrici
  cliniche attive possono leggerla. Associarla a un lotto richiede stesso pigmento,
  tenant e stato ready. Le etichette pronte restano risorse di catalogo anche se
  il salvataggio del lotto viene interrotto; la retention dei ready rientra in W19.
- Limite persistente iniziale: 100 preparazioni e 200 MiB dichiarati per studio
  nell’ultima ora; le cancellazioni non azzerano il conteggio. Massimo 60 richieste
  di lettura per persona al minuto. Sono limiti tecnici, non piani commerciali.

## Flusso delle API

Tutte le mutazioni richiedono sessione valida, Origin canonico e payload strict.
Il client non decide tenant, autore, stato pronto o percorso dell’oggetto finale.

1. Calcolare dimensione e SHA-256 dei byte da inviare; generare un `request_id`
   UUID e conservarlo in memoria per il retry esplicito della stessa operazione.
2. `POST /api/clients/:clientId/files` con:

   ```json
   {
     "request_id": "UUID",
     "size_bytes": 12345,
     "sha256": "64 caratteri esadecimali minuscoli",
     "mime_type": "image/jpeg",
     "appointment_id": "UUID opzionale"
   }
   ```

   Risponde con ID, stato, bucket, `upload_path` e scadenza (un’ora). Stessa
   richiesta/stesso payload restituisce la stessa risorsa; payload diverso dà 409.

3. Inviare con il client Supabase della **sessione utente**, usando
   `storage.from(bucket).upload(upload_path, file, { contentType, upsert: false })`.
   Sono ammessi solo gli upload ordinari: creazione token di upload firmato,
   upsert, sostituzione, copia, TUS/S3 e scrittura del percorso finale sono esclusi.
   La policy controlla il tipo di operazione Storage e i metadati ancora attivi.
4. `POST /api/files/:id/complete` con `{}`. Il server verifica dimensione e hash
   effettivi; decodifica l’immagine, controlla formato/pixel e rifiuta contenuto
   troncato o animato. Applica l’orientamento e ricodifica senza EXIF/GPS.
   Il checksum finale riguarda i byte normalizzati e può differire da quello
   iniziale. Scrive il nuovo oggetto senza sovrascrivere e solo allora finalizza
   il record. Un oggetto già scritto viene riusato solo se il checksum coincide.
5. `POST /api/files/:id/read` con `{}`. Nuova verifica autorizzativa e audit prima
   della generazione del link; risposta JSON `no-store`, URL valido 30 secondi.
   Nessun accesso diretto, listing o firma tramite la Storage API della sessione.
6. `GET /api/clients/:clientId/files?page=0` restituisce i soli file pronti,
   50 per pagina con `has_more`, sotto gli stessi permessi clinici.
7. `DELETE /api/files/:id` annulla solo un caricamento non ancora pronto del
   suo autore autorizzato. Un file pronto richiederà la procedura di retention,
   non viene cancellato come se fosse un upload interrotto.

Un URL già emesso rimane valido per i suoi 30 secondi anche dopo revoca: non
promettere invalidazione anticipata. Le nuove letture, preparazioni e upload
vengono invece negati dai permessi correnti. Non conservare link o immagini per
la consultazione offline.

Per le etichette il punto 2 usa `POST /api/clinical/pigments/:id/labels` con gli
stessi campi escluso `appointment_id`; completamento, lettura e annullamento
restano le API comuni. La UI del lotto calcola hash, carica con la sessione e
attende la verifica prima di associarlo. Il retry esplicito riusa richiesta e
risorsa in memoria. L’anteprima usa un URL breve senza ottimizzazione/cache
immagini condivisa e lo elimina dallo stato alla chiusura.

## Stato e recupero

`pending → ready`, oppure `pending → failed → discarded`. Un pending scaduto
passa direttamente a discarded durante la pulizia. Lo stato ready è immutabile
per i client; un errore di rete non produce un successo fittizio.

- File mancante o Storage temporaneamente indisponibile: nessun ready, retry
  esplicito sulla stessa risorsa mentre il pending è valido.
- Formato/hash non validi: failed; l’utente deve preparare un nuovo upload.
- Crash dopo la scrittura normalizzata ma prima del commit: il retry verifica
  e riusa l’oggetto oppure la pulizia rimuove entrambi gli oggetti dopo scadenza.
- La finalizzazione ricontrolla l’accesso dell’autore anche se il server ha iniziato
  l’elaborazione prima di una sospensione. Il primo ready registra l’attore reale.

La pulizia reclama al massimo 50 risorse per esecuzione con `SKIP LOCKED`, lease
cinque minuti e token di claim. Chiude il pending prima di rimuovere i file e
aspetta gli INSERT Storage già in corso tramite il lock sul record. Una scrittura
successiva è negata; i token di upload firmato sono vietati proprio per evitare
che possano sopravvivere a questo controllo.

Per ready rimuove soltanto l’originale temporaneo; per failed/scaduti anche
l’eventuale copia finale non referenziata. Un fallimento lascia scadere il lease
per il retry. L’acknowledgment richiede il claim corrente. I record discarded sono riconciliati anche dopo un acknowledgment: se una
scrittura privilegiata termina in ritardo, il successivo job rileva l’oggetto
e lo elimina. I metadati rimangono
per audit e conteggio dei limiti; non contengono il corpo dell’immagine.

```sh
# Solo fixture locali
node --use-env-proxy --import tsx scripts/cleanup-files.ts --local
# Progetto ufficiale, credenziale server già nelle variabili sicure
node --use-env-proxy --import tsx scripts/cleanup-files.ts --project-ref mexokvvvxdyekauupwvt
```

Eseguire dal checkout di manutenzione con `npm ci`, inclusi gli strumenti TSX.
`--import tsx` mantiene il processo Node e il proxy ereditato; il launcher CLI
TSX può avviare un figlio senza il flag proxy. Entrambe le credenziali server
esistenti sono state provate; nessun nuovo segreto è necessario.

Il comando stampa solo conteggi ed esce con errore se rimangono claim falliti.
Non esiste un endpoint cron pubblico. La pianificazione automatica e l’allarme
sui ritardi vanno configurati sull’hosting scelto prima del pilota; al momento il
job è eseguibile manualmente. Non affidarsi a un timer nel server web.

## Verifiche e riferimenti

pgTAP prova RLS, grants, idempotenza, cancellazione, lease e limiti persistenti.
I test d’integrazione Chromium usano Storage locale reale: controllano formati
contraffatti, hash errato, normalizzazione, accessi fra studi, revoca, token di
upload negati, completamento concorrente e recupero dopo crash/pulizia ripetuta.
Il test aggiunto sui token firmati falliva prima della migrazione 006 e passa
con la restrizione del tipo di operazione.

Fonti del controllo operativo:
[helper ufficiali Storage](https://supabase.com/docs/guides/storage/schema/helper-functions),
[operazioni del server Storage](https://github.com/supabase/storage/blob/master/src/http/routes/operations.ts).
Le funzioni `storage.operation` e `storage.allow_only_operation` sono state
verificate sia localmente sia nel progetto ufficiale prima della migrazione.
