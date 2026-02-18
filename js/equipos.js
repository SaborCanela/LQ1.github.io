import { getList, getBusyEquipos, sendRequest } from './api.js';
import { toast, setButtonLoading, setCatalogImage, validateRequired, slugify } from './ui-kit.js';

// Elements
const backHomeBtn = document.getElementById('backHome');
const step1      = document.getElementById('step1');
const step2      = document.getElementById('step2');
const step3      = document.getElementById('step3');
const equipoBusqueda = document.getElementById('equipoBusqueda');
const equiposList    = document.getElementById('equiposList');
const buscarEquipoBtn = document.getElementById('buscarEquipoBtn');
const equipoNombreEl  = document.getElementById('equipoNombre');
const equipoImgEl     = document.getElementById('equipoImg');
const equipoAccionSel = document.getElementById('equipoAccion');
const formSolicitudDiv= document.getElementById('formSolicitud');
const formRegistroDiv = document.getElementById('formRegistro');
const solicitudRango  = document.getElementById('solicitudRango');
const ocupacionInfo   = document.getElementById('ocupacionInfo');
const registroFecha   = document.getElementById('registroFecha');
// Nuevo grupo de actividad que se muestra para Solicitud y Registro
const equipoActividadGroup = document.getElementById('equipoActividadGroup');
const equipoActividad = document.getElementById('equipoActividad');
const equipoDescripcion = document.getElementById('equipoDescripcion');
const cancelStep2Btn  = document.getElementById('cancelStep2');
const addEquipoBtn    = document.getElementById('addEquipoBtn');
const finalizarEquipoBtn = document.getElementById('finalizarEquipoBtn');
const summaryDiv      = document.getElementById('listaEquiposResumen');
const backToSearchBtn = document.getElementById('backToSearch');
const enviarEquiposBtn= document.getElementById('enviarEquipos');
const nombreUsuario   = document.getElementById('equipoNombreUsuario');
const correoUsuario   = document.getElementById('equipoCorreoUsuario');
const observaciones   = document.getElementById('equipoObservaciones');

// Cart to hold multiple equipment requests
let cart = [];

// Busy intervals and conflict flag
// "currentBusyIntervals" almacenará los rangos de ocupación del equipo seleccionado
// recuperados desde el backend. "solicitudConflicto" se actualizará a true si
// el usuario elige un rango de fechas que se superpone con alguno de estos
// intervalos.  Se comprueba tanto en el selector de fechas como al
// procesar la solicitud, de modo que el usuario no pueda enviar una
// reserva en fechas ya ocupadas.
let currentBusyIntervals = [];
let solicitudConflicto = false;
let currentEquipo = null;
let fpSolicitud  = null;
let fpRegistro   = null;

// Load list of equipos on load
window.addEventListener('load', async () => {
  try {
    const list = await getList('listEquipos');
    equiposList.innerHTML = list.map(item => `<option value="${item}"></option>`).join('');
  } catch (err) {
    console.error('Error al cargar lista de equipos:', err);
    equiposList.innerHTML = '';
  }
  // Prefill user information from localStorage if available
  try {
    const storedNombre = localStorage.getItem('nombreUsuario');
    const storedCorreo = localStorage.getItem('correoUsuario');
    if (storedNombre) nombreUsuario.value = storedNombre;
    if (storedCorreo) correoUsuario.value = storedCorreo;
  } catch (e) {
    // No localStorage available
  }
});

// Navigation back to home
backHomeBtn.addEventListener('click', () => {
  // Regresar a la página unificada de solicitudes en lugar de al inicio
  window.location.href = 'solicitudes.html';
});

// Buscar equipo
buscarEquipoBtn.addEventListener('click', () => {
  const eq = equipoBusqueda.value.trim();
  if (!eq) {
    toast('Por favor, ingrese o seleccione un equipo.', { type: 'error' });
    return;
  }
  currentEquipo = eq;
  showStep2(eq);
});

// Reset step2 fields
/**
 * Restaura los campos del paso 2 sin borrar la selección de acción.
 * Esto permite que al seleccionar "Solicitud" o "Registro" se mantenga
 * el valor en el selector mientras se ocultan/limpian los formularios.
 */
function resetStep2() {
  // No limpiar equipoAccionSel.value aquí; se limpia solo al cargar un nuevo equipo
  formSolicitudDiv.classList.add('hidden');
  formRegistroDiv.classList.add('hidden');
  ocupacionInfo.textContent = '';
  if (fpSolicitud) { fpSolicitud.clear(); }
  if (fpRegistro) { fpRegistro.clear(); }
  // Limpiar campos de actividad
  equipoActividad.value = '';
  equipoDescripcion.value = '';
  equipoActividadGroup.classList.add('hidden');
}

