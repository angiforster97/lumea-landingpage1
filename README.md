# Lumea Landingpage (Probearbeit, fiktives Produkt)

Statische Seite ohne Framework: `index.html` (Produkt), `bestellen.html` (2 Schritte), `danke.html`,
plus `kuendigen.html` (§ 312k BGB) und `rechtliches.html`.

## Deploy auf Netlify
1. app.netlify.com → „Add new site“ → „Deploy manually“.
2. Den ganzen Ordner `lumea-site` per Drag & Drop hochladen. Fertig.
   `netlify.toml` sorgt für die URLs `/bestellen`, `/danke`, `/kuendigen`, `/rechtliches` und setzt `noindex`.

## Tracking prüfen
- Meta Pixel Helper: Vor dem Klick auf „Alle akzeptieren“ meldet er nichts (gewollt, § 25 TDDDG).
- Mit `?debug=1` an der URL zeigt die Seite unten links ein Protokoll aller Ereignisse und Parameter.
- Erwartete Ereignisse nach Einwilligung:
  - `/` → PageView; ViewContent, sobald die Abo-Box zu 50 % sichtbar ist (1× pro Sitzung)
  - `/bestellen` → PageView, InitiateCheckout; AddPaymentInfo bei Wahl der Zahlart
  - `/danke` → PageView, Subscribe (value 14.50, predicted_ltv 91.35) und Purchase (value 14.50),
    beide mit eventID = Bestellnummer. Neuladen: kein zweites Mal. Direktaufruf ohne Bestellung: nichts.
- Pixel-ID 1234567890 und GA4 G-LUMEA0000 sind Platzhalter (siehe `assets/js/tracking.js`).

## Geschützter Bereich /fachkreise/ (Bonus 1)
- Schutz per Netlify Edge Function `netlify/edge-functions/fachkreise-auth.js` (Basic Auth).
- In Netlify unter Site configuration → Environment variables setzen (Scope: Functions):
  `FACHKREISE_PASSWORD` (Pflicht), optional `FACHKREISE_USER` (Standard: `fachkreise`). Danach neu deployen.
- Ohne gesetztes Passwort ist der Bereich gesperrt (503) – nie versehentlich offen.
- WICHTIG: Drag & Drop („Deploy manually“) veröffentlicht nur statische Dateien, keine Edge Functions.
  Stattdessen im Ordner `lumea-site`:  `npx netlify-cli login`  und  `npx netlify-cli deploy --prod --dir .`
  (oder Repo auf GitHub und mit Netlify verbinden).
- Prüfen: https://<site>/fachkreise/ muss nach Benutzername/Passwort fragen.
