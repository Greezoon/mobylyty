/* MOBYLYTY : fonctionnement de l'application. La configuration est dans config.js. */
const TOKEN_KEY = 'mobylyty_token';
const ROUTES = { detail: '#vehicule-', edit: '#modifier-', create: '#nouveau-vehicule' };
const CATEGORY_ICONS = {
  'voiture': '🚗', 'moto': '🏍️', 'bateau': '🚤', 'remorque': '🚛',
  'ulm___paramoteur': '🪂', '3_axes': '🛩️', 'pendulaire': '🪂', 'parapente': '🪂',
  'ski___snow': '🎿', 'vélo': '🚲', 'trottinette': '🛴', 'agricole': '🚜',
  'engin_de_chantier': '🚧', 'traction_animale': '🐴', 'roller': '🛼',
  'flotteur_de_loisir': '🛟', 'foil': '🏄', 'véhicule_amphibie': '🚙', 'autre': '🚙'
};
const UNIT_SHORT = { km: 'km', miles: 'miles', hours: 'h' };
const FORM_FIELDS = [
  'name', 'category', 'make', 'model', 'version', 'year', 'status',
  'registration', 'vin_serial', 'purchase_date',
  'counter_unit', 'purchase_counter', 'current_counter', 'purchase_price'
];

let currentUser = null;
let lists = {};
let navDepth = 0;
let editingVehicleId = null;

// ===== API (POST en texte brut : pas de jeton dans l'adresse) =====
async function api(action, payload) {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(Object.assign({ action: action, token: localStorage.getItem(TOKEN_KEY) }, payload || {}))
  });
  return res.json();
}

// ===== Outils =====
function $(id) { return document.getElementById(id); }

function setText(id, text) { $(id).textContent = text || ''; }

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = text;
  return node;
}

function show(view) {
  ['viewLoading', 'viewLogin', 'viewApp'].forEach(function (id) { $(id).classList.toggle('hidden', id !== view); });
}

function showPanel(panel) {
  ['listView', 'detailView', 'formView'].forEach(function (id) { $(id).classList.toggle('hidden', id !== panel); });
  window.scrollTo(0, 0);
}

function labelOf(group, key) {
  if (key === null || key === undefined || key === '') return null;
  const item = (lists[group] || []).find(function (i) { return i.key === String(key); });
  return item ? item.label : String(key);
}

function iconOf(category) { return CATEGORY_ICONS[String(category || '').toLowerCase()] || '🚙'; }

function describe(v) {
  return [v.make, v.model, v.version].filter(Boolean).join(' ') + (v.year ? ' · ' + v.year : '');
}

function formatDate(iso) {
  if (!iso) return null;
  const p = String(iso).slice(0, 10).split('-');
  return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : String(iso);
}

function formatCounter(value, unit) {
  if (value === null || value === undefined || value === '') return null;
  return Number(value).toLocaleString('fr-FR') + ' ' + (UNIT_SHORT[unit] || unit || '');
}

function formatPrice(value) {
  if (value === null || value === undefined || value === '') return null;
  return Number(value).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 });
}

function handleError(res, messageId) {
  if (res.code === 'AUTH') return showLogin(res.error);
  setText(messageId, res.error);
}

// ===== Navigation (le bouton retour du téléphone fonctionne) =====
function go(hash) { navDepth++; location.hash = hash; }

function goBack(fallbackHash) {
  if (navDepth > 0) { navDepth--; history.back(); }
  else location.hash = fallbackHash || '';
}

function replaceRoute(hash) {
  history.replaceState(null, '', location.pathname + location.search + hash);
  route();
}

function route() {
  if (!currentUser) return;
  const h = location.hash;
  if (h === ROUTES.create) return showForm(null);
  if (h.indexOf(ROUTES.edit) === 0) return showForm(decodeURIComponent(h.slice(ROUTES.edit.length)));
  if (h.indexOf(ROUTES.detail) === 0) return showDetail(decodeURIComponent(h.slice(ROUTES.detail.length)));
  showList();
}

