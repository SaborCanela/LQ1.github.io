import { toast, setButtonLoading } from './ui-kit.js';
import { getWebAppUrl, setWebAppUrl, getDashboard } from './api.js';

// Client-side gate only (not real security)
const ADMIN_PASSCODE = 'cambiar-esto';

const statusEl = document.getElementById('adminStatus');
const refreshBtn = document.getElementById('adminRefresh');
const configBtn = document.getElementById('adminConfig');
const errorEl = document.getElementById('adminError');

const charts = {};

document.addEventListener('DOMContentLoaded', () => {
  if (!ensureAdmin_()) return;
  bindUi_();
  load_();
});

function bindUi_() {
  refreshBtn.addEventListener('click', () => load_());
  if (configBtn) {
    configBtn.addEventListener('click', () => {
      const current = getWebAppUrl();
      const next = window.prompt(
        'Pega aqui la URL del Web App de Apps Script (termina en /exec).\n\nDeja vacio para volver al valor por defecto.',
        current
      );
      if (next === null) return;
      try {
        setWebAppUrl(next);
        toast('Configuracion guardada.', { type: 'success' });
        load_();
      } catch (e) {
        toast(e.message || 'URL invalida', { type: 'error' });
      }
    });
  }
}

async function load_() {
  setButtonLoading(refreshBtn, true, 'Actualizando...');
  setStatus_('Conectando...', 'info');
  clearError_();
  try {
    const data = await getDashboard();
    if (!data || typeof data !== 'object') throw new Error('Respuesta no valida');

    renderKpis_(data.kpis);
    renderTimeline_(data.timeline_monthly);
    renderResources_(data.resource_status, data.kpis);
    renderUsers_(data.users_activity);
    renderRecent_(data.recent_events);

    setStatus_('Conectado', 'success');
  } catch (e) {
    console.error(e);
    setStatus_('Sin conexion', 'error');
    showError_('No se pudo cargar el dashboard.', e);
    toast('No se pudo cargar el dashboard.', { type: 'error' });
  } finally {
    setButtonLoading(refreshBtn, false);
  }
}

function renderKpis_(k) {
  setNum_('kpiTotalRequests', k.total_requests);
  setNum_('kpiEquipmentInUseNow', k.equipment_in_use_now);
  setNum_('kpiReagentsUseEvents', k.reagents_use_events);
  setNum_('kpiSuppliesActiveNow', k.supplies_active_now);
  setNum_('kpiUniqueUsers30d', k.unique_users_30d);
}

function renderTimeline_(t) {
  if (typeof Chart === 'undefined') return;
  const labels = t.labels || [];
  const ctx = document.getElementById('chartOperational').getContext('2d');
  destroyChart_('chartOperational');

  charts.chartOperational = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        mkStack_('Solicitud Equipos', t.REQUEST_EQUIPMENT, '#1f77b4'),
        mkStack_('Solicitud Reactivos', t.REQUEST_REAGENT, '#ff7f0e'),
        mkStack_('Solicitud Insumos', t.REQUEST_SUPPLY, '#2ca02c'),
        mkStack_('Uso Equipos', t.USE_EQUIPMENT, '#9467bd'),
        mkStack_('Uso Reactivos', t.USE_REAGENT, '#e377c2'),
        mkStack_('Uso Laboratorio', t.LAB_USAGE, '#17becf'),
        {
          type: 'line',
          label: 'Total mensual',
          data: t.total_monthly || [],
          borderColor: '#0b1f3a',
          backgroundColor: 'rgba(11, 31, 58, 0.08)',
          tension: 0,
          fill: false,
          pointRadius: 0,
          borderWidth: 2,
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom', labels: { color: 'rgba(0,29,58,0.76)' } }
      },
      scales: {
        x: { stacked: true, ticks: { color: 'rgba(0,29,58,0.60)' }, grid: { color: 'rgba(0,29,58,0.10)' } },
        y: { stacked: true, ticks: { color: 'rgba(0,29,58,0.60)' }, grid: { color: 'rgba(0,29,58,0.10)' } },
      }
    }
  });
}

