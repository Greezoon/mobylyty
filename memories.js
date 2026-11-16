/* MOBYLYTY : balades et souvenirs (sorties, voyages, événements) avec véhicules, participants et photos. */
'use strict';
(function () {
  const TYPE_ICONS = { outing: '🛣️', trip: '🧳', event: '🎪', memory: '📸', other: '📍' };

  function memVehicles() { return activeVehicles().filter(function (v) { return topicVisible(v, 'memories'); }); }
  function rangeLabel(m) {
    if (!m.end_date || m.end_date === m.start_date) return fmtDateLong(m.start_date);
    return fmtDate(m.start_date) + ' au ' + fmtDate(m.end_date);
  }
  function kmLabel(m) {
    if (isEmpty(m.counter_start) || isEmpty(m.counter_end)) return null;
    const unit = m.vehicles[0] ? m.vehicles[0].counter_unit : 'km';
    return fmtNum(m.counter_end - m.counter_start, 1) + ' ' + (UNIT_SHORT[unit] || 'km') + ' parcourus';
  }
  function invalidate() { stale(function (k) { return k.indexOf('mem') === 0 || k === 'dash'; }); forget(function (k) { return k.indexOf('hist:') === 0; }); }

  function memoryCard(m) {
    const card = button('', 'memory', function () { go(link('balade', m.id)); });
    const cover = el('span', 'memory-cover', m.photo_ids.length ? '' : (TYPE_ICONS[m.type] || '📍'));
    if (m.photo_ids.length) paintThumb(cover, m.photo_ids[0]);
    card.appendChild(cover);
    const txt = el('span', 'memory-txt');
    txt.appendChild(el('span', 'item-title', m.title));
    txt.appendChild(el('span', 'item-sub', [rangeLabel(m), m.place].filter(Boolean).join(', ')));
    txt.appendChild(el('span', 'item-sub', [m.vehicles.map(function (v) { return v.name; }).join(' et '), kmLabel(m)].filter(Boolean).join(', ')));
    card.appendChild(txt);
    return card;
  }

  function renderList(body, memories, emptyText) {
    body.replaceChildren();
    if (!memories.length) { body.appendChild(emptyState(emptyText, 'Nouvelle balade', function () { go(link('nouvelle-balade')); })); return; }
    const list = el('div', 'items');
    memories.forEach(function (m) { list.appendChild(memoryCard(m)); });
    body.appendChild(list);
  }

  // ===== Page Balades =====
  addRoute('balades', function () {
    const view = mountView('balades');
    const head = el('div', 'title-row');
    head.appendChild(el('h1', 'page-title', 'Balades'));
    head.appendChild(button('Nouvelle balade', 'btn btn-primary btn-small', function () { go(link('nouvelle-balade')); }));
    view.appendChild(head);
    const body = el('div');
    view.appendChild(body);
    load('mem:all', function () { return api('memories.list'); }, function (d) {
      renderList(body, d.memories, 'Garde la trace de tes sorties, voyages et rassemblements : véhicules, participants, kilomètres et photos.');
    }, {
      loading: function () { body.replaceChildren(skeleton(3)); },
      error: function (msg, had) { if (!had) body.replaceChildren(errorBox(msg)); },
      stillHere: function () { return view.isConnected; }
    });
  });

  // Onglet Balades d'un véhicule
  addTab({
    slug: 'balades', label: 'Balades', order: 55,
    visible: function (v) { return topicVisible(v, 'memories'); },
    render: function (box, v) {
      const bar = el('div', 'toolbar');
      bar.appendChild(el('p', null, 'Sorties et souvenirs'));
      bar.appendChild(button('Nouvelle balade', 'btn btn-primary btn-small', function () { go(link('nouvelle-balade', v.vehicle_id)); }));
      box.appendChild(bar);
      const body = el('div');
      box.appendChild(body);
      load('mem:' + v.vehicle_id, function () { return api('memories.list', { vehicleId: v.vehicle_id }); }, function (d) {
        renderList(body, d.memories, 'Aucune balade avec ce véhicule pour le moment.');
      }, {
        loading: function () { body.replaceChildren(skeleton(2)); },
        error: function (msg, had) { if (!had) body.replaceChildren(errorBox(msg)); },
        stillHere: function () { return body.isConnected; }
      });
    }
  });

  // ===== Détail d'une balade =====
  addRoute('balade', function (parts) {
    const id = parts[0];
    const view = mountView('balades');
    view.appendChild(backLink('Balades', function () { goBack(link('balades')); }));
    const body = el('div');
    view.appendChild(body);
    load('mem:one:' + id, function () { return api('memories.get', { id: id }); }, function (d) {
      renderMemory(body, d.memory);
    }, {
      loading: function () { body.replaceChildren(skeleton(2)); },
      error: function (msg, had) { if (!had) body.replaceChildren(errorBox(msg)); },
      stillHere: function () { return view.isConnected; }
    });
  });

  function chips(items) {
    const box = el('div', 'facts');
    items.forEach(function (c) { box.appendChild(typeof c === 'string' ? el('span', 'fact', c) : c); });
    return box;
  }

  function renderMemory(body, m) {
    body.replaceChildren();
    const head = el('section', 'vhead memory-head');
    head.appendChild(el('div', 'vhead-top')).appendChild(el('span', 'car-icon', TYPE_ICONS[m.type] || '📍'));
    const top = head.firstChild;
    const names = el('div');
    names.appendChild(el('h1', null, m.title));
    names.appendChild(el('div', 'vhead-desc', [labelOf('memory_type', m.type), rangeLabel(m)].filter(Boolean).join(', ')));
    top.appendChild(names);
    const km = kmLabel(m);
    if (m.place || km) head.appendChild(el('p', 'vhead-desc memory-meta', [m.place ? '📍 ' + m.place : '', km].filter(Boolean).join('   ')));
    if (m.can_edit) {
      const actions = el('div', 'row-actions');
      actions.appendChild(button('Modifier', 'btn btn-ghost btn-small', function () { go(link('modifier-balade', m.id)); }));
      head.appendChild(actions);
    }
    body.appendChild(head);

    const info = el('div', 'memory-info');
    info.appendChild(el('h2', 'block-title', 'Véhicules'));
    info.appendChild(chips(m.vehicles.map(function (v) {
      const b = button(iconOf(v.category) + ' ' + v.name, 'fact fact-link', function () { go(link('v', v.vehicle_id)); });
      return b;
    })));
    if (m.participants.length) {
      info.appendChild(el('h2', 'block-title', 'Participants'));
      info.appendChild(chips(m.participants.map(function (p) { return p.name; })));
    }
    if (m.description) {
      info.appendChild(el('h2', 'block-title', 'Récit'));
      info.appendChild(el('p', 'story', m.description));
    }
    body.appendChild(info);

    const photoTitle = el('h2', 'block-title', 'Photos');
    body.appendChild(photoTitle);
    const add = button('Ajouter des photos', 'btn btn-primary btn-small', async function () {
      const files = await pickImages(true);
      if (!files.length) return;
      const n = await uploadPhotos(files, { vehicleIds: m.vehicles.map(function (v) { return v.vehicle_id; }), memoryId: m.id });
      if (n) { invalidate(); toast(n > 1 ? n + ' photos ajoutées' : 'Photo ajoutée'); route(); }
    });
    body.appendChild(el('div', 'toolbar')).appendChild(add);
    const gallery = el('div');
    body.appendChild(gallery);
    if (!m.photo_ids.length) gallery.appendChild(emptyState('Pas encore de photo pour cette balade.'));
    else {
      // Les descriptions et droits de suppression viennent de chaque photo : on les lit via la galerie du premier véhicule
      const items = m.photo_ids.map(function (pid) { return { photo_id: pid, can_delete: m.can_edit, description: '' }; });
      gallery.appendChild(photoGrid(items, {
        remove: m.can_edit ? async function (p) {
          const ok = await confirmDialog('Supprimer cette photo ?', 'Elle sera aussi retirée de ton Drive.');
          if (!ok) return;
          const res = await send('photos.delete', { photoId: p.photo_id }, toast);
          if (!res) return;
          invalidate();
          stale(function (k) { return k.indexOf('photos:') === 0; });
          toast('Photo supprimée');
          route();
        } : null
      }));
    }

    if (m.can_edit) {
      const zone = el('div', 'danger-zone');
      zone.appendChild(button('Supprimer cette balade', 'btn btn-danger', async function () {
        const ok = await confirmDialog('Supprimer « ' + m.title + ' » ?', 'Cette action est irréversible. Les photos de la balade seront aussi supprimées de ton Drive.');
        if (!ok) return;
        const res = await send('memories.delete', { id: m.id }, toast);
        if (!res) return;
        invalidate();
        forget(function (k) { return k.indexOf('mem:one:') === 0; });
        toast('Balade supprimée');
        state.navDepth = 0;
        replaceRoute(link('balades'));
      }));
      body.appendChild(zone);
    }
  }

  // ===== Formulaire =====
  function checkGroup(title, items, onChange) {
    const box = el('div', 'fieldset');
    box.appendChild(el('h3', null, title));
    const wrap = el('div', 'checks');
    const inputs = [];
    items.forEach(function (it) {
      const label = el('label', 'check');
      const input = el('input');
      input.type = 'checkbox';
      input.value = it.id;
      input.checked = !!it.checked;
      input.addEventListener('change', function () { if (onChange) onChange(); });
      label.append(input, el('span', null, it.label));
      wrap.appendChild(label);
      inputs.push(input);
    });
    box.appendChild(wrap);
    return { node: box, values: function () { return inputs.filter(function (i) { return i.checked; }).map(function (i) { return i.value; }); } };
  }

  addRoute('nouvelle-balade', function (parts) { showMemoryForm(null, parts[0] || null); });
  addRoute('modifier-balade', function (parts) { showMemoryForm(parts[0], null); });

  addQuickAction({
    order: 15, icon: '🛣️', label: 'Nouvelle balade', hint: 'Sortie, voyage, souvenir', needsVehicle: false,
    run: function (ctxId) { go(link('nouvelle-balade', ctxId)); }
  });

  async function showMemoryForm(id, presetVehicle) {
    const view = mountView('balades');
    const back = function () { goBack(id ? link('balade', id) : link('balades')); };
    view.appendChild(backLink(id ? 'Balade' : 'Balades', back));
    view.appendChild(el('h1', 'page-title', id ? 'Modifier la balade' : 'Nouvelle balade'));
    const holder = el('div');
    view.appendChild(holder);

    let m = null;
    if (id) {
      m = cached('mem:one:' + id) ? cached('mem:one:' + id).memory : null;
      if (!m) {
        holder.appendChild(skeleton(3));
        const d = await send('memories.get', { id: id }, function (msg) { holder.replaceChildren(errorBox(msg)); });
        if (!d || !view.isConnected) return;
        m = put('mem:one:' + id, d).memory;
      }
      if (!m.can_edit) { holder.replaceChildren(errorBox("Seul l'auteur de la balade peut la modifier.")); return; }
    }

    const vehicles = memVehicles();
    if (!vehicles.length) { holder.appendChild(errorBox("Aucun véhicule sur lequel tu peux enregistrer une balade.")); return; }
    const chosenIds = m ? m.vehicles.map(function (v) { return v.vehicle_id; }) : [presetVehicle && vehicles.some(function (v) { return v.vehicle_id === presetVehicle; }) ? presetVehicle : (vehicles.length === 1 ? vehicles[0].vehicle_id : null)].filter(Boolean);
    // Une balade modifiée garde ses véhicules, même archivés
    const vehicleItems = vehicles.map(function (v) { return { id: v.vehicle_id, label: iconOf(v.category) + ' ' + (v.name || v.vehicle_id), checked: chosenIds.indexOf(v.vehicle_id) !== -1 }; });
    if (m) m.vehicles.forEach(function (mv) { if (!vehicleItems.some(function (i) { return i.id === mv.vehicle_id; })) vehicleItems.push({ id: mv.vehicle_id, label: iconOf(mv.category) + ' ' + mv.name, checked: true }); });

    let vehiclesGroup = null;
    const f = buildForm([
      { section: 'La balade' },
      { name: 'title', label: 'Titre', kind: 'text', max: 100, required: true, placeholder: 'Ex. Sortie en Sologne' },
      { name: 'type', label: 'Type', kind: 'choice', group: 'memory_type', required: true, default: 'outing' },
      { name: 'start_date', label: 'Date de début', kind: 'date', required: true, defaultToday: true },
      { name: 'end_date', label: 'Date de fin (si plusieurs jours)', kind: 'date' },
      { name: 'place', label: 'Lieu', kind: 'text', max: 120 },
      { name: 'description', label: 'Récit', kind: 'longtext', placeholder: 'Ce que tu veux garder en mémoire' },
      { name: 'counter_start', label: 'Compteur au départ', kind: 'number', showWhen: function () { return vehiclesGroup && vehiclesGroup.values().length === 1; } },
      { name: 'counter_end', label: "Compteur à l'arrivée", kind: 'number', showWhen: function () { return vehiclesGroup && vehiclesGroup.values().length === 1; },
        help: "Met aussi à jour le compteur du véhicule s'il est plus élevé." }
    ], m || {}, { isCreate: !id });

    vehiclesGroup = checkGroup('Véhicules', vehicleItems, function () { f.refresh(); });
    const peopleItems = state.people.map(function (p) {
      return { id: p.user_id, label: p.name, checked: m ? m.participants.some(function (x) { return x.user_id === p.user_id; }) : p.user_id === state.user.user_id };
    });
    const peopleGroup = checkGroup('Participants', peopleItems);
    const firstFieldset = f.node.querySelector('.fieldset');
    firstFieldset.after(vehiclesGroup.node, peopleGroup.node);
    f.refresh();

    f.node.appendChild(formActions(id ? 'Enregistrer' : 'Créer la balade', back));
    f.node.addEventListener('submit', async function (e) {
      e.preventDefault();
      const values = f.read();
      if (!values) return;
      const vIds = vehiclesGroup.values();
      if (!vIds.length) { f.message('Choisis au moins un véhicule.'); return; }
      values.vehicleIds = vIds;
      values.userIds = peopleGroup.values();
      f.busy(true);
      const d = await send('memories.save', { id: id, memory: values }, f.message);
      f.busy(false);
      if (!d) return;
      invalidate();
      vIds.forEach(function (vid) { forgetVehicle(vid); });
      put('mem:one:' + d.memory.id, d);
      toast(id ? 'Balade enregistrée' : 'Balade créée');
      replaceRoute(link('balade', d.memory.id));
    });
    holder.replaceChildren(f.node);
  }
})();
