# Glow — modelli predefiniti Microblading e Lip Blush

Proposta del 28 ottobre 2026, derivata dai due PDF forniti dall’utente e dal
codice corrente (`cb65c03`). Il piano è stato approvato dall’utente il 28 ottobre 2026 e implementato.
Contratto e uso corrente: [DEFAULT_CONSENTS.md](DEFAULT_CONSENTS.md).
I modelli richiedono adozione/revisione/pubblicazione esplicite nello studio.

Decisione confermata dall’utente: **includere subito le clienti minorenni**,
con percorso dedicato al genitore/tutore. L’utente ha autorizzato l’implementazione dell’intero piano.

## Risultato desiderato

In «Consensi e pigmenti», la titolare sceglie «Usa un modello predefinito»,
seleziona Microblading oppure Lip Blush, verifica i dati del proprio studio e
associa un servizio del catalogo. Ottiene una copia personalizzabile del
pacchetto, da controllare e pubblicare esplicitamente. Nessuna attivazione
automatica, sovrascrittura dei modelli esistenti o associazione basata sul nome
del servizio. Lo stesso pacchetto può essere adottato per servizi diversi,
per esempio prima seduta e ritocco, tramite associazioni esplicite.

La cliente vede un percorso leggibile sul telefono; il documento finale
comprende testi, risposte, scelte e firme pertinenti. I PDF originali sono
fonti editoriali, non sfondi da compilare con coordinate fisse. L’impaginazione
del documento generato segue Glow e non deve restare di quattro pagine.

## Cosa contengono le fonti

Entrambi i PDF hanno quattro pagine, datate nel testo 09/08/2026, senza campi
AcroForm compilabili. Non contengono anagrafiche cliente già compilate.

| Parte | Microblading | Lip Blush | Destinazione proposta |
| --- | --- | --- | --- |
| Operatrice, titolare e contatti | Dati specifici dello studio sorgente | Uguali | Profilo professionale dello studio adottante |
| Cliente e seduta | Nascita, contatti, data e prima/ritocco/mantenimento | Uguali | Dati strutturati, fissati nel documento |
| Descrizione e rischi | Specifici sopracciglia/microblading | Specifici labbra; herpes | Testo del consenso per servizio |
| Pre-trattamento | 13 righe Sì/No | 14 righe Sì/No | Questionario, più campo spiegazioni |
| Consenso al trattamento | Conferma, firma cliente e operatrice | Uguale | Dichiarazioni e atti di firma distinti |
| Post-trattamento | Cura sopracciglia | Cura labbra | Testo specifico e conferma di ricezione |
| Privacy | Informativa e consenso esplicito ai dati sanitari | Uguali | Informativa dello studio e scelta dedicata |
| Fotografie | Riservate/promozionali, dettaglio/riconoscibile | Uguali | Scopi distinti e limite di riconoscibilità |
| Minorenni | Genitore/esercente responsabilità, dichiarazione e firma | Uguale | Rappresentanza e firma dedicate |

Una riga Sì/No contiene due frasi interrogative sul PMU precedente: non
dividerla automaticamente contando i punti interrogativi. Il trasferimento
deve conservare il significato e segnalare eventuali scissioni per revisione.
Una risposta sanitaria «Sì» richiede attenzione dell’operatrice, non costituisce
da sola un’esclusione o un’autorizzazione automatica al trattamento.

I riferimenti al Veneto e alla conservazione di almeno cinque anni sono
affermazioni dei documenti sorgente, non regole nazionali verificate in questa
analisi. Non inserirli come default inderogabile per tutti gli studi. Ambito
territoriale, aggiornamento dei testi, requisiti per minori, tempi e basi vanno
verificati per lo studio che adotta il pacchetto. Le dichiarazioni sull’uso di
materiale sterile/monouso e pigmenti conformi vanno confermate dalla titolare.

## Cosa esiste e cosa manca in Glow

Esistono modelli consenso/anamnesi per servizio, pubblicazioni immutabili,
domande Sì/No e testo, risposte riservate, link e tablet, firma della cliente,
snapshot dei lotti, PDF privati recuperabili, due scopi foto e registro privacy.

Limiti verificati nel codice:

- Il consenso contiene solo testo semplice; le domande appartengono all’anamnesi.
  I limiti attuali sono 12.000 caratteri e 30 domande. Trascrivere tutte le pagine,
  compresi intestazioni ripetute e campi vuoti, non crea scelte utilizzabili.
