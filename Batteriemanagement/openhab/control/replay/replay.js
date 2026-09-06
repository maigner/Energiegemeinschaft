// Replay-Harness fuer control/core.js gegen die 30-Tage-Status-Historie.
// Aufruf: node replay.js <core.js> [--plant N] [--from YYYY-MM-DD] [--to YYYY-MM-DD]
//         [--verbose YYYY-MM-DD] [--no-crossover] [--old-rate] [--csv out.csv]
'use strict';
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const coreFile = args[0];
function opt(name, dflt) { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : dflt; }
const flag = (name) => args.includes(name);
const onlyPlant = opt('--plant', null);
const fromDay = opt('--from', '2026-08-24');
const toDay = opt('--to', '2026-09-06');
const verboseDay = opt('--verbose', null);
const noCrossover = flag('--no-crossover');
const oldRate = flag('--old-rate');
const csvOut = opt('--csv', null);

// ---- Zeit-Shim (Europe/Vienna wird als UTC behandelt, Sommerzeit ueberall) --
function ZDT(ms) { this.ms = ms; }
ZDT.prototype.date = function () { return new Date(this.ms); };
ZDT.prototype.year = function () { return this.date().getUTCFullYear(); };
ZDT.prototype.monthValue = function () { return this.date().getUTCMonth() + 1; };
ZDT.prototype.dayOfMonth = function () { return this.date().getUTCDate(); };
ZDT.prototype.hour = function () { return this.date().getUTCHours(); };
ZDT.prototype.minute = function () { return this.date().getUTCMinutes(); };
ZDT.prototype.minusDays = function (n) { return new ZDT(this.ms - n * 86400000); };
ZDT.prototype.toEpochSecond = function () { return Math.floor(this.ms / 1000); };
ZDT.prototype.toString = function () { return new Date(this.ms).toISOString().replace('Z', '+02:00[Europe/Vienna]'); };
let NOW_MS = 0;
const time = {
  ZonedDateTime: {
    now: () => new ZDT(NOW_MS),
    parse: (s) => { const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?/); if (!m) throw new Error('parse ' + s); return new ZDT(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0))); }
  },
  Duration: { between: (a, b) => { const d = b.ms - a.ms; return { toMinutes: () => Math.trunc(d / 60000), toHours: () => Math.trunc(d / 3600000), toMillis: () => d }; } }
};
function localMs(str) { const m = str.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})/); return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]); }
const pad = (n) => (n < 10 ? '0' : '') + n;
const fmtMin = (m) => pad(Math.floor(m / 60)) + ':' + pad(m % 60);

// ---- Item-Store -------------------------------------------------------------
const store = new Map();
const items = {
  getItem(name) {
    if (!store.has(name)) throw new Error('Item fehlt: ' + name);
    const st = store.get(name);
    return { state: st, numericState: parseFloat(st), postUpdate: (v) => store.set(name, String(v)) };
  }
};
const setItem = (n, v) => store.set(n, v === null || v === undefined || v === '' ? 'NULL' : String(v));

// ---- Kern laden -----------------------------------------------------------
let src = fs.readFileSync(coreFile, 'utf8')
  .replace(/@IBM_SOC_ITEM@/g, 'SOC').replace(/@IBM_BATTERY_POWER_ITEM@/g, 'BAT')
  .replace(/@IBM_GRID_POWER_ITEM@/g, 'GRID').replace(/@IBM_PV_POWER_ITEM@/g, 'PV');
const calls = [];
const adapter = `
function ibmReset() { return { ok: true }; }
function ibmPreventCharge(min) { calls.push({ t: 'lock', min: min }); return { ok: true }; }
function ibmForceDischarge(w, min) { calls.push({ t: 'discharge', w: w, min: min }); return { ok: true, appliedW: w }; }
`;
const logs = [];
const con = { log: (m) => logs.push(m), error: (m) => logs.push('ERR ' + m) };
const cycle = new Function('items', 'time', 'console', 'calls', 'actions', adapter + '\n' + src);

