/**
 * LATROY ENERGY - Integración Frontend <-> Apps Script
 * Pega este archivo como <script src="app-integration.js"></script> antes de </body>
 * en el index.html del dashboard, o inclúyelo dentro de un <script> al final del <body>.
 *
 * IMPORTANTE: reemplaza WEB_APP_URL con la URL de tu Web App publicada
 * (Extensiones > Apps Script > Implementar > Nueva implementación > Aplicación web)
 */

const WEB_APP_URL = 'PEGA_AQUI_TU_URL_DE_WEB_APP'; // https://script.google.com/macros/s/XXXXX/exec

async function apiGet(action, params = {}) {
  const query = new URLSearchParams({ action, ...params }).toString();
  const res = await fetch(`${WEB_APP_URL}?${query}`);
  const json = await res.json();
  if (!json.ok) throw new Error(json.error);
  return json.data;
}

async function apiPost(action, data) {
  const res = await fetch(WEB_APP_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // evita preflight CORS
    body: JSON.stringify({ action, data })
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error);
  return json.data;
}

/* ---------- 1. Cargar catálogos al iniciar ---------- */
let CATALOGO_PANELES = [];
let CATALOGO_INVERSORES = [];
let CLIENTES_CACHE = [];

async function initDashboard() {
  try {
    const all = await apiGet('all');
    CATALOGO_PANELES = all.paneles;
    CATALOGO_INVERSORES = all.inversores;
    CLIENTES_CACHE = all.clientes;

    poblarSelectPaneles();
    poblarSelectInversores();
    renderPipeline(all.pipeline);
    renderResumenKPIs(all.cotizaciones, all.pipeline);
  } catch (err) {
    console.error('Error cargando dashboard:', err);
    alert('No se pudo conectar con la base de datos: ' + err.message);
  }
}

function poblarSelectPaneles() {
  const sel = document.querySelector('#select-panel');
  if (!sel) return;
  sel.innerHTML = CATALOGO_PANELES.map(p =>
    `<option value="${p.panel_id}" data-wp="${p.potencia_wp}" data-costo="${p.costo_unitario_mxn}">
      ${p.modelo} (${p.potencia_wp}W) - ${p.certificacion}
    </option>`).join('');
}

function poblarSelectInversores() {
  const sel = document.querySelector('#select-inversor');
  if (!sel) return;
  sel.innerHTML = CATALOGO_INVERSORES.map(i =>
    `<option value="${i.inversor_id}" data-kw="${i.capacidad_kw}" data-costo="${i.costo_unitario_mxn}">
      ${i.modelo} (${i.capacidad_kw}kW) - ${i.certificacion}
    </option>`).join('');
}

/* ---------- 2. Guardar diagnóstico de consumo (Paso 1) ---------- */
async function guardarDiagnostico(formEl) {
  const fd = new FormData(formEl);
  const clienteId = await asegurarCliente_(fd);

  const data = {
    cliente_id: clienteId,
    numero_servicio_rmu: fd.get('numero_servicio_rmu'),
    tarifa_cfe: fd.get('tarifa_cfe'),
    tension_suministro: fd.get('tension_suministro'),
    consumo_kwh_periodo: Number(fd.get('consumo_kwh_periodo')),
    periodo_facturacion: fd.get('periodo_facturacion'),
    validado_por: 'Alonso Villalobos'
  };
  const diagnostico = await apiPost('crear_diagnostico', data);
  window.currentDiagnostico = diagnostico;
  irAPestana('dimensionamiento');
  return diagnostico;
}

async function asegurarCliente_(fd) {
  const existente = fd.get('cliente_id_existente');
  if (existente) return existente;
  const cliente = await apiPost('crear_cliente', {
    nombre_completo: fd.get('nombre_completo') || '',
    razon_social: fd.get('razon_social') || '',
    segmento: fd.get('segmento'),
    telefono: fd.get('telefono') || '',
    email: fd.get('email') || '',
    direccion: fd.get('direccion') || '',
    vendedor_asignado: 'Alonso Villalobos'
  });
  return cliente.cliente_id;
}

