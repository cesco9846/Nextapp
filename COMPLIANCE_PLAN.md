# Glow — piano di adeguamento privacy e uso in Italia

Analisi preliminare del **28 ottobre 2026**, sul codice `53d0f76` e sulla
configurazione osservata di glowlabs.it. Stato: **adeguamento aperto; non è
un’attestazione di conformità né un’autorizzazione all’uso con dati reali**.
Le conclusioni tecniche e contrattuali qui indicate richiedono la valutazione
del consulente privacy/legale sui trattamenti effettivi e sui contratti applicabili.

Scelte confermate dall’utente: prima lo studio della sorella, poi SaaS per altri
studi; per ora sono caricati **soltanto dati sintetici di prova**. Regione dello
studio e soggetto che gestirà Glow non ancora confermati. I requisiti regionali
restano quindi aperti.

Aggiornamento del **29 ottobre 2026**: l’utente ha scelto **Hostinger VPS cloud
privato** per il passaggio alla produzione con il gruppo iniziale di **3–5
utenti**. Il piano tecnico di stabilizzazione e trasferimento è in
[STABILIZATION_PLAN.md](STABILIZATION_PLAN.md). La scelta riguarda l’app e il
backend; Supabase resta DB/Auth/Storage previsto. Regione, contratto e gestione
del VPS vanno verificati prima dei dati reali, senza assumere che il numero di
utenti esenti il primo studio dai requisiti privacy.

## Esito dell’analisi

Glow ha già controlli utili: isolamento tra studi, permessi clinici, file privati,
link limitati e revocabili, prove versionate, consensi separati nei nuovi pacchetti,
revoca dei permessi foto ed export privati. Non bastano a dimostrare l’adempimento
degli obblighi del titolare o del responsabile del trattamento.

Prima del pilota con dati reali servono una soluzione di hosting contrattualmente
idonea, informative effettive, basi giuridiche per ciascuna finalità, procedure
eseguibili per diritti/conservazione/incidenti e backup DB+file ripristinabili.
La sola pubblicazione di una privacy policy non chiude questi punti.

### Priorità immediata: hosting

Verifica in sola lettura delle API dei fornitori:

- Vercel: piano team **Hobby**; progetto Next.js e deploy in **dub1, Irlanda**.
- Supabase ufficiale: `mexokvvvxdyekauupwvt`, **eu-west-1**, stato healthy.
- L’app gestisce anamnesi, fotografie e PDF tramite route Next.js ospitate su
  Vercel. La presenza di Supabase come database non evita il transito dei dati
  nelle funzioni dell’hosting.

I termini pubblici Vercel consultati riportano due vincoli distinti [F5–F6]:

1. Hobby è riservato all’uso personale non commerciale. L’uso operativo di uno
   studio professionale va valutato come uso commerciale anche prima del SaaS.
2. Il DPA pubblico, efficace dal 31 marzo 2026, dichiara di applicarsi ai clienti
   Pro/Enterprise e in **Schedule 1, §6** afferma:
   “Customers are prohibited from including sensitive data or special categories
   of data in Customer Data.”

Non è stato esaminato un eventuale accordo individuale che modifichi queste
condizioni. Finché non è documentato un contratto idoneo, la configurazione non
va considerata approvata per i dati sanitari del progetto. **Il solo passaggio
a Pro o la scelta di una regione UE non risolvono il secondo vincolo.**

CP-00 deve verificare la destinazione scelta dall’utente: **Hostinger VPS**, con
regione EEA e DPA idonei ai dati previsti, mantenendo Supabase e dominio, senza
riscrivere il prodotto. Preparare il passaggio dell’intera app Next.js e delle
API/SSR/PDF: spostare soltanto il database o una API non basta se gli stessi dati
continuano a transitare su Vercel. Acquisto, configurazione e cutover non sono
eseguiti da questo piano e restano attività dedicate da preparare.

