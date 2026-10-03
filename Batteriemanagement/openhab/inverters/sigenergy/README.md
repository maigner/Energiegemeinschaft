# Sigenergy SigenStor (Modbus)

Profil fuer Sigenergy-SigenStor-Anlagen (modularer Hybrid-Wechselrichter mit
Batteriestack). Gesteuert wird ueber **Modbus TCP** und den **Remote
EMS**-Modus des Sigenergy-Modbus-Protokolls - eine proprietaere
Registerkarte auf Anlagenebene (Slave-Adresse 247), kein SunSpec:

| IBM-Aktion | Umsetzung |
| --- | --- |
| Reset (Werksverhalten) | `Remote EMS enable (40029) = 0` - die Anlage folgt wieder ihrem konfigurierten EMS-Modus |
| Ladesperre | Modus 5 (Entladung, PV zuerst) + `ESS max discharging limit (40034) = 0` |
| Laderegelung | KEIN `ibmLimitCharge` - die Command-Charging-Modi koennten aus dem Netz laden und das Ladelimit-Register ist nicht verifiziert (Spike-Punkt); der Kern nutzt die PWM ueber die Ladesperre |
| Forcierte Entladung | Modus 6 (Entladung, Batterie zuerst) + Entladelimit in Watt |
| Fail-Safe | KEIN geraeteseitiges Auto-Revert (Spike-Punkt 9 am 2026-10-02 bestaetigt); root-Timer `ibm-failsafe` und Boot-Reset ueber `inverter_failsafe_reset` -> `tools/failsafe_reset.py`, am Geraet getestet - siehe Fail-Safe-Analyse |

Besonderheiten gegenueber den SunSpec-Profilen:

- Leistungslimits werden **direkt in Watt** geschrieben (Registerwert = W,
  da Gain 1000 auf kW) - `appliedW` ist exakt, keine Prozent-Quantisierung.
- Alle Reads laufen ueber **FC04** (Input-Register), auch fuer die
  beschreibbaren Halteregister; geschrieben wird mit FC06/FC16. Die Poller
  des Profils stehen deshalb auf `type: input`.
- Sigenergy adressiert **literal**: Registeradresse 30014 heisst Adresse
  30014 im Request (kein 30001er-Offset).
- Das **PV-Limit (40036) wirkt in allen Kommando-Modi 3 bis 6**. Der
  Adapter setzt es vor jedem Steuerbefehl auf das Anlagenmaximum (30010),
  damit ein Altwert im Register die PV-Erzeugung nicht begrenzt.

Quelle der Registerkarte: Sigenergy Modbus Protocol V1.7 (2024-04-09);
aktuell ist V2.x - Abweichungen im Spike pruefen.

## Voraussetzungen an der Anlage

