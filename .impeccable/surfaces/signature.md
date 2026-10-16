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