Per ora la raccomandazione è proseguire i test con dati sintetici. Se sono già
presenti dati reali, identificare con il titolare il perimetro e le misure
transitorie; niente cancellazioni improvvisate. Una criticità contrattuale non
equivale automaticamente a una violazione di sicurezza notificabile.

## Responsabilità nelle due fasi

| Trattamento | Ruolo da formalizzare | Evidenza richiesta |
| --- | --- | --- |
| Clienti, appuntamenti, anamnesi, consensi e foto | Di regola lo studio è titolare; Glow è responsabile se un gestore distinto tratta per suo conto | Istruzioni, nomina/contratto art. 28, persone autorizzate, assistenza ai diritti e alla sicurezza |
| Account professionali, contratto SaaS, eventuale fatturazione e finalità proprie del gestore | Gestore Glow titolare per le proprie finalità da definire | Informativa separata, basi/tempi, registro e contatto |
| Supabase, hosting, Resend e altri servizi | Ruolo per specifica finalità: sub-responsabile oppure titolare autonomo ove previsto | DPA applicabile al piano, elenco subfornitori, localizzazioni e trasferimenti |
| Accesso di sviluppatori e assistenza | Autorizzazione interna oppure rapporto di responsabile, secondo il soggetto effettivo | Accesso nominativo, riservatezza, limiti, tracciamento e revoca |

Il rapporto familiare non rende domestico un trattamento svolto per lo studio.
Se il gestore è distinto, gli accordi servono già nella prima fase. La qualifica
contrattuale deve seguire chi decide scopi e mezzi; non basta chiamare un soggetto
“responsabile” nel testo. Non si assume una contitolarità generalizzata.

## Stato verificato e lacune

“Implementato” indica una funzione tecnica, non una convalida legale.

| Area | Stato ed evidenza | Lavoro necessario |
| --- | --- | --- |
| Separazione studi e accessi | Implementata: RLS, RPC autorizzate, ruoli e assegnazioni cliniche; test nel checkpoint dei consensi | Riesame accessi e sicurezza prima del pilota, poi periodico |
| Protezione di file/link | Implementata: bucket privati, scadenza/revoca, hash, no-store/no-referrer e recupero PDF | Verificare anche hosting, log, assistenza e ripristino |
| Informativa del gestore Glow | Non individuata nel codice; login pubblico senza link legali; `/privacy` restituisce 404 | Testo del soggetto effettivo, accessibile prima della registrazione |
| Cookie e strumenti analoghi | Non trovati tracker pubblicitari/analytics nelle sorgenti esaminate; font locali | Inventario runtime, cookie Auth e servizi hosting; informativa tecnica e gestione dei non essenziali se introdotti |
| Termini e informazioni del prestatore | Non individuati; `/termini` restituisce 404 | Identità, recapiti, informazioni applicabili ex D.lgs. 70/2003; condizioni di utilizzo coerenti con studio/SaaS |
| Informativa dello studio | W19 permette pubblicazione in `/informativa/{id}` | Contenuto art. 13/14 validato, consegna prima della raccolta, disponibilità e versioni storiche; il testo effettivo dello studio non è stato esaminato |
| Bozze dell’informativa | Salvare una bozza W19 ritira il testo pubblico corrente | Mantenere la versione pubblicata durante l’editing e sostituirla solo con nuova pubblicazione; prevedere ritiro esplicito |
| Dati relativi alla salute | Nei nuovi pacchetti ricevuta esplicita prima delle risposte | Validare art. 6 + deroga art. 9, necessità delle domande e revoca; non presumere applicabile la deroga sanitaria a una professionista PMU |
| Percorsi personalizzati/precedenti | `/compila` raccoglie risposte prima della firma; non ha lo stesso gate sanitario strutturato del pacchetto nativo | Uniformare la prova della base applicabile e dell’informativa prima della raccolta, anche su input dello studio/import/API |
| Foto | Scelte separate, scope e revoca tecnica disponibili | Validare informativa/finalità, gestione revoca e rimozione dalle pubblicazioni esterne; gli originali firmati non autorizzano usi futuri revocati |
| Minori | Uno/due rappresentanti verificati nel nuovo percorso | Verifica regionale di ammissibilità, età, rappresentanza, eventuale assenso e testi; non attivare sulla base del solo PDF sorgente |
| Diritti | Export ZIP e registro richieste di cancellazione | Coprire accesso, rettifica, limitazione, opposizione, revoche, portabilità ove applicabile e risposta nei termini |
| Cancellazione/conservazione | Eliminazione di anagrafiche inutilizzate; regole versionate; nessuna distruzione clinica definitiva | Procedura controllata per dossier, Storage, prove, copie, fornitori e backup, con conservazioni motivate |
| Backup e continuità | W20 ancora aperta | Copia cifrata DB e oggetti, prova di restore e responsabilità operative |
| Incidenti | Monitor tecnici e runbook parziali; casella alert ancora da definire | Procedura data breach, referente, registro, valutazione/notifiche e simulazione |
| Fornitori e trasferimenti | Regioni osservate sopra; DPA pubblici reperiti | Accordi applicabili, piani, destinatari, paesi, basi dei trasferimenti e misure; la regione del DB non descrive l’intera filiera |
| DPIA, registro e DPO | Nessuna valutazione formalizzata individuata | Screening documentato e DPIA quando richiesta; registro art. 30 e decisione motivata sull’eventuale DPO |
| Sicurezza aggiuntiva | Password, controlli Origin e autorizzazione presenti; nessun flusso MFA trovato; CSP assente nella risposta login osservata | Piano art. 32 basato sul rischio: MFA per accessi privilegiati, sessioni, CSP, vulnerabilità e review indipendente; non sono singole certificazioni GDPR |