// ===== Liste =====
function renderVehicles(vehicles) {
  const list = $('vehicleList');
  list.replaceChildren();
  setText('vehiclesTitle', 'Mes véhicules (' + vehicles.length + ')');
  if (vehicles.length === 0) {
    list.appendChild(el('p', 'empty', 'Aucun véhicule pour le moment. Ajoute ton premier véhicule.'));
    return;
  }
  vehicles.forEach(function (v) {
    const card = el('button', 'vehicle');
    card.type = 'button';
    const top = el('div', 'vehicle-top');
    top.appendChild(el('span', 'vehicle-icon', iconOf(v.category)));
    top.appendChild(el('span', 'vehicle-name', v.name || v.vehicle_id));
    card.appendChild(top);
    card.appendChild(el('div', 'vehicle-desc', describe(v)));

    const chips = el('div', 'chips');
    if ('registration' in v) chips.appendChild(el('span', 'chip', v.registration || 'Non immatriculé'));
    if ('current_counter' in v) chips.appendChild(el('span', 'chip', formatCounter(v.current_counter, v.counter_unit) || 'Compteur non renseigné'));
    if (v.status && v.status !== 'active') chips.appendChild(el('span', 'chip', labelOf('vehicle_status', v.status)));
    if (chips.childNodes.length) card.appendChild(chips);

    card.addEventListener('click', function () { go(ROUTES.detail + encodeURIComponent(v.vehicle_id)); });
    list.appendChild(card);
  });
}

async function showList() {
  showPanel('listView');
  setText('listMessage', '');
  setText('vehiclesTitle', 'Mes véhicules');
  $('vehicleList').replaceChildren(el('p', 'empty', 'Chargement des véhicules…'));
  try {
    const res = await api('vehicles.list');
    if (res.ok) return renderVehicles(res.data.vehicles);
    $('vehicleList').replaceChildren();
    handleError(res, 'listMessage');
  } catch (err) {
    $('vehicleList').replaceChildren();
    setText('listMessage', 'API injoignable : ' + err.message);
  }
}

// ===== Fiche =====
function section(title, rows) {
  const s = el('section', 'section');
  s.appendChild(el('h3', null, title));
  const dl = el('dl');
  rows.forEach(function (r) {
    const row = el('div', 'row');
    row.appendChild(el('dt', null, r[0]));
    const empty = r[1] === null || r[1] === undefined || r[1] === '';
    row.appendChild(el('dd', null, empty ? 'Non renseigné' : r[1]));
    dl.appendChild(row);
  });
  s.appendChild(dl);
  return s;
}

function counterForm(v) {
  const wrap = el('div');
  const form = el('form', 'inline-form');
  const input = el('input');
  input.inputMode = 'decimal';
  input.placeholder = 'Nouveau relevé';
  input.setAttribute('aria-label', 'Nouveau relevé du compteur');
  const btn = el('button', 'btn-primary', 'Enregistrer');
  btn.type = 'submit';
  const msg = el('div', 'message');
  form.appendChild(input);
  form.appendChild(btn);
  wrap.appendChild(form);
  wrap.appendChild(msg);

  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    btn.disabled = true;
    msg.textContent = '';
    try {
      const res = await api('vehicles.updateCounter', { vehicleId: v.vehicle_id, counter: input.value });
      if (res.ok) return renderDetail(res.data.vehicle);
      if (res.code === 'AUTH') return showLogin(res.error);
      msg.textContent = res.error;
    } catch (err) {
      msg.textContent = 'API injoignable : ' + err.message;
    } finally {
      btn.disabled = false;
    }
  });
  return wrap;
}

