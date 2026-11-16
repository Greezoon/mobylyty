/* MOBYLYTY : cœur de l'appli (API, mémoire, navigation, composants communs). Configuration : config.js */
'use strict';

// Compatibilité avec les anciens navigateurs (Safari 13 et antérieurs)
if (!Element.prototype.replaceChildren) {
  Element.prototype.replaceChildren = function () {
    while (this.firstChild) this.removeChild(this.firstChild);
    for (let i = 0; i < arguments.length; i++) this.append(arguments[i]);
  };
}

const TOKEN_KEY = 'mobylyty_token';
const FRESH_MS = 30000; // une donnée vue il y a moins de 30 s n'est pas redemandée
const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const CATEGORY_ICONS = {
  'voiture': '🚗', 'moto': '🏍️', 'bateau': '🚤', 'remorque': '🚛',
  'ulm___paramoteur': '🪂', '3_axes': '🛩️', 'pendulaire': '🪂', 'parapente': '🪂',
  'ski___snow': '🎿', 'vélo': '🚲', 'trottinette': '🛴', 'agricole': '🚜',
  'engin_de_chantier': '🚧', 'traction_animale': '🐴', 'roller': '🛼',
  'flotteur_de_loisir': '🛟', 'foil': '🏄', 'véhicule_amphibie': '🚙', 'autre': '🚙'
};
const HISTORY_ICONS = {
  purchase: '🔑', fuel: '⛽', maintenance: '🔧', control: '📋', repair: '🛠️', expense: '🧾',
  project: '🏁', document: '📄', photo: '📷', outing: '🛣️', other: '✔️'
};
const UNIT_SHORT = { km: 'km', miles: 'miles', hours: 'h' };

const state = { user: null, lists: {}, schemas: {}, people: [], ai: { ready: false }, navDepth: 0 };

// ===== Préférences d'affichage (enregistrées sur l'appareil) =====
function getPref(name, fallback) { try { return localStorage.getItem('mobylyty_' + name) || fallback; } catch (e) { return fallback; } }
function setPref(name, value) {
  try { localStorage.setItem('mobylyty_' + name, value); } catch (e) { /* stockage indisponible */ }
  applyPrefs();
  const prefs = {};
  prefs[name] = value;
  // Suivies d'un appareil à l'autre : enregistrées aussi sur le compte de la personne
  if (state.user) api('prefs.save', { prefs: prefs }).catch(function () { /* l'appareil garde son réglage */ });
}
function applyPrefs() {
  const root = document.documentElement;
  const theme = getPref('theme', 'auto');
  if (theme === 'auto') root.removeAttribute('data-theme'); else root.setAttribute('data-theme', theme);
  root.setAttribute('data-size', getPref('size', 'normal'));
}
applyPrefs();

// ===== API (POST en texte brut : le jeton ne passe jamais dans l'adresse) =====
async function api(action, payload) {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(Object.assign({ action: action, token: localStorage.getItem(TOKEN_KEY) }, payload || {}))
  });
  return res.json();
}

// ===== Mémoire : ce qui a déjà été vu s'affiche tout de suite =====
const store = {};
function cached(key) { return store[key] ? store[key].value : undefined; }
function put(key, value) { store[key] = { value: value, at: Date.now() }; return value; }
function isFresh(key) { return !!store[key] && Date.now() - store[key].at < FRESH_MS; }
function forget(test) { Object.keys(store).forEach(function (k) { if (test(k)) delete store[k]; }); }
/** Marque comme « à redemander » (l'ancienne version reste affichée le temps du rechargement). */
function stale(test) { Object.keys(store).forEach(function (k) { if (test(k)) store[k].at = 0; }); }
function forgetVehicle(id) { stale(function (k) { return k === 'dash' || k === 'list' || k.slice(-id.length - 1) === ':' + id; }); }

/**
 * Affiche la version en mémoire, puis la redemande au serveur si elle a plus de 30 s.
 * opts : loading(), error(message, hadData), stillHere()
 */
