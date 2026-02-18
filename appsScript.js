/************************************************************
 * appsScript.js — LQ1D (armonizado)
 * - Config centralizada (IDs / correos / carpeta Drive)
 * - doPost: soporta único y múltiple (items)
 * - doGet: listas y disponibilidad de equipos
 * - Adjuntos en Drive + correos (usuario/admin)
 ************************************************************/

// =================== CONFIGURACIÓN =========================
const ADMIN_EMAIL     = 'thomas.garzon@ikiam.edu.ec';   // <-- cambia aquí
const DRIVE_FOLDER_ID = '1cjvkCphJWlL_BRXp2YcyckD-QOfZQCZ-';   // <-- cambia aquí

// Hoja “general” donde están las pestañas de registros (Solicitud de Equipos, Uso de equipo, etc.)
const SS_GENERAL_ID   = '14x0fat7x18QlAN9kKYgNYJkAvw0L1OkyEAS0yLukR5Q';    // <-- cambia aquí

// Hojas de catálogos para las listas de autocompletado.
// Si todo vive en la misma hoja, puedes repetir SS_GENERAL_ID aquí.
const SS_EQUIPOS_ID   = '1VYnN1yNZi5UWez8frYHOH8dFC1iicV75wAa0Hcm5LuA';   // <-- cambia aquí (o repite SS_GENERAL_ID)
const SS_REACTIVOS_ID = '1EKfr1vbmpyUbgKMVbv6_lL4FuIxlPpLOaFhEeZEApSo'; // <-- cambia aquí (o repite SS_GENERAL_ID)
const SS_INSUMOS_ID   = '1xX56wX8DfJhyUXpi9lUBN78cQqhuEnLIPaO8ZdKlrrY';   // <-- cambia aquí (o repite SS_GENERAL_ID)

// =================== ENTRYPOINTS ===========================
function doPost(e) {
  const ss = SpreadsheetApp.openById(SS_GENERAL_ID);
  const params = e.parameter || {};

  // Admin dashboard endpoint (supports POST as well)
  if (params.action === 'dashboard') {
    const output = buildDashboard_(ss);
    return ContentService
      .createTextOutput(JSON.stringify(output))
      .setMimeType(ContentService.MimeType.JSON);
  }

  if (params.items) {
    return processMultiRequest_(ss, params);
  }
  return processSingleRequest_(ss, params);
}