## Piano eseguibile

Ordine: **CP-00 → CP-01/02 → CP-03/04 → CP-05/06 → CP-07 → CP-08**.
Inventario e bozze possono avanzare mentre si decide l’hosting, usando dati
sintetici. Il lavoro SaaS contrattuale può procedere in parallelo, ma va concluso
prima dell’ingresso di altri studi. Nessuna stima economica o scadenza di consegna
è approvata; ogni incremento chiude con evidenze e checkpoint.

### CP-00 — idoneità di hosting e fornitori, P0

Responsabili: gestore + sviluppo + consulente privacy/contrattuale.

- Registrare i contratti effettivi, piano, entità contraente e subfornitori.
  Verificare le limitazioni Vercel sopra indicate, Supabase e Resend.
- Mappare browser → hosting/SSR/API → DB/Auth/Storage → PDF/export → email,
  inclusi log, metadati, assistenza e backup. Identificare i dati art. 9 in transito.
- Decidere soluzione ammessa, localizzazione, trasferimenti artt. 44–49 e costi.
  SCC/adeguatezza e valutazioni integrative vanno verificate per ciascun flusso;
  un fornitore extra-EEA non è vietato in quanto tale.
- Se si migra, provare prima su staging: dominio, Auth/redirect, cron/webhook,
  permessi, firma/PDF/export, rollback e assenza di perdita/duplicazione dati.

Accettazione: contratti idonei e catena dei trattamenti documentati; produzione
compatibile con dati e uso commerciale. Nessun residuo sanitario su un servizio
non ammesso. Nessuna modifica unilaterale di piani a pagamento.

### CP-01 — inventario, basi e responsabilità, P0

Responsabili: studio/gestore + consulente; sviluppo descrive il trattamento reale.

- Identificare i soggetti, contatti, regione, categorie di interessati, accessi
  di assistenza e strumenti esterni, compresi dispositivi personali e WhatsApp.
- Registro dei trattamenti dello studio e del gestore per i rispettivi ruoli.
  Non assumere l’esenzione sotto 250 addetti: trattamenti non occasionali e dati
  particolari richiedono la verifica dell’art. 30(5).