async function load(key, fetcher, render, opts) {
  opts = opts || {};
  const has = cached(key) !== undefined;
  if (has) render(cached(key), false);
  else if (opts.loading) opts.loading();
  if (has && isFresh(key)) return;
  try {
    const res = await fetcher();
    if (!res.ok) {
      if (res.code === 'AUTH') return showLogin(res.error);
      if (opts.error) opts.error(res.error, has);
      return;
    }
    const changed = !has || JSON.stringify(cached(key)) !== JSON.stringify(res.data);
    put(key, res.data);
    if (changed && (!opts.stillHere || opts.stillHere())) render(res.data, true);
  } catch (err) {
    if (opts.error) opts.error('Connexion impossible. Vérifie ta connexion internet puis réessaie.', has);
  }
}

/** Appel d'écriture : renvoie les données, ou affiche l'erreur et renvoie null. */
async function send(action, payload, onError) {
  try {
    const res = await api(action, payload);
    if (res.ok) return res.data;
    if (res.code === 'AUTH') { showLogin(res.error); return null; }
    onError(res.error);
  } catch (err) {
    onError('Connexion impossible. Vérifie ta connexion internet puis réessaie.');
  }
  return null;
}

// ===== Outils d'affichage =====
function $(id) { return document.getElementById(id); }

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = text;
  return node;
}

function button(label, className, onClick) {
  const b = el('button', className, label);
  b.type = 'button';
  if (onClick) b.addEventListener('click', onClick);
  return b;
}

const ICON_BACK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>';
function backLink(label, onClick) {
  const b = button('', 'back-link', onClick);
  b.innerHTML = ICON_BACK;
  b.appendChild(document.createTextNode(label));
  return b;
}

function isEmpty(v) { return v === null || v === undefined || v === ''; }

function fmtNum(n, decimals) {
  return Number(n).toLocaleString('fr-FR', { maximumFractionDigits: decimals === undefined ? 2 : decimals });
}
function fmtMoney(n) {
  if (isEmpty(n)) return null;
  const whole = Math.round(Number(n) * 100) % 100 === 0;
  return Number(n).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 });
}
function fmtCounter(value, unit) {
  if (isEmpty(value)) return null;
  return fmtNum(value, 1) + ' ' + (UNIT_SHORT[unit] || unit || 'km');
}
function fmtDate(iso) {
  if (!iso) return null;
  const p = String(iso).slice(0, 10).split('-');
  return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : String(iso);
}
function fmtDateLong(iso) {
  if (!iso) return '';
  const p = String(iso).slice(0, 10).split('-').map(Number);
  return new Date(p[0], p[1] - 1, p[2]).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
}
function todayIso() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function parseNum(text) {
  const s = String(text === null || text === undefined ? '' : text).replace(/\s/g, '').replace(',', '.');
  return s === '' ? null : Number(s);
}
function labelOf(group, key) {
  if (isEmpty(key)) return null;
  const item = (state.lists[group] || []).find(function (i) { return i.key === String(key); });
  return item ? item.label : String(key);
}
function iconOf(category) { return CATEGORY_ICONS[String(category || '').toLowerCase()] || '🚙'; }
function describe(v) { return [v.make, v.model, v.version].filter(Boolean).join(' ') + (v.year ? ', ' + v.year : ''); }

// ===== Navigation (le bouton retour du téléphone fonctionne) =====
const ROUTE_HANDLERS = {};
function addRoute(name, handler) { ROUTE_HANDLERS[name] = handler; }

function link() {
  return '#/' + Array.prototype.slice.call(arguments)
    .filter(function (p) { return !isEmpty(p); })
    .map(encodeURIComponent).join('/');
}
function routeParts() {
  return location.hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
}
function go(hash) { state.navDepth++; location.hash = hash; }
function replaceRoute(hash) {
  history.replaceState(null, '', location.pathname + location.search + hash);
  route();
}
function goBack(fallback) {
  if (state.navDepth > 0) { state.navDepth--; history.back(); }
  else replaceRoute(fallback || '#/');
}
function route() {
  if (!state.user) return;
  if (state.currentHash !== location.hash) { state.prevHash = state.currentHash; state.currentHash = location.hash; }
  closeLayer();
  const parts = routeParts();
  const handler = ROUTE_HANDLERS[parts[0] || ''] || ROUTE_HANDLERS[''];
  handler(parts.slice(1));
}