function renderDetail(v) {
  const box = $('detailContent');
  box.replaceChildren();

  $('editBtn').classList.toggle('hidden', !v.can_edit);
  $('editBtn').onclick = function () { go(ROUTES.edit + encodeURIComponent(v.vehicle_id)); };

  const head = el('div', 'detail-head');
  head.appendChild(el('span', 'detail-icon', iconOf(v.category)));
  head.appendChild(el('h2', 'detail-name', v.name || v.vehicle_id));
  box.appendChild(head);
  box.appendChild(el('p', 'detail-desc', describe(v)));

  box.appendChild(section('Identité', [
    ['Catégorie', labelOf('vehicle_category', v.category)],
    ['Marque', v.make],
    ['Modèle', v.model],
    ['Version', v.version],
    ['Année', v.year],
    ['Statut', labelOf('vehicle_status', v.status)]
  ]));

  if ('registration' in v) {
    box.appendChild(section('Informations', [
      ['Immatriculation', v.registration],
      ['N° de série (VIN)', v.vin_serial],
      ["Date d'achat", formatDate(v.purchase_date)],
      ['Propriétaire', v.owner_name]
    ]));
  }

  if ('current_counter' in v) {
    const counter = section('Compteur', [
      ['Compteur actuel', formatCounter(v.current_counter, v.counter_unit)],
      ['Dernier relevé', formatDate(v.counter_reading_date)],
      ["Compteur à l'achat", formatCounter(v.purchase_counter, v.counter_unit)]
    ]);
    if (v.can_update_counter) counter.appendChild(counterForm(v));
    box.appendChild(counter);
  }

  if ('purchase_price' in v) {
    box.appendChild(section('Finances', [["Prix d'achat", formatPrice(v.purchase_price)]]));
  }

  if (v.hidden_topics && v.hidden_topics.length) {
    box.appendChild(el('p', 'note', 'Certaines informations de ce véhicule ne sont pas partagées avec toi.'));
  }
}

async function showDetail(vehicleId) {
  showPanel('detailView');
  $('editBtn').classList.add('hidden');
  setText('detailMessage', '');
  $('detailContent').replaceChildren(el('p', 'empty', 'Chargement de la fiche…'));
  try {
    const res = await api('vehicles.get', { vehicleId: vehicleId });
    if (res.ok) return renderDetail(res.data.vehicle);
    $('detailContent').replaceChildren();
    handleError(res, 'detailMessage');
  } catch (err) {
    $('detailContent').replaceChildren();
    setText('detailMessage', 'API injoignable : ' + err.message);
  }
}

// ===== Formulaire (création et modification) =====
function fillSelect(select, group, placeholder) {
  select.replaceChildren();
  if (placeholder) select.appendChild(new Option(placeholder, ''));
  (lists[group] || []).forEach(function (i) { select.appendChild(new Option(i.label, i.key)); });
}

function setFormEnabled(enabled) {
  $('vehicleForm').querySelectorAll('input, select, button').forEach(function (x) { x.disabled = !enabled; });
}

async function showForm(vehicleId) {
  showPanel('formView');
  editingVehicleId = vehicleId;
  const form = $('vehicleForm');
  form.reset();
  setText('formMessage', '');
  fillSelect(form.elements['category'], 'vehicle_category', 'Choisir…');
  fillSelect(form.elements['status'], 'vehicle_status', null);
  fillSelect(form.elements['counter_unit'], 'counter_unit', null);
  $('currentCounterField').classList.toggle('hidden', !!vehicleId);

  if (!vehicleId) {
    setText('formTitle', 'Nouveau véhicule');
    form.elements['status'].value = 'active';
    form.elements['counter_unit'].value = 'km';
    setFormEnabled(true);
    return;
  }

  setText('formTitle', 'Modifier le véhicule');
  setFormEnabled(false);
  $('cancelBtn').disabled = false;
  try {
    const res = await api('vehicles.get', { vehicleId: vehicleId });
    if (!res.ok) return handleError(res, 'formMessage');
    const v = res.data.vehicle;
    if (!v.can_edit) return setText('formMessage', 'Tu ne peux pas modifier ce véhicule.');
    FORM_FIELDS.forEach(function (f) {
      if (f === 'current_counter' || !form.elements[f]) return;
      form.elements[f].value = (v[f] === null || v[f] === undefined) ? '' : v[f];
    });
    setFormEnabled(true);
  } catch (err) {
    setText('formMessage', 'API injoignable : ' + err.message);
  }
}

