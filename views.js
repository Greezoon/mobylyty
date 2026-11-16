/* MOBYLYTY : accueil, garage, fiche véhicule, formulaire véhicule, menu « + ». */
'use strict';

// ===== Onglets de la fiche (les modules ajoutent les leurs) =====
const TABS = [];
function addTab(tab) { TABS.push(tab); TABS.sort(function (a, b) { return a.order - b.order; }); }
function topicVisible(v, topic) { return (v.hidden_topics || []).indexOf(topic) === -1; }

// ===== Actions du bouton « + » (les modules ajoutent les leurs) =====
const QUICK_ACTIONS = [];
function addQuickAction(action) { QUICK_ACTIONS.push(action); QUICK_ACTIONS.sort(function (a, b) { return a.order - b.order; }); }

function vehiclesInCache() { return (cached('list') || { vehicles: [] }).vehicles; }
function vehicleFromCache(id) {
  const full = cached('veh:' + id);
  if (full) return full.vehicle;
  return vehiclesInCache().find(function (v) { return v.vehicle_id === id; }) || null;
}
function activeVehicles() { return vehiclesInCache().filter(function (v) { return !v.status || v.status === 'active'; }); }

// ===== Accueil =====
addRoute('', function () {
  const view = mountView('home');
  const hello = el('h1', 'hello', 'Bonjour ' + (state.user.name || ''));
  view.appendChild(hello);
  const body = el('div');
  view.appendChild(body);
  let first = true;

  load('dash', function () { return api('dashboard'); }, function (d) {
    body.replaceChildren();
    renderDashboard(body, d, first);
    first = false;
  }, {
    loading: function () { body.replaceChildren(skeleton(3)); },
    error: function (msg, had) { if (!had) body.replaceChildren(errorBox(msg)); },
    stillHere: function () { return view.isConnected; }
  });
});

function renderDashboard(body, d, animate) {
  const s = d.stats;
  if (s.year_fuel !== null || s.year_expenses !== null) {
    const hero = el('section', 'hero');
    hero.appendChild(el('p', 'hero-label', 'Dépensé en ' + d.year));
    const total = (s.year_fuel || 0) + (s.year_expenses || 0);
    hero.appendChild(odometer(total, { pad: 4, unit: '€', animate: animate }));
    const split = el('div', 'hero-split');
    if (s.year_fuel !== null) {
      const f = el('span', null, 'Carburant ');
      f.appendChild(el('b', null, fmtMoney(s.year_fuel)));
      split.appendChild(f);
    }
    if (s.year_expenses !== null) {
      const e = el('span', null, 'Entretien et achats ');
      e.appendChild(el('b', null, fmtMoney(s.year_expenses)));
      split.appendChild(e);
    }
    hero.appendChild(split);
    body.appendChild(hero);
  }

  const facts = el('div', 'facts');
  facts.appendChild(el('span', 'fact', s.vehicles + (s.vehicles > 1 ? ' véhicules' : ' véhicule')));
  if (s.open_tasks) facts.appendChild(el('span', 'fact', s.open_tasks + (s.open_tasks > 1 ? ' tâches ouvertes' : ' tâche ouverte')));
  body.appendChild(facts);

  const title = el('h2', 'block-title', 'À prévoir');
  body.appendChild(title);
  if (!d.alerts.length) {
    const ok = el('div', 'all-good');
    ok.appendChild(el('span', 'check', '✓'));
    ok.appendChild(el('span', null, 'Rien à prévoir pour le moment : tout est à jour.'));
    body.appendChild(ok);
  } else {
    const tags = el('div', 'tags');
    d.alerts.forEach(function (a) {
      const tag = button('', 'tag ' + a.alert, function () {
        go(link('v', a.vehicle_id, a.kind === 'task' ? 'taches' : 'entretien'));
      });
      tag.appendChild(el('span', 'tag-icon', a.kind === 'task' ? '📝' : '🔧'));
      const txt = el('span');
      txt.appendChild(el('span', 'tag-title', a.title));
      const meta = el('span', 'tag-meta');
      meta.appendChild(el('span', 'due', a.due_label || (a.alert === 'overdue' ? 'En retard' : 'Bientôt')));
      meta.appendChild(document.createTextNode(', ' + a.vehicle_name));
      txt.appendChild(el('br'));
      txt.appendChild(meta);
      tag.appendChild(txt);
      tags.appendChild(tag);
    });
    body.appendChild(tags);
  }

  if (d.recent.length) {
    body.appendChild(el('h2', 'block-title', 'Dernières entrées'));
    body.appendChild(timeline(d.recent, true));
  }
}