/** Prépare une nouvelle page dans la zone principale. nav : 'home' ou 'garage'. */
function mountView(nav) {
  const container = $('view');
  const view = el('div', 'view');
  if (!REDUCED_MOTION) view.classList.add('enter');
  container.replaceChildren(view);
  window.scrollTo(0, 0);
  document.querySelectorAll('.navlink').forEach(function (a) { a.classList.toggle('active', a.dataset.nav === nav); });
  return view;
}

// ===== Composants =====

/** Compteur à tambours. opts : pad (nb de chiffres minimum), unit, animate, lastDrum (dernier tambour clair) */
function odometer(value, opts) {
  opts = opts || {};
  const wrap = el('span', 'odometer');
  wrap.setAttribute('role', 'img');
  const n = Math.max(0, Math.round(Number(value) || 0));
  const digits = String(n).padStart(opts.pad || 1, '0').split('');
  wrap.setAttribute('aria-label', fmtNum(n, 0) + (opts.unit ? ' ' + opts.unit : ''));
  const strips = [];
  digits.forEach(function (d, i) {
    const drum = el('span', 'drum' + (opts.lastDrum && i === digits.length - 1 ? ' last' : ''));
    const strip = el('span', 'strip');
    for (let k = 0; k <= 9; k++) strip.appendChild(el('span', null, String(k)));
    strip.style.setProperty('--d', opts.animate && !REDUCED_MOTION ? '0' : d);
    drum.appendChild(strip);
    wrap.appendChild(drum);
    strips.push({ strip: strip, d: d, i: i });
  });
  if (opts.unit) wrap.appendChild(el('span', 'odo-unit', opts.unit));
  if (opts.animate && !REDUCED_MOTION) {
    wrap.classList.add('rolling');
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        strips.forEach(function (s) {
          s.strip.style.transitionDelay = (strips.length - 1 - s.i) * 70 + 'ms';
          s.strip.style.setProperty('--d', s.d);
        });
      });
    });
  }
  return wrap;
}

/** Plaque : noire pour l'ancien format (3012 SJ 45), blanche à bandes bleues pour AB-123-CD. */
function plate(registration) {
  const reg = String(registration || '').trim();
  if (!reg) return el('span', 'plate none', 'Non immatriculé');
  const siv = /^[A-Z]{2}[- ]?\d{3}[- ]?[A-Z]{2}$/i.test(reg);
  const p = el('span', 'plate ' + (siv ? 'siv' : 'old'));
  p.appendChild(el('span', 'txt', reg.toUpperCase()));
  return p;
}

function gauge(progress, alert) {
  const g = el('div', 'gauge ' + (alert || ''));
  const i = el('i');
  const pct = Math.round(Math.max(0, Math.min(1, progress || 0)) * 100);
  i.style.setProperty('--p', REDUCED_MOTION ? pct + '%' : '0%');
  g.appendChild(i);
  if (!REDUCED_MOTION) requestAnimationFrame(function () { requestAnimationFrame(function () { i.style.setProperty('--p', pct + '%'); }); });
  return g;
}

function skeleton(count) {
  const s = el('div', 'skeleton');
  for (let i = 0; i < (count || 3); i++) s.appendChild(el('i'));
  return s;
}

function emptyState(text, actionLabel, onAction) {
  const box = el('div', 'empty');
  box.appendChild(el('div', null, text));
  if (actionLabel) box.appendChild(button(actionLabel, 'btn btn-primary btn-small', onAction));
  return box;
}

function errorBox(text) { return el('div', 'error-box', text); }

/** Carnet : lignes « libellé ........ valeur ». rows = [[libellé, valeur], ...] */
function logbook(title, rows) {
  const box = el('section', 'logbook');
  if (title) box.appendChild(el('h3', null, title));
  const dl = el('dl');
  rows.forEach(function (r) {
    const row = el('div', 'lb-row');
    row.appendChild(el('dt', null, r[0]));
    row.appendChild(el('span', 'dots'));
    const empty = isEmpty(r[1]);
    row.appendChild(el('dd', empty ? 'lb-empty' : null, empty ? 'Non renseigné' : r[1]));
    dl.appendChild(row);
  });
  box.appendChild(dl);
  return box;
}