In der mySigen-App (teils nur mit Installateur-Zugang; Fundstellen in den
Handbuechern siehe [Handbuecher](#handbuecher-docs)):

1. **"ModBus TCP Server Enable"** aktivieren - Port 502 (Installer-Manual
   v03 Kap. 2.4.1.4, S. 70). Nach dem Setzen **speichern**; die
   Home-Assistant-Community rät bei geschlossenem Port zu aus/speichern/
   ein/speichern.
2. **Remote-EMS-Freigabe**: Im Installer-Manual v02 (2024-04) war das ein
   eigener Schalter "Remote EMS Scheduling Enable" (Kap. 2.3.1.5 Nr. 9);
   in v03 (2024-10) gibt es diesen Schalter nicht mehr, dort ist "Remote
   EMS Mode" eine der Energiespeicher-Betriebsarten (Kap. 2.3.1.1, S. 33)
   und die Endkunden-App warnt, den Modus nur mit Rueckfrage beim
   Installateur zu betreten oder zu verlassen (User-Manual v05 Kap. 3.1.4.5,
   S. 28). Per Modbus schaltet IBM selbst mit Register 40029 in den
   Remote-EMS-Modus und wieder heraus; die App-Betriebsart soll auf
   Eigenverbrauch bleiben (im Fern-EMS-Modus ohne Master wartet die Anlage
   sonst auf Kommandos, siehe Spike-Protokoll 2026-08-25). Im Spike
   pruefen, ob Writes auf 40029 mit Betriebsart Eigenverbrauch angenommen
   werden (Erwartung laut Community: ja, dort ist nur Modbus TCP
   Voraussetzung).

Die Steuerung laeuft auf **Anlagenebene** (Slave 247): bei Anlagen mit
mehreren SigenStor-Tuermen wird der gesamte Verbund kommandiert, nicht ein
einzelner Wechselrichter.

## Spike: Registerkarte am Geraet verifizieren (VOR der ersten Installation)

Die Adressen in `profile.sh` und die Konstanten in `adapter.js` folgen dem
offiziellen Sigenergy-Modbus-Protokoll (V1.7), sind aber noch **nicht am
Geraet verifiziert**. Desk-Check gegen Protokoll V2.5 (2025-02-19):
Registerkarte, Modi (Appendix 6), Vorzeichen (30037: > 0 laden) und
Zugriffsarten (RO = FC04, RW = FC04/06/16) unveraendert; der Abschnitt
"Interaction timeout" beschreibt weiterhin nur Request-Timing (min. 1 s
Abstand), kein Auto-Revert.

Werkzeug: `tools/spike_sigenstor.py` arbeitet die Punkte 2-9 direkt gegen
die Anlage ab (nur Standardbibliothek, laeuft am Laptop wie am Pi) -
read-only per `reads`/`watch`, steuernd per `toggle`/`prevent`/`discharge`/
`failsafe` (mit Bestaetigung, Sicherheits-Reset bei Ctrl+C), Aufraeumen per
`reset`; alles landet in `spike_sigenstor.log`. Zum Testen ohne Anlage
siehe `tools/sim_sigenstor.py`:

    python3 tools/sim_sigenstor.py --port 5020 &
    python3 tools/spike_sigenstor.py 127.0.0.1 --port 5020 --yes reads toggle

Checkliste (Ergebnis in die Tabelle unten eintragen, danach `profile.sh`/
`adapter.js` anpassen):

1. mySigen-App: beide Schalter (Modbus TCP, Remote EMS Scheduling)
   aktivieren; Firmwarestand und Protokollversion der Anlage dokumentieren.
2. Reads an Slave 247 verifizieren: `EMS work mode` (30003), `Plant ESS
   SoC` (30014, Erwartung: Wert = % * 10, gegen die App-Anzeige pruefen ->
   `MODBUS_SOC_GAIN`), `ESS power` (30037, Vorzeichen: > 0 = laden ->
   `MODBUS_ESS_POWER_GAIN`), Nennleistungen (30068/30070).
3. U32-Wortreihenfolge pruefen (Erwartung: Big Endian, High-Word zuerst -
   sonst `uint32`/`int32` im Thing-Manifest gegen die `_swap`-Varianten
   tauschen).
4. Remote EMS einschalten (`40029 = 1`) und pruefen, dass `EMS work mode`
   (30003) auf 7 springt; wieder ausschalten, Modus faellt zurueck.
5. Modus-Wertetabelle (Appendix 6) bestaetigen: 3/4 = kommandiertes Laden,
   5/6 = kommandierte Entladung -> `SIGEN_MODE_*` in `adapter.js`.
6. Ladesperre testen: Modus 5 + Entladelimit 0. Pruefen: Batterie laedt
   NICHT (auch bei PV-Ueberschuss), Batterie entlaedt nicht, PV versorgt
   Haushalt und Netz normal weiter. Falls PV dabei einbricht oder die
   Anlage den Zustand nicht annimmt: Alternative Modus 1 (Standby) testen
   und `SIGEN_MODE_PREVENT_CHARGE` anpassen.
7. **PV-Limit (40036)**: Default-Wert nach Werksreset lesen; Verhalten
   pruefen, wenn es beim Eintritt in einen Kommando-Modus 0 oder klein ist.
   Bestaetigen, dass das Setzen auf das Anlagenmaximum (30010) die
   PV-Erzeugung freigibt.
8. Forcierte Entladung testen: Modus 6 + Entladelimit x W; AC-Leistung
   gegen die App/einen Zaehler messen (Erwartung: Registerwert = W).
   Verhalten bei Limit > Nennleistung dokumentieren (Fehlercode oder
   stilles Klemmen?).
9. **Fail-Safe (Go/No-Go)**: Remote EMS mit aktiver Entladung stehen
   lassen und den Modbus-Master trennen (openHAB stoppen). Faellt die
   Anlage nach einem Timeout von selbst in den Normalbetrieb zurueck?
   Ergebnis -> `SIGEN_HAS_AUTO_REVERT` in `adapter.js` (nur Doku) und
   Abschnitt Fail-Safe-Analyse unten. Auch klaeren: beschreibt die
   aktuelle Protokollversion (V2.x, "interaction timeout") ein solches
   Verhalten?
10. Dauerverhalten: bleibt der kommandierte Zustand ueber Stunden stehen
    oder muss er zyklisch erneuert werden? (IBM kommandiert ohnehin alle
    5 Minuten neu.)

### Spike-Protokoll 2026-08-25 (Mitglied 223, EC 10.0, abgebrochen)

Erster Anlauf vor Ort, Anlage im WLAN (192.168.7.107). Ergebnis: **Port 502
blieb geschlossen** (connection refused, kein einziger offener TCP-Port),
obwohl in der mySigen-App "ModBus TCP Server aktivieren" gesetzt, der
Betriebsmodus auf Fern-EMS gestellt und die Anlage per App neu gestartet
wurde. Gelernt dabei:

- App-"Neustart"/"Ausschalten" betrifft nur den Leistungsteil - das
  Kommunikationsmodul (und damit der Modbus-Server) startet dabei NICHT
  neu; die IP der Anlage bleibt durchgehend online.
- Community-Befunde (Home-Assistant-Integrationen): gleiches Muster ueber
  WLAN mehrfach berichtet und dort nie geloest - funktionierende Setups
  laufen ueber den Ethernet-Port; teils musste der Installateur/der
  Sigenergy-Support Modbus TCP aus der Ferne freischalten.
- mySigen-Pfade (Endkunden-App): Modbus unter Geraet -> Einstellungen ->
  ModBus-Parameter; Betriebsmodus (inkl. Fern-EMS) am Home-Screen unter
  "Modus". "Remote EMS Scheduling Enable" war in der Endkunden-App nicht
  sichtbar (Installer-Manual v02 Kap. 2.3.1.5; in v03 durch die Betriebsart
  "Remote EMS Mode" ersetzt, siehe Voraussetzungen oben).

Nach dem Abbruch wurde der Betriebsmodus in der App wieder auf
Eigenverbrauch zurueckgesetzt (im Fern-EMS-Modus ohne Master wuerde die
Anlage sonst auf Kommandos warten). Wichtig fuer den naechsten Anlauf:
sobald Port 502 offen ist, findet der Pi die Anlage beim naechsten
10-Minuten-Lauf und beginnt mit der unverifizierten Registerkarte zu
schreiben. Deshalb steht auf pi-223 der Hauptschalter
`Schalte_ISCHLSTROM_Empfehlung_einaus` seit 2026-08-25 auf OFF: der Kern
bricht dann vor dem zyklischen Reset ab (`control/core.js`, "Toggle=OFF -
Tue nichts"), der Adapter schreibt nichts, das Bridge-Thing pollt nur
(FC04). Die Init-Regel setzt den Schalter nur bei NULL/UNDEF auf ON, mapdb
haelt den Zustand ueber Neustarts.

Ablauf, sobald der Elektriker Modbus TCP freigeschaltet hat:

1. Am Dashboard pruefen, dass `hauptschalter` im Status-Push noch OFF ist.
2. Pi laufen lassen - `02b` findet die Anlage von selbst, das Thing geht
   ONLINE, die Reads laufen bereits.
3. Spike ueber den Pi fahren (`tools/spike_sigenstor.py`, per WireGuard
   von s1 aus; Punkte 2 bis 10 der Checkliste), Registertabelle und
   `SIGEN_HAS_AUTO_REVERT` befuellen, `profile.sh`/`adapter.js` anpassen
   und auf den Pi bringen.
4. Erst danach den Hauptschalter in der Main UI auf ON.

Naechste Schritte: Elektriker/Installateur wegen Modbus-TCP-Freigabe
kontaktieren (dabei Firmware-Stand erfragen); LAN-Kabel an den Energy
Controller als Alternative zum WLAN. Werkzeug fuer den naechsten Anlauf:
`tools/spike_sigenstor.py <ip> reads` (siehe oben).

### Nachtrag 2026-09-08 (Fernpruefung nach Elektriker-Einstellungen)

Der Elektriker hat am Wechselrichter gesetzt: `Modbus TCP Server Enable`,
`Modbus Native (Slave) Address = 1` (Adresse des einzelnen Wechselrichters,
fuer IBM unerheblich - die Anlagenebene bleibt 247) und `RS485-1 Port Mode =
Modbus RTU Host` (nur fuer RS485 relevant, so lassen). "Remote EMS
Scheduling Enable" war nicht dabei und ist weiterhin offen.

Fernpruefung vom Pi aus (SSH per WireGuard, Passwort-Anmeldung; `nmap` ist
auf dem Pi installiert): **Port 502 ist in keinem der beiden Netze des Pi
offen** (Ping-Sweep plus Port-502-Sweep aller 254 Adressen):

- `192.168.7.0/24` (eth0, Mesh-Router "thm1200.mesh", Skyworth, DHCP
  .254): .100 = Tuya-Geraet (nur Port 6668), .101/.254 = Mesh-Router,
  .103 = Pi, **.107 = MAC-Hersteller Samsung Electronics, online, alle
  TCP-Ports 1-10000 aktiv abgewiesen** (dieselbe Signatur wie die Anlage am
  2026-08-25 unter derselben IP; ob es wirklich noch die Anlage ist oder
  inzwischen ein Handy, liess sich von aussen nicht klaeren).
- `192.168.1.0/24` (wlan0 `ibm-wlan`, LTE-Router Alcatel HH72VM, .1):
  .101/.105 = Espressif-Geraete (Port 80), .104 = TP-Link ("SHIP 2.0",
  Port 80). Kein Port 502.

Der Pi meldet weiter `[IBM][Watchdog] FEHLER: Thing nicht gefunden:
modbus:tcp:ibm`, Status-Push `soc: null`, Hauptschalter OFF.

Community-Befunde zu genau diesem Muster (TypQxQ/Sigenergy-Local-Modbus
Discussion #86, Sigenergy-Home-Assistant-Integration Discussion #74,
Whirlpool-Forum): Modbus TCP **deaktivieren, speichern, wieder aktivieren,
speichern** hat den Server bei mehreren Nutzern erst tatsaechlich
gestartet (geht auch aus der Ferne durch den Installateur); und die Anlage
soll nur **eine** Netzverbindung haben (LAN oder WLAN), bei beiden taucht
sie mit zwei IPs auf und 502 ist teils nur auf einer davon offen - es
gibt Berichte in beide Richtungen, LAN-Kabel ist also keine Garantie.

**Naechster Anlauf vor Ort gemeinsam mit dem Elektriker:**

1. In der Installer-App IP/MAC des Energy Controllers ablesen (Netzwerk)
   -> klaert, ob .107 die Anlage ist.
2. Modbus TCP aus/speichern/ein/speichern; nur eine Netzverbindung.
3. Remote-EMS-Freigabe klaeren (je nach App-Version Schalter oder nur
   noch Betriebsart, siehe Voraussetzungen), Betriebsmodus auf
   Eigenverbrauch lassen; Firmwarestand notieren.
4. Vom Pi pruefen: `sudo nmap -p 502 192.168.7.0/24 192.168.1.0/24`;
   sobald 502 offen ist, `tools/spike_sigenstor.py <ip> reads` und dann
   den Ablauf oben (Hauptschalter bleibt bis nach dem Spike OFF).

### Spike-Protokoll 2026-10-02 (Mitglied 223, EC 10.0, bestanden)

Dritter Anlauf, erst vor Ort, dann von zuhause ueber den Pi (`ssh pi-223`
per s1-Jump, Pi-Hop mit Passwort). Ergebnis: **Registerkarte verifiziert,
Steuerung verifiziert, Fail-Safe-Kette am Geraet bewiesen**, eine Luecke
gefunden und geschlossen.

**Warum die Anlage wochenlang "unsichtbar" war:** nicht das Netz. Auf dem
Pi existierte der Modbus-Thing-Baum gar nicht - Installer-Schritt 02b war
im August nie durchgelaufen (die Items aus 03 schon). openHAB hat die
Anlage also nie gepollt, und `ibm_rediscover.sh` meldete folgerichtig
"Thing nicht gefunden: modbus:tcp:ibm" - es gab nichts zu aktualisieren.
`sudo /opt/ischlstrom/openhab/setup/02b-install-things.sh` legte den Baum
an, `modbus:data:ibm:sg:soc` ging sofort ONLINE. Nebenbefund Netz: das
WLAN des Wechselrichters (`HH72VM_4DDE_2.4G`) und der Alcatel-LTE-Router
nutzen beide 192.168.1.0/24 mit Gateway .1 - zwei Netze, gleiche Nummern;
der Pi erreichte .107:502 ueber wlan0 die ganze Zeit, AP-Isolation war
nie das Problem. Lehre: bei "Thing nicht gefunden" zuerst pruefen, ob die
Things existieren, bevor man Konnektivitaet jagt.

**Ablauf und Befunde** (Hauptschalter OFF, `tools/spike_sigenstor.py
192.168.1.107 --yes <schritt>`, openHAB lief und pollte mit):

| Schritt | Befund |
| --- | --- |
| `reads` | alle Register plausibel (Registertabelle oben); die Anlage erlaubt **gleichzeitige** Modbus-Verbindungen |
| `toggle` | 40029=1 -> EMS-Modus 7, 40029=0 -> Modus 0; Schreibpfad OK. Voraussetzung: "Remote EMS Scheduling Enable" in der App EIN (vorher las 40029 dauerhaft 0) |
| `prevent` | Modus 5 + Entladelimit 0: ESS 0 W ueber 30 s, dann Reset OK |
| `discharge --watts 2000` | Modus 6: ESS -2000 W (Vorzeichen und Betrag korrekt), dann Reset OK |
| `failsafe` (Punkt 9) | **kein Auto-Revert**: Entladung stand ~85 s unveraendert (Modus 7, -2000 W), bis `reset` sie raeumte -> `SIGEN_HAS_AUTO_REVERT = false` bestaetigt, der Timer ist Pflicht |

**Fail-Safe am Geraet** (Details in `../failsafe-modbus.md`, Abschnitt 8b):
Das Profil hatte noch kein `inverter_failsafe_reset` - Schritt 10 haette
den Timer deshalb entfernt statt installiert. `tools/failsafe_reset.py`
(schreibt 40029=0 mit Read-back, Guard gegen das falsche Geraet) plus die
Profilfunktion schliessen das; nach dem Paket-Update installierte
`install-ibm.sh` den Timer von selbst. Zeile 11 (openHAB-Stop): Reset nach
~47 s. Zeile 12 (Reboot): Boot-Reset vor openHAB. Zeile 13 (Bridge
deaktiviert, openHAB laeuft): **Luecke** - der Heartbeat lief weiter, weil
`ibmReset()` bei toter Bridge trotzdem ok=true meldete (`sendCommand`
wirft nicht). Seit 2026-10-02 prueft der Adapter vor jedem Write die
Zustellbarkeit (`__ibmSgDeliverable`: das Wechselrichter-Thing
`@IBM_THING_UID@`, hier `modbus:data:ibm:sg:soc`, muss ONLINE sein) - am
selben Abend am Geraet bestaetigt: Kern "Reset (ok=false)" / "kein
Heartbeat", Heartbeat eingefroren, Timer-Reset 22:23:06 "Heartbeat 13 min
alt" bei deaktivierter Bridge.

Firmwarestand in der App noch nicht abgelesen (TODO). Hauptschalter steht
seit dem Test auf ON, die Anlage laeuft unter IBM.

### Ausfall 2026-10-03 (Mitglied 223: IP-Wechsel, Watchdog blind)

Um 17:01 gingen Poller und alle Daten-Things auf OFFLINE ("No route to
host" an 192.168.1.107), das Dashboard zeigte die Anlage als offline, der
Kern lieferte keinen Heartbeat mehr, und `ibm-failsafe` versuchte ab 17:12
minuetlich vergeblich einen Reset an die alte Adresse (Anlage lief dabei
unbeeinflusst im Eigenverbrauch: 40029 = 0, EMS-Modus 0, SoC 89 %).

Befund vom Pi aus (`ip neigh`, Scan der 192.168.1.0/24 auf Port 502): die
Anlage antwortet jetzt unter **192.168.1.101** (`spike_sigenstor.py
192.168.1.101 reads` bestanden). Dieselbe WLAN-MAC 3e:64:cf:0a:4e:85
beantwortet ARP auch fuer .108 und .112 (dort Port 502 abgewiesen) - der
SigenStor-Gateway haengt offenbar mehrere interne Geraete hinter einer
WLAN-MAC, der Alcatel-Router vergibt per DHCP mehrere Adressen, und der
Modbus-Server ist beim Lease-Wechsel von .107 auf .101 gewandert. Eine
DHCP-Reservierung nach MAC hilft darum nicht; **statische IP in der
mySigen-App** (Netzwerkeinstellungen des Wechselrichters) ist der saubere
Weg, bis dahin faengt die Netzwerksuche den Wechsel ab.

Warum die Netzwerksuche 3,5 Stunden nicht ansprang: `rediscover.sh` las
den Status an der Modbus-tcp-Bridge `modbus:tcp:ibm` ab - und die bleibt
ONLINE, solange sie konfiguriert ist, nur Poller und Daten-Things gehen
OFFLINE (dasselbe Bild wie pi-020 am 2026-09-11, dort aber nur im
Fronius-Skript behoben). Der Watchdog wurde zwar ausgeloest (Trigger auf
`modbus:data:ibm:sg:soc` OFFLINE plus alle 15 Minuten), das Skript sah aber
"ONLINE" und beendete sich still. Behoben am 2026-10-03 fuer `sigenergy`,
`deye` und `victron`: Status am Wechselrichter-Thing
(`@IBM_WATCH_THING_UID@`), Adresse weiterhin aus der Bridge, Pruefung nach
dem Update ebenfalls am Daten-Thing. Gegen eine REST-Attrappe getestet
(Bridge ONLINE + Daten-Thing OFFLINE -> Suche; beide ONLINE -> still;
Token abgelehnt / REST weg -> Meldung, Exit 1).

Zweiter Befund beim Einspielen dieses Fixes (21:07): die Suche lief jetzt
an, durchsuchte aber nur **192.168.7.0/24** - das Netz der ersten
Schnittstelle (eth0, Mesh). Der Pi haengt mit wlan0 zusaetzlich im
192.168.1.0/24 des Wechselrichters, und genau dort stand die Anlage. Alle
vier `rediscover.sh` nehmen seither jedes direkt angeschlossene IPv4-Netz
des Pi (je ein /24; Tunnel wg*/tun*/tailscale* und Host-Adressen
ausgenommen) und suchen in allen; aus demselben Grund half auch
`ibm_rediscover.sh --force` mit dem alten Skript nicht. `ibm-failsafe`
liest die Adresse bei jedem Lauf aus der Bridge und folgt einer Korrektur
automatisch. Manuelle Korrektur, falls noetig (als openhab, Token liegt in
`/var/lib/openhab/ibm/api_token`): `PUT /rest/things/modbus:tcp:ibm/config`
mit `{"host": "192.168.1.101"}`, oder in der openHAB-UI am Bridge-Thing.

**Verlauf der Wiederherstellung (ohne Handeingriff):** Paket mit beiden
Fixes 21:29 installiert; der erste Lauf im Installer traf noch die
10-min-Abkuehlzeit der Suche von 21:22. Cron-Lauf 21:37: "Suche SigenStor in
192.168.7.0/24 192.168.1.0/24", "Neue Adresse gefunden: 192.168.1.107 ->
192.168.1.101", Bridge aktualisiert, alle Daten-Things 21:37:09 ONLINE,
Werte wieder live (SoC 83,9 %, Netz +3,8 kW, PV 0). Kern 21:40 "Reset
(ok=true)" -> Heartbeat frisch -> `ibm-failsafe` 21:41 "Heartbeat zurueck -
wieder in Bereitschaft". Hausvorrang griff sofort (Netzbezug 3,9 kW im
Entladefenster -> kein Entladebefehl) - der neue Netz-Wert wirkt also.

**Zwei Nebenbefunde beim Wiederanlauf, beide offen:**

1. **Fremder Schreiber auf 40029.** Um 21:37:40 und 21:40:52 sprang Remote
   EMS enable jeweils ~40-50 s nach einem Reset (Timer bzw. Kern) von 0 auf
   1, EMS-Modus auf 7 - ohne openHAB-Kommando (`events.log`: kein
   ItemCommandEvent; keine Regel am Pi schreibt am Item vorbei). Nach dem
   Kern-Reset 21:45 blieb es bei 0, nachmittags (14:55-17:00, Reset alle
   5 min) und waehrend des Ausfalls (20:44 gelesen) ebenfalls - also
   sporadisch, nicht periodisch. Verdacht: die mySigen-App/Cloud setzt den
   Schalter "Remote EMS Scheduling Enable" bei Sync erneut, oder jemand war
   in der App. Folge fuer uns: ein Re-Enable laesst die Anlage mit dem
   **zuletzt geschriebenen** Modus/Limit (hier 40031 = 5, 40034 = 1000 W)
   weiterlaufen, ohne dass der Kern etwas davon will. Der Reset (Timer und
   `ibmReset`) schreibt nur 40029 = 0; er sollte zusaetzlich Modus und
   Limits neutral stellen (40031 = 2 Maximum self-consumption oder 0,
   40032/40034 = 0xFFFFFFFF), damit ein fremdes Enable harmlos bleibt -
   Entscheidung + Geraetetest noetig.
2. **Konstante Entladung ~1000 W unabhaengig vom Remote EMS.** Mit
   40029 = 0 / EMS-Modus 0 entlaedt der Speicher 1002 W, waehrend das Haus
   3,9 kW aus dem Netz bezieht (21:45-21:48); am 2026-10-02 22:42 ebenso
   1002 W bei 422 W Ueberschuss ins Netz. Das ist kein Eigenverbrauchs-
   verhalten (da waere die Entladung = Hauslast). Vermutlich eine
   anlagenseitige Einstellung (App: TOU/Entladeleistung) - mit dem
   Mitglied klaeren. Die 3,9 kW Nachtlast selbst (E-Auto?) sind
   Hausvorrang-relevant, nicht unser Problem.

### Handbuecher (`docs/`)

Alle drei PDFs stammen von sigenergy.com (Stand 2026-09-08; die
`en_download`-Links liefern nur mit Browser-User-Agent ein PDF):

- `docs/mysigen-app-installer-manual-v03-2024-10-09.pdf` (99 S.)
- `docs/mysigen-app-user-manual-v05-2025-03-10.pdf` (87 S., Endkunden-App)
- `docs/sigenergy-modbus-protocol-v2.5.pdf` (34 S.)

Fundstellen fuer den Termin mit dem Elektriker (Installer-Manual v03,
Seitenzahlen des PDF):

| Thema | Fundstelle |
| --- | --- |
| ModBus-Parameter: Server Address/Port (nur als TCP-Client relevant), **ModBus Local (Slave) Address** (= "Modbus Native Address", im Parallelbetrieb je Geraet verschieden), **ModBus TCP Server Enable** | Kap. 2.4.1.4, S. 70 (Geraet -> Einstellungen) |
| RS485-1: nur die Baudrate ist dokumentiert; ein "Port Mode" (RTU Host/Slave) steht in keinem der Handbuecher, das ist eine neuere Firmware-Option. Fuer Modbus TCP irrelevant | Kap. 2.4.1.5, S. 71 |
| Betriebsart "Remote EMS Mode" (RS485-1 oder Modbus TCP, Verweis auf 2.4.1.4) | Kap. 2.3.1.1, S. 33 |
| Netzwerk der Anlage: "Connectivity" mit Ethernet/WLAN/4G-Status, Ethernet per DHCP, statische IP nur ueber den Umweg WLAN-zuerst (Schritte 1-4) | Kap. 2.3.1.5, S. 42-43 (Anlage) und Kap. 2.4.1.1, S. 68 (Geraet) |
| WLAN abschalten, wenn per Kabel angebunden (Trick: ungueltiges WLAN-Passwort eintragen) | FAQ 5.5, S. 97 |
| Netzwerk neu konfigurieren ueber den Geraete-Hotspot | FAQ 5.8, S. 99 |
| Modbus-TCP-Schnittstelle: TCP-Server, Port 502, ein Geraet je Anlage genuegt | Protokoll v2.5 Kap. 3.2, S. 3-4; Anlagenadresse 247: Kap. 4.1, S. 5 |
| Interaction timeout: nur Request-Timing (min. 1 s), kein Auto-Revert | Protokoll v2.5 Kap. 4.2, S. 6 |
| Remote-EMS-Modi | Protokoll v2.5 Appendix 6, S. 31 |

Der Endkunde sieht in der User-App v05 nur die Betriebsart (Kap. 3.1.4.5,
S. 28) und den Connectivity-Status (S. 35); die ModBus-Parameter und die
Slave-Adresse sind im User-Manual nicht beschrieben, also Installateur-Sache.

### Registertabelle (verifiziert 2026-10-02, Mitglied 223, EC 10.0)

Alle Werte per FC04 an Slave 247, literal adressiert, U32 Big Endian
(beide Wortreihenfolgen geprueft, Swap unplausibel).

| Register | Adresse | Typ | Gain | Gelesen/verifiziert |
| --- | --- | --- | --- | --- |
| EMS work mode | 30003 | uint16 | - | 0 in Ruhe, **7** bei Remote EMS (toggle: 40029=1 -> 7, =0 -> 0) |
| Grid sensor active power | 30005 | int32 | 1000 (kW -> W) | **-422 W** am 2026-10-02 22:42 bei 422 W Ueberschuss ins Netz (Batterie -1002 W, Anlage 854 W AC, Haus ~432 W) -> **< 0 = Einspeisung, > 0 = Bezug** = IBM-Konvention, Gain 1. 30004 = Sensorstatus (1) |
| Max active power | 30010 | uint32 | 1000 (kW -> W) | 11000 W |
| Plant ESS SoC | 30014 | uint16 | 10 (-> % * 10) | raw 1000 = 100,0 % (Gain 10 bestaetigt, App/openHAB zeigten 99,6-100 %) |
| Plant PV power | 30035 | int32 (nie negativ) | 1000 (kW -> W) | 0 W (22:42, Nacht); Lage zwischen Anlagen-Blindleistung 30033 und ESS power 30037 wie im Protokoll - Tageswert nach dem Deploy am Dashboard pruefen |
| ESS power | 30037 | int32 | 1000 (kW -> W) | 0 W in Ruhe; **-2000 W** bei 2000-W-Entladung (< 0 = entladen, wie im Protokoll) |
| Rated ESS charging power | 30068 | uint32 | 1000 | 5800 W |
| Rated ESS discharging power | 30070 | uint32 | 1000 | 6400 W (Plausibilitaetsfenster 100..1000000 OK) |
| Remote EMS enable | 40029 | uint16 | - | 0; schreibbar per FC06, Wirkung sofort (Modus 7); liest dauerhaft 0, solange "Remote EMS Scheduling Enable" in der App AUS ist |
| Remote EMS control mode | 40031 | uint16 | - | 0; Modus 5 (Ladesperre) und 6 (Entladung) verifiziert |
| ESS max charging limit | 40032 | uint32 | 1000 | Default 0xFFFFFFFF (gelesen, nicht geschrieben) |
| ESS max discharging limit | 40034 | uint32 | 1000 | Default 0xFFFFFFFF; 0 (Sperre) und 2000 (Entladung) verifiziert, Registerwert = W |
| PV max power limit | 40036 | uint32 | 1000 | Default 0xFFFFFFFF = kein Limit; Freigabe auf 11000 verifiziert |

Firmwarestand: in der App noch nicht abgelesen (TODO) | Protokollversion:
V2.5, Registerkarte gegenueber V1.7 unveraendert |
Auto-Revert bei Kommunikationsverlust: **NEIN** (Spike-Punkt 9, 2026-10-02:
Entladung stand ~85 s unveraendert, bis `reset` sie raeumte)

## Fail-Safe-Analyse

> Profiluebergreifend: Fehlerbilder, die geplante Absicherung am Pi
> (Deadman-Timer, Boot-Reset, Hardware-Watchdog) und der Stand je Profil
> stehen in [../failsafe-modbus.md](../failsafe-modbus.md).

Modbus-Writes **bleiben stehen**, wenn openHAB ausfaellt - und Sigenergy
kennt (Stand Protokoll V1.7) kein geraeteseitiges Auto-Revert wie das
SunSpec-`InOutWRte_RvrtTms`. Der Abschnitt "Interaction timeout" des
Protokolls beschreibt nur Request-Timing, kein Steuerungs-Fallback.

- Der Kern setzt die Steuerung in jedem 5-Minuten-Zyklus neu auf (Reset +
  aktuelles Fenster) - haengengebliebene Zustaende ueberleben keinen
  Zyklus, **solange openHAB laeuft**.
- Restrisiko bei openHAB-Ausfall im Fenster: die Anlage bleibt im
  kommandierten Zustand stehen. Bei aktiver Ladesperre laedt die Batterie
  nicht mehr (Komfortverlust); bei aktiver forcierter Entladung entlaedt
  sie mit dem zuletzt kommandierten Limit weiter, bis die Anlage an ihrer
  eigenen Entladeuntergrenze stoppt. Spike-Punkt 9 (2026-10-02) hat KEIN
  Auto-Revert nachgewiesen - genau dieses Restrisiko faengt der Timer
  unten ab.
- Der root-Timer `ibm-failsafe` (`setup/10-install-failsafe.sh`) uebernimmt
  das ueber `inverter_failsafe_reset` -> `tools/failsafe_reset.py`: ein
  Skript ohne openHAB, das `Remote EMS enable = 0` schreibt und per
  Read-back prueft. **Seit 2026-10-02 vorhanden und am Geraet bewiesen**
  (openHAB-Stop: Reset nach ~47 s; Reboot: Boot-Reset vor openHAB). Seit
  2026-10-03 mit `--scan`: antwortet die Adresse aus dem Bridge-Thing
  nicht, sucht das Skript die Anlage in allen lokalen /24-Netzen (Probe wie
  `rediscover.sh`, genau ein Treffer) und schreibt dorthin - der Timer
  haengt damit nicht mehr am Watchdog, wenn DHCP die Anlage bei totem
  openHAB verschiebt. Am Simulator getestet (falsche Adresse -> gefunden
  und zurueckgesetzt; Simulator aus -> "0 gefunden", Exit 1), am Geraet
  noch offen.
- Damit der Timer auch greift, wenn openHAB LAEUFT, aber die Bridge tot
  ist, muss `ibmReset()` ehrlich sein: openHABs `sendCommand` wirft bei
  deaktivierter oder abgerissener Bridge keine Exception, der Befehl
  verpufft nur. Der Adapter prueft deshalb vor jedem Write, dass das
  Wechselrichter-Thing `@IBM_THING_UID@` (hier `modbus:data:ibm:sg:soc`,
  dasselbe Thing, auf das 02b wartet) ONLINE ist, sonst `ok: false` ->
  kein Heartbeat -> der Timer uebernimmt. Ohne
  diese Pruefung schlief der Timer bei deaktivierter Bridge weiter; mit
  ihr griff er nach 13 min (Testplan Zeile 13, beide Laeufe 2026-10-02).

## Bekannte Grenzen

- Die Netzwerksuche (Scan und Watchdog-Rediscover) erkennt eine SigenStor
  nur an einer Modbus-Antwort auf Slave 247 - eine Seriennummer ist auf
  Anlagenebene nicht lesbar. Stehen mehrere Modbus-TCP-Geraete mit Slave
  247 im selben Netz, muss die IP von Hand gepflegt werden.
- Der SigenStor-Gateway kann hinter einer WLAN-MAC mehrere IPs fuehren,
  und der Modbus-Server wechselt beim DHCP-Lease die Adresse (223,
  2026-10-03: .107 -> .101). DHCP-Reservierung nach MAC greift nicht -
  statische IP in der mySigen-App setzen; die Netzwerksuche ist das Netz
  darunter.
- Gesteuert wird der gesamte Anlagenverbund (Slave 247), nicht einzelne
  Wechselrichter oder Batterietuerme.
- Die Registerkarte gilt fuer Protokoll V1.7; neuere Firmwarestaende im
  Spike gegenpruefen.
- **Hausvorrang offen (VOR dem Feldeinsatz klaeren):** Das Entladelimit
  (40034) in Modus 6 ist ein Deckel. Zieht der Haushalt waehrend der
  forcierten Entladung mehr als die kommandierte Leistung, kaeme die
  Differenz aus dem Netz - der Adapter-Kontrakt verlangt aber eine
  Untergrenze (`core.js`, Adapter-Kontrakt und Abschnitt "Hausvorrang").
  Der Hausvorrang des Kerns faengt das ab; das dafuer noetige
  Netzleistungs-Item (`GRID_POWER_ITEM` -> `IBM_SG_GridPower`, Register
  30005) legt das Profil seit 2026-10-02 an - zusammen mit `IBM_SG_PvPower`
  (30035). Damit greifen Hausvorrang und Netzladeschutz auch bei Sigenergy,
  und Dashboard/Status-Push zeigen Netz, PV-Leistung und "Einspeisung aus
  Batterie" (vorher leer). Offen aus dem Spike (Punkt 8): Verbraucher
  groesser als das Limit zuschalten und den Netzbezug beobachten.

## Simulator (Tests ohne Anlage)

`tools/sim_sigenstor.py` stellt einen Modbus-TCP-Server mit den
Plant-Registern bereit (SoC 55%, Nennentladeleistung 8000 W) und
protokolliert jeden Schreibzugriff - damit laesst sich die komplette
Installation inklusive Steuerlogik gegen einen leeren openHAB testen
(nur Standardbibliothek, kein pip noetig):

    python3 tools/sim_sigenstor.py --port 5020

Im Assistenten dann als Adresse `127.0.0.1` angeben. Port 502 braucht
root; der Parameter `--port` erlaubt einen unprivilegierten Port, der dann
im Bridge-Thing einzutragen ist.
