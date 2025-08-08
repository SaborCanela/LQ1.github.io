import { getList, sendRequest } from './api.js';

// Elements
const backHomeMatBtn = document.getElementById('backHomeMat');
const matStep1 = document.getElementById('matStep1');
const matStep2 = document.getElementById('matStep2');
const matStep3 = document.getElementById('matStep3');
const matBusqueda = document.getElementById('matBusqueda');
const materialList = document.getElementById('materialList');
const buscarMaterialBtn = document.getElementById('buscarMaterialBtn');
const matNombreEl = document.getElementById('matNombre');
const matImgEl = document.getElementById('matImg');
const matAccionSel = document.getElementById('matAccion');
const matFormSolicitud = document.getElementById('matFormSolicitud');
const matFormRegistro  = document.getElementById('matFormRegistro');
const matRango    = document.getElementById('matRango');
const matCantidadSol = document.getElementById('matCantidadSol');
const matFechaUso = document.getElementById('matFechaUso');
const matCantidadReg = document.getElementById('matCantidadReg');
const matActividad  = document.getElementById('matActividad');
const matDescripcion= document.getElementById('matDescripcion');
const matCancelStep2 = document.getElementById('matCancelStep2');
const matAddBtn   = document.getElementById('matAddBtn');
const matFinalizarBtn = document.getElementById('matFinalizarBtn');
const matResumenDiv = document.getElementById('matResumen');
const matBackToSearch = document.getElementById('matBackToSearch');
const matEnviarBtn = document.getElementById('matEnviar');
const matNombreUsuario = document.getElementById('matNombreUsuario');
const matCorreoUsuario = document.getElementById('matCorreoUsuario');
const matObsUsuario    = document.getElementById('matObsUsuario');

let matCart = [];
let currentMaterial = null;
let fpMatSolicitud = null;
let fpMatRegistro  = null;

// Load material list on load
window.addEventListener('load', async () => {
  const list = await getList('listInsumos');
  materialList.innerHTML = list.map(item => `<option value="${item}"></option>`).join('');
});

// Back to home
backHomeMatBtn.addEventListener('click', () => {
  window.location.href = 'index.html';
});

// Search material
buscarMaterialBtn.addEventListener('click', () => {
  const mat = matBusqueda.value.trim();
  if (!mat) {
    alert('Por favor, ingrese o seleccione un material.');
    return;
  }
  currentMaterial = mat;
  showMaterialStep2(mat);
});

function resetMatStep2() {
  matAccionSel.value = '';
  matFormSolicitud.classList.add('hidden');
  matFormRegistro.classList.add('hidden');
  if (fpMatSolicitud) fpMatSolicitud.clear();
  if (fpMatRegistro) fpMatRegistro.clear();
  matCantidadSol.value = '';
  matCantidadReg.value = '';
  matActividad.value = '';
  matDescripcion.value = '';
}

function showMaterialStep2(name) {
  matStep1.classList.add('hidden');
  matStep3.classList.add('hidden');
  matStep2.classList.remove('hidden');
  matNombreEl.textContent = name;
  const slug = slugify(name);
  matImgEl.src = `imagenes/material/${slug}.jpg`;
  matImgEl.onerror = () => {
    matImgEl.src = 'placeholder_light_gray_block.png';
  };
  resetMatStep2();
}

// Select action for material
matAccionSel.addEventListener('change', () => {
  resetMatStep2();
  const action = matAccionSel.value;
  if (!action) return;
  if (action === 'Solicitud') {
    matFormSolicitud.classList.remove('hidden');
    fpMatSolicitud = flatpickr(matRango, { mode: 'range', dateFormat: 'd/m/Y' });
  } else if (action === 'Registro') {
    matFormRegistro.classList.remove('hidden');
    fpMatRegistro = flatpickr(matFechaUso, { dateFormat: 'd/m/Y' });
  }
});

// Cancel step2
matCancelStep2.addEventListener('click', () => {
  matStep2.classList.add('hidden');
  matStep1.classList.remove('hidden');
  matBusqueda.value = '';
});

