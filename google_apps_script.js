/**
 * Versión modificada del Apps Script para registrar solicitudes y usos
 * según las pestañas definidas en la hoja de cálculo.  Esta versión
 * reconoce el parámetro `tipo` enviado desde la interfaz y lo mapea
 * directamente a los nombres de las pestañas (p. ej. «Solicitud de
 * Reactivos», «Uso de Reactivo», «Uso de Laboratorio», etc.).  Además,
 * ajusta el orden de inserción de columnas según los esquemas
 * proporcionados en la interfaz web.  También genera una entrada
 * resumida en la pestaña «Resumen general».  Las funciones auxiliares
 * para obtener listas y disponibilidad de equipos se mantienen sin
 * cambios sustanciales.
 */

function doPost(e) {
  const ss = SpreadsheetApp.openById('14x0fat7x18QlAN9kKYgNYJkAvw0L1OkyEAS0yLukR5Q');
  const params = e.parameter;
  const tipo   = params.tipo || '';

  // Obtener referencias a todas las pestañas utilizadas
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

  // Fecha actual en formato yyyy-MM-dd
  const now      = new Date();
  const tz       = Session.getScriptTimeZone();
  const fechaEnvio = Utilities.formatDate(now, tz, 'yyyy-MM-dd');

  // Recoger parámetros con claves amigables (vacío si no existen)
  const data = {
    nombre:               params.nombre                || '',
    correo:               params.correo                || '',
    // Si se recibe una fecha explícita desde el formulario (como en el registro de profesores),
    // se utiliza esa; en caso contrario, se usa la fecha de envío.
    fecha:                params.fecha || fechaEnvio,
    // Solicitud de reactivos
    fechaSolicitudReactivo: params.fechaSolicitudReactivo || '',
    reactivo:             params.reactivo              || '',
    cantidad:             params.cantidad              || '',
    unidad:               params.unidad                || '',
    laboratorioDestino:   params.laboratorioDestino    || '',
    tipoActividad:        params.tipoActividad         || '',
    // Solicitud de insumos
    fechaSolicitudInsumos: params.fechaSolicitudInsumos  || '',
    estado:               params.estado                || '',
    insumo:               params.insumo                || '',
    fechaDevolucion:      params.fechaDevolucion       || '',
    // Solicitud de equipos
    equipo:               params.equipo                || '',
    fechaInicial:         params.fechaInicial          || '',
    fechaFinal:           params.fechaFinal            || '',
    // Solicitud de almacenamiento
    descripcion:          params.descripcion           || '',
    // Uso de reactivo
    fechaUsoReactivo:     params.fechaUsoReactivo      || '',
    // Uso de insumos
    fechaUsoInsumos:      params.fechaUsoInsumos       || '',
    nombreActividad:      params.nombreActividad       || '',
    // Uso de equipo
    fechaUsoEquipo:       params.fechaUsoEquipo        || '',
    // Uso de laboratorio
    fechaUsoLab:          params.fechaUsoLab           || '',
    horaIngreso:          params.horaIngreso           || '',
    horaSalida:           params.horaSalida            || '',
    actividadRealizada:   params.actividadRealizada    || '',
    tipoActividadRealizada: params.tipoActividadRealizada || '',
    // Pasantía y profesores (no utilizados en los formularios actuales)
    horas:                params.horas                 || '',
    fechaPasantia:        params.fechaPasantia         || '',
    asignatura:           params.asignatura            || '',
    fechaInicialProf:     params.fechaInicialProf      || '',
    fechaFinalProf:       params.fechaFinalProf        || '',
    horaInicialProf:      params.horaInicialProf       || '',
    horaFinalProf:        params.horaFinalProf         || '',
    cedula:               params.cedula                || '',
    // Observaciones genéricas
    observaciones:        params.observaciones         || ''
    ,
    // Nombre detallado de proyecto/tesis/práctica (opcional)
    nombreProyecto:       params.nombreProyecto        || ''
  };

  // Combinar cantidad y unidad para solicitudes de reactivos y uso de reactivos
  let cantidadCompleta = data.cantidad;
  if (data.cantidad && data.unidad) {
    cantidadCompleta = data.cantidad + ' ' + data.unidad;
  }

  // Determinar una descripción general para el resumen
  const descripcionGeneral =
    data.reactivo || data.insumo || data.equipo || data.descripcion || data.actividadRealizada || '';

  // Si se ha proporcionado un nombre de proyecto/tesis/práctica, lo añadimos a las observaciones
  if (data.nombreProyecto) {
    const detalle = 'Nombre del proyecto/tesis/práctica: ' + data.nombreProyecto;
    if (data.observaciones) {
      data.observaciones = data.observaciones + '; ' + detalle;
    } else {
      data.observaciones = detalle;
    }
  }

  // Registrar en la hoja de resumen general
  if (sheetResumen) {
    sheetResumen.appendRow([
      data.nombre,          // Nombre
      data.correo,          // Correo institucional
      data.fecha,           // Fecha de envío
      tipo,                 // Tipo de acción
      data.observaciones,   // Observaciones
      descripcionGeneral    // Descripción
    ]);
  }

  // Insertar en la hoja específica según el tipo
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
      // Si no se reconoce el tipo, no hace nada adicional
      break;
  }

  return ContentService
    .createTextOutput('¡Registro guardado!')
    .setMimeType(ContentService.MimeType.TEXT_PLAIN);
}