// Show step 2 for selected equipment
function showStep2(equipoName) {
  // Hide step1 and step3
  step1.classList.add('hidden');
  step3.classList.add('hidden');
  step2.classList.remove('hidden');
  // Set equipment name
  equipoNombreEl.textContent = equipoName;
  // Set image path using slug
  const slug = slugify(equipoName);
  setCatalogImage(equipoImgEl, { basePath: 'imagenes/equipos', slug });
  // Al abrir un nuevo equipo, limpiar la selección y restablecer formularios
  equipoAccionSel.value = '';
  resetStep2();
}

// Action selection
equipoAccionSel.addEventListener('change', async () => {
  const action = equipoAccionSel.value;
  // Siempre reiniciamos el paso 2 antes de mostrar el formulario correspondiente
  resetStep2();
  if (!action) return;
  // Mostrar grupo de actividad para ambas acciones
  equipoActividadGroup.classList.remove('hidden');
  if (action === 'Solicitud') {
    formSolicitudDiv.classList.remove('hidden');
    // Restablecer banderas y rangos ocupados
    solicitudConflicto = false;
    currentBusyIntervals = [];
    // Consultar las ocupaciones existentes del equipo y actualizar mensaje
    try {
      const busy = await getBusyEquipos(currentEquipo);
      currentBusyIntervals = Array.isArray(busy) ? busy : [];
      if (currentBusyIntervals.length > 0) {
        ocupacionInfo.innerHTML = '<strong>Ocupado en:</strong> ' + currentBusyIntervals.map(b => `${formatDate(b.from)} – ${formatDate(b.to)}`).join(', ');
      } else {
        ocupacionInfo.textContent = '';
      }
    } catch (err) {
      console.error('Error al consultar ocupaciones:', err);
      ocupacionInfo.textContent = '';
    }
    // Preparar arreglo de rangos a deshabilitar para flatpickr
    const disableRanges = currentBusyIntervals.map(r => ({ from: r.from, to: r.to }));
    // Inicializar flatpickr con las fechas ocupadas deshabilitadas
    fpSolicitud = flatpickr(solicitudRango, {
      mode: 'range',
      dateFormat: 'd/m/Y',
      disable: disableRanges,
      onClose: (selectedDates) => {
        solicitudConflicto = false;
        if (selectedDates.length === 2) {
          const [start, end] = selectedDates;
          const selInicio = new Date(start).toISOString().split('T')[0];
          const selFin    = new Date(end).toISOString().split('T')[0];
          for (const intervalo of currentBusyIntervals) {
            const ocInicio = intervalo.from;
            const ocFin    = intervalo.to;
            if (selFin >= ocInicio && selInicio <= ocFin) {
              solicitudConflicto = true;
              break;
            }
          }
        }
        // Notificar al usuario si hay conflicto
        if (solicitudConflicto) {
          toast('El equipo esta ocupado en al menos una de las fechas seleccionadas.', { type: 'error' });
        }
      }
    });
  } else if (action === 'Registro') {
    formRegistroDiv.classList.remove('hidden');
    // Initialize single date picker para el registro de uso
    fpRegistro = flatpickr(registroFecha, { dateFormat: 'd/m/Y' });
  }
});

// Cancel button in step2
cancelStep2Btn.addEventListener('click', () => {
  step2.classList.add('hidden');
  step1.classList.remove('hidden');
  equipoBusqueda.value = '';
});

// Add another equipo
addEquipoBtn.addEventListener('click', () => {
  if (!processCurrentEquipo()) return;
  // Clear fields and return to search
  resetStep2();
  step2.classList.add('hidden');
  step1.classList.remove('hidden');
  equipoBusqueda.value = '';
});

// Finalize
finalizarEquipoBtn.addEventListener('click', () => {
  if (!processCurrentEquipo()) return;
  showStep3();
});