/** Frise d'événements. withVehicle : afficher le nom du véhicule. */
function timeline(events, withVehicle, unit) {
  const ul = el('ul', 'timeline');
  events.forEach(function (e) {
    const li = el('li', 'tl');
    li.appendChild(el('span', 'tl-dot', HISTORY_ICONS[e.type] || '•'));
    li.appendChild(el('span', 'tl-title', e.title));
    li.appendChild(el('span', 'tl-amount', isEmpty(e.amount) ? '' : fmtMoney(e.amount)));
    const sub = [fmtDateLong(e.date)];
    if (withVehicle && e.vehicle_name) sub.push(e.vehicle_name);
    if (!isEmpty(e.counter)) sub.push(fmtCounter(e.counter, unit));
    if (e.description) sub.push(e.description);
    li.appendChild(el('span', 'tl-sub', sub.join(', ')));
    if (withVehicle) {
      li.style.cursor = 'pointer';
      li.addEventListener('click', function () { go(link('v', e.vehicle_id, 'historique')); });
    }
    ul.appendChild(li);
  });
  return ul;
}

// ===== Garage =====
addRoute('garage', function () {
  const view = mountView('garage');
  const head = el('div', 'title-row');
  head.appendChild(el('h1', 'page-title', 'Garage'));
  head.appendChild(button('Ajouter un véhicule', 'btn btn-primary btn-small', function () { go(link('nouveau-vehicule')); }));
  view.appendChild(head);
  const list = el('div');
  view.appendChild(list);

  load('list', function () { return api('vehicles.list'); }, function (data) {
    renderGarage(list, data.vehicles);
  }, {
    loading: function () { list.replaceChildren(skeleton(3)); },
    error: function (msg, had) { if (!had) list.replaceChildren(errorBox(msg)); },
    stillHere: function () { return view.isConnected; }
  });
});

function renderGarage(list, vehicles) {
  list.replaceChildren();
  if (!vehicles.length) {
    list.appendChild(emptyState('Ton garage est vide. Ajoute ton premier véhicule.', 'Ajouter un véhicule', function () { go(link('nouveau-vehicule')); }));
    return;
  }
  const grid = el('div', 'garage');
  vehicles.forEach(function (v) {
    const card = button('', 'car', function () { go(link('v', v.vehicle_id)); });
    card.appendChild(vehicleIcon(v));
    card.appendChild(el('span', 'car-name', v.name || v.vehicle_id));
    card.appendChild(el('span', 'car-desc', describe(v)));
    const foot = el('span', 'car-foot');
    if ('registration' in v) foot.appendChild(plate(v.registration));
    if ('current_counter' in v && !isEmpty(v.current_counter)) {
      foot.appendChild(odometer(v.current_counter, { pad: 6, unit: UNIT_SHORT[v.counter_unit] || 'km' }));
    }
    if (v.status && v.status !== 'active') foot.appendChild(el('span', 'badge', labelOf('vehicle_status', v.status)));
    if (foot.childNodes.length) card.appendChild(foot);
    grid.appendChild(card);
  });
  list.appendChild(grid);
}