function renderResources_(r, kpis) {
  // Equipos
  setNum_('equiposInUseNow', r.equipment.in_use_now);
  const available = r.equipment.available_now;
  const elAvail = document.getElementById('equiposAvailable');
  if (elAvail) elAvail.textContent = (available === null || available === undefined) ? '—' : formatNumber_(available);

  renderHBar_('chartEquiposRequested', r.equipment.top_requested || [], '#1f77b4', 'chartEquiposRequested');
  renderHBar_('chartEquiposUsed', r.equipment.top_used || [], '#9467bd', 'chartEquiposUsed');

  // Reactivos mini-KPIs
  const used = (kpis && kpis.reagents_consumed) ? kpis.reagents_consumed : {};
  const req = (kpis && kpis.reagents_requested) ? kpis.reagents_requested : {};
  setNum_('reagUsedG', used.total_mass_g);
  setNum_('reagUsedML', used.total_volume_mL);
  setNum_('reagReqG', req.total_mass_g);
  setNum_('reagReqML', req.total_volume_mL);

  const badge = document.getElementById('reagUnknownBadge');
  const unk = (Number(used.unknown_used_events) || 0) + (Number(req.unknown_requested_events) || 0);
  if (badge) {
    if (unk > 0) {
      badge.hidden = false;
      badge.textContent = `${unk} registros con unidad no reconocida`;
    } else {
      badge.hidden = true;
    }
  }

  renderHBar_('chartReactivosConsumedMass', r.reagents.top_consumed_by_mass_g || [], '#e377c2', 'chartReactivosConsumedMass', 'g');
  renderHBar_('chartReactivosConsumedVol', r.reagents.top_consumed_by_volume_mL || [], '#ff7f0e', 'chartReactivosConsumedVol', 'mL');
  renderHBar_('chartReactivosRequestedVol', r.reagents.top_requested_by_volume_mL || [], '#17becf', 'chartReactivosRequestedVol', 'mL');

  // Insumos
  setNum_('insumosActive', r.supplies.active_now);
  setNum_('insumosTopCount', (r.supplies.top_lent || []).length);
  renderHBar_('chartInsumosTop', r.supplies.top_lent || [], '#2ca02c', 'chartInsumosTop');
}

function renderUsers_(u) {
  const rows = u.rows || [];
  const tbody = document.getElementById('userTableBody');
  if (tbody) {
    tbody.innerHTML = rows.map(r => {
      return `
        <tr>
          <td>${esc_(r.name)}</td>
          <td>${esc_(r.email || '')}</td>
          <td>${formatNumber_(r.total_requests)}</td>
          <td>${formatNumber_(r.use_equipment)}</td>
          <td>${formatNumber_(r.use_reagent)}</td>
          <td>${esc_(r.last_activity || '')}</td>
        </tr>
      `;
    }).join('');
  }

  renderHBar_('chartUsersTop', u.top10 || [], '#0b1f3a', 'chartUsersTop');
}

function renderRecent_(r) {
  const items = r.items || [];
  const wrap = document.getElementById('recentEvents');
  if (!wrap) return;
  wrap.innerHTML = items.map(ev => {
    const icon = iconFor_(ev.event_type);
    const title = `${labelFor_(ev.event_type)}${ev.status ? ' - ' + ev.status : ''}`;
    const who = [ev.user_name, ev.user_email].filter(Boolean).join(' - ');
    const sub = [who, ev.resource_name].filter(Boolean).join(' | ');
    return `
      <div class="event">
        <div class="icon" aria-hidden="true">${icon}</div>
        <div>
          <div class="title">${esc_(title)}</div>
          <div class="sub">${esc_(sub)}</div>
        </div>
        <div class="date">${esc_(ev.date_start || '')}</div>
      </div>
    `;
  }).join('');
}

function mkStack_(label, data, color) {
  return {
    type: 'bar',
    label,
    data: data || [],
    backgroundColor: hexToRgba_(color, 0.35),
    borderColor: color,
    borderWidth: 1,
    barPercentage: 0.9,
    categoryPercentage: 0.9,
  };
}

function renderHBar_(canvasId, pairs, color, key, unitSuffix) {
  if (typeof Chart === 'undefined') return;
  const el = document.getElementById(canvasId);
  if (!el) return;
  const ctx = el.getContext('2d');
  destroyChart_(key);

  const labels = (pairs || []).map(p => p.name);
  const data = (pairs || []).map(p => Number(p.value) || 0);
  charts[key] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: hexToRgba_(color, 0.25),
        borderColor: color,
        borderWidth: 1,
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const v = ctx.parsed.x;
              return unitSuffix ? `${v} ${unitSuffix}` : String(v);
            }
          }
        }
      },
      scales: {
        x: { ticks: { color: 'rgba(0,29,58,0.60)' }, grid: { color: 'rgba(0,29,58,0.10)' } },
        y: { ticks: { color: 'rgba(0,29,58,0.70)' }, grid: { display: false } },
      }
    }
  });
}

