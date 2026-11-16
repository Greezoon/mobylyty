/* MOBYLYTY : carburant (onglet de la fiche et saisie d'un plein, éventuellement multi-véhicules). */
'use strict';
(function () {
  const SHOWN = 8;

  function pricePerLiter(n) {
    return Number(n).toLocaleString('fr-FR', { minimumFractionDigits: 3, maximumFractionDigits: 3 }) + ' €/L';
  }
  function fuelable() { return activeVehicles().filter(function (v) { return v.can_add_fuel; }); }

  // ===== Onglet Carburant =====
  addTab({
    slug: 'carburant', label: 'Carburant', order: 20,
    visible: function (v) { return v.can_add_fuel; },
    render: function (box, v) {
      const bar = el('div', 'toolbar');
      bar.appendChild(el('p', null, 'Pleins et consommation'));
      bar.appendChild(button('Ajouter un plein', 'btn btn-primary btn-small', function () { go(link('plein', v.vehicle_id)); }));
      box.appendChild(bar);
      const body = el('div');
      box.appendChild(body);
      const key = 'fuel:' + v.vehicle_id;
      load(key, function () { return api('fuel.list', { vehicleId: v.vehicle_id }); }, function (data) {
        renderFuel(body, v, data);
      }, {
        loading: function () { body.replaceChildren(skeleton(2)); },
        error: function (msg, had) { if (!had) body.replaceChildren(errorBox(msg)); },
        stillHere: function () { return body.isConnected; }
      });
    }
  });

  function renderFuel(body, v, data) {
    body.replaceChildren();
    const s = data.stats;
    if (!s.count) {
      body.appendChild(emptyState('Aucun plein pour le moment.', 'Ajouter un plein', function () { go(link('plein', v.vehicle_id)); }));
      return;
    }
    const rows = [
      ['Pleins', String(s.count)],
      ['Total', fmtNum(s.total_liters) + ' L pour ' + fmtMoney(s.total_amount)],
      ['Prix moyen', s.avg_price_per_liter ? pricePerLiter(s.avg_price_per_liter) : null]
    ];
    if (s.consumption) rows.push(['Consommation', fmtNum(s.consumption) + ' ' + s.consumption_unit]);
    if (s.distance) rows.push(['Mesurée sur', fmtCounter(s.distance, v.counter_unit)]);
    body.appendChild(logbook(null, rows));

    const list = el('div', 'items');
    data.fuel.forEach(function (f, i) {
      const item = el('div', 'item' + (i >= SHOWN ? ' hidden' : ''));
      item.appendChild(el('span', 'item-title', fmtDateLong(f.date) + ', ' + fmtNum(f.liters) + ' L'));
      item.appendChild(el('span', 'item-amount', fmtMoney(f.amount)));
      const sub = [labelOf('fuel_type', f.fuel_type), f.price_per_liter ? pricePerLiter(f.price_per_liter) : null, f.station];
      if (!isEmpty(f.counter)) {
        sub.push('à ' + fmtCounter(f.counter, v.counter_unit) + (isEmpty(f.distance_since_previous) ? '' : ' (+' + fmtCounter(f.distance_since_previous, v.counter_unit) + ')'));
      }
      item.appendChild(el('span', 'item-sub', sub.filter(Boolean).join(', ')));
      if (data.can_delete) {
        const actions = el('div', 'row-actions');
        actions.appendChild(button('Supprimer', 'btn btn-ghost btn-small', async function () {
          const ok = await confirmDialog('Supprimer ce plein ?', fmtDateLong(f.date) + ', ' + fmtNum(f.liters) + ' L pour ' + fmtMoney(f.amount) + '.\nLe compteur du véhicule ne sera pas modifié.');
          if (!ok) return;
          const res = await send('fuel.delete', { fuelId: f.fuel_id }, toast);
          if (!res) return;
          forgetVehicle(v.vehicle_id);
          toast('Plein supprimé');
          route();
        }));
        item.appendChild(actions);
      }
      list.appendChild(item);
    });
    body.appendChild(list);
    if (data.fuel.length > SHOWN) {
      const more = button('Afficher les ' + data.fuel.length + ' pleins', 'btn btn-ghost btn-small toggle-more', function () {
        list.querySelectorAll('.hidden').forEach(function (x) { x.classList.remove('hidden'); });
        more.remove();
      });
      body.appendChild(more);
    }
  }

  // ===== Saisie d'un plein =====
  addRoute('plein', function (parts) { showFuelForm(parts[0] || null); });

  addQuickAction({
    order: 10, icon: '⛽', label: 'Nouveau plein', hint: 'Un ou plusieurs véhicules', needsVehicle: false,
    run: function (ctxId) {
      const ok = ctxId && fuelable().some(function (v) { return v.vehicle_id === ctxId; });
      go(link('plein', ok ? ctxId : null));
    }
  });

  function showFuelForm(vehicleId) {
    const view = mountView(vehicleId ? 'garage' : 'home');
    const back = function () { goBack(vehicleId ? link('v', vehicleId, 'carburant') : link()); };
    view.appendChild(backLink(vehicleId ? 'Fiche' : 'Accueil', back));
    view.appendChild(el('h1', 'page-title', 'Nouveau plein'));
    const vehicles = fuelable();
    if (!vehicles.length) { view.appendChild(errorBox("Aucun véhicule pour lequel tu peux saisir un plein.")); return; }

    const station = buildForm([
      { section: 'Passage à la station' },
      { name: 'date', label: 'Date', kind: 'date', required: true, defaultToday: true },
      { name: 'station', label: 'Station', kind: 'text', max: 80, placeholder: 'Ex. Total, Leclerc' },
      { name: 'location', label: 'Lieu', kind: 'text', max: 80 }
    ], {}, { isCreate: true, asPart: true });
    station.node.querySelector('.form-message').remove();
    const lines = el('div');
    const addBtn = button('Ajouter un autre véhicule à ce plein', 'btn btn-ghost btn-block', function () {
      const used = currentLines().map(function (l) { return l.select.value; });
      const next = vehicles.find(function (v) { return used.indexOf(v.vehicle_id) === -1; });
      addLine(next ? next.vehicle_id : vehicles[0].vehicle_id);
    });
    const total = el('p', 'total-line');
    const message = el('p', 'form-message');
    const form = el('form', 'form');
    form.noValidate = true;
    form.append(station.node, lines, addBtn, total, message, formActions('Enregistrer le plein', back));
    view.appendChild(form);

    const lineObjects = [];
    function currentLines() { return lineObjects.filter(function (l) { return l.node.isConnected; }); }

    function addLine(vid) {
      const node = el('div', 'fieldset');
      const title = el('h3');
      node.appendChild(title);
      const sel = el('select');
      vehicles.forEach(function (v) { sel.appendChild(new Option(v.name || v.vehicle_id, v.vehicle_id)); });
      sel.value = vid;
      const fuelSel = el('select');
      fuelSel.appendChild(new Option('—', ''));
      (state.lists.fuel_type || []).forEach(function (i) { fuelSel.appendChild(new Option(i.label, i.key)); });
      function field(label, input, required) {
        const w = el('label', 'field');
        const s = el('span', null, label);
        if (required) s.appendChild(el('b', 'req', ' *'));
        w.append(s, input);
        return w;
      }
      function numInput(mode) { const i = el('input'); i.inputMode = mode || 'decimal'; i.autocomplete = 'off'; return i; }
      const liters = numInput();
      const amount = numInput();
      const counter = numInput();
      const two = el('div', 'two');
      two.append(field('Litres', liters, true), field('Montant (€)', amount, true));
      const counterField = field('Compteur (facultatif)', counter);
      const hint = el('p', 'hint');
      const remove = button('Retirer ce véhicule', 'btn btn-ghost btn-small', function () { node.remove(); refresh(); });
      node.append(field('Véhicule', sel, true), field('Carburant', fuelSel), two, counterField, hint, remove);

      const line = { node: node, select: sel, fuel: fuelSel, liters: liters, amount: amount, counter: counter, counterField: counterField, title: title, remove: remove };
      function onVehicle() {
        const v = vehicles.find(function (x) { return x.vehicle_id === sel.value; });
        counterField.classList.toggle('hidden', !(v && v.can_update_counter));
        counter.value = '';
        counter.placeholder = (v && !isEmpty(v.current_counter)) ? 'Actuel : ' + fmtCounter(v.current_counter, v.counter_unit) : '';
        const known = cached('fuel:' + sel.value);
        const last = known && known.fuel.find(function (x) { return x.fuel_type; });
        fuelSel.value = last ? last.fuel_type : '';
      }
      function onAmounts() {
        const l = parseNum(liters.value);
        const a = parseNum(amount.value);
        hint.textContent = (l > 0 && a >= 0) ? pricePerLiter(a / l) : '';
        refresh();
      }
      sel.addEventListener('change', onVehicle);
      liters.addEventListener('input', onAmounts);
      amount.addEventListener('input', onAmounts);
      lineObjects.push(line);
      lines.appendChild(node);
      onVehicle();
      refresh();
    }

    function refresh() {
      const list = currentLines();
      let l = 0, a = 0;
      list.forEach(function (line, i) {
        line.title.textContent = list.length > 1 ? 'Véhicule ' + (i + 1) : 'Véhicule';
        line.remove.classList.toggle('hidden', list.length === 1);
        l += parseNum(line.liters.value) || 0;
        a += parseNum(line.amount.value) || 0;
      });
      addBtn.classList.toggle('hidden', list.length >= vehicles.length);
      total.textContent = (l || a) ? 'Total : ' + fmtNum(l) + ' L, ' + fmtMoney(a) : '';
    }

    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      const head = station.read();
      if (!head) { message.textContent = 'La date est obligatoire.'; return; }
      const payloadLines = currentLines().map(function (line) {
        return {
          vehicle_id: line.select.value, fuel_type: line.fuel.value,
          liters: line.liters.value.trim(), amount: line.amount.value.trim(),
          counter: line.counterField.classList.contains('hidden') ? '' : line.counter.value.trim()
        };
      });
      const missing = payloadLines.find(function (l) { return !l.liters || !l.amount; });
      if (missing) { message.textContent = 'Indique les litres et le montant pour chaque véhicule.'; return; }
      message.textContent = '';
      form.querySelectorAll('input, select, button').forEach(function (x) { x.disabled = true; });
      const data = await send('fuel.create', { fuel: Object.assign({}, head, { lines: payloadLines }) }, function (m) { message.textContent = m; });
      form.querySelectorAll('input, select, button').forEach(function (x) { x.disabled = false; });
      if (!data) return;
      payloadLines.forEach(function (l) { forgetVehicle(l.vehicle_id); });
      toast(payloadLines.length > 1 ? 'Plein enregistré pour ' + payloadLines.length + ' véhicules' : 'Plein enregistré');
      back();
    });

    const scan = scanButton('fuel', 'Scanner un ticket de carburant', function (fl) {
      fillControl(station, 'date', fl.date);
      fillControl(station, 'station', fl.station);
      const first = currentLines()[0];
      if (!first) return;
      if (fl.liters !== undefined) { first.liters.value = String(fl.liters).replace('.', ','); first.liters.dispatchEvent(new Event('input')); }
      if (fl.amount !== undefined) { first.amount.value = String(fl.amount).replace('.', ','); first.amount.dispatchEvent(new Event('input')); }
      if (fl.fuel_type) first.fuel.value = fl.fuel_type;
    });
    form.before(scan);

    addLine(vehicleId && vehicles.some(function (v) { return v.vehicle_id === vehicleId; }) ? vehicleId : vehicles[0].vehicle_id);
  }
})();