function doGet(e) {
  const sheetEquiposData   = SpreadsheetApp.openById(SS_EQUIPOS_ID).getSheetByName('Equipos');
  const sheetReactivosData = SpreadsheetApp.openById(SS_REACTIVOS_ID).getSheetByName('Reactivos');
  const sheetInsumosData   = SpreadsheetApp.openById(SS_INSUMOS_ID).getSheetByName('Insumos');
  const ssGeneral          = SpreadsheetApp.openById(SS_GENERAL_ID);

  const action = (e.parameter && e.parameter.action) || '';
  const q      = ((e.parameter && e.parameter.q) || '').toString().toLowerCase();

  function filterList(list) {
    if (!q) return list;
    return list.filter(item => item.toString().toLowerCase().includes(q));
  }

  let output;
  switch (action) {
    case 'listReactivos':
      output = filterList(getColumnValues_(sheetReactivosData, 1));
      break;
    case 'listInsumos':
      output = filterList(getColumnValues_(sheetInsumosData, 1));
      break;
    case 'listEquipos':
      output = filterList(getColumnValues_(sheetEquiposData, 1));
      break;
    case 'availEquipos': {
      const start = e.parameter.start;
      const end   = e.parameter.end;
      output = filterList(getAvailableEquipos_(sheetEquiposData, ssGeneral, start, end));
      break;
    }
    case 'busyEquipos': {
      const equipo = e.parameter.equipo;
      output = getBusyEquipos_(ssGeneral, equipo);
      break;
    }
    case 'agenda': {
      // Agenda de reservas de equipos (proximos N dias)
      const days = Math.max(1, Math.min(31, Number(e.parameter.days) || 14));
      const out = getAgendaEquipos_(ssGeneral, days);
      output = out;
      break;
    }
    case 'dashboard': {
      output = buildDashboard_(ssGeneral);
      break;
    }
    case 'stats': {
      // Estadisticas reales (sin datos ficticios) para el dashboard.
      // Lee fechas (columna 2) y correos (ultima columna) en cada hoja.
      const tz = Session.getScriptTimeZone();
      const now = new Date();
      const todayKey = Utilities.formatDate(now, tz, 'yyyy-MM-dd');

      // Rango para filtrar (day/week/month). Por defecto: day.
      const rangeKey = String((e.parameter && e.parameter.range) || 'day').toLowerCase();
      const range = computeRange_(rangeKey, now, tz);

      const monthKeys = [];
      for (let i = 11; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        monthKeys.push(Utilities.formatDate(d, tz, 'yyyy-MM'));
      }
      const monthlyIndex = {};
      const monthly = monthKeys.map(m => {
        const obj = { month: m, equipos: 0, materiales: 0, reactivos: 0, registro: 0, total: 0 };
        monthlyIndex[m] = obj;
        return obj;
      });

      const uniqueSet = new Set();
      const last30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      const totals = { equipos: 0, materiales: 0, reactivos: 0, registro: 0, total: 0 };
      const today = { equipos: 0, materiales: 0, reactivos: 0, registro: 0, total: 0 };

      const totalsRange = { equipos: 0, materiales: 0, reactivos: 0, registro: 0, total: 0 };

      const sources = [
        { sheet: getSheetByAnyName_(ssGeneral, ['Solicitud de Equipos', 'Solicitudes de Equipos', 'Solicitud Equipos']), bucket: 'equipos', dateCol: 1, emailCol: 6 },
        { sheet: getSheetByAnyName_(ssGeneral, ['Uso de equipo', 'Uso de equipos', 'Registro de equipos']), bucket: 'registro', dateCol: 1, emailCol: 5 },
        { sheet: getSheetByAnyName_(ssGeneral, ['Solicitud de Insumos', 'Solicitud de Materiales', 'Solicitud de material']), bucket: 'materiales', dateCol: 1, emailCol: 6 },
        { sheet: getSheetByAnyName_(ssGeneral, ['Uso de Insumos', 'Uso de insumos', 'Registro de Insumos', 'Registro de materiales']), bucket: 'materiales', dateCol: 1, emailCol: 6 },
        { sheet: getSheetByAnyName_(ssGeneral, ['Solicitud de Reactivos', 'Solicitudes de Reactivos', 'Solicitud Reactivos']), bucket: 'reactivos', dateCol: 1, emailCol: 7 },
        { sheet: getSheetByAnyName_(ssGeneral, ['Uso de Reactivo', 'Uso de Reactivos', 'Uso Reactivo']), bucket: 'reactivos', dateCol: 1, emailCol: 6 },
      ];

      sources.forEach(src => {
        const sh = src.sheet;
        if (!sh || sh.getLastRow() < 2) return;
        const values = sh.getDataRange().getValues().slice(1);
        values.forEach(r => {
          totals[src.bucket] += 1;
          totals.total += 1;

          const dt = parseAnyDate_(r[src.dateCol], tz);
          if (dt) {
            // Range totals
            if (dt >= range.from && dt <= range.to) {
              totalsRange[src.bucket] += 1;
              totalsRange.total += 1;
            }

            const day = Utilities.formatDate(dt, tz, 'yyyy-MM-dd');
            if (day === todayKey) {
              today[src.bucket] += 1;
              today.total += 1;
            }
            const month = Utilities.formatDate(dt, tz, 'yyyy-MM');
            const mo = monthlyIndex[month];
            if (mo) {
              mo[src.bucket] += 1;
              mo.total += 1;
            }
            if (dt >= last30) {
              const email = String(r[src.emailCol] || '').trim().toLowerCase();
              if (email) uniqueSet.add(email);
            }
          }
        });
      });

      // Top usuarios (por email) ultimos 30 dias + actividad reciente.
      const userCounts = {};
      const recent = [];

      const pushRecent = (dt, type, item, email) => {
        if (!dt) return;
        recent.push({
          ts: dt.getTime(),
          date: Utilities.formatDate(dt, tz, 'yyyy-MM-dd'),
          type: type || '',
          item: item || '',
          email: email || ''
        });
      };

      const bumpUser = (dt, email) => {
        if (!dt) return;
        const em = String(email || '').trim().toLowerCase();
        if (!em) return;
        if (dt >= last30) {
          userCounts[em] = (userCounts[em] || 0) + 1;
        }
      };

      // Recorre de nuevo solo ultimas filas para construir recent/topUsers (ligero)
      sources.forEach(src => {
        const sh = src.sheet;
        if (!sh || sh.getLastRow() < 2) return;
        const last = sh.getLastRow();
        const startRow = Math.max(2, last - 30);
        const rows = sh.getRange(startRow, 1, last - startRow + 1, sh.getLastColumn()).getValues();
        rows.forEach(r => {
          const dt = parseAnyDate_(r[src.dateCol], tz);
          const email = String(r[src.emailCol] || '').trim();
          bumpUser(dt, email);

          // item label heuristics per sheet
          let item = '';
          if (src.bucket === 'equipos') item = r[2] || '';
          else if (src.bucket === 'materiales') item = r[3] || r[2] || '';
          else if (src.bucket === 'reactivos') item = r[2] || '';
          else if (src.bucket === 'registro') item = r[2] || '';

          pushRecent(dt, src.bucket, item, email);
        });
      });

      recent.sort((a, b) => b.ts - a.ts);
      const recentOut = recent.slice(0, 10).map(r => ({ date: r.date, type: r.type, item: r.item, email: r.email }));

      const topUsersLast30 = Object.entries(userCounts)
        .map(([email, count]) => ({ email: email, count: count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

      // Items del rango seleccionado (lista operativa para el admin)
      const rangeItems = [];
      const pushRangeItem = (dt, type, item, nombre, email) => {
        if (!dt) return;
        if (dt < range.from || dt > range.to) return;
        const day = Utilities.formatDate(dt, tz, 'yyyy-MM-dd');
        rangeItems.push({
          ts: dt.getTime(),
          date: day,
          type: type || '',
          item: item || '',
          name: nombre || '',
          email: email || ''
        });
      };

      // Revisa las ultimas N filas de cada hoja (asumimos que hoy queda al final)
      const scanRange = (src, typeLabel, itemCol) => {
        const sh = src.sheet;
        if (!sh || sh.getLastRow() < 2) return;
        const last = sh.getLastRow();
        const startRow = Math.max(2, last - 1000);
        const rows = sh.getRange(startRow, 1, last - startRow + 1, sh.getLastColumn()).getValues();
        rows.forEach(r => {
          const dt = parseAnyDate_(r[src.dateCol], tz);
          const nombre = String(r[0] || '').trim();
          const email = String(r[src.emailCol] || '').trim();
          const item = String(r[itemCol] || '').trim();
          pushRangeItem(dt, typeLabel, item, nombre, email);
        });
      };

      // Map por hoja: typeLabel y columna item
      scanRange(sources[0], 'Solicitud - Equipos', 2);
      scanRange(sources[1], 'Registro - Equipos', 2);
      scanRange(sources[2], 'Solicitud - Materiales', 3);
      scanRange(sources[3], 'Registro - Materiales', 3);
      scanRange(sources[4], 'Solicitud - Reactivos', 2);
      scanRange(sources[5], 'Registro - Reactivos', 2);

      rangeItems.sort((a, b) => b.ts - a.ts);
      const rangeOut = rangeItems.slice(0, 60).map(x => ({ date: x.date, type: x.type, item: x.item, name: x.name, email: x.email }));

      output = {
        range: {
          key: rangeKey,
          from: Utilities.formatDate(range.from, tz, 'yyyy-MM-dd'),
          to: Utilities.formatDate(range.to, tz, 'yyyy-MM-dd'),
        },

        // Totales del rango seleccionado
        total: totalsRange.total,
        equipos: totalsRange.equipos,
        materiales: totalsRange.materiales,
        reactivos: totalsRange.reactivos,
        registro: totalsRange.registro,

        // Totales historicos
        allTime: {
          total: totals.total,
          equipos: totals.equipos,
          materiales: totals.materiales,
          reactivos: totals.reactivos,
          registro: totals.registro,
        },
        byType: {
          equipos: totalsRange.equipos,
          materiales: totalsRange.materiales,
          reactivos: totalsRange.reactivos,
          registro: totalsRange.registro,
        },
        today: today,
        uniqueUsersLast30: uniqueSet.size,
        monthly: monthly,
        topUsersLast30: topUsersLast30,
        recent: recentOut,
        periodItems: rangeOut,
      };
      break;
    }
    default:
      output = { error: 'Acción no reconocida' };
  }
  const cbRaw = (e.parameter && e.parameter.callback) ? String(e.parameter.callback) : '';
  const cb = (/^[a-zA-Z_$][0-9a-zA-Z_$\.]*$/).test(cbRaw) ? cbRaw : '';

  const json = JSON.stringify(output);
  if (cb) {
    return ContentService
      .createTextOutput(`${cb}(${json});`)
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService
    .createTextOutput(json)
    .setMimeType(ContentService.MimeType.JSON);
}

// =================== HELPERS doGet =========================
function getColumnValues_(sheet, col) {
  if (!sheet) return [];
  const last = sheet.getLastRow();
  if (last < 2) return [];
  const data = sheet.getRange(2, col, last - 1).getValues();
  return data.flat().filter(String);
}

/**
 * Intenta convertir un valor de hoja (Date o string) a Date.
 * Acepta formatos comunes: Date, yyyy-MM-dd, dd/MM/yyyy.
 * Devuelve null si no se puede parsear.
 */
function parseAnyDate_(value, tz) {
  if (!value) return null;
  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) {
    return value;
  }
  const s = String(value).trim();
  if (!s) return null;

  // yyyy-MM-dd
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) {
    const y = Number(m[1]);
    const mo = Number(m[2]) - 1;
    const d = Number(m[3]);
    const dt = new Date(y, mo, d);
    if (!isNaN(dt.getTime())) return dt;
  }

  // dd/MM/yyyy
  m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) {
    const d = Number(m[1]);
    const mo = Number(m[2]) - 1;
    const y = Number(m[3]);
    const dt = new Date(y, mo, d);
    if (!isNaN(dt.getTime())) return dt;
  }

  // Fallback: Date(s)
  const dt = new Date(s);
  if (!isNaN(dt.getTime())) return dt;
  return null;
}

function normalizeSheetName_(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function getSheetByAnyName_(ss, names) {
  if (!ss) return null;
  const candidates = (names || []).map(normalizeSheetName_);
  const sheets = ss.getSheets();
  for (const sh of sheets) {
    const n = normalizeSheetName_(sh.getName());
    if (candidates.includes(n)) return sh;
  }
  // fallback: partial match
  for (const sh of sheets) {
    const n = normalizeSheetName_(sh.getName());
    for (const c of candidates) {
      if (c && n.includes(c)) return sh;
    }
  }
  return null;
}

function computeRange_(rangeKey, now, tz) {
  const key = String(rangeKey || 'day').toLowerCase();
  const y = now.getFullYear();
  const m = now.getMonth();
  const d = now.getDate();

  // normalize to local midnight
  const today0 = new Date(y, m, d);
  let from = today0;
  let to = new Date(y, m, d, 23, 59, 59, 999);

  if (key === 'week') {
    // Monday..Sunday (ISO-like). JS: 0=Sun..6=Sat
    const dow = today0.getDay();
    const diffToMon = (dow + 6) % 7;
    from = new Date(today0);
    from.setDate(today0.getDate() - diffToMon);
    to = new Date(from);
    to.setDate(from.getDate() + 6);
    to.setHours(23, 59, 59, 999);
  } else if (key === 'month') {
    from = new Date(y, m, 1);
    to = new Date(y, m + 1, 0);
    to.setHours(23, 59, 59, 999);
  }

  return { key: key, from: from, to: to };
}

function getAgendaEquipos_(ssGeneral, days) {
  const tz = Session.getScriptTimeZone();
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(start);
  end.setDate(start.getDate() + Number(days || 14));
  end.setHours(23, 59, 59, 999);

  const sh = getSheetByAnyName_(ssGeneral, ['Solicitud de Equipos', 'Solicitudes de Equipos', 'Solicitud Equipos']);
  if (!sh || sh.getLastRow() < 2) return { range: { from: Utilities.formatDate(start, tz, 'yyyy-MM-dd'), to: Utilities.formatDate(end, tz, 'yyyy-MM-dd') }, upcoming: [] };

  const values = sh.getDataRange().getValues().slice(1);
  const out = [];
  values.forEach(r => {
    // Expected columns: nombre, fecha, equipo, fechaInicial, fechaFinal, observaciones, correo
    const equipo = String(r[2] || '').trim();
    const fromDt = parseAnyDate_(r[3], tz);
    const toDt = parseAnyDate_(r[4], tz) || fromDt;
    if (!fromDt) return;
    // intersect [fromDt,toDt] with [start,end]
    const a0 = new Date(fromDt.getFullYear(), fromDt.getMonth(), fromDt.getDate());
    const b0 = new Date((toDt || fromDt).getFullYear(), (toDt || fromDt).getMonth(), (toDt || fromDt).getDate(), 23, 59, 59, 999);
    if (b0 < start || a0 > end) return;
    out.push({
      from: Utilities.formatDate(a0, tz, 'yyyy-MM-dd'),
      to: Utilities.formatDate(b0, tz, 'yyyy-MM-dd'),
      equipo: equipo,
      nombre: String(r[0] || '').trim(),
      correo: String(r[6] || '').trim(),
    });
  });

  out.sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : 0));
  return {
    range: { from: Utilities.formatDate(start, tz, 'yyyy-MM-dd'), to: Utilities.formatDate(end, tz, 'yyyy-MM-dd') },
    upcoming: out.slice(0, 30)
  };
}

