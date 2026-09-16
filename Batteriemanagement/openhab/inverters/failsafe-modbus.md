# Fail-Safe bei Modbus-gesteuerten Wechselrichtern

**Stand 2026-09-16. Nichts aus diesem Dokument ist implementiert.** Es haelt
die Befunde einer Analyse-Sitzung fest, damit die Arbeit weitergehen kann,
sobald die Testanlage bereit ist: **Mitglied 020 (pi-020, Fronius Symo
Hybrid 5.0-3-S mit Datamanager 2.0, Anlage Pfandl)**, Vor-Ort-Termin in den
Tagen nach dem 2026-09-16.

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

## 4. Geplante Schichten

### L1 - Deadman-Timer am Pi (der eigentliche Fix)

Root-Timer, jede Minute, vollstaendig unabhaengig von Java und openHAB:

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

**Profilschnittstelle (neu):** Der Deadman kann den openHAB-Adapter nicht
aufrufen. Jedes Modbus-Profil braucht deshalb ein eigenstaendiges
Reset-Skript ohne openHAB, sinnvollerweise als neue Variable in
`profile.sh` (z. B. `INVERTER_FAILSAFE_RESET`). Fuer
`fronius-snapinverter` existiert es faktisch schon: `step_reset` aus
`tools/spike_datamanager.py` (nur Standardbibliothek, am Geraet erprobt).
Fuer `sigenergy` (`Remote EMS enable = 0`), `deye` und `victron` ist es
noch zu schreiben; das GEN24-Profil braucht keins.

### L2 - Reset bei jedem Boot

`oneshot`-Unit mit `Before=openhab.service`, gleicher Reset-Write. Rund
20 Zeilen, braucht keinen Heartbeat, deckt alle Reboot-Faelle ab
einschliesslich "openHAB startet gar nicht mehr". Lohnt sich auch allein.

### L3 - Hardware-Watchdog

`bcm2835_wdt` plus `RuntimeWatchdogSec` in `/etc/systemd/system.conf`,
dazu `Restart=on-failure` fuer `openhab.service`. Macht aus dem heute
unabgedeckten "Pi eingefroren" ein "Pi rebootet und L2 setzt zurueck".

### L4 - Serverseitiger Alarm (kein Reset)

Siehe Abschnitt 7. s1 kann nicht eingreifen: der WireGuard-Peer ist
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

## 6. Luecke im Kern: Hauptschalter OFF setzt nicht zurueck

`control/core.js:1815-1823` - steht `Schalte_ISCHLSTROM_Empfehlung_einaus`
auf OFF, loggt die Regel und kehrt zurueck, **bevor** der Reset laeuft; und
`ibmReset()` wird ausschliesslich von der Batterie-Cron-Regel aufgerufen
(`setup/04-install-rules.sh:199-233`). Beim GEN24 ist das harmlos, weil der
Schedule ablaeuft. Bei allen vier Modbus-Profilen bleibt das zuletzt
kommandierte Fenster **dauerhaft** stehen, wenn das Mitglied mitten im
Entladefenster abschaltet.

Die Pause (`IBM_PAUSE_TAGE`) ist dagegen sauber: sie kehrt erst **nach**
dem Reset zurueck.

Kandidaten fuer den Fix: im OFF-Zweig einmal `ibmReset()` aufrufen und dann
zurueckkehren (einfachste Variante, kostet einen Modbus-Write je Zyklus),
oder eine eigene Regel auf den OFF-Uebergang. Am Testtag zuerst
reproduzieren.

## 7. Serverseite: bemerken statt eingreifen

Vorhanden:

* Status-Push jede Minute (`CRON_STATUS = "0 * * * * ?"`,
  `setup/04-install-rules.sh:33`), `members_openhabstatus.last_seen` je
  Push.
* Board-Dashboard klassifiziert bereits: online < 15 min, "verspaetet"
  < 60 min, offline darueber
  (`website/src/routes/(website)/board/openhab/+page.svelte:37-48`); die
  Mitgliederseite zeigt dasselbe als Badge.

Fehlt: **es sagt niemand Bescheid** - in `website/src/lib/server/mail/`
gibt es keinen Alarm fuer stille Anlagen. Vorschlag: ein Cron-Job in
`cronHandle` (`hooks.server.js`), der dem Vorstand ab ~30 Minuten Stille
mailt, und zwar mit dem letzten bekannten Zustand: der Push traegt
`hauptschalter`, `ladesperre_aktiv` und `entladung_aktiv`
(`eeg-api/status_push.js:233-235`). Wichtig fuer die Dringlichkeit: eine
stille Anlage ist nur gefaehrlich, wenn ein Kommando stand. Mittags ohne
Fenster ist es ein Servicefall, im Entladefenster ein Vorfall.

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
| 5 | **Hauptschalter OFF bei stehendem Fenster**, zwei Zyklen warten | (Abschnitt 6) Fenster bleibt stehen - Luecke reproduzieren | offen |
| 6 | **"Datenausgabe ueber Modbus" auf aus** bei stehendem Entladefenster, Register lesen | raeumt auch Model 124 - **unbewiesen** | offen |
| 7 | **Power-Cycle** bei stehendem Entladefenster, Register lesen | `StorCtl_Mod` 0, `InWRte`/`OutWRte` 10000 - unbewiesen | offen |
| 8 | **Web-UI Min SoC** knapp unter aktuellen SoC setzen, Entladung per Modbus kommandieren | Entladung stoppt am Min SoC - **der wichtigste Test** | offen |
| 9 | `ChaGriSet` auf 0 (PV) schreiben, Read-back | haelt? danach `MinRsvPct` testweise setzen und P_Grid beobachten | offen |
| 10 | Aufwachlatenz aus dem Standby (Spike-Punkt 10, am 2026-09-12 nicht messbar) | < 10 min | offen |
| 11 | Aufraeumen: `spike_datamanager.py <ip> reset` plus Read-back, Min SoC / ChaGriSet auf Ausgangswert | Werksverhalten | offen |

Ausgangswerte von Min SoC und `ChaGriSet` **vor** der Aenderung notieren -
beides sind persistente Geraeteeinstellungen, keine Kommandos.

## 9. Offene Punkte

* [ ] Testplan Abschnitt 8 an Anlage 020 abarbeiten, Ergebnisse hier eintragen
* [ ] Danach entscheiden: reicht der geraeteseitige SoC-Boden als Absicherung des toten Pi?
* [ ] L2 (Boot-Reset) und L3 (Hardware-Watchdog) umsetzen - klein, profilunabhaengig
* [ ] L1 (Deadman) umsetzen, inklusive `INVERTER_FAILSAFE_RESET` je Profil; Heartbeat in `core.js`
* [ ] Reset-Skripte ohne openHAB fuer `sigenergy`, `deye`, `victron`
* [ ] Kern-Luecke Hauptschalter OFF schliessen (Abschnitt 6)
* [ ] Offline-Alarm im Website-Cron (Abschnitt 7)
* [ ] Mitglieder-Kurzanleitung "Speichermanagement-Pi tot: was tun" nach `docs/setup/`, erst nach Test 6 und 7
* [ ] Austausch-Checkliste Ersatz-Pi: Modbus wieder auf tcp, "Steuerung einschraenken" auf neue IP
* [ ] Spike-Punkt 9 bei `sigenergy` und Minimum-SoC-Spike bei `victron` nachziehen - dieselbe Frage, anderes Geraet
