# ProjectLog 2.0

ProjectLog ist eine lokale, offlinefähige Projektzentrale für private Projekte, Bugs und Ideen. Die PWA benötigt weder Konto noch Backend und überträgt keine Nutzungsdaten.

## Kernfunktionen

- Dashboard mit Portfolio-Kennzahlen, Favoriten, Projektlage und 30-Tage-Verlauf
- Projekte mit Status, strategischer Priorität, Favorit und automatisch berechneter Gesundheit
- Bugs mit fünf Bearbeitungsstatus und drei klaren Schweregraden
- Ideen mit fünf Bearbeitungsstatus und drei Nutzenstufen
- feste Mehrfach-Tags: Funktion, Design, Technik, Qualität, Dokumentation, Sonstiges
- projektbezogener Verlauf aus datensparsamen Ereignissen
- automatische Verdichtung von Ereignissen, die älter als zwölf Monate sind
- globale Suche über Projekte, Bugs, Ideen, IDs und Tags
- validierter Import von ProjectLog-1.x- und ProjectLog-2.x-Backups
- JSON-Backup über das iOS-Teilen-Menü
- sichere HTTPS-URL-Aktionen für Apple Kurzbefehle
- Light Mode, Dark Mode, Safe Areas und reduzierte Bewegung

## Informationsmodell

### Projekte

Status:

- Geplant
- Aktiv
- Pausiert
- Abgeschlossen
- Archiviert

Priorität:

- Niedrig
- Normal
- Hoch
- Strategisch

Die Priorität ist manuell und wird in Listen durch einen schmalen violetten Rand sowie Text dargestellt. Die Projektgesundheit wird separat und nachvollziehbar aus Status, offenen Bugs und Aktivität berechnet.

### Bugs

Status:

- Neu
- In Prüfung
- In Arbeit
- Behoben
- Verworfen

Schweregrad:

- Gering — gelb, Ausrufezeichen im Kreis
- Wesentlich — orange, Ausrufezeichen im Dreieck
- Kritisch — rot, Ausrufezeichen im Achteck

### Ideen

Status:

- Neu
- Geprüft
- Geplant
- Umgesetzt
- Verworfen

Nutzen:

- Klein — grau
- Relevant — blau
- Strategisch — goldgelb mit Funkeln

Apple-Lila bleibt ausschließlich die primäre Akzentfarbe für Navigation, Auswahl und Aktionen.

## Installation über GitHub Pages

1. Das vollständige ZIP entpacken.
2. Den **Inhalt** des entpackten Ordners in das GitHub-Repository hochladen.
3. Im Repository **Settings → Pages** öffnen.
4. Unter **Build and deployment** „Deploy from a branch“ wählen.
5. Branch `main` und Ordner `/ (root)` auswählen.
6. Die Pages-Adresse auf dem iPhone in Safari öffnen.
7. **Teilen → Zum Home-Bildschirm → Hinzufügen**.
8. ProjectLog einmal mit Internet starten, damit die Offline-App-Shell geladen wird.

## Aktualisierung einer bestehenden Installation

Vor dem Update in ProjectLog unter **Einstellungen → Backup in Dateien sichern** ein JSON-Backup erstellen.

Danach den vollständigen Inhalt des Update-Pakets in dasselbe Repository hochladen und bestehende Dateien ersetzen. ProjectLog 2.0 verwendet den Cache-Namen `projectlog-shell-v2-1-0` und versionsgebundene Modul-URLs, damit alte iOS-PWA-Dateien nicht weiterverwendet werden.

Die bestehende lokale Datenbank wird beim ersten Start in das Schema 2 migriert. Projektbeschreibungen, Bugs und Ideen bleiben erhalten. Für neue Felder werden konservative Standardwerte vergeben.

## Datenspeicherung und Verlauf

Die Inhalte liegen ausschließlich in IndexedDB des Safari-/PWA-Profils. ProjectLog speichert bei relevanten Änderungen nur kompakte Ereignisse:

- Zeitpunkt
- Eintragstyp und ID
- Änderungsart
- alter und neuer semantischer Wert

Frühere Beschreibungstexte, Geräteinformationen, Standorte und Nutzungsanalysen werden nicht protokolliert. Ereignisse über zwölf Monate werden lokal zu monatlichen Summen verdichtet.

Das Löschen von Safari-Websitedaten oder der Homescreen-PWA kann lokale ProjectLog-Daten entfernen. Deshalb vor Gerätewechseln, Systembereinigungen und größeren Updates ein Backup exportieren.

## URL-Aktionen

Die URL-Parameter öffnen nur Ansichten oder vorausgefüllte Formulare. Sie speichern oder löschen nichts automatisch.

```text
https://DEINE-ADRESSE/?action=new-project
https://DEINE-ADRESSE/?action=new-bug&project=PRJ-12345678&title=Kurztitel
https://DEINE-ADRESSE/?action=new-idea&project=PRJ-12345678&title=Kurztitel
https://DEINE-ADRESSE/?project=PRJ-12345678&view=overview
https://DEINE-ADRESSE/?project=PRJ-12345678&view=bugs
https://DEINE-ADRESSE/?project=PRJ-12345678&view=ideas
https://DEINE-ADRESSE/?project=PRJ-12345678&view=history
```

Ein natives Schema wie `projectlog://` kann eine iOS-PWA nicht registrieren. Apple Kurzbefehle verwendet deshalb die HTTPS-Adresse.

## Lokal testen

```bash
python3 -m http.server 4173
```

Danach `http://localhost:4173` öffnen.

Automatisierte Prüfung:

```bash
npm test
python3 tests/e2e.py
```

## Projektstruktur

```text
index.html                    App-Shell und vier Top-Level-Tabs
styles.css                    Apple-orientiertes responsives Designsystem
src/app.js                    UI, Navigation und Benutzerworkflows
src/domain.js                 Datenmodell, Validierung und Backup-Migration
src/storage.js                IndexedDB-v2-Repository und Memory-Treiber
src/events.js                 datensparsame Ereignisse und Verdichtung
src/analytics.js              Projektgesundheit, Dashboard und Trenddaten
src/chart.js                  zugängliches SVG-Verlaufsdiagramm
src/presentation.js           deutsche Labels und semantische Darstellung
src/icons.js                  konsistentes SVG-Iconset
src/router.js                 sichere URL-Kommandos
src/view-helpers.js           Formatierung und HTML-Escaping
service-worker.js             versionierter Offline-Cache
manifest.webmanifest          Installationsmetadaten und App-Shortcuts
tests/                        Domänen-, Repository-, UI- und PWA-Tests
```

## Reale iPhone-Abnahme

Die automatisierten Tests prüfen Datenmigration, Speicherung, Backup, statische Auslieferung, responsive Layouts und Kerninteraktionen. Auf dem Ziel-iPhone bleiben vier systemabhängige Punkte zu prüfen:

- Installation aus Safari
- iOS-Teilen-Menü für JSON-Backups
- Offline-Neustart nach aktualisiertem Service Worker
- Aufruf aus Apple Kurzbefehle