// ---- Daten ------------------------------------------------------------------
const dir = __dirname;
const hist = {};
for (const line of fs.readFileSync(path.join(dir, 'history.csv'), 'utf8').trim().split('\n')) {
  const c = line.split(',');
  const pid = c[0];
  (hist[pid] = hist[pid] || []).push({
    t: c[1], soc: +c[2], pv: c[3] === '' ? null : +c[3], bat: c[4] === '' ? null : +c[4], grid: c[5] === '' ? null : +c[5],
    rate: c[7], cap: c[8], wolken: c[9], ls: c[10], le: c[11], ld: c[12], cs: c[15], ce: c[16], es: c[17], hs: c[18]
  });
}
// Prognose je Tag: Slots (t, g, c) + Laufmaximum
const fc = {};
for (const line of fs.readFileSync(path.join(dir, 'forecast_days.csv'), 'utf8').trim().split('\n')) {
  const c = line.split(',');
  (fc[c[0]] = fc[c[0]] || { mg: +c[5], slots: [] }).slots.push({ t: c[2], g: +c[3], cons: +c[4] });
}
// Wolken je Stunde
const clouds = {};
for (const line of fs.readFileSync(path.join(dir, 'clouds.csv'), 'utf8').trim().split('\n')) {
  const c = line.split(','); clouds[c[0].slice(0, 13)] = +c[1];
}
const toMin = (hhmm) => +hhmm.slice(0, 2) * 60 + +hhmm.slice(3, 5);

function daySignals(day, fleetKw) {
  const f = fc[day]; if (!f) return null;
  let crossEnd = null, crossAm = null;
  for (const s of f.slots) { if (s.g >= s.cons) { crossEnd = toMin(s.t) + 15; if (crossAm === null && toMin(s.t) >= 180) crossAm = toMin(s.t); } }
  if (crossEnd === null) return null;
  const deadline = crossEnd - 60;
  // Entladestart (wie getTodayDischargeStart) und Entladeende (Spiegel)
  let pmCross = null; for (const s of f.slots) if (toMin(s.t) >= 720 && s.g >= s.cons) pmCross = toMin(s.t) + 15;
  let start = null, ende = null, seen = false;
  for (const s of f.slots) {
    const m = toMin(s.t); const deficit = (s.cons - s.g) * 4; const need = Math.max(s.cons * 4 * 0.25, fleetKw * 2);
    if (pmCross !== null && m >= pmCross && start === null && deficit >= need) start = m;
    if (m >= 300 && m < 720) { if (deficit >= need) seen = true; else if (seen && ende === null) ende = m; }
  }
  return { f, crossAm, deadline, start, ende };
}

function ladefaktoren(sig, nowMin, day) {
  const per = {};
  for (const s of sig.f.slots) {
    const m = toMin(s.t); const h = Math.floor(m / 60);
    if ((h + 1) * 60 <= Math.floor(nowMin / 60) * 60) continue;
    if (h * 60 >= sig.deadline) continue;
    (per[h] = per[h] || { sum: 0, n: 0 }); per[h].sum += Math.min(1, Math.max(0, s.g / sig.f.mg)); per[h].n++;
  }
  const stunden = Object.keys(per).map(Number).sort((a, b) => a - b).map(h => ({ zeit: fmtMin(h * 60), faktor: Math.round(per[h].sum / per[h].n * 1000) / 1000 }));
  if (!stunden.length) return '-';
  return JSON.stringify({ datum: day, zeit: new ZDT(NOW_MS).toString(), deadline: fmtMin(sig.deadline), stunden });
}
function wolkenStunden(day, nowMin) {
  const st = [];
  for (let h = Math.floor(nowMin / 60); h < 24; h++) { const v = clouds[day + ' ' + pad(h)]; if (typeof v === 'number') st.push({ zeit: fmtMin(h * 60), wolken: v }); }
  if (!st.length) return '-';
  return JSON.stringify({ datum: day, zeit: new ZDT(NOW_MS).toString(), stunden: st });
}

