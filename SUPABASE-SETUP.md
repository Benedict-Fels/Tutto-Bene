# Supabase-Setup für Bewertungen & Favoriten

Kurze Anleitung, einmalig auszuführen, bevor die Bewertungsfunktion live geht.

## 1. Projekt anlegen

Falls noch nicht vorhanden: auf [supabase.com](https://supabase.com) einloggen, neues Projekt anlegen (kostenloser Free-Tier reicht locker für dieses Vorhaben).

## 2. Tabellen & Zugriffsregeln einrichten

Im Supabase-Dashboard: **SQL Editor** (linke Seitenleiste) → **New query** → den kompletten Inhalt von `supabase-setup.sql` einfügen → **Run**.

Das legt zwei Tabellen an (`ratings`, `favorites`) und aktiviert Zugriffsregeln (Row Level Security):
- `ratings` ist komplett offen — jeder kann lesen und (mit einer beliebigen E-Mail) schreiben.
- `favorites` ist eingeschränkt — jeder sieht nur seine eigenen Favoriten.

## 3. API-Zugangsdaten holen

Im Dashboard: **Project Settings → API**. Zwei Werte werden gebraucht:

- **Project URL** (sieht aus wie `https://xxxxx.supabase.co`)
- **anon public** Key (ein langer String, beginnt meist mit `eyJ...`)

**Wichtig:** Nur den `anon`-Key verwenden, niemals den `service_role`-Key — der `service_role`-Key umgeht alle Zugriffsregeln und darf nicht im Frontend-Code landen.

## 4. Werte in den Code eintragen

In `ratings.js` stehen ganz oben zwei Platzhalter:

```js
const SUPABASE_URL = 'DEINE-PROJECT-URL-HIER';
const SUPABASE_ANON_KEY = 'DEIN-ANON-KEY-HIER';
```

Diese zwei Zeilen durch die eigenen Werte aus Schritt 3 ersetzen. Das ist der einzige nötige Eingriff — der Rest des Codes ist fertig.

## 5. Kurz testen

Seite lokal öffnen (z. B. `index.html` per Doppelklick oder über einen lokalen Server), ein Rezept öffnen, eine Test-Bewertung abgeben. Danach im Supabase-Dashboard unter **Table Editor → ratings** nachsehen, ob die Zeile angekommen ist.

## Warum der `anon`-Key offen im Code stehen darf

Das ist bei Supabase so vorgesehen — der `anon`-Key ist dafür gedacht, im Browser zu stehen. Die eigentliche Absicherung passiert über die Zugriffsregeln aus Schritt 2, nicht durch Geheimhaltung des Keys.
