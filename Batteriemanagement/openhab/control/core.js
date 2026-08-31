// ============================================================================
// IBM - Batteriesteuerung, herstellerneutraler Kern
//
//   Teil A: Batterieladen bei geringer Bewoelkung zurueckhalten (tagsueber).
//           Sobald die Anlage ihre Batteriekapazitaet und Ladeleistung
//           kennt, regelt die Laderegelung (Abschnitt "Laderegelung") die
//           Ladeleistung dynamisch: Die Batterie laedt den ganzen Tag
//           gerade schnell genug, um am Abend voll zu sein - der restliche
//           PV-Ueberschuss fliesst laufend ins Netz. Solange die
//           Schaetzungen fehlen (oder die Regelung abgeschaltet ist),
//           gilt das klassische Sperrfenster: Das Fenster kommt aus der
//           Tagesprognose der API (erster Sonnenschein bis in die
//           Mittagsspitze; das Ende berechnet der Server) und gilt nur
//           fuer das mitgelieferte Datum - ohne gueltiges Fenster wird
//           nicht gesperrt. Ein lokal berechnetes Ende ersetzt das
//           Server-Ende (Abschnitt "Lokale Ladesperre"): so spaet, dass
//           die Batterie bis zum Abend gerade noch voll wird.
//   Teil B: Forcierte Batterieentladung (Nacht), abhaengig von Toggle,
//           Ladestand und Wolkenvorschau. Die Entladeleistung passt sich
//           automatisch an die Batteriegroesse an, die das Skript aus der
//           Ladestandsaenderung waehrend der Entladung schaetzt (Abschnitt
//           "Dynamische Entladeleistung"); eine harte Obergrenze
//           (ABSOLUTE_MAX_DISCHARGE_W) wird nie ueberschritten.
//
// Das Entladefenster folgt den taeglich von der API geholten Crossover-Zeiten
// (Zeitpunkt, an dem die gemeinschaftliche Erzeugung den Verbrauch kreuzt):
// entladen wird bis zum morgendlichen Crossover. Der Beginn kommt bevorzugt
// tagesaktuell von der Token-API (Ischlstrom_Entladestart: erster Slot, in
// dem die Gemeinschaft laut Prognose deutlich im Defizit ist - so landet
// die Einspeisung sicher bei den Mitgliedern und nicht beim
// Energielieferanten); ohne gueltigen Wert gilt der abendliche Crossover
// plus DISCHARGE_START_OFFSET_MIN. Liegen keine plausiblen Crossover-Zeiten
// vor (ischlstrom.org nie erreichbar gewesen oder Daten unbrauchbar), wird
// NICHT entladen - es gibt kein Ersatzfenster.
//
// ---------------------------------------------------------------------------
// Adapter-Kontrakt
//
// Dieser Kern enthaelt KEINE Wechselrichter-Kommandos. Das Setup
// (04-install-rules.sh) stellt ihm den Adapter des Wechselrichter-Profils
// (INVERTER_ADAPTER_SCRIPT) im selben Rule-Body VORAN. Der Adapter muss
// genau diese drei Funktionen definieren:
//
//   ibmReset()                      -> { ok: boolean }
//     Wechselrichter sofort auf Werksverhalten zuruecksetzen. Laeuft bei
//     Toggle=ON in JEDEM Zyklus (auch waehrend der Pause); muss idempotent
//     sein.
//
//   ibmPreventCharge(minutes)       -> { ok: boolean }
//     Batterieladen fuer `minutes` Minuten sperren. Die Sperre muss von
//     selbst ablaufen (Schedule/Revert-Timeout); kann der Hersteller das
//     nicht, dokumentiert das Profil-README das Restrisiko.
//
//   ibmForceDischarge(watts, minutes) -> { ok: boolean, appliedW?: number }
//     Entladung mit ~`watts` fuer `minutes` Minuten erzwingen, ebenfalls
//     selbst ablaufend. `watts` ist bereits validiert und auf
//     ABSOLUTE_MAX_DISCHARGE_W begrenzt. `appliedW` ist die nach
//     herstellerseitiger Quantisierung tatsaechlich kommandierte Leistung
//     (z. B. Prozent-Rundung); fehlt sie, rechnet der Kapazitaetsschaetzer
//     mit `watts`.
//
//   ibmLimitCharge(watts, minutes)  -> { ok: boolean, appliedW?: number }
//     OPTIONAL. Batterieladeleistung fuer `minutes` Minuten auf ~`watts`
//     begrenzen (nicht erzwingen - geladen wird weiter nur aus PV), selbst
//     ablaufend wie die anderen Kommandos. Definiert ein Adapter die
//     Funktion nicht, bildet der Kern die Begrenzung per Puls-Weiten-
//     Modulation ueber ibmPreventCharge nach (Abschnitt "Laderegelung").
//
// Regeln fuer Adapter: kein rules.JSRule(...), kein Top-Level-return, alle
// Logausgaben mit '[IBM]' praefixieren, nur @IBM_...@-Platzhalter (keine
// Thing-UID-Literale), niemals werfen - Fehler fangen und { ok: false }
// zurueckgeben. Adapter verlassen sich nur auf die openhab-js-Globals
// (items, actions, time, Quantity, console), nicht auf Helfer des Kerns.
// GRUNDSATZ: Kein Adapter verwendet Kommandos, die die Batterie aus dem
// Netz laden koennten (Lade-Kommandos, Command-Charging-Modi,
// TOU-Netzladen-Flags) - Sperren, Begrenzen und Entladen genuegen. Den
// Rest sichert der Netzladeschutz des Kerns zur Laufzeit ab.
// ---------------------------------------------------------------------------
//
// Dieses Skript ist die Vorlage fuer alle Anlagen und wird pro Kunde NICHT
// veraendert. Alles Anlagenspezifische kommt aus Items - siehe Abschnitt
// "Konfiguration". Fehlt ein Item oder steht es auf NULL, greift der jeweils
// hier hinterlegte Rueckfallwert, das Skript laeuft also auch unvollstaendig
// eingerichtet weiter.
//
// Vom Setup ersetzt: @IBM_SOC_ITEM@ (Itemname des Ladestands).
// ============================================================================

// Laenge eines Steuer-Zeitschlitzes. Muss zum Cron der Batterie-Regel
// (CRON_BATTERY, Vorgabe alle 5 Minuten) passen: jeder Lauf plant genau
// einen Schlitz, der naechste Lauf verlaengert oder beendet ihn.
var IBM_SLOT_MINUTES = 5;

// --- Rueckfallwerte, falls das zugehoerige Item fehlt oder ungueltig ist ----
var FALLBACK_CHARGE_LOCK_ACTIVE = true;
var FALLBACK_CLOUD_THRESHOLD = 75;

// --- Lokale Ladesperre ------------------------------------------------------
// Das Server-Ende ist aus Sicht der Gemeinschaft berechnet und kennt weder
// Batteriegroesse noch Ladeleistung der einzelnen Anlage. Die Anlage
// berechnet ihr Sperr-Ende deshalb selbst: Die Batterie soll moeglichst
// spaet zu laden beginnen, aber LOCAL_FULL_BUFFER_MIN Minuten vor dem
// abendlichen Crossover voll sein. Die dafuer noetige Ladezeit ergibt sich
// aus der geschaetzten Kapazitaet und der Ladeleistung, die die Steuerung
// aus dem Ladestandsanstieg an sonnigen Tagen lernt (analog zur
// Kapazitaetsschaetzung). Solange Kapazitaet oder Ladeleistung unbekannt
// sind, gilt das Server-Ende unveraendert.
var FALLBACK_LOCAL_LOCK_ACTIVE = true;
var LOCAL_FULL_BUFFER_MIN = 60;     // so viele Minuten vor dem Abend-Crossover voll
var LOCAL_SAFETY_FACTOR = 1.3;      // Aufschlag auf die berechnete Ladezeit
var LOCAL_LATEST_END_MIN = 13 * 60; // spaeter endet keine Sperre

var CHARGE_RATE_MIN_SOC_RISE = 5;      // Prozentpunkte je Stichprobe
var CHARGE_RATE_MAX_STEP_GAP_MIN = 12; // laengere Luecke -> Messung neu aufsetzen
var CHARGE_RATE_MAX_SOC = 95;          // darueber drosselt der Wechselrichter selbst
var CHARGE_RATE_MIN_KW = 0.3;          // Plausibilitaetsfenster einer Stichprobe
var CHARGE_RATE_MAX_KW = 30;
// Asymmetrisches, dauergewichtetes Lernen: Die Batterie muss abends voll
// sein, also zaehlt eine schlechte Erfahrung (Stichprobe unter der
// Schaetzung, z. B. Dunst trotz sonniger Vorschau) sofort stark, eine gute
// nur langsam - die Schaetzung liegt nahe an der unteren Huelle der letzten
// Tage. Zusaetzlich zaehlt jede Stichprobe mit ihrer Messdauer: schnelle
// Mittagsphasen liefern sonst mehr Stichproben je Stunde als zaehe Phasen
// und wuerden den Schnitt systematisch nach oben ziehen.
var CHARGE_RATE_EMA_DOWN = 0.5;        // Gewicht je Messstunde, Stichprobe unter der Schaetzung
var CHARGE_RATE_EMA_UP = 0.15;         // Gewicht je Messstunde, Stichprobe darueber
var CHARGE_RATE_EMA_MAX = 0.6;         // Obergrenze des Gewichts einer Stichprobe
var CHARGE_RATE_MIN_SAMPLES = 3;       // erst ab so vielen Stichproben verwenden

// --- Laderegelung -----------------------------------------------------------
// Ersetzt das harte Sperrfenster durch einen geschlossenen Regelkreis: In
// jedem Zyklus wird die Ziel-Ladeleistung neu berechnet - fehlende Energie
// geteilt durch die verbleibende Zeit bis zur Abend-Deadline (Abend-Crossover
// minus LOCAL_FULL_BUFFER_MIN). Die Batterie laedt so den ganzen Tag gerade
// schnell genug, um am Abend voll zu sein; der restliche PV-Ueberschuss
// fliesst laufend ins Netz. Weil auf den Live-Ladestand geregelt wird,
// korrigieren sich Prognosefehler alle 5 Minuten von selbst - zieht es zu,
// bleibt der Ladestand zurueck, die Ziel-Leistung steigt, die Begrenzung
// loest sich.
//
// Umsetzung je nach Adapter: definiert der Adapter ibmLimitCharge (optional,
// siehe Adapter-Kontrakt), wird die Ziel-Leistung direkt kommandiert. Sonst
// bildet eine Puls-Weiten-Modulation ueber ibmPreventCharge sie nach:
// gesperrte und freie 15-Minuten-Bloecke (REG_BLOCK_SLOTS Slots) im
// passenden Verhaeltnis ergeben im Mittel die Ziel-Leistung; eine Hysterese
// (REG_HYST_ON/OFF auf der Sperrschuld) verhindert Flattern bei
// Grenzwerten. Der Sicherheitsfaktor ist wolkenabhaengig: je bedeckter die
// Vorschau (unterhalb der Schwelle), desto frueher und schneller wird
// geladen.
//
// Voraussetzungen wie bei der lokalen Ladesperre: belastbare Kapazitaets-
// und Ladeleistungsschaetzung, gueltiges Tagesfenster, frische sonnige
// Wolkenvorschau. Fehlt etwas, gilt das klassische Sperrfenster mit
// Server-/Lokal-Ende als Rueckfall.
// Die Restzeit bis zur Deadline wird sonnengewichtet ("effektive
// Restladezeit"): bevorzugt aus den stuendlichen Ladefaktoren der Token-API
// (Erzeugungsprofil der Tagesprognose, exakt inklusive Sonnenstand), sonst
// aus den stuendlichen Wolkenwerten der Wolken-API (Faktor 1 - Wolken/100).
// Nur wenn beides fehlt (alter Server), zaehlt jede Reststunde gleich und
// der wolkenabhaengige Sicherheitsfaktor REG_SAFETY_SUNNY/CLOUDY gleicht
// den Nachmittagsabfall pauschal aus.
var FALLBACK_REGULATION_ACTIVE = true;
var REG_TARGET_SOC = 95;        // bis hier gilt die Batterie als voll (darueber drosselt der WR selbst)
var REG_SAFETY_FIXED = 1.1;     // Sicherheitsfaktor bei sonnengewichteter Restladezeit
var REG_SAFETY_SUNNY = 1.1;     // Rueckfall ohne Stundendaten: Sicherheitsfaktor bei 0% Wolken
var REG_SAFETY_CLOUDY = 1.6;    // ... bei 100% Wolken (linear interpoliert)
var REG_HOURLY_MAX_AGE_HOURS = 3; // aeltere Stundendaten gelten als veraltet (wie die Wolkenvorschau)
var REG_MIN_EFF_HOURS = 0.05;   // Untergrenze der effektiven Restzeit (Divisionsschutz)
var REG_BLOCK_SLOTS = 3;        // PWM-Blocklaenge in Slots (3 x 5 min = 15 min)
var REG_MIN_DUTY = 0.1;         // kleinere Sperranteile: gar nicht begrenzen
var REG_MAX_DUTY = 0.9;         // groessere: auf 90% begrenzen - ein Schaetzfehler darf das Laden nie ganz wuergen
var REG_HYST_ON = 2.0;          // Sperrschuld (Slots), ab der ein freier Block sperrt
var REG_HYST_OFF = 1.0;         // Sperrschuld, unter der ein Sperr-Block wieder freigibt
var REG_DEBT_MAX = 6;           // Anti-Windup der Sperrschuld
var REG_MAX_GAP_MIN = 12;       // laengere Luecke -> PWM-Zustand neu aufsetzen
var REG_LIMIT_STEP_W = 100;     // Quantisierung der direkten Leistungsbegrenzung