// ---- Replay je Anlage ---------------------------------------------------------
const csvRows = [];
for (const pid of Object.keys(hist).sort((a, b) => a - b)) {
  if (onlyPlant && pid !== onlyPlant) continue;
  const rows = hist[pid].filter(r => r.t.slice(0, 10) >= fromDay && r.t.slice(0, 10) <= toDay && r.pv !== null && r.bat !== null && r.grid !== null);
  if (!rows.length) continue;
  const capacity = +rows[rows.length - 1].cap; if (!(capacity > 0)) continue;
  // "Wahre" Spitzenladeleistung als Kappung der simulierten Ladung: p95 der beobachteten Ladung 10-15 Uhr
  const charging = rows.filter(r => r.t.slice(11) >= '10:00' && r.t.slice(11) < '15:00' && -r.bat > 300).map(r => -r.bat).sort((a, b) => a - b);
  const trueMaxW = charging.length ? charging[Math.floor(0.95 * (charging.length - 1))] : 5000;

  store.clear();
  for (const [n, v] of Object.entries({
    Schalte_ISCHLSTROM_Empfehlung_einaus: 'ON', IBM_PAUSE_TAGE: 0, IBM_LADESPERRE_AKTIV: 'ON', IBM_LADESPERRE_WOLKEN_SCHWELLE: 75,
    IBM_LADESPERRE_LOKAL: 'ON', IBM_ENTLADUNG_AKTIV: 'ON', IBM_DYNAMISCHE_LEISTUNG: 'ON', IBM_LADEREGELUNG: 'ON', IBM_NETZLADESCHUTZ: 'ON',
    IBM_MIN_BATTERY_CHARGE: 10, Minimale_Entladeleistung_Batterieeinspeisung: 1000, Maximale_Entladeleistung_Batterieeinspeisung: 3000,
    IBM_KAPAZITAET_MESSUNG: JSON.stringify({ kwh: capacity, messungen: 5 }), IBM_BATTERIE_KAPAZITAET: capacity,
    IBM_LADERATE_MESSUNG: oldRate ? JSON.stringify({ kw: +rows[rows.length - 1].rate, messungen: 5 }) : '', IBM_LADELEISTUNG: '',
    IBM_LADESPERRE_LOKAL_ENDE: '', IBM_LADEREGELUNG_SOLL: '', IBM_LADEREGELUNG_STATUS: '', IBM_RESTLADEZEIT: '',
    IBM_NETZLADE_WAECHTER: '', IBM_NETZLADUNG: '', IBM_NETZEINSPEISUNG_ZAEHLER: '', IBM_BATTERIE_NETZEINSPEISUNG_KWH: '',
    IBM_HAUSLAST: '', IBM_HAUSLAST_MESSUNG: '', IBM_NACHTBUDGET: '', IBM_SONNENPROFIL: '',
    Ischlstrom_Ladesperre_Individuell: 'OFF', Ischlstrom_Entladeende: '-', Ischlstrom_Crossover_Vormittag: '-',
    SOC: 50, BAT: 0, GRID: 0, PV: 0
  })) setItem(n, v);

  let simSoc = null, simDay = null;
  const dayStats = {};
  for (const r of rows) {
    const day = r.t.slice(0, 10);
    NOW_MS = localMs(r.t);
    const nowMin = +r.t.slice(11, 13) * 60 + +r.t.slice(14, 16);
    const sig = daySignals(day, 18);
    if (day !== simDay) { simDay = day; simSoc = null; dayStats[day] = { deadline: sig ? fmtMin(sig.deadline) : '-', full: null, morningBat: 0, morningExp: 0, dayBat: 0, dayExp: 0, locked: 0, limited: 0, slots: 0, duties: [] }; }
    if (simSoc === null && nowMin >= 300) simSoc = r.soc;   // Start der Simulation 05:00 mit dem echten Ladestand
    const ds = dayStats[day];

    // Potenzielle Ladeleistung: was die Batterie heute frei laden koennte
    const potential = Math.min(trueMaxW, Math.max(0, -r.bat) + Math.max(0, -r.grid));
    const daytime = simSoc !== null && nowMin >= 300 && nowMin < 21 * 60;
    const socForCore = daytime ? simSoc : r.soc;
    // Batterieleistung fuer den Kern: tagsueber die simulierte Ladung des vorigen Slots
    setItem('SOC', Math.round(socForCore * 10) / 10);
    setItem('IBM_KAPAZITAET_MESSUNG', JSON.stringify({ kwh: capacity, messungen: 5 })); // Kapazitaet festhalten (kein Nachlernen aus der Simulation)
    setItem('BAT', daytime ? -(ds.lastCharge || 0) : r.bat);
    setItem('GRID', daytime ? -(potential - (ds.lastCharge || 0)) : r.grid);
    setItem('PV', r.pv);
    setItem('Ischlstrom_Wolkenvorschau', r.wolken); setItem('Ischlstrom_Wolkenvorschau_Zeit', new ZDT(NOW_MS).toString());
    setItem('Ischlstrom_Crossover_Start', r.cs || '-'); setItem('Ischlstrom_Crossover_Ende', r.ce || '-');
    setItem('Ischlstrom_Ladesperre_Start', r.ls || '-'); setItem('Ischlstrom_Ladesperre_Ende', r.le || '-'); setItem('Ischlstrom_Ladesperre_Datum', r.ld || '-');
    setItem('Ischlstrom_Entladestart', sig && sig.start !== null ? fmtMin(sig.start) : '-');
    setItem('Ischlstrom_Entladeende', !noCrossover && sig && sig.ende !== null ? fmtMin(sig.ende) : '-');
    setItem('Ischlstrom_Crossover_Vormittag', !noCrossover && sig && sig.crossAm !== null ? fmtMin(sig.crossAm) : '-');
    setItem('Ischlstrom_Ladefaktoren', sig ? ladefaktoren(sig, nowMin, day) : '-');
    setItem('Ischlstrom_Wolken_Stunden', wolkenStunden(day, nowMin));

    calls.length = 0; logs.length = 0;
    cycle(items, time, con, calls, {});
    if (verboseDay === day && pid === (onlyPlant || pid)) { console.log('--- ' + r.t + ' simSoc=' + (simSoc === null ? '-' : simSoc.toFixed(1)) + ' pot=' + potential + ' PV=' + r.pv); for (const l of logs) console.log('   ' + l); }

    const locked = calls.some(c => c.t === 'lock');
    let charge = 0;
    if (daytime) {
      charge = locked ? 0 : potential;
      const soll = store.get('IBM_LADEREGELUNG_SOLL');
      ds.slots++;
      if (locked) ds.locked++;
      simSoc = Math.min(100, simSoc + charge * (5 / 60) / (capacity * 1000) * 100);
      if (ds.full === null && simSoc >= 95) ds.full = r.t.slice(11, 16);
      const exp = potential - charge;
      if (nowMin >= 420 && sig && sig.crossAm !== null && nowMin < sig.crossAm) { ds.morningBat += charge / 12000; ds.morningExp += exp / 12000; }
      ds.dayBat += charge / 12000; ds.dayExp += exp / 12000;
      const m = logs.map(l => (l.match(/Sperranteil (\d+)%/) || [])[1]).filter(x => x !== undefined);
      if (m.length) ds.duties.push(+m[0]);
      if (csvOut) csvRows.push([pid, r.t, socForCore.toFixed(1), potential, charge, locked ? 1 : 0, m[0] || '', store.get('IBM_LADELEISTUNG')].join(','));
    }
    ds.lastCharge = charge;
  }
  const summ = Object.values(dayStats).filter(d => d.slots && d.deadline !== '-');
  const lateMin = summ.map(d => d.full ? Math.max(0, toMin(d.full) - toMin(d.deadline)) : 300);
  const late = lateMin.filter(x => x > 20).length;
  console.log(`\n### ${pid}: spaet(>20min) ${late}/${summ.length} Tage, max ${Math.max(...lateMin)} min, morgens Batt ${summ.reduce((a, d) => a + d.morningBat, 0).toFixed(0)} / Export ${summ.reduce((a, d) => a + d.morningExp, 0).toFixed(0)} kWh, Tag Export ${summ.reduce((a, d) => a + d.dayExp, 0).toFixed(0)} kWh`);
  console.log(`\n=== Anlage ${pid}: Kapazitaet ${capacity} kWh, echte Spitze (p95) ${trueMaxW} W, alte Schaetzung ${rows[rows.length - 1].rate} kW, gelernt jetzt ${store.get('IBM_LADELEISTUNG')} kW`);
  console.log('Tag        | 95% um (Deadline) | morgens Batt/Export kWh | Tag Batt/Export kWh | gesperrt/Slots | Sperranteil mittl. (n)');
  for (const [day, ds] of Object.entries(dayStats)) {
    if (!ds.slots) continue;
    const md = ds.duties.length ? Math.round(ds.duties.reduce((a, b) => a + b, 0) / ds.duties.length) : '-';
    const late = ds.full && ds.deadline !== '-' && ds.full > ds.deadline ? '!' : ' ';
    console.log(`${day} | ${ds.full || '  -  '}${late}(${ds.deadline})   | ${ds.morningBat.toFixed(1).padStart(5)} / ${ds.morningExp.toFixed(1).padStart(5)}           | ${ds.dayBat.toFixed(1).padStart(5)} / ${ds.dayExp.toFixed(1).padStart(5)}       | ${String(ds.locked).padStart(3)} / ${String(ds.slots).padStart(3)}      | ${md} (${ds.duties.length})`);
  }
}
if (csvOut) fs.writeFileSync(csvOut, csvRows.join('\n'));
