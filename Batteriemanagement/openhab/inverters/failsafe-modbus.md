# Fail-Safe bei Modbus-gesteuerten Wechselrichtern

**Stand 2026-09-17.** Analyse vom 2026-09-16; die Schichten L1, L2 und L4
sowie die Kern-Luecke aus Abschnitt 6 sind seit 2026-09-17 **umgesetzt**
(am Simulator geprueft, am Geraet noch nicht). Offen: der Vor-Ort-Test an
der Testanlage **Mitglied 020 (pi-020, Fronius Symo Hybrid 5.0-3-S mit
Datamanager 2.0, Anlage Pfandl)**, die geraeteseitigen Hebel aus
Abschnitt 5 und die Reset-Skripte der anderen Modbus-Profile.

Ausgangsfrage: Der Adapter-Kontrakt verlangt, dass jede Aktion nach
`minutes` Minuten **von selbst** ablaeuft (siehe `README.md`, "Fail-Safe-
Pflicht"). Genau ein Profil erfuellt das. Alle anderen haengen daran, dass
openHAB laeuft. Dieses Dokument sammelt, was daraus folgt, was am Geraet
moeglich waere und was am Testtag gemessen werden muss.

---

## 1. Warum das profiluebergreifend ist

| Profil | Steuerweg | Geraeteseitiges Auto-Revert | Geraeteseitiger SoC-Boden |
| --- | --- | --- | --- |
| `fronius` (GEN24) | Config-API, Schedules | **ja** - der Schedule laeuft nach `minutes` ab | entfaellt |
| `fronius-snapinverter` | SunSpec Model 124, Modbus | **nein** - `InOutWRte_RvrtTms` "Not supported", am Geraet belegt (Spike 2026-09-10: Write angenommen, Read-back bleibt 65535) | `MinRsvPct` liest **0**; Web-UI-"Min SoC" ungeprueft (Abschnitt 5) |
| `sigenergy` | Remote EMS, Modbus | **nein** (Protokoll V1.7; "Interaction timeout" ist nur Request-Timing) - Spike-Punkt 9 offen | Entladeuntergrenze der Anlage, Wert unbekannt |
| `deye` | TOU-Register | **nein** | `DEYE_SOC_FLOOR` 10 % je Slot plus BMS-Untergrenze |
| `victron` | ESS-Settings-Register | **nein** - ESS Mode 3 haette einen 60-s-Watchdog, wurde aber bewusst verworfen (schaltet den Multi bei Kommunikationsverlust dauerhaft in Passthru) | **ESS Minimum SoC = harter Boden** (Spike offen) |

Vier von fuenf Profilen haengen also allein am zyklischen Reset des Kerns.
Ein Fail-Safe am Pi ist damit **keine Fronius-Reparatur, sondern eine
gemeinsame Komponente** - und der geraeteseitige SoC-Boden ist die einzige
Absicherung, die einen toten Pi ueberlebt. Victron hat ihn, Deye hat ihn,
bei Fronius und Sigenergy ist er offen.

## 2. Was heute schuetzt

1. **Zyklischer Reset (der eigentliche Fail-Safe).** In jedem 5-Minuten-
   Zyklus ruft `control/core.js:1817` bei Hauptschalter ON zuerst
   `ibmReset()` und kommandiert erst danach den faelligen Slot. Ein
   haengengebliebener Zustand ueberlebt hoechstens einen Zyklus -
   **solange openHAB laeuft**.
2. **Geraete-Guard je Adapter.** Geschrieben wird nur bei plausibel
   gelesenem Geraet (Model 124 plus `WChaMax` bei Fronius, ESS-Modus 1/2
   bei Victron usw.).
3. **Netzladeschutz des Kerns**, unabhaengig vom Adapter.
4. **Not-Aus von Hand** am Geraet, je Profil verschieden (Abschnitt 5).

## 3. Fehlerbilder und Abdeckung

| Fehlerbild | Kann noch jemand schreiben? | Abdeckung heute | Geplante Schicht |
| --- | --- | --- | --- |
| openHAB abgestuerzt, haengt, OOM, Regel-Exception, Binding tot | ja, der Pi lebt | **keine** | L1 Deadman |
| Pi-Kernel eingefroren | erst nach erzwungenem Reboot | keine | L3 Hardware-Watchdog, danach L2 |
| Pi rebootet (Stromwackler, unattended upgrade) | ja, beim Hochfahren | keine (openHAB koennte auch scheitern) | L2 Boot-Reset |
| Pi hart tot (Netzteil, SD-Karte) | **nein** | keine | nur Geraeteseite (Abschnitt 5) plus L4 Alarm |
| LAN-Pfad Pi -> Wechselrichter weg, Pi lebt | nein | keine | dito |

Belegt am Geraet (Spike 2026-09-10, Anlage 020): ein kommandiertes
Entladefenster stand **die vollen 10 Minuten ohne Master** unveraendert,
Registerstand danach unveraendert. Das Restrisiko ist kein theoretisches.

## 4. Schichten (L1, L2, L4 umgesetzt 2026-09-17; L3 optional)

Installiert von `setup/10-install-failsafe.sh` (Schritt 13 in
`install-ibm.sh`), Bedienung `sudo ibm-failsafe --status | --now`, Log
`/var/log/ibm-failsafe.log`, Konfiguration `INSTALL_FAILSAFE`,
`FAILSAFE_STALE_MIN` (12), `FAILSAFE_REPEAT_MIN` (10),
`INSTALL_HW_WATCHDOG` (0) in `ibm.conf`. Am Simulator geprueft
(`tools/sim_datamanager.py`): stehendes Entladefenster `StorCtl 3 /
InWRte -2000` wird auf Werksverhalten gesetzt und per Read-back bestaetigt;
Wiederholsperre, `--boot`, `--now`, Adress-Rueckfall auf `ibm.conf` und
unerreichbares Geraet verhalten sich wie beschrieben.

### L1 - Deadman-Timer am Pi (der eigentliche Fix)

Root-Timer `ibm-failsafe.timer`, jede Minute, vollstaendig unabhaengig von
Java und openHAB:

* Der Kern beruehrt am Ende jedes Zyklus eine Heartbeat-Datei. Das Idiom
  gibt es schon: `eeg-api/status_push.js:319` legt seinen Update-Marker mit
  `actions.Exec.executeCommandLine(..., "touch '<pfad>'")` an, und
  `/var/lib/ischlstrom/requests` wird von `setup/09-install-updater.sh:50`
  bereits root-angelegt und fuer den openHAB-Benutzer beschreibbar gemacht.
* Der Timer prueft zwei Dinge: Heartbeat aelter als ~12 Minuten (zwei
  verpasste Zyklen) **oder** `systemctl is-active openhab` nicht aktiv.
* Loest einer aus, schreibt er den Reset direkt aufs Geraet und bleibt
  scharf, bis der Heartbeat zurueck ist. Danach protokollieren, damit der
  naechste Status-Push es meldet.
* Systemd-Muster eins zu eins von `setup/09-install-updater.sh` (Skript
  unter `/usr/local/sbin`, Timer, atomares Ersetzen).

**Profilschnittstelle:** Der Deadman kann den openHAB-Adapter nicht
aufrufen. Jedes Modbus-Profil definiert deshalb in `profile.sh` die
Funktion `inverter_failsafe_reset <host>` (Kontrakt in `README.md`):
eigenstaendig, ohne openHAB, Exit 0 nur bei per Read-back bestaetigtem
Reset. `fronius-snapinverter` hat sie
(`tools/failsafe_reset.py`, Modbus-Client wie im Spike-Werkzeug, Guard auf
Model-ID 124 wie im Adapter). Fuer `sigenergy` (`Remote EMS enable = 0`),
`deye` und `victron` ist sie **noch zu schreiben** - bis dahin richtet der
Installer dort keinen Timer ein und sagt das. Das GEN24-Profil braucht
keine.

Umgesetzte Feinheiten: der Heartbeat entsteht nur nach `ok=true` des
Resets (schlaegt das Binding fehl, uebernimmt der Timer mit eigener
Verbindung); die Adresse kommt aus dem Bridge-Thing der JSONDB
(`thing_config_param` in `lib/common.sh`, Rueckfall `INVERTER_HOST`);
waehrend eines Ausfalls wird alle `FAILSAFE_REPEAT_MIN` Minuten erneut
geschrieben, ein fehlgeschlagener Reset jede Minute wiederholt; ohne
Heartbeat-Datei (frische Installation) tut der Timer nichts. Der letzte
Eingriff steht als JSON in `/var/lib/ischlstrom/requests/failsafe-status`
und geht als Feld `failsafe` mit dem Status-Push ans Dashboard.

### L2 - Reset bei jedem Boot

`ibm-failsafe-boot.service`, `oneshot` mit `Before=openhab.service`,
`ibm-failsafe --boot`: bis zu acht Versuche im 15-Sekunden-Abstand, falls
das Geraet nach dem Boot noch nicht erreichbar ist. Deckt alle
Reboot-Faelle ab einschliesslich "openHAB startet gar nicht mehr". Dazu
das Drop-in `openhab.service.d/ibm-failsafe.conf` mit
`Restart=on-failure`.

### L3 - Hardware-Watchdog (optional, Vorgabe aus)

`INSTALL_HW_WATCHDOG=1` legt `system.conf.d/ibm-watchdog.conf` mit
`RuntimeWatchdogSec=15s` an (nur wenn `/dev/watchdog` existiert). Macht
aus "Pi eingefroren" ein "Pi rebootet und L2 setzt zurueck" - aber ein Pi
im Swap-Stau wird dann hart neu gestartet. Erst an Anlage 020 beobachten,
dann entscheiden.

### L4 - Serverseitiger Alarm (kein Reset)

Umgesetzt in `website/src/lib/server/mail/notifications/ibmAlerts.js`,
siehe Abschnitt 7. s1 kann nicht eingreifen: der WireGuard-Peer ist
`AllowedIPs = <Pi>/32` (`setup/08-install-wireguard.sh:171`), der Tunnel
reicht also zum Pi und nicht ins Mitgliedsnetz - und ist bei totem Pi
ohnehin weg.

## 5. Befunde Fronius SnapINverter (Doku-Recherche 2026-09-16)

Alles hier ist **Aktenlage, nicht gemessen**, soweit nicht anders vermerkt.

* **Kein Auto-Revert.** `InOutWRte_RvrtTms` ist laut Registerkarte 1.1.5-1
  "Not supported, R"; Spike 2026-09-10: Write auf 120 wird **ohne
  Exception angenommen, aber nicht gehalten** (Read-back 65535). Merksatz:
  auf diesem Register beweist ein erfolgreicher Write nichts, nur der
  Read-back zaehlt.
* **Not-Aus des Mitglieds: "Datenausgabe ueber Modbus" auf aus**
  (Weboberflaeche -> Einstellungen -> Modbus). Die Datamanager-2.0-
  Bedienungsanleitung sagt woertlich: *"Ist die Datenausgabe ueber Modbus
  deaktiviert, werden ueber Modbus an die Wechselrichter uebertragene
  Steuerungsbefehle zurueckgesetzt, z. B. keine Leistungsreduktion oder
  keine Blindleistungs-Vorgabe."*
  **Vorsicht:** die genannten Beispiele stammen aus dem Wechselrichter-
  Modell (123er-Welt), nicht aus dem Storage-Model. Ob damit auch
  `StorCtl_Mod`/`InWRte`/`OutWRte` fallen, steht nirgends und war **nicht**
  Teil des Spike (dort wurde mit einem expliziten Modbus-Reset
  aufgeraeumt). Muss gemessen werden, bevor es in eine Mitglieder-
  Anleitung kommt.
* **Power-Cycle ungeprueft.** Die Steuerregister des Model 124 sind
  vermutlich fluechtig, ein Neustart sollte also mit `InWRte`/`OutWRte`
  100 % und `StorCtl_Mod` 0 hochkommen. Waere die mit Abstand einfachste
  Mitglieder-Anweisung ("aus und wieder ein") - deshalb unbedingt testen.
* **`MinRsvPct` (Offset +7, SF -2) liest 0.** Laut Registerkarte
  beschreibbar. Waere ein geraeteresidenter Boden, der einen toten Pi
  ueberlebt. **Aber:** `ChaGriSet` liest **1 (GRID)**. Haelt der
  Wechselrichter die Reserve notfalls durch Netzladen, verletzt das den
  Grundsatz "nie aus dem Netz laden". Vor dem Setzen pruefen, ob
  `ChaGriSet = 0` (PV) schreibbar ist und haelt, und P_Grid beobachten.
* **Besserer Hebel als `MinRsvPct`: das Web-UI.** Die Weboberflaeche hat
  unter **Batteriemanagement** ein **Min SoC / Max SoC** (automatisch nach
  Batteriehersteller oder manuell; Symo-Hybrid-Bedienungsanleitung S. 106).
  Persistent, Modbus-unabhaengig, ueberlebt einen toten Pi.
  **Aber:** dieselbe Anleitung sagt, dass die Batteriesteuerungsvorgaben
  "nach der Eigenverbrauchsoptimierung die zweit geringste Prioritaet"
  haben und Modbus-Steuervorgaben ausdruecklich zu den einwirkenden
  Faktoren zaehlen. Ob Min SoC eine per Modbus erzwungene Entladung
  wirklich stoppt, ist damit offen und ist der wichtigste Einzeltest.
* **"Steuerung einschraenken"** (S. 102) bindet die Steuerung an eine IP.
  Kein Timeout, hilft hier also nicht - aber: ein Ersatz-Pi bekommt eine
  andere IP und waere ausgesperrt. Gehoert auf die Austausch-Checkliste.
* **Werkseinstellungen des Datamanagers** (Services) sind **nicht** das
  Mitglieder-Werkzeug: sie loeschen Modbus- und Netzwerkkonfiguration und
  machen den Pi-Austausch schwerer.

## 6. Luecke im Kern: Hauptschalter OFF setzte nicht zurueck (geschlossen)

Bis 2026-09-17 kehrte `control/core.js` bei `Schalte_ISCHLSTROM_Empfehlung_einaus`
= OFF zurueck, **bevor** der Reset lief; `ibmReset()` wird nur von der
Batterie-Cron-Regel aufgerufen. Beim GEN24 harmlos (Schedule laeuft ab),
bei allen Modbus-Profilen blieb das zuletzt kommandierte Fenster stehen,
wenn das Mitglied mitten im Entladefenster abschaltete.

Seit 2026-09-17: beim Ausschalten schickt der Kern genau **einen** letzten
Reset (bei nicht bestaetigtem Reset im naechsten Zyklus erneut) und legt
den Standby-Marker `/var/lib/ischlstrom/requests/failsafe-standby` an.
Solange der Marker existiert, ruehren weder Kern noch Fail-Safe-Timer noch
Boot-Reset den Wechselrichter an - Hauptschalter AUS heisst ausdruecklich,
dass das Mitglied den Wechselrichter anders steuern darf (Hersteller-App,
anderes EMS). Beim Einschalten entfernt der Kern den Marker, Heartbeat und
Timer laufen wieder. Die Pause (`IBM_PAUSE_TAGE`) bleibt wie bisher: Reset
in jedem Zyklus, Wechselrichter arbeitet wie ab Werk. Am Testtag
verifizieren (Test 5).

## 7. Serverseite: bemerken statt eingreifen

Vorhanden:

* Status-Push jede Minute (`CRON_STATUS = "0 * * * * ?"`,
  `setup/04-install-rules.sh:33`), `members_openhabstatus.last_seen` je
  Push.
* Board-Dashboard klassifiziert bereits: online < 15 min, "verspaetet"
  < 60 min, offline darueber
  (`website/src/routes/(website)/board/openhab/+page.svelte:37-48`); die
  Mitgliederseite zeigt dasselbe als Badge.

Seit 2026-09-17: Cron `checkSilentPlants` (alle 5 Minuten,
`hooks.server.js` -> `lib/server/mail/notifications/ibmAlerts.js`) mailt
an info@ischlstrom.org, sobald eine Anlage 30 Minuten nichts gemeldet hat -
je Ausfall genau einmal (Spalte `offline_alerted_at`, Django-Migration
`members/0035`), mit dem letzten bekannten Zustand (`hauptschalter`,
`entladung_aktiv`, `ladesperre_aktiv`, SoC, Batterieleistung, letzter
Eingriff des Fail-Safe-Timers) und der Einordnung: Modbus-Profil mit
Hauptschalter EIN = "DRINGEND" mit der Handlungsanweisung fuers Mitglied,
GEN24 = nur nicht erreichbar. Die erste Meldung des Pi danach leert die
Spalte (`pushOpenhabStatus`, `recovered`) und loest die Entwarnung aus.

**Vor dem Deploy:** `python manage.py migrate` in `middleware/eeg/`
(trifft die Produktionsdatenbank), sonst schlaegt jeder Status-Push mit
"column offline_alerted_at does not exist" fehl.

## 8. Testplan Anlage 020 (Ergebnisse hier eintragen)

Werkzeuge: `tools/spike_datamanager.py` (direkt Modbus) und
`tools/spike_openhab.py` (ueber die Items, der Pfad des Adapters). Alles
landet in `spike_datamanager.log`. Entladetests brauchen das Abendfenster
oder wenigstens Ladestand zum Verschenken; die Batterie kann aus dem
Energiesparmodus bis zu 10 Minuten brauchen.

| # | Test | Erwartung | Ergebnis |
| --- | --- | --- | --- |
| 1 | `reads` als Ausgangsbild (`StorCtl_Mod`, `InWRte`, `OutWRte`, `MinRsvPct`, `ChaGriSet`, SoC) | Ruhezustand | offen |
| 2 | `revert` erneut, Read-back +15 | bleibt 65535 | offen |
| 3 | Zwei Zyklen im Log mitlesen | jeder Zyklus beginnt mit "Toggle=ON - Reset (ok=true)" | offen |
| 4 | `failsafe --watts 1000`, dann `systemctl stop openhab` | Entladung laeuft unveraendert weiter; nach openHAB-Start raeumt der naechste Zyklus auf | offen |
| 5 | **Hauptschalter OFF bei stehendem Fenster**, drei Zyklen warten | genau ein Reset im ersten OFF-Zyklus (Log "letzter Reset"), danach "Standby" ohne Writes; `ibm-failsafe --status` zeigt Standby JA; Timer schweigt auch bei `systemctl stop openhab`; nach ON wieder Heartbeat | offen |
| 6 | **"Datenausgabe ueber Modbus" auf aus** bei stehendem Entladefenster, Register lesen | raeumt auch Model 124 - **unbewiesen** | offen |
| 7 | **Power-Cycle** bei stehendem Entladefenster, Register lesen | `StorCtl_Mod` 0, `InWRte`/`OutWRte` 10000 - unbewiesen | offen |
| 8 | **Web-UI Min SoC** knapp unter aktuellen SoC setzen, Entladung per Modbus kommandieren | Entladung stoppt am Min SoC - **der wichtigste Test** | offen |
| 9 | `ChaGriSet` auf 0 (PV) schreiben, Read-back | haelt? danach `MinRsvPct` testweise setzen und P_Grid beobachten | offen |
| 10 | Aufwachlatenz aus dem Standby (Spike-Punkt 10, am 2026-09-12 nicht messbar) | < 10 min | offen |
| 11 | **Fail-Safe-Timer:** `sudo ibm-failsafe --status` zeigt Adresse und frischen Heartbeat; dann `systemctl stop openhab` bei stehendem Entladefenster | Timer setzt binnen 1 min zurueck (`/var/log/ibm-failsafe.log`, Register per `reads`); nach `systemctl start openhab` "Heartbeat zurueck" | offen |
| 12 | **Boot-Reset:** Entladefenster setzen, Pi neu starten | `ibm-failsafe-boot` schreibt Reset vor openHAB (`journalctl -u ibm-failsafe-boot`) | offen |
| 13 | **Heartbeat-Gating:** Modbus-Bridge in der Main UI kurz deaktivieren (Reset scheitert) | kein neuer Heartbeat, Timer greift nach 12 min mit eigener Verbindung | offen |
| 14 | Dashboard/Status-Push: Feld `failsafe` erscheint nach einem Eingriff | ja | offen |
| 15 | Aufraeumen: `spike_datamanager.py <ip> reset` plus Read-back, Min SoC / ChaGriSet auf Ausgangswert | Werksverhalten | offen |

Ausgangswerte von Min SoC und `ChaGriSet` **vor** der Aenderung notieren -
beides sind persistente Geraeteeinstellungen, keine Kommandos.

## 9. Offene Punkte

* [x] L1 (Deadman) mit `inverter_failsafe_reset` und Heartbeat in `core.js` (2026-09-17)
* [x] L2 (Boot-Reset) und openHAB-Restart-Drop-in (2026-09-17)
* [x] Kern-Luecke Hauptschalter OFF geschlossen (2026-09-17)
* [x] Offline-Alarm im Website-Cron mit Entwarnung (2026-09-17) - Migration 0035 vor dem Deploy
* [ ] Paket bauen (`build-dist.sh`), an Anlage 020 einspielen, Testplan Abschnitt 8 abarbeiten, Ergebnisse hier eintragen
* [ ] Danach entscheiden: reicht der geraeteseitige SoC-Boden als Absicherung des toten Pi? Und L3 (`INSTALL_HW_WATCHDOG=1`) einschalten?
* [ ] Reset-Skripte ohne openHAB fuer `sigenergy`, `deye`, `victron` (Kontrakt `inverter_failsafe_reset`)
* [ ] Dashboard: Feld `failsafe` aus dem Status-Push anzeigen (Badge "Fail-Safe hat eingegriffen")
* [ ] Mitglieder-Kurzanleitung "Speichermanagement-Pi tot: was tun" nach `docs/setup/`, erst nach Test 6 und 7
* [ ] Austausch-Checkliste Ersatz-Pi: Modbus wieder auf tcp, "Steuerung einschraenken" auf neue IP
* [ ] Spike-Punkt 9 bei `sigenergy` und Minimum-SoC-Spike bei `victron` nachziehen - dieselbe Frage, anderes Geraet