// ===== Fiche véhicule =====
addRoute('v', function (parts) {
  const id = parts[0];
  const view = mountView('garage');
  const head = el('div');
  const tabs = el('nav', 'tabs');
  tabs.setAttribute('aria-label', 'Rubriques du véhicule');
  const content = el('div', 'tab-content');
  view.append(head, tabs, content);

  let currentSlug = parts[1] || 'apercu';
  if (state.pendingTab) {
    currentSlug = state.pendingTab;
    state.pendingTab = null;
    history.replaceState(null, '', location.pathname + location.search + link('v', id, currentSlug));
  }
  let firstPaint = true;
  let lastVehicleJson = null;

  function visibleTabs(v) { return TABS.filter(function (t) { return t.visible(v); }); }

  function paintTab(v, slug, animate) {
    const list = visibleTabs(v);
    const tab = list.find(function (t) { return t.slug === slug; }) || list[0];
    currentSlug = tab.slug;
    tabs.querySelectorAll('.tab').forEach(function (b) {
      const on = b.dataset.slug === tab.slug;
      b.classList.toggle('active', on);
      if (on) tabs.scrollLeft = Math.max(0, b.offsetLeft - 16);
    });
    content.replaceChildren();
    content.classList.remove('enter');
    if (animate && !REDUCED_MOTION) { void content.offsetWidth; content.classList.add('enter'); }
    tab.render(content, v);
  }

  function paint(v) {
    const json = JSON.stringify(v);
    if (json === lastVehicleJson) return;
    lastVehicleJson = json;
    renderVehicleHead(head, v, firstPaint);
    tabs.replaceChildren();
    visibleTabs(v).forEach(function (t) {
      const b = button(t.label, 'tab', function () {
        history.replaceState(null, '', location.pathname + location.search + link('v', id, t.slug));
        paintTab(v, t.slug, true);
      });
      b.dataset.slug = t.slug;
      tabs.appendChild(b);
    });
    paintTab(v, currentSlug, false);
    firstPaint = false;
  }

  const base = vehicleFromCache(id);
  if (base) paint(base);
  else head.replaceChildren(skeleton(2));

  load('veh:' + id, function () { return api('vehicles.get', { vehicleId: id }); }, function (data) {
    paint(data.vehicle);
  }, {
    error: function (msg, had) {
      if (!had) { head.replaceChildren(backLink('Garage', function () { goBack(link('garage')); }), errorBox(msg)); tabs.replaceChildren(); content.replaceChildren(); }
    },
    stillHere: function () { return view.isConnected; }
  });
});

function renderVehicleHead(head, v, animate) {
  head.replaceChildren();
  const box = el('section', 'vhead');
  box.appendChild(backLink('Garage', function () { goBack(link('garage')); }));
  const top = el('div', 'vhead-top');
  const avatar = vehicleIcon(v);
  if (v.can_edit) {
    avatar.classList.add('editable');
    avatar.setAttribute('role', 'button');
    avatar.tabIndex = 0;
    avatar.setAttribute('aria-label', 'Changer la photo de profil');
    avatar.addEventListener('click', function () { openProfilePhotoSheet(v); });
    avatar.addEventListener('keydown', function (e) { if (e.key === 'Enter') openProfilePhotoSheet(v); });
  }
  top.appendChild(avatar);
  const names = el('div');
  names.appendChild(el('h1', null, v.name || v.vehicle_id));
  names.appendChild(el('div', 'vhead-desc', describe(v)));
  top.appendChild(names);
  box.appendChild(top);
  if ('registration' in v) {
    const p = el('div', 'vhead-plate');
    p.appendChild(plate(v.registration));
    box.appendChild(p);
  }
  if ('current_counter' in v) {
    const c = el('div', 'vhead-counter');
    const left = el('div');
    if (isEmpty(v.current_counter)) left.appendChild(el('span', null, 'Compteur non renseigné'));
    else {
      left.appendChild(odometer(v.current_counter, { pad: 6, unit: UNIT_SHORT[v.counter_unit] || 'km', animate: animate, lastDrum: true }));
      if (v.counter_reading_date) left.appendChild(el('small', null, 'Relevé du ' + fmtDate(v.counter_reading_date)));
    }
    c.appendChild(left);
    box.appendChild(c);
  }
  const actions = el('div', 'row-actions');
  if (v.can_update_counter && 'current_counter' in v) actions.appendChild(button('Nouveau relevé', 'btn btn-amber btn-small', function () { openCounterSheet(v); }));
  if (v.can_edit) actions.appendChild(button('Modifier', 'btn btn-ghost btn-small', function () { go(link('modifier', v.vehicle_id)); }));
  if (actions.childNodes.length) box.appendChild(actions);
  head.appendChild(box);
}

function openCounterSheet(v) {
  openSheet(function (sheet, close) {
    sheet.appendChild(el('h2', null, 'Nouveau relevé'));
    const f = buildForm([{ name: 'counter', label: 'Compteur (' + (UNIT_SHORT[v.counter_unit] || 'km') + ')', kind: 'number', required: true,
      placeholder: isEmpty(v.current_counter) ? '' : 'Actuel : ' + fmtCounter(v.current_counter, v.counter_unit) }], {}, {});
    f.node.appendChild(formActions('Enregistrer le relevé', close));
    f.node.addEventListener('submit', async function (e) {
      e.preventDefault();
      const values = f.read();
      if (!values) return;
      f.busy(true);
      const data = await send('vehicles.updateCounter', { vehicleId: v.vehicle_id, counter: values.counter }, f.message);
      f.busy(false);
      if (!data) return;
      forgetVehicle(v.vehicle_id);
      put('veh:' + v.vehicle_id, data);
      close();
      toast('Compteur mis à jour');
      route();
    });
    sheet.appendChild(f.node);
  });
}

