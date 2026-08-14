/**
 * LATROY ENERGY · Adaptador CRM <-> Google Apps Script
 *
 * La URL se configura desde CRM.html y se guarda localmente con la clave
 * `latroy-web-app-url`. También puede definirse antes de cargar este archivo:
 * window.LATROY_WEB_APP_URL = 'https://script.google.com/macros/s/.../exec';
 */
(function () {
  'use strict';

  var URL_STORAGE_KEY = 'latroy-web-app-url';
  var DEFAULT_WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbwW2TnBcK1s8St2nzbFurTLVx_SQmzEdw4PQBMcFYVDuK-cvoBSuw_kj62cNyRiGXgm/exec';
  var storedUrl = localStorage.getItem(URL_STORAGE_KEY) || '';
  var configuredUrl = normalizeUrl(window.LATROY_WEB_APP_URL || reusableStoredUrl(storedUrl) || DEFAULT_WEB_APP_URL);
  var syncingPromise = null;

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
    try {
      parsed = new URL(normalized);
    } catch (_) {
      throw new Error('La URL del backend no es válida.');
    }
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
      detail: { state: state, message: message || '', url: configuredUrl }
    }));
  }

  function responsePreview(text) {
    return String(text || '').replace(/\s+/g, ' ').trim().slice(0, 160);
  }

  async function parseResponse(response) {
    var text = await response.text();
    var contentType = response.headers.get('content-type') || '';
    var json;
    try {
      json = JSON.parse(text);
    } catch (_) {
      var preview = responsePreview(text);
      var looksHtml = /text\/html/i.test(contentType) || /^\s*</.test(text) || /The page|<!doctype/i.test(text);
      var reason = looksHtml
        ? 'El backend respondió una página HTML en lugar de JSON. Verifique la URL /exec, la implementación activa y sus permisos de acceso.'
        : 'El backend respondió texto que no es JSON.';
      throw new Error(reason + (preview ? ' Respuesta: “' + preview + '”.' : ''));
    }
    if (!response.ok) {
      throw new Error((json && (json.error || json.message)) || ('Error HTTP ' + response.status + '.'));
    }
    if (!json || typeof json !== 'object') {
      throw new Error('El backend no devolvió un objeto JSON válido.');
    }
    if (json.ok === false) {
      throw new Error(json.error || json.message || 'El backend rechazó la operación.');
    }
    return Object.prototype.hasOwnProperty.call(json, 'data') ? json.data : json;
  }

  async function request(action, options) {
    options = options || {};
    var baseUrl = validateUrl(options.url || configuredUrl);
    var method = options.method || 'GET';
    var fetchOptions = {
      method: method,
      redirect: 'follow',
      cache: 'no-store'
    };
    var targetUrl = baseUrl;
    if (method === 'GET') {
      var query = new URLSearchParams(Object.assign({ action: action }, options.params || {}));
      targetUrl += (targetUrl.indexOf('?') >= 0 ? '&' : '?') + query.toString();
    } else {
      fetchOptions.headers = { 'Content-Type': 'text/plain;charset=utf-8' };
      fetchOptions.body = JSON.stringify({ action: action, data: options.data || {} });
    }
    var response;
    try {
      response = await fetch(targetUrl, fetchOptions);
    } catch (error) {
      throw new Error('No fue posible contactar el backend. Revise conexión, permisos CORS y la implementación de Apps Script. ' + error.message);
    }
    return parseResponse(response);
  }

  function apiGet(action, params, url) {
    return request(action, { method: 'GET', params: params || {}, url: url });
  }

  function apiPost(action, data) {
    return request(action, { method: 'POST', data: data || {} });
  }

  async function test(url) {
    var testUrl = validateUrl(url || configuredUrl);
    emitStatus('connecting', 'Probando conexión…');
    try {
      var data = await apiGet('all', {}, testUrl);
      emitStatus('online', 'Conexión correcta.');
      return data;
    } catch (error) {
      emitStatus('error', error.message);
      throw error;
    }
  }

  async function sync() {
    if (syncingPromise) return syncingPromise;
    syncingPromise = (async function () {
      emitStatus('connecting', 'Sincronizando…');
      try {
        var data = await apiGet('all');
        document.dispatchEvent(new CustomEvent('latroy:backend-data', { detail: data || {} }));
        emitStatus('online', 'Sincronización completada.');
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

  function configure(url) {
    configuredUrl = validateUrl(url);
    localStorage.setItem(URL_STORAGE_KEY, configuredUrl);
    window.LATROY_WEB_APP_URL = configuredUrl;
    emitStatus('connecting', 'Configuración guardada.');
    return configuredUrl;
  }

  function isConfigured() {
    try {
      validateUrl(configuredUrl);
      return true;
    } catch (_) {
      return false;
    }
  }

  window.LatroyBackend = {
    configure: configure,
    getUrl: function () { return configuredUrl; },
    isConfigured: isConfigured,
    request: request,
    get: apiGet,
    post: apiPost,
    test: test,
    sync: sync
  };

  // Compatibilidad con implementaciones previas.
  window.apiGet = apiGet;
  window.apiPost = apiPost;
  window.initDashboard = sync;

  document.addEventListener('latroy:sync-requested', function () {
    if (!isConfigured()) {
      emitStatus('unconfigured', 'Configure la URL /exec del backend.');
      return;
    }
    sync().catch(function (error) {
      console.error('Error sincronizando CRM:', error);
    });
  });

  document.addEventListener('latroy:client-saved', function (event) {
    var client = event.detail || {};
    if (!isConfigured() || client.backendId) return;
    apiPost('crear_cliente', {
      nombre_completo: client.name || '',
      razon_social: '',
      segmento: client.segment || 'Comercial',
      telefono: client.phone || '',
      email: client.email || '',
      direccion: client.notes || '',
      vendedor_asignado: 'Alonso Villalobos'
    }).then(function (remote) {
      document.dispatchEvent(new CustomEvent('latroy:client-backend-saved', {
        detail: { localId: client.id, remote: remote || {} }
      }));
      emitStatus('online', 'Cliente guardado en el backend.');
    }).catch(function (error) {
      emitStatus('error', 'El cliente quedó guardado localmente, pero no en el backend: ' + error.message);
      console.error('Error guardando cliente en backend:', error);
    });
  });

  document.addEventListener('latroy:quote-saved', function (event) {
    var quote = event.detail || {};
    if (!isConfigured() || quote.backendId || !quote.clientId) return;
    var products = Array.isArray(quote.products) ? quote.products : [];
    var detail = products.map(function (line) {
      var quantity = Number(line.quantity || 0);
      var unitPrice = Number(line.unitPrice || 0);
      var discountPct = Number(line.discountPct || 0);
      var amount = Number(line.amount);
      if (!Number.isFinite(amount)) amount = quantity * unitPrice * (1 - discountPct / 100);
      return {
        concepto: line.concept || line.description || 'Producto o servicio',
        tipo: line.type || 'Equipo',
        monto_mxn: Math.round(amount * 100) / 100
      };
    });
    if (!detail.length && Number(quote.subtotal || quote.amount)) {
      detail.push({ concepto: 'Propuesta económica', tipo: 'Servicio', monto_mxn: Number(quote.subtotal || quote.amount) });
    }
    var roi = Array.isArray(quote.roi) ? quote.roi.map(function (row) {
      return {
        anio: Number(row.year || row.anio || 0),
        ahorro_anual_mxn: Number(row.annualSavings || row.ahorro_anual_mxn || 0),
        ahorro_acumulado_mxn: Number(row.accumulatedSavings || row.ahorro_acumulado_mxn || 0)
      };
    }) : [];
    apiPost('crear_cotizacion', {
      cliente_id: quote.backendClientId || quote.clientId,
      dimensionamiento_id: quote.dimensioningId || '',
      segmento: quote.segment || 'Comercial',
      vigencia_dias: Number(quote.validity || 15),
      iva_pct: Number(quote.iva || 16),
      esquema_contraprestacion: quote.scheme || 'Net Metering',
      ahorro_anual_1_mxn: Number(quote.annualSavings || 0),
      payback_anios_estimado: Number(quote.payback || 0),
      vida_util_anios: Number(quote.usefulLife || 25),
      supuesto_inflacion_energetica_pct: Number(quote.energyInflation || 5),
      detalle: detail,
      roi: roi
    }).then(function (remote) {
      document.dispatchEvent(new CustomEvent('latroy:quote-backend-saved', {
        detail: { localId: quote.id, remote: remote || {} }
      }));
      emitStatus('online', 'Cotización guardada en el backend.');
    }).catch(function (error) {
      emitStatus('error', 'La cotización quedó guardada localmente, pero no en el backend: ' + error.message);
      console.error('Error guardando cotización en backend:', error);
    });
  });

  document.addEventListener('DOMContentLoaded', function () {
    if (!isConfigured()) {
      emitStatus('unconfigured', 'Configure la URL /exec del backend.');
      return;
    }
    sync().catch(function (error) {
      console.error('Error cargando backend:', error);
    });
  });
})();
