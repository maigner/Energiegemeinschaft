// ============================================================================
// IBM - Wechselrichter-Adapter: Victron Energy (GX-Geraet, Modbus)
//
// Definiert die drei Funktionen des Adapter-Kontrakts (siehe control/core.js)
// ueber die Settings-Register der ESS-Regelung auf dem GX-Geraet (Modbus TCP,
// Unit-ID 100, offizielle Registerkarte aus dbus_modbustcp). Die Anlage
// bleibt dabei in ihrem normalen ESS-Modus - BEWUSST KEIN ESS Mode 3
// (External Control): dessen 60-s-Watchdog schaltet den Multi bei
// Kommunikationsverlust dauerhaft in Passthru. Die Register haengen als
// Items an den Data-Things des Setups (inverter_things_json im Profil):
//
//   IBM_VIC_EssMode        Hub4Mode (2902, 1/2 = ESS, 3 = Externe Steuerung)
//   IBM_VIC_BatteryLife    BatteryLife state (2900, 9 = geladen halten)
//   IBM_VIC_GridSetpointW  ESS grid setpoint in W (2700, + Bezug, - Einspeisung)
//   IBM_VIC_MaxChargeA     DVCC MaxChargeCurrent in A (2705, -1 = unbegrenzt)
//   IBM_VIC_ResetSetpointW gemerkter Werkswert des Setpoints (kein Register)
//   IBM_VIC_ResetMaxChargeA gemerkter Werkswert des Ladestroms (kein Register)
//
// Steuerlogik:
//   - Ladesperre:          MaxChargeCurrent = 0 A. DVCC begrenzt den
//                          Ladestrom systemweit (Multi UND MPPT); PV versorgt
//                          Haushalt und Netz normal weiter. ACHTUNG: bei
//                          aktivierter Option "Feed-in excess solar charger
//                          power" gilt das DVCC-Limit laut Victron-Doku NICHT
//                          fuer die MPPTs - Spike-Punkt im README.
//   - forcierte Entladung: grid setpoint = -Watt. Der Setpoint wirkt am
//                          NETZPUNKT: die Anlage speist genau ~Watt ins Netz,
//                          die Batterie liefert zusaetzlich den Haushalt.
//                          appliedW ist der kommandierte Netz-Export (exakt,
//                          keine Prozent-Quantisierung).
//   - Ruecksetzen:         beide Register auf die bei der Installation
//                          gemerkten Werkswerte (inverter_verify im Profil);
//                          fehlen sie, gelten die Rueckfallwerte unten.
//
// Fail-Safe: die Settings-Register kennen KEIN geraeteseitiges Auto-Revert
// wie das SunSpec-InOutWRte_RvrtTms - faellt openHAB mit aktiver Steuerung
// aus, bleibt der kommandierte Zustand stehen. Der Kern setzt in jedem
// 5-Minuten-Zyklus zurueck; als harter Boden wirkt zusaetzlich der
// ESS-Minimum-SoC der Anlage, unter den die forcierte Entladung nie faellt.
// Restrisiko und Spike-Punkte stehen im README.md des Profils.
//
// Sicherung gegen das falsche Geraet / die falsche Registerkarte:
// geschrieben wird nur, wenn der ESS-Modus lesbar ist und auf 1/2 steht
// (3 = ein anderes EMS steuert) und der Ladestand plausibel ist.
// ============================================================================

// --- Geraetekonstanten - IM SPIKE VERIFIZIEREN (README.md des Profils) ------

// Rueckfallwerte fuer das Ruecksetzen, falls die gemerkten Werkswerte
// (IBM_VIC_Reset*-Items) fehlen oder NULL sind. Victron-Vorgaben:
// grid setpoint 50 W (ESS-Handbuch), MaxChargeCurrent -1 = unbegrenzt.
var VIC_DEFAULT_GRID_SETPOINT_W = 50;
var VIC_DEFAULT_MAX_CHARGE_A = -1;

// BatteryLife state 9 = "Batterien geladen halten" - in dem Modus haelt die
// Anlage die Batterie voll und gibt sie nicht her; Entladung waere sinnlos.
var VIC_BL_KEEP_CHARGED = 9;

// Obergrenze des Setpoint-Registers (int16); der Kern begrenzt ohnehin
// frueher (ABSOLUTE_MAX_DISCHARGE_W).
var VIC_MAX_SETPOINT_W = 32000;

// --- Helfer -----------------------------------------------------------------

function __ibmVicItem(name) {
  try {
    var item = items.getItem(name);
    return (item === null || item === undefined) ? null : item;
  } catch (e) {
    return null;
  }
}