function doGet(e) {
  var ssGeneral = SpreadsheetApp.openById('14x0fat7x18QlAN9kKYgNYJkAvw0L1OkyEAS0yLukR5Q');
  var sheetEquiposData   = SpreadsheetApp
    .openById('1VYnN1yNZi5UWez8frYHOH8dFC1iicV75wAa0Hcm5LuA')
    .getSheetByName('Equipos');
  var sheetReactivosData = SpreadsheetApp
    .openById('1EKfr1vbmpyUbgKMVbv6_lL4FuIxlPpLOaFhEeZEApSo')
    .getSheetByName('Reactivos');
  var sheetInsumosData   = SpreadsheetApp
    .openById('1xX56wX8DfJhyUXpi9lUBN78cQqhuEnLIPaO8ZdKlrrY')
    .getSheetByName('Insumos');
  var action = e.parameter.action;
  var q      = (e.parameter.q || '').toString().toLowerCase();
  function filterList(list) {
    if (!q) return list;
    return list.filter(function(item) {
      return item.toString().toLowerCase().indexOf(q) !== -1;
    });
  }
  var output;
  switch(action) {
    case 'listReactivos':
      output = filterList(getColumnValues(sheetReactivosData, 1));
      break;
    case 'listInsumos':
      output = filterList(getColumnValues(sheetInsumosData, 1));
      break;
    case 'listEquipos':
      output = filterList(getColumnValues(sheetEquiposData, 1));
      break;
    case 'availEquipos':
      var start = e.parameter.start;
      var end   = e.parameter.end;
      var available = getAvailableEquipos(sheetEquiposData, ssGeneral, start, end);
      output = filterList(available);
      break;
    case 'busyEquipos':
      var equipo = e.parameter.equipo;
      output = getBusyEquipos(ssGeneral, equipo);
      break;
    default:
      output = { error: 'Acción no reconocida' };
  }
  return ContentService
    .createTextOutput(JSON.stringify(output))
    .setMimeType(ContentService.MimeType.JSON);
}

function getColumnValues(sheet, col) {
  var data = sheet.getRange(2, col, sheet.getLastRow() - 1).getValues();
  return data.flat().filter(String);
}

function getAvailableEquipos(sheetEquiposData, ssGeneral, start, end) {
  var all = getColumnValues(sheetEquiposData, 1);
  var bookings = ssGeneral
    .getSheetByName('Solicitud de Equipos')
    .getDataRange().getValues()
    .slice(1)
    .map(function(r) {
      return {
        equipo: r[2],
        from:  new Date(r[3]),
        to:    new Date(r[4])
      };
    });
  var startDate = new Date(start);
  var endDate   = new Date(end);
  var ocupados = bookings
    .filter(function(b) {
      return !(b.to < startDate || b.from > endDate);
    })
    .map(function(b) { return b.equipo; });
  return all.filter(function(e) { return ocupados.indexOf(e) < 0; });
}

function getBusyEquipos(ssGeneral, equipo) {
  var data = ssGeneral.getSheetByName('Solicitud de Equipos').getDataRange().getValues().slice(1);
  var out = [];
  data.forEach(function(r) {
    if (r[2] === equipo) {
      out.push({
        from: Utilities.formatDate(new Date(r[3]), Session.getScriptTimeZone(), 'yyyy-MM-dd'),
        to:   Utilities.formatDate(new Date(r[4]), Session.getScriptTimeZone(), 'yyyy-MM-dd')
      });
    }
  });
  return out;
}