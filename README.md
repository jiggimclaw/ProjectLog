# ProjectLog 4.3

ProjectLog ist ein lokales, offlinefähiges Projektjournal für eine einzelne Person. Die PWA benötigt kein Konto und kein Backend. Projekte, Bugs, Ideen, Eingangsmaterialien, Referenzen, Anhänge und Verlauf werden ausschließlich lokal gespeichert.

## Kernaufgabe

ProjectLog unterstützt einen klaren Ablauf:

```text
Festhalten → zuordnen → Projektzustand verstehen → weiterentwickeln
```

Die App besitzt zwei Hauptbereiche:

- **Projekte** — strukturierte Arbeit mit Bugs, Ideen, Referenzen und Verlauf
- **Eingang** — noch nicht zugeordnete Gedanken, Links, Bilder und Dateien

**Referenzen**, Archiv, Backup und Einstellungen sind sekundäre Ansichten. Die Zwei-Tab-Bar hält den jeweiligen Hauptkontext Projekte oder Eingang stabil.

## Designsystem 4.3

ProjectLog 4.3 trennt vertraute iOS-Bedienmuster von einer eigenen ProjectLog-Identität:

- stabile Projektliste mit **Favoriten** und **Projekte**
- keine automatisch springenden Projektbereiche
- **Project Spine** als wiederkehrende Projektachse für Priorität und Zugehörigkeit
- Quick Capture mit einem einzigen Einstiegspunkt
- reduzierte Toolbars und gruppierte Aktionen
- ruhige Zwei-Tab-Navigation
- getrennte Farbrollen für Interaktion, Projektpriorität und Warnungen
- gruppierte Listen statt einzelner Karten
- Systemschrift für Inhalte, `ui-rounded` nur für die Marke ProjectLog
- technische Daten in einer Monospace-Rolle
- Light Mode, Dark Mode, erhöhter Kontrast und reduzierte Bewegung

Die App bleibt technisch eine PWA. Native SwiftUI- oder Liquid-Glass-APIs werden nicht simuliert; CSS-Materialien und SVG-Symbole besitzen robuste Fallbacks.

## UX- und Accessibility-Korrekturen 4.1

- sichtbarer Tastaturfokus auf Toolbar, Tab-Bar, Listen und Formfeldern
- Sitzungsentwürfe für Quick Capture und Editoren
- eindeutige Busy-/Disabled-Zustände bei asynchronen Aktionen
- Inline-Validierung mit feldbezogenen Meldungen und Fokus auf dem ersten Fehler
- stabile Scrollposition beim Zurücknavigieren
- entprellte Suche, die nur den Ergebnisbereich aktualisiert
- echte Lazy-Aktivierung von Bildanhängen über `IntersectionObserver`
- Offline- und Updatehinweise
- kurze Rückgängig-Option nach Löschvorgängen
- Deep Links für Eingangseinträge und Referenzen
- Landscape-Layout sowie Tests mit 100 %, 140 % und 200 % Textskalierung
- `prefers-contrast: more` und `prefers-reduced-motion`

## Design-Craft-Korrekturen 4.2

- Divider beginnen an der jeweiligen Inhaltsachse statt unter Icons oder Project Spine
- gruppierte Listen verwenden radiusgetreue Maskierung und einen halbtransparenten Oberflächenring statt harter Außenborder
- erste und letzte Listenzeile übernehmen die Außenradien ohne abgeschnittene Press- oder Fokuszustände
- Quick-Capture- und Sheet-Fokus werden als inset Masken innerhalb der tatsächlichen Komponentengeometrie gezeichnet
- Divider folgen ihren Inhaltsachsen; interne Toolbar-Trenner werden nicht verwendet
- Pressfeedback skaliert Controls in 140 ms, ohne semantische Farben zu überschreiben
- Materialflächen besitzen Fallbacks für reduzierte Transparenz
- die Sheet-Kopfzeile bleibt auch bei 320 px und 200 % Textskalierung kollisionsfrei

