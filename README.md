# ProjectLog PWA

ProjectLog ist eine lokale, offlinefähige PWA für private Projekte, Bugs und Änderungsideen. Die App benötigt kein Konto, kein Backend und keine Cloud-Datenbank.

## Enthalten

- Projekte mit Beschreibung und Zeitstempeln
- Bugs mit fortlaufender ID, Status und Priorität
- Änderungsideen mit fortlaufender ID und Status
- Aktivitätsübersicht aus den letzten Änderungen
- Suche und Statusfilter
- JSON-Export und validierter, atomarer JSON-Import
- Offline-App-Shell über Service Worker
- Light Mode, Dark Mode und iPhone-Safe-Areas
- URL-Aktionen für Kurzbefehle und Lesezeichen

## Schnellster Weg aufs iPhone

Eine PWA benötigt für Service Worker und zuverlässigen Offline-Betrieb eine **HTTPS-Adresse**. Die Daten bleiben trotzdem ausschließlich auf deinem iPhone.

### GitHub Pages

1. ZIP entpacken.
2. Auf GitHub ein leeres Repository anlegen.
3. Den vollständigen Inhalt dieses Ordners in den Standardbranch hochladen.
4. Im Repository **Settings → Pages** öffnen.
5. Unter **Build and deployment** „Deploy from a branch“ wählen.
6. Den Standardbranch und den Ordner `/ (root)` auswählen.
7. Die angezeigte Pages-Adresse auf dem iPhone in **Safari** öffnen.
8. **Teilen → Zum Home-Bildschirm → Hinzufügen**.
9. Die installierte App einmal mit Internet öffnen. Danach ist die App-Shell offline verfügbar.

Andere statische HTTPS-Hoster funktionieren ebenfalls. Es gibt keinen Build-Schritt und keine Abhängigkeiten.

## Lokal auf Linux testen

```bash
cd projectlog-pwa
python3 -m http.server 4173
```

Danach am Linux-PC `http://localhost:4173` öffnen. Ein Aufruf über die LAN-IP ist zum Oberflächentest geeignet, aber nicht als endgültige iPhone-Installation: Service Worker verlangen dort normalerweise HTTPS.

## Bedienung

1. Über `+` ein Projekt anlegen.
2. Im Projekt über **Bug erfassen** oder **Idee erfassen** Einträge hinzufügen.
3. Einen Eintrag antippen, um Status, Priorität oder Beschreibung zu ändern.
4. Unter **Einstellungen** regelmäßig ein JSON-Backup exportieren.

Beim Löschen eines Projekts werden seine Bugs und Ideen nach Bestätigung mitgelöscht.

## URL-Aktionen

Die App unterstützt sichere URL-Parameter. Sie öffnen nur Ansichten oder vorausgefüllte Formulare; sie löschen oder verändern nie automatisch Daten.

```text
https://DEINE-ADRESSE/?action=new-project
https://DEINE-ADRESSE/?action=new-bug&project=PRJ-12345678&title=Kurztitel
https://DEINE-ADRESSE/?action=new-idea&project=PRJ-12345678&title=Kurztitel
https://DEINE-ADRESSE/?project=PRJ-12345678&view=bugs
```

Die konkrete Projekt-ID steht im Kopf der Projektdetailansicht. Unter **Einstellungen → Kurzbefehle und URLs** können passende Links kopiert werden.

Ein eigenes natives Schema wie `projectlog://` kann eine iOS-PWA nicht registrieren. Für Apple Kurzbefehle wird daher die HTTPS-URL verwendet.

## Daten und Backup

Die Daten liegen in IndexedDB des Safari-/PWA-Profils. Das bedeutet:

- kein Server erhält deine Inhalte;
- Löschen von Website-Daten kann auch ProjectLog-Daten entfernen;
- vor iOS-Resets, Browserbereinigungen oder Gerätewechseln sollte ein JSON-Backup exportiert werden.

Der Import prüft Schema, IDs, Zeitstempel und Projektbezüge vollständig, bevor vorhandene Daten ersetzt werden.

## Tests

```bash
npm test
python3 tests/e2e.py
```

`npm test` prüft Domänenlogik, URL-Routing, Repository-Vertrag, App-Shell und PWA-Konfiguration. `tests/e2e.py` prüft den vollständigen Daten-/Backup-Workflow, die statische HTTP-Auslieferung und die Icon-Abmessungen.

## Projektstruktur

```text
index.html                 App-Shell
styles.css                 HIG-orientiertes responsives Design
src/app.js                 UI, Navigation und Workflows
src/domain.js              IDs, Validierung, Zeitstempel und Backup-Schema
src/storage.js             IndexedDB und testbarer Memory-Treiber
src/router.js              sichere URL-Kommandos
service-worker.js          Offline-Cache
manifest.webmanifest       Installationsmetadaten
icons/                     Homescreen-Icons
tests/                     automatisierte Tests
```

## Wichtige Grenze

Die App wurde automatisiert auf Datenlogik, Paketvollständigkeit und statische Auslieferung geprüft. Der letzte reale Abnahmetest muss auf dem Ziel-iPhone in Safari erfolgen, insbesondere Installation, Teilen-Dialog, Offline-Neustart und Kurzbefehle-Aufruf.