let toastTimer = null;
function toast(text) {
  const t = $('toast');
  t.textContent = text;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () { t.classList.remove('show'); }, 2600);
}

// Panneaux et boîtes de dialogue (une seule couche à la fois)
let layerClose = null;
function closeLayer() { if (layerClose) layerClose(); }

/** Panneau montant du bas. build(sheet, close) remplit le panneau. */
function openSheet(build) {
  closeLayer();
  const layer = $('layer');
  const overlay = el('div', 'overlay');
  const sheet = el('div', 'sheet');
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');
  sheet.appendChild(el('div', 'sheet-grip'));
  let closed = false;
  function close() {
    if (closed) return;
    closed = true;
    layerClose = null;
    document.removeEventListener('keydown', onKey);
    if (REDUCED_MOTION) return layer.replaceChildren();
    sheet.classList.add('closing');
    overlay.classList.add('closing');
    setTimeout(function () { if (layer.contains(sheet)) layer.replaceChildren(); }, 200);
  }
  function onKey(e) { if (e.key === 'Escape') close(); }
  overlay.addEventListener('click', close);
  document.addEventListener('keydown', onKey);
  layer.replaceChildren(overlay, sheet);
  layerClose = close;
  build(sheet, close);
  const first = sheet.querySelector('input, select, textarea, button');
  if (first) first.focus({ preventScroll: true });
  return close;
}

/** Confirmation. Renvoie une promesse : true si l'action est confirmée. */
function confirmDialog(title, text, confirmLabel) {
  return new Promise(function (resolve) {
    closeLayer();
    const layer = $('layer');
    const overlay = el('div', 'overlay');
    const box = el('div', 'dialog');
    box.setAttribute('role', 'alertdialog');
    box.setAttribute('aria-modal', 'true');
    box.appendChild(el('h2', null, title));
    box.appendChild(el('p', null, text));
    const actions = el('div', 'form-actions');
    function done(value) {
      layerClose = null;
      document.removeEventListener('keydown', onKey);
      layer.replaceChildren();
      resolve(value);
    }
    function onKey(e) { if (e.key === 'Escape') done(false); }
    actions.appendChild(button('Annuler', 'btn btn-ghost', function () { done(false); }));
    actions.appendChild(button(confirmLabel || 'Supprimer', 'btn btn-danger', function () { done(true); }));
    box.appendChild(actions);
    overlay.addEventListener('click', function () { done(false); });
    document.addEventListener('keydown', onKey);
    layer.replaceChildren(overlay, box);
    layerClose = function () { done(false); };
    actions.firstChild.focus();
  });
}

// ===== Formulaires générés à partir d'une description de champs =====

/**
 * fields : [{ section: 'Titre' } | { name, label, kind, required, default, group, exclude, options,
 *            showIf, help, helpBy, placeholder, topic, readonly, virtual, from, defaultToday }]
 * values : valeurs existantes (modification) ; opts : { isCreate, hiddenTopics, refOptions }
 */