// =================== DASHBOARD (ADMIN) ======================
function buildDashboard_(ssGeneral) {
  const tz = Session.getScriptTimeZone();
  const now = new Date();
  const today0 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayEnd = new Date(today0);
  todayEnd.setHours(23, 59, 59, 999);

  // Exact sheets per spec (ignore empty without crashing)
  const shResumen = ssGeneral.getSheetByName('Resumen general');
  const shReqEq = ssGeneral.getSheetByName('Solicitud de Equipos');
  const shReqRe = ssGeneral.getSheetByName('Solicitud de Reactivos');
  const shReqSu = ssGeneral.getSheetByName('Solicitud de Insumos');
  const shUseEq = ssGeneral.getSheetByName('Uso de equipo');
  const shUseRe = ssGeneral.getSheetByName('Uso de Reactivo');
  const shUseSu = ssGeneral.getSheetByName('Uso de Insumos');
  const shUseLab = ssGeneral.getSheetByName('Uso de Laboratorio');

  /** @type {Array<Object>} */
  const events = [];

  // Helpers
  const pushEvent = (ev) => {
    if (!ev) return;
    if (rowLooksEmpty_(ev)) return;
    // sanitize NaN strings
    ['user_name', 'user_email', 'resource_name', 'date_start', 'date_end', 'status', 'notes'].forEach(k => {
      if (String(ev[k]) === 'NaN') ev[k] = null;
      if (typeof ev[k] === 'string') {
        const t = ev[k].trim();
        ev[k] = t ? t : null;
      }
    });
    if (!ev.event_id) ev.event_id = `ev_${Math.random().toString(36).slice(2)}`;
    events.push(ev);
  };

  // 1) Solicitud de Equipos
  if (shReqEq && shReqEq.getLastRow() >= 2) {
    const rows = shReqEq.getDataRange().getValues().slice(1);
    rows.forEach((r, idx) => {
      if (rowIsEmpty_(r)) return;
      const nombre = cellStr_(r[0]);
      const fechaEnvio = parseAnyDate_(r[1], tz);
      const equipo = cellStr_(r[2]);
      const fi = parseAnyDate_(r[3], tz);
      const ff = parseAnyDate_(r[4], tz);
      const obs = cellStr_(r[5]);
      const correo = cellStr_(r[6]);
      const start = fi || fechaEnvio;
      const end = ff || null;

      pushEvent({
        event_id: `Solicitud de Equipos#${idx + 2}`,
        event_type: 'REQUEST_EQUIPMENT',
        user_name: nombre,
        user_email: emailOrNull_(correo),
        resource_name: equipo,
        resource_type: 'Equipo',
        date_start: isoDate_(start, tz),
        date_end: isoDate_(end, tz),
        status: statusRequestEquipment_(fi, ff, today0, todayEnd),
        notes: obs || null,
      });
    });
  }

  // 2) Uso de equipo
  if (shUseEq && shUseEq.getLastRow() >= 2) {
    const rows = shUseEq.getDataRange().getValues().slice(1);
    rows.forEach((r, idx) => {
      if (rowIsEmpty_(r)) return;
      const nombre = cellStr_(r[0]);
      const fecha = parseAnyDate_(r[1], tz);
      const equipo = cellStr_(r[2]);
      const act = cellStr_(r[3]);
      const obs = cellStr_(r[4]);
      const correo = cellStr_(r[5]);
      pushEvent({
        event_id: `Uso de equipo#${idx + 2}`,
        event_type: 'USE_EQUIPMENT',
        user_name: nombre,
        user_email: emailOrNull_(correo),
        resource_name: equipo,
        resource_type: 'Equipo',
        date_start: isoDate_(fecha, tz),
        date_end: null,
        status: 'REGISTRADO',
        notes: joinNotes_([act, obs]),
      });
    });
  }

  // 3) Solicitud de Reactivos
  if (shReqRe && shReqRe.getLastRow() >= 2) {
    const rows = shReqRe.getDataRange().getValues().slice(1);
    rows.forEach((r, idx) => {
      if (rowIsEmpty_(r)) return;
      const nombre = cellStr_(r[0]);
      const fecha = parseAnyDate_(r[1], tz);
      const reactivo = cellStr_(r[2]);
      const cantidad = cellStr_(r[3]);
      const lab = cellStr_(r[4]);
      const tipoAct = cellStr_(r[5]);
      const obs = cellStr_(r[6]);
      const correo = cellStr_(r[7]);
      pushEvent({
        event_id: `Solicitud de Reactivos#${idx + 2}`,
        event_type: 'REQUEST_REAGENT',
        user_name: nombre,
        user_email: emailOrNull_(correo),
        resource_name: reactivo,
        resource_type: 'Reactivo',
        date_start: isoDate_(fecha, tz),
        date_end: null,
        status: 'SOLICITADO',
        notes: joinNotes_([cantidad, lab, tipoAct, obs]),
      });
    });
  }

  // 4) Uso de Reactivo
  if (shUseRe && shUseRe.getLastRow() >= 2) {
    const rows = shUseRe.getDataRange().getValues().slice(1);
    rows.forEach((r, idx) => {
      if (rowIsEmpty_(r)) return;
      const nombre = cellStr_(r[0]);
      const fecha = parseAnyDate_(r[1], tz);
      const reactivo = cellStr_(r[2]);
      const cantidad = cellStr_(r[3]);
      const tipoAct = cellStr_(r[4]);
      const obs = cellStr_(r[5]);
      const correo = cellStr_(r[6]);
      pushEvent({
        event_id: `Uso de Reactivo#${idx + 2}`,
        event_type: 'USE_REAGENT',
        user_name: nombre,
        user_email: emailOrNull_(correo),
        resource_name: reactivo,
        resource_type: 'Reactivo',
        date_start: isoDate_(fecha, tz),
        date_end: null,
        status: 'REGISTRADO',
        notes: joinNotes_([cantidad, tipoAct, obs]),
      });
    });
  }

  // 5) Solicitud de Insumos
  if (shReqSu && shReqSu.getLastRow() >= 2) {
    const rows = shReqSu.getDataRange().getValues().slice(1);
    rows.forEach((r, idx) => {
      if (rowIsEmpty_(r)) return;
      const nombre = cellStr_(r[0]);
      const fecha = parseAnyDate_(r[1], tz);
      const estadoRaw = cellStr_(r[2]);
      const insumo = cellStr_(r[3]);
      const devol = parseAnyDate_(r[4], tz);
      const obs = cellStr_(r[5]);
      const correo = cellStr_(r[6]);
      const status = statusRequestSupply_(estadoRaw, devol, today0, todayEnd);
      pushEvent({
        event_id: `Solicitud de Insumos#${idx + 2}`,
        event_type: 'REQUEST_SUPPLY',
        user_name: nombre,
        user_email: emailOrNull_(correo),
        resource_name: insumo,
        resource_type: 'Insumo',
        date_start: isoDate_(fecha, tz),
        date_end: isoDate_(devol, tz),
        status: status,
        notes: obs || null,
      });
    });
  }

  // 6) Uso de Insumos (mapear como REQUEST_SUPPLY + status=REGISTRADO)
  if (shUseSu && shUseSu.getLastRow() >= 2) {
    const rows = shUseSu.getDataRange().getValues().slice(1);
    rows.forEach((r, idx) => {
      if (rowIsEmpty_(r)) return;
      const nombre = cellStr_(r[0]);
      const fecha = parseAnyDate_(r[1], tz);
      const insumo = cellStr_(r[3]);
      const act = cellStr_(r[4]);
      const obs = cellStr_(r[5]);
      const correo = cellStr_(r[6]);
      pushEvent({
        event_id: `Uso de Insumos#${idx + 2}`,
        event_type: 'REQUEST_SUPPLY',
        user_name: nombre,
        user_email: emailOrNull_(correo),
        resource_name: insumo,
        resource_type: 'Insumo',
        date_start: isoDate_(fecha, tz),
        date_end: null,
        status: 'REGISTRADO',
        notes: joinNotes_([act, obs]),
      });
    });
  }

  // 7) Uso de Laboratorio (email real en Unnamed:7)
  if (shUseLab && shUseLab.getLastRow() >= 2) {
    const rows = shUseLab.getDataRange().getValues().slice(1);
    rows.forEach((r, idx) => {
      if (rowIsEmpty_(r)) return;
      const nombre = cellStr_(r[0]);
      const fecha = parseAnyDate_(r[1], tz);
      const act = cellStr_(r[2]);
      const tipo = cellStr_(r[3]);
      const obs = cellStr_(r[4]);
      const correoMalo = cellStr_(r[5]);
      const extra = cellStr_(r[6]);
      const correoReal = cellStr_(r[7]);
      pushEvent({
        event_id: `Uso de Laboratorio#${idx + 2}`,
        event_type: 'LAB_USAGE',
        user_name: nombre,
        user_email: emailOrNull_(correoReal),
        resource_name: 'LQ1D / Laboratorio de Quimica 1',
        resource_type: 'Laboratorio',
        date_start: isoDate_(fecha, tz),
        date_end: null,
        status: 'REGISTRADO',
        notes: joinNotes_([obs, act, tipo, extra, correoMalo]),
      });
    });
  }

  // 8) Resumen general (fallback only)
  // Use only when specific sheets missing key fields; keep off by default.
  // (Left intentionally as audit layer.)

  // ---- User key normalization ----
  events.forEach(ev => {
    ev.user_key = userKey_(ev.user_email, ev.user_name);
  });

  // ---- KPIs ----
  const requestTypes = new Set(['REQUEST_EQUIPMENT', 'REQUEST_REAGENT', 'REQUEST_SUPPLY']);
  const totalRequests = events.filter(e => requestTypes.has(e.event_type)).length;

  const equipmentInUseNow = events.filter(e => {
    if (e.event_type !== 'REQUEST_EQUIPMENT') return false;
    const s = parseAnyDate_(e.date_start, tz);
    const en = parseAnyDate_(e.date_end, tz);
    if (!s) return false;
    if (!en) return false; // spec: only if date_end exists
    return s <= todayEnd && en >= today0;
  }).length;

  const reagentsUseEvents = events.filter(e => e.event_type === 'USE_REAGENT').length;

  const suppliesActiveNow = events.filter(e => {
    if (e.event_type !== 'REQUEST_SUPPLY') return false;
    const st = String(e.status || '').toUpperCase();
    const de = e.date_end ? parseAnyDate_(e.date_end, tz) : null;
    if (st === 'COMPLETO') return false;
    if (!de) return true;
    return de >= today0;
  }).length;

  const since30 = new Date(today0.getTime() - 30 * 24 * 60 * 60 * 1000);
  const users30 = new Set(
    events
      .filter(e => {
        const d = parseAnyDate_(e.date_start, tz);
        return d && d >= since30;
      })
      .map(e => e.user_key)
      .filter(Boolean)
  ).size;

  // ---- Timeline monthly (last 12 months) ----
  const monthKeys = lastNMonths_(today0, 12, tz);
  const monthIndex = {};
  monthKeys.forEach((k, i) => { monthIndex[k] = i; });

  const emptyArr = () => new Array(monthKeys.length).fill(0);
  const tl = {
    request_equipment: emptyArr(),
    request_reagent: emptyArr(),
    request_supply: emptyArr(),
    use_equipment: emptyArr(),
    use_reagent: emptyArr(),
    lab_usage: emptyArr(),
    total_monthly: emptyArr(),
    labels: monthKeys.map(k => formatMonthLabel_(k)),
  };

  events.forEach(e => {
    const d = parseAnyDate_(e.date_start, tz);
    if (!d) return;
    const k = Utilities.formatDate(d, tz, 'yyyy-MM');
    const i = monthIndex[k];
    if (i === undefined) return;
    switch (e.event_type) {
      case 'REQUEST_EQUIPMENT': tl.request_equipment[i] += 1; break;
      case 'REQUEST_REAGENT': tl.request_reagent[i] += 1; break;
      case 'REQUEST_SUPPLY': tl.request_supply[i] += 1; break;
      case 'USE_EQUIPMENT': tl.use_equipment[i] += 1; break;
      case 'USE_REAGENT': tl.use_reagent[i] += 1; break;
      case 'LAB_USAGE': tl.lab_usage[i] += 1; break;
      default: break;
    }
  });
  for (let i = 0; i < monthKeys.length; i++) {
    tl.total_monthly[i] = tl.request_equipment[i] + tl.request_reagent[i] + tl.request_supply[i] + tl.use_equipment[i] + tl.use_reagent[i] + tl.lab_usage[i];
  }

  // ---- Reagents: consumed vs requested with unit normalization ----
  const reagentsAgg = {};
  const usedTotals = { mass_g: 0, volume_mL: 0, amount_mmol: 0, unknown: 0 };
  const reqTotals = { mass_g: 0, volume_mL: 0, amount_mmol: 0, unknown: 0 };

  const ensureReagent_ = (name) => {
    const key = normalizeReagentName_(name);
    if (!reagentsAgg[key]) {
      reagentsAgg[key] = {
        key,
        nameCounts: {},
        used: { events: 0, mass_g: 0, volume_mL: 0, amount_mmol: 0, unknown: 0, unknown_examples: [] },
        requested: { events: 0, mass_g: 0, volume_mL: 0, amount_mmol: 0, unknown: 0, unknown_examples: [] },
      };
    }
    if (name) {
      const display = String(name).trim();
      if (display) reagentsAgg[key].nameCounts[display] = (reagentsAgg[key].nameCounts[display] || 0) + 1;
    }
    return reagentsAgg[key];
  };

  // Use sheet "Uso de Reactivo" as primary source for consumed.
  if (shUseRe && shUseRe.getLastRow() >= 2) {
    const rows = shUseRe.getDataRange().getValues().slice(1);
    rows.forEach(r => {
      if (rowIsEmpty_(r)) return;
      const reactivo = cellStr_(r[2]);
      const cantidad = cellStr_(r[3]);
      const agg = ensureReagent_(reactivo);
      agg.used.events += 1;
      const parsed = parseQuantity_(cantidad);
      if (parsed.ok) {
        if (parsed.dimension === 'mass') { agg.used.mass_g += parsed.baseValue; usedTotals.mass_g += parsed.baseValue; }
        else if (parsed.dimension === 'volume') { agg.used.volume_mL += parsed.baseValue; usedTotals.volume_mL += parsed.baseValue; }
        else if (parsed.dimension === 'amount') { agg.used.amount_mmol += parsed.baseValue; usedTotals.amount_mmol += parsed.baseValue; }
      } else {
        agg.used.unknown += 1;
        usedTotals.unknown += 1;
        if (cantidad && agg.used.unknown_examples.length < 5) agg.used.unknown_examples.push(cantidad);
      }
    });
  }

  // Requested
  if (shReqRe && shReqRe.getLastRow() >= 2) {
    const rows = shReqRe.getDataRange().getValues().slice(1);
    rows.forEach(r => {
      if (rowIsEmpty_(r)) return;
      const reactivo = cellStr_(r[2]);
      const cantidad = cellStr_(r[3]);
      const agg = ensureReagent_(reactivo);
      agg.requested.events += 1;
      const parsed = parseQuantity_(cantidad);
      if (parsed.ok) {
        if (parsed.dimension === 'mass') { agg.requested.mass_g += parsed.baseValue; reqTotals.mass_g += parsed.baseValue; }
        else if (parsed.dimension === 'volume') { agg.requested.volume_mL += parsed.baseValue; reqTotals.volume_mL += parsed.baseValue; }
        else if (parsed.dimension === 'amount') { agg.requested.amount_mmol += parsed.baseValue; reqTotals.amount_mmol += parsed.baseValue; }
      } else {
        agg.requested.unknown += 1;
        reqTotals.unknown += 1;
        if (cantidad && agg.requested.unknown_examples.length < 5) agg.requested.unknown_examples.push(cantidad);
      }
    });
  }

  const reagentTotalsList = Object.values(reagentsAgg).map(x => {
    const display = mostFrequentKey_(x.nameCounts) || x.key;
    return {
      reagent_display_name: display,
      key: x.key,
      used: {
        events: x.used.events,
        mass_g: round3_(x.used.mass_g) || null,
        volume_mL: round3_(x.used.volume_mL) || null,
        amount_mmol: round3_(x.used.amount_mmol) || null,
        unknown: x.used.unknown,
      },
      requested: {
        events: x.requested.events,
        mass_g: round3_(x.requested.mass_g) || null,
        volume_mL: round3_(x.requested.volume_mL) || null,
        amount_mmol: round3_(x.requested.amount_mmol) || null,
        unknown: x.requested.unknown,
      }
    };
  });

  const topConsumedMass = topBy_(reagentTotalsList, r => r.used.mass_g || 0, 10);
  const topConsumedVol = topBy_(reagentTotalsList, r => r.used.volume_mL || 0, 10);
  const topReqMass = topBy_(reagentTotalsList, r => r.requested.mass_g || 0, 10);
  const topReqVol = topBy_(reagentTotalsList, r => r.requested.volume_mL || 0, 10);

  // Debug: unknown units
  if (usedTotals.unknown || reqTotals.unknown) {
    const usedEx = Object.values(reagentsAgg).flatMap(x => x.used.unknown_examples || []).slice(0, 5);
    const reqEx = Object.values(reagentsAgg).flatMap(x => x.requested.unknown_examples || []).slice(0, 5);
    console.log('[dashboard] unknown quantities used:', usedEx);
    console.log('[dashboard] unknown quantities requested:', reqEx);
  }

  // ---- Resource status ----
  const topRequestedEquipos = topN_(countBy_(events.filter(e => e.event_type === 'REQUEST_EQUIPMENT'), 'resource_name'), 5);
  const topUsedEquipos = topN_(countBy_(events.filter(e => e.event_type === 'USE_EQUIPMENT'), 'resource_name'), 5);
  const topLentInsumos = topN_(countBy_(events.filter(e => e.event_type === 'REQUEST_SUPPLY'), 'resource_name'), 10);

  // Catalog equipos (optional)
  let catalogCount = null;
  try {
    const sheetEquiposData = SpreadsheetApp.openById(SS_EQUIPOS_ID).getSheetByName('Equipos');
    const c = getColumnValues_(sheetEquiposData, 1).length;
    catalogCount = c > 0 ? c : null;
  } catch (_) {}

  const availableNow = catalogCount === null ? null : Math.max(0, catalogCount - equipmentInUseNow);

  // ---- Users activity ----
  const byUser = {};
  const bumpName = (obj, name) => {
    const n = String(name || '').trim();
    if (!n) return;
    obj._nameCounts[n] = (obj._nameCounts[n] || 0) + 1;
  };
  const bumpEmail = (obj, email) => {
    const e = emailOrNull_(email);
    if (!e) return;
    obj._emailCounts[e] = (obj._emailCounts[e] || 0) + 1;
  };
  events.forEach(e => {
    const key = e.user_key;
    if (!key) return;
    if (!byUser[key]) {
      byUser[key] = {
        user_key: key,
        _nameCounts: {},
        _emailCounts: {},
        total_requests: 0,
        use_equipment: 0,
        use_reagent: 0,
        total_activity: 0,
        last_activity: null,
      };
    }
    const u = byUser[key];
    bumpName(u, e.user_name);
    bumpEmail(u, e.user_email);
    if (requestTypes.has(e.event_type)) u.total_requests += 1;
    if (e.event_type === 'USE_EQUIPMENT') u.use_equipment += 1;
    if (e.event_type === 'USE_REAGENT') u.use_reagent += 1;
    u.total_activity += 1;
    const d = parseAnyDate_(e.date_start, tz);
    if (d && (!u.last_activity || d > u.last_activity)) u.last_activity = d;
  });
  const usersRows = Object.values(byUser)
    .map(u => {
      const name = mostFrequentKey_(u._nameCounts) || u.user_key;
      const email = mostFrequentKey_(u._emailCounts) || null;
      return {
        name,
        email,
        total_requests: u.total_requests,
        use_equipment: u.use_equipment,
        use_reagent: u.use_reagent,
        last_activity: u.last_activity ? Utilities.formatDate(u.last_activity, tz, 'yyyy-MM-dd') : '',
        total_activity: u.total_activity,
      };
    })
    .sort((a, b) => b.total_activity - a.total_activity);

  const topUsers = usersRows.slice(0, 10).map(u => ({ name: u.email || u.name, value: u.total_activity }));

  // ---- Recent events ----
  const allowedRecent = new Set(['REQUEST_EQUIPMENT', 'USE_EQUIPMENT', 'REQUEST_REAGENT', 'USE_REAGENT', 'REQUEST_SUPPLY']);
  const recent = events
    .filter(e => allowedRecent.has(e.event_type))
    .map(e => {
      const d = parseAnyDate_(e.date_start, tz);
      return {
        event_type: e.event_type,
        user_name: e.user_name || null,
        user_email: e.user_email || null,
        resource_name: e.resource_name || null,
        date_start: d ? Utilities.formatDate(d, tz, 'yyyy-MM-dd') : (e.date_start || null),
        status: e.status || null,
      };
    })
    .sort((a, b) => {
      const ta = a.date_start ? new Date(a.date_start).getTime() : 0;
      const tb = b.date_start ? new Date(b.date_start).getTime() : 0;
      return tb - ta;
    })
    .slice(0, 20);

  return {
    kpis: {
      total_requests: totalRequests,
      equipment_in_use_now: equipmentInUseNow,
      reagents_use_events: reagentsUseEvents,
      supplies_active_now: suppliesActiveNow,
      unique_users_30d: users30,
      reagents_consumed: {
        total_mass_g: round3_(usedTotals.mass_g),
        total_volume_mL: round3_(usedTotals.volume_mL),
        total_amount_mmol: round3_(usedTotals.amount_mmol),
        unknown_used_events: usedTotals.unknown,
      },
      reagents_requested: {
        total_mass_g: round3_(reqTotals.mass_g),
        total_volume_mL: round3_(reqTotals.volume_mL),
        total_amount_mmol: round3_(reqTotals.amount_mmol),
        unknown_requested_events: reqTotals.unknown,
      }
    },
    timeline_monthly: {
      labels: tl.labels,
      REQUEST_EQUIPMENT: tl.request_equipment,
      REQUEST_REAGENT: tl.request_reagent,
      REQUEST_SUPPLY: tl.request_supply,
      USE_EQUIPMENT: tl.use_equipment,
      USE_REAGENT: tl.use_reagent,
      LAB_USAGE: tl.lab_usage,
      total_monthly: tl.total_monthly,
    },
    resource_status: {
      equipment: {
        in_use_now: equipmentInUseNow,
        available_now: availableNow,
        top_requested: topRequestedEquipos,
        top_used: topUsedEquipos,
      },
      reagents: {
        total_use_events: reagentsUseEvents,
        totals_by_reagent: reagentTotalsList,
        top_consumed_by_mass_g: topConsumedMass.map(x => ({ name: x.reagent_display_name, value: x.used.mass_g || 0 })),
        top_consumed_by_volume_mL: topConsumedVol.map(x => ({ name: x.reagent_display_name, value: x.used.volume_mL || 0 })),
        top_requested_by_mass_g: topReqMass.map(x => ({ name: x.reagent_display_name, value: x.requested.mass_g || 0 })),
        top_requested_by_volume_mL: topReqVol.map(x => ({ name: x.reagent_display_name, value: x.requested.volume_mL || 0 })),
      },
      supplies: {
        active_now: suppliesActiveNow,
        top_lent: topLentInsumos,
      }
    },
    users_activity: {
      rows: usersRows.map(u => ({
        name: u.name,
        email: u.email,
        total_requests: u.total_requests,
        use_equipment: u.use_equipment,
        use_reagent: u.use_reagent,
        last_activity: u.last_activity,
        total_activity: u.total_activity,
      })),
      top10: topUsers,
    },
    recent_events: {
      items: recent,
    }
  };
}