// --- Netzladeschutz ---------------------------------------------------------
// Grundsatz: Die Batterie laedt nur aus der eigenen PV, nie aus dem Netz.
// IBM selbst kommandiert nie Netzladen (kein Adapter nutzt Lade-Kommandos,
// siehe Adapter-Kontrakt). Dieser Waechter erkennt zusaetzlich, wenn die
// Batterie NETTO aus dem Netz laedt - etwa durch eine Geraeteeinstellung
// des Mitglieds (TOU-Netzladen, Fahrplaene anderer Apps) oder eine
// Fehlkonfiguration: Batterie laedt UND gleichzeitig wird bezogen, jeweils
// ueber NETZLADE_THRESHOLD_W. Weil die Leistungs-Items nicht im selben
// Moment abgetastet werden (Wolkenluecken, Binding-Polling), wird erst
// nach NETZLADE_TRIGGER_CYCLES aufeinanderfolgenden Zyklen gesperrt - und
// nur oberhalb von NETZLADE_MIN_SOC, damit Schutzladungen des
// Wechselrichters bei fast leerer Batterie (Zwangs-/Erhaltungsladung des
// BMS) nie blockiert werden; darunter wird nur gewarnt. Die aktuelle
// Netto-Netzladung steht in IBM_NETZLADUNG (Anzeige, Status-Push,
// Dashboard-Warnung). Vorzeichen wie ueberall: Batterie + = Entladen,
// - = Laden; Netz + = Bezug, - = Einspeisung.
var FALLBACK_NETZLADESCHUTZ = true;
var NETZLADE_THRESHOLD_W = 250;   // Laden UND Bezug muessen darueber liegen
var NETZLADE_TRIGGER_CYCLES = 3;  // so viele Zyklen in Folge (15 min), dann wird gesperrt
var NETZLADE_MIN_SOC = 15;        // darunter nur warnen (Schutzladung des Wechselrichters)
var NETZLADE_MAX_GAP_MIN = 12;    // laengere Luecke -> Zaehler neu aufsetzen

// --- Einspeise-Zaehler ------------------------------------------------------
// Summiert die Energie, die aus der Batterie ins Netz (an die Gemeinschaft)
// fliesst - der Nutzen-Indikator fuer Besitzer und EEG. Integriert wird pro
// Zyklus die aktuelle Einspeiseleistung ueber die Zeit seit dem letzten
// Lauf; laengere Luecken (openHAB stand) werden nicht hochgerechnet.
// Praeziser Stand als JSON in IBM_NETZEINSPEISUNG_ZAEHLER ({kwh, zeit},
// dazu die Zaehlerstaende am Wochen- und Monatsbeginn als Baselines);
// gerundete Anzeige in IBM_BATTERIE_NETZEINSPEISUNG_KWH (Status-Push)
// sowie _WOCHE_KWH und _MONAT_KWH fuer die Main UI.
var EINSPEISE_MAX_GAP_MIN = 12;   // laengere Luecke -> nicht integrieren

var FALLBACK_DISCHARGE_ACTIVE = true;

var FALLBACK_MIN_DISCHARGE_W = 1000;
var FALLBACK_MAX_DISCHARGE_W = 3000;

// Harte Sicherheits-Obergrenze der Entladeleistung. Wird NIE ueberschritten -
// weder durch Einstellungen noch durch die Kapazitaetsschaetzung.
var ABSOLUTE_MAX_DISCHARGE_W = 5000;

// --- Dynamische Entladeleistung ---------------------------------------------
// Die Anlagen haben unterschiedlich grosse Batterien, deren Kapazitaet bei der
// Einrichtung nicht bekannt ist. Waehrend der forcierten Entladung ist die
// Batterieleistung aber bekannt (sie wird kommandiert); aus entnommener
// Energie und Ladestandsaenderung schaetzt das Skript daher die Kapazitaet
// und leitet die Entladeleistung als C-Rate daraus ab.
var FALLBACK_DYNAMIC_POWER_ACTIVE = true;
var DYNAMIC_MIN_C_RATE = 0.10;   // 10-kWh-Batterie -> 1000 W (wie Vorgabe)
var DYNAMIC_MAX_C_RATE = 0.30;   // 10-kWh-Batterie -> 3000 W (wie Vorgabe)
var DYNAMIC_MIN_SAMPLES = 3;     // erst ab so vielen Stichproben verwenden

var CAPACITY_MIN_KWH = 1;        // Plausibilitaetsfenster einer Stichprobe
var CAPACITY_MAX_KWH = 100;
var CAPACITY_SAMPLE_MIN_SOC_DROP = 8;  // Prozentpunkte je Stichprobe
var CAPACITY_MAX_STEP_GAP_MIN = 12;    // laengere Luecke -> Messung neu aufsetzen
var CAPACITY_EMA_WEIGHT = 0.3;   // Gewicht einer neuen Stichprobe

// Wolkenvorschau aelter als so viele Stunden gilt als veraltet (sie wird
// stuendlich abgeholt; drei ausgefallene Abrufe in Folge sind ein Ausfall).
var MAX_CLOUD_AGE_HOURS = 3;

// --- Nacht-Entladebudget ----------------------------------------------------
// Das Budget rechnet die Steuerung selbst, je Anlage aus Batteriegroesse und
// Hausverbrauch: eingespeist wird nachts nur, was ueber der Reserve
// IBM_MIN_BATTERY_CHARGE und dem Eigenbedarf des Hauses liegt. Der
// Eigenbedarf ist die gelernte Hauslast (IBM_HAUSLAST, sonst
// FALLBACK_HOUSE_LOAD_W) ueber die Stunden bis zum naechsten
// Gemeinschafts-Ueberschuss (Vormittags-Crossover); bei bedeckter Vorschau
// (Wolkenschwelle) oder ohne Vorschau haengt das Haus auch tagsueber an der
// Batterie, dann reicht die Reservedauer bis zum Abend-Crossover des
// Folgetags. Ein Sicherheitszuschlag deckt Mess- und Prognosefehler. Der
// Ziel-Ladestand wird in jedem Zyklus neu gerechnet - mit jeder Stunde
// Nacht schrumpft der verbleibende Eigenbedarf. Ohne belastbare
// Kapazitaetsschaetzung gilt nur die Reserve - dann greift bei bedeckter
// Vorschau der Trueb-Stopp als Rueckfall.
var FALLBACK_HOUSE_LOAD_W = 300;     // solange keine Hauslast gelernt ist
var NIGHT_RESERVE_FACTOR = 1.3;      // Sicherheitszuschlag auf den Eigenbedarf
var FALLBACK_SUN_HOURS = 10;         // Tageslaenge ohne Abend-Crossover

// --- Entladestart -------------------------------------------------------------
// Der woechentliche Crossover ist ein Mittelwert: an sonnigen Tagen ist die
// Gemeinschaft danach noch im Plus, und die Nachteinspeisung ginge an den
// Energielieferanten. Ohne tagesaktuellen Entladestart der Token-API beginnt
// die Entladung deshalb erst so viele Minuten nach dem Abend-Crossover.
var DISCHARGE_START_OFFSET_MIN = 60;

// --- Hauslast-Schaetzung ----------------------------------------------------
// In jedem Nacht-Zyklus ohne Entladebefehl versorgt der Wechselrichter das
// Haus allein aus der Batterie - der Ladestandsabfall ergibt also direkt
// die Hauslast. Gemessen wird in allen solchen Abschnitten der Nacht (vor
// dem ersten Entladen, nach dem Entlade-Stopp, bei Budget 0, Trueb-Stopp
// ohne Budget oder unterhalb der Reserve); ein Entladebefehl setzt die
// Messstrecke zurueck. Die Messstrecken einer Nacht werden zeitgewichtet
// zusammengefasst (entnommene Energie / gemessene Dauer), erst der
// Nachtwert fliesst gleitend in die Schaetzung ein - eine Verbrauchsspitze
// zaehlt so nur mit ihrer echten Dauer. Aus der Schaetzung rechnet die
// Steuerung die Eigenbedarfsreserve des Nachtbudgets; per Status-Push geht
// sie auch an den Server (Anzeige).
var HOUSE_LOAD_MIN_SOC_DROP = 3;      // Prozentpunkte je Messschritt
var HOUSE_LOAD_MAX_STEP_GAP_MIN = 12; // laengere Luecke -> Messstrecke neu aufsetzen
var HOUSE_LOAD_MIN_SOC = 4;           // darunter drosselt der Wechselrichter selbst
var HOUSE_LOAD_MIN_W = 50;            // Plausibilitaetsfenster eines Nachtwerts
var HOUSE_LOAD_MAX_W = 3000;
var HOUSE_LOAD_MIN_NIGHT_MIN = 120;   // gemessene Minuten, bevor eine Nacht zaehlt
var HOUSE_LOAD_EMA_WEIGHT = 0.3;      // Gewicht einer neuen Nacht

// --- Hilfsfunktionen zum Lesen der Konfiguration ----------------------------

function readItem(name) {
  try {
    var item = items.getItem(name);
    return (item === null || item === undefined) ? null : item;
  } catch (e) {
    return null;
  }
}

// Zahl aus einem Item, mit Bereichspruefung und Rueckfallwert.
function num(name, fallback, min, max) {
  var item = readItem(name);
  if (item === null) {
    console.log('[IBM][Konfig] Item fehlt: ' + name + ' - verwende ' + fallback);
    return fallback;
  }
  var value = parseFloat(item.numericState);
  if (isNaN(value) || value < min || value > max) {
    console.log('[IBM][Konfig] ' + name + '=' + value + ' ungueltig (erlaubt ' + min + '-' + max + ') - verwende ' + fallback);
    return fallback;
  }
  return value;
}

// Schalter, mit Rueckfallwert bei NULL/UNDEF.
function onOff(name, fallback) {
  var item = readItem(name);
  if (item === null) {
    console.log('[IBM][Konfig] Item fehlt: ' + name + ' - verwende ' + (fallback ? 'ON' : 'OFF'));
    return fallback;
  }
  var state = String(item.state);
  if (state === 'ON') return true;
  if (state === 'OFF') return false;
  console.log('[IBM][Konfig] ' + name + '=' + state + ' - verwende ' + (fallback ? 'ON' : 'OFF'));
  return fallback;
}

// Uhrzeit "HH:MM[:SS]" aus einem String-Item, als Minuten seit Mitternacht.
// null, wenn das Item fehlt, nicht lesbar ist oder ausserhalb des
// Plausibilitaetsfensters [minHour, maxHour) liegt.
function timeItemMinutes(name, minHour, maxHour) {
  var item = readItem(name);
  if (item === null) return null;
  var state = String(item.state);
  var match = state.match(/^(\d{1,2}):(\d{2})/);
  if (match === null) return null;
  var h = parseInt(match[1], 10);
  var m = parseInt(match[2], 10);
  if (h > 23 || m > 59) return null;
  if (h < minHour || h >= maxHour) {
    console.log('[IBM][Konfig] ' + name + '=' + state + ' unplausibel (erwartet ' + minHour + '-' + maxHour + ' Uhr) - wird ignoriert');
    return null;
  }
  return h * 60 + m;
}