- Matrice finalità/dati/base art. 6/condizione art. 9/destinatari/tempi.
  Distinguere account, appuntamenti, anamnesi, prova del consenso, foto dossier,
  pubblicazione di immagini, sicurezza, promemoria e futuro marketing.
- Screening DPIA con art. 35, WP248 e lista Garante: salute, minori, vulnerabilità,
  tecnologia e scala futura. Svolgere la DPIA prima del trattamento se richiesta;
  gestire il rischio residuo elevato anche ai sensi dell’art. 36, ove applicabile.
- Valutare DPO ex art. 37 per ruolo, attività principali e scala; non nominarlo
  o escluderlo automaticamente per il solo fatto di essere una piccola impresa.

Accettazione: decisioni motivate e approvate dal titolare, con minimizzazione
del questionario. Nessun consenso “onnicomprensivo” usato per ogni finalità.

### CP-02 — documenti pubblici e loro consegna, P0

Responsabili: testi/approvazione del gestore e dello studio con il consulente;
sviluppo implementa versioni, collegamenti ed evidenze.

- Informativa Glow per account/visitatori e finalità proprie; informativa dello
  studio per clienti/rappresentanti; cookie e tecnologie analoghe; informazioni
  del prestatore e condizioni del servizio; DPA per clienti SaaS e subfornitori.
- Informative artt. 13/14: identità e contatti, eventuale DPO, scopi e basi,
  dati obbligatori/facoltativi e conseguenze, destinatari/trasferimenti, tempi
  o criteri, diritti/revoca/reclamo e altre informazioni applicabili. Nessun
  nome, P.IVA, PEC, base o termine inventato per riempire una pagina.
- Rendere i testi raggiungibili prima della creazione account e prima dei
  diversi input sanitari. Distinguere accettazione delle condizioni, informativa
  resa e consensi specifici: “accetto la privacy” non crea una base giuridica.
- Versioni con data, archivio e prova della versione resa. La pubblicazione non
  cambia i documenti già firmati; editing di una bozza non ritira la versione in uso.
- Cookie: se restano soltanto tecnici strettamente necessari, informativa senza
  imporre un banner di consenso. Se si introducono tracker non necessari,
  blocco preventivo, scelta libera, rifiuto/revoca agevoli e prova delle scelte.

Accettazione: registrazione e moduli correttamente informati su telefono/tablet/PC;
evidenze lato server quando necessarie, non aggirabili cambiando il solo frontend;
scan runtime anche autenticato e verifica delle impostazioni dei fornitori.

### CP-03 — salute, fotografie, minori e firme, P0

Responsabili: studio + consulente competente; sviluppo per controlli e prove.

- Uniformare pacchetti e percorsi legacy/personalizzati: prima informativa e
  condizione applicabile, poi raccolta. Nessuna risposta sanitaria accessibile
  o persistita dal nuovo flusso prima dei requisiti, incluse chiamate dirette API/RPC.
- Revoca della scelta sanitaria e limitazione da gestire senza confonderle con
  revoca di un link; spiegare gli effetti, senza cancellare prove legittimamente
  conservate né continuare usi privi di base.
- Foto: dossier e uso promozionale separati; nessuna penalità per rifiuto della
  promozione. Scope chiaro, revoca operativa, elenco dei canali esterni e
  procedura di rimozione sotto controllo dello studio, anche per minorenni.
- Regione e requisiti PMU da validare prima di abilitare minori. I 14 anni
  dell’art. 2-quinquies del Codice privacy riguardano il consenso per determinati
  servizi della società dell’informazione; non sono una soglia per tatuaggi/PMU.
  Verificare rappresentanza, eventuali firme/assenso e passaggio alla maggiore età.
- Verificare valore probatorio ex eIDAS/CAD, identificazione, integrità, copia
  per la cliente e reperibilità. Il pad attuale raccoglie una firma disegnata:
  non dichiararlo firma qualificata, FEA o conservazione a norma. Non assumere
  che ogni foto o tratto di firma sia automaticamente un dato biometrico ex GDPR.