- Il form pubblica direttamente una versione: manca una bozza persistente del
  pacchetto, verificabile prima della pubblicazione.
- Il profilo studio non contiene ragione sociale/P. IVA/PEC/titolare documentale;
  l’anagrafica cliente non contiene data o luogo di nascita.
- Mancano tipo di seduta, consenso sanitario distinto prima dell’anamnesi,
  conferma specifica di ricezione delle istruzioni e firma dell’operatrice.
- Le scelte foto attuali sono due booleani; manca «solo dettaglio» rispetto a
  «immagine riconoscibile». La policy foto è fissata dal codice, non dal modello.
- Non esistono rappresentanza legale, firmatario distinto dalla cliente,
  verifica dell’età o percorso per eventuali più esercenti richiesti.

L’utente creatore di una preparazione e il nome digitato nel form non equivalgono
alla firma dell’operatrice o alla verifica della responsabilità genitoriale.

## Libreria e dati dello studio

Proposta: due pacchetti di contenuto versionati, condivisi come definizioni
generiche, senza dati dello studio sorgente né dati cliente. Copiarli nello
studio preserva isolamento e libertà di modifica. Non serve duplicare i PDF
vuoti nello Storage di ogni tenant.

Ogni pacchetto comprende consenso, anamnesi, istruzioni post-trattamento e
dichiarazioni; i testi privacy sono raccordati alla versione approvata per lo
studio. Identificativo/revisione della fonte e impronta dei contenuti permettono
di ricostruire l’origine. Import ripetuto dello stesso pacchetto/versione/servizio
non crea duplicati. Un aggiornamento della libreria propone una nuova bozza e
mostra le differenze: non riscrive la copia personalizzata né lo storico firmato.

La configurazione distingue studio commerciale, titolare del trattamento dati
e operatrice che esegue la seduta. Non derivare automaticamente gli ultimi due
dal nome visualizzato nella barra laterale. Richiedere solo i dati necessari;
non aggiungere caricamenti di documenti d’identità obbligatori per default.

## Percorso adulto e minorenne

1. La professionista seleziona servizio/pacchetto e prima seduta, ritocco o
   mantenimento; verifica dati cliente, data di nascita e idoneità del percorso.
2. Per una minorenne, registra genitore/tutore, ruolo, persona rappresentata e
   verifica dell’identità e dei poteri: autrice della verifica, metodo e data.
   L’età si valuta alla data della seduta nel fuso dello studio, non solo oggi.
   Età minima, rappresentanti e firme richieste seguono requisiti verificati
   per quel contesto; non dedurre che un unico genitore sia sempre sufficiente.
3. Informativa e scelta esplicita sui dati sanitari precedono la raccolta e il
   salvataggio delle risposte sanitarie, anche se inserite dalla professionista.
   Registrare testo/versione, persona/ruolo, scelta e timestamp. Un rifiuto non
   diventa assenso e non sblocca l’anamnesi; non cancella la prenotazione ordinaria.
   La revoca blocca nuove raccolte basate su quel consenso, preservando le prove
   già acquisite secondo le basi e i tempi applicabili.
4. Compilazione delle domande e spiegazioni; eventuali risposte da approfondire
   vengono evidenziate per la valutazione dell’operatrice, senza diagnosi o
   suggerimenti automatici su farmaci. Nessuna risposta positiva preselezionata.
5. Revisione di consenso, risposte, lotti, istruzioni e scelte foto. Conferme
   distinte per trattamento e ricezione delle istruzioni; foto facoltative,
   rifiutabili senza impedire la firma al trattamento. Visibilità del volto
   ammessa solo se esplicitamente scelta; «solo dettaglio» è un limite d’uso,
   non una garanzia tecnica di anonimizzazione né una pubblicazione automatica.
6. Firma da parte dell’adulta o dei rappresentanti richiesti, con nome, ruolo e
   minore rappresentata espliciti nel documento. L’eventuale assenso della
   minore è distinto e non sostituisce le firme dei rappresentanti. Numero e
   disposizione degli atti di firma vanno concordati nella trasposizione dei PDF;
   non trasformare le diverse dichiarazioni in un’unica casella generica.
7. L’operatrice compie un proprio atto esplicito di controfirma. Su tablet,
   riaccede alla sessione professionale: non lasciare l’agenda accessibile nel
   percorso cliente. La controfirma aggiunge evidenza immutabile collegata
   all’hash già firmato; non modifica la firma della cliente/genitore. Il PDF
   finale è un nuovo artefatto immutabile, distinto da eventuali copie precedenti.