// Schreibt einen String in ein Item, nur wenn sich der Wert aendert.
function publishItem(name, value) {
  var item = readItem(name);
  if (item !== null && String(item.state) !== value) item.postUpdate(value);
}

// --- Konfiguration ----------------------------------------------------------

var CHARGE_LOCK_ACTIVE     = onOff('IBM_LADESPERRE_AKTIV', FALLBACK_CHARGE_LOCK_ACTIVE);
var CLOUD_THRESHOLD        = num('IBM_LADESPERRE_WOLKEN_SCHWELLE', FALLBACK_CLOUD_THRESHOLD, 0, 100);
var LOCAL_LOCK_ACTIVE      = onOff('IBM_LADESPERRE_LOKAL', FALLBACK_LOCAL_LOCK_ACTIVE);

// Ladesperre-Fenster aus der Tagesprognose: erster Sonnenschein 4-12 Uhr,
// Vormittags-Crossover 5-15 Uhr plausibel. '-' (kein Ueberschuss erwartet)
// oder unplausible Werte ergeben null - dann wird nicht gesperrt.
var CHARGE_LOCK_START_MIN  = timeItemMinutes('Ischlstrom_Ladesperre_Start', 4, 12);
var CHARGE_LOCK_END_MIN    = timeItemMinutes('Ischlstrom_Ladesperre_Ende', 5, 15);

var DISCHARGE_ACTIVE       = onOff('IBM_ENTLADUNG_AKTIV', FALLBACK_DISCHARGE_ACTIVE);

// Crossover-Zeiten der Gemeinschaft: morgens 03-12 Uhr, abends 12-24 Uhr
// plausibel. Ausserhalb (oder ohne Daten) wird nicht entladen.
var MORNING_CROSSOVER_MIN  = timeItemMinutes('Ischlstrom_Crossover_Start', 3, 12);
var EVENING_CROSSOVER_MIN  = timeItemMinutes('Ischlstrom_Crossover_Ende', 12, 24);
// Tagesaktueller Entladestart der Token-API (gilt nur fuer das Datum des
// Ladesperre-Fensters, siehe dischargeStart unten); '-' oder unplausibel
// ergibt null.
var DISCHARGE_START_API_MIN = timeItemMinutes('Ischlstrom_Entladestart', 12, 24);

// --- Kapazitaetsschaetzung --------------------------------------------------
// Zustand der Schaetzung als JSON in einem String-Item (persistiert):
//   kwh         geschaetzte Kapazitaet
//   messungen   Anzahl akzeptierter Stichproben
//   basisSoc    Ladestand zu Beginn der laufenden Messstrecke (%)
//   basisWh     seither entnommene Energie (Wh, aus kommandierter Leistung)
//   schrittZeit Zeitpunkt des letzten Entladelaufs
//   schrittW    dabei kommandierte Leistung (gilt bis zum naechsten Lauf)

function readCapacityState() {
  var item = readItem('IBM_KAPAZITAET_MESSUNG');
  if (item === null) return null;
  var state = String(item.state);
  if (state === 'NULL' || state === 'UNDEF' || state === '') return {};
  try {
    var parsed = JSON.parse(state);
    return (parsed !== null && typeof parsed === 'object') ? parsed : {};
  } catch (e) {
    return {};
  }
}

function writeCapacityState(st) {
  var item = readItem('IBM_KAPAZITAET_MESSUNG');
  if (item !== null) item.postUpdate(JSON.stringify(st));
  var display = readItem('IBM_BATTERIE_KAPAZITAET');
  if (display !== null && typeof st.kwh === 'number') {
    display.postUpdate(Math.round(st.kwh * 10) / 10);
  }
}

// Geschaetzte Kapazitaet in kWh - oder null, solange die Schaetzung noch
// nicht belastbar ist (Items fehlen, zu wenige oder unplausible Messungen).
function estimatedCapacityKwh() {
  var st = readCapacityState();
  if (st === null) return null;
  if (typeof st.kwh !== 'number' || st.kwh < CAPACITY_MIN_KWH || st.kwh > CAPACITY_MAX_KWH) return null;
  if (!(typeof st.messungen === 'number' && st.messungen >= DYNAMIC_MIN_SAMPLES)) return null;
  return st.kwh;
}

// Schreibt die Kapazitaetsschaetzung nach jedem Entladelauf fort. Die seit dem
// letzten Lauf entnommene Energie (damals kommandierte Leistung x Zeit) wird
// aufsummiert; ist der Ladestand um CAPACITY_SAMPLE_MIN_SOC_DROP Prozentpunkte
// gefallen, ergibt Energie / Ladestandsdifferenz eine Stichprobe der
// Kapazitaet, die gleitend in die Schaetzung einfliesst.
function updateCapacityEstimate(soc, commandedW, scheduleOk) {
  var st = readCapacityState();
  if (st === null) {
    console.log('[IBM][Kapazitaet] Item IBM_KAPAZITAET_MESSUNG fehlt - Schaetzung uebersprungen');
    return;
  }

  function restartMeasurement(reason) {
    if (reason !== null) console.log('[IBM][Kapazitaet] ' + reason + ' - Messung neu aufgesetzt');
    st.basisSoc = soc;
    st.basisWh = 0;
    st.schrittZeit = now.toString();
    st.schrittW = scheduleOk ? commandedW : 0;
    writeCapacityState(st);
  }

  // Ohne angewendeten Schedule ist die tatsaechliche Leistung unbekannt.
  if (!scheduleOk) { restartMeasurement(null); return; }

  var prevTime = null;
  try {
    if (st.schrittZeit) prevTime = time.ZonedDateTime.parse(String(st.schrittZeit));
  } catch (e) {
    prevTime = null;
  }
  if (typeof st.basisSoc !== 'number' || typeof st.basisWh !== 'number' || prevTime === null) {
    restartMeasurement('Keine laufende Messung');
    return;
  }

  var gapMin = time.Duration.between(prevTime, now).toMinutes();
  if (gapMin <= 0 || gapMin > CAPACITY_MAX_STEP_GAP_MIN) {
    restartMeasurement('Letzter Entladelauf ' + gapMin + ' min her');
    return;
  }
  if (soc > st.basisSoc) {
    restartMeasurement('Ladestand gestiegen (' + st.basisSoc + '% -> ' + soc + '%)');
    return;
  }

  var stepW = (typeof st.schrittW === 'number' && st.schrittW > 0) ? st.schrittW : 0;
  st.basisWh += stepW * (gapMin / 60);

  var drop = st.basisSoc - soc;
  if (drop >= CAPACITY_SAMPLE_MIN_SOC_DROP) {
    // Wh -> kWh und Prozentpunkte -> Anteil: kWh = (Wh/1000) / (drop/100)
    var sampleKwh = Math.round(st.basisWh * 10 / drop) / 100;
    if (sampleKwh >= CAPACITY_MIN_KWH && sampleKwh <= CAPACITY_MAX_KWH) {
      var count = (typeof st.messungen === 'number') ? st.messungen : 0;
      st.kwh = (typeof st.kwh === 'number' && count > 0)
        ? Math.round(((1 - CAPACITY_EMA_WEIGHT) * st.kwh + CAPACITY_EMA_WEIGHT * sampleKwh) * 100) / 100
        : sampleKwh;
      st.messungen = count + 1;
      console.log('[IBM][Kapazitaet] Stichprobe ' + sampleKwh + ' kWh (' + Math.round(st.basisWh) + ' Wh je ' + drop + ' Prozentpunkte) -> Schaetzung ' + st.kwh + ' kWh (' + st.messungen + '. Messung)');
    } else {
      console.log('[IBM][Kapazitaet] Stichprobe ' + sampleKwh + ' kWh unplausibel - verworfen');
    }
    st.basisSoc = soc;
    st.basisWh = 0;
  }

  st.schrittZeit = now.toString();
  st.schrittW = commandedW;
  writeCapacityState(st);
}

// --- Ladeleistungsschaetzung ------------------------------------------------
// Zustand wie bei der Kapazitaetsschaetzung als JSON in einem String-Item:
//   kw          geschaetzte Ladeleistung
//   messungen   Anzahl akzeptierter Stichproben
//   basisSoc    Ladestand zu Beginn der laufenden Messstrecke (%)
//   basisZeit   Beginn der Messstrecke
//   letztZeit   Zeitpunkt des letzten Messlaufs (Lueckenerkennung)
// Gemessen wird nur, wenn die Batterie frei laden darf, die Vorschau Sonne
// meldet und der Ladestand unter der Drossel-Zone liegt (sampleChargeRate) -
// die Schaetzung spiegelt so die real erreichbare Ladeleistung der Anlage,
// einschliesslich Hausverbrauch und Wechselrichter-Grenzen.

function readChargeRateState() {
  var item = readItem('IBM_LADERATE_MESSUNG');
  if (item === null) return null;
  var state = String(item.state);
  if (state === 'NULL' || state === 'UNDEF' || state === '') return {};
  try {
    var parsed = JSON.parse(state);
    return (parsed !== null && typeof parsed === 'object') ? parsed : {};
  } catch (e) {
    return {};
  }
}

function writeChargeRateState(st) {
  var item = readItem('IBM_LADERATE_MESSUNG');
  if (item !== null) item.postUpdate(JSON.stringify(st));
  var display = readItem('IBM_LADELEISTUNG');
  if (display !== null && typeof st.kw === 'number') {
    display.postUpdate(Math.round(st.kw * 10) / 10);
  }
}

// Geschaetzte Ladeleistung in kW - oder null, solange die Schaetzung noch
// nicht belastbar ist (Items fehlen, zu wenige oder unplausible Messungen).
function estimatedChargeKw() {
  var st = readChargeRateState();
  if (st === null) return null;
  if (typeof st.kw !== 'number' || st.kw < CHARGE_RATE_MIN_KW || st.kw > CHARGE_RATE_MAX_KW) return null;
  if (!(typeof st.messungen === 'number' && st.messungen >= CHARGE_RATE_MIN_SAMPLES)) return null;
  return st.kw;
}

// Schreibt die Ladeleistungsschaetzung fort: ist der Ladestand seit Beginn
// der Messstrecke um CHARGE_RATE_MIN_SOC_RISE Prozentpunkte gestiegen,
// ergibt geladene Energie (aus der Kapazitaet) / Zeit eine Stichprobe, die
// gleitend in die Schaetzung einfliesst.
function updateChargeRateEstimate(soc, capacityKwh) {
  var st = readChargeRateState();
  if (st === null) {
    console.log('[IBM][Ladeleistung] Item IBM_LADERATE_MESSUNG fehlt - Schaetzung uebersprungen');
    return;
  }

  function restartMeasurement(reason) {
    if (reason !== null) console.log('[IBM][Ladeleistung] ' + reason + ' - Messung neu aufgesetzt');
    st.basisSoc = soc;
    st.basisZeit = now.toString();
    st.letztZeit = now.toString();
    writeChargeRateState(st);
  }

  var prevTime = null;
  var baseTime = null;
  try {
    if (st.letztZeit) prevTime = time.ZonedDateTime.parse(String(st.letztZeit));
    if (st.basisZeit) baseTime = time.ZonedDateTime.parse(String(st.basisZeit));
  } catch (e) {
    prevTime = null;
  }
  if (typeof st.basisSoc !== 'number' || prevTime === null || baseTime === null) {
    restartMeasurement('Keine laufende Messung');
    return;
  }

  var gapMin = time.Duration.between(prevTime, now).toMinutes();
  if (gapMin <= 0 || gapMin > CHARGE_RATE_MAX_STEP_GAP_MIN) {
    restartMeasurement('Letzter Messlauf ' + gapMin + ' min her');
    return;
  }
  if (soc < st.basisSoc) {
    restartMeasurement('Ladestand gefallen (' + st.basisSoc + '% -> ' + soc + '%)');
    return;
  }

  var rise = soc - st.basisSoc;
  if (rise < CHARGE_RATE_MIN_SOC_RISE) {
    st.letztZeit = now.toString();
    writeChargeRateState(st);
    return;
  }

  var hours = time.Duration.between(baseTime, now).toMinutes() / 60;
  if (hours > 0) {
    var sampleKw = Math.round(rise / 100 * capacityKwh / hours * 100) / 100;
    if (sampleKw >= CHARGE_RATE_MIN_KW && sampleKw <= CHARGE_RATE_MAX_KW) {
      var count = (typeof st.messungen === 'number') ? st.messungen : 0;
      var weight = (typeof st.kw === 'number' && sampleKw < st.kw) ? CHARGE_RATE_EMA_DOWN : CHARGE_RATE_EMA_UP;
      weight = Math.min(weight * hours, CHARGE_RATE_EMA_MAX);
      st.kw = (typeof st.kw === 'number' && count > 0)
        ? Math.round(((1 - weight) * st.kw + weight * sampleKw) * 100) / 100
        : sampleKw;
      st.messungen = count + 1;
      console.log('[IBM][Ladeleistung] Stichprobe ' + sampleKw + ' kW (' + rise + ' Prozentpunkte in ' + Math.round(hours * 60) + ' min) -> Schaetzung ' + st.kw + ' kW (' + st.messungen + '. Messung)');
    } else {
      console.log('[IBM][Ladeleistung] Stichprobe ' + sampleKw + ' kW unplausibel - verworfen');
    }
  }
  st.basisSoc = soc;
  st.basisZeit = now.toString();
  st.letztZeit = now.toString();
  writeChargeRateState(st);
}

