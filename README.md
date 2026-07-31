# Tutto Bene.

Persönliche vegane Rezeptsammlung. Reines HTML, CSS und JavaScript, kein Framework,
kein Build-Schritt. Gehostet über GitHub Pages.

## Aufbau

```
index.html            Übersichtsseite (E3)
recipes.json          Kerndaten aller Rezepte — die Datei, die die Übersicht lädt
recipes/              Eine JSON-Datei pro Rezept, vollständig mit Mengen und Schritten
images/               Ein Bild pro Rezept, benannt nach der id, 800 × 800 JPEG
data/lists.json       Feste Listen: Kategorien, Küchen, Einheiten, Zutaten
check.js              Prüfskript, gehört nicht zur Seite
robots.txt            Sperrt Suchmaschinen aus
```

## Konventionen

**Technik englisch, Inhalt deutsch.** Ordner, Dateinamen und Feldnamen sind englisch
(`title`, `ingredients`, `prepTime`), alle Werte deutsch — Einheiten eingeschlossen
(`Stück`, `Handvoll`).

Das vollständige Datenmodell steht in der Spec E1 im Claude-Projekt sowie in der Skill
`tutto-bene-recipe-style`. Kurzfassung:

- Zutatennamen sind Filterbegriffe und müssen exakt einem Eintrag in
  `data/lists.json` entsprechen. Vorlieben wie „zartbitter" stehen in `variety`
  und filtern nicht.
- `prepTime`, `cookTime` und `restTime` sind getrennt. Der Zeitfilter rechnet nur
  mit den ersten beiden — 25 Minuten Arbeit plus 75 Minuten Kühlschrank ist ein
  schnelles Rezept.
- Zubereitungsschritte nennen keine Mengen, damit der Portionsrechner nicht lügt.
  Statt „4 EL des Safts" also „etwas Saft".
- Jedes Rezept steht an zwei Stellen: vollständig in `recipes/<id>.json`, in
  Kurzform in `recipes.json`. Beide müssen zusammenpassen — dafür gibt es das
  Prüfskript.

## Prüfen

```
node check.js
```

Meldet fehlende Pflichtfelder, unbekannte Kategorien, Küchen, Einheiten und Zutaten,
abweichende oder doppelte ids, Rezepte die nur in einer der beiden Dateien stehen,
Mengen ohne Einheit, fehlende Bilder und Zubereitungsschritte mit Mengenangaben.

Vor jedem Commit laufen lassen.
