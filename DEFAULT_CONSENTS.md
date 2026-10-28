# Glow — pacchetti Microblading e Lip Blush

Implementazione del piano approvato il 28 ottobre 2026. La libreria propone
copie generiche e personalizzabili dei moduli forniti dall’utente. L’adozione e
la pubblicazione appartengono alla titolare; nessuna installazione automatica
negli studi esistenti e nessuna raccolta di firme reali come collaudo.

## Adottare e pubblicare

«Il tuo studio» → «Consensi e pigmenti» → «Usa un modello predefinito».

1. Configurare nome/ragione sociale, identificazione fiscale, titolare dati,
   indirizzo, email, telefono ed eventuale PEC. Sono distinti dal nome commerciale
   dello studio e dall’operatrice assegnata alla seduta.
2. Scegliere Microblading o Lip Blush e un servizio attivo del proprio catalogo.
3. Verificare testi, domande, istruzioni, privacy e scopi delle fotografie.
   L’informativa va completata per lo studio: quella della professionista che
   ha fornito i PDF non viene copiata automaticamente in altri account.
4. Indicare ambito territoriale e, per i minori, età minima, numero di
   rappresentanti richiesti e riferimenti/verifiche applicabili. Questi valori
   non sono inventati dal programma. La base li lascia da configurare.
5. Salvare la bozza, confermare la revisione e scegliere «Pubblica versione
   per il servizio». La pubblicazione produce insieme consenso e anamnesi.

Modificare la bozza non modifica la versione pubblicata. Ogni nuova
pubblicazione conserva la precedente. Nome, anagrafica, profilo studio o
contenuti modificati successivamente non riscrivono i documenti già firmati.
Un modello appartenente a un pacchetto si aggiorna dalla bozza del pacchetto,
così le dichiarazioni restano coerenti. Può essere disattivato dal catalogo;
nuove preparazioni non possono aggirare tale disattivazione.

L’import ripetuto della stessa base/servizio recupera il pacchetto esistente.
Una futura revisione della libreria offre un confronto con la bozza corrente e
un’azione esplicita per adottare la nuova base. Informativa e requisiti dello
studio vengono conservati, ma la revisione deve essere ripetuta. Non viene
pubblicato o sostituito automaticamente alcun testo personalizzato.

## Preparare una seduta

Dall’appuntamento → preparazione → «Usa un modulo predefinito per questa seduta».
Selezionare la pubblicazione associata al servizio, data/luogo di nascita della
cliente, prima seduta/ritocco/mantenimento e lotti. Le etichette rimangono
facoltative; un’etichetta presente deve essere pronta e verificata.

Cliente e appuntamento sono identificati all’inizio del modulo, con data, ora
e fuso dello studio. Quando si verificano risposte già raccolte, anche nella
controfirma, il riepilogo usa i valori fissati nello snapshot del documento.

Registrare la verifica dell’identità della cliente. Per una minorenne,
registrare tutti i rappresentanti richiesti, ruolo, contatto corretto e metodo
di verifica dell’identità e dei poteri. Ogni persona riceve un link individuale;
il programma non presume che il contatto della minorenne sia quello del genitore.
I rappresentanti sono fissati nel documento della seduta e non ottengono accesso
all’agenda o al dossier generale. Il numero supportato è uno o due rappresentanti.
Eventuali ulteriori requisiti devono essere verificati prima di pubblicare il
modello per quel contesto; non viene dichiarata idoneità normativa universale.

L’età si valuta alla data della seduta, nel fuso dello studio. Se la cliente è
ancora minorenne oggi ma sarà maggiorenne alla seduta, l’emissione viene rinviata
al compleanno per raccogliere personalmente i consensi da maggiorenne.

La creazione revoca i precedenti link ancora aperti della preparazione. La
sostituzione non cancella prove o documenti storici. Link di 24 ore, tablet
30 minuti, sempre entro la fine dell’appuntamento; token conservato solo come
hash. Il campo da copiare mantiene il token soltanto nella vista corrente.
Dopo una risposta persa si recupera lo stato e si rigenera il link, senza
raccogliere un secondo documento sulla stessa richiesta.

## Compilazione, scelte e firme

La pagina `/documento#token` rimuove il frammento, ignora i cookie professionali,
non persiste risposte/firme e richiede sempre Internet.

1. Informativa e consenso esplicito ai dati sanitari: scelta con testo,
   firmatario/ruolo, versione e ora server. Un rifiuto interrompe la raccolta
   sanitaria, lascia vuote le risposte e non annulla la prenotazione.
2. Se sono previsti due rappresentanti, entrambi esprimono prima la scelta
   sanitaria. Il primo compila il questionario; tutti verificano le medesime
   risposte fissate nello snapshot. Le altre persone attendono e possono
   aggiornare esplicitamente lo stato.
3. Domande Sì/No senza risposta preselezionata e campo spiegazioni. «Sì»
   richiede una spiegazione e l’attenzione della professionista; non produce
   diagnosi, suggerimenti su farmaci o decisioni automatiche d’idoneità.
4. Revisione di testi, risposte, istruzioni e lotti; anteprima delle etichette
   presenti limitata a quelle di quello snapshot. Ogni immagine passa dal server,
   con hash e nuova autorizzazione prima della risposta, senza URL Storage pubblico.
5. Conferme distinte per trattamento, ricezione delle istruzioni e identità/ruolo.
   Le scelte foto sono facoltative: dossier e uso dimostrativo sono separati;
   l’uso dimostrativo richiede anche il dossier e la scelta dettaglio/riconoscibile.
6. La firma disegnata della persona vincola snapshot e scelte. La scelta sanitaria
   iniziale ha una propria ricevuta precedente alle risposte ed è inclusa nelle
   prove finali. I diversi intenti non sono ridotti a un unico booleano.
