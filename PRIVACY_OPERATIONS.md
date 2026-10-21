# W19 — dati, richieste privacy e conservazione

## Contratto dell’incremento

La titolare gestisce questi strumenti da «Il tuo studio». L’export completo di
una cliente richiede anche `clinical_access`, verificato nel database dopo il
lock dello studio. Operatrici, altri studi e utenti sospesi non possono creare,
leggere o scaricare export o richieste privacy tramite API, RPC o Storage.

- Export ZIP per cliente, con JSON, CSV protetti da formula injection, foto,
  etichette dei lotti effettivamente usati e PDF disponibili. Gli originali
  firmati e le risposte sono inclusi; i token dei link non vengono esportati.
  Sono inclusi anche metadati di compilazione/firma, esiti dei promemoria,
  conferme/disdette e le tracce di audit riferite a quel dossier. Non si esportano
  hash dei token, chiavi, payload dei provider o dati delle altre clienti.
- Snapshot transazionale, richiesta idempotente, al massimo tre export attivi
  per studio e due nuove richieste al minuto. Limiti espliciti: 200 allegati,
  50 MiB complessivi, 2 MiB di metadati. Il superamento fallisce senza un file
  parziale: serve una procedura assistita, non un export silenziosamente troncato.
- Nessun link pubblico o firmato: download autenticato con nuova autorizzazione,
  audit e `no-store`. File e snapshot scadono dopo 24 ore. La pulizia schedulata
  elimina soltanto queste copie temporanee, mai originali o prove firmate.
- Registro delle richieste di cancellazione con verifica identità e stati
  espliciti. La conservazione richiede una motivazione specifica e conserva il
  riferimento alla versione delle regole. Registrare, ritirare o motivare un diniego non cancella il dossier.
  L’archiviazione operativa rimane una funzione separata.
- Regole versionate per contatti, dossier clinico e audit: mesi, base/motivazione,
  informativa e contatto privacy dello studio. Nessun termine legale inventato,
  nessuna cancellazione clinica automatica. Le impostazioni indicano una soglia
  di revisione manuale, non un permesso di distruzione.
- Informativa consultabile senza account in `/informativa/{studio-id}` solo
  dopo la conferma esplicita di revisione/pubblicazione. Le bozze non sono
  pubbliche. La pagina non espone regole interne, clienti o dati del dossier;
  salvare una modifica come bozza ritira il testo pubblico corrente.

La pulizia riusa il runner manutenzione già attivo, con massimo dieci elementi
complessivi per invocazione tra staging e copie export, claim e lease. Il monitor
esistente include le copie in ritardo nel segnale `cleanup_backlog`; non vengono
aggiunti cron o notifiche email. Snapshot scaduti sono svuotati anche dalla
retention oraria; metadati di copie eliminate rimossi dopo trenta giorni.
Audit e registro richieste non vengono eliminati da questa pulizia tecnica.

## Sequenza di implementazione e accettazione

1. Migrazione forward 027: RLS, RPC con lock e controlli espliciti, snapshot
   privati, lease generazione e pulizia, registro richieste e regole versionate.
2. ZIP verificato per hash/dimensione di ogni allegato, bucket privato separato,
   recupero dei retry senza sovrascrivere un artefatto e revoca immediata dei download.
3. Estensione shadcn delle impostazioni: ricerca cliente per ID, export e retry,
   scadenza/revoca, richieste e conservazione. Stati vuoto/errore/offline espliciti.
4. Test SQL di isolamento, privilegi, concorrenza logica, scadenza e cleanup;
   test unitari CSV/ZIP e test browser con vere sessioni e Storage solo locali.
5. Review visiva desktop/tablet/telefono, documentazione e checkpoint GitHub;
   migrazione ufficiale soltanto dopo verifica locale e deploy compatibile.

## Prima del pilota

Confermare con lo studio e il consulente competente tempi e basi per le categorie
di dati, informativa effettivamente consegnata, procedura d’identificazione,
risposta alle richieste e gestione di obblighi di conservazione/contenziosi.
La UI non dichiara conformità legale né una richiesta «cancellata» se i dati
sono ancora conservati. La distruzione definitiva e il suo rapporto con backup,
Storage, audit e prove immutabili richiedono una procedura approvata separata.
W20 verifica backup e ripristino; nessuna richiesta privacy modifica i backup
automaticamente. Nessuna comunicazione alla cliente viene inviata da W19.
