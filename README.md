# ProjectLog 3.2

ProjectLog ist eine lokale, offlinefähige Projektzentrale für private Projekte. Die PWA benötigt kein Konto und kein Backend. Projekte, Bugs, Ideen, Eingangsmaterialien, Referenzen und Anhänge werden ausschließlich lokal gespeichert.

## Grundstruktur

Die App besitzt nur zwei Hauptbereiche:

- **Projekte** — strukturierte Arbeit mit Bugs, Ideen, Referenzen und Verlauf
- **Eingang** — rohe Notizen, Links, Bilder und Dateien vor ihrer Zuordnung

Bibliothek, Archiv, Backup und Einstellungen sind sekundäre Ansichten und erscheinen deshalb nicht in der Tab-Bar.

## Eingang und Referenzen

Ein Eingangseintrag kann erfasst werden als:

- Notiz
- Link
- Foto oder Bild
- Datei: PDF, Text, Markdown oder JSON

Anschließend kann er weiterverarbeitet werden als:

- neues Projekt
- Idee eines Projekts
- Bug eines Projekts
- Referenz für eines oder mehrere Projekte

Sobald eine Zuordnung erfolgt, verschwindet das Material aus dem Eingang. Links, Bilder und Dateien bleiben bei einer Umwandlung in Projekt, Idee oder Bug zusätzlich als verknüpfte Referenz erhalten. Der Anhang wird dabei nicht dupliziert.

## Projekte

Projektstatus:

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

Ein Projektdetail zeigt in dieser Reihenfolge:

1. genau einen kritischen Hinweis, sofern erforderlich
2. Beschreibung
3. Bugs, Ideen, Referenzen und Verlauf
4. letzte Änderungen

Technische IDs erscheinen nicht in der normalen Oberfläche.

## Datenspeicherung

ProjectLog verwendet ein einheitliches IndexedDB-Schema für:

- Projekte
- Bugs
- Ideen
- Eingangseinträge
- Referenzen
- Anhänge
- Ereignisse und Monatsverdichtungen

Anhänge sind auf **12 MB pro Datei** begrenzt. Ereignisse protokollieren nur relevante semantische Änderungen und werden nach zwölf Monaten zu Monatswerten verdichtet. Es gibt keine Telemetrie.

## Backup und Migration

ProjectLog 3.2 verwendet:

```text
projectlog.backup.v3
```

Backups enthalten auch Eingang, Referenzen und Anhänge. Backups aus ProjectLog 1.x und 2.x sowie bestehende ProjectLog-3.1-Daten werden beim Import beziehungsweise beim ersten Start migriert.

Vor einem Update sollte unter **Einstellungen → Backup exportieren** eine Sicherung erstellt werden.

## Installation über GitHub Pages

1. Das Updatepaket entpacken.
2. Den **Inhalt** des entpackten Ordners in das GitHub-Repository hochladen und vorhandene Dateien ersetzen.
3. Unter **Settings → Pages** den Branch `main` und `/ (root)` veröffentlichen.
4. Die Pages-Adresse in Safari öffnen.
5. **Teilen → Zum Home-Bildschirm → Hinzufügen** wählen.
6. ProjectLog einmal online starten, damit die Offline-App-Shell gespeichert wird.

ProjectLog 3.2 verwendet den Cache-Namen:

```text
projectlog-shell-v3-2-0
```

## Apple Kurzbefehle

Die URL-Aktionen öffnen nur sichere Ansichten oder Erfassungsformulare. Sie löschen oder importieren nichts automatisch.

```text
https://DEINE-ADRESSE/?action=new-project
https://DEINE-ADRESSE/?action=new-bug&project=PRJ-12345678&title=Kurztitel
https://DEINE-ADRESSE/?action=new-idea&project=PRJ-12345678&title=Kurztitel
```

Die fertigen URLs stehen innerhalb der App unter **Einstellungen → Kurzbefehle**.

## Lokal prüfen

```bash
python3 -m http.server 4173
npm test
node tests/workflow.mjs
python3 tests/render_static_qa.py
python3 tests/e2e_v32.py
```

`e2e_v32.py` bündelt die echten ES-Module nur für den Test in eine isolierte Memory-Driver-Umgebung. Der Produktionscode bleibt unverändert und verwendet IndexedDB.

## Projektstruktur

```text
index.html                App-Shell, zwei Root-Tabs und Dialogcontainer
styles.css                konsistentes Apple-orientiertes Designsystem
src/app.js                Workflowsteuerung und Ereignisbehandlung
src/views.js              reine Ansichtsrenderer
src/forms.js              kompakte gruppierte Editoren
src/sheets.js             Compose-, Auswahl-, Filter- und Bestätigungssheets
src/navigation.js         Root- und Push-Navigation
src/materials.js          Eingang, Referenzen und Anhänge
src/domain.js             Projekte, Bugs, Ideen und Backup-Schema
src/storage.js            IndexedDB-v3-Repository und Memory-Treiber
src/events.js             datensparsame Änderungshistorie
src/presentation.js       deutsche Labels und semantische Darstellung
src/icons.js              konsistentes SVG-Iconset
src/router.js             sichere URL-Aktionen
service-worker.js         versionierter Offline-Cache
manifest.webmanifest      PWA-Metadaten und App-Shortcuts
tests/                    Domänen-, Workflow-, UI- und Renderprüfungen
```

## Reale iPhone-Abnahme

Zusätzlich zu den automatisierten Prüfungen sollten auf dem Ziel-iPhone geprüft werden:

- Fotoaufnahme und Mehrfachauswahl aus Fotos
- Dateien-App und PDF-Vorschau
- iOS-Share-Sheet für Referenzen und Backups
- Speicherquota bei vielen großen Anhängen
- Offline-Neustart nach dem Service-Worker-Update
- VoiceOver und große Dynamic-Type-Einstellungen