// --- Hauslast-Schaetzung ----------------------------------------------------
// Zustand wie bei den anderen Schaetzern als JSON in einem String-Item:
//   watt        geschaetzte Hauslast (gleitendes Mittel ueber Naechte)
//   messungen   Anzahl akzeptierter Naechte
//   nacht       Kennung der laufenden Nacht (Datum des Entladestarts)
//   nachtWh     in dieser Nacht bisher gemessen entnommene Energie
//   nachtMin    in dieser Nacht bisher gemessene Dauer
//   basisSoc    Ladestand zu Beginn der laufenden Messstrecke (%)
//   basisZeit   Beginn der Messstrecke
//   letztZeit   Zeitpunkt des letzten Messlaufs (Lueckenerkennung)
// Gemessen wird nur nachts in Zyklen ohne Entladebefehl (sampleHouseLoad).

function readHouseLoadState() {
  var item = readItem('IBM_HAUSLAST_MESSUNG');
  if (item === null) return null;
  var state = String(item.state);
  if (state === 'NULL' || state === 'UNDEF' || state === '') return {};
  try {
    var parsed = JSON.parse(state);
    if (parsed === null || typeof parsed !== 'object') return {};
    // Altes Format (Stichproben-EMA, kein Nachtzaehler): die Schaetzung war
    // stichprobengewichtet und damit nach oben verzerrt - verwerfen, die
    // laufende Nacht liefert nach HOUSE_LOAD_MIN_NIGHT_MIN einen neuen Wert.
    if (typeof parsed.watt === 'number' && typeof parsed.nachtMin !== 'number') {
      console.log('[IBM][Hauslast] Schaetzung im alten Format (' + parsed.watt + ' W) verworfen - wird zeitgewichtet neu gelernt');
      return {};
    }
    return parsed;
  } catch (e) {
    return {};
  }
}

// Zeitgewichtete Hauslast der laufenden Nacht in W - oder null, solange
// noch nicht genug Dauer gemessen ist.
function runningNightLoadW(st) {
  if (!(typeof st.nachtMin === 'number' && st.nachtMin >= HOUSE_LOAD_MIN_NIGHT_MIN)) return null;
  if (typeof st.nachtWh !== 'number' || st.nachtWh <= 0) return null;
  return Math.round(st.nachtWh / (st.nachtMin / 60));
}

// Wirksame Schaetzung: das gleitende Mittel der abgeschlossenen Naechte;
// solange es keines gibt, der Wert der laufenden Nacht. Sonst null.
function effectiveHouseLoadW(st) {
  if (typeof st.watt === 'number' && st.watt >= HOUSE_LOAD_MIN_W && st.watt <= HOUSE_LOAD_MAX_W
      && typeof st.messungen === 'number' && st.messungen >= 1) {
    return st.watt;
  }
  var running = runningNightLoadW(st);
  if (running !== null && running >= HOUSE_LOAD_MIN_W && running <= HOUSE_LOAD_MAX_W) return running;
  return null;
}

function writeHouseLoadState(st) {
  var item = readItem('IBM_HAUSLAST_MESSUNG');
  if (item !== null) item.postUpdate(JSON.stringify(st));
  var display = readItem('IBM_HAUSLAST');
  if (display !== null) {
    var w = effectiveHouseLoadW(st);
    if (w !== null) display.postUpdate(Math.round(w));
  }
}

// Bricht eine laufende Messstrecke ab (Schaetzung, Nachtzaehler bleiben).
// Die naechste Messung beginnt erst im naechsten Zyklus ohne Entladebefehl
// - der gerade kommandierte Entlade-Slot darf nicht in die Hauslast laufen.
function clearHouseLoadMeasurement() {
  var st = readHouseLoadState();
  if (st === null || typeof st.basisSoc !== 'number') return;
  delete st.basisSoc;
  delete st.basisZeit;
  delete st.letztZeit;
  writeHouseLoadState(st);
}

// Kennung der laufenden Nacht: das Datum, an dem sie begonnen hat (vor dem
// Entladestart gehoert der Lauf noch zur Nacht von gestern).
function houseLoadNightId() {
  var t = (dischargeStart !== null && nowMinutes < dischargeStart) ? now.minusDays(1) : now;
  var m = t.monthValue();
  var d = t.dayOfMonth();
  return t.year() + '-' + (m < 10 ? '0' : '') + m + '-' + (d < 10 ? '0' : '') + d;
}

// Schliesst die gespeicherte Nacht ab: reicht die gemessene Dauer, ergibt
// entnommene Energie / Dauer den Nachtwert, der gleitend in die Schaetzung
// einfliesst. Danach beginnt die neue Nacht mit leeren Zaehlern.
function finishHouseLoadNight(st, nightId) {
  if (typeof st.nachtMin === 'number' && st.nachtMin > 0) {
    var nightW = runningNightLoadW(st);
    if (nightW === null) {
      console.log('[IBM][Hauslast] Nacht ' + st.nacht + ': nur ' + Math.round(st.nachtMin) + ' min gemessen - nicht gewertet');
    } else if (nightW < HOUSE_LOAD_MIN_W || nightW > HOUSE_LOAD_MAX_W) {
      console.log('[IBM][Hauslast] Nacht ' + st.nacht + ': ' + nightW + ' W unplausibel - verworfen');
    } else {
      var count = (typeof st.messungen === 'number') ? st.messungen : 0;
      st.watt = (typeof st.watt === 'number' && count > 0)
        ? Math.round((1 - HOUSE_LOAD_EMA_WEIGHT) * st.watt + HOUSE_LOAD_EMA_WEIGHT * nightW)
        : nightW;
      st.messungen = count + 1;
      console.log('[IBM][Hauslast] Nacht ' + st.nacht + ': ' + nightW + ' W (' + Math.round(st.nachtWh) + ' Wh in ' + Math.round(st.nachtMin) + ' min) -> Schaetzung ' + st.watt + ' W (' + st.messungen + '. Nacht)');
    }
  }
  st.nacht = nightId;
  st.nachtWh = 0;
  st.nachtMin = 0;
}

// Schreibt die Hauslastmessung fort: ist der Ladestand seit Beginn der
// Messstrecke um HOUSE_LOAD_MIN_SOC_DROP Prozentpunkte gefallen, gehen
// entnommene Energie (aus der Kapazitaet) und Messdauer in die Zaehler der
// Nacht; Luecken und steigender Ladestand setzen nur die Messstrecke neu
// auf, die Zaehler bleiben.
function updateHouseLoadEstimate(soc, capacityKwh) {
  var st = readHouseLoadState();
  if (st === null) {
    console.log('[IBM][Hauslast] Item IBM_HAUSLAST_MESSUNG fehlt - Schaetzung uebersprungen');
    return;
  }

  function restartMeasurement() {
    st.basisSoc = soc;
    st.basisZeit = now.toString();
    st.letztZeit = now.toString();
    writeHouseLoadState(st);
  }

  var nightId = houseLoadNightId();
  if (st.nacht !== nightId) {
    finishHouseLoadNight(st, nightId);
    restartMeasurement();
    return;
  }

  var prevTime = null;
  var baseTime = null;
  try {
    if (st.letztZeit) prevTime = time.ZonedDateTime.parse(String(st.letztZeit));
    if (st.basisZeit) baseTime = time.ZonedDateTime.parse(String(st.basisZeit));
  } catch (e) {
    prevTime = null;
  }
  if (typeof st.basisSoc !== 'number' || prevTime === null || baseTime === null) {
    restartMeasurement();
    return;
  }

  var gapMin = time.Duration.between(prevTime, now).toMinutes();
  if (gapMin <= 0 || gapMin > HOUSE_LOAD_MAX_STEP_GAP_MIN) {
    restartMeasurement();
    return;
  }
  if (soc > st.basisSoc) {
    restartMeasurement();
    return;
  }

  var drop = st.basisSoc - soc;
  if (drop < HOUSE_LOAD_MIN_SOC_DROP) {
    st.letztZeit = now.toString();
    writeHouseLoadState(st);
    return;
  }

  var minutes = time.Duration.between(baseTime, now).toMinutes();
  if (minutes > 0) {
    var wh = drop / 100 * capacityKwh * 1000;
    st.nachtWh = ((typeof st.nachtWh === 'number') ? st.nachtWh : 0) + wh;
    st.nachtMin = ((typeof st.nachtMin === 'number') ? st.nachtMin : 0) + minutes;
    var running = (st.nachtMin > 0) ? Math.round(st.nachtWh / (st.nachtMin / 60)) : null;
    console.log('[IBM][Hauslast] Messschritt ' + Math.round(wh) + ' Wh in ' + minutes + ' min (' + drop + ' Prozentpunkte) -> Nacht bisher ' + running + ' W ueber ' + Math.round(st.nachtMin) + ' min');
  }
  st.basisSoc = soc;
  st.basisZeit = now.toString();
  st.letztZeit = now.toString();
  writeHouseLoadState(st);
}

// Gelernte Hauslast in W - oder der Rueckfallwert, solange keine belastbare
// Schaetzung vorliegt (weder abgeschlossene Nacht noch genug Messdauer in
// der laufenden).
function houseLoadW() {
  var st = readHouseLoadState();
  if (st !== null) {
    var w = effectiveHouseLoadW(st);
    if (w !== null) return w;
  }
  return FALLBACK_HOUSE_LOAD_W;
}

// Stunden, die das Haus ab jetzt noch aus der Batterie versorgt werden
// muss: bis zum Vormittags-Crossover; an einem trueben Folgetag (Vorschau
// ueber der Wolkenschwelle oder keine Vorschau) zusaetzlich bis zum
// Abend-Crossover.
function nightReserveHours(clouds) {
  var morning = MORNING_CROSSOVER_MIN;
  var hours = (nowMinutes < morning ? morning - nowMinutes : 24 * 60 - nowMinutes + morning) / 60;
  if (clouds === null || clouds >= CLOUD_THRESHOLD) {
    hours += EVENING_CROSSOVER_MIN !== null && EVENING_CROSSOVER_MIN > morning
      ? (EVENING_CROSSOVER_MIN - morning) / 60
      : FALLBACK_SUN_HOURS;
  }
  return hours;
}

// Eigenbedarfsreserve in kWh: Hauslast ueber die Reservedauer, mit Zuschlag.
function nightReserveKwh(clouds) {
  return Math.round(houseLoadW() / 1000 * nightReserveHours(clouds) * NIGHT_RESERVE_FACTOR * 10) / 10;
}

// Ziel-Ladestand der Nacht: Reserve plus Eigenbedarf, in Prozent der
// geschaetzten Kapazitaet (aufgerundet, nie unter der Reserve).
function nightTargetSoc(minSoc, reserveKwh, capacityKwh) {
  return Math.min(100, Math.max(minSoc, Math.ceil(minSoc + reserveKwh / capacityKwh * 100)));
}

// Schreibt das verbleibende Nacht-Entladebudget (kWh ueber dem Ziel) in das
// Anzeige-Item IBM_NACHTBUDGET.
function publishNightBudget(soc, zielSoc, capacityKwh) {
  var item = readItem('IBM_NACHTBUDGET');
  if (item === null) return;
  var budget = capacityKwh === null ? null : Math.max(0, Math.round((soc - zielSoc) / 100 * capacityKwh * 10) / 10);
  if (budget === null) item.postUpdate('NULL'); else item.postUpdate(budget);
}

