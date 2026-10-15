# Glow

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Next.js, React, TypeScript, shadcn/ui, Supabase. FullCalendar React con tema Monarch.
Scelte confermate dall'utente; dettagli in SPEC.md e ARCHITECTURE.md.

## Users

Liberi professionisti che gestiscono appuntamenti, clienti e documentazione da
telefono, tablet e PC. Il piano tecnico propone la dermopigmentazione come primo
contesto, con professioniste che lavorano in più sedi; non è una limitazione
confermata a una sola categoria di professionisti.

## Product Purpose

Tenere insieme agenda, contatti, promemoria, consensi, anamnesi, foto e pigmenti
utilizzati nei trattamenti. Il risultato è una seduta organizzata con documenti
reperibili e dati visibili soltanto alle persone autorizzate.

## Operating Context

Uso quotidiano tra appuntamenti, spesso da telefono o tablet. Le sedi sono luoghi
distinti all'interno dello stesso account professionale. La cliente può compilare
e firmare documenti tramite link limitati; l'agenda resta della professionista.

## Capabilities and Constraints

PWA installabile con connessione necessaria (decisione utente del 15 ottobre 2026), clienti, appuntamenti, email automatiche e WhatsApp manuale con testo pronto;
consensi versionati, foto prima/dopo e lotti pigmenti. Supabase ufficiale:
mexokvvvxdyekauupwvt. Non riutilizzare dati o codice del vecchio progetto.
Ogni funzione deve mostrare il proprio stato reale: nessun invio finto, dato demo
presentato come reale o firma persa per un errore di generazione PDF.
Il piano incrementale e gli elementi ancora aperti sono in IMPLEMENTATION_PLAN.md.

## Brand Commitments

Calendario FullCalendar con tema Monarch e componenti shadcn/ui. Nome confermato
dall’utente: Glow. I documenti di origine usavano GlowTrace; repository Nextapp. Lingua italiana e testi
operativi chiari; nessun prezzo o risultato commerciale da inventare.

## Evidence on Hand

Piano tecnico e strategia marketing forniti dall'utente, riassunti e tracciati in
SPEC.md, DATA_MODEL.md e DECISIONS.md. Nessuna testimonianza o metrica commerciale
approvata per la pubblicazione.

## Product Principles

- Un'azione ha un risultato verificabile e un recupero possibile in caso di errore.
- L'agenda resta leggibile mentre si lavora da qualsiasi dispositivo.
- La documentazione segue la cliente e la seduta senza cambiare lo storico firmato.
- Permessi e isolamento dei dati fanno parte del modello, non solo dell'interfaccia.

## Accessibility & Inclusion

Flussi operabili da tastiera e touch, etichette e focus visibili, controlli di
almeno 44 px; obiettivo WCAG 2.2 AA. Nessuna azione richiede esclusivamente drag.