// =================== DASHBOARD HELPERS ======================
function rowIsEmpty_(row) {
  if (!row || !row.length) return true;
  for (let i = 0; i < row.length; i++) {
    const v = row[i];
    if (v === null || v === undefined) continue;
    if (Object.prototype.toString.call(v) === '[object Date]') return false;
    const s = String(v).trim();
    if (s && s !== 'NaN') return false;
  }
  return true;
}

function rowLooksEmpty_(ev) {
  if (!ev) return true;
  const keys = ['user_name', 'user_email', 'resource_name', 'date_start', 'status', 'notes'];
  return keys.every(k => {
    const v = ev[k];
    if (v === null || v === undefined) return true;
    const s = String(v).trim();
    return !s || s === 'NaN';
  });
}

function cellStr_(v) {
  if (v === null || v === undefined) return '';
  if (Object.prototype.toString.call(v) === '[object Date]') {
    // Don't stringify Date here
    return '';
  }
  const s = String(v).trim();
  return s === 'NaN' ? '' : s;
}

function emailOrNull_(email) {
  const s = String(email || '').trim();
  if (!s || s === 'NaN') return null;
  const v = s.toLowerCase();
  // Simple email heuristic
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return null;
  return v;
}

function isoDate_(dt, tz) {
  if (!dt || isNaN(dt.getTime())) return null;
  return Utilities.formatDate(dt, tz, 'yyyy-MM-dd');
}

