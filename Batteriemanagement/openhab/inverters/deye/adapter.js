// ============================================================================
// IBM - Wechselrichter-Adapter: Deye Hybrid (SG04LP3/SG05LP3, Modbus)
//
// Definiert die drei Funktionen des Adapter-Kontrakts (siehe control/core.js)
// ueber den Time-of-Use-Verkaufsfahrplan (TOU) der proprietaeren
// Deye-Registerkarte (3-phasige Niedervolt-Familie, Modbus RTU hinter einem
// RS485-Ethernet-Gateway - kein SunSpec). Die Register haengen als Items an
// den Data-Things des Setups (inverter_things_json im Profil):
//
//   IBM_DY_WorkMode    Work Mode (142, 0 = Selling first)
//   IBM_DY_MaxSellW    Max. Verkaufsleistung in W (143)
//   IBM_DY_SolarSell   PV-Einspeisung erlaubt (145, 0/1)
//   IBM_DY_TouEnable   TOU-Zeitplan an/aus (146)
//   IBM_DY_SellW1..6   TOU-Slot-Leistung in W (154-159)
//   IBM_DY_SellSoc1..6 TOU-Slot-Ziel-SoC in % (166-171)
//   IBM_DY_SellFlag1..6 TOU-Slot-Flags (172-177, Bit 0 Netzladen)
//
// Steuerlogik: alle 6 Slots werden IDENTISCH beschrieben - die
// Slot-Zeitgrenzen (148-153) bleiben unangetastet und sind damit egal,
// welcher Slot gerade gilt:
//   - Ladesperre:          TOU an + Slot-Leistung 0 + Netzladen aus. Die
//                          Batterie bleibt unbeteiligt (laedt und entlaedt
//                          nicht); PV versorgt Haushalt und Netz normal.
//   - forcierte Entladung: TOU an + Slot-Leistung in W + Ziel-SoC auf der
//                          Entladeuntergrenze. Einspeisen ins Netz setzt
//                          Work Mode 'Selling first' und 'Solar Sell'
//                          voraus - der Adapter aendert beides NICHT,
//                          sondern warnt nur (siehe Profil-README).
//   - Ruecksetzen:         TOU aus (146 = 0), die Anlage folgt wieder
//                          ihrem Grundmodus (Eigenverbrauch).
//
// EEPROM-Schonung: Deye legt Einstellregister mutmasslich in Flash ab
// (Spike-Punkt im README). Geschrieben wird deshalb NUR, wenn sich der
// Wert aendert (__ibmDyWrite liest erst das Item), und die Leistung wird
// auf DEYE_POWER_STEP_W quantisiert, damit die Wolken-Interpolation des
// Kerns nicht jeden Zyklus einen neuen Wert schreibt. Der Reset des Kerns
// (jeder Zyklus) und der Fensterbefehl togglen 146 dennoch zweimal je
// Zyklus INNERHALB der Fenster - Bewertung und ggf. Haertung im README.
//
// Fail-Safe: Deye kennt KEIN geraeteseitiges Auto-Revert wie das
// SunSpec-InOutWRte_RvrtTms - faellt openHAB mit aktivem TOU-Fahrplan aus,
// bleibt der kommandierte Zustand stehen. Der Kern setzt ausserhalb der
// Fenster in jedem 5-Minuten-Zyklus zurueck; das Restrisiko und der
// Spike-Punkt dazu stehen im README.md des Profils (DEYE_HAS_AUTO_REVERT
// unten dokumentiert den Spike-Befund). Das Mitglied kann den Zeitplan
// jederzeit am Display des Wechselrichters selbst abschalten.
//
// Sicherung gegen das falsche Geraet / die falsche Registerkarte:
// geschrieben wird nur, wenn Work Mode und TOU-Register lesbar und
// plausibel sind.
// ============================================================================

// --- Geraetekonstanten - IM SPIKE VERIFIZIEREN (README.md des Profils) ------

// Wert fuer "TOU-Zeitplan aktiv" in Register 146. Spike: manche Firmwares
// erwarten statt 0/1 eine Tages-Bitmaske (dann z. B. 255 = alle Tage).
var DEYE_TOU_ON = 1;
var DEYE_TOU_OFF = 0;

var DEYE_SLOT_COUNT = 6;

// Geraeteseitige Entladeuntergrenze je Slot in % - Backstop unterhalb des
// IBM_MIN_BATTERY_CHARGE, den der Kern ohnehin durchsetzt. Nie unter die
// BMS-Untergrenze der Batterie legen.
var DEYE_SOC_FLOOR = 10;

// Quantisierung der Entladeleistung in W (EEPROM-Schonung, siehe oben)
var DEYE_POWER_STEP_W = 100;

// Kennt die Firmware ein automatisches Zuruecksetzen bei Kommunikations-
// verlust? Community-Stand: nein. Ergebnis des Spikes hier festhalten
// (nur Doku - es gibt kein Register, das der Adapter dafuer schreiben kann).
var DEYE_HAS_AUTO_REVERT = false;

// Plausibilitaetsfenster fuer die max. Verkaufsleistung (143) in W; nur
// dann wird sie als Obergrenze der Entladung verwendet.
var DEYE_MAX_SELL_MIN_W = 100;
var DEYE_MAX_SELL_MAX_W = 100000;

// --- Helfer -----------------------------------------------------------------