/* ---------- 3. Calcular y guardar dimensionamiento (Paso 2) ---------- */
async function guardarDimensionamiento(formEl) {
  const fd = new FormData(formEl);
  const data = {
    cliente_id: window.currentDiagnostico.cliente_id,
    diagnostico_id: window.currentDiagnostico.diagnostico_id,
    irradiancia_kwh_m2_dia: Number(fd.get('irradiancia_kwh_m2_dia')),
    perdidas_sistema_pct: Number(fd.get('perdidas_sistema_pct')),
    factor_simultaneidad: Number(fd.get('factor_simultaneidad')),
    consumo_promedio_mensual_kwh: Number(window.currentDiagnostico.consumo_promedio_mensual_kwh),
    panel_id: fd.get('panel_id'),
    inversor_id: fd.get('inversor_id'),
    cantidad_inversores: Number(fd.get('cantidad_inversores') || 1),
    calculado_por: 'Alonso Villalobos'
  };
  const dimensionamiento = await apiPost('crear_dimensionamiento', data);
  window.currentDimensionamiento = dimensionamiento;

  document.querySelector('#capacidad-calculada').value = dimensionamiento.capacidad_instalada_kw + ' kW';
  irAPestana('normativo');
  return dimensionamiento;
}

/* ---------- 4. Validación normativa (Paso 3) ---------- */
async function guardarValidacion(formEl) {
  const fd = new FormData(formEl);
  const data = {
    cliente_id: window.currentDimensionamiento.cliente_id,
    dimensionamiento_id: window.currentDimensionamiento.dimensionamiento_id,
    capacidad_instalada_kw: window.currentDimensionamiento.capacidad_instalada_kw,
    instalador_certificado_nombre: fd.get('instalador_certificado_nombre'),
    instalador_certificado_no_cert: fd.get('instalador_certificado_no_cert'),
    esquema_recomendado: fd.get('esquema_recomendado'),
    estatus_tramite_cfe: 'Pendiente de envio'
  };
  const validacion = await apiPost('crear_validacion', data);
  window.currentValidacion = validacion;

  if (validacion.supera_0_7_mw === 'Si') {
    document.querySelector('#alerta-dacg').style.display = 'block';
  }
  irAPestana('cotizacion');
  return validacion;
}

/* ---------- 5. Generar cotización completa + imprimir PDF ---------- */
async function generarCotizacion(formEl) {
  const fd = new FormData(formEl);
  const panel = CATALOGO_PANELES.find(p => p.panel_id === window.currentDimensionamiento.panel_id);
  const inversor = CATALOGO_INVERSORES.find(i => i.inversor_id === window.currentDimensionamiento.inversor_id);

  const costoEquipo = (panel.costo_unitario_mxn * window.currentDimensionamiento.cantidad_paneles)
    + (inversor.costo_unitario_mxn * window.currentDimensionamiento.cantidad_inversores);
  const instalacion = Number(fd.get('costo_instalacion')) || Math.round(costoEquipo * 0.25);
  const tramiteCfe = Number(fd.get('costo_tramite')) || 4500;
  const ingenieria = Number(fd.get('costo_ingenieria')) || 6000;

  const detalle = [
    { concepto: 'Equipo (paneles + inversor + estructura)', tipo: 'Equipo', monto_mxn: costoEquipo },
    { concepto: 'Instalación y mano de obra', tipo: 'Instalacion', monto_mxn: instalacion },
    { concepto: 'Trámite ante CFE/CRE (interconexión)', tipo: 'Tramite', monto_mxn: tramiteCfe },
    { concepto: 'Ingeniería, diagrama unifilar y carta responsiva', tipo: 'Ingenieria', monto_mxn: ingenieria }
  ];

  const inflacion = 5;
  const ahorroAnual1 = Number(fd.get('ahorro_anual_estimado')) || Math.round(costoEquipo * 0.18);
  const roi = [1, 3, 5, 7, 25].map(anio => ({
    anio,
    ahorro_anual_mxn: Math.round(ahorroAnual1 * Math.pow(1 + inflacion / 100, anio - 1)),
    ahorro_acumulado_mxn: Math.round(ahorroAnual1 * anio * (1 + inflacion / 200))
  }));

  const payload = {
    cliente_id: window.currentDimensionamiento.cliente_id,
    dimensionamiento_id: window.currentDimensionamiento.dimensionamiento_id,
    segmento: fd.get('segmento'),
    esquema_contraprestacion: window.currentValidacion.esquema_recomendado,
    ahorro_anual_1_mxn: ahorroAnual1,
    payback_anios_estimado: Math.round(costoEquipo / ahorroAnual1),
    vida_util_anios: 25,
    supuesto_inflacion_energetica_pct: inflacion,
    detalle,
    roi
  };

  const cot = await apiPost('crear_cotizacion', payload);
  await renderCotizacionImprimible(cot.cotizacion_id);
  irAPestana('cotizacion-print');
  return cot;
}

