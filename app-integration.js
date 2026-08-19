/**
 * LATROY ENERGY · Sincronización CRM <-> Google Apps Script
 * v3 · Backend como fuente de verdad + autosync multi-equipo
 */
(function () {
  'use strict';

  var URL_STORAGE_KEY = 'latroy-web-app-url';
  var DEFAULT_WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbwW2TnBcK1s8St2nzbFurTLVx_SQmzEdw4PQBMcFYVDuK-cvoBSuw_kj62cNyRiGXgm/exec';
  var AUTO_SYNC_INTERVAL_MS = 15000;
  var FOCUS_SYNC_MIN_AGE_MS = 4000;
  var storedUrl = localStorage.getItem(URL_STORAGE_KEY) || '';
  var configuredUrl = normalizeUrl(window.LATROY_WEB_APP_URL || reusableStoredUrl(storedUrl) || DEFAULT_WEB_APP_URL);
  var syncingPromise = null;
  var mutationQueue = Promise.resolve();
  var lastDatasetSignature = '';
  var lastSyncAt = 0;
  var autoSyncTimer = null;

  function reusableStoredUrl(value) {
    try {
      var parsed = new URL(normalizeUrl(value));
      var isAppsScript = /script\.google\.com$/i.test(parsed.hostname) && /\/exec$/i.test(parsed.pathname);
      var currentIsLocal = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(window.location.hostname);
      var savedIsLocal = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(parsed.hostname);
      return isAppsScript || (currentIsLocal && savedIsLocal) ? parsed.href.replace(/\/+$/, '') : '';
    } catch (_) {
      return '';
    }
  }

  function normalizeUrl(value) {
    return String(value || '').trim().replace(/\/+$/, '');
  }

  function validateUrl(value) {
    var normalized = normalizeUrl(value);
    if (!normalized || /PEGA_AQUI|TU_URL|WEB_APP_URL/i.test(normalized)) {
      throw new Error('Configure la URL publicada de Apps Script que termina en /exec.');
    }
    var parsed;
    try { parsed = new URL(normalized); }
    catch (_) { throw new Error('La URL del backend no es válida.'); }
    var isLocal = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(parsed.hostname);
    if (parsed.protocol !== 'https:' && !(isLocal && parsed.protocol === 'http:')) {
      throw new Error('La URL del backend debe usar HTTPS.');
    }
    if (/script\.google\.com$/i.test(parsed.hostname) && !/\/exec$/i.test(parsed.pathname)) {
      throw new Error('Use la URL de la implementación terminada en /exec, no la URL del editor ni /dev.');
    }
    return normalized;
  }

  function emitStatus(state, message) {
    document.dispatchEvent(new CustomEvent('latroy:backend-status', {
      detail: { state: state, message: message || '', url: configuredUrl, lastSyncAt: lastSyncAt }
    }));
  }

  function responsePreview(text) {
    return String(text || '').replace(/\s+/g, ' ').trim().slice(0, 180);
  }

  async function parseResponse(response) {
    var text = await response.text();
    var contentType = response.headers.get('content-type') || '';
    var json;
    try { json = JSON.parse(text); }
    catch (_) {
      var preview = responsePreview(text);
      var looksHtml = /text\/html/i.test(contentType) || /^\s*</.test(text) || /The page|<!doctype/i.test(text);
      var reason = looksHtml
        ? 'El backend respondió HTML en lugar de JSON. Verifique que la URL sea la implementación /exec vigente.'
        : 'El backend respondió texto que no es JSON.';
      throw new Error(reason + (preview ? ' Respuesta: “' + preview + '”.' : ''));
    }
    if (!response.ok) throw new Error((json && (json.error || json.message)) || ('Error HTTP ' + response.status + '.'));
    if (!json || typeof json !== 'object') throw new Error('El backend no devolvió un objeto JSON válido.');
    if (json.ok === false) throw new Error(json.error || json.message || 'El backend rechazó la operación.');
    return Object.prototype.hasOwnProperty.call(json, 'data') ? json.data : json;
  }

  async function request(action, options) {
    options = options || {};
    var baseUrl = validateUrl(options.url || configuredUrl);
    var method = options.method || 'GET';
    var fetchOptions = { method: method, redirect: 'follow', cache: 'no-store' };
    var targetUrl = baseUrl;
    if (method === 'GET') {
      var params = Object.assign({ action: action, _ts: Date.now() }, options.params || {});
      var query = new URLSearchParams(params);
      targetUrl += (targetUrl.indexOf('?') >= 0 ? '&' : '?') + query.toString();
    } else {
      fetchOptions.headers = { 'Content-Type': 'text/plain;charset=utf-8' };
      fetchOptions.body = JSON.stringify({ action: action, data: options.data || {} });
    }
    var response;
    try { response = await fetch(targetUrl, fetchOptions); }
    catch (error) {
      throw new Error('No fue posible contactar el backend. Revise conexión e implementación de Apps Script. ' + error.message);
    }
    return parseResponse(response);
  }

  function apiGet(action, params, url) { return request(action, { method: 'GET', params: params || {}, url: url }); }
  function apiPost(action, data) { return request(action, { method: 'POST', data: data || {} }); }

  async function loadCompleteDataset(url) {
    // Code.gs v3 incluye todos los módulos en una sola lectura para minimizar cuota y latencia.
    var all = await apiGet('all', {}, url);
    // Compatibilidad con un backend anterior que no incluyera Ingeniería dentro de all.
    if (!Array.isArray(all && all.diagnosticos) || !Array.isArray(all && all.dimensionamientos) || !Array.isArray(all && all.validaciones)) {
      var extra = await Promise.all([
        apiGet('diagnostico', {}, url),
        apiGet('dimensionamiento', {}, url),
        apiGet('validacion', {}, url)
      ]);
      all = Object.assign({}, all || {}, {
        diagnosticos: Array.isArray(extra[0]) ? extra[0] : [],
        dimensionamientos: Array.isArray(extra[1]) ? extra[1] : [],
        validaciones: Array.isArray(extra[2]) ? extra[2] : []
      });
    }
    return all || {};
  }

  function datasetSignature(data) {
    try { return JSON.stringify(data); }
    catch (_) { return String(Date.now()); }
  }

  async function test(url) {
    var testUrl = validateUrl(url || configuredUrl);
    emitStatus('connecting', 'Probando conexión…');
    try {
      var data = await loadCompleteDataset(testUrl);
      emitStatus('online', 'Conexión correcta.');
      return data;
    } catch (error) {
      emitStatus('error', error.message);
      throw error;
    }
  }

  async function sync(options) {
    options = options || {};
    if (syncingPromise) return syncingPromise;
    syncingPromise = (async function () {
      if (!options.silent) emitStatus('connecting', 'Sincronizando…');
      try {
        var data = await loadCompleteDataset();
        var signature = datasetSignature(data);
        var changed = signature !== lastDatasetSignature;
        lastSyncAt = Date.now();
        if (changed || options.forceDispatch || !lastDatasetSignature) {
          lastDatasetSignature = signature;
          document.dispatchEvent(new CustomEvent('latroy:backend-data', {
            detail: data || {}
          }));
        }
        emitStatus('online', changed ? 'Datos actualizados.' : 'Conectado.');
        return data;
      } catch (error) {
        emitStatus('error', error.message);
        throw error;
      } finally {
        syncingPromise = null;
      }
    })();
    return syncingPromise;
  }

  async function syncAfterMutation() {
    if (syncingPromise) {
      try { await syncingPromise; } catch (_) {}
    }
    return sync({ silent: true, forceDispatch: true });
  }

  function queueMutation(work) {
    var run = mutationQueue.then(work, work);
    mutationQueue = run.catch(function () {});
    return run;
  }

  async function persistAndRefresh(action, payload, savedEventName, localId, successMessage) {
    return queueMutation(async function () {
      emitStatus('connecting', 'Guardando cambios…');
      var remote = await apiPost(action, payload);
      document.dispatchEvent(new CustomEvent(savedEventName, {
        detail: { localId: localId, remote: remote || {}, action: action }
      }));
      await syncAfterMutation();
      emitStatus('online', successMessage || 'Cambio guardado y sincronizado.');
      return remote;
    });
  }

  function configure(url) {
    configuredUrl = validateUrl(url);
    localStorage.setItem(URL_STORAGE_KEY, configuredUrl);
    window.LATROY_WEB_APP_URL = configuredUrl;
    lastDatasetSignature = '';
    emitStatus('connecting', 'Configuración guardada.');
    return configuredUrl;
  }

  function isConfigured() {
    try { validateUrl(configuredUrl); return true; }
    catch (_) { return false; }
  }

  function clientPayload(client) {
    return {
      cliente_id: client.backendId || '',
      nombre_completo: client.name || '',
      razon_social: client.businessName || '',
      segmento: client.segment || 'Comercial',
      rfc: client.rfc || '',
      estado_comercial: client.status || 'Activo',
      contacto_principal: client.contact || '',
      telefono: client.phone || '',
      email: client.email || '',
      direccion: client.address || '',
      municipio: client.municipality || '',
      estado: client.stateName || '',
      cp: client.postalCode || '',
      vendedor_asignado: client.seller || 'Alonso Villalobos',
      notas: client.notes || ''
    };
  }

  function diagnosticPayload(record) {
    return {
      diagnostico_id: record.backendId || '',
      cliente_id: record.backendClientId || record.clientId || '',
      numero_servicio_rmu: record.serviceNumber || '',
      tarifa_cfe: record.tariff || '',
      tension_suministro: record.supplyVoltage || '',
      consumo_kwh_periodo: Number(record.periodConsumption || 0),
      periodo_facturacion: record.billingPeriod || 'Mensual',
      fecha_recibo: record.receiptDate || '',
      archivo_recibo_url: record.receiptUrl || '',
      validado_por: record.validatedBy || 'Alonso Villalobos',
      estatus: record.status || 'Pendiente'
    };
  }

  function dimensioningPayload(record) {
    return {
      dimensionamiento_id: record.backendId || '',
      cliente_id: record.backendClientId || record.clientId || '',
      diagnostico_id: record.backendDiagnosticId || record.diagnosticId || '',
      irradiancia_kwh_m2_dia: Number(record.irradiance || 0),
      perdidas_sistema_pct: Number(record.systemLosses || 0),
      factor_simultaneidad: Number(record.simultaneity || 0),
      consumo_promedio_mensual_kwh: Number(record.averageMonthlyConsumption || 0),
      panel_id: record.panelId || '',
      inversor_id: record.inverterId || '',
      cantidad_inversores: Number(record.inverterCount || 1),
      calculado_por: record.calculatedBy || 'Alonso Villalobos'
    };
  }

  function validationPayload(record) {
    return {
      validacion_id: record.backendId || '',
      cliente_id: record.backendClientId || record.clientId || '',
      dimensionamiento_id: record.backendDimensioningId || record.dimensioningId || '',
      capacidad_instalada_kw: Number(record.installedCapacity || 0),
      instalador_certificado_nombre: record.installerName || 'Por asignar',
      instalador_certificado_no_cert: record.installerCertification || '',
      esquema_recomendado: record.recommendedScheme || 'Net Metering',
      estatus_tramite_cfe: record.cfeStatus || 'Pendiente de envio'
    };
  }

  function quotePayload(quote) {
    var products = Array.isArray(quote.products) ? quote.products : [];
    var detail = products.map(function (line) {
      var quantity = Number(line.quantity || 0);
      var unitPrice = Number(line.unitPrice || 0);
      var discountPct = Number(line.discountPct || 0);
      var amount = Number(line.amount);
      if (!Number.isFinite(amount)) amount = quantity * unitPrice * (1 - discountPct / 100);
      var internalUnitCost = Number(line.internalUnitCost || 0);
      var internalCost = Number(line.internalCost);
      if (!Number.isFinite(internalCost)) internalCost = quantity * internalUnitCost;
      var grossProfit = amount - internalCost;
      return {
        concepto: line.concept || line.description || 'Producto o servicio',
        tipo: line.type || 'Equipo',
        cantidad: quantity,
        unidad: line.unit || 'pza',
        precio_unitario_mxn: unitPrice,
        descuento_pct: discountPct,
        monto_mxn: Math.round(amount * 100) / 100,
        costo_unitario_interno_mxn: Math.round(internalUnitCost * 100) / 100,
        costo_total_interno_mxn: Math.round(internalCost * 100) / 100,
        utilidad_bruta_mxn: Math.round(grossProfit * 100) / 100,
        margen_bruto_pct: amount ? Math.round((grossProfit / amount * 100) * 100) / 100 : 0,
        catalogo_tipo: line.catalogType || '',
        catalogo_id: line.catalogId || ''
      };
    });
    if (!detail.length && Number(quote.subtotal || quote.amount)) {
      detail.push({ concepto: 'Propuesta económica', tipo: 'Servicio', cantidad: 1, unidad: 'lote', precio_unitario_mxn: Number(quote.subtotal || quote.amount), descuento_pct: 0, monto_mxn: Number(quote.subtotal || quote.amount) });
    }
    var roi = Array.isArray(quote.roi) ? quote.roi.map(function (row) {
      return {
        anio: Number(row.year || row.anio || 0),
        ahorro_anual_mxn: Number(row.annualSavings || row.ahorro_anual_mxn || 0),
        ahorro_acumulado_mxn: Number(row.accumulatedSavings || row.ahorro_acumulado_mxn || 0)
      };
    }) : [];
    return {
      cotizacion_id: quote.backendId || quote.folio || '',
      cliente_id: quote.backendClientId || quote.clientId || '',
      dimensionamiento_id: quote.backendDimensioningId || quote.dimensioningId || '',
      fecha_emision: quote.date || '',
      segmento: quote.segment || 'Comercial',
      vendedor: quote.seller || 'Alonso Villalobos',
      estatus: quote.status || 'Enviada',
      vigencia_dias: Number(quote.validity || 15),
      iva_pct: Number(quote.iva || 16),
      esquema_contraprestacion: quote.scheme || 'Net Metering',
      ahorro_anual_1_mxn: Number(quote.annualSavings || 0),
      payback_anios_estimado: Number(quote.payback || 0),
      vida_util_anios: Number(quote.usefulLife || 25),
      supuesto_inflacion_energetica_pct: Number(quote.energyInflation || 5),
      objetivo_alcance: quote.objective || '',
      notas_tecnicas: quote.notes || '',
      condiciones_pago: quote.payment || '',
      garantias: quote.warranty || '',
      detalle: detail,
      roi: roi
    };
  }

  function projectPayload(project) {
    return {
      pipeline_id: project.backendId || '',
      cliente_id: project.backendClientId || project.clientId || '',
      cotizacion_id: project.backendQuoteId || project.quoteId || '',
      etapa: project.stage || 'Prospecto',
      valor_mxn: Number(project.value || 0),
      proxima_accion: project.next || '',
      fecha_proxima_accion: project.date || '',
      responsable: project.owner || '',
      probabilidad_cierre_pct: Number(project.probability || 0)
    };
  }

  function salePayload(record) {
    return {
      venta_id: record.backendId || '',
      cliente_id: record.backendClientId || record.clientId || '',
      pipeline_id: record.backendProjectId || record.projectId || '',
      cotizacion_id: record.backendQuoteId || record.quoteId || '',
      importe_mxn: Number(record.amount || 0),
      costo_directo_mxn: Number(record.directCost || 0),
      costos_adicionales_mxn: Number(record.extraCost || 0),
      comisiones_mxn: Number(record.commission || 0),
      viaticos_mxn: Number(record.travel || 0),
      otros_gastos_mxn: Number(record.otherExpenses || 0),
      costo_real_mxn: Number(record.realCost || 0),
      utilidad_bruta_mxn: Number(record.grossProfit || 0),
      utilidad_neta_mxn: Number(record.netProfit || 0),
      margen_neto_pct: Number(record.netMargin || 0),
      vendedor: record.seller || '',
      instalador: record.installer || '',
      segmento: record.segment || '',
      categoria: record.category || '',
      fecha_cierre: record.date || '',
      fecha_entrega: record.deliveryDate || '',
      estatus: record.status || 'Contrato firmado',
      forma_pago: record.payment || 'Transferencia'
    };
  }

  function taskPayload(record) {
    return {
      seguimiento_id: record.backendId || '',
      titulo: record.title || '',
      cliente_id: record.backendClientId || record.clientId || '',
      fecha_vencimiento: record.due || '',
      prioridad: record.priority || 'Normal',
      responsable: record.owner || '',
      completada: record.done ? 'Si' : 'No'
    };
  }

  function cfePayload(record) {
    var map = {
      clientId:'cliente_id', dimensioningId:'dimensionamiento_id', validationId:'validacion_id', projectId:'pipeline_id',
      applicantType:'tipo_solicitante', applicantName:'solicitante_nombre', applicantIdentification:'solicitante_identificacion', applicantRfc:'solicitante_rfc', applicantStreet:'solicitante_calle', applicantExt:'solicitante_num_ext', applicantInt:'solicitante_num_int', applicantNeighborhood:'solicitante_colonia', applicantMunicipality:'solicitante_municipio', applicantState:'solicitante_estado', applicantPostalCode:'solicitante_cp', applicantPhone:'solicitante_telefono', applicantEmail:'solicitante_email', applicantFax:'solicitante_fax',
      contactName:'contacto_nombre', contactRole:'contacto_puesto', contactStreet:'contacto_calle', contactExt:'contacto_num_ext', contactInt:'contacto_num_int', contactNeighborhood:'contacto_colonia', contactMunicipality:'contacto_municipio', contactState:'contacto_estado', contactPostalCode:'contacto_cp', contactPhone:'contacto_telefono', contactEmail:'contacto_email', contactFax:'contacto_fax',
      requestDate:'solicitud_fecha', requestNumber:'solicitud_numero', requestModality:'modalidad_solicitud', energyUse:'utilizacion_energia', rpu:'rpu', rmu:'rmu', accountNumber:'numero_cuenta', supplyLevel:'nivel_tension_suministro', tariff:'tarifa', supplyVoltage:'voltaje_suministro', phases:'fases', wires:'hilos', meterNumber:'numero_medidor', meterType:'tipo_medidor', totalLoadKva:'carga_total_instalada_kva', contractedDemandKw:'demanda_contratada_kw',
      operationDate:'fecha_operacion_estimada', installedCapacityKw:'capacidad_instalada_kw', capacityIncreaseKw:'capacidad_incrementar_kw', monthlyGenerationKwh:'generacion_promedio_mensual_kwh', generationTechnology:'tecnologia_generacion', otherTechnology:'tecnologia_otro', generationUnits:'numero_unidades_generacion', primaryFuel:'combustible_principal', secondaryFuel:'combustible_secundario',
      latitude:'latitud', longitude:'longitud', utmZone:'utm_zona', utmHemisphere:'utm_hemisferio', manifestCompliance:'manifiesto_cumplimiento', signatureName:'firma_nombre', signatureRole:'firma_cargo', signatureDate:'firma_fecha',
      cfeRepresentative:'cfe_apoderado_nombre', cfeConventionalAddress:'cfe_domicilio_convencional', supplyContractWith:'suministrador_contrato', sameInterconnectionSupply:'adquiere_suministro_mismo_punto', interconnectionVoltage:'tension_interconexion_v', centralClassification:'clasificacion_central', compensationScheme:'regimen_contraprestacion',
      representativeName:'representante_nombre', representativeRole:'representante_cargo', representativeIdentification:'representante_identificacion', representativeAuthority:'representante_acredita',
      moralDeedNumber:'persona_moral_escritura_no', moralDeedDate:'persona_moral_escritura_fecha', moralNotaryName:'persona_moral_notario_nombre', moralNotaryNumber:'persona_moral_notario_no', moralCityState:'persona_moral_ciudad_estado',
      cfeDeedNumber:'cfe_escritura_no', cfeDeedDate:'cfe_escritura_fecha', cfeNotaryName:'cfe_notario_nombre', cfeNotaryNumber:'cfe_notario_no', cfeCityState:'cfe_ciudad_estado', signingCity:'ciudad_firma', signingDate:'fecha_firma', representativeAddress:'representante_domicilio', powerDate:'carta_poder_fecha', witness1Name:'testigo1_nombre', witness2Name:'testigo2_nombre', notes:'observaciones'
    };
    var out = { interconexion_id: record.backendId || '' };
    Object.keys(map).forEach(function (key) {
      if (record[key] !== undefined) out[map[key]] = record[key];
    });
    for (var i = 1; i <= 6; i++) {
      out['utm_x' + i] = record['utmX' + i] || '';
      out['utm_y' + i] = record['utmY' + i] || '';
    }
    out.documentos = (Array.isArray(record.documents) ? record.documents : []).map(function (doc) {
      return {
        documento_id: doc.backendId || doc.id || '',
        tipo_documento: doc.type || '',
        nombre_documento: doc.label || '',
        estatus: doc.status || 'Pendiente',
        url: doc.url || '',
        fecha_documento: doc.date || '',
        observaciones: doc.notes || ''
      };
    });
    return out;
  }


  function panelCatalogPayload(record) {
    return {
      panel_id: record.backendId || '',
      marca: record.marca || '',
      modelo: record.modelo || '',
      potencia_wp: Number(record.potencia_wp || 0),
      eficiencia_pct: Number(record.efficiency || record.eficiencia_pct || 0),
      certificacion: record.certificacion || '',
      garantia_anios: Number(record.garantia_anios || 0),
      costo_unitario_mxn: Number(record.precio_venta_mxn || record.costo_unitario_mxn || 0),
      precio_venta_mxn: Number(record.precio_venta_mxn || record.costo_unitario_mxn || 0),
      costo_proveedor_mxn: Number(record.costo_proveedor_mxn || 0),
      proveedor: record.proveedor || '',
      iva_pct: Number(record.iva_pct === undefined ? 16 : record.iva_pct),
      ficha_tecnica_url: record.ficha_tecnica_url || '',
      activo: record.activo || 'Si'
    };
  }

  function inverterCatalogPayload(record) {
    return {
      inversor_id: record.backendId || '',
      marca: record.marca || '',
      modelo: record.modelo || '',
      capacidad_kw: Number(record.capacidad_kw || 0),
      tipo: record.tipo || '',
      certificacion: record.certificacion || '',
      garantia_anios: Number(record.garantia_anios || 0),
      costo_unitario_mxn: Number(record.precio_venta_mxn || record.costo_unitario_mxn || 0),
      precio_venta_mxn: Number(record.precio_venta_mxn || record.costo_unitario_mxn || 0),
      costo_proveedor_mxn: Number(record.costo_proveedor_mxn || 0),
      proveedor: record.proveedor || '',
      iva_pct: Number(record.iva_pct === undefined ? 16 : record.iva_pct),
      ficha_tecnica_url: record.ficha_tecnica_url || '',
      activo: record.activo || 'Si'
    };
  }

  function serviceCatalogPayload(record) {
    return {
      servicio_id: record.backendId || '',
      categoria: record.categoria || 'Servicio',
      nombre: record.nombre || '',
      descripcion: record.descripcion || '',
      unidad: record.unidad || 'servicio',
      precio_unitario_mxn: Number(record.precio_unitario_mxn || 0),
      costo_interno_mxn: Number(record.costo_interno_mxn || 0),
      proveedor: record.proveedor || '',
      iva_pct: Number(record.iva_pct === undefined ? 16 : record.iva_pct),
      activo: record.activo || 'Si'
    };
  }

  function handleSavedEvent(eventName, createAction, updateAction, payloadBuilder, successLabel) {
    document.addEventListener(eventName, function (event) {
      var record = event.detail || {};
      if (!isConfigured()) return;
      var isUpdate = Boolean(record.backendId);
      var payload = payloadBuilder(record);
      var action = isUpdate ? updateAction : createAction;
      persistAndRefresh(action, payload, eventName.replace('-saved', '-backend-saved'), record.id, successLabel)
        .catch(function (error) {
          emitStatus('error', 'No se pudo guardar el cambio en el backend: ' + error.message);
          console.error('Error ' + action + ':', error);
        });
    });
  }

  window.LatroyBackend = {
    configure: configure,
    getUrl: function () { return configuredUrl; },
    isConfigured: isConfigured,
    request: request,
    get: apiGet,
    post: apiPost,
    test: test,
    sync: sync,
    getLastSyncAt: function () { return lastSyncAt; }
  };

  window.apiGet = apiGet;
  window.apiPost = apiPost;
  window.initDashboard = sync;

  document.addEventListener('latroy:sync-requested', function () {
    if (!isConfigured()) {
      emitStatus('unconfigured', 'Configure la URL /exec del backend.');
      return;
    }
    sync({ forceDispatch: true }).catch(function (error) { console.error('Error sincronizando CRM:', error); });
  });

  handleSavedEvent('latroy:client-saved', 'crear_cliente', 'actualizar_cliente', clientPayload, 'Cliente guardado y sincronizado.');
  handleSavedEvent('latroy:diagnostic-saved', 'crear_diagnostico', 'actualizar_diagnostico', diagnosticPayload, 'Diagnóstico guardado y sincronizado.');
  handleSavedEvent('latroy:dimensioning-saved', 'crear_dimensionamiento', 'actualizar_dimensionamiento', dimensioningPayload, 'Dimensionamiento guardado y sincronizado.');
  handleSavedEvent('latroy:validation-saved', 'crear_validacion', 'actualizar_validacion', validationPayload, 'Validación guardada y sincronizada.');
  handleSavedEvent('latroy:quote-saved', 'crear_cotizacion', 'actualizar_cotizacion', quotePayload, 'Cotización guardada y sincronizada.');
  handleSavedEvent('latroy:catalog-panel-saved', 'crear_panel_catalogo', 'actualizar_panel_catalogo', panelCatalogPayload, 'Panel guardado y sincronizado.');
  handleSavedEvent('latroy:catalog-inverter-saved', 'crear_inversor_catalogo', 'actualizar_inversor_catalogo', inverterCatalogPayload, 'Inversor guardado y sincronizado.');
  handleSavedEvent('latroy:catalog-service-saved', 'crear_servicio_catalogo', 'actualizar_servicio_catalogo', serviceCatalogPayload, 'Servicio guardado y sincronizado.');

  document.addEventListener('latroy:project-saved', function (event) {
    var record = event.detail || {};
    if (!isConfigured()) return;
    persistAndRefresh('guardar_pipeline', projectPayload(record), 'latroy:project-backend-saved', record.id, 'Pipeline guardado y sincronizado.')
      .catch(function (error) { emitStatus('error', 'No se pudo guardar el pipeline: ' + error.message); });
  });

  handleSavedEvent('latroy:sale-saved', 'crear_venta', 'actualizar_venta', salePayload, 'Venta guardada y sincronizada.');
  handleSavedEvent('latroy:task-saved', 'crear_tarea', 'actualizar_tarea', taskPayload, 'Seguimiento guardado y sincronizado.');

  document.addEventListener('latroy:cfe-saved', function (event) {
    var record = event.detail || {};
    if (!isConfigured()) return;
    persistAndRefresh('guardar_interconexion_cfe', cfePayload(record), 'latroy:cfe-backend-saved', record.id, 'Expediente CFE guardado y sincronizado.')
      .catch(function (error) { emitStatus('error', 'No se pudo guardar el expediente CFE: ' + error.message); });
  });

  document.addEventListener('latroy:remote-delete', function (event) {
    var detail = event.detail || {};
    if (!isConfigured() || !detail.backendId) return;
    var action = detail.type === 'project' ? 'eliminar_pipeline' : detail.type === 'sale' ? 'eliminar_venta' : detail.type === 'task' ? 'eliminar_tarea' : detail.type === 'cfe' ? 'eliminar_interconexion_cfe' : '';
    var field = detail.type === 'project' ? 'pipeline_id' : detail.type === 'sale' ? 'venta_id' : detail.type === 'task' ? 'seguimiento_id' : detail.type === 'cfe' ? 'interconexion_id' : '';
    if (!action || !field) return;
    var payload = {}; payload[field] = detail.backendId;
    persistAndRefresh(action, payload, 'latroy:remote-deleted', detail.localId, 'Registro eliminado y sincronizado.')
      .catch(function (error) { emitStatus('error', 'No se pudo eliminar en el backend: ' + error.message); });
  });

  function maybeSyncOnReturn() {
    if (!isConfigured() || document.visibilityState === 'hidden') return;
    if (Date.now() - lastSyncAt < FOCUS_SYNC_MIN_AGE_MS) return;
    sync({ silent: true }).catch(function () {});
  }

  function startAutoSync() {
    if (autoSyncTimer) clearInterval(autoSyncTimer);
    autoSyncTimer = setInterval(function () {
      if (!isConfigured() || document.visibilityState === 'hidden' || !navigator.onLine) return;
      sync({ silent: true }).catch(function () {});
    }, AUTO_SYNC_INTERVAL_MS);
  }

  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') maybeSyncOnReturn();
  });
  window.addEventListener('focus', maybeSyncOnReturn);
  window.addEventListener('online', function () {
    if (isConfigured()) sync({ silent: true, forceDispatch: true }).catch(function () {});
  });

  document.addEventListener('DOMContentLoaded', function () {
    startAutoSync();
    if (!isConfigured()) {
      emitStatus('unconfigured', 'Configure la URL /exec del backend.');
      return;
    }
    sync({ forceDispatch: true }).catch(function (error) { console.error('Error cargando backend:', error); });
  });
})();