Accettazione: test di rifiuto/revoca, raccolta anticipata e bypass, più soggetti,
usi foto e copia del documento. Validazione professionale dei testi originali
e dei requisiti regionali distinta dalla verifica del software.

### CP-04 — diritti, conservazione e cessazione, P0

Responsabili: studio per le decisioni; gestore per assistenza e implementazione.

- Registro unico delle richieste con canale di ricezione, identità verificata
  in modo proporzionato, titolare competente, scadenze, decisione e risposta.
  Coprire tutti i diritti applicabili, non soltanto export/cancellazione.
- Gestire art. 12: risposta normalmente entro un mese; eventuale proroga fino
  a ulteriori due mesi solo nei casi ammessi e comunicata entro il primo mese.
  Per il processor definire tempi di assistenza che consentano il rispetto dei termini.
- Approvare tempi per ogni categoria, eventi di decorrenza e legal hold.
  Il “minimo cinque anni” del PDF sorgente non è una regola nazionale generale.
- Progettare cancellazione verificabile di dossier e file: preflight, motivazioni
  di conservazione, eventuale limitazione, conferma controllata, operazione
  idempotente, prove minime senza ricopiare dati eliminati e verifica sui fornitori.
- Definire eliminazione a termine dei backup, blocco di riapparizione dei dati
  cancellati dopo restore e istruzioni di restituzione/eliminazione alla cessazione
  del servizio ex art. 28. Non promettere cancellazione istantanea ovunque.

Accettazione: simulazione con dossier sintetico completo, compresi prove firmate,
foto, export, copie e restore. Archiviazione e stato “richiesta ricevuta” non
sono una cancellazione; un obbligo di conservazione non consente usi illimitati.

### CP-05 — continuità e sicurezza operativa / W20, P0

Responsabili: sviluppo/operazioni + gestore, con requisiti approvati dallo studio.

- Backup cifrati del database **e degli oggetti Storage**, chiavi custodite
  separatamente, retention e accessi documentati. Su Supabase Free non assumere
  backup gestiti recuperabili: il fornitore raccomanda export regolari off-site
  e specifica che i backup DB non includono i file Storage [F9].
- Provare restore isolato e cronometrato, PDF/foto scaricabili, Auth/permessi,
  revoche e gestione cancellazioni dopo ripristino. RPO/RTO di progetto sono
  obiettivi da verificare, non termini previsti dalla legge.
- MFA/accessi privilegiati, sessioni e revoche, gestione sicura delle chiavi,
  CSP e difese XSS, dipendenze, rate limit, audit minimizzato e review di sicurezza
  indipendente proporzionata ai rischi. Niente corpi sanitari nei log/provider support.
- Separare produzione e prove; nessuna copia reale nei test o nei repository.
  Verificare retention di log/app/hosting/provider e costi del piano scelto.

Accettazione: prova di recupero e accessi riuscita, evidenze di sicurezza,
budget approvato e runbook assegnati. Non basta una scritta “backup attivo”.

### CP-06 — incidenti e organizzazione, P0

Responsabili: gestore e studio per i rispettivi ruoli; consulente per valutazioni.

- Referente, sostituto, canale urgente e registro violazioni; autorizzazioni,
  riservatezza e istruzioni per professioniste, assistenza e dispositivi condivisi.
- Il responsabile informa il titolare senza ingiustificato ritardo. Il titolare
  valuta la notifica al Garante entro 72 ore dalla conoscenza della violazione,
  quando dovuta ex art. 33, e la comunicazione agli interessati ex art. 34 nei
  casi previsti; documentare anche le decisioni di non notificare.
- Simulare credenziale compromessa, accesso errato, perdita file, invio email
  al recapito sbagliato e indisponibilità. Integrare gli alert tecnici quando è
  definita la casella, senza includere dati di clienti negli avvisi.

Accettazione: esercitazione con tempi, responsabilità e azioni registrati;
nessuna comunicazione reale di prova inviata senza istruzione esplicita.

