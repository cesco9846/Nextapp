# Glow — punto di ripresa dello sviluppo

Aggiornato il 15 ottobre 2026: **compilazione cliente e passaggio tablet implementati e verificati**.
Resend è confermato; configurazione email rinviata come richiesto.
Il primo checkpoint resta nel tag `checkpoint-2026-10-15`; questo incremento
è conservato in `checkpoint-intake-2026-10-15` e su `main`. Il precedente
checkpoint clinico resta in `checkpoint-clinical-2026-10-15`. Non è ancora il pilota R1.

## Scelte confermate

Nome Glow; Next.js/React/TypeScript; shadcn/ui originale; FullCalendar 7.1.2
Monarch; Supabase ufficiale `mexokvvvxdyekauupwvt`. PWA installabile con
**connessione necessaria**, senza agenda offline, snapshot persistenti o coda di
scritture. WhatsApp manuale con chat/testo pronti, senza consegna dichiarata.
Skill frontend-design, impeccable e copywriting conservate in `.agents/skills`.

## Funzioni implementate

Auth SSR, registrazione/conferma/recupero, onboarding studio; clienti con ricerca,
modifica e archivio; sedi/servizi; agenda giorno/settimana/mese/lista, stati,
conflitti, versioni e idempotenza; WhatsApp; report sedute completate per titolare.

Team: inviti manuali tramite link di 72 ore, email verificata, revoca inviti,
sospensione/riattivazione, assegnazioni cliente. Un account per studio, nessuna
promozione autonoma o sospensione della titolare. Per accesso clinico delle
operatrici servono abilitazione e assegnazione attive; la riattivazione non
ripristina assegnazioni revocate. UI senza duplicazione del titolo nell’invito,
navigazione Team corretta; cinque catture confermate, verdetto `ship` e
confronto documenter senza modifica del sistema visivo.

W10: API file immagine con bucket privato, upload temporaneo, controllo
hash/dimensione/formato, limite 20 MP, ricodifica senza EXIF/GPS, oggetto finale
immutabile, lettura auditata con URL di 30 secondi, job di pulizia con lease e
retry. La creazione di token di upload firmato è vietata: sopravviverebbero alle
verifiche successive di revoca/pulizia. Contratti completi in [STORAGE.md](STORAGE.md).
**La schermata foto, le categorie e i consensi d’uso non sono ancora implementati.**

Nuovo W11: Il tuo studio → Consensi e pigmenti. La titolare pubblica versioni
immutabili di testi/questionari, registra pigmenti e lotti con scadenze ed
etichette private. Le operatrici cliniche consultano il catalogo. Dall’agenda si
apre la preparazione del trattamento, con le versioni dei modelli, risposte
anamnestiche e fino a 12 lotti. Lotti scaduti oggi o al giorno dell’appuntamento
sono respinti. Versioni e informazioni già scelte non vengono riscritte dalle
modifiche del catalogo. Richieste concorrenti usano versioni e idempotenza.

Le risposte rimangono nello schema privato, senza SELECT client; ogni lettura
registra prima un audit, anche se eseguita direttamente tramite RPC. Accessi
clinici e revoche condividono il lock tenant e ricontrollano i permessi dopo
l’attesa. Nel browser le risposte restano solo nello stato del form, senza cache
persistente o invio alla riconnessione. Lo stato è sempre bozza: firma e PDF restano W13. La compilazione della cliente è ora implementata in W12.

Nuovo W12: dalla preparazione salvata si genera un link personale valido 24 ore
oppure si passa il tablet per 30 minuti, sempre entro la fine dell’appuntamento.
La cliente vede testi/domande fissati e contesto minimo, mai risposte precedenti,
altre clienti o file. Token casuale da 256 bit, hash-only privato; il frammento
viene eliminato dalla barra e mantenuto in memoria. GET/HEAD non consumano.
Un POST esplicito salva risposte, ricevuta, audit e consumo atomicamente. Retry
identico → stessa ricevuta; altri usi dopo consumo/scadenza/revoca → 410.
Nuova preparazione o revisione appuntamento invalidano il link. Anche la revoca
dell’accesso dell’autrice lo rende inutilizzabile, dopo controllo sotto lock.

Il tablet disconnette la sessione professionale locale prima di aprire il form.
Cronologia e URL protetti richiedono un nuovo accesso; risposta di avvio ambigua
porta all’accesso svuotando la memoria professionale. Nessun PIN sostituisce
l’autorizzazione server. Non è un kiosk del sistema operativo. Il modulo resta
una compilazione non firmata; contratti completi in [INTAKE.md](INTAKE.md).

Email: **Resend scelto**, dominio acquistato dall’utente. DNS, caselle e
integrazione saranno configurati più avanti. Il modello mittente Glow/Reply-To
studio resta la proposta descritta in [EMAIL_DELIVERY.md](EMAIL_DELIVERY.md);
nessun DNS/account modificato e nessun invio reale attivato. Non chiedere ora
credenziali Resend o il dominio: non servono a completare i moduli clinici.

## Database ufficiale e runtime

Tutte e dodici le migrazioni `202610150001`–`202610150012` sono applicate e
ri-verificate con checksum; diciotto tabelle pubbliche con RLS; risposte anamnestiche private. Bucket
`glow-private` privato; inventario ufficiale senza clienti, appuntamenti, file o
oggetti di prova. Nessuna suite sintetica è stata eseguita sul progetto remoto.