function joinNotes_(parts) {
  const out = [];
  (parts || []).forEach(p => {
    const s = String(p || '').trim();
    if (s && s !== 'NaN') out.push(s);
  });
  return out.length ? out.join(' | ') : null;
}

function userKey_(userEmail, userName) {
  const em = emailOrNull_(userEmail);
  if (em) return em;
  const name = String(userName || '').trim().toLowerCase();
  return name || null;
}

function statusRequestEquipment_(fi, ff, today0, todayEnd) {
  const start = fi && !isNaN(fi.getTime()) ? new Date(fi.getFullYear(), fi.getMonth(), fi.getDate()) : null;
  const end = ff && !isNaN(ff.getTime())
    ? new Date(ff.getFullYear(), ff.getMonth(), ff.getDate(), 23, 59, 59, 999)
    : null;

  if (start && end) {
    if (end < today0) return 'COMPLETO';
    if (start > todayEnd) return 'PROGRAMADO';
    if (start <= todayEnd && end >= today0) return 'ACTIVO';
  }
  if (end && end < today0) return 'COMPLETO';
  if (start && start > todayEnd) return 'PROGRAMADO';
  return 'PENDIENTE';
}

function normalizeStatusSupplyText_(estadoRaw) {
  const s = String(estadoRaw || '').trim().toLowerCase();
  if (!s) return null;
  if (s.includes('devuelto') || s.includes('completo') || s.includes('cerrado')) return 'COMPLETO';
  if (s.includes('pend')) return 'ACTIVO';
  if (s.includes('activo')) return 'ACTIVO';
  return s.toUpperCase();
}