## Feedback- und Auswahlkorrekturen 4.3

- Ideen besitzen in der sichtbaren Oberfläche keinen Status mehr
- der Nutzen einer Idee wird über **Klein**, **Relevant** und **Strategisch** mit eigenen Symbolen dargestellt
- **Relevant** verwendet eine gelbe gefüllte Glühbirne, **Strategisch** ein rotes Feuer
- Bug-, Ideen- und Referenzfilter liegen als direkte Auswahlleiste oberhalb der jeweiligen Liste
- Filteraktionen wurden aus den oberen Toolbars entfernt
- Toolbar-Cluster verwenden Abstand statt eines internen dünnen Dividers
- der Sheet-Griff kann nach unten gezogen werden und schließt das Sheet ab einer klaren Distanz oder Wischgeschwindigkeit
- Titelzeilen reservieren ausreichend vertikalen Raum, damit Ober- und Unterlängen nicht abgeschnitten werden
- Projekte erhalten bei der Erstellung ein festes Icon und eine Farbe; diese Identität erscheint in Listen, Details und Zuordnungen
- bestehende Projekte werden kompatibel mit **Ordner + Lila** ergänzt

## Project Spine

Die Project Spine ist das charakteristische Gestaltungselement von ProjectLog. Eine schmale vertikale Achse verbindet:

- Projektzeilen
- Projekttitel
- Projektzuordnungen von Referenzen
- Verlaufseinträge
- kritische Projekthinweise

Ihre Farbe codiert die Projektpriorität unabhängig von Apple-Lila und semantischen Warnfarben.

## Quick Capture

Im Eingang öffnet **Festhalten** ein einziges Erfassungsfeld:

- eingegebene URL → Link
- übriger Text → Notiz
- Foto hinzufügen → Bildmaterial
- Datei hinzufügen → PDF, Text, Markdown oder JSON

Der erste Textabsatz beziehungsweise die erste Zeile wird als Titel verwendet. Material kann anschließend weiterverarbeitet werden als:

- neues Projekt
- Bug eines Projekts
- Idee eines Projekts
- Referenz für eines oder mehrere Projekte

Nach erfolgreicher Zuordnung verschwindet das Material aus dem Eingang. Links, Bilder und Dateien bleiben bei einer Umwandlung in Projekt, Bug oder Idee zusätzlich als verknüpfte Referenz erhalten. Anhänge werden nicht pro Projekt dupliziert.

## Projektansicht

Die Projektübersicht zeigt stabil:

1. Favoriten
2. alle übrigen Projekte

Warnungen erscheinen innerhalb der jeweiligen Projektzeile, statt Projekte in einen dynamischen Bereich „Benötigt Aufmerksamkeit“ zu verschieben.

Ein Projektdetail zeigt:

1. einen kompakten kritischen Hinweis, sofern erforderlich
2. Beschreibung
3. Bugs, Ideen, Referenzen und Verlauf
4. einen kompakten Zugang zu letzten Änderungen

Favorit, Bearbeiten und Archivieren liegen im Projektmenü. Technische IDs erscheinen nicht in der normalen Oberfläche.

## Datenspeicherung

ProjectLog verwendet IndexedDB für:

- Projekte
- Bugs
- Ideen
- Eingangseinträge
- Referenzen
- Anhänge
- Ereignisse und Monatsverdichtungen

Anhänge sind auf **12 MB pro Datei** begrenzt. Das Änderungsprotokoll erfasst nur relevante semantische Änderungen und wird nach zwölf Monaten zu Monatswerten verdichtet. Es gibt keine Telemetrie.

## Backup und Migration

ProjectLog 4.3 verwendet weiterhin das kompatible Schema:

```text
projectlog.backup.v3
```

Backups enthalten Projekte, Bugs, Ideen, Eingang, Referenzen, Anhänge, Verlauf und Einstellungen. Backups aus ProjectLog 1.x und 2.x sowie lokale ProjectLog-3.x-Daten werden migriert.

