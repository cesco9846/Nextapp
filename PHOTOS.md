# Glow — foto del trattamento (W14)

Da scheda cliente → **Foto prima e dopo**, oppure dalla preparazione → **Foto e
autorizzazioni della seduta**. La galleria è distinta per appuntamento, con categorie
Prima, Dopo e Guarito, pagine da 12 immagini e confronto Prima/Dopo o Prima/Guarito.
Le ultime 200 sedute sono disponibili nel selettore; il limite è dichiarato.
Non sono previste pubblicazione o esportazione dimostrativa automatica.

## Scelte firmate e revoca

Il documento di firma propone due scelte **facoltative e non preselezionate**:
documentazione riservata nel dossier e uso dimostrativo. Si può firmare il consenso
al trattamento senza autorizzare foto. L’uso dimostrativo richiede anche la
documentazione. Il testo `glow-photo-v1` è fissato nello snapshot all’emissione;
le due scelte sono incluse nel payload immutabile, nel suo hash e nel PDF v2.
Sono testi di prodotto da sottoporre alla revisione privacy prevista in W19,
prima di raccogliere dati reali; non sostituiscono quella revisione.

`photo_permissions` conserva grant e rifiuti distinti per cliente, seduta e scopo,
con riferimento al documento firmato. Non deriva permessi dal consenso medico.
Le scelte esplicite di una nuova firma sostituiscono le precedenti per quella
seduta, senza modificare l’evidenza storica. Le vecchie richieste senza policy
e gli invii compatibili senza scelte non creano né sostituiscono permessi.

La professionista autorizzata può registrare la revoca con conferma e versione.
Revocare documentazione blocca nuovi inserimenti, anche se l’upload era iniziato;
sospende inoltre l’efficacia dimostrativa. Le immagini già raccolte restano
riservate nel dossier: revoca, archiviazione e cancellazione sono operazioni diverse.
Una revoca non richiama copie già diffuse. La conservazione/cancellazione è W19.
Non esiste un interruttore della professionista per concedere nuovamente il permesso.

In questo incremento le scelte sono distinte ma raccolte nello stesso incontro
di firma del trattamento: per cambiarle occorre una nuova revisione preparatoria
e una nuova firma, entro la validità dell’appuntamento. Una raccolta autonoma di
nuove autorizzazioni dopo la chiusura della seduta non è implementata. I permessi
già validamente raccolti consentono foto dopo/guarito anche a seduta completata.

## Acquisizione e recupero

Selezione file e input fotocamera posteriore. JPEG/PNG/WebP, originale fino a
40 MB/48 MP; HEIC/HEIF viene rifiutato con istruzioni per ottenere JPEG, senza
promettere una conversione non verificata. Browser: orientamento EXIF, lato lungo
massimo 2400 px, JPEG qualità 85, anteprima e dimensioni prima di **Salva foto**.
Il canvas non riporta EXIF/GPS. Il server verifica nuovamente byte, hash, tipo,
limiti e orientamento e normalizza con Sharp tramite il ciclo W10.

`prepare_photo` vincola idempotenza a cliente/appuntamento/categoria e file.
La finalizzazione verifica nuovamente la scelta firmata sotto lock tenant;
soltanto un file pronto può entrare nella galleria. Permessi clinici e revoche
condividono l’ordine di lock del team. Un tentativo esatto rimane in memoria:
risposta persa → retry della stessa finalizzazione, senza nuovo upload o doppia foto.
Niente coda offline, IndexedDB o invio automatico alla riconnessione.

La base generica W10 resta disponibile per allegati privati: un suo file non è
una foto di galleria e non può esservi promosso senza il controllo dedicato.
Un file completato mentre il permesso viene revocato può restare nell’archivio
privato senza entrare in galleria. La riconciliazione di questi allegati pronti,
come cancellazione e retention, va completata in W19; la pulizia W10 dei pending
non elimina arbitrariamente un file pronto.

## Lettura e archiviazione

Metadati RLS, proprietaria nel proprio studio, operatrice clinica assegnata.
`POST /api/photos/:id/read` autorizza e audita, legge server-side i byte e ne
verifica SHA-256/dimensione, quindi ricontrolla i permessi dopo il download.
La risposta binaria è no-store/no-referrer/nosniff: nessuna URL Storage viene
consegnata alla galleria. Il browser apre solo immagini richieste esplicitamente;
blob URL revocata dopo 60 secondi, tab nascosta, chiusura o smontaggio della vista.
Non è possibile richiamare byte già ricevuti da un dispositivo autorizzato.

Il confronto usa pulsanti accessibili anche da tastiera, senza trascinamento
obbligatorio. Due immagini della medesima seduta; luce e inquadratura possono
influenzare il confronto. L’archiviazione esplicita rimuove la foto dalla galleria
e dal relativo endpoint; conserva il file privato e non riscrive il documento.

## Compatibilità PDF

Renderer `glow-pdf-v1` conservato per i documenti esistenti; `glow-pdf-v2` per
firme con scelte esplicite. Path immutabile contiene il renderer, job/lease/retry
lo rispettano. La sezione foto è prima del blocco conferma/firma, mantenuto unito.
La determinazione dei byte e il recupero dopo upload restano verificati per v1 e v2.

## Verifica e limiti del collaudo

Test SQL: nessun grant implicito/forgiabile, dipendenze e tipi, idempotenza,
verifica del file, isolamento/assegnazione, revoca in upload, archivio e audit.
Browser Chromium: firma con scelte separate, JPEG con EXIF orientamento 6,
compressione 1600×2400 e rimozione EXIF, risposta persa e retry senza duplicati,
HEIC, offline senza coda, confronto e revoca clinica in concorrenza con la lettura.
Fixture solo sintetiche e locali; nessuna foto cliente o firma di prova nel DB ufficiale.

Il collaudo con fotocamera e foto reali di prova su iPhone/Android resta un gate
prima del pilota, insieme a qualità/compressione, installazione PWA e testi privacy.
Le catture si riproducono con `scripts/capture-photos-ui.ts` sul solo Supabase locale.