function statusRequestSupply_(estadoRaw, fechaDev, today0, todayEnd) {
  const normalized = normalizeStatusSupplyText_(estadoRaw);
  if (normalized) return normalized;
  if (!fechaDev || isNaN(fechaDev.getTime())) return 'ACTIVO';
  const due = new Date(fechaDev.getFullYear(), fechaDev.getMonth(), fechaDev.getDate(), 23, 59, 59, 999);
  if (due < today0) return 'VENCIDO';
  if (due >= today0 && due <= todayEnd) return 'ACTIVO';
  return 'ACTIVO';
}

function mostFrequentKey_(counts) {
  let bestK = null;
  let bestV = -1;
  Object.entries(counts || {}).forEach(([k, v]) => {
    const n = Number(v) || 0;
    if (n > bestV) { bestV = n; bestK = k; }
  });
  return bestK;
}

function topBy_(arr, getValue, n) {
  return (arr || [])
    .slice()
    .sort((a, b) => (Number(getValue(b)) || 0) - (Number(getValue(a)) || 0))
    .slice(0, n);
}

function round3_(x) {
  const n = Number(x) || 0;
  return Math.round(n * 1000) / 1000;
}

function normalizeReagentName_(name) {
  let s = String(name || '').trim();
  if (!s || s === 'NaN') return '';
  // Replace separators
  s = s.replace(/[–_]/g, '-');
  // Normalize diacritics
  s = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  s = s.toLowerCase().replace(/\s+/g, ' ');

  // Extract formula in parentheses (optional alias)
  const m = s.match(/^(.*?)\((.*?)\)\s*$/);
  if (m) {
    const base = String(m[1] || '').trim().replace(/\s+/g, ' ');
    const formula = String(m[2] || '').trim().replace(/\s+/g, ' ');
    if (base && formula) return `${base} | ${formula}`;
  }
  return s;
}

function parseQuantity_(qStr) {
  const raw = String(qStr || '').trim();
  if (!raw || raw === 'NaN') {
    return { ok: false, dimension: 'unknown', baseValue: null, baseUnit: null, raw: raw, unit_raw: null };
  }

  let s = raw.toLowerCase();
  s = s.replace(/,/g, '.');
  s = s.replace(/\s+/g, ' ').trim();

  // Extract first number
  const numMatch = s.match(/-?\d+(?:\.\d+)?/);
  if (!numMatch) {
    return { ok: false, dimension: 'unknown', baseValue: null, baseUnit: null, raw: raw, unit_raw: null };
  }
  const value = Number(numMatch[0]);
  if (!isFinite(value)) {
    return { ok: false, dimension: 'unknown', baseValue: null, baseUnit: null, raw: raw, unit_raw: null };
  }

  // Unit extraction
  let unitMatch = s.match(/(kg|g|mg|µg|ug|l|ml|mL|ul|µl|mol|mmol|µmol|umol)\b/i);
  let unitRaw = unitMatch ? String(unitMatch[1]) : null;
  if (!unitRaw) {
    // dataset-specific cleanup: "125.8 m" -> mL
    const mOnly = s.match(/\b(m)\b/);
    if (mOnly) unitRaw = 'ml';
  }
  if (!unitRaw) {
    return { ok: false, dimension: 'unknown', baseValue: null, baseUnit: null, raw: raw, unit_raw: null };
  }

  const u = unitRaw.toLowerCase();

  // Mass
  if (u === 'kg' || u === 'g' || u === 'mg' || u === 'ug' || u === 'µg') {
    let g;
    if (u === 'kg') g = value * 1000;
    else if (u === 'g') g = value;
    else if (u === 'mg') g = value / 1000;
    else g = value / 1e6;
    return { ok: true, dimension: 'mass', baseValue: g, baseUnit: 'g', raw: raw, unit_raw: unitRaw };
  }

  // Volume
  if (u === 'l' || u === 'ml' || u === 'mL'.toLowerCase() || u === 'ul' || u === 'µl') {
    let ml;
    if (u === 'l') ml = value * 1000;
    else if (u === 'ml') ml = value;
    else ml = value / 1000;
    return { ok: true, dimension: 'volume', baseValue: ml, baseUnit: 'mL', raw: raw, unit_raw: unitRaw };
  }

  // Amount
  if (u === 'mol' || u === 'mmol' || u === 'umol' || u === 'µmol') {
    let mmol;
    if (u === 'mol') mmol = value * 1000;
    else if (u === 'mmol') mmol = value;
    else mmol = value / 1000;
    return { ok: true, dimension: 'amount', baseValue: mmol, baseUnit: 'mmol', raw: raw, unit_raw: unitRaw };
  }

  return { ok: false, dimension: 'unknown', baseValue: null, baseUnit: null, raw: raw, unit_raw: unitRaw };
}

function toIso_(dt, tz) {
  if (!dt || isNaN(dt.getTime())) return '';
  return Utilities.formatDate(dt, tz, 'yyyy-MM-dd');
}

function computeStatusEquipment_(start, end, today0, todayEnd) {
  if (!start || isNaN(start.getTime())) return 'REGISTRADO';
  const s0 = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const e0 = end && !isNaN(end.getTime())
    ? new Date(end.getFullYear(), end.getMonth(), end.getDate(), 23, 59, 59, 999)
    : new Date(s0.getFullYear(), s0.getMonth(), s0.getDate(), 23, 59, 59, 999);
  if (e0 < today0) return 'COMPLETO';
  if (s0 > todayEnd) return 'PROGRAMADO';
  return 'EN_USO';
}

function computeStatusSupply_(estado, end, today0, todayEnd) {
  const st = String(estado || '').trim().toLowerCase();
  if (st === 'completo' || st === 'devuelto' || st === 'cerrado') return 'COMPLETO';
  if (!end || isNaN(end.getTime())) return 'ACTIVO';
  const e0 = new Date(end.getFullYear(), end.getMonth(), end.getDate(), 23, 59, 59, 999);
  if (e0 < today0) return 'VENCIDO';
  if (e0 >= today0 && e0 <= todayEnd) return 'VENCE_HOY';
  return 'ACTIVO';
}

function lastNMonths_(today0, n, tz) {
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(today0.getFullYear(), today0.getMonth() - i, 1);
    out.push(Utilities.formatDate(d, tz, 'yyyy-MM'));
  }
  return out;
}

function formatMonthLabel_(yyyyMm) {
  const m = String(yyyyMm || '').match(/^(\d{4})-(\d{2})$/);
  if (!m) return String(yyyyMm || '');
  const year = m[1].slice(2);
  const month = Number(m[2]);
  const names = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  const name = names[Math.max(1, Math.min(12, month)) - 1];
  return `${name} '${year}`;
}

function countBy_(arr, key) {
  const out = {};
  (arr || []).forEach(x => {
    const k = String(x[key] || '').trim();
    if (!k) return;
    out[k] = (out[k] || 0) + 1;
  });
  return out;
}