// Lokales Ladesperre-Ende in Minuten seit Mitternacht - oder null, wenn es
// (noch) nicht berechenbar ist. Rueckwaerts vom Abend gerechnet: Die morgens
// fehlende Energie, geteilt durch die gelernte Ladeleistung, ergibt die
// noetige Ladezeit; die wird mit Sicherheitsaufschlag vor den (um
// LOCAL_FULL_BUFFER_MIN vorgezogenen) Abend-Crossover gelegt. Als fehlende
// Energie gilt, was dem aktuellen Ladestand bis LOCAL_CHARGE_FRACTION der
// Kapazitaet fehlt - eine halb volle Batterie darf laenger gesperrt bleiben
// als eine leere. Waehrend der Sperre laedt die Batterie nicht, der
// Ladestand und damit das Ende bleiben ueber den Vormittag praktisch
// konstant.
var LOCAL_CHARGE_FRACTION = 0.95;
function localChargeLockEnd() {
  if (!LOCAL_LOCK_ACTIVE) return null;
  if (EVENING_CROSSOVER_MIN === null) return null;
  var capacityKwh = estimatedCapacityKwh();
  var rateKw = estimatedChargeKw();
  if (capacityKwh === null || rateKw === null) {
    console.log('[IBM][Ladesperre] Noch keine belastbare Kapazitaets- oder Ladeleistungsschaetzung - Server-Ende gilt');
    return null;
  }
  var socNow = parseFloat(items.getItem('@IBM_SOC_ITEM@').numericState);
  if (isNaN(socNow)) socNow = 0;
  var missingKwh = capacityKwh * Math.max(0, LOCAL_CHARGE_FRACTION - socNow / 100);
  var chargeMinutes = Math.round(missingKwh / rateKw * LOCAL_SAFETY_FACTOR * 60);
  var deadline = EVENING_CROSSOVER_MIN - LOCAL_FULL_BUFFER_MIN;
  return Math.min(deadline - chargeMinutes, LOCAL_LATEST_END_MIN);
}

// --- Netzladeschutz: Erkennung und Zustand ----------------------------------
// Zustand als JSON in einem String-Item (persistiert):
//   zaehler  aufeinanderfolgende Zyklen mit erkannter Netto-Netzladung
//   zeit     Zeitpunkt des letzten Laufs (Lueckenerkennung)

function readNetzladeState() {
  var item = readItem('IBM_NETZLADE_WAECHTER');
  if (item === null) return null;
  var state = String(item.state);
  if (state === 'NULL' || state === 'UNDEF' || state === '') return {};
  try {
    var parsed = JSON.parse(state);
    return (parsed !== null && typeof parsed === 'object') ? parsed : {};
  } catch (e) {
    return {};
  }
}

function writeNetzladeState(st) {
  var item = readItem('IBM_NETZLADE_WAECHTER');
  if (item !== null) item.postUpdate(JSON.stringify(st));
}

// Aktuelle Netto-Netzladung der Batterie in Watt: min(Ladeleistung, Bezug),
// wenn beide ueber der Schwelle liegen, sonst 0. null, wenn Batterie- oder
// Netzleistungs-Item fehlen (dann bleibt der Waechter aus).
function currentNetzladungW() {
  var batt = readItem('@IBM_BATTERY_POWER_ITEM@');
  var grid = readItem('@IBM_GRID_POWER_ITEM@');
  if (batt === null || grid === null) return null;
  var chargingW = -parseFloat(batt.numericState); // Batterie negativ = laden
  var importW = parseFloat(grid.numericState);    // Netz positiv = Bezug
  if (isNaN(chargingW) || isNaN(importW)) return null;
  if (chargingW < NETZLADE_THRESHOLD_W || importW < NETZLADE_THRESHOLD_W) return 0;
  return Math.round(Math.min(chargingW, importW));
}

// Aktuelle Einspeisung aus der Batterie in Watt: die Batterie entlaedt (+)
// und das Netz nimmt auf (Netzleistung negativ) - der kleinere der beiden
// Werte fliesst tatsaechlich von der Batterie ins Netz, der Rest der
// Entladung versorgt den Haushalt. null, wenn Leistungs-Items fehlen.
function currentEinspeisungW() {
  var batt = readItem('@IBM_BATTERY_POWER_ITEM@');
  var grid = readItem('@IBM_GRID_POWER_ITEM@');
  if (batt === null || grid === null) return null;
  var dischargeW = parseFloat(batt.numericState); // Batterie positiv = entladen
  var exportW = -parseFloat(grid.numericState);   // Netz negativ = Einspeisung
  if (isNaN(dischargeW) || isNaN(exportW)) return null;
  return Math.round(Math.min(Math.max(dischargeW, 0), Math.max(exportW, 0)));
}

// --- Laderegelung: PWM-Zustand und Slot-Planung -----------------------------
// PWM-Zustand als JSON in einem String-Item (persistiert):
//   schuld     angesammelte Sperrschuld in Slots (Bresenham-Akkumulator:
//              jeder Slot addiert seinen Sperranteil, jeder gesperrte Slot
//              zieht 1 ab - im Mittel entsteht so die Ziel-Leistung)
//   sperren    Entscheidung des laufenden 15-Minuten-Blocks
//   restSlots  verbleibende Slots des laufenden Blocks
//   zeit       Zeitpunkt des letzten Laufs (Lueckenerkennung)

function readRegulationState() {
  var item = readItem('IBM_LADEREGELUNG_STATUS');
  if (item === null) return null;
  var state = String(item.state);
  if (state === 'NULL' || state === 'UNDEF' || state === '') return {};
  try {
    var parsed = JSON.parse(state);
    return (parsed !== null && typeof parsed === 'object') ? parsed : {};
  } catch (e) {
    return {};
  }
}

function writeRegulationState(st) {
  var item = readItem('IBM_LADEREGELUNG_STATUS');
  if (item !== null) item.postUpdate(JSON.stringify(st));
}

// --- Laderegelung: stundenbasierte Restladezeit -----------------------------
// Liest ein Stunden-JSON-Item ({datum, zeit, stunden: [{zeit: "HH:MM", ...}]})
// und liefert das geparste Objekt - oder null, wenn es fehlt, nicht fuer
// heute gilt oder der Abruf zu lange her ist. Veraltete oder fremde Tage
// duerfen die Regelung nicht treiben (gleiche Philosophie wie bei der
// Wolkenvorschau).
function readHourlyJson(itemName) {
  var item = readItem(itemName);
  if (item === null) return null;
  var state = String(item.state);
  if (state === 'NULL' || state === 'UNDEF' || state === '' || state === '-') return null;
  var parsed;
  try {
    parsed = JSON.parse(state);
  } catch (e) {
    return null;
  }
  if (parsed === null || typeof parsed !== 'object' || !Array.isArray(parsed.stunden)) return null;
  var m = now.monthValue();
  var d = now.dayOfMonth();
  var today = now.year() + '-' + (m < 10 ? '0' : '') + m + '-' + (d < 10 ? '0' : '') + d;
  if (String(parsed.datum) !== today) return null;
  try {
    var fetched = time.ZonedDateTime.parse(String(parsed.zeit));
    if (time.Duration.between(fetched, now).toHours() >= REG_HOURLY_MAX_AGE_HOURS) return null;
  } catch (e) {
    return null;
  }
  return parsed;
}

// Ueberlappung der Stunde ab `zeit` ("HH:MM") mit [jetzt, deadline) in Stunden.
function hourOverlapH(zeit, deadlineMin) {
  var match = String(zeit).match(/^(\d{1,2}):(\d{2})/);
  if (match === null) return 0;
  var start = parseInt(match[1], 10) * 60 + parseInt(match[2], 10);
  var overlap = Math.min(start + 60, deadlineMin) - Math.max(start, nowMinutes);
  return overlap > 0 ? overlap / 60 : 0;
}

// Effektive (sonnengewichtete) Restladezeit bis zur Deadline in Stunden:
// bevorzugt aus den Ladefaktoren der Token-API, sonst aus den stuendlichen
// Wolkenwerten. null, wenn keine brauchbaren Stundendaten vorliegen - dann
// rechnet die Regelung mit der ungewichteten Restzeit weiter.
function effectiveChargeHours(deadlineMin) {
  var faktoren = readHourlyJson('Ischlstrom_Ladefaktoren');
  if (faktoren !== null) {
    var sum = 0;
    var any = false;
    for (var i = 0; i < faktoren.stunden.length; i++) {
      var f = parseFloat(faktoren.stunden[i].faktor);
      if (isNaN(f)) continue;
      if (f < 0) f = 0;
      if (f > 1) f = 1;
      sum += f * hourOverlapH(faktoren.stunden[i].zeit, deadlineMin);
      any = true;
    }
    if (any) return { hours: sum, quelle: 'Erzeugungsprofil' };
  }
  var wolken = readHourlyJson('Ischlstrom_Wolken_Stunden');
  if (wolken !== null) {
    var wsum = 0;
    var wany = false;
    for (var j = 0; j < wolken.stunden.length; j++) {
      var w = parseFloat(wolken.stunden[j].wolken);
      if (isNaN(w) || w < 0 || w > 100) continue;
      wsum += (1 - w / 100) * hourOverlapH(wolken.stunden[j].zeit, deadlineMin);
      wany = true;
    }
    if (wany) return { hours: wsum, quelle: 'Wolkenstunden' };
  }
  return null;
}

// Mittlere Bewoelkung der Reststunden bis zur Deadline - fuer den
// Truebe-Waechter der Regelung. null ohne Stundendaten; dann gilt wie
// bisher die Mittagsfenster-Vorschau (die ab 12:00 allerdings schon den
// morgigen Tag meint).
function remainingCloudMean(deadlineMin) {
  var wolken = readHourlyJson('Ischlstrom_Wolken_Stunden');
  if (wolken === null) return null;
  var sum = 0;
  var hours = 0;
  for (var i = 0; i < wolken.stunden.length; i++) {
    var w = parseFloat(wolken.stunden[i].wolken);
    if (isNaN(w) || w < 0 || w > 100) continue;
    var ov = hourOverlapH(wolken.stunden[i].zeit, deadlineMin);
    sum += w * ov;
    hours += ov;
  }
  return hours > 0 ? Math.round(sum / hours) : null;
}