/* ---------- 6. Render dinámico del PDF imprimible ---------- */
async function renderCotizacionImprimible(cotizacionId) {
  const full = await apiGet('cotizacion_completa', { id: cotizacionId });
  const target = document.querySelector('#print-target');
  if (!target || !full) return;

  const nombreCliente = full.cliente.nombre_completo || full.cliente.razon_social;

  target.querySelector('.meta').innerHTML = `
    <strong>Cotización No.</strong> ${full.cotizacion.cotizacion_id}<br>
    <strong>Fecha:</strong> ${full.cotizacion.fecha_emision}<br>
    <strong>Vigencia:</strong> ${full.cotizacion.vigencia_dias} días`;

  target.querySelector('#datos-cliente').innerHTML = `
    <tr><td><strong>Cliente:</strong></td><td>${nombreCliente}</td><td><strong>Segmento:</strong></td><td>${full.cotizacion.segmento}</td></tr>
    <tr><td><strong>Tarifa CFE:</strong></td><td>${full.diagnostico.tarifa_cfe}</td><td><strong>Consumo prom.:</strong></td><td>${full.diagnostico.consumo_promedio_mensual_kwh} kWh/mes</td></tr>
    <tr><td><strong>Dirección:</strong></td><td>${full.cliente.direccion || ''}</td><td><strong>Tensión:</strong></td><td>${full.diagnostico.tension_suministro}</td></tr>`;

  target.querySelector('#detalle-costos').innerHTML = full.detalle.map(d =>
    `<tr><td>${d.concepto}</td><td>$${Number(d.monto_mxn).toLocaleString('es-MX')}</td></tr>`).join('');

  target.querySelector('.totals').innerHTML = `
    <tr><td>Subtotal</td><td>$${Number(full.cotizacion.subtotal_mxn).toLocaleString('es-MX')}</td></tr>
    <tr><td>IVA (${full.cotizacion.iva_pct}%)</td><td>$${Number(full.cotizacion.iva_mxn).toLocaleString('es-MX')}</td></tr>
    <tr class="grand"><td>TOTAL</td><td>$${Number(full.cotizacion.total_mxn).toLocaleString('es-MX')} MXN</td></tr>`;

  target.querySelector('#roi-tabla').innerHTML = full.roi.map(r =>
    `<tr><td>${r.anio}</td><td>$${Number(r.ahorro_anual_mxn).toLocaleString('es-MX')}</td><td>$${Number(r.ahorro_acumulado_mxn).toLocaleString('es-MX')}</td></tr>`).join('');

  target.querySelector('#esquema-recomendado').textContent = full.cotizacion.esquema_contraprestacion;
}

function imprimirCotizacion() {
  window.print();
}

/* ---------- 7. Utilidades de navegación / render pipeline ---------- */
function irAPestana(tabId) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('main > section').forEach(s => s.classList.remove('active'));
  const btn = document.querySelector(`[data-tab="${tabId}"]`);
  if (btn) btn.classList.add('active');
  const sec = document.getElementById(tabId);
  if (sec) sec.classList.add('active');
}

function renderPipeline(pipelineRows) {
  const tbody = document.querySelector('#pipeline-tbody');
  if (!tbody) return;
  tbody.innerHTML = pipelineRows.map(p => `
    <tr>
      <td>${p.cliente_id}</td>
      <td>${p.etapa}</td>
      <td>${p.proxima_accion}</td>
      <td>${p.fecha_proxima_accion}</td>
      <td>${p.probabilidad_cierre_pct}%</td>
    </tr>`).join('');
}

function renderResumenKPIs(cotizaciones, pipeline) {
  const totalCot = cotizaciones.length;
  const kwTotal = cotizaciones.reduce((s, c) => s + Number(c.subtotal_mxn || 0), 0);
  const ticketProm = totalCot ? Math.round(kwTotal / totalCot) : 0;
  const cerradas = pipeline.filter(p => /cerrad|ganad/i.test(p.etapa)).length;
  const tasaCierre = totalCot ? Math.round((cerradas / totalCot) * 100) : 0;

  const kpis = document.querySelectorAll('.kpi p');
  if (kpis[0]) kpis[0].textContent = pipeline.length;
  if (kpis[1]) kpis[1].textContent = totalCot;
  if (kpis[2]) kpis[2].textContent = '$' + ticketProm.toLocaleString('es-MX');
  if (kpis[3]) kpis[3].textContent = tasaCierre + '%';
}

document.addEventListener('DOMContentLoaded', initDashboard);