function buildForm(fields, values, opts) {
  opts = opts || {};
  values = values || {};
  const hidden = opts.hiddenTopics || [];
  const form = el(opts.asPart ? 'div' : 'form', 'form');
  if (!opts.asPart) form.noValidate = true;
  const controls = {};
  let box = null;

  function current() {
    const out = {};
    Object.keys(controls).forEach(function (name) {
      const c = controls[name];
      out[name] = c.kind === 'bool' ? c.input.checked : c.input.value;
    });
    return out;
  }

  function refresh() {
    const vals = current();
    Object.keys(controls).forEach(function (name) {
      const c = controls[name];
      const f = c.field;
      const shown = (!f.showIf || f.showIf.values.indexOf(String(vals[f.showIf.field])) !== -1) && (!f.showWhen || !!f.showWhen());
      c.wrap.classList.toggle('hidden', !shown);
      if (f.helpBy && c.help) {
        const key = f.showIf ? vals[f.showIf.field] : null;
        c.help.textContent = f.helpBy[key] || f.help || '';
      }
    });
  }

  fields.forEach(function (f) {
    if (f.section) {
      box = el('div', 'fieldset');
      box.appendChild(el('h3', null, f.section));
      form.appendChild(box);
      return;
    }
    if (f.readonly || f.kind === 'mixed') return;
    if (f.topic && hidden.indexOf(f.topic) !== -1) return;
    if (f.createOnly && !opts.isCreate) return;
    if (!box) { box = el('div', 'fieldset'); form.appendChild(box); }

    let value = values[f.from || f.name];
    if (opts.isCreate && isEmpty(value)) value = f.defaultToday ? todayIso() : f.default;
    if (f.kind === 'date' && value) value = String(value).slice(0, 10);

    let input;
    let wrap;
    if (f.kind === 'bool') {
      wrap = el('label', 'switch');
      wrap.appendChild(el('span', null, f.label));
      input = el('input');
      input.type = 'checkbox';
      input.checked = value === undefined ? true : !(value === false || String(value).toUpperCase() === 'FALSE');
      wrap.appendChild(input);
    } else {
      wrap = el('label', 'field');
      const lab = el('span', null, f.label);
      if (f.required) lab.appendChild(el('b', 'req', ' *'));
      wrap.appendChild(lab);
      if (f.kind === 'longtext') {
        input = el('textarea');
      } else if (f.kind === 'choice' || f.kind === 'static' || f.kind === 'ref') {
        input = el('select');
        const options = f.kind === 'choice'
          ? (state.lists[f.group] || []).filter(function (i) { return !f.exclude || f.exclude.indexOf(i.key) === -1; }).map(function (i) { return [i.key, i.label]; })
          : (f.kind === 'static' ? f.options : ((opts.refOptions || {})[f.name] || []));
        if ((!f.required || f.kind === 'ref') && !f.noEmpty) input.appendChild(new Option(f.kind === 'ref' ? 'Aucun' : '—', ''));
        options.forEach(function (o) { input.appendChild(new Option(o[1], o[0])); });
      } else {
        input = el('input');
        if (f.kind === 'date') input.type = 'date';
        else if (f.kind === 'number') input.inputMode = 'decimal';
        else if (f.kind === 'integer') input.inputMode = 'numeric';
        else if (f.kind === 'url') { input.type = 'url'; input.inputMode = 'url'; input.autocapitalize = 'none'; }
        if (f.max && (f.kind === 'text')) input.maxLength = f.max;
        input.autocomplete = 'off';
      }
      if (f.placeholder) input.placeholder = f.placeholder;
      if (!isEmpty(value)) input.value = (f.kind === 'number' && typeof value === 'number') ? String(value).replace('.', ',') : value;
      wrap.appendChild(input);
    }
    input.name = f.name;
    let help = null;
    if (f.help || f.helpBy) {
      help = el('p', 'help', f.help || '');
      wrap.appendChild(help);
    }
    box.appendChild(wrap);
    controls[f.name] = { field: f, input: input, wrap: wrap, help: help, kind: f.kind };
    input.addEventListener('change', refresh);
    input.addEventListener('input', function () { if (opts.onInput) opts.onInput(current()); });
  });

  const message = el('p', 'form-message');
  message.setAttribute('role', 'alert');
  form.appendChild(message);
  refresh();

  return {
    node: form,
    controls: controls,
    refresh: refresh,
    message: function (text) { message.textContent = text || ''; },
    /** Valeurs des champs affichés ; null (avec message) si un champ obligatoire est vide. */
    read: function () {
      const out = {};
      const vals = current();
      const names = Object.keys(controls);
      for (let i = 0; i < names.length; i++) {
        const c = controls[names[i]];
        if (c.wrap.classList.contains('hidden')) continue;
        const v = c.kind === 'bool' ? vals[names[i]] : String(vals[names[i]]).trim();
        if (c.field.required && v === '') {
          message.textContent = c.field.label + ' : champ obligatoire.';
          c.input.focus();
          return null;
        }
        out[names[i]] = v;
      }
      message.textContent = '';
      return out;
    },
    busy: function (on) { form.querySelectorAll('input, select, textarea, button').forEach(function (x) { x.disabled = on; }); }
  };
}