async function submitForm(e) {
  e.preventDefault();
  const form = $('vehicleForm');
  const payload = {};
  FORM_FIELDS.forEach(function (f) {
    if (f === 'current_counter' && editingVehicleId) return;
    if (form.elements[f]) payload[f] = form.elements[f].value.trim();
  });
  if (!payload.name) return setText('formMessage', 'Le nom est obligatoire.');
  if (!payload.category) return setText('formMessage', 'La catégorie est obligatoire.');

  setText('formMessage', '');
  setFormEnabled(false);
  try {
    const action = editingVehicleId ? 'vehicles.update' : 'vehicles.create';
    const res = await api(action, { vehicleId: editingVehicleId, vehicle: payload });
    if (res.ok) {
      if (editingVehicleId) goBack(ROUTES.detail + encodeURIComponent(editingVehicleId));
      else replaceRoute(ROUTES.detail + encodeURIComponent(res.data.vehicle.vehicle_id));
      return;
    }
    handleError(res, 'formMessage');
  } catch (err) {
    setText('formMessage', 'API injoignable : ' + err.message);
  } finally {
    setFormEnabled(true);
  }
}

function cancelForm() {
  goBack(editingVehicleId ? ROUTES.detail + encodeURIComponent(editingVehicleId) : '');
}

// ===== Session =====
async function loadLists() {
  try {
    const res = await api('lists.all');
    if (res.ok) lists = res.data.lists;
  } catch (err) { /* sans les listes, les clés brutes restent affichées */ }
}

async function showApp(user) {
  currentUser = user;
  show('viewApp');
  await loadLists();
  setText('userLabel', user.name + (user.role ? ' · ' + labelOf('user_role', user.role) : ''));
  route();
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
  google.accounts.id.renderButton($('googleBtn'), {
    theme: 'outline', size: 'large', text: 'signin_with', shape: 'pill', locale: 'fr'
  });
}

function showLogin(message) {
  currentUser = null;
  localStorage.removeItem(TOKEN_KEY);
  if (location.hash) history.replaceState(null, '', location.pathname + location.search);
  show('viewLogin');
  renderGoogleButton();
  setText('loginMessage', message);
}

async function onGoogleCredential(response) {
  show('viewLoading');
  try {
    const res = await api('login', { idToken: response.credential });
    if (!res.ok) return showLogin(res.error);
    localStorage.setItem(TOKEN_KEY, res.data.token);
    showApp(res.data.user);
  } catch (err) {
    showLogin('API injoignable : ' + err.message);
  }
}

async function logout() {
  show('viewLoading');
  try { await api('logout'); } catch (err) { /* la session locale est supprimée quoi qu'il arrive */ }
  if (window.google && google.accounts) google.accounts.id.disableAutoSelect();
  showLogin('');
}

// ===== Démarrage =====
async function start() {
  $('logoutBtn').addEventListener('click', logout);
  $('backBtn').addEventListener('click', function () { goBack(''); });
  $('addBtn').addEventListener('click', function () { go(ROUTES.create); });
  $('cancelBtn').addEventListener('click', cancelForm);
  $('vehicleForm').addEventListener('submit', submitForm);
  window.addEventListener('hashchange', route);

  fetch(API_URL + '?action=ping')
    .then(function (r) { return r.json(); })
    .then(function (d) { document.querySelectorAll('.js-version').forEach(function (n) { n.textContent = 'Version ' + d.version; }); })
    .catch(function () { document.querySelectorAll('.js-version').forEach(function (n) { n.textContent = 'API injoignable'; }); });

  if (!localStorage.getItem(TOKEN_KEY)) return showLogin('');
  try {
    const res = await api('me');
    if (res.ok) showApp(res.data.user);
    else showLogin(res.code === 'AUTH' ? '' : res.error);
  } catch (err) {
    showLogin('API injoignable : ' + err.message);
  }
}

start();
