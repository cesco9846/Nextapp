# Firma e documenti — W13

Mode: Operate. Extension of the existing clinical preparation and isolated client
form. User asks to continue the implementation plan; signature/snapshot/PDF are
the next committed increment. No new visual world, concept roll or assets.

## Direction contract

THESIS: leggere gli stessi contenuti che verranno conservati, firmare una volta,
distinguere la firma ricevuta dal PDF ancora in preparazione.
OWN-WORLD: cool Glow ground #f5f7f8, white document, jade actions #28664f,
Bricolage headings, Instrument Sans body, original shadcn controls.
STORY: la professionista salva testi/risposte/lotti; la cliente controlla il
documento, firma e conferma; lo studio scarica il PDF o ne riprova la generazione.
FIRST VIEWPORT: existing compact brand/header and one reading column, named
client, appointment, consent text; answers and historical labels below. Signature
space follows the reviewed content; the single final action names signing.
FORM: inherit the established form, separators and full-width phone controls.
Signature pad accepts pointer and keyboard; clearing is explicit. Ambiguous sends
keep the exact attempt in memory. Tablet signs out the professional account.
No persistent browser clinical data, celebratory graphics or qualified-signature claim.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Evidenza del 16 ottobre 2026

Quattordici catture locali sintetiche a 375/820/1280 px, comprese schermate di
lettura/firma/tablet, pannello professionale, errore e recupero PDF. Due immagini
sono rasterizzazioni Poppler del PDF realmente scaricato. Le catture di componente
su telefono escludono la navigazione fissa tramite un viewport di staging più alto;
non alterano CSS o comportamento della pagina. Tutti i file validati prima del review.

Detector eseguito una volta: nessun finding. Reviewer `fix` soltanto sulla
continuità PDF: nome/data/dichiarazione erano sulla pagina precedente alla firma.
Un batch ha riservato lo spazio dell’intero blocco prima del titolo. Nuove catture
sugli stessi quattordici path; verdetto `ship` sul rilievo valutato, nessuna regressione.
Unit test Poppler controlla anche che titolo, nome/data e firma restino nella stessa pagina.

Documenter: confronto PRODUCT/DESIGN/sidecar, globals, componenti W13 e primitive
shadcn. Nessun cambiamento al sistema. Noto Sans appartiene al renderer PDF;
Bricolage/Instrument Sans restano i font dell’app. Varianti compatte preesistenti
non canonizzate come default touch. Nessun nuovo raster pubblico: firma e label
sono dati utente sintetici nelle prove, non asset decorativi.

## Estensione del 19 ottobre 2026 — lotto senza foto

Richiesta utente: la foto dell’etichetta del lotto è facoltativa. Ordinary
extension in modalità Operate, limitata nel client di firma al ramo senza foto:
«Foto dell’etichetta non allegata.» compare dopo i dati del lotto, senza pulsante
di apertura. Font Bricolage/Instrument Sans, palette Glow, colonna di lettura e
componenti originali shadcn restano quelli del contratto incumbent.

Evidenze finali sintetiche locali, rigenerate e validate:
[firma 375](../review/optional-lot/signature-375.png),
[820](../review/optional-lot/signature-820.png) e
[1280](../review/optional-lot/signature-1280.png).
Completano le sette catture finali nuovo lotto 375/820/1280 e preparazione 375,
elencate nel contratto clinical.md. Il finish reviewer
`optional_lot_finish_reviewer` ha dato disposizione `ship` sullo stato finale in
tutte e cinque le sezioni, senza correzioni materiali richieste. Detector una
sola volta, zero finding (`.cache/logs/optional-lot-detect.json`: `[]`).

Il percorso E2E verifica creazione, modifica, selezione, firma e PDF privato di un
lotto senza foto: 15 E2E clinici/documenti/nuovo lotto superati, più nove test
nuovo lotto/runner/worker. Lo snapshot conserva ID/hash null espliciti e non
cambia se una foto viene aggiunta al catalogo in seguito. Il PDF raggiunge lo
stato pronto e riporta l’assenza della foto; le vecchie immagini conservano la
validazione. Nessun nuovo raster pubblico o asset decorativo.

Documenter: confronto PRODUCT.md, DESIGN.md, sidecar, globals, componenti
modificati e primitive shadcn conferma l’estensione del sistema esistente;
nessuna modifica a DESIGN.md o design.json. Deriva preesistente del focus negli
snippet sidecar e label mobili da 11 px non riparata né canonizzata, fuori dal
perimetro richiesto.

## Estensione del 28 ottobre 2026 — firme e controfirma dei pacchetti

Ordinary extension in modalità Operate: tutti i firmatari richiesti rileggono
le stesse risposte e i contenuti dello snapshot, poi confermano trattamento,
istruzioni e identità/ruolo. Foto dossier e dimostrative rimangono facoltative
e distinte, con ambito dettaglio/riconoscibile. Le etichette presenti appartengono
allo snapshot; l’assenza resta esplicita. Dopo tutte le firme, la professionista
assegnata verifica e controfirma prima del PDF finale. Stato della raccolta,
firma ricevuta e disponibilità del PDF restano distinti; una difficoltà PDF non
richiede di firmare nuovamente.

La correzione valutata mostra anno, ora e fuso nell’intestazione; nella verifica
raccolta/controfirma cliente, servizio e appuntamento provengono prima dallo
snapshot. Conferme e pad mantengono composizione e controlli incumbent, con
recupero dello stesso invio in memoria e nessun dato clinico persistito nel
browser. Le catture sign/counter e i rispettivi crop di conferma a 375/820/1280
px fanno parte dell’inventario finale di 27 immagini in clinical.md. Il reviewer
fresco equivalente di sostituzione `packages_verdict_reviewer` ha dichiarato
`RESOLVED` l’unico rilievo temporale e `ship` limitato alla correzione valutata.

Documenter fresco equivalente: confronto packet-preparation/client-packet,
packet-document/packet-label, globals e primitive con PRODUCT.md, DESIGN.md e
sidecar; campione diretto counter-confirmation-820. Palette, font, bordi, scala
dei controlli e regole Two Voices/Quiet Surface confermati; nessuna modifica ai
file di sistema. Detector e verifiche comuni registrati in clinical.md, senza
nuovo ciclo. Drift incumbent non riparato né canonizzato; nessun raster pubblico,
promessa di pubblicazione o nuova dichiarazione di validità legale/dispositivo.

## Estensione del 29 ottobre 2026 — osservazione dei documenti

Ordinary extension Operate del pannello professionale: caricamento iniziale,
documenti in preparazione o link di firma correnti ancora utilizzabili
mantengono una lettura ogni 10 secondi. In assenza di questi stati, un PDF
fallito viene ricontrollato ogni 60 secondi per osservare il recupero previsto;
senza documenti in attesa, fallimenti o link aperti il polling si arresta.
Focus e riconnessione richiedono comunque lo stato corrente. Firma ricevuta,
preparazione e disponibilità del PDF rimangono distinti, senza richiedere una
nuova firma per una difficoltà PDF.

Confrontati `src/features/consents/consent-panel.tsx` e
`src/lib/document-polling.ts` con PRODUCT, DESIGN, sidecar, globals e primitive:
palette, Two Voices, Quiet Surface e controlli originali shadcn confermati;
nessun nuovo token, componente o asset pubblico. Sistema e seed preservati.
Evidenze comuni della stabilizzazione e disposizione `ship` registrate in
app.md; questo passaggio non aggiunge nuove catture della firma o del PDF.
Documenter fresco equivalente in sostituzione del harness specializzato non
disponibile; drift preesistente non riparato né canonizzato.