/** Boutons Annuler / Enregistrer en bas d'un formulaire. */
function formActions(saveLabel, onCancel) {
  const actions = el('div', 'form-actions');
  actions.appendChild(button('Annuler', 'btn btn-ghost', onCancel));
  const save = el('button', 'btn btn-primary', saveLabel);
  save.type = 'submit';
  actions.appendChild(save);
  return actions;
}

// ===== Session =====
function setVersion(v) {
  document.querySelectorAll('.js-version').forEach(function (n) { n.textContent = v ? 'Version ' + v : ''; });
}

function showScreen(id) {
  ['screenLoading', 'screenLogin', 'screenApp'].forEach(function (s) { $(s).classList.toggle('hidden', s !== id); });
}

function enterApp(data) {
  state.user = data.user;
  state.lists = data.lists || {};
  state.schemas = data.schemas || {};
  state.people = data.people || [];
  state.ai = data.ai || { ready: false };
  Object.keys(data.prefs || {}).forEach(function (k) { try { localStorage.setItem('mobylyty_' + k, data.prefs[k]); } catch (e) { /* stockage indisponible */ } });
  applyPrefs();
  forget(function () { return true; });
  put('list', { vehicles: data.vehicles || [] });
  if (data.dashboard) put('dash', data.dashboard);
  state.version = data.version;
  setVersion(data.version);
  $('userBtn').textContent = String(state.user.name || '?').charAt(0).toUpperCase();
  showScreen('screenApp');
  route();
}

async function bootstrap() {
  try {
    const res = await api('bootstrap');
    if (res.ok) return enterApp(res.data);
    showLogin(res.code === 'AUTH' ? '' : res.error);
  } catch (err) {
    showLogin('Connexion impossible. Vérifie ta connexion internet puis réessaie.');
  }
}

let gisReady = false;
let wantButton = false;
function onGisLoad() {
  google.accounts.id.initialize({ client_id: CLIENT_ID, callback: onGoogleCredential });
  gisReady = true;
  if (wantButton) renderGoogleButton();
}
function renderGoogleButton() {
  wantButton = true;
  if (!gisReady) return;
  google.accounts.id.renderButton($('googleBtn'), { theme: 'filled_black', size: 'large', text: 'signin_with', shape: 'pill', locale: 'fr' });
}

function showLogin(message) {
  state.user = null;
  forget(function () { return true; });
  if (typeof clearThumbStore === 'function') clearThumbStore();
  closeLayer();
  localStorage.removeItem(TOKEN_KEY);
  if (location.hash) history.replaceState(null, '', location.pathname + location.search);
  showScreen('screenLogin');
  renderGoogleButton();
  $('loginMessage').textContent = message || '';
  fetch(API_URL + '?action=ping').then(function (r) { return r.json(); })
    .then(function (d) { setVersion(d.version); }).catch(function () { setVersion(null); });
}

async function onGoogleCredential(response) {
  showScreen('screenLoading');
  try {
    const res = await api('login', { idToken: response.credential });
    if (!res.ok) return showLogin(res.error);
    localStorage.setItem(TOKEN_KEY, res.data.token);
    bootstrap();
  } catch (err) {
    showLogin('Connexion impossible. Vérifie ta connexion internet puis réessaie.');
  }
}

async function doLogout() {
  closeLayer();
  showScreen('screenLoading');
  try { await api('logout'); } catch (err) { /* la session locale est supprimée quoi qu'il arrive */ }
  if (window.google && google.accounts) google.accounts.id.disableAutoSelect();
  showLogin('');
}

// ===== Démarrage, une fois tous les fichiers chargés =====
function start() {
  $('userBtn').addEventListener('click', function () { go(link('reglages')); });
  $('fab').addEventListener('click', function () { if (typeof openQuickAdd === 'function') openQuickAdd(); });
  window.addEventListener('hashchange', route);
  if (!localStorage.getItem(TOKEN_KEY)) return showLogin('');
  bootstrap();
}
document.addEventListener('DOMContentLoaded', start);
