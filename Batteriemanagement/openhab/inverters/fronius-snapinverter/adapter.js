// ============================================================================
// IBM - Wechselrichter-Adapter: Fronius Symo Hybrid (SnapINverter, Modbus)
//
// Definiert die drei Funktionen des Adapter-Kontrakts (siehe control/core.js)
// ueber das SunSpec Basic Storage Control Model (124), das der Datamanager
// per Modbus TCP bereitstellt. Die Register haengen als Items an den
// Data-Things des Setups (inverter_things_json im Profil):
//
//   IBM_MB_ModelId   SunSpec-Model-ID an der Basisadresse (muss 124 sein)
//   IBM_MB_WChaMax   Referenzleistung fuer die Prozentwerte (roh)
//   IBM_MB_StorCtl   StorCtl_Mod-Bitfeld (Bit 0: InWRte aktiv)
//   IBM_MB_InWRte    Ladelimit in % von WChaMax (roh, negativ = Entladung)
//   IBM_MB_OutWRte   Entladelimit in % von WChaMax (roh)
//   IBM_MB_RvrtTms   Revert-Timeout in Sekunden
//
// Fail-Safe: Modbus-Writes bleiben stehen, wenn openHAB ausfaellt - anders
// als die selbst ablaufenden GEN24-Schedules. Deshalb wird vor jedem
// Steuer-Write das Revert-Timeout (InOutWRte_RvrtTms) auf Fensterlaenge
// plus eine Minute gesetzt: der Wechselrichter kehrt dann von allein zum
// Werksverhalten zurueck. Ob das Geraet den Timeout unterstuetzt, prueft
// der Spike (M124_HAS_RVRTTMS, siehe README.md des Profils).
//
// Sicherung gegen das falsche Geraet (z. B. den Nicht-Hybrid-Slave einer
// Master/Slave-Anlage): geschrieben wird nur, wenn die Model-ID 124 lautet
// und WChaMax plausibel ist - ein Wechselrichter ohne Batterie hat beides
// nicht.
//
// Dieser Adapter ist die Vorlage fuer jeden Hersteller mit beschreibbarem
// SunSpec Model 124: kopieren, Itemnamen/Registerkarte im Profil anpassen,
// Konstanten unten am Geraet verifizieren - der Kern bleibt unangetastet.
// ============================================================================

// --- Geraetekonstanten - IM SPIKE VERIFIZIEREN (README.md des Profils) ------

// Unterstuetzt das Geraet InOutWRte_RvrtTms (automatisches Zuruecksetzen)?
var M124_HAS_RVRTTMS = true;

// Registereinheiten je Prozent fuer InWRte/OutWRte (InOutWRte_SF = -2 -> 100)
var M124_WRTE_RAW_PER_PCT = 100;

// Watt je Registereinheit fuer WChaMax (WChaMax_SF = 0 -> 1)
var M124_WCHAMAX_W_PER_UNIT = 1;

// StorCtl_Mod-Bit, das die Ladelimit-Steuerung (InWRte) aktiviert
var M124_STORCTL_CHARGE_BIT = 1;

// Plausibilitaetsfenster fuer WChaMax in Watt
var M124_WCHAMAX_MIN_W = 500;
var M124_WCHAMAX_MAX_W = 50000;

// --- Helfer -----------------------------------------------------------------

function __ibmMbItem(name) {
  try {
    var item = items.getItem(name);
    return (item === null || item === undefined) ? null : item;
  } catch (e) {
    return null;
  }
}

function __ibmMbSend(name, value) {
  var item = __ibmMbItem(name);
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

function __ibmMbNum(name) {
  var item = __ibmMbItem(name);
  if (item === null) return null;
  var value = parseFloat(item.numericState);
  return isNaN(value) ? null : value;
}

// Maximale Lade-/Entladeleistung in Watt - oder null, wenn an der
// Basisadresse kein Storage-Model liegt oder WChaMax unplausibel ist.
// Solange null, wird NIE geschrieben.
function __ibmMbGuard() {
  var modelId = __ibmMbNum('IBM_MB_ModelId');
  if (modelId !== 124) {
    console.log('[IBM][Adapter] Kein SunSpec Model 124 an der Basisadresse (gelesen: ' + modelId + ') - keine Steuerung. Registerkarte/Unit-ID pruefen.');
    return null;
  }
  var raw = __ibmMbNum('IBM_MB_WChaMax');
  var maxW = (raw === null) ? null : raw * M124_WCHAMAX_W_PER_UNIT;
  if (maxW === null || maxW < M124_WCHAMAX_MIN_W || maxW > M124_WCHAMAX_MAX_W) {
    console.log('[IBM][Adapter] WChaMax unplausibel (' + maxW + ' W) - keine Steuerung.');
    return null;
  }
  return maxW;
}

// Revert-Timeout scharf stellen: Fensterlaenge plus eine Minute Reserve.
function __ibmMbArmRevert(minutes) {
  if (!M124_HAS_RVRTTMS) return;
  __ibmMbSend('IBM_MB_RvrtTms', Math.round(minutes * 60 + 60));
}

// --- Adapter-Kontrakt -------------------------------------------------------

function ibmReset() {
  // Werksverhalten: keine aktive Steuerung, beide Limits auf 100 %.
  var ok = __ibmMbSend('IBM_MB_InWRte', 100 * M124_WRTE_RAW_PER_PCT);
  ok = __ibmMbSend('IBM_MB_OutWRte', 100 * M124_WRTE_RAW_PER_PCT) && ok;
  ok = __ibmMbSend('IBM_MB_StorCtl', 0) && ok;
  return { ok: ok };
}

function ibmPreventCharge(minutes) {
  if (__ibmMbGuard() === null) return { ok: false };
  __ibmMbArmRevert(minutes);
  var ok = __ibmMbSend('IBM_MB_InWRte', 0);
  ok = __ibmMbSend('IBM_MB_StorCtl', M124_STORCTL_CHARGE_BIT) && ok;
  return { ok: ok };
}

function ibmForceDischarge(watts, minutes) {
  var maxW = __ibmMbGuard();
  if (maxW === null) return { ok: false };

  // Watt -> Prozent von WChaMax, auf ganze Prozent gerundet und begrenzt.
  var pct = Math.round(watts / maxW * 100);
  if (pct < 1) pct = 1;
  if (pct > 100) pct = 100;

  __ibmMbArmRevert(minutes);
  // Negatives Ladelimit = forcierte Entladung (Fronius-Auslegung von
  // SunSpec 124); das Bit in StorCtl_Mod aktiviert die InWRte-Steuerung.
  var ok = __ibmMbSend('IBM_MB_InWRte', -(pct * M124_WRTE_RAW_PER_PCT));
  ok = __ibmMbSend('IBM_MB_StorCtl', M124_STORCTL_CHARGE_BIT) && ok;

  return { ok: ok, appliedW: Math.round(maxW * pct / 100) };
}