Link pubblico e nome digitato non provano identità o titolarità dei poteri.
L’emissione del link richiede il controllo professionale previsto; non inviare
a un contatto della cliente minorenne presumendo che sia quello del genitore.
Una persona non acquisisce accesso generale al dossier attraverso questo flusso.
Rappresentanza revocata/modificata, età o requisiti mancanti impediscono nuove
firme fino al riesame, senza alterare i documenti già firmati.

## Impatto tecnico proposto

Estendere il modello esistente, senza creare un secondo motore documentale:

- Definizioni dei pacchetti in file versionati; import server-side owner-only,
  idempotente e auditato, con copia in bozza per tenant e associazione per ID servizio.
- Dati professionali e anagrafici con controllo versione; legami di rappresentanza
  e verifiche circoscritti al tenant, riservati al personale autorizzato. Snapshot
  del rappresentante alla firma: un edit futuro non cambia il firmatario storico.
- Versioni cliniche estese con sezioni/dichiarazioni strutturate; le versioni
  legacy restano utilizzabili e immutabili. I nuovi campi entrano negli hash.
- Ricevute private e immutabili per informativa/consenso sanitario e atti di firma,
  con scopo, ruolo e hash/versione del testo. Negazione e mancata risposta sono
  stati distinti. Pubblicare l’informativa non prova che qualcuno l’abbia ricevuta.
- Una nuova versione dello snapshot e del renderer PDF conserva le nuove prove.
  I renderer storici e i relativi byte/path restano disponibili. Snapshot e hash
  sono costruiti sul server; il browser non sceglie titolare, testi o ruolo legale.
- Raccordare foto, revoca, esportazione W19, audit, pulizia e protezioni contro
  l’eliminazione ai nuovi riferimenti. Le nuove prove bloccano la cancellazione
  di anagrafiche utilizzate e rientrano nell’export autorizzato del dossier.
- Riutilizzare lock, revoca dopo attesa, token hash-only, consumo atomico, lease
  PDF e retry esatti già presenti. Nessuna coda offline o nuovo cron richiesto.

Nomi di nuove tabelle/colonne e granularità degli atti sono da definire con il
contratto finale; questa proposta non è una migrazione pronta da applicare.

## Ordine di realizzazione e criteri di completamento

1. **Trasposizione editoriale:** inventario pagina/sezione/campo/dichiarazione;
   confronto originale-digitale, testo condiviso e varianti per i due servizi,
   dati variabili, requisiti territoriali e regole per minori. Nessuna clausola
   omessa o trasformata in risposta automatica. Approvazione dei testi prima
   dell’attivazione su dati reali.
2. **Fondazioni e libreria:** bozze, dati studio/cliente/rappresentanza, schema
   strutturato e installazione dei due pacchetti. Import owner-only, isolamento,
   associazioni, duplicati, aggiornamenti e versioni concorrenti verificati.
3. **Raccolta e firme:** adulti e minori nello stesso incremento di rilascio;
   consenso sanitario prima dei dati, controlli operatrice, foto con ambito,
   controfirma e PDF finale. Non presentare il percorso minori come pronto
   finché i firmatari richiesti o la verifica dei poteri non sono gestiti.
4. **Collaudo e rilascio:** migrazioni forward locali, RLS/RPC, browser e PDF
   con dati sintetici; confronto di tutte le sezioni e copia consegnabile.
   Poi migrazione ufficiale e pubblicazione controllata dei modelli da parte
   della titolare, senza import o raccolta di firme reali come test.

Prove necessarie: 13/14 risposte distinte da «non compilato», spiegazioni,
rifiuto dati sanitari senza persistenza di anamnesi, foto negate senza blocco
del trattamento, ambito riconoscibilità rispettato, compleanno intorno alla
seduta, minore senza rappresentante o con poteri non verificati, tutti i
firmatari richiesti, revoca prima/durante un invio in attesa del lock, cambio
modello o anagrafica senza riscrittura dello storico, link inviato al destinatario
corretto, tablet/logout, offline senza coda, firma/controfirma concorrenti,
risposta persa, crash PDF, export completo e blocco eliminazione.

Questo lavoro rende i moduli nativi di Glow; non chiude le attività separate
W18 dispositivi fisici, W20 backup/ripristino o la verifica professionale dei
testi e dei requisiti applicabili. Non occorrono nuove credenziali per studiarlo.
