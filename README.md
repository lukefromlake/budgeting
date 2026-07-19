# Bremen Budget

Bremen Budget è una Progressive Web App per la gestione personale di entrate, spese, investimenti, trasferimenti, budget e patrimonio. È progettata mobile-first per un periodo di internship, non richiede account o backend e conserva i dati esclusivamente nel browser tramite IndexedDB.

## Funzionalità

- Dashboard mensile con saldo disponibile, entrate, spese, investimenti, risparmio, budget, categorie e andamento a sei mesi.
- Movimenti con creazione, modifica, duplicazione, eliminazione, ricerca, filtri e totali filtrati.
- Importi salvati come centesimi interi e visualizzati con formattazione italiana.
- Trasferimenti tra conti esclusi dai totali di entrate, spese e budget.
- Budget generale e per categoria, con soglie testuali e visive; copia dal mese precedente.
- Gestione modificabile di categorie, conti e metodi di pagamento.
- Movimenti ricorrenti con proposta da confermare e controllo dei duplicati mensili.
- Snapshot manuali del patrimonio, grafico storico e analisi degli investimenti.
- Backup completo JSON, ripristino in modalità unione o sostituzione, esportazione CSV UTF-8 per Excel.
- Tema chiaro, scuro o di sistema.
- PWA installabile, cache offline e notifica di aggiornamento.
- Nessun analytics, tracking o invio di dati a servizi esterni.

## Struttura

```text
/
├── index.html
├── style.css
├── manifest.json
├── service-worker.js
├── icons/
│   ├── icon.svg
│   ├── icon-192.png
│   └── icon-512.png
├── js/
│   ├── app.js
│   ├── db.js
│   ├── constants.js
│   ├── utils.js
│   ├── ui.js
│   ├── dashboard.js
│   ├── transactions.js
│   ├── budgets.js
│   ├── net-worth.js
│   ├── settings.js
│   ├── charts.js
│   └── export-import.js
└── tests/
    ├── unit.mjs
    └── smoke.mjs
```

La cartella `tests` contiene controlli di calcolo e un flusso end-to-end mobile. I test sono strumenti di sviluppo opzionali e non vengono caricati dall’app pubblicata.

## Avvio locale

Il progetto non richiede una fase di build. Dalla cartella principale avviare un server HTTP:

```bash
python -m http.server 8000
```

oppure:

```bash
npx serve .
```

Aprire `http://localhost:8000`. Non aprire direttamente `index.html` con `file://`: i moduli ES e il service worker richiedono un server HTTP. I service worker funzionano su `localhost` oppure, in produzione, tramite HTTPS.

## Pubblicazione

Essendo un sito statico, l’intera cartella può essere pubblicata senza modifiche su GitHub Pages, Cloudflare Pages, Netlify o Vercel. Impostare la directory del progetto come directory pubblica e non configurare alcun comando di build. Se l’app viene pubblicata in una sottocartella, i percorsi relativi già presenti permettono al manifest e al service worker di restare nello stesso scope.

Per GitHub Pages:

1. caricare i file in un repository;
2. aprire **Settings → Pages**;
3. scegliere **Deploy from a branch** e la cartella root;
4. attendere l’URL HTTPS generato da GitHub.

## Installazione su iPhone

1. Aprire l’URL HTTPS in Safari.
2. Toccare **Condividi**.
3. Selezionare **Aggiungi alla schermata Home**.
4. Confermare il nome e toccare **Aggiungi**.

Dopo il primo caricamento online, l’interfaccia è disponibile offline. I dati IndexedDB appartengono al sito installato e al dispositivo: cancellare i dati di Safari o rimuovere l’archiviazione del sito può eliminarli.

## Backup e ripristino

In **Impostazioni → Backup ed esportazione**:

- **Esporta backup JSON** scarica tutte le collezioni, la versione dello schema e la data di esportazione.
- **Importa backup JSON** valida il file e mostra il numero di elementi prima di scegliere se unire o sostituire i dati.
- **Esporta movimenti CSV** crea un file UTF-8 con BOM, separatore `;`, valori tra virgolette e importi con virgola decimale, adatto a Excel in lingua italiana.

Conservare i backup in un luogo sicuro. L’app non può recuperarli da un server perché non invia alcun dato fuori dal dispositivo.

## Limiti della versione attuale

- Nessuna sincronizzazione tra dispositivi o autenticazione.
- Nessun collegamento a banche o quotazioni di mercato.
- Il valore corrente degli investimenti viene inserito tramite snapshot manuale.
- Le ricorrenze vengono proposte solo quando si apre l’app e richiedono conferma.
- La valuta e la lingua sono predisposte nelle impostazioni, ma questa versione espone solo EUR e italiano.

## Sviluppi futuri

- Crittografia opzionale dei backup.
- Più valute e lingue.
- Frequenze ricorrenti personalizzate.
- Obiettivi di risparmio e previsioni.
- Sincronizzazione cifrata opzionale, mantenendo una modalità interamente locale.

## Privacy

Bremen Budget non include dipendenze esterne, analytics, font remoti o chiamate API. La cache del service worker contiene soltanto i file statici dell’app; i dati finanziari restano in IndexedDB e non vengono inseriti nella cache HTTP.