// Onglet Aperçu
addTab({
  slug: 'apercu', label: 'Aperçu', order: 0,
  visible: function () { return true; },
  render: function (box, v) {
    box.appendChild(logbook('Identité', [
      ['Catégorie', labelOf('vehicle_category', v.category)],
      ['Marque', v.make], ['Modèle', v.model], ['Version', v.version],
      ['Année', isEmpty(v.year) ? null : String(v.year)],
      ['Statut', labelOf('vehicle_status', v.status)]
    ]));
    if ('registration' in v) {
      box.appendChild(logbook('Informations', [
        ['Immatriculation', v.registration], ['N° de série', v.vin_serial],
        ["Date d'achat", fmtDate(v.purchase_date)], ['Propriétaire', v.owner_name]
      ]));
    }
    if ('current_counter' in v) {
      box.appendChild(logbook('Compteur', [
        ['Compteur actuel', fmtCounter(v.current_counter, v.counter_unit)],
        ['Dernier relevé', fmtDate(v.counter_reading_date)],
        ["Compteur à l'achat", fmtCounter(v.purchase_counter, v.counter_unit)]
      ]));
    }
    if ('purchase_price' in v) box.appendChild(logbook('Finances', [["Prix d'achat", fmtMoney(v.purchase_price)]]));
    if (v.hidden_topics && v.hidden_topics.length) {
      box.appendChild(el('p', 'note', 'Certaines informations de ce véhicule ne sont pas partagées avec toi.'));
    }
  }
});

// ===== Formulaire véhicule =====
const VEHICLE_FIELDS = [
  { section: 'Identité' },
  { name: 'name', label: 'Nom', kind: 'text', max: 80, required: true, placeholder: 'Ex. 911 2,4 HC' },
  { name: 'category', label: 'Catégorie', kind: 'choice', group: 'vehicle_category', required: true },
  { name: 'make', label: 'Marque', kind: 'text', max: 60 },
  { name: 'model', label: 'Modèle', kind: 'text', max: 60 },
  { name: 'version', label: 'Version', kind: 'text', max: 60 },
  { name: 'year', label: 'Année', kind: 'integer' },
  { name: 'status', label: 'Statut', kind: 'choice', group: 'vehicle_status', required: true, default: 'active' },
  { section: 'Informations' },
  { name: 'registration', label: 'Immatriculation', kind: 'text', max: 20, placeholder: 'Ex. AB-123-CD' },
  { name: 'vin_serial', label: 'N° de série (VIN)', kind: 'text', max: 40 },
  { name: 'purchase_date', label: "Date d'achat", kind: 'date' },
  { section: 'Compteur' },
  { name: 'counter_unit', label: 'Unité', kind: 'choice', group: 'counter_unit', required: true, default: 'km' },
  { name: 'purchase_counter', label: "Compteur à l'achat", kind: 'number' },
  { name: 'current_counter', label: 'Compteur actuel', kind: 'number', createOnly: true },
  { section: 'Finances' },
  { name: 'purchase_price', label: "Prix d'achat (€)", kind: 'number' }
];

addRoute('nouveau-vehicule', function () { showVehicleForm(null); });
addRoute('modifier', function (parts) { showVehicleForm(parts[0]); });