Auth autorizza callback di sviluppo, recupero password e
`/auth/conferma?next=/invito`; conferma email obbligatoria, password minima dieci
caratteri. SMTP personalizzato e dominio definitivo ancora da configurare.
Server dell’ambiente ricompilato con configurazione ufficiale e avviato; health,
login, invito, manifest Glow e risposte 401 senza sessione verificate.
I processi non sopravvivono necessariamente al ripristino dell’ambiente.

## Verifiche dell’incremento

- Lint, controllo TypeScript e build di produzione superati; 10 test unitari.
- 225 asserzioni pgTAP su cinque file. W12 ne aggiunge 49: RLS/grant, token e
  scopo, DTO minimo, risposte, consumo, ricevuta e rollback se l’audit fallisce.
  Tentativi respinti conteggiati; limiti per token/globali e pulizia verificati.
- 31 scenari Chromium su build di produzione e Supabase locale reale.
  Sette nuovi casi: percorso professionista/cliente, testi fissati, invii
  concorrenti/retry, scadenza/revoca/versioni, revoca durante invio pubblico
  bloccato, tablet con nuovo accesso/cronologia, rete assente/esito perso e
  risposta incompleta di avvio dopo logout. Nessun POST accodato alla riconnessione.
- Reset locale da zero con dodici migrazioni e riapplicazione idempotente superati.
- Migrazioni/checksum e inventario ufficiale verificati senza fixture remote.
- Otto catture iniziali, nove di conferma a 375/820/1280; un solo batch per avviso prima della
  sostituzione di link e recupero tablet ambiguo. Reviewer `ship` sui due rilievi;
  documenter senza modifiche al sistema. Evidenze in
  `.impeccable/surfaces/intake.md`. Nessun nuovo asset, tre raster con provenienza.

Usare `node --use-env-proxy --import tsx ...`: il launcher CLI TSX non mantiene
il flag proxy nel processo figlio. Entrambi i binding server esistenti funzionano.

GitHub Actions va verificato sul commit corrente dopo ogni push. Il precedente
`ee8f74b` ha completato con successo i run 38793387403 e 38793387643. Non confondere
le verifiche browser con consegna SMTP, installazione fisica PWA o backup/restore.

## Prossime attività, nell’ordine

1. W13: firma della cliente, snapshot immutabile e job PDF recuperabile senza
   rifirma. Prima definire contratto di acquisizione firma e renderer compatibile
   con il worker; non riusare gli upload fotografici come documenti firmati.
   Il PDF deve conservare versione letta, risposte, firma e informazioni dei lotti.
2. W14: fotocamera/compressione, prima/dopo/guarito e consensi d’uso; prove fisiche,
   HEIC e qualità da verificare prima di raccogliere immagini reali.
3. W15–W17: worker, Resend e reminder, conferma/disdetta. Adapter simulato in W15;
   DNS/mittenti/caselle e credenziali in W16, separati da Supabase Auth SMTP.
4. Configurare scheduler file sull’hosting scelto, allarme sui ritardi e limiti
   HTTP degli endpoint pubblici. Job attualmente manuale, nessun cron remoto.

Restano W04 su dominio/SMTP reale, collaudi UI estesi di archivio/omonime e
agenda drag/resize/stati, installazione PWA HTTPS su iOS/Android, export/retention,
staging, backup/ripristino, ICS, push e funzioni commerciali. Dipendenze e criteri
sono in [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md).
Nessun dato clinico reale prima dei relativi flussi, permessi e conservazione.

## Comandi di ripresa

Usare il checkout esistente; non creare un worktree senza richiesta. Node 24,
npm, Python 3; Docker per l’integrazione locale. Nel cloud impostare
`npm_config_cache=/workspace/.cache/npm`,
`PLAYWRIGHT_BROWSERS_PATH=/workspace/.cache/ms-playwright`,
`IMPECCABLE_HOME=/workspace/.cache/impeccable`. Mantenere proxy e CA ereditati.

```sh
npm ci
python3 scripts/configure-public-env.py
npm run db:start
npm run db:migrate:local
npm run test:db
npm run test:e2e
npm run lint
npm run typecheck
npm run test:unit
npm run build
npm run start
```

Il configuratore preserva `.env.local` e recupera solo configurazione pubblica.
I test rifiutano Supabase non loopback. `npm run db:reset` distrugge soltanto le
fixture locali: non eseguire reset/seed sul progetto ufficiale. Mai modificare
migrazioni applicate; usare nuovi file e il runner unico:

```sh
python3 scripts/migrate.py --project-ref mexokvvvxdyekauupwvt
python3 scripts/migrate.py --project-ref mexokvvvxdyekauupwvt --apply
node --use-env-proxy --import tsx scripts/cleanup-files.ts --local
node --use-env-proxy --import tsx scripts/cleanup-files.ts --project-ref mexokvvvxdyekauupwvt
```

GitHub conserva codice, migrazioni, test, lockfile, skill, specifiche e checkpoint.
Credenziali, `.env.local`, database locale, build, dipendenze, log e screenshot
restano esclusi. Le credenziali vanno fornite tramite i binding sicuri dell’ambiente.
La pubblicazione del codice non distribuisce l’app su un dominio: hosting e
SMTP rimangono attività distinte. Non dichiarare completati R1 o il prodotto.
