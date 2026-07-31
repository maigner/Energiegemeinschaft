// ============================================================================
// IBM - Batteriesteuerung Fronius
//
//   Teil A: Batterieladen sperren bei geringer Bewoelkung (Vormittag).
//           Das Fenster kommt aus der Tagesprognose der API (erster
//           Sonnenschein bis Vormittags-Crossover) und gilt nur fuer das
//           mitgelieferte Datum - ohne gueltiges Fenster wird nicht gesperrt.
//   Teil B: Forcierte Batterieentladung (Nacht), abhaengig von Toggle,
//           Ladestand und Wolkenvorschau. Die Entladeleistung passt sich
//           automatisch an die Batteriegroesse an, die das Skript aus der
//           Ladestandsaenderung waehrend der Entladung schaetzt (Abschnitt
//           "Dynamische Entladeleistung"); eine harte Obergrenze
//           (ABSOLUTE_MAX_DISCHARGE_W) wird nie ueberschritten.
//
// Das Entladefenster folgt den taeglich von der API geholten Crossover-Zeiten
// (Zeitpunkt, an dem die gemeinschaftliche Erzeugung den Verbrauch kreuzt):
// entladen wird vom abendlichen bis zum morgendlichen Crossover. Liegen keine
// plausiblen Crossover-Zeiten vor (ischlstrom.org nie erreichbar gewesen oder
// Daten unbrauchbar), wird NICHT entladen - es gibt kein Ersatzfenster.
//
// Dieses Skript ist die Vorlage fuer alle Anlagen und wird pro Kunde NICHT
// veraendert. Alles Anlagenspezifische kommt aus Items - siehe Abschnitt
// "Konfiguration". Fehlt ein Item oder steht es auf NULL, greift der jeweils
// hier hinterlegte Rueckfallwert, das Skript laeuft also auch unvollstaendig
// eingerichtet weiter.
//
// Vom Setup ersetzt: Thing-UID und der Itemname des Ladestands.
// ============================================================================

var fa = actions.thingActions('fronius', 'fronius:powerinverter:0cb68e8e38:273b6c06b4');

// --- Rueckfallwerte, falls das zugehoerige Item fehlt oder ungueltig ist ----
var FALLBACK_CHARGE_LOCK_ACTIVE = true;
var FALLBACK_CLOUD_THRESHOLD = 75;

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

// --- Konfiguration ----------------------------------------------------------

var CHARGE_LOCK_ACTIVE     = onOff('IBM_LADESPERRE_AKTIV', FALLBACK_CHARGE_LOCK_ACTIVE);
var CLOUD_THRESHOLD        = num('IBM_LADESPERRE_WOLKEN_SCHWELLE', FALLBACK_CLOUD_THRESHOLD, 0, 100);

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
var chargeLockReady = chargeLockStart !== null && chargeLockEnd !== null
  && chargeLockStart < chargeLockEnd && chargeLockDateValid();

// Entladung: vom abendlichen bis zum morgendlichen Crossover - solange die
// Gemeinschaft mehr verbraucht als erzeugt. Ohne plausible Crossover-Daten
// bleibt die Entladung aus (null).
var dischargeStart = EVENING_CROSSOVER_MIN;
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
// Gemeinsamer Schritt: Toggle-abhaengiger Reset
// ----------------------------------------------------------------------------
var toggleOn = onOff('Schalte_ISCHLSTROM_Empfehlung_einaus', false);

if (toggleOn) {
  fa.resetBatteryControl();
  console.log('[IBM] Toggle=ON - Battery control reset');
} else {
  console.log('[IBM] Toggle=OFF - Tue nichts');
  return;
}

// ----------------------------------------------------------------------------
// Teil A: Ladesperre bei geringer Bewoelkung
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
  var from = now;
  var until = now.plusMinutes(5);
  var ok = fa.addPreventBatteryChargingSchedule(from, until);

  console.log('[IBM][Ladesperre] Wolkenvorschau=' + clouds + '% (<' + CLOUD_THRESHOLD + '%) - Laden gesperrt | Schedule applied: ' + ok);
  console.log('[IBM][Ladesperre] From:  ' + from);
  console.log('[IBM][Ladesperre] Until: ' + until);
}

// ----------------------------------------------------------------------------
// Teil B: Forcierte Entladung
// ----------------------------------------------------------------------------
function handleForcedDischarge() {

  var soc = parseFloat(items.getItem('Fronius_Symo_Inverter_Battery_State_of_Charge').numericState);
  var minSoc = parseFloat(items.getItem('IBM_MIN_BATTERY_CHARGE').numericState);

  if (isNaN(minSoc) || minSoc <= 5 || minSoc > 90) {
    console.log('[IBM][Entladung] Battery min Level (' + minSoc + '%) - invalid value');
    return;
  }
  if (isNaN(soc) || soc <= minSoc) {
    console.log('[IBM][Entladung] Battery too low (' + soc + '%) - skipping discharge schedule');
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

  var clouds = cloudForecast();
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

  var from = now;
  var until = now.plusMinutes(5);
  var ok = fa.addForcedBatteryDischargingSchedule(from, until, Quantity(dischargeW + 'W'));

  updateCapacityEstimate(soc, dischargeW, ok === true || String(ok) === 'true');

  console.log('[IBM][Entladung] SoC=' + soc + '% | Schedule applied: ' + ok);
  console.log('[IBM][Entladung] From:  ' + from);
  console.log('[IBM][Entladung] Until: ' + until);
}

// ----------------------------------------------------------------------------
// Zeitfenster-Weiche: entscheidet, welcher Teil ausgefuehrt wird
// ----------------------------------------------------------------------------
if (CHARGE_LOCK_ACTIVE && !chargeLockReady) {
  console.log('[IBM] Kein gueltiges Ladesperre-Fenster fuer heute - Laden bleibt erlaubt');
}

if (CHARGE_LOCK_ACTIVE && chargeLockReady && inWindow(chargeLockStart, chargeLockEnd)) {
  console.log('[IBM] Zeitfenster Vormittag (' + fmtMinutes(nowMinutes) + ', ' + fmtMinutes(chargeLockStart) + '-' + fmtMinutes(chargeLockEnd) + ') - pruefe Ladesperre');
  handleChargeLock();
} else if (DISCHARGE_ACTIVE && (dischargeStart === null || dischargeEnd === null)) {
  console.log('[IBM] Keine plausiblen Crossover-Zeiten von ischlstrom.org - Entladung bleibt aus');
} else if (DISCHARGE_ACTIVE && inWindow(dischargeStart, dischargeEnd)) {
  console.log('[IBM] Zeitfenster Nacht (' + fmtMinutes(nowMinutes) + ', ' + fmtMinutes(dischargeStart) + '-' + fmtMinutes(dischargeEnd) + ') - pruefe forcierte Entladung');
  handleForcedDischarge();
} else {
  console.log('[IBM] Ausserhalb beider Zeitfenster (' + fmtMinutes(nowMinutes) + ') - keine Aktion');
}