function topN_(counts, n) {
  return Object.entries(counts || {})
    .map(([name, value]) => ({ name: name, value: value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, n);
}

function getAvailableEquipos_(sheetEquiposData, ssGeneral, start, end) {
  const all = getColumnValues_(sheetEquiposData, 1);
  const bookings = (ssGeneral.getSheetByName('Solicitud de Equipos') || { getDataRange(){return{getValues(){return[]}}; } })
    .getDataRange().getValues().slice(1)
    .map(r => ({ equipo: r[2], from: new Date(r[3]), to: new Date(r[4]) }));

  const startDate = start ? new Date(start) : null;
  const endDate   = end   ? new Date(end)   : null;
  if (!startDate || !endDate) return all;

  const ocupados = bookings
    .filter(b => !(b.to < startDate || b.from > endDate))
    .map(b => b.equipo);

  return all.filter(e => !ocupados.includes(e));
}

function getBusyEquipos_(ssGeneral, equipo) {
  const tz = Session.getScriptTimeZone();
  const data = (ssGeneral.getSheetByName('Solicitud de Equipos') || { getDataRange(){return{getValues(){return[]}}; } })
    .getDataRange().getValues().slice(1);
  return data
    .filter(r => r[2] === equipo)
    .map(r => ({
      from: Utilities.formatDate(new Date(r[3]), tz, 'yyyy-MM-dd'),
      to:   Utilities.formatDate(new Date(r[4]), tz, 'yyyy-MM-dd')
    }));
}

// =================== doPost: MULTI =========================
function processMultiRequest_(ss, params) {
  const sheetResumen     = ss.getSheetByName('Resumen general');
  const sheetEquipos     = ss.getSheetByName('Solicitud de Equipos');
  const sheetUsoEquipo   = ss.getSheetByName('Uso de equipo');
  const sheetInsumos     = ss.getSheetByName('Solicitud de Insumos');
  const sheetUsoInsumos  = ss.getSheetByName('Uso de Insumos');
  const sheetReactivos   = ss.getSheetByName('Solicitud de Reactivos');
  const sheetUsoReactivo = ss.getSheetByName('Uso de Reactivo');

  // Parse items[]
  let items = [];
  try {
    items = JSON.parse(params.items);
    if (!Array.isArray(items)) items = [];
  } catch (_) { items = []; }

  const nombre           = params.nombre || '';
  const correo           = params.correo || '';
  const tz               = Session.getScriptTimeZone();
  const fecha            = params.fecha || Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
  const observaciones    = params.observaciones || '';
  const tipoActividad    = params.tipoActividad || '';
  const nombreActividad  = params.nombreActividad || '';
  const tipoSolicitud    = params.tipo || '';

  // Guardar adjunto (si viene)
  const file = handleAttachment_(params); // puede devolver null

  // Resumen general
  if (sheetResumen) {
    sheetResumen.appendRow([
      nombre,
      correo,
      fecha,
      tipoSolicitud || 'Múltiple',
      observaciones,
      'Total items: ' + items.length
    ]);
  }

  // Registrar ítem por ítem
  items.forEach(it => {
    switch (it.tipo) {
      case 'Solicitud de Equipos': {
        // Combina actividad y descripción en la columna de observaciones
        let obsRow = observaciones || '';
        if (it.actividad) {
          obsRow += (obsRow ? '; ' : '') + 'Actividad: ' + it.actividad;
        }
        if (it.descripcion) {
          obsRow += (obsRow ? '; ' : '') + it.descripcion;
        }
        sheetEquipos && sheetEquipos.appendRow([
          nombre,
          fecha,
          it.equipo || '',
          it.fechaInicial || '',
          it.fechaFinal || '',
          obsRow,
          correo
        ]);
        break;
      }
      case 'Uso de equipo': {
        // Para uso, nombreActividad se almacena en it.actividad y la descripción en it.descripcion
        let obsRow = '';
        if (it.descripcion) obsRow += it.descripcion;
        if (observaciones) obsRow += (obsRow ? '; ' : '') + observaciones;
        sheetUsoEquipo && sheetUsoEquipo.appendRow([
          nombre,
          it.fechaUsoEquipo || fecha,
          it.equipo || '',
          it.actividad || '',
          obsRow,
          correo
        ]);
        break;
      }
      case 'Solicitud de Insumos': {
        let obsRow = 'Cantidad: ' + (it.cantidad || '');
        if (it.actividad) {
          obsRow += '; Actividad: ' + it.actividad;
        }
        if (it.descripcion) {
          obsRow += '; ' + it.descripcion;
        }
        if (observaciones) {
          obsRow += '; ' + observaciones;
        }
        sheetInsumos && sheetInsumos.appendRow([
          nombre,
          it.fechaSolicitudInsumos || fecha,
          '', // estado (si aplica en tu hoja)
          it.insumo || '',
          it.fechaDevolucion || '',
          obsRow,
          correo
        ]);
        break;
      }
      case 'Uso de Insumos': {
        let obsRow = 'Cantidad: ' + (it.cantidad || '');
        if (it.descripcion) {
          obsRow += '; ' + it.descripcion;
        }
        if (observaciones) {
          obsRow += '; ' + observaciones;
        }
        sheetUsoInsumos && sheetUsoInsumos.appendRow([
          nombre,
          it.fechaUsoInsumos || fecha,
          '', // estado
          it.insumo || '',
          it.actividad || '',
          obsRow,
          correo
        ]);
        break;
      }
      case 'Solicitud de Reactivos':
        sheetReactivos && sheetReactivos.appendRow([
          nombre,
          fecha,
          it.reactivo || '',
          it.cantidad || '',
          it.laboratorioDestino || '',
          tipoActividad,
          observaciones + (it.controlado ? '; Controlado' : ''),
          correo
        ]);
        break;
      case 'Uso de Reactivo':
        sheetUsoReactivo && sheetUsoReactivo.appendRow([
          nombre,
          fecha,
          it.reactivo || '',
          it.cantidad || '',
          tipoActividad,
          observaciones + (it.controlado ? '; Controlado' : ''),
          correo
        ]);
        break;
      default:
        // ignorar tipos desconocidos
        break;
    }
  });

  // Emails: usuario (sin adjuntos) y admin (con adjunto si existe)
  sendEmails_( { nombre, correo, tipo: tipoSolicitud, tipoActividad, nombreActividad, observaciones, fecha },
               items, file );

  return ContentService.createTextOutput('¡Registro guardado!')
                       .setMimeType(ContentService.MimeType.TEXT_PLAIN);
}

// =================== doPost: ÚNICO =========================
function processSingleRequest_(ss, params) {
  const tipo              = params.tipo || '';
  const sheetResumen      = ss.getSheetByName('Resumen general');
  const sheetReactivos    = ss.getSheetByName('Solicitud de Reactivos');
  const sheetInsumos      = ss.getSheetByName('Solicitud de Insumos');
  const sheetEquipos      = ss.getSheetByName('Solicitud de Equipos');
  const sheetAlmacen      = ss.getSheetByName('Solicitud de Almacenamiento');
  const sheetUsoReactivo  = ss.getSheetByName('Uso de Reactivo');
  const sheetUsoInsumos   = ss.getSheetByName('Uso de Insumos');
  const sheetUsoEquipo    = ss.getSheetByName('Uso de equipo');
  const sheetUsoLab       = ss.getSheetByName('Uso de Laboratorio');
  const sheetHoras        = ss.getSheetByName('Horas de Pasantía');
  const sheetProfesores   = ss.getSheetByName('Profesores');

  const tz  = Session.getScriptTimeZone();
  const fechaEnvio = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');

  const d = {
    nombre:                 params.nombre                || '',
    correo:                 params.correo                || '',
    fecha:                  params.fecha || fechaEnvio,
    // Reactivos
    fechaSolicitudReactivo: params.fechaSolicitudReactivo || '',
    reactivo:               params.reactivo              || '',
    cantidad:               params.cantidad              || '',
    unidad:                 params.unidad                || '',
    laboratorioDestino:     params.laboratorioDestino    || '',
    tipoActividad:          params.tipoActividad         || '',
    // Insumos
    fechaSolicitudInsumos:  params.fechaSolicitudInsumos  || '',
    estado:                 params.estado                || '',
    insumo:                 params.insumo                || '',
    fechaDevolucion:        params.fechaDevolucion       || '',
    // Equipos
    equipo:                 params.equipo                || '',
    fechaInicial:           params.fechaInicial          || '',
    fechaFinal:             params.fechaFinal            || '',
    // Almacenamiento
    descripcion:            params.descripcion           || '',
    // Uso Reactivo / Insumo / Equipo
    fechaUsoReactivo:       params.fechaUsoReactivo      || '',
    fechaUsoInsumos:        params.fechaUsoInsumos       || '',
    nombreActividad:        params.nombreActividad       || '',
    fechaUsoEquipo:         params.fechaUsoEquipo        || '',
    // Uso de Laboratorio
    fechaUsoLab:            params.fechaUsoLab           || '',
    horaIngreso:            params.horaIngreso           || '',
    horaSalida:             params.horaSalida            || '',
    actividadRealizada:     params.actividadRealizada    || '',
    tipoActividadRealizada: params.tipoActividadRealizada|| '',
    // Pasantías / Profesores
    horas:                  params.horas                 || '',
    fechaPasantia:          params.fechaPasantia         || '',
    asignatura:             params.asignatura            || '',
    fechaInicialProf:       params.fechaInicialProf      || '',
    fechaFinalProf:         params.fechaFinalProf        || '',
    horaInicialProf:        params.horaInicialProf       || '',
    horaFinalProf:          params.horaFinalProf         || '',
    cedula:                 params.cedula                || '',
    // Observaciones y proyecto/tesis/práctica
    observaciones:          params.observaciones         || '',
    nombreProyecto:         params.nombreProyecto        || ''
  };

  // cantidad completa (x unidad)
  const cantidadCompleta = (d.cantidad && d.unidad) ? (d.cantidad + ' ' + d.unidad) : d.cantidad;

  // descripción para Resumen general
  const descGeneral = d.reactivo || d.insumo || d.equipo || d.descripcion || d.actividadRealizada || '';

  // anexar nombre de proyecto/tesis/práctica a observaciones
  if (d.nombreProyecto) {
    const detalle = 'Nombre del proyecto/tesis/práctica: ' + d.nombreProyecto;
    d.observaciones = d.observaciones ? (d.observaciones + '; ' + detalle) : detalle;
  }

  // Resumen general
  sheetResumen && sheetResumen.appendRow([
    d.nombre, d.correo, d.fecha, tipo, d.observaciones, descGeneral
  ]);

  // Escribir en hoja específica
  switch (tipo) {
    case 'Solicitud de Reactivos':
      sheetReactivos && sheetReactivos.appendRow([
        d.nombre, d.fechaSolicitudReactivo, d.reactivo, cantidadCompleta,
        d.laboratorioDestino, d.tipoActividad, d.observaciones, d.correo
      ]);
      break;
    case 'Solicitud de Insumos':
      sheetInsumos && sheetInsumos.appendRow([
        d.nombre, d.fechaSolicitudInsumos, d.estado, d.insumo,
        d.fechaDevolucion, d.observaciones, d.correo
      ]);
      break;
    case 'Solicitud de Equipos':
      sheetEquipos && sheetEquipos.appendRow([
        d.nombre, d.fecha, d.equipo, d.fechaInicial, d.fechaFinal, d.observaciones, d.correo
      ]);
      break;
    case 'Solicitud de Almacenamiento':
      sheetAlmacen && sheetAlmacen.appendRow([
        d.nombre, d.fecha, d.descripcion, d.fechaInicial, d.fechaFinal, d.observaciones, d.correo
      ]);
      break;
    case 'Uso de Reactivo':
      sheetUsoReactivo && sheetUsoReactivo.appendRow([
        d.nombre, d.fechaUsoReactivo, d.reactivo, cantidadCompleta,
        d.tipoActividad, d.observaciones, d.correo
      ]);
      break;
    case 'Uso de Insumos':
      sheetUsoInsumos && sheetUsoInsumos.appendRow([
        d.nombre, d.fechaUsoInsumos, d.estado, d.insumo,
        d.nombreActividad, d.observaciones, d.correo
      ]);
      break;
    case 'Uso de equipo':
      sheetUsoEquipo && sheetUsoEquipo.appendRow([
        d.nombre, d.fechaUsoEquipo, d.equipo, d.nombreActividad, d.observaciones, d.correo
      ]);
      break;
    case 'Uso de Laboratorio':
      sheetUsoLab && sheetUsoLab.appendRow([
        d.nombre, d.fechaUsoLab, d.horaIngreso, d.horaSalida,
        d.actividadRealizada, d.tipoActividadRealizada, d.observaciones, d.correo
      ]);
      break;
    case 'Horas de Pasantía':
      sheetHoras && sheetHoras.appendRow([
        d.nombre, d.fechaPasantia, d.horas, d.observaciones, d.correo
      ]);
      break;
    case 'Profesores':
      sheetProfesores && sheetProfesores.appendRow([
        d.nombre, d.fecha, d.asignatura, d.fechaInicialProf, d.fechaFinalProf,
        d.horaInicialProf, d.horaFinalProf, d.cedula, d.observaciones, d.correo
      ]);
      break;
    // Nueva nomenclatura para registro de uso
    case 'Práctica de lab o Cátedra': {
      // Esta categoría sustituye a "Profesores". Utiliza la fecha del formulario como
      // fecha de inicio y fin; registra asignatura, horas y cédula.
      const fecha = d.fecha;
      sheetProfesores && sheetProfesores.appendRow([
        d.nombre,
        fecha,
        d.asignatura || '',
        fecha,      // fechaInicialProf (usamos la misma fecha)
        fecha,      // fechaFinalProf (usamos la misma fecha)
        d.horaInicialProf || '',
        d.horaFinalProf || '',
        d.cedula || '',
        d.observaciones || '',
        d.correo
      ]);
      break;
    }
    case 'Pasantías': {
      // Esta categoría sustituye a "Horas de Pasantía". La fecha del formulario
      // se interpreta como fecha de la pasantía. Se incluye la actividad realizada
      // en las observaciones.
      const obs = (d.actividadRealizada ? d.actividadRealizada : '') + (d.observaciones ? '; ' + d.observaciones : '');
      sheetHoras && sheetHoras.appendRow([
        d.nombre,
        d.fecha,
        d.horas || '',
        obs,
        d.correo
      ]);
      break;
    }
    case 'Tesis/Proyectos': {
      // Esta categoría sustituye a "Uso de Laboratorio". Usa la fecha del formulario
      // como fecha de uso de laboratorio y almacena la actividad realizada y tipo de persona.
      // Además, incorpora la selección "Proyecto"/"Tesis" y el nombre del proyecto/tesis en las observaciones.
      const obsDetalle = [];
      // d.actividad corresponde a la selección "Proyecto" o "Tesis" (ru_actividadSelect)
      if (d.actividad) obsDetalle.push('Tipo actividad: ' + d.actividad);
      if (d.nombreProyecto) obsDetalle.push('Nombre: ' + d.nombreProyecto);
      if (d.observaciones) obsDetalle.push(d.observaciones);
      sheetUsoLab && sheetUsoLab.appendRow([
        d.nombre,
        d.fecha,
        '',     // horaIngreso (no se solicita en este flujo)
        '',     // horaSalida (no se solicita en este flujo)
        d.actividadRealizada || '',
        d.tipoActividadRealizada || '',
        obsDetalle.join('; '),
        d.correo
      ]);
      break;
    }
    default:
      // noop
      break;
  }

  // Adjuntos (si viene en single) + correos
  const file = handleAttachment_(params);
  sendEmails_( { nombre: d.nombre, correo: d.correo, tipo, tipoActividad: d.tipoActividad,
                 nombreActividad: d.nombreActividad, observaciones: d.observaciones, fecha: d.fecha },
               [params], file );

  return ContentService.createTextOutput('¡Registro guardado!')
                       .setMimeType(ContentService.MimeType.TEXT_PLAIN);
}

// =================== ARCHIVOS ===============================
function handleAttachment_(params) {
  if (!params.fileBase64) return null;
  const mime = params.fileMimeType || MimeType.PDF;
  const blob = Utilities.newBlob(Utilities.base64Decode(params.fileBase64), mime, params.fileName || 'adjunto');
  try {
    const folder = DriveApp.getFolderById(DRIVE_FOLDER_ID);
    return folder.createFile(blob);
  } catch (err) {
    return null;
  }
}

// =================== EMAILS ================================
function sendEmails_(payload, items, file) {
  const asunto = `[LQ1D] ${payload.tipo || 'Registro'} – ${payload.nombre || ''}`;
  const html = renderEmailHtml_(payload, items);

  // Usuario (sin adjuntos)
  if (payload.correo) {
    MailApp.sendEmail({ to: payload.correo, subject: asunto, htmlBody: html });
  }
  // Admin (con adjunto si existe)
  const opts = { to: ADMIN_EMAIL, subject: asunto, htmlBody: html };
  if (file) opts.attachments = [file.getAs(file.getMimeType())];
  MailApp.sendEmail(opts);
}

function renderEmailHtml_(payload, items) {
  let html = `<p>Hola ${sanitize_(payload.nombre || '')},</p>`;
  html += `<p>Se registró la siguiente información:</p><ul>`;
  (items || []).forEach(it => {
    const kv = Object.entries(it)
      .map(([k, v]) => `<strong>${sanitize_(k)}:</strong> ${sanitize_(v)}`)
      .join('<br>');
    html += `<li>${kv}</li><br>`;
  });
  if (payload.tipoActividad)    html += `<p><strong>Tipo de actividad:</strong> ${sanitize_(payload.tipoActividad)}</p>`;
  if (payload.nombreActividad)  html += `<p><strong>Nombre de la actividad:</strong> ${sanitize_(payload.nombreActividad)}</p>`;
  if (payload.observaciones)    html += `<p><strong>Observaciones:</strong> ${sanitize_(payload.observaciones)}</p>`;
  if (payload.fecha)            html += `<p><strong>Fecha:</strong> ${sanitize_(payload.fecha)}</p>`;
  html += `<p>Saludos,<br>Laboratorio de Química 1 de Docencia</p>`;
  return html;
}

function sanitize_(s) {
  return String(s || '').replace(/[<>&]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;'}[c]));
}