### CP-07 — gate per il primo studio, P0

Usare dati reali soltanto quando CP-00–06 sono chiusi nelle parti applicabili,
con evidenze e validazione dello studio/consulente: non serve una certificazione
GDPR generica del sito. Approvazione dei testi e dei rischi distinta dai test tecnici.
Partire dal perimetro effettivamente validato; minori o fotografie promozionali
possono restare esclusi dal pilota se i relativi requisiti sono ancora aperti.

Completare inoltre i controlli fisici W18 pertinenti. Gli esiti iPhone già raccolti
restano validi al loro perimetro e non certificano privacy, firma o norme regionali.

### CP-08 — gate SaaS e altre norme, prima di altri studi

- Formalizzare gestore, offerta, condizioni B2B, DPA art. 28, istruzioni e
  subfornitori; processo onboarding per informative/basi/tempi di ogni studio,
  supporto, contestazioni, restituzione dati e uscita dal servizio.
- Informazioni del prestatore ex D.lgs. 70/2003 e obblighi societari/fiscali
  pertinenti. Il Codice del consumo si valuta se l’offerta si rivolge anche a
  consumatori; non applicare automaticamente al SaaS B2B le regole B2C.
- Accessibilità: valutare D.lgs. 82/2022 e L. 4/2004 secondo servizio offerto,
  destinatari, dimensioni ed eventuali esenzioni. Non tutti i SaaS B2B ricadono
  automaticamente nei servizi di commercio elettronico al consumatore; mantenere
  comunque il livello di accessibilità di progetto e verificare anche i PDF.
- eIDAS/CAD per le prove e le dichiarazioni sulle firme; discipline regionali
  PMU/tatuaggio, REACH per pigmenti e obblighi della professionista restano
  verifiche distinte. Glow non può rendere lecito un trattamento non ammesso.
- Licenze software, font, immagini e autorizzazione a riusare i testi dei moduli;
  eventuali funzionalità premium del calendario e loro condizioni commerciali.
- Riesame DPIA/DPO/registri/trasferimenti con l’aumento di studi, dati, servizi
  e fornitori. Niente marketing a clienti dei tenant per finalità proprie di Glow
  senza valutazione autonoma e presupposti specifici.

Accettazione: onboarding contrattuale e tecnico completo per un secondo tenant
sintetico, verifica dell’uscita dal servizio e fascicolo di conformità aggiornabile.

## Comunicazioni e fornitori: regole trasversali

Reminder di servizio e marketing sono finalità diverse. Validare base e informativa
per i primi; non usare la prenotazione come consenso promozionale. Mantenere testo
minimo senza anamnesi, fotografie o dettagli sanitari. Il click WhatsApp manuale
resta una comunicazione da valutare con dispositivi/account dello studio e
informativa: non evita gli obblighi di riservatezza o trasferimento.

Il DPA Resend consultato indica operazioni principali negli USA e nell’allegato
qualifica i dati sensibili trasferiti come “Not applicable” [F8]. Verificare
coerenza del contratto con i messaggi effettivi, metadati, tracking e tempi;
non inviare allegati clinici attraverso quel canale senza nuova verifica.

Il DPA Supabase contempla categorie particolari, con condizioni specifiche
per dati soggetti alla normativa statunitense HIPAA [F7]. Queste non sono una
certificazione GDPR dello studio e non rendono HIPAA automaticamente applicabile
al progetto italiano. Verificare accordo, piano, subfornitori e trasferimenti.

## Evidenze e limiti di questa analisi

Consultati codice e contratti del progetto: `PRIVACY_OPERATIONS.md`,
`DEFAULT_CONSENTS.md`, `ARCHITECTURE.md`, `QUALITY_PLAN.md`, `IMPLEMENTATION_PLAN.md`,
route dell’informativa, Auth, moduli di compilazione/firma, consensi foto,
privacy/export, policy HTTP e adapter email. Configurazioni fornitori lette senza
modificarle; nessuna lettura di dossier o elenco persone e nessun invio.