// Plant den aktuellen Steuer-Slot der Laderegelung - oder null, wenn die
// Regelung gerade nicht zustaendig ist (dann gilt das klassische
// Sperrfenster). Rueckgabe:
//   sperren  diesen Slot per ibmPreventCharge sperren (PWM-Weg)
//   limitW   Ladeleistung direkt auf diesen Wert begrenzen (Adapter-Weg)
//   sollW    berechnete Ziel-Ladeleistung (Anzeige/Status-Push)
//   aktiv    false = die Regelung laeuft, begrenzt aber gerade nicht
function chargeRegulationPlan() {
  if (!chargeLockDateOk || CHARGE_LOCK_START_MIN === null || EVENING_CROSSOVER_MIN === null) return null;
  var deadline = EVENING_CROSSOVER_MIN - LOCAL_FULL_BUFFER_MIN;
  if (nowMinutes < CHARGE_LOCK_START_MIN || nowMinutes >= deadline) return null;

  var capacityKwh = estimatedCapacityKwh();
  var rateKw = estimatedChargeKw();
  if (capacityKwh === null || rateKw === null) {
    console.log('[IBM][Laderegelung] Noch keine belastbare Kapazitaets- oder Ladeleistungsschaetzung - Sperrfenster gilt');
    return null;
  }
  var soc = parseFloat(items.getItem('@IBM_SOC_ITEM@').numericState);
  if (isNaN(soc) || soc < 0 || soc > 100) return null;

  // Truebe-Waechter: bevorzugt die mittlere Bewoelkung der Reststunden bis
  // zur Deadline (richtiger Tag, richtiges Zeitfenster); ohne Stundendaten
  // wie bisher die Mittagsfenster-Vorschau. Ueber der Schwelle laedt die
  // Batterie frei - als Entscheidung der Regelung (nicht als Rueckfall ins
  // Sperrfenster, das denselben trueben Tag sonst anhand der
  // Mittags-Vorschau womoeglich doch sperren wuerde). Ohne verlaessliche
  // Vorschau gilt das Sperrfenster, das dann selbst nicht sperrt.
  var clouds = cloudForecast();
  var restClouds = remainingCloudMean(deadline);
  var guardClouds = (restClouds !== null) ? restClouds : clouds;
  if (guardClouds === null) return null;
  if (guardClouds >= CLOUD_THRESHOLD) {
    console.log('[IBM][Laderegelung] Wolken=' + guardClouds + '% (>=' + CLOUD_THRESHOLD + '%) - Rest des Tages trueb, Laden bleibt frei');
    return { sperren: false, limitW: null, sollW: 0, aktiv: false };
  }

  // Ziel-Ladeleistung: fehlende Energie / verbleibende Zeit. Die Restzeit
  // ist sonnengewichtet (effectiveChargeHours), sobald Stundendaten
  // vorliegen - jede Stunde zaehlt dann nur mit ihrem erwarteten Ertrag.
  // Nur ohne Stundendaten zaehlt jede Stunde gleich und der
  // wolkenabhaengige Sicherheitsfaktor gleicht pauschal aus.
  var missingKwh = Math.max(0, (REG_TARGET_SOC - soc) / 100 * capacityKwh);
  var effRest = effectiveChargeHours(deadline);
  var restH;
  var restQuelle;
  var safety;
  if (effRest !== null) {
    restH = Math.max(effRest.hours, REG_MIN_EFF_HOURS);
    restQuelle = effRest.quelle;
    safety = REG_SAFETY_FIXED;
  } else {
    restH = (deadline - nowMinutes) / 60;
    restQuelle = 'ungewichtet';
    safety = REG_SAFETY_SUNNY + guardClouds / 100 * (REG_SAFETY_CLOUDY - REG_SAFETY_SUNNY);
  }
  var sollKw = missingKwh / restH * safety;
  var duty = (missingKwh <= 0) ? 0 : 1 - sollKw / rateKw;
  if (duty <= REG_MIN_DUTY) duty = 0;
  if (duty > REG_MAX_DUTY) duty = REG_MAX_DUTY;
  var sollW = Math.round(sollKw * 1000);
  console.log('[IBM][Laderegelung] SoC=' + soc + '%, fehlen ~' + (Math.round(missingKwh * 10) / 10)
    + ' kWh, Restladezeit ' + (Math.round(restH * 10) / 10) + ' h (' + restQuelle + ') bis ' + fmtMinutes(deadline)
    + ', Wolken=' + guardClouds + '% -> Ziel ' + sollW + ' W (Laderate ' + rateKw + ' kW, Sperranteil '
    + Math.round(duty * 100) + '%)');

  // Direkte Begrenzung, wenn der Adapter sie kann: Ziel-Leistung quantisiert
  // kommandieren, nie unter den Boden von (1 - REG_MAX_DUTY) der Laderate.
  if (typeof ibmLimitCharge === 'function') {
    if (duty === 0) return { sperren: false, limitW: null, sollW: sollW, aktiv: false };
    var floorW = Math.round(rateKw * 1000 * (1 - REG_MAX_DUTY));
    var limitW = Math.max(sollW, floorW, REG_LIMIT_STEP_W);
    limitW = Math.round(limitW / REG_LIMIT_STEP_W) * REG_LIMIT_STEP_W;
    return { sperren: false, limitW: limitW, sollW: sollW, aktiv: true };
  }

  // PWM-Weg: Entscheidung je 15-Minuten-Block, mit Hysterese auf der
  // Sperrschuld - erst ab REG_HYST_ON wird ein freier Block zum Sperr-Block,
  // erst unter REG_HYST_OFF wieder frei.
  var st = readRegulationState();
  if (st === null) {
    console.log('[IBM][Laderegelung] Item IBM_LADEREGELUNG_STATUS fehlt - Sperrfenster gilt (Setup-Skript 03 erneut ausfuehren)');
    return null;
  }
  var prev = null;
  try {
    if (st.zeit) prev = time.ZonedDateTime.parse(String(st.zeit));
  } catch (e) {
    prev = null;
  }
  if (prev === null || time.Duration.between(prev, now).toMinutes() > REG_MAX_GAP_MIN
      || typeof st.schuld !== 'number' || typeof st.restSlots !== 'number') {
    st = { schuld: 0, sperren: false, restSlots: 0 };
  }
  st.schuld += duty;
  if (st.schuld > REG_DEBT_MAX) st.schuld = REG_DEBT_MAX;
  if (duty === 0) {
    // Keine Begrenzung noetig - einen laufenden Sperr-Block sofort beenden
    // (freigeben ist immer die sichere Richtung).
    st.sperren = false;
    st.restSlots = 0;
  } else {
    if (st.restSlots <= 0) {
      var threshold = (st.sperren === true) ? REG_HYST_OFF : REG_HYST_ON;
      st.sperren = st.schuld >= threshold;
      st.restSlots = REG_BLOCK_SLOTS;
    }
    st.restSlots -= 1;
    if (st.sperren === true) {
      st.schuld -= 1;
      if (st.schuld < 0) st.schuld = 0;
    }
  }
  st.schuld = Math.round(st.schuld * 1000) / 1000;
  st.zeit = now.toString();
  writeRegulationState(st);
  return { sperren: st.sperren === true, limitW: null, sollW: sollW, aktiv: duty > 0 };
}

// --- Skript-Logik -----------------------------------------------------------
var now = time.ZonedDateTime.now();
var nowMinutes = now.hour() * 60 + now.minute();

// Prueft, ob die aktuelle Zeit im Fenster liegt (Minuten seit Mitternacht).
// Fenster duerfen ueber Mitternacht gehen (start > ende), z. B. 21:00-07:00.
function inWindow(startMin, endMin) {
  if (startMin === endMin) return false;
  if (startMin < endMin) return nowMinutes >= startMin && nowMinutes < endMin;
  return nowMinutes >= startMin || nowMinutes < endMin;
}

function fmtMinutes(m) {
  var h = Math.floor(m / 60);
  var mm = m % 60;
  return (h < 10 ? '0' : '') + h + ':' + (mm < 10 ? '0' : '') + mm;
}

// Ladesperre: Fenster aus der Tagesprognose, nur fuer das gemeldete Datum
// gueltig - ein nach einem API-Ausfall uebrig gebliebenes Fenster von
// gestern darf heute nicht sperren.
function chargeLockDateValid() {
  var item = readItem('Ischlstrom_Ladesperre_Datum');
  if (item === null) return false;
  var state = String(item.state);
  var m = now.monthValue();
  var d = now.dayOfMonth();
  var today = now.year() + '-' + (m < 10 ? '0' : '') + m + '-' + (d < 10 ? '0' : '') + d;
  if (state !== today) {
    console.log('[IBM][Konfig] Ladesperre-Fenster gilt fuer ' + state + ', heute ist ' + today + ' - wird ignoriert');
    return false;
  }
  return true;
}

var chargeLockStart = CHARGE_LOCK_START_MIN;
var chargeLockEnd   = CHARGE_LOCK_END_MIN;
var chargeLockDateOk = chargeLockDateValid();
var chargeLockReady = chargeLockStart !== null && chargeLockEnd !== null
  && chargeLockStart < chargeLockEnd && chargeLockDateOk;

// Entladung: vom Entladestart bis zum morgendlichen Crossover - solange die
// Gemeinschaft mehr verbraucht als erzeugt. Der Start kommt tagesaktuell
// von der Token-API (nur am Gueltigkeitstag des Fensters; nach Mitternacht
// ist das Datum von gestern, dann laeuft die Nacht ueber den Rueckfall
// weiter), sonst Abend-Crossover plus Abstand. Ohne plausible
// Crossover-Daten bleibt die Entladung aus (null).
var dischargeStart = null;
if (chargeLockDateOk && DISCHARGE_START_API_MIN !== null) {
  dischargeStart = DISCHARGE_START_API_MIN;
} else if (EVENING_CROSSOVER_MIN !== null) {
  dischargeStart = Math.min(EVENING_CROSSOVER_MIN + DISCHARGE_START_OFFSET_MIN, 23 * 60 + 59);
}
var dischargeEnd   = MORNING_CROSSOVER_MIN;

// Wolkenvorschau lesen: Wert 0-100 oder null, wenn ungueltig oder veraltet.
// Veraltete Werte (API-Ausfall) duerfen die Steuerung nicht treiben.
function cloudForecast() {
  var item = readItem('Ischlstrom_Wolkenvorschau');
  if (item === null) {
    console.log('[IBM][Wolken] Item Ischlstrom_Wolkenvorschau fehlt');
    return null;
  }
  var clouds = parseFloat(item.numericState);
  if (isNaN(clouds) || clouds < 0 || clouds > 100) {
    console.log('[IBM][Wolken] Wolkenvorschau ungueltig (' + clouds + '%)');
    return null;
  }
  var stamp = readItem('Ischlstrom_Wolkenvorschau_Zeit');
  if (stamp === null) {
    // aeltere Installation ohne Zeitstempel-Item: keine Aktualitaetspruefung
    return clouds;
  }
  var state = String(stamp.state);
  if (state === 'NULL' || state === 'UNDEF') {
    console.log('[IBM][Wolken] Kein Abrufzeitpunkt - Wolkenvorschau gilt als veraltet');
    return null;
  }
  try {
    var fetched = time.ZonedDateTime.parse(state);
    var ageHours = time.Duration.between(fetched, now).toHours();
    if (ageHours >= MAX_CLOUD_AGE_HOURS) {
      console.log('[IBM][Wolken] Wolkenvorschau veraltet (' + ageHours + 'h alt, max. ' + MAX_CLOUD_AGE_HOURS + 'h)');
      return null;
    }
  } catch (e) {
    console.log('[IBM][Wolken] Abrufzeitpunkt unlesbar (' + state + ') - Wolkenvorschau gilt als veraltet');
    return null;
  }
  return clouds;
}

// ----------------------------------------------------------------------------
// Gemeinsamer Schritt: Toggle-abhaengiger Reset und Pause
// ----------------------------------------------------------------------------
var toggleOn = onOff('Schalte_ISCHLSTROM_Empfehlung_einaus', false);

if (toggleOn) {
  var resetResult = ibmReset();
  console.log('[IBM] Toggle=ON - Reset (ok=' + (resetResult && resetResult.ok === true) + ')');
} else {
  console.log('[IBM] Toggle=OFF - Tue nichts');
  return;
}

// Pause (Unterseite "IBM pausieren"): solange Pausentage uebrig sind, wird
// nichts geplant - der Reset oben ist bereits passiert, der Wechselrichter
// arbeitet also wie ab Werk. Die Regel ibm_pause.js zaehlt das Item jede
// Nacht um 1 herunter; bei 0 laeuft die Steuerung von selbst wieder an.
var pauseDays = num('IBM_PAUSE_TAGE', 0, 0, 365);
if (pauseDays >= 1) {
  console.log('[IBM] Pausiert (noch ' + pauseDays + ' Tag' + (pauseDays === 1 ? '' : 'e') + ') - Tue nichts');
  return;
}

