/**
 * appsScript.js
 *
 * Este script es una versión refactorizada del archivo de Google Apps
 * Script utilizado para procesar las solicitudes provenientes del
 * frontend.  Soporta tanto el flujo tradicional de un único envío
 * como un nuevo modo de envío múltiple en el que se reciben varios
 * ítems en una sola operación.  Además, envía correos de confirmación
 * al usuario y al administrador, adjuntando archivos cuando se trata
 * de solicitudes de reactivos controlados.
 */

function doPost(e) {
  const ss = SpreadsheetApp.openById('14x0fat7x18QlAN9kKYgNYJkAvw0L1OkyEAS0yLukR5Q');
  const params = e.parameter;
  if (params.items) {
    return processMultiRequest_(ss, params);
  }
  return processSingleRequest_(ss, params);
}

function processMultiRequest_(ss, params) {
  const ADMIN_EMAIL = 'thomas.garzon@ikiam.edu.ec';
  const DRIVE_FOLDER_ID = '1W--folderId'; // Reemplace con la ID de la carpeta en Drive donde guardar adjuntos
  const sheetResumen     = ss.getSheetByName('Resumen general');
  const sheetEquipos     = ss.getSheetByName('Solicitud de Equipos');
  const sheetUsoEquipo   = ss.getSheetByName('Uso de equipo');
  const sheetInsumos     = ss.getSheetByName('Solicitud de Insumos');
  const sheetUsoInsumos  = ss.getSheetByName('Uso de Insumos');
  const sheetReactivos   = ss.getSheetByName('Solicitud de Reactivos');
  const sheetUsoReactivo = ss.getSheetByName('Uso de Reactivo');
  // Parsear lista de ítems
  var items;
  try {
    items = JSON.parse(params.items);
    if (!Array.isArray(items)) items = [];
  } catch (err) {
    items = [];
  }
  var nombre  = params.nombre || '';
  var correo  = params.correo || '';
  var fecha   = params.fecha || Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  var obs     = params.observaciones || '';
  var tipoActividad = params.tipoActividad || '';
  var nombreActividad = params.nombreActividad || '';
  var tipoSolicitud  = params.tipo || '';
  // Decodificar archivo adjunto
  var file = null;
  if (params.fileBase64) {
    var blob = Utilities.newBlob(Utilities.base64Decode(params.fileBase64), MimeType.PDF, params.fileName || 'adjunto.pdf');
    try {
      var folder = DriveApp.getFolderById(DRIVE_FOLDER_ID);
      file = folder.createFile(blob);
    } catch (err) {
      file = null;
    }
  }
  // Resumen general
  if (sheetResumen) {
    sheetResumen.appendRow([
      nombre,
      correo,
      fecha,
      tipoSolicitud || 'Múltiple',
      obs,
      'Total items: ' + items.length
    ]);
  }
  // Registrar cada ítem
  items.forEach(function(item) {
    var t = item.tipo || '';
    switch (t) {
      case 'Solicitud de Equipos':
        if (sheetEquipos) {
          sheetEquipos.appendRow([
            nombre,
            fecha,
            item.equipo || '',
            item.fechaInicial || '',
            item.fechaFinal || '',
            obs,
            correo
          ]);
        }
        break;
      case 'Uso de equipo':
        if (sheetUsoEquipo) {
          sheetUsoEquipo.appendRow([
            nombre,
            item.fechaUsoEquipo || fecha,
            item.equipo || '',
            item.nombreActividad || '',
            obs,
            correo
          ]);
        }
        break;
      case 'Solicitud de Insumos':
        if (sheetInsumos) {
          sheetInsumos.appendRow([
            nombre,
            item.fechaSolicitudInsumos || fecha,
            '',
            item.insumo || '',
            item.fechaDevolucion || '',
            'Cantidad: ' + (item.cantidad || '') + '; ' + obs,
            correo
          ]);
        }
        break;
      case 'Uso de Insumos':
        if (sheetUsoInsumos) {
          sheetUsoInsumos.appendRow([
            nombre,
            item.fechaUsoInsumos || fecha,
            '',
            item.insumo || '',
            item.nombreActividad || '',
            'Cantidad: ' + (item.cantidad || '') + '; ' + obs,
            correo
          ]);
        }
        break;
      case 'Solicitud de Reactivos':
        if (sheetReactivos) {
          sheetReactivos.appendRow([
            nombre,
            fecha,
            item.reactivo || '',
            item.cantidad || '',
            item.laboratorioDestino || '',
            tipoActividad,
            obs + (item.controlado ? '; Controlado' : ''),
            correo
          ]);
        }
        break;
      case 'Uso de Reactivo':
        if (sheetUsoReactivo) {
          sheetUsoReactivo.appendRow([
            nombre,
            fecha,
            item.reactivo || '',
            item.cantidad || '',
            tipoActividad,
            obs + (item.controlado ? '; Controlado' : ''),
            correo
          ]);
        }
        break;
      default:
        break;
    }
  });
  // Construir correo HTML
  var body = '<p>Estimado/a ' + nombre + ',</p>';
  body += '<p>Su solicitud/registro se ha recibido con los siguientes detalles:</p>';
  body += '<ul>';
  items.forEach(function(it) {
    if (it.tipo === 'Solicitud de Equipos') {
      body += '<li>Equipo: ' + it.equipo + ' – Solicitud (' + it.fechaInicial + ' a ' + it.fechaFinal + ')</li>';
    } else if (it.tipo === 'Uso de equipo') {
      body += '<li>Equipo: ' + it.equipo + ' – Uso el ' + it.fechaUsoEquipo + ', ' + it.nombreActividad + '</li>';
    } else if (it.tipo === 'Solicitud de Insumos') {
      body += '<li>Material: ' + it.insumo + ' – Solicitud (' + it.fechaSolicitudInsumos + ' a ' + it.fechaDevolucion + '), Cantidad: ' + it.cantidad + '</li>';
    } else if (it.tipo === 'Uso de Insumos') {
      body += '<li>Material: ' + it.insumo + ' – Uso el ' + it.fechaUsoInsumos + ', ' + it.nombreActividad + ', Cantidad: ' + it.cantidad + '</li>';
    } else if (it.tipo === 'Solicitud de Reactivos') {
      body += '<li>Reactivo: ' + it.reactivo + ' – Solicitud, Cantidad: ' + it.cantidad + ', Destino: ' + it.laboratorioDestino + '</li>';
    } else if (it.tipo === 'Uso de Reactivo') {
      body += '<li>Reactivo: ' + it.reactivo + ' – Uso, Cantidad: ' + it.cantidad + '</li>';
    }
  });
  body += '</ul>';
  if (tipoActividad) body += '<p>Tipo de actividad: ' + tipoActividad + '</p>';
  if (nombreActividad) body += '<p>Nombre de la actividad: ' + nombreActividad + '</p>';
  if (obs) body += '<p>Observaciones: ' + obs + '</p>';
  body += '<p>Gracias.</p>';
  // Enviar correos
  MailApp.sendEmail({ to: correo, subject: 'Confirmación de registro LQ1D', htmlBody: body });
  var adminOpts = { to: ADMIN_EMAIL, subject: 'Nueva solicitud/registro LQ1D', htmlBody: body };
  if (file) adminOpts.attachments = [ file.getAs(file.getMimeType()) ];
  MailApp.sendEmail(adminOpts);
  return ContentService.createTextOutput('¡Registro guardado!').setMimeType(ContentService.MimeType.TEXT_PLAIN);
}