HTTP pubblico verificato con TLS attivo: login 200 senza link legali nel markup;
`/privacy`, `/cookie-policy` e `/termini` 404; HSTS presente, CSP non osservata.
I nomi delle route non sono obbligatori: rilevano informazione e reperibilità.
L’assenza di link al login e nel codice esaminato motiva il gap.

La prova browser anonima non è stata completata per la CA del proxy cloud non
riconosciuta da Chromium; non è un rilievo sul certificato di produzione. Non è
stato disabilitato TLS. Lo scan runtime di cookie/tracker autenticati rimane da fare.
Non verificati documenti firmati con fornitori, eventuali accordi individuali,
testi effettivi dello studio, dispositivi e attività esterne. Non è un penetration
test, una DPIA completa o una ricognizione esaustiva di ogni norma vigente.

Materiale tecnico di supporto in `.cache/compliance/`, ignorato da Git, senza
chiavi o dati clienti. Non è stato modificato codice, database o hosting.

## Fonti da conservare nel fascicolo

Consultate il 28 ottobre 2026; verificare versioni applicabili prima dell’adozione.
I termini pubblici non provano da soli quale contratto sia stato accettato.

- **F1 — GDPR**, artt. 5–9, 12–22, 24–25, 28–30, 32–37 e 44–49:
  [EUR-Lex](https://eur-lex.europa.eu/eli/reg/2016/679/oj/ita),
  [portale Garante e testo](https://www.garanteprivacy.it/il-testo-del-regolamento).
  EUR-Lex non ha restituito il testo in questo ambiente; testo vigente e articoli
  sono da riscontrare nel fascicolo legale, senza dedurre aggiornamenti da un fetch vuoto.
- **F2 — Codice privacy, D.lgs. 196/2003**, incluso art. 122 e art. 2-quinquies:
  [Normattiva](https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato:decreto.legislativo:2003-06-30;196).
- **F3 — Cookie, Garante, linee guida 10 giugno 2021**:
  [provvedimento 9677876](https://www.garanteprivacy.it/home/docweb/-/docweb-display/docweb/9677876).
- **F4 — DPIA, Garante, elenco 11 ottobre 2018**:
  [provvedimento 9058979](https://www.garanteprivacy.it/home/docweb/-/docweb-display/docweb/9058979)
  e [allegato](https://www.garanteprivacy.it/home/docweb/-/docweb-display/docweb/9059358).
- **F5 — Vercel DPA**, efficacia 31 marzo 2026, ambito Pro/Enterprise e Schedule 1 §6:
  [testo pubblico](https://vercel.com/legal/dpa).
- **F6 — Vercel Hobby e uso commerciale**:
  [piano](https://vercel.com/docs/plans/hobby),
  [fair use](https://vercel.com/docs/limits/fair-use-guidelines#commercial-usage).
- **F7 — Supabase DPA**:
  [testo pubblico](https://supabase.com/legal/customer-resources/data-processing-addendum).
- **F8 — Resend DPA**, §6 e allegato sui trasferimenti:
  [testo pubblico](https://resend.com/legal/dpa).
- **F9 — Supabase backup**, Free e oggetti Storage esclusi dai backup DB:
  [documentazione](https://supabase.com/docs/guides/platform/backups).
- **F10 — D.lgs. 70/2003**, art. 7 e obblighi applicabili ai servizi:
  [Normattiva](https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato:decreto.legislativo:2003-04-09;70).
- **F11 — Accessibilità, D.lgs. 82/2022**:
  [Normattiva](https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato:decreto.legislativo:2022-05-27;82).
- **F12 — CAD, D.lgs. 82/2005**, disciplina del documento informatico e firme:
  [Normattiva](https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato:decreto.legislativo:2005-03-07;82).

Per articoli e modifiche successive consultare il testo vigente; per PMU e minori
aggiungere le fonti regionali solo dopo aver confermato luogo e attività.