Vor einem Update sollte unter **Einstellungen → Backup exportieren** eine Sicherung erstellt werden.

## Installation über GitHub Pages

1. Updatepaket entpacken.
2. Den **Inhalt** des entpackten Ordners in die oberste Ebene des GitHub-Repositories hochladen und vorhandene Dateien ersetzen.
3. Unter **Settings → Pages** den Branch `main` und `/ (root)` veröffentlichen.
4. Die Pages-Adresse in Safari öffnen.
5. **Teilen → Zum Home-Bildschirm → Hinzufügen** wählen.
6. ProjectLog einmal online starten, damit die Offline-App-Shell gespeichert wird.

ProjectLog 4.3 verwendet den Cache-Namen:

```text
projectlog-shell-v4-3-0
```

## Apple Kurzbefehle

Die URL-Aktionen öffnen nur sichere Ansichten oder Erfassungsformulare:

```text
https://DEINE-ADRESSE/?action=new-project
https://DEINE-ADRESSE/?action=new-bug&project=PRJ-12345678&title=Kurztitel
https://DEINE-ADRESSE/?action=new-idea&project=PRJ-12345678&title=Kurztitel
https://DEINE-ADRESSE/?action=open-inbox&inbox=INB-12345678
https://DEINE-ADRESSE/?action=open-reference&reference=REF-12345678
```

Die fertigen URLs stehen in der App unter **Einstellungen → Kurzbefehle**.

## Lokal prüfen

```bash
npm test
node tests/workflow.mjs
python3 tests/render_static_qa.py
python3 tests/render_large_text_qa.py
python3 tests/e2e_v40.py
python3 tests/e2e_v41_quality.py
python3 tests/e2e_v42_craft.py
python3 tests/e2e_v43_feedback.py
```

`e2e_v40.py` bündelt die echten ES-Module ausschließlich für eine isolierte Browserprüfung mit Memory-Datentreiber. Der Produktionscode verwendet IndexedDB.

## Projektstruktur

```text
index.html                         App-Shell, Root-Tabs und Dialogcontainer
styles.css                         Feature- und Layoutstile
src/design/tokens.css              Farben, Typografie, Abstände und Materialtokens
src/design/components.css          Project Spine, Navigation und UI-Primitiven
src/design/accessibility.css       Fokus, Kontrast, Landscape, Busy- und Safe-Area-Zustände
src/ui/primitives.js               wiederverwendbare gruppierte Listen und Spines
src/drafts.js                      lokale Sitzungsentwürfe für Editor und Quick Capture
src/app.js                         Workflowsteuerung und Ereignisbehandlung
src/views.js                       Ansichtsrenderer
src/forms.js                       kompakte Editoren
src/sheets.js                      Quick Capture, Auswahl- und Bestätigungssheets
src/navigation.js                  Root- und Push-Navigation
src/materials.js                   Eingang, Referenzen und Anhänge
src/domain.js                      Projekte, Bugs, Ideen und Backup-Schema
src/storage.js                     IndexedDB-Repository und Memory-Treiber
src/events.js                      datensparsame Änderungshistorie
src/presentation.js                deutsche Labels und semantische Darstellung
src/icons.js                       konsistentes SVG-Iconset
service-worker.js                  versionierter Offline-Cache
manifest.webmanifest               PWA-Metadaten und App-Shortcuts
tests/                             Domänen-, Workflow-, Render- und Interaktionstests
```

## Reale iPhone-Abnahme

Zusätzlich zu den automatisierten Prüfungen sollten auf dem Ziel-iPhone geprüft werden:

- Fotoaufnahme und Mehrfachauswahl aus Fotos
- Dateien-App und PDF-Vorschau
- iOS-Share-Sheet für Referenzen und Backups
- Speicherquota bei vielen großen Anhängen
- Offline-Neustart nach dem Service-Worker-Update
- VoiceOver
- sehr große Systemeinstellungen für Text
