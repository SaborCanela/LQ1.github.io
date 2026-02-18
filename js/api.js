/*
 * api.js
 *
 * Este módulo proporciona funciones auxiliares para interactuar
 * con el Web App de Google Apps Script. Implementa la lógica de
 * almacenamiento en caché de las listas (reactivos, equipos y materiales)
 * en localStorage con un TTL configurable, así como wrappers para
 * las llamadas de lectura (doGet) y escritura (doPost) del backend.
 *
 * Las funciones retornan Promesas, lo que facilita su uso con
 * async/await en el resto de páginas.  Para las operaciones que
 * requieren adjuntar archivos (p. ej. solicitud de reactivo
 * controlado), se lee el archivo como Base64 y se envía como
 * parte del FormData.
 */

// Default Web App URL (Apps Script deployment).
// You can override it at runtime via localStorage key: webAppUrl
// (useful when you redeploy and the /exec URL changes).
export const WEB_APP_URL_DEFAULT = 'https://script.google.com/macros/s/AKfycbyjulQmL_5axxncByc3Zf_PpsyItYRMwsFLDIjp3adYXX6ChEDGpSrNoL3lufcDCKpKJg/exec';

export function getWebAppUrl() {
  try {
    const v = localStorage.getItem('webAppUrl');
    if (v && /^https:\/\//i.test(v)) return v;
  } catch (_) {}
  return WEB_APP_URL_DEFAULT;
}

export function setWebAppUrl(nextUrl) {
  const v = String(nextUrl || '').trim();
  if (!v) {
    try { localStorage.removeItem('webAppUrl'); } catch (_) {}
    return;
  }
  if (!/^https:\/\//i.test(v)) throw new Error('URL invalida. Debe iniciar con https://');
  try { localStorage.setItem('webAppUrl', v); } catch (_) {}
}

// TTL para las listas en milisegundos (12 horas)
const TTL_MS = 12 * 60 * 60 * 1000;

/**
 * Obtiene una lista (reactivos, insumos o equipos) del backend o
 * del caché local.  Si la lista está almacenada en localStorage y
 * no ha expirado, se devuelve la versión en caché.  En caso
 * contrario, se consulta al Apps Script y se actualiza el caché.
 *
 * @param {string} listName Nombre de la acción (p.ej. 'listReactivos').
 * @returns {Promise<string[]>} Lista de nombres.
 */
export async function getList(listName) {
  const storageKey = `cache_${listName}`;
  const cached = localStorage.getItem(storageKey);
  if (cached) {
    try {
      const { ts, data } = JSON.parse(cached);
      if (Date.now() - ts < TTL_MS && Array.isArray(data)) {
        return data;
      }
    } catch (e) {
      // Si hay error al parsear, se ignora y se refresca
    }
  }
  // Consulta al backend
  const data = await safeGetJson_({ action: listName });
  if (Array.isArray(data)) {
    localStorage.setItem(storageKey, JSON.stringify({ ts: Date.now(), data }));
    return data;
  }
  return [];
}

/**
 * Consulta la disponibilidad de equipos para un rango de fechas.
 *
 * @param {string} start Fecha inicial en formato ISO (yyyy-mm-dd).
 * @param {string} end   Fecha final en formato ISO (yyyy-mm-dd).
 * @returns {Promise<string[]>} Lista de equipos disponibles.
 */
export async function getAvailableEquipos(start, end) {
  const params = { action: 'availEquipos' };
  if (start) params.start = start;
  if (end) params.end = end;
  return safeGetJson_(params);
}

/**
 * Obtiene un listado de ocupaciones para un equipo concreto.
 *
 * @param {string} equipo Nombre del equipo.
 * @returns {Promise<Array<{from: string, to: string}>>}
 */
export async function getBusyEquipos(equipo) {
  return safeGetJson_({ action: 'busyEquipos', equipo });
}

/**
 * Envía una solicitud al backend para crear uno o varios registros.
 *
 * Esta función admite dos modos:
 * 1. Envío único (forma tradicional) pasando un objeto `payload` que
 *    se enviará tal cual a `doPost`.  Se utiliza cuando `items` es
 *    nulo o una lista vacía.
 * 2. Envío múltiple: se pasa un objeto `payload` con los campos
 *    generales (nombre, correo, fecha, observaciones, etc.) y un
 *    array `items` con objetos individuales (equipos, materiales,
 *    reactivos).  Se serializa el array a JSON y se envía en el
 *    parámetro `items`.  El Apps Script debe detectar este parámetro
 *    y procesar cada elemento por separado.
 *
 * Para adjuntar un archivo (caso de reactivos controlados), pase
 * `file` como instancia de File.  El archivo se convertirá a
 * Base64 y se enviará en los campos `fileName` y `fileBase64`.
 *
 * @param {Object} payload Datos generales a enviar.
 * @param {Array<Object>} items Lista de elementos.
 * @param {File|null} file Archivo opcional.
 * @returns {Promise<string>} Respuesta en texto plano del backend.
 */
export async function sendRequest(payload, items = [], file = null) {
  const formData = new FormData();
  // Añadir campos del payload
  Object.entries(payload).forEach(([k, v]) => {
    if (v !== undefined && v !== null) formData.append(k, v);
  });
  // Añadir lista serializada si existen items
  if (items && Array.isArray(items) && items.length > 0) {
    formData.append('items', JSON.stringify(items));
  }
  // Adjuntar archivo si lo hay
  if (file) {
    const b64 = await toBase64(file);
    formData.append('fileName', file.name);
    // Enviar mimeType para que el backend guarde el blob correctamente
    formData.append('fileMimeType', file.type || 'application/pdf');
    formData.append('fileBase64', b64);
  }
  try {
    const resp = await fetch(getWebAppUrl(), {
      method: 'POST',
      body: formData
    });
    return resp.text();
  } catch (e) {
    // Typical when Web App doesn't send CORS headers. Retry as opaque.
    await fetch(getWebAppUrl(), {
      method: 'POST',
      body: formData,
      mode: 'no-cors'
    });
    return 'Enviado. (Respuesta no disponible por CORS)';
  }
}

/**
 * Obtiene estadísticas generales de solicitudes y registros desde el backend.
 * El Apps Script debe implementar la acción 'stats' para devolver un objeto
 * con las propiedades: total, equipos, materiales, reactivos, registro.
 *
 * @returns {Promise<Object>} Objeto con estadísticas.
 */
export async function getStats(opts = {}) {
  const params = { action: 'stats' };
  if (opts && opts.range) params.range = String(opts.range);
  return safeGetJson_(params);
}

export async function getAgenda(days = 14) {
  return safeGetJson_({ action: 'agenda', days: String(days) });
}

export async function getDashboard() {
  return safeGetJson_({ action: 'dashboard' });
}

async function safeGetJson_(params) {
  const url = new URL(getWebAppUrl());
  Object.entries(params || {}).forEach(([k, v]) => {
    if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  });

  // First try fetch (fast path)
  try {
    const resp = await fetch(url);
    const text = await resp.text();
    try {
      return JSON.parse(text);
    } catch (_) {
      const preview = String(text || '').slice(0, 180).replace(/\s+/g, ' ').trim();
      throw new Error(`API no-JSON (HTTP ${resp.status}). Preview: ${preview}`);
    }
  } catch (e) {
    // Fallback JSONP for environments where Apps Script doesn't expose CORS
    return jsonp_(params);
  }
}

function jsonp_(params) {
  return new Promise((resolve, reject) => {
    const cb = `__jsonp_${Math.random().toString(36).slice(2)}`;
    const url = new URL(getWebAppUrl());
    Object.entries(params || {}).forEach(([k, v]) => {
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    });
    url.searchParams.set('callback', cb);
    url.searchParams.set('_t', String(Date.now()));

    const script = document.createElement('script');
    script.async = true;
    script.src = url.toString();

    const cleanup = () => {
      try { delete window[cb]; } catch (_) { window[cb] = undefined; }
      script.remove();
    };

    const timer = window.setTimeout(() => {
      cleanup();
      reject(new Error('JSONP timeout'));
    }, 12000);

    window[cb] = (data) => {
      window.clearTimeout(timer);
      cleanup();
      resolve(data);
    };

    script.onerror = () => {
      window.clearTimeout(timer);
      cleanup();
      reject(new Error('JSONP network error'));
    };

    document.head.appendChild(script);
  });
}

/**
 * Convierte un objeto File a Base64 (sin prefijo data:).
 * @param {File} file
 * @returns {Promise<string>}
 */
function toBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      // El resultado viene con el prefijo data:mime;base64,
      // separamos para quedarnos solo con la parte Base64.
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