function destroyChart_(key) {
  if (charts[key]) {
    charts[key].destroy();
    charts[key] = null;
  }
}

function setNum_(id, v) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = formatNumber_(v);
}

function formatNumber_(n) {
  try { return Number(n || 0).toLocaleString('es-EC'); } catch (_) { return String(n || 0); }
}

function esc_(s) {
  return String(s || '').replace(/[&<>]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[ch]));
}

function hexToRgba_(hex, a) {
  const h = String(hex || '').replace('#', '').trim();
  if (h.length !== 6) return `rgba(0,0,0,${a || 0.1})`;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a || 0.1})`;
}

function iconFor_(t) {
  switch (t) {
    case 'REQUEST_EQUIPMENT': return 'E';
    case 'USE_EQUIPMENT': return 'e';
    case 'REQUEST_REAGENT': return 'R';
    case 'USE_REAGENT': return 'r';
    case 'REQUEST_SUPPLY': return 'I';
    case 'LAB_USAGE': return 'L';
    default: return '•';
  }
}

function labelFor_(t) {
  switch (t) {
    case 'REQUEST_EQUIPMENT': return 'Solicitud equipo';
    case 'USE_EQUIPMENT': return 'Uso equipo';
    case 'REQUEST_REAGENT': return 'Solicitud reactivo';
    case 'USE_REAGENT': return 'Uso reactivo';
    case 'REQUEST_SUPPLY': return 'Solicitud insumo';
    case 'LAB_USAGE': return 'Uso laboratorio';
    default: return t || 'Evento';
  }
}

function setStatus_(text, kind) {
  if (!statusEl) return;
  statusEl.textContent = String(text || '');
  const colors = {
    info: 'rgba(255,255,255,0.55)',
    success: 'rgba(34, 211, 166, 0.22)',
    error: 'rgba(180, 35, 24, 0.12)',
  };
  statusEl.style.background = colors[kind] || colors.info;
}

function showError_(message, err) {
  if (!errorEl) return;
  const details = err && err.message ? String(err.message) : String(err || '');
  errorEl.innerHTML = `${esc_(message)}
    <div style="margin-top:8px;opacity:.9"><code>${esc_(details)}</code></div>
    <div style="margin-top:8px;opacity:.85">WEB_APP_URL: <code>${esc_(getWebAppUrl())}</code></div>`;
  errorEl.classList.remove('hidden');
}

function clearError_() {
  if (!errorEl) return;
  errorEl.classList.add('hidden');
  errorEl.textContent = '';
}

function ensureAdmin_() {
  try {
    if (sessionStorage.getItem('adminOk') === '1') return true;
  } catch (_) {}
  if (document.getElementById('adminAuthOverlay')) return false;

  // Lock scroll
  document.documentElement.style.overflow = 'hidden';
  document.body.style.overflow = 'hidden';

  const overlay = document.createElement('div');
  overlay.className = 'admin-auth';
  overlay.id = 'adminAuthOverlay';
  overlay.innerHTML = `
    <div class="box" role="dialog" aria-modal="true" aria-label="Acceso administrador">
      <h2>Acceso administrador</h2>
      <p>Ingresa el codigo para ver el dashboard.</p>
      <div class="field">
        <label for="adminPass">Codigo</label>
        <input id="adminPass" type="password" autocomplete="current-password" placeholder="Codigo">
      </div>
      <div class="actions">
        <button id="adminEnter" class="btn btn-primary" type="button">Ingresar</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const passEl = document.getElementById('adminPass');
  const enterEl = document.getElementById('adminEnter');

  const unlock = () => {
    document.documentElement.style.overflow = '';
    document.body.style.overflow = '';
  };

  const attempt = () => {
    const v = String(passEl && passEl.value || '').trim();
    if (!v) return;
    if (v === ADMIN_PASSCODE) {
      try { sessionStorage.setItem('adminOk', '1'); } catch (_) {}
      overlay.remove();
      unlock();
      return;
    }
    toast('Codigo incorrecto.', { type: 'error' });
  };

  if (enterEl) enterEl.addEventListener('click', attempt);
  if (passEl) {
    passEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') attempt();
      if (e.key === 'Escape') {
        // Optional close: keep locked but allow leaving page
        overlay.remove();
        unlock();
      }
    });
    passEl.focus();
  }
  return false;
}