7. Tutte le firme previste devono essere ricevute prima della controfirma della
   professionista assegnata all’appuntamento. Quest’ultima rilegge le risposte,
   conferma le verifiche e firma con la propria sessione. Un’altra professionista
   non può controfirmare al suo posto, anche se ha accesso clinico al dossier.

Con due rappresentanti prevale l’autorizzazione foto più restrittiva: il rifiuto
di uno impedisce lo scopo; «solo dettaglio» prevale sull’immagine riconoscibile.
La galleria mostra il limite autorizzato. L’app non pubblica foto sui social e
«dettaglio» non è una promessa tecnica di anonimizzazione. Le revoche foto
continuano a seguire il flusso esistente; non richiamano copie già diffuse.

Il tablet disconnette lo studio prima di mostrare il documento. Per persone
successive si riaccede e si usa «Disconnetti e passa tablet» sul rappresentante
interessato; non occorre revocare le firme già ricevute o avviare un altro modulo.
Controfirma e ritorno all’agenda richiedono nuovamente l’accesso professionale.

In caso di risposta persa a una firma/controfirma, le modifiche vengono bloccate
finché si ritenta esattamente lo stesso invio. Nessuna coda o trasmissione alla
riconnessione. Una validazione definitivamente respinta consente la correzione.
La revoca del modulo impedisce ulteriori accessi/compilazioni; le ricevute già
acquisite restano come prove, distinte dalle procedure privacy di cancellazione.

## PDF e continuità del dossier

Il documento finale viene creato solo quando tutte le firme sono presenti e
l’operatrice ha controfirmato. Il PDF `glow-pdf-v3` riporta dati professionali,
cliente e tipo di seduta, testi, risposte, lotti/etichette, istruzioni,
informativa, ricevute sanitarie, scelte individuali e tutte le firme/ruoli/date.
Sono firme disegnate; non viene dichiarata una firma digitale qualificata.

Il motore, bucket privato, coda, lease, checksum e recupero automatico sono gli
stessi delle versioni precedenti. Nessun nuovo cron o provider. Prima della
controfirma, le prove parziali sono già persistite; un problema PDF non richiede
una nuova firma. I renderer v1/v2 e i relativi percorsi/byte rimangono disponibili.

Export W19 include anche pacchetti incompleti, rifiutati e revocati, con
rappresentanza e ricevute ma senza hash dei token. Le nuove FK e la policy
proteggono clienti/servizi con prove collegate dall’eliminazione ordinaria.
Risposte, firme e contatti non vengono copiati nei log tecnici. I contatori
antiabuso riusano finestre di un’ora; la vista delle raccolte usa aggiornamento
esplicito, senza nuovo polling auditato continuo.

## Tracciamento dei documenti sorgente

Originali forniti dall’utente: quattro pagine ciascuno, testo aggiornato al
09/08/2026. Impronte SHA-256 degli originali, senza distribuirli come allegati
pubblici dell’applicazione:

- Microblading: `f5224583d1716ff4c9d7fdc907d5674090c968fc2a69f983a6095e04da9d3e01`.
- Lip Blush: `88cecaf2c74f5cce206d09240a26e1e430f662d28108b3b5b245a4a155580dbb`.

| Fonte | Trasposizione |
| --- | --- |
| Pagina 1: intestazione e cliente | Profilo professionale dello studio e dati della seduta verificati |
| Pagina 1: descrizione/rischi e specificità | Testi separati Microblading/Lip Blush, modificabili in bozza |
| Pagina 2: pre-trattamento | 13/14 righe Sì/No, spiegazioni e dichiarazione di correttezza; la doppia domanda sul PMU resta una riga |
| Pagina 2: consenso | Dichiarazione e conferma del trattamento, firma e controfirma dell’operatrice |
| Pagina 3: guarigione e ricezione | Istruzioni specifiche complete e conferma distinta incluse nelle prove |
| Pagina 4: privacy | Informativa da completare per lo studio, ricevuta sanitaria prima delle risposte |
| Pagina 4: foto | Scopi facoltativi distinti, dettaglio/riconoscibile e revoca futura |
| Pagina 4: minori | Identità/ruolo/poteri e firme dei rappresentanti richiesti dal modello verificato |

Dati e contatti della professionista sorgente non sono valori predefiniti per
altri studi. La fonte cita DGR Veneto n. 11/2013 e conservazione di almeno cinque
anni: sono riferimenti da verificare e adattare, non impostazioni nazionali
imposte all’app. Pubblicare un pacchetto non cambia le regole W19 o l’informativa
pubblica dello studio. Le dichiarazioni su pratiche igieniche, materiali e
pigmenti vanno revisionate dalla professionista prima dell’uso reale.

## Implementazione e verifiche

Migrazione forward 029: profilo, bozze/pubblicazioni, raccolte, firmatari e
controfirme in schema privato con RLS e nessun grant diretto. Le operazioni
ordinarie usano la sessione; soltanto il gateway con capability usa il service
role. Non sono alterate migrazioni ufficiali precedenti.

683 pgTAP in 16 file; 56 unit, incluso determinismo del PDF v3 con due
rappresentanti. Quattordici E2E specifici con Auth, DB, Storage, PDF e race reali,
oltre alle regressioni clinica/documenti/privacy/eliminazioni già passate.
Evidenze di questo incremento in DEVELOPMENT_CHECKPOINT.md.

I test e le catture usano soltanto persone e documenti sintetici nello stack
locale. Non sono una verifica fisica su dispositivi né una revisione normativa
per uno specifico studio. Restano separati i gate W18 dispositivi, W20 restore
e i testi/requisiti da approvare prima del pilota con dati reali.