function __ibmDyItem(name) {
  try {
    var item = items.getItem(name);
    return (item === null || item === undefined) ? null : item;
  } catch (e) {
    return null;
  }
}

function __ibmDyNum(name) {
  var item = __ibmDyItem(name);
  if (item === null) return null;
  var value = parseFloat(item.numericState);
  return isNaN(value) ? null : value;
}

function __ibmDySend(name, value) {
  var item = __ibmDyItem(name);
  if (item === null) {
    console.log('[IBM][Adapter] Item fehlt: ' + name);
    return false;
  }
  try {
    item.sendCommand(value);
    return true;
  } catch (e) {
    console.log('[IBM][Adapter] sendCommand ' + name + '=' + value + ' fehlgeschlagen: ' + e);
    return false;
  }
}

// Schreiben nur bei Aenderung: Deye legt Einstellregister mutmasslich in
// Flash ab - unveraenderte Werte werden nicht erneut geschrieben. Ist der
// Itemzustand (noch) unbekannt, wird sicherheitshalber geschrieben.
function __ibmDyWrite(name, value) {
  var current = __ibmDyNum(name);
  if (current !== null && Math.round(current) === Math.round(value)) return true;
  return __ibmDySend(name, value);
}

// Plausibilitaetspruefung - solange sie nicht besteht, wird NIE geschrieben.
// Liefert den Work Mode (fuer die Einspeise-Warnung) oder null.
function __ibmDyGuard() {
  var mode = __ibmDyNum('IBM_DY_WorkMode');
  if (mode === null || mode < 0 || mode > 2) {
    console.log('[IBM][Adapter] Work Mode unlesbar oder unplausibel (gelesen: ' + mode + ') - keine Steuerung. Registerkarte/Slave-Adresse pruefen.');
    return null;
  }
  var tou = __ibmDyNum('IBM_DY_TouEnable');
  if (tou === null || tou < 0 || tou > 255) {
    console.log('[IBM][Adapter] TOU-Register unlesbar oder unplausibel (gelesen: ' + tou + ') - keine Steuerung.');
    return null;
  }
  return { workMode: mode };
}

// Alle 6 TOU-Slots identisch beschreiben. socTarget === null laesst die
// Ziel-SoC-Register unangetastet (Ladesperre: bei Leistung 0 irrelevant,
// spart Schreibzyklen).
function __ibmDyWriteSlots(watts, socTarget) {
  var ok = true;
  for (var i = 1; i <= DEYE_SLOT_COUNT; i++) {
    ok = __ibmDyWrite('IBM_DY_SellW' + i, watts) && ok;
    if (socTarget !== null) {
      ok = __ibmDyWrite('IBM_DY_SellSoc' + i, socTarget) && ok;
    }
    ok = __ibmDyWrite('IBM_DY_SellFlag' + i, 0) && ok;  // nie aus dem Netz laden
  }
  return ok;
}

// --- Adapter-Kontrakt -------------------------------------------------------

function ibmReset() {
  // Werksverhalten: TOU-Zeitplan aus, die Anlage folgt wieder ihrem
  // Grundmodus (Eigenverbrauch). Ein einzelnes Register; __ibmDyWrite
  // schreibt nur, wenn der Zeitplan tatsaechlich aktiv ist.
  var ok = __ibmDyWrite('IBM_DY_TouEnable', DEYE_TOU_OFF);
  return { ok: ok };
}

function ibmPreventCharge(minutes) {
  if (__ibmDyGuard() === null) return { ok: false };
  // Kein geraeteseitiges Auto-Revert (DEYE_HAS_AUTO_REVERT) - "minutes"
  // traegt der Kern, der den Befehl im Fenster zyklisch erneuert und
  // danach zuruecksetzt.
  var ok = __ibmDyWriteSlots(0, null);
  ok = __ibmDyWrite('IBM_DY_TouEnable', DEYE_TOU_ON) && ok;
  return { ok: ok };
}

function ibmForceDischarge(watts, minutes) {
  var guard = __ibmDyGuard();
  if (guard === null) return { ok: false };

  if (guard.workMode !== 0) {
    console.log('[IBM][Adapter] Work Mode ist ' + guard.workMode + ' (nicht Selling first) - Entladung deckt nur den Hausverbrauch, keine Netzeinspeisung.');
  }
  var solarSell = __ibmDyNum('IBM_DY_SolarSell');
  if (solarSell !== null && solarSell === 0) {
    console.log('[IBM][Adapter] Solar Sell ist aus - Entladung deckt nur den Hausverbrauch, keine Netzeinspeisung.');
  }

  // Auf die max. Verkaufsleistung der Anlage begrenzen (falls plausibel
  // lesbar) und auf DEYE_POWER_STEP_W quantisieren.
  var w = Math.round(watts);
  if (w < 0) w = 0;
  var maxSellW = __ibmDyNum('IBM_DY_MaxSellW');
  if (maxSellW !== null && maxSellW >= DEYE_MAX_SELL_MIN_W && maxSellW <= DEYE_MAX_SELL_MAX_W && w > maxSellW) {
    w = Math.floor(maxSellW);
  }
  w = Math.round(w / DEYE_POWER_STEP_W) * DEYE_POWER_STEP_W;

  var ok = __ibmDyWriteSlots(w, DEYE_SOC_FLOOR);
  ok = __ibmDyWrite('IBM_DY_TouEnable', DEYE_TOU_ON) && ok;

  return { ok: ok, appliedW: w };
}
