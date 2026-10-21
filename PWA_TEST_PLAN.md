# W18 — PWA con connessione necessaria

Glow rimane una web app installabile. Non offre consultazione offline e non
mette scritture in coda. Il collaudo distingue browser emulati da installazione
e interazioni su dispositivi fisici: i primi non dimostrano i secondi.

## Copertura automatica

Sei scenari su Chromium desktop, Chromium con profilo Android, WebKit con
profilo iPhone e WebKit con profilo iPad (24 esecuzioni):

- Avvio con accesso richiesto, manifest, icone reali, metadati e istruzioni.
- Riconnessione entro la finestra di cache: letture aggiornate, bozza mantenuta
  in memoria, salvataggio offline rifiutato senza invio alla riconnessione.
- Ritorno in primo piano con letture nuovamente autorizzate e aggiornate.
- Sospensione di un’operatrice prima della ripresa: uscita dallo spazio protetto.
- Campi touch di almeno 16 px, dialoghi contenuti e scorribili in verticale e
  orizzontale, azioni raggiungibili, nessuna perdita del testo alla rotazione.
- Nessuna cache offline/IndexedDB/service worker per dati privati; logout e
  navigazione indietro non ripristinano lo studio della sessione precedente.

La ripresa viene stimolata con eventi di visibilità nel browser. Non equivale
alla sospensione del processo da parte di iOS. I contesti touch e le rotazioni
sono emulati: non dimostrano tastiera software, notch, fotocamera o firma col dito.
Il prompt di installazione rimane verificato sinteticamente nei test precedenti;
manifest e istruzioni non dimostrano un’installazione nativa riuscita.

```sh
npm run test:e2e -- tests/e2e/pwa.spec.ts
```

La CI installa Chromium e WebKit con le dipendenze ufficiali. Nel cloud Debian
gestito senza root, dopo il download ufficiale di WebKit:

```sh
PLAYWRIGHT_BROWSERS_PATH=/workspace/.cache/ms-playwright npx playwright install webkit
python3 scripts/setup-webkit-cloud.py
npm run test:e2e -- tests/e2e/pwa.spec.ts --config playwright.cloud.config.ts
```

Il helper usa i repository snapshot già configurati, firme e checksum APT,
estrae le librerie nel workspace e verifica l’avvio reale del motore. Il launcher
WebKit incluso sovrascrive il percorso delle librerie: la configurazione cloud
avvia direttamente lo stesso binario del download Playwright fissato. Non
modifica il browser, non disabilita controlli TLS o firma e non usa flag per
saltare la validazione. La CI continua a usare il launcher standard.

## Collaudo fisico richiesto — iPhone e iPad

L’utente ha indicato questi dispositivi il 21 ottobre 2026. Compilare gli esiti
separatamente dopo la pubblicazione del checkpoint W18 su **https://glowlabs.it**.
Usare il proprio account e bozze di prova; non inviare consensi o creare dati
clinici reali per questo controllo. Non riportare recapiti o contenuti delle
clienti nelle evidenze.

Annotare modello, versione iOS/iPadOS, versione browser, data, commit e modalità
Safari/app Home. Ogni riga resta **da eseguire** finché provata sul dispositivo.

Il 21 ottobre l’utente ha confermato «i test sono passati tutti su iPhone»
rispondendo alle tre sequenze richieste in chat: installazione/riapertura da
Home, bozza con tastiera/rotazione e rifiuto offline senza invio al ritorno rete.
Versione pubblicata: `9aa3543` (`checkpoint-pwa-2026-10-21`).
Sono esiti fisici riferiti dall’utente, non osservati dall’agente. Modello e
versione iOS non comunicati; iPad ancora senza riscontro. Non estendere la
conferma a firma, fotocamera o altri controlli non inclusi nella richiesta.

| Prova                 | Passi e risultato atteso                                                                                                                                                                                                              | iPhone                    | iPad        |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- | ----------- |
| Installazione         | In Safari aprire Glow → Il tuo studio → Condividi → Aggiungi alla schermata Home. Se presente, mantenere «Apri come app web». Icona e nome Glow leggibili.                                                                            | Pass — utente, 21/10/2026 | Da eseguire |
| Avvio da Home         | Chiudere Safari e aprire l’icona. Nessuna barra del browser nell’app; accesso richiesto se manca la sessione. Una nuova installazione può richiedere un nuovo accesso.                                                                | Pass — utente, 21/10/2026 | Da eseguire |
| Tastiera e rotazione  | Aprire Nuova cliente senza salvarla. Compilare una bozza, ruotare in entrambe le direzioni, aprire la tastiera. Nessuno zoom inatteso; campi, Chiudi, Annulla e Salva raggiungibili scorrendo. Annullare al termine.                  | Pass — utente, 21/10/2026 | Da eseguire |
| Rete assente          | Con una bozza aperta attivare modalità aereo e disattivare anche il Wi-Fi. Avviso esplicito e salvataggio rifiutato; nessun successo. Riattivare rete: bozza presente e nessun salvataggio automatico. Annullare la bozza.            | Pass — utente, 21/10/2026 | Da eseguire |
| Avvio senza rete      | Chiudere l’app, togliere ogni connessione e riaprirla. Non deve apparire un archivio offline consultabile; è possibile una pagina di errore del sistema. Non è prevista una schermata offline memorizzata.                            | Da eseguire               | Da eseguire |
| Sospensione e ripresa | Lasciare Glow in secondo piano, tornare dopo blocco schermo/cambio app. Con rete attiva le viste si aggiornano. Con sessione scaduta o permessi revocati viene richiesto accesso o mostrata sospensione.                              | Da eseguire               | Da eseguire |
| Logout e cronologia   | Uscire dall’account; usare Indietro e riaprire da Home. Nessuna scheda cliente o agenda della sessione precedente accessibile.                                                                                                        | Da eseguire               | Da eseguire |
| Touch e aree sicure   | In verticale/orizzontale controllare navigazione inferiore, indicatori di sistema e notch. Toccare, scorrere e modificare un appuntamento senza richiedere trascinamento.                                                             | Da eseguire               | Da eseguire |
| Firma e fotocamera    | Su un flusso di prova già autorizzato, tracciare/cancellare la firma e provare selezione/fotocamera senza inviare. Lo scroll non deve trascinare il foglio durante la firma; negare il permesso fotocamera deve lasciare un recupero. | Da eseguire               | Da eseguire |
| Aggiornamento         | Chiudere e riaprire con rete dopo un deploy: nuova versione caricata. Non si aggiornano o reinviano automaticamente bozze abbandonate.                                                                                                | Da eseguire               | Da eseguire |

Non interpretare come difetto un blocco corretto dei permessi clinici. Le prove
che richiedono documenti o autorizzazioni mancanti rimangono non eseguite.
L’eventuale stato perso dopo chiusura forzata è coerente con bozze solo in memoria;
in caso di invio interrotto verificarne l’esito prima di riprovare.

Per riportare un problema bastano dispositivo/versione, riga della tabella,
risultato atteso e osservato. Prima del pilota rimane necessario anche un Android
fisico: la disponibilità attuale dell’utente copre iPhone/iPad, non Android.

## Stato del gate

Le correzioni e i test browser non chiudono il gate fisico. W18 può essere
segnata completata soltanto dopo gli esiti dei dispositivi, senza confonderla
con W19 (diritti/conservazione) e W20 (backup/ripristino/monitor esterno).