// ----------------------------------------------------------------------------
// Netzladeschutz: die Batterie laedt nur aus PV, nie aus dem Netz
// ----------------------------------------------------------------------------
// Laeuft in jedem Zyklus (Tag und Nacht). Greift der Schutz, wird in
// diesem Zyklus NUR die Ladesperre kommandiert und die regulaere Steuerung
// ausgesetzt - sie wuerde die Sperre sonst gleich wieder ueberschreiben.
var NETZLADESCHUTZ_ACTIVE = onOff('IBM_NETZLADESCHUTZ', FALLBACK_NETZLADESCHUTZ);
var netzladeBlock = false;
(function () {
  var w = currentNetzladungW();
  var display = readItem('IBM_NETZLADUNG');
  if (display !== null && w !== null) display.postUpdate(w);
  var st = readNetzladeState();
  if (st === null) return; // Item fehlt (aeltere Installation) - Waechter aus
  if (w === null || w <= 0) {
    if (typeof st.zaehler === 'number' && st.zaehler > 0) {
      writeNetzladeState({ zaehler: 0, zeit: now.toString() });
    }
    return;
  }
  var prev = null;
  try {
    if (st.zeit) prev = time.ZonedDateTime.parse(String(st.zeit));
  } catch (e) {
    prev = null;
  }
  var zaehler = (typeof st.zaehler === 'number' && prev !== null
    && time.Duration.between(prev, now).toMinutes() <= NETZLADE_MAX_GAP_MIN)
    ? st.zaehler : 0;
  zaehler += 1;
  writeNetzladeState({ zaehler: zaehler, zeit: now.toString() });
  console.log('[IBM][Netzladeschutz] Batterie laedt netto ~' + w + ' W aus dem Netz ('
    + zaehler + '. Zyklus in Folge)');
  if (!NETZLADESCHUTZ_ACTIVE) return;
  if (zaehler < NETZLADE_TRIGGER_CYCLES) return;
  var soc = parseFloat(items.getItem('@IBM_SOC_ITEM@').numericState);
  if (isNaN(soc) || soc < NETZLADE_MIN_SOC) {
    console.log('[IBM][Netzladeschutz] Ladestand ' + soc + '% unter ' + NETZLADE_MIN_SOC
      + '% - vermutlich Schutzladung des Wechselrichters, nur Warnung');
    return;
  }
  var res = ibmPreventCharge(IBM_SLOT_MINUTES);
  netzladeBlock = true;
  console.log('[IBM][Netzladeschutz] Laden gesperrt fuer ' + IBM_SLOT_MINUTES
    + ' min (nur aus PV, nie aus dem Netz) | ok=' + (res && res.ok === true));
})();

// ----------------------------------------------------------------------------
// Einspeise-Zaehler: Energie aus der Batterie ins Netz aufsummieren
// ----------------------------------------------------------------------------
// Laeuft in jedem Zyklus (Tag und Nacht). Tagsueber ist die Einspeisung aus
// der Batterie praktisch 0 (die Batterie entlaedt nicht, waehrend PV
// exportiert), gezaehlt wird die naechtliche Einspeisung an die Gemeinschaft.
(function () {
  var w = currentEinspeisungW();
  if (w === null) return; // Leistungs-Items fehlen - Zaehler aus
  var item = readItem('IBM_NETZEINSPEISUNG_ZAEHLER');
  if (item === null) return; // aeltere Installation ohne Zaehler-Item
  var st = {};
  var state = String(item.state);
  if (state !== 'NULL' && state !== 'UNDEF' && state !== '') {
    try {
      var parsed = JSON.parse(state);
      if (parsed !== null && typeof parsed === 'object') st = parsed;
    } catch (e) { /* kaputter Zustand - neu aufsetzen */ }
  }
  var kwh = (typeof st.kwh === 'number' && isFinite(st.kwh) && st.kwh >= 0) ? st.kwh : 0;
  var prev = null;
  try {
    if (st.zeit) prev = time.ZonedDateTime.parse(String(st.zeit));
  } catch (e) {
    prev = null;
  }
  if (prev !== null) {
    var gapMin = time.Duration.between(prev, now).toMillis() / 60000;
    if (gapMin > 0 && gapMin <= EINSPEISE_MAX_GAP_MIN) {
      kwh += w * (gapMin / 60) / 1000;
    }
  }
  // Baselines fuer die Main UI: Zaehlerstand am Beginn der Kalenderwoche
  // (Montag) und des Monats, mitgefuehrt im selben JSON. Beim Periodenwechsel
  // wird die Baseline auf den aktuellen Stand gesetzt; faellt der Zaehler
  // unter eine Baseline (Zustand teilweise verloren), zaehlt sie ab 0 weiter.
  var today = now.toLocalDate();
  var weekKey = today.minusDays(today.dayOfWeek().value() - 1).toString();
  var monthKey = today.withDayOfMonth(1).toString();
  if (st.wo !== weekKey || typeof st.woKwh !== 'number' || !isFinite(st.woKwh)) {
    st.wo = weekKey;
    st.woKwh = kwh;
  }
  if (st.mo !== monthKey || typeof st.moKwh !== 'number' || !isFinite(st.moKwh)) {
    st.mo = monthKey;
    st.moKwh = kwh;
  }
  if (st.woKwh > kwh) st.woKwh = 0;
  if (st.moKwh > kwh) st.moKwh = 0;
  item.postUpdate(JSON.stringify({
    kwh: Math.round(kwh * 1e6) / 1e6, zeit: now.toString(),
    wo: st.wo, woKwh: Math.round(st.woKwh * 1e6) / 1e6,
    mo: st.mo, moKwh: Math.round(st.moKwh * 1e6) / 1e6
  }));
  publishItem('IBM_BATTERIE_NETZEINSPEISUNG_KWH', String(Math.round(kwh * 100) / 100));
  publishItem('IBM_BATTERIE_NETZEINSPEISUNG_WOCHE_KWH', String(Math.round((kwh - st.woKwh) * 100) / 100));
  publishItem('IBM_BATTERIE_NETZEINSPEISUNG_MONAT_KWH', String(Math.round((kwh - st.moKwh) * 100) / 100));
})();

// ----------------------------------------------------------------------------
// Laderegelung: Ladeleistung dynamisch regeln statt Sperrfenster
// ----------------------------------------------------------------------------
// Liefert die Planung einen Slot (alle Voraussetzungen erfuellt), ersetzt
// sie das Sperrfenster komplett - Server-Ende, individualisiertes Ende und
// lokale Flatrate-Rechnung sind dann alle drei nicht mehr noetig, weil der
// Regelkreis auf den Live-Ladestand besser reagiert als jede
// Vorausberechnung. Bei null gilt das bisherige Verhalten unveraendert.
// Das aktuelle Soll steht in IBM_LADEREGELUNG_SOLL (Anzeige und
// Status-Push), '-' wenn gerade nicht begrenzt wird.
var REGULATION_ACTIVE = onOff('IBM_LADEREGELUNG', FALLBACK_REGULATION_ACTIVE);
var regulationPlan = (CHARGE_LOCK_ACTIVE && REGULATION_ACTIVE) ? chargeRegulationPlan() : null;
if (regulationPlan !== null && regulationPlan.aktiv) {
  publishItem('IBM_LADEREGELUNG_SOLL', regulationPlan.sollW + ' W');
} else {
  publishItem('IBM_LADEREGELUNG_SOLL', '-');
}

// Effektive Restladezeit fuer Anzeige und Status-Push: sonnengewichtete
// Ladezeit, die bis zur Abend-Deadline noch bleibt. Unabhaengig vom Plan
// berechnet (auch bei abgeschalteter Regelung informativ), '-' ausserhalb
// des Tages oder ohne Stundendaten.
var restladezeitText = '-';
if (EVENING_CROSSOVER_MIN !== null) {
  var restDeadline = EVENING_CROSSOVER_MIN - LOCAL_FULL_BUFFER_MIN;
  if (nowMinutes < restDeadline) {
    var restEff = effectiveChargeHours(restDeadline);
    if (restEff !== null) {
      restladezeitText = (Math.round(restEff.hours * 10) / 10) + ' h';
    }
  }
}
publishItem('IBM_RESTLADEZEIT', restladezeitText);

// ----------------------------------------------------------------------------
// Lokale Ladesperre: eigenes Sperr-Ende aus Batteriegroesse und Ladeleistung
// ----------------------------------------------------------------------------
// Meldet die API ein individualisiertes Ende (Ischlstrom_Ladesperre_
// Individuell=ON, Token-API mit Erzeugungsprofil und den gepushten
// Schaetzwerten dieser Anlage), gilt es unveraendert - die lokale
// Flatrate-Rechnung ist dann nur noch der Rueckfall fuer Community-Fenster
// und API-Ausfall. Ist das lokale Ende berechenbar, ersetzt es das
// Community-Ende - auch nach hinten ("moeglichst spaet laden"), begrenzt
// auf LOCAL_LATEST_END_MIN. Liegt es vor dem Fensterbeginn, braucht die
// Anlage den ganzen Tag zum Laden und es wird gar nicht gesperrt.
// Datum-Pruefung und Fensterbeginn (erster Sonnenschein) kommen immer vom
// Server. Das lokal berechnete Ende steht in IBM_LADESPERRE_LOKAL_ENDE
// (Anzeige und Status-Push), '-' wenn gerade ein Server-Ende gilt oder
// heute nicht gesperrt wird.
var serverEndIndividual = onOff('Ischlstrom_Ladesperre_Individuell', false);
if (regulationPlan !== null) {
  // Die Laderegelung ersetzt Server- und Lokal-Ende - kein Sperr-Ende noetig.
  publishItem('IBM_LADESPERRE_LOKAL_ENDE', '-');
} else if (chargeLockReady && serverEndIndividual) {
  console.log('[IBM][Ladesperre] Server-Ende ' + fmtMinutes(chargeLockEnd) + ' ist fuer diese Anlage individualisiert - lokale Berechnung uebersprungen');
  publishItem('IBM_LADESPERRE_LOKAL_ENDE', '-');
} else if (chargeLockReady) {
  var localEnd = localChargeLockEnd();
  if (localEnd === null) {
    publishItem('IBM_LADESPERRE_LOKAL_ENDE', '-');
  } else if (localEnd <= chargeLockStart) {
    console.log('[IBM][Ladesperre] Lokales Ende ' + fmtMinutes(Math.max(localEnd, 0)) + ' liegt vor dem Fensterbeginn ' + fmtMinutes(chargeLockStart) + ' - die Anlage braucht den ganzen Tag, keine Sperre heute');
    chargeLockReady = false;
    publishItem('IBM_LADESPERRE_LOKAL_ENDE', '-');
  } else {
    if (localEnd !== chargeLockEnd) {
      console.log('[IBM][Ladesperre] Lokales Ende ' + fmtMinutes(localEnd) + ' ersetzt Server-Ende ' + fmtMinutes(chargeLockEnd));
    }
    chargeLockEnd = localEnd;
    publishItem('IBM_LADESPERRE_LOKAL_ENDE', fmtMinutes(localEnd));
  }
} else {
  publishItem('IBM_LADESPERRE_LOKAL_ENDE', '-');
}

// Ladeleistung lernen: nur tagsueber zwischen Fensterbeginn und
// Abend-Deadline, wenn die Batterie frei laden darf (keine Sperre und keine
// Leistungsbegrenzung moeglich), die Vorschau Sonne meldet und der
// Ladestand unter der Drossel-Zone liegt. In freien PWM-Bloecken der
// Laderegelung wird weiter gemessen (dort laedt die Batterie unbegrenzt);
// unter einer direkten Leistungsbegrenzung nie - die Stichprobe wuerde
// sonst das Limit statt der Anlage messen und die Schaetzung nach unten
// ziehen.
function sampleChargeRate() {
  if (netzladeBlock) return; // gesperrter Slot - keine Messstrecke
  if (!LOCAL_LOCK_ACTIVE && !REGULATION_ACTIVE) return;
  if (!chargeLockDateOk || CHARGE_LOCK_START_MIN === null || EVENING_CROSSOVER_MIN === null) return;
  var capacityKwh = estimatedCapacityKwh();
  if (capacityKwh === null) return;
  var deadline = EVENING_CROSSOVER_MIN - LOCAL_FULL_BUFFER_MIN;
  if (nowMinutes < CHARGE_LOCK_START_MIN || nowMinutes >= deadline) return;
  if (regulationPlan !== null && (regulationPlan.sperren || regulationPlan.limitW !== null)) return;
  if (regulationPlan === null && chargeLockReady && inWindow(chargeLockStart, chargeLockEnd)) return;
  var clouds = cloudForecast();
  if (clouds === null || clouds >= CLOUD_THRESHOLD) return;
  var soc = parseFloat(items.getItem('@IBM_SOC_ITEM@').numericState);
  if (isNaN(soc) || soc > CHARGE_RATE_MAX_SOC) return;
  updateChargeRateEstimate(soc, capacityKwh);
}
sampleChargeRate();

// Hauslast lernen: nur nachts im Entladefenster und nur in Zyklen, in denen
// die Steuerung nicht einspeist (die Batterie versorgt dann allein das
// Haus), oberhalb der Wechselrichter-eigenen Reserve. Laeuft nach der
// Zeitfenster-Weiche, damit der Entladebefehl dieses Zyklus bekannt ist;
// er bricht die Messstrecke ab. Tagsueber (Laden) greift die Messung nicht.
var dischargeCommanded = false;
function sampleHouseLoad() {
  if (dischargeStart === null || dischargeEnd === null) return;
  if (!inWindow(dischargeStart, dischargeEnd)) return;
  var capacityKwh = estimatedCapacityKwh();
  if (capacityKwh === null) return;
  if (dischargeCommanded) {
    clearHouseLoadMeasurement();
    return;
  }
  var soc = parseFloat(items.getItem('@IBM_SOC_ITEM@').numericState);
  if (isNaN(soc) || soc < HOUSE_LOAD_MIN_SOC) return;
  updateHouseLoadEstimate(soc, capacityKwh);
}