async function showVehicleForm(id) {
  const view = mountView('garage');
  view.appendChild(backLink(id ? 'Fiche' : 'Garage', function () { goBack(id ? link('v', id) : link('garage')); }));
  view.appendChild(el('h1', 'page-title', id ? 'Modifier le véhicule' : 'Nouveau véhicule'));
  const holder = el('div');
  view.appendChild(holder);

  let v = null;
  if (id) {
    v = cached('veh:' + id) ? cached('veh:' + id).vehicle : null;
    if (!v) {
      holder.appendChild(skeleton(3));
      const data = await send('vehicles.get', { vehicleId: id }, function (m) { holder.replaceChildren(errorBox(m)); });
      if (!data || !view.isConnected) return;
      v = put('veh:' + id, data).vehicle;
    }
    if (!v.can_edit) { holder.replaceChildren(errorBox('Tu ne peux pas modifier ce véhicule.')); return; }
  }

  const ownerOptions = state.people.map(function (p) { return [p.user_id, p.name]; });
  const fields = VEHICLE_FIELDS.slice();
  if (state.user.role === 'admin') {
    fields.splice(8, 0, { name: 'owner_user_id', label: 'Propriétaire', kind: 'ref', noEmpty: true, required: true, default: state.user.user_id });
  }
  const f = buildForm(fields, v || {}, { isCreate: !id, refOptions: { owner_user_id: ownerOptions } });
  f.node.appendChild(formActions(id ? 'Enregistrer' : 'Ajouter le véhicule', function () { goBack(id ? link('v', id) : link('garage')); }));
  f.node.addEventListener('submit', async function (e) {
    e.preventDefault();
    const values = f.read();
    if (!values) return;
    f.busy(true);
    const data = await send(id ? 'vehicles.update' : 'vehicles.create', { vehicleId: id, vehicle: values }, f.message);
    f.busy(false);
    if (!data) return;
    const saved = data.vehicle;
    forgetVehicle(saved.vehicle_id);
    put('veh:' + saved.vehicle_id, data);
    toast(id ? 'Modifications enregistrées' : 'Véhicule ajouté');
    if (id) goBack(link('v', id));
    else replaceRoute(link('v', saved.vehicle_id));
  });
  holder.replaceChildren(f.node);

  if (id) {
    const zone = el('div', 'danger-zone');
    zone.appendChild(button('Supprimer ce véhicule', 'btn btn-danger', async function () {
      const ok = await confirmDialog('Supprimer « ' + v.name + ' » ?', 'Cette action est irréversible. Un véhicule qui a déjà des pleins, dépenses ou un historique ne peut pas être supprimé : passe-le plutôt en statut Archivé ou Vendu.');
      if (!ok) return;
      const data = await send('vehicles.delete', { vehicleId: id }, f.message);
      if (!data) return;
      forgetVehicle(id);
      forget(function (k) { return k.slice(-id.length - 1) === ':' + id; });
      const l = cached('list');
      if (l) l.vehicles = l.vehicles.filter(function (x) { return x.vehicle_id !== id; });
      toast('Véhicule supprimé');
      state.navDepth = 0;
      replaceRoute(link('garage'));
    }));
    view.appendChild(zone);
  }
}

// ===== Menu « + » =====
function contextVehicleId() {
  const parts = routeParts();
  return parts[0] === 'v' ? parts[1] : null;
}

function openQuickAdd() {
  const ctxId = contextVehicleId();
  openSheet(function (sheet, close) {
    sheet.appendChild(el('h2', null, 'Ajouter'));
    const menu = el('div', 'menu');
    QUICK_ACTIONS.forEach(function (a) {
      const candidates = a.needsVehicle ? activeVehicles().filter(a.allowed) : [];
      if (a.needsVehicle && !candidates.length) return;
      const item = button('', 'menu-item', function () {
        if (!a.needsVehicle) { close(); return a.run(ctxId); }
        const inContext = ctxId && candidates.some(function (c) { return c.vehicle_id === ctxId; });
        if (inContext || candidates.length === 1) { close(); return a.run(inContext ? ctxId : candidates[0].vehicle_id); }
        pickVehicle(sheet, candidates, a, close);
      });
      item.appendChild(el('span', 'mi-icon', a.icon));
      const txt = el('span');
      txt.appendChild(el('b', null, a.label));
      if (a.hint) txt.appendChild(el('small', null, a.hint));
      item.appendChild(txt);
      menu.appendChild(item);
    });
    sheet.appendChild(menu);
  });
}

function pickVehicle(sheet, candidates, action, close) {
  sheet.querySelectorAll(':scope > :not(.sheet-grip)').forEach(function (n) { n.remove(); });
  sheet.appendChild(el('h2', null, action.label));
  sheet.appendChild(el('p', 'muted', 'Pour quel véhicule ?'));
  const menu = el('div', 'menu');
  candidates.forEach(function (v) {
    const item = button('', 'menu-item', function () { close(); action.run(v.vehicle_id); });
    item.appendChild(el('span', 'mi-icon', iconOf(v.category)));
    const txt = el('span');
    txt.appendChild(el('b', null, v.name || v.vehicle_id));
    txt.appendChild(el('small', null, describe(v)));
    item.appendChild(txt);
    menu.appendChild(item);
  });
  sheet.appendChild(menu);
}

addQuickAction({
  order: 90, icon: '🚗', label: 'Nouveau véhicule', needsVehicle: false,
  run: function () { go(link('nouveau-vehicule')); }
});