function processSingleRequest_(ss, params) {
  const tipo = params.tipo || '';
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
  const now = new Date();
  const tz  = Session.getScriptTimeZone();
  const fechaEnvio = Utilities.formatDate(now, tz, 'yyyy-MM-dd');
  const data = {
    nombre:               params.nombre                || '',
    correo:               params.correo                || '',
    fecha:                params.fecha || fechaEnvio,
    fechaSolicitudReactivo: params.fechaSolicitudReactivo || '',
    reactivo:             params.reactivo              || '',
    cantidad:             params.cantidad              || '',
    unidad:               params.unidad                || '',
    laboratorioDestino:   params.laboratorioDestino    || '',
    tipoActividad:        params.tipoActividad         || '',
    fechaSolicitudInsumos: params.fechaSolicitudInsumos  || '',
    estado:               params.estado                || '',
    insumo:               params.insumo                || '',
    fechaDevolucion:      params.fechaDevolucion       || '',
    equipo:               params.equipo                || '',
    fechaInicial:         params.fechaInicial          || '',
    fechaFinal:           params.fechaFinal            || '',
    descripcion:          params.descripcion           || '',
    fechaUsoReactivo:     params.fechaUsoReactivo      || '',
    fechaUsoInsumos:      params.fechaUsoInsumos       || '',
    nombreActividad:      params.nombreActividad       || '',
    fechaUsoEquipo:       params.fechaUsoEquipo        || '',
    fechaUsoLab:          params.fechaUsoLab           || '',
    horaIngreso:          params.horaIngreso           || '',
    horaSalida:           params.horaSalida            || '',
    actividadRealizada:   params.actividadRealizada    || '',
    tipoActividadRealizada: params.tipoActividadRealizada || '',
    horas:                params.horas                 || '',
    fechaPasantia:        params.fechaPasantia         || '',
    asignatura:           params.asignatura            || '',
    fechaInicialProf:     params.fechaInicialProf      || '',
    fechaFinalProf:       params.fechaFinalProf        || '',
    horaInicialProf:      params.horaInicialProf       || '',
    horaFinalProf:        params.horaFinalProf         || '',
    cedula:               params.cedula                || '',
    observaciones:        params.observaciones         || '',
    nombreProyecto:       params.nombreProyecto        || ''
  };
  var cantidadCompleta = data.cantidad;
  if (data.cantidad && data.unidad) {
    cantidadCompleta = data.cantidad + ' ' + data.unidad;
  }
  var descripcionGeneral = data.reactivo || data.insumo || data.equipo || data.descripcion || data.actividadRealizada || '';
  if (data.nombreProyecto) {
    var detalle = 'Nombre del proyecto/tesis/práctica: ' + data.nombreProyecto;
    if (data.observaciones) {
      data.observaciones = data.observaciones + '; ' + detalle;
    } else {
      data.observaciones = detalle;
    }
  }
  if (sheetResumen) {
    sheetResumen.appendRow([
      data.nombre,
      data.correo,
      data.fecha,
      tipo,
      data.observaciones,
      descripcionGeneral
    ]);
  }
  switch (tipo) {
    case 'Solicitud de Reactivos':
      if (sheetReactivos) {
        sheetReactivos.appendRow([
          data.nombre,
          data.fechaSolicitudReactivo,
          data.reactivo,
          cantidadCompleta,
          data.laboratorioDestino,
          data.tipoActividad,
          data.observaciones,
          data.correo
        ]);
      }
      break;
    case 'Solicitud de Insumos':
      if (sheetInsumos) {
        sheetInsumos.appendRow([
          data.nombre,
          data.fechaSolicitudInsumos,
          data.estado,
          data.insumo,
          data.fechaDevolucion,
          data.observaciones,
          data.correo
        ]);
      }
      break;
    case 'Solicitud de Equipos':
      if (sheetEquipos) {
        sheetEquipos.appendRow([
          data.nombre,
          data.fecha,
          data.equipo,
          data.fechaInicial,
          data.fechaFinal,
          data.observaciones,
          data.correo
        ]);
      }
      break;
    case 'Solicitud de Almacenamiento':
      if (sheetAlmacen) {
        sheetAlmacen.appendRow([
          data.nombre,
          data.fecha,
          data.descripcion,
          data.fechaInicial,
          data.fechaFinal,
          data.observaciones,
          data.correo
        ]);
      }
      break;
    case 'Uso de Reactivo':
      if (sheetUsoReactivo) {
        sheetUsoReactivo.appendRow([
          data.nombre,
          data.fechaUsoReactivo,
          data.reactivo,
          cantidadCompleta,
          data.tipoActividad,
          data.observaciones,
          data.correo
        ]);
      }
      break;
    case 'Uso de Insumos':
      if (sheetUsoInsumos) {
        sheetUsoInsumos.appendRow([
          data.nombre,
          data.fechaUsoInsumos,
          data.estado,
          data.insumo,
          data.nombreActividad,
          data.observaciones,
          data.correo
        ]);
      }
      break;
    case 'Uso de equipo':
      if (sheetUsoEquipo) {
        sheetUsoEquipo.appendRow([
          data.nombre,
          data.fechaUsoEquipo,
          data.equipo,
          data.nombreActividad,
          data.observaciones,
          data.correo
        ]);
      }
      break;
    case 'Uso de Laboratorio':
      if (sheetUsoLab) {
        sheetUsoLab.appendRow([
          data.nombre,
          data.fechaUsoLab,
          data.horaIngreso,
          data.horaSalida,
          data.actividadRealizada,
          data.tipoActividadRealizada,
          data.observaciones,
          data.correo
        ]);
      }
      break;
    case 'Horas de Pasantía':
      if (sheetHoras) {
        sheetHoras.appendRow([
          data.nombre,
          data.fechaPasantia,
          data.horas,
          data.observaciones,
          data.correo
        ]);
      }
      break;
    case 'Profesores':
      if (sheetProfesores) {
        sheetProfesores.appendRow([
          data.nombre,
          data.fecha,
          data.asignatura,
          data.fechaInicialProf,
          data.fechaFinalProf,
          data.horaInicialProf,
          data.horaFinalProf,
          data.cedula,
          data.observaciones,
          data.correo
        ]);
      }
      break;
    default:
      break;
  }
  return ContentService.createTextOutput('¡Registro guardado!').setMimeType(ContentService.MimeType.TEXT_PLAIN);
}