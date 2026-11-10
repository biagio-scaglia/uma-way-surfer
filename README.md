# Uma Way Surfer

Fangame non commerciale: un endless runner 3D a tre corsie, ambientato in un ippodromo, che gira nel browser.

**Gioca qui:** https://biagio-scaglia.github.io/uma-way-surfer/

Dopo la prima visita il gioco resta salvato nel browser: le volte successive parte subito, anche senza connessione. Se ti è piaciuto, lascia una stella al repository ⭐

Scegli chi corre, Tokai Teio o Meisho Doto, salta le staccionate, scivola sotto gli striscioni, evita i box di partenza e raccogli carote. Ogni 250 metri c'è un traguardo. Intanto passa la giornata: verso i 400 metri il sole tramonta in fondo alla pista, poi arrivano luna, stelle e lampioni accesi, e a 1000 metri torna l'alba.

## Comandi

| Mossa | Tastiera | Telefono |
|---|---|---|
| Cambia corsia | ← → oppure A D | scorri a sinistra o a destra |
| Salta | ↑, W oppure spazio | scorri verso l'alto |
| Scivola | ↓ oppure S | scorri verso il basso |
| Pausa | Esc oppure P | pulsante in alto a destra |

## Pensato per chi fatica a stare concentrato

Il gioco è progettato pensando a chi ha l'ADHD. Non è uno strumento terapeutico: sono scelte di design per renderlo più piacevole.

- **Poco da leggere:** la mossa giusta compare quando serve, finché non hai preso la mano.
- **Obiettivi brevi:** una barra mostra sempre quanto manca al prossimo traguardo.
- **Ricompense immediate:** suoni, scintille e coriandoli; le note salgono se prendi più carote di fila.
- **Errori che pesano poco:** hai 3 ferri di cavallo e si riparte in un attimo.
- **Sfondo quieto:** i colori forti sono riservati a ostacoli e carote.
- **Modalità calma:** meno effetti, niente scossoni o lampeggi e ritmo più lento. Si attiva da sola se il sistema chiede meno animazioni.

## Sviluppo

Serve Node.js. Il gioco va aperto tramite il server di sviluppo: un doppio clic su `index.html` non basta.

```
npm install
npm run dev
```

La cache è gestita da `public/sw.js`, attivo solo nella versione pubblicata.

`npm run build` crea la versione pubblicabile in `dist/`. Ogni push su `main` la pubblica su GitHub Pages tramite GitHub Actions, se in **Settings → Pages** la sorgente è impostata su **GitHub Actions**.

Il gioco usa Three.js, TypeScript e Vite. La logica è in `src/sim.ts`, separata dalla grafica. Le animazioni sono scritte in codice in `src/animation.ts` e funzionano con i modelli che hanno lo stesso scheletro di quelli in `models/`. I personaggi selezionabili sono elencati in `src/cast.ts`.

## Crediti

Modelli di [ansaldotoys2](https://sketchfab.com/ansaldotoys2), licenza [CC-BY 4.0](http://creativecommons.org/licenses/by/4.0/):

- ["Tokai Teio - Uma Musume"](https://sketchfab.com/3d-models/tokai-teio-uma-musume-c691aadbd14d4735810a01ac406fd940)
- ["Meisho Doto - Uma Musume"](https://sketchfab.com/3d-models/meisho-doto-uma-musume-91c12bfd72b843929dc88a3857ce3593)

In gioco materiali e geometria vengono adattati (materiali toon, rimozione della mesh duplicata) e il modello è animato via codice.

Alberi, fiori, erba, cespugli, sassi, bancarelle, vasi, orto, ceppi, tronchi e funghi vengono dal [Nature Kit](https://kenney.nl/assets/nature-kit) di [Kenney](https://kenney.nl), licenza [CC0](http://creativecommons.org/publicdomain/zero/1.0/). Sono in `models/kenney/` e in gioco vengono ricolorati con la palette della pista.

Personaggi e serie Uma Musume appartengono ai rispettivi titolari dei diritti.