// ----------------------------------------------------------------------------
// Teil A: Laderegelung - Ladeleistung dynamisch begrenzen
// ----------------------------------------------------------------------------
// Der Reset zu Beginn des Zyklus hat den Wechselrichter bereits freigegeben -
// ein freier Slot braucht deshalb keine Aktion.
function handleChargeRegulation(plan) {
  if (plan.limitW !== null) {
    var res = ibmLimitCharge(plan.limitW, IBM_SLOT_MINUTES);
    var appliedW = (res && typeof res.appliedW === 'number') ? res.appliedW : plan.limitW;
    console.log('[IBM][Laderegelung] Ladeleistung begrenzt auf ' + appliedW + ' W fuer ' + IBM_SLOT_MINUTES + ' min | ok=' + (res && res.ok === true));
    return;
  }
  if (plan.sperren) {
    var res2 = ibmPreventCharge(IBM_SLOT_MINUTES);
    console.log('[IBM][Laderegelung] Sperr-Block - Laden gesperrt fuer ' + IBM_SLOT_MINUTES + ' min | ok=' + (res2 && res2.ok === true));
    return;
  }
  console.log('[IBM][Laderegelung] Freier Block - Laden erlaubt');
}

// ----------------------------------------------------------------------------
// Teil A (Rueckfall): Ladesperre bei geringer Bewoelkung
// ----------------------------------------------------------------------------
function handleChargeLock() {
  var clouds = cloudForecast();
  if (clouds === null) {
    // Ohne verlaessliche Vorschau nicht sperren - Laden bleibt erlaubt.
    console.log('[IBM][Ladesperre] Keine verlaessliche Wolkenvorschau - Laden wird nicht gesperrt');
    return;
  }
  if (clouds >= CLOUD_THRESHOLD) {
    console.log('[IBM][Ladesperre] Wolkenvorschau=' + clouds + '% - Laden wird nicht gesperrt');
    return;
  }

  // Laden sperren
  var res = ibmPreventCharge(IBM_SLOT_MINUTES);
  console.log('[IBM][Ladesperre] Wolkenvorschau=' + clouds + '% (<' + CLOUD_THRESHOLD + '%) - Laden gesperrt fuer ' + IBM_SLOT_MINUTES + ' min | ok=' + (res && res.ok === true));
}

// ----------------------------------------------------------------------------
// Teil B: Forcierte Entladung
// ----------------------------------------------------------------------------
function handleForcedDischarge() {

  var soc = parseFloat(items.getItem('@IBM_SOC_ITEM@').numericState);
  var minSoc = parseFloat(items.getItem('IBM_MIN_BATTERY_CHARGE').numericState);

  if (isNaN(minSoc) || minSoc <= 5 || minSoc > 90) {
    console.log('[IBM][Entladung] Battery min Level (' + minSoc + '%) - invalid value');
    return;
  }

  // Wolken einmal lesen: Rueckfall-Trueb-Stopp und spaeter die Leistung.
  var clouds = cloudForecast();

  if (isNaN(soc) || soc <= minSoc) {
    console.log('[IBM][Entladung] Battery too low (' + soc + '%) - skipping discharge schedule');
    return;
  }

  // Nachtziel aus Batteriegroesse und Hausverbrauch: tiefer als Reserve plus
  // Eigenbedarf bis zum naechsten Gemeinschafts-Ueberschuss wird nicht
  // entladen. Ohne belastbare Kapazitaetsschaetzung gilt nur die Reserve.
  var budgetCapacity = estimatedCapacityKwh();
  var budgetWirksam = budgetCapacity !== null;

  // Trueb-Stopp nur noch als Rueckfall ohne wirksames Budget: dann wuerde
  // bei bedeckter Vorschau bis zur Reserve entladen, und ueber eine lange
  // Nacht leert auch "minimale Leistung" die Batterie fast vollstaendig -
  // am trueben Folgetag muesste das Mitglied selbst Strom zukaufen. Mit
  // Budget uebernimmt die verlaengerte Reservedauer diese Rolle.
  if (!budgetWirksam && clouds !== null && clouds >= CLOUD_THRESHOLD) {
    console.log('[IBM][Entladung] Wolkenvorschau=' + clouds + '% (>=' + CLOUD_THRESHOLD + '%) und keine Kapazitaetsschaetzung - keine Einspeisung heute Nacht');
    publishNightBudget(soc, soc, null);
    return;
  }

  var zielSoc = minSoc;
  if (budgetWirksam) {
    var reserveKwh = nightReserveKwh(clouds);
    zielSoc = nightTargetSoc(minSoc, reserveKwh, budgetCapacity);
    console.log('[IBM][Entladung] Eigenbedarf ' + reserveKwh + ' kWh (' + houseLoadW() + ' W x ' + Math.round(nightReserveHours(clouds) * 10) / 10 + ' h x ' + NIGHT_RESERVE_FACTOR + ') bei ' + budgetCapacity + ' kWh -> Ziel-Ladestand ' + zielSoc + '% (aktuell ' + soc + '%)');
  }
  publishNightBudget(soc, zielSoc, budgetCapacity);
  if (soc <= zielSoc) {
    console.log('[IBM][Entladung] Nachtziel erreicht (SoC ' + soc + '% <= ' + zielSoc + '%) - keine weitere Einspeisung heute Nacht');
    return;
  }

  var dischargeMinW = parseFloat(items.getItem('Minimale_Entladeleistung_Batterieeinspeisung').numericState);
  var dischargeMaxW = parseFloat(items.getItem('Maximale_Entladeleistung_Batterieeinspeisung').numericState);

  if (isNaN(dischargeMinW) || dischargeMinW <= 0) {
    console.log('[IBM][Entladung] Minimale Entladeleistung invalid (' + dischargeMinW + 'W) - using default ' + FALLBACK_MIN_DISCHARGE_W + 'W');
    dischargeMinW = FALLBACK_MIN_DISCHARGE_W;
  }
  if (isNaN(dischargeMaxW) || dischargeMaxW <= 0) {
    console.log('[IBM][Entladung] Maximale Entladeleistung invalid (' + dischargeMaxW + 'W) - using default ' + FALLBACK_MAX_DISCHARGE_W + 'W');
    dischargeMaxW = FALLBACK_MAX_DISCHARGE_W;
  }
  if (dischargeMinW >= dischargeMaxW) {
    console.log('[IBM][Entladung] minW >= maxW (' + dischargeMinW + ' >= ' + dischargeMaxW + ') - using defaults');
    dischargeMinW = FALLBACK_MIN_DISCHARGE_W;
    dischargeMaxW = FALLBACK_MAX_DISCHARGE_W;
  }

  // Dynamische Entladeleistung: liegt eine belastbare Kapazitaetsschaetzung
  // vor, ersetzen C-Raten-basierte Werte die eingestellten Grenzen. Die
  // eingestellten Werte bleiben der Rueckfall, solange nichts geschaetzt ist.
  var dynamicActive = onOff('IBM_DYNAMISCHE_LEISTUNG', FALLBACK_DYNAMIC_POWER_ACTIVE);
  var capacityKwh = dynamicActive ? estimatedCapacityKwh() : null;
  if (capacityKwh !== null) {
    dischargeMinW = Math.round(capacityKwh * 1000 * DYNAMIC_MIN_C_RATE);
    dischargeMaxW = Math.round(capacityKwh * 1000 * DYNAMIC_MAX_C_RATE);
    console.log('[IBM][Entladung] Dynamische Leistung: Kapazitaet ~' + capacityKwh + ' kWh -> min=' + dischargeMinW + 'W, max=' + dischargeMaxW + 'W');
  } else if (dynamicActive) {
    console.log('[IBM][Entladung] Noch keine belastbare Kapazitaetsschaetzung - verwende eingestellte Entladeleistung');
  }

  // Harte Sicherheits-Obergrenze - gilt fuer eingestellte UND dynamische Werte.
  if (dischargeMaxW > ABSOLUTE_MAX_DISCHARGE_W) {
    console.log('[IBM][Entladung] maxW=' + dischargeMaxW + 'W ueber der harten Obergrenze - begrenzt auf ' + ABSOLUTE_MAX_DISCHARGE_W + 'W');
    dischargeMaxW = ABSOLUTE_MAX_DISCHARGE_W;
  }
  if (dischargeMinW > dischargeMaxW) dischargeMinW = dischargeMaxW;

  console.log('[IBM][Entladung] Entladeleistung: min=' + dischargeMinW + 'W, max=' + dischargeMaxW + 'W');

  if (clouds === null) {
    // Konservativ: ohne verlaessliche Vorschau so entladen, als waere der
    // naechste Tag komplett bewoelkt (minimale Leistung), damit die Batterie
    // bei einem API-Ausfall nicht mit Maximalleistung leerlaeuft.
    console.log('[IBM][Entladung] Keine verlaessliche Wolkenvorschau - entlade mit minimaler Leistung');
    clouds = 100;
  }

  // 0% Wolken -> maxW, 100% Wolken -> minW (linear interpoliert)
  var dischargeW = Math.round(dischargeMaxW - (clouds / 100) * (dischargeMaxW - dischargeMinW));
  console.log('[IBM][Entladung] Wolkenvorschau=' + clouds + '% -> dischargeW=' + dischargeW + 'W');

  dischargeCommanded = true;
  var res = ibmForceDischarge(dischargeW, IBM_SLOT_MINUTES);
  var ok = res && res.ok === true;
  var appliedW = (res && typeof res.appliedW === 'number' && res.appliedW > 0) ? res.appliedW : dischargeW;

  updateCapacityEstimate(soc, appliedW, ok);

  console.log('[IBM][Entladung] SoC=' + soc + '% | kommandiert=' + appliedW + 'W fuer ' + IBM_SLOT_MINUTES + ' min | ok=' + ok);
}

// ----------------------------------------------------------------------------
// Zeitfenster-Weiche: entscheidet, welcher Teil ausgefuehrt wird
// ----------------------------------------------------------------------------
if (CHARGE_LOCK_ACTIVE && !chargeLockReady && regulationPlan === null) {
  console.log('[IBM] Kein gueltiges Ladesperre-Fenster fuer heute - Laden bleibt erlaubt');
}

if (netzladeBlock) {
  console.log('[IBM] Netzladeschutz hat das Laden gesperrt - regulaere Steuerung in diesem Zyklus ausgesetzt');
} else if (CHARGE_LOCK_ACTIVE && regulationPlan !== null) {
  console.log('[IBM] Zeitfenster Tag (' + fmtMinutes(nowMinutes) + ') - Laderegelung aktiv');
  handleChargeRegulation(regulationPlan);
} else if (CHARGE_LOCK_ACTIVE && chargeLockReady && inWindow(chargeLockStart, chargeLockEnd)) {
  console.log('[IBM] Zeitfenster Vormittag (' + fmtMinutes(nowMinutes) + ', ' + fmtMinutes(chargeLockStart) + '-' + fmtMinutes(chargeLockEnd) + ') - pruefe Ladesperre');
  handleChargeLock();
} else if (DISCHARGE_ACTIVE && (dischargeStart === null || dischargeEnd === null)) {
  console.log('[IBM] Keine plausiblen Crossover-Zeiten von ischlstrom.org - Entladung bleibt aus');
} else if (DISCHARGE_ACTIVE && inWindow(dischargeStart, dischargeEnd)) {
  console.log('[IBM] Zeitfenster Nacht (' + fmtMinutes(nowMinutes) + ', ' + fmtMinutes(dischargeStart) + '-' + fmtMinutes(dischargeEnd) + (chargeLockDateOk && DISCHARGE_START_API_MIN !== null ? ', Start laut Prognose' : ', Start = Crossover + ' + DISCHARGE_START_OFFSET_MIN + ' min') + ') - pruefe forcierte Entladung');
  handleForcedDischarge();
} else {
  console.log('[IBM] Ausserhalb beider Zeitfenster (' + fmtMinutes(nowMinutes) + ') - keine Aktion');
}

sampleHouseLoad();
