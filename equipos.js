import { getList, getBusyEquipos, sendRequest } from './api.js';

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
const registroActividad = document.getElementById('registroActividad');
const registroDescripcion = document.getElementById('registroDescripcion');
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
let currentEquipo = null;
let fpSolicitud  = null;
let fpRegistro   = null;

// Load list of equipos on load
window.addEventListener('load', async () => {
  const list = await getList('listEquipos');
  equiposList.innerHTML = list.map(item => `<option value="${item}"></option>`).join('');
});

// Navigation back to home
backHomeBtn.addEventListener('click', () => {
  window.location.href = 'index.html';
});

// Buscar equipo
buscarEquipoBtn.addEventListener('click', () => {
  const eq = equipoBusqueda.value.trim();
  if (!eq) {
    alert('Por favor, ingrese o seleccione un equipo.');
    return;
  }
  currentEquipo = eq;
  showStep2(eq);
});

// Reset step2 fields
function resetStep2() {
  equipoAccionSel.value = '';
  formSolicitudDiv.classList.add('hidden');
  formRegistroDiv.classList.add('hidden');
  ocupacionInfo.textContent = '';
  if (fpSolicitud) { fpSolicitud.clear(); }
  if (fpRegistro) { fpRegistro.clear(); }
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
  equipoImgEl.src = `imagenes/equipos/${slug}.png`;
  equipoImgEl.onerror = () => {
    equipoImgEl.src = 'placeholder_light_gray_block.png';
  };
  resetStep2();
}

// Action selection
equipoAccionSel.addEventListener('change', async () => {
  const action = equipoAccionSel.value;
  resetStep2();
  if (!action) return;
  if (action === 'Solicitud') {
    formSolicitudDiv.classList.remove('hidden');
    // Initialize flatpickr with range plugin
    fpSolicitud = flatpickr(solicitudRango, {
      mode: 'range',
      dateFormat: 'd/m/Y',
      onClose: async (selectedDates) => {
        if (selectedDates.length === 2) {
          const [start, end] = selectedDates;
          // Show busy intervals
          const busy = await getBusyEquipos(currentEquipo);
          if (Array.isArray(busy) && busy.length > 0) {
            ocupacionInfo.innerHTML = '<strong>Ocupado en:</strong> ' + busy.map(b => `${formatDate(b.from)} – ${formatDate(b.to)}`).join(', ');
          } else {
            ocupacionInfo.textContent = '';
          }
        }
      }
    });
  } else if (action === 'Registro') {
    formRegistroDiv.classList.remove('hidden');
    // Initialize single date picker
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
    alert('Seleccione el tipo de acción para el equipo.');
    return false;
  }
  if (action === 'Solicitud') {
    const rango = solicitudRango.value;
    if (!rango) {
      alert('Seleccione el rango de uso.');
      return false;
    }
    const parts = rango.split(' a ');
    // flatpickr in range mode sets string like "10/08/2024 to 12/08/2024" or with "to"; we need to handle multiple separators
    let fechas = rango.split(/\s*(?:to|a)\s*/);
    if (fechas.length < 2) {
      fechas = rango.split(' ');
    }
    const inicio = parseFechaEquipo(fechas[0]);
    const fin    = parseFechaEquipo(fechas[1] || fechas[0]);
    cart.push({
      tipo: 'Solicitud de Equipos',
      equipo: currentEquipo,
      fechaInicial: inicio,
      fechaFinal: fin
    });
  } else if (action === 'Registro') {
    const fechaUso = registroFecha.value;
    const actividad = registroActividad.value;
    const descripcion = registroDescripcion.value;
    if (!fechaUso || !actividad || !descripcion) {
      alert('Complete la fecha de uso, la actividad y la descripción.');
      return false;
    }
    cart.push({
      tipo: 'Uso de equipo',
      equipo: currentEquipo,
      fechaUsoEquipo: parseFechaEquipo(fechaUso),
      nombreActividad: actividad,
      observaciones: descripcion
    });
  }
  return true;
}

// Show summary step
function showStep3() {
  step1.classList.add('hidden');
  step2.classList.add('hidden');
  // Build summary list
  let html = '<ul>';
  cart.forEach((item, idx) => {
    if (item.tipo === 'Solicitud de Equipos') {
      html += `<li><strong>${idx + 1}. ${item.equipo}</strong> – Solicitud (${formatDate(item.fechaInicial)} a ${formatDate(item.fechaFinal)})</li>`;
    } else {
      html += `<li><strong>${idx + 1}. ${item.equipo}</strong> – Registro el ${formatDate(item.fechaUsoEquipo)} (${item.nombreActividad})</li>`;
    }
  });
  html += '</ul>';
  summaryDiv.innerHTML = html;
  step3.classList.remove('hidden');
}

// Back to search from summary
backToSearchBtn.addEventListener('click', () => {
  step3.classList.add('hidden');
  step1.classList.remove('hidden');
});

// Send all equipos
enviarEquiposBtn.addEventListener('click', async () => {
  if (cart.length === 0) {
    alert('No hay equipos para enviar.');
    return;
  }
  if (!nombreUsuario.value || !correoUsuario.value) {
    alert('Ingrese su nombre y correo institucional.');
    return;
  }
  const payload = {
    nombre: nombreUsuario.value,
    correo: correoUsuario.value,
    observaciones: observaciones.value || '',
    tipo: 'Equipos'
  };
  try {
    const msg = await sendRequest(payload, cart);
    alert(msg || 'Solicitud enviada correctamente');
    // Reset everything
    cart = [];
    nombreUsuario.value = '';
    correoUsuario.value = '';
    observaciones.value = '';
    step3.classList.add('hidden');
    step1.classList.remove('hidden');
  } catch (err) {
    console.error(err);
    alert('Ocurrió un error al enviar la solicitud.');
  }
});

// Helpers
function slugify(str) {
  return str
    .toString()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
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