// Add material
matAddBtn.addEventListener('click', () => {
  if (!processMaterial()) return;
  matStep2.classList.add('hidden');
  matStep1.classList.remove('hidden');
  matBusqueda.value = '';
});

// Finalize materials
matFinalizarBtn.addEventListener('click', () => {
  if (!processMaterial()) return;
  showMaterialStep3();
});

function processMaterial() {
  const action = matAccionSel.value;
  if (!action) {
    alert('Seleccione el tipo de acción.');
    return false;
  }
  if (action === 'Solicitud') {
    const rango = matRango.value;
    const cantidad = matCantidadSol.value;
    if (!rango || !cantidad) {
      alert('Seleccione un rango de fechas y la cantidad.');
      return false;
    }
    let fechas = rango.split(/\s*(?:to|a)\s*/);
    const inicio = parseFechaMat(fechas[0]);
    const fin    = parseFechaMat(fechas[1] || fechas[0]);
    matCart.push({
      tipo: 'Solicitud de Insumos',
      insumo: currentMaterial,
      fechaSolicitudInsumos: inicio,
      fechaDevolucion: fin,
      cantidad: cantidad
    });
  } else if (action === 'Registro') {
    const fechaUso = matFechaUso.value;
    const cantidadReg = matCantidadReg.value;
    const act = matActividad.value;
    const desc = matDescripcion.value;
    if (!fechaUso || !cantidadReg || !act || !desc) {
      alert('Complete la fecha de uso, la cantidad, la actividad y la descripción.');
      return false;
    }
    matCart.push({
      tipo: 'Uso de Insumos',
      insumo: currentMaterial,
      fechaUsoInsumos: parseFechaMat(fechaUso),
      cantidad: cantidadReg,
      nombreActividad: act,
      observaciones: desc
    });
  }
  return true;
}

function showMaterialStep3() {
  matStep1.classList.add('hidden');
  matStep2.classList.add('hidden');
  // Build summary
  let html = '<ul>';
  matCart.forEach((item, idx) => {
    if (item.tipo === 'Solicitud de Insumos') {
      html += `<li><strong>${idx + 1}. ${item.insumo}</strong> – Solicitud (${formatDate(item.fechaSolicitudInsumos)} a ${formatDate(item.fechaDevolucion)}, Cantidad: ${item.cantidad})</li>`;
    } else {
      html += `<li><strong>${idx + 1}. ${item.insumo}</strong> – Registro el ${formatDate(item.fechaUsoInsumos)} (${item.nombreActividad}, Cantidad: ${item.cantidad})</li>`;
    }
  });
  html += '</ul>';
  matResumenDiv.innerHTML = html;
  matStep3.classList.remove('hidden');
}

// Back to search from summary
matBackToSearch.addEventListener('click', () => {
  matStep3.classList.add('hidden');
  matStep1.classList.remove('hidden');
});

// Send materials
matEnviarBtn.addEventListener('click', async () => {
  if (matCart.length === 0) {
    alert('No hay materiales para enviar.');
    return;
  }
  if (!matNombreUsuario.value || !matCorreoUsuario.value) {
    alert('Ingrese su nombre y correo institucional.');
    return;
  }
  const payload = {
    nombre: matNombreUsuario.value,
    correo: matCorreoUsuario.value,
    observaciones: matObsUsuario.value || '',
    tipo: 'Material'
  };
  try {
    const msg = await sendRequest(payload, matCart);
    alert(msg || 'Solicitud enviada correctamente');
    // Reset
    matCart = [];
    matNombreUsuario.value = '';
    matCorreoUsuario.value = '';
    matObsUsuario.value = '';
    matStep3.classList.add('hidden');
    matStep1.classList.remove('hidden');
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
function parseFechaMat(fechaStr) {
  const parts = fechaStr.split('/');
  if (parts.length === 3) {
    const [d, m, y] = parts;
    return `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
  }
  return fechaStr;
}
function formatDate(isoStr) {
  if (!isoStr) return '';
  const [y,m,d] = isoStr.split('-');
  return `${d}/${m}/${y}`;
}