// Process current equipo into cart. Returns false if validation fails.
function processCurrentEquipo() {
  const action = equipoAccionSel.value;
  if (!action) {
    toast('Seleccione el tipo de accion para el equipo.', { type: 'error' });
    return false;
  }
  if (action === 'Solicitud') {
    const rango = solicitudRango.value;
    if (!rango) {
      toast('Seleccione el rango de uso.', { type: 'error' });
      return false;
    }
    let fechas = rango.split(/\s*(?:to|a)\s*/);
    if (fechas.length < 2) {
      fechas = rango.split(' ');
    }
    const inicio = parseFechaEquipo(fechas[0]);
    const fin    = parseFechaEquipo(fechas[1] || fechas[0]);
    const act = equipoActividad.value;
    const desc = equipoDescripcion.value;
    if (!act || !desc) {
      toast('Seleccione la actividad y describa lo que se realizara.', { type: 'error' });
      return false;
    }
    // Verificar si las fechas seleccionadas se superponen con intervalos ocupados
    if (solicitudConflicto) {
      toast('El equipo esta ocupado en las fechas seleccionadas.', { type: 'error' });
      return false;
    }
    cart.push({
      tipo: 'Solicitud de Equipos',
      equipo: currentEquipo,
      fechaInicial: inicio,
      fechaFinal: fin,
      actividad: act,
      descripcion: desc
    });
  } else if (action === 'Registro') {
    const fechaUso = registroFecha.value;
    const act = equipoActividad.value;
    const desc = equipoDescripcion.value;
    if (!fechaUso || !act || !desc) {
      toast('Complete la fecha de uso, la actividad y la descripcion.', { type: 'error' });
      return false;
    }
    cart.push({
      tipo: 'Uso de equipo',
      equipo: currentEquipo,
      fechaUsoEquipo: parseFechaEquipo(fechaUso),
      actividad: act,
      descripcion: desc
    });
  }
  return true;
}

// Show summary step
function showStep3() {
  step1.classList.add('hidden');
  step2.classList.add('hidden');
  // Build summary list
  renderSummary_();
  step3.classList.remove('hidden');
}

function renderSummary_() {
  let html = '<ul class="summary-list">';
  cart.forEach((item, idx) => {
    const title = escapeHtml_(item.equipo || '');
    let meta = '';
    if (item.tipo === 'Solicitud de Equipos') {
      meta = `Solicitud (${formatDate(item.fechaInicial)} a ${formatDate(item.fechaFinal)}) - ${escapeHtml_(item.actividad || '')}`;
    } else {
      meta = `Registro el ${formatDate(item.fechaUsoEquipo)} - ${escapeHtml_(item.actividad || '')}`;
    }
    html += `
      <li>
        <div>
          <div><strong>${idx + 1}. ${title}</strong></div>
          <div class="meta">${meta}</div>
        </div>
        <button type="button" class="icon-btn danger" data-remove="${idx}">Quitar</button>
      </li>
    `;
  });
  html += '</ul>';
  summaryDiv.innerHTML = html;
}

summaryDiv.addEventListener('click', (e) => {
  const btn = e.target && e.target.closest ? e.target.closest('button[data-remove]') : null;
  if (!btn) return;
  const idx = Number(btn.dataset.remove);
  if (!Number.isFinite(idx)) return;
  cart.splice(idx, 1);
  if (cart.length === 0) {
    step3.classList.add('hidden');
    step1.classList.remove('hidden');
    toast('Carrito vacio. Agrega un equipo para continuar.', { type: 'info' });
    return;
  }
  renderSummary_();
});

// Back to search from summary
backToSearchBtn.addEventListener('click', () => {
  step3.classList.add('hidden');
  step1.classList.remove('hidden');
});

// Send all equipos
enviarEquiposBtn.addEventListener('click', async () => {
  if (cart.length === 0) {
    toast('No hay equipos para enviar.', { type: 'error' });
    return;
  }
  if (!validateRequired([nombreUsuario, correoUsuario])) {
    toast('Revisa los campos obligatorios.', { type: 'error' });
    return;
  }
  const payload = {
    nombre: nombreUsuario.value,
    correo: correoUsuario.value,
    observaciones: observaciones.value || '',
    tipo: 'Equipos'
  };
  try {
    setButtonLoading(enviarEquiposBtn, true);
    const msg = await sendRequest(payload, cart);
    toast(msg || 'Solicitud enviada correctamente', { type: 'success' });
    // Reset everything
    cart = [];
    nombreUsuario.value = '';
    correoUsuario.value = '';
    observaciones.value = '';
    // Después de enviar, regresar a la página unificada de solicitudes para evitar bucles
    window.location.href = 'solicitudes.html';
  } catch (err) {
    console.error(err);
    toast('Ocurrio un error al enviar la solicitud.', { type: 'error' });
  } finally {
    setButtonLoading(enviarEquiposBtn, false);
  }
});

// Helpers
function escapeHtml_(s) {
  return String(s || '').replace(/[&<>]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[ch]));
}

function parseFechaEquipo(fechaStr) {
  // fechaStr en d/m/Y
  const parts = fechaStr.split('/');
  if (parts.length === 3) {
    const [d, m, y] = parts;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  return fechaStr;
}

function formatDate(isoStr) {
  if (!isoStr) return '';
  const [y, m, d] = isoStr.split('-');
  return `${d}/${m}/${y}`;
}