function __ibmVicSend(name, value) {
  var item = __ibmVicItem(name);
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

function __ibmVicNum(name) {
  var item = __ibmVicItem(name);
  if (item === null) return null;
  var value = parseFloat(item.numericState);
  return isNaN(value) ? null : value;
}

// Plausibilitaetspruefung - solange sie nicht besteht, wird NIE geschrieben.
// true nur, wenn der ESS-Modus auf 1/2 steht und der Ladestand 0..100 ist.
function __ibmVicGuard() {
  var essMode = __ibmVicNum('IBM_VIC_EssMode');
  if (essMode === null || (essMode !== 1 && essMode !== 2)) {
    if (essMode === 3) {
      console.log('[IBM][Adapter] ESS steht auf "Externe Steuerung" (Modus 3) - ein anderes EMS steuert die Anlage, keine Steuerung. In der Remote Console auf "Optimiert" stellen.');
    } else {
      console.log('[IBM][Adapter] ESS-Modus unlesbar oder unplausibel (gelesen: ' + essMode + ') - keine Steuerung. Registerkarte/Unit-ID pruefen.');
    }
    return false;
  }
  var soc = __ibmVicNum('@IBM_SOC_ITEM@');
  if (soc === null || soc < 0 || soc > 100) {
    console.log('[IBM][Adapter] Ladestand unplausibel (' + soc + ') - keine Steuerung.');
    return false;
  }
  return true;
}

// Gemerkter Werkswert aus einem Reset-Item, mit Rueckfallwert
function __ibmVicResetValue(name, fallback) {
  var value = __ibmVicNum(name);
  if (value === null) {
    console.log('[IBM][Adapter] Werkswert ' + name + ' nicht gesetzt - verwende ' + fallback);
    return fallback;
  }
  return value;
}

// --- Adapter-Kontrakt -------------------------------------------------------

function ibmReset() {
  // Werksverhalten: gemerkte Werkswerte zurueckschreiben. Die Anlage folgt
  // dann wieder ihrer normalen ESS-Regelung (Eigenverbrauch).
  var setpoint = Math.round(__ibmVicResetValue('IBM_VIC_ResetSetpointW', VIC_DEFAULT_GRID_SETPOINT_W));
  var maxChargeA = Math.round(__ibmVicResetValue('IBM_VIC_ResetMaxChargeA', VIC_DEFAULT_MAX_CHARGE_A));
  var ok = __ibmVicSend('IBM_VIC_GridSetpointW', setpoint);
  ok = __ibmVicSend('IBM_VIC_MaxChargeA', maxChargeA) && ok;
  return { ok: ok };
}

function ibmPreventCharge(minutes) {
  if (!__ibmVicGuard()) return { ok: false };
  // Kein geraeteseitiges Auto-Revert - "minutes" traegt der Kern, der den
  // Befehl im Fenster zyklisch erneuert und danach zuruecksetzt.
  var ok = __ibmVicSend('IBM_VIC_MaxChargeA', 0);
  return { ok: ok };
}

function ibmForceDischarge(watts, minutes) {
  if (!__ibmVicGuard()) return { ok: false };

  var blState = __ibmVicNum('IBM_VIC_BatteryLife');
  if (blState === VIC_BL_KEEP_CHARGED) {
    console.log('[IBM][Adapter] ESS-Modus "Batterien geladen halten" aktiv - keine Entladung. In der Remote Console auf "Optimiert" stellen.');
    return { ok: false };
  }

  // Negativer Setpoint = Einspeisung ins Netz. Er wirkt am Netzpunkt: die
  // Anlage exportiert ~watts, die Batterie liefert zusaetzlich den
  // Haushalt. Als Untergrenze wirkt der ESS-Minimum-SoC der Anlage.
  var w = Math.round(watts);
  if (w < 0) w = 0;
  if (w > VIC_MAX_SETPOINT_W) w = VIC_MAX_SETPOINT_W;

  // Eine noch aktive Ladesperre wuerde die Entladung nicht stoeren, wohl
  // aber das Nachladen bei PV-Resten - Ladestrom sicherheitshalber freigeben.
  var maxChargeA = Math.round(__ibmVicResetValue('IBM_VIC_ResetMaxChargeA', VIC_DEFAULT_MAX_CHARGE_A));
  var ok = __ibmVicSend('IBM_VIC_MaxChargeA', maxChargeA);
  ok = __ibmVicSend('IBM_VIC_GridSetpointW', -w) && ok;

  return { ok: ok, appliedW: w };
}
