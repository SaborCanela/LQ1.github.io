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
    default:
      output = { error: 'Acción no reconocida' };
  }
  return ContentService
    .createTextOutput(JSON.stringify(output))
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
      case 'Solicitud de Equipos':
        sheetEquipos && sheetEquipos.appendRow([
          nombre,
          fecha,
          it.equipo || '',
          it.fechaInicial || '',
          it.fechaFinal || '',
          observaciones,
          correo
        ]);
        break;
      case 'Uso de equipo':
        sheetUsoEquipo && sheetUsoEquipo.appendRow([
          nombre,
          it.fechaUsoEquipo || fecha,
          it.equipo || '',
          it.nombreActividad || '',
          observaciones,
          correo
        ]);
        break;
      case 'Solicitud de Insumos':
        sheetInsumos && sheetInsumos.appendRow([
          nombre,
          it.fechaSolicitudInsumos || fecha,
          '', // estado (si aplica en tu hoja)
          it.insumo || '',
          it.fechaDevolucion || '',
          'Cantidad: ' + (it.cantidad || '') + (observaciones ? '; ' + observaciones : ''),
          correo
        ]);
        break;
      case 'Uso de Insumos':
        sheetUsoInsumos && sheetUsoInsumos.appendRow([
          nombre,
          it.fechaUsoInsumos || fecha,
          '', // estado
          it.insumo || '',
          it.nombreActividad || '',
          'Cantidad: ' + (it.cantidad || '') + (observaciones ? '; ' + observaciones : ''),
          correo
        ]);
        break;
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
  const sheetHoras        = ss.getSheetByName('Horas de Pasantia');
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
    case 'Horas de Pasantia':
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
