/* MOBYLYTY : module Carburant (saisie des pleins et section Carburant de la fiche). */
(function () {
  const ROUTE = '#nouveau-plein';
  const SHOWN = 10; // pleins affichés avant « Afficher tout »
  const fuelCache = {};
  let formVehicleId = null;

  function fmt(n, d) { return formatNumber(n, d === undefined ? 2 : d); }
  function pricePerLiter(n) {
    return Number(n).toLocaleString('fr-FR', { minimumFractionDigits: 3, maximumFractionDigits: 3 }) + ' €/L';
  }
  function invalidate(vehicleId) {
    delete fuelCache[vehicleId];
    delete cache.at['fuel:' + vehicleId];
    delete cache.at['detail:' + vehicleId];
    delete cache.at.list;
  }
  function fuelableVehicles() {
    return (cache.vehicles || []).filter(function (v) { return v.can_add_fuel && (!v.status || v.status === 'active'); });
  }

  // ===== Page de saisie (créée une seule fois) =====
  const panel = el('section', 'hidden');
  panel.id = 'fuelView';
  panel.innerHTML =
    '<h2>Nouveau plein</h2>' +
    '<form id="fuelForm" novalidate>' +
    '  <fieldset class="section">' +
    '    <legend>Passage à la station</legend>' +
    '    <label>Date<span class="req">*</span><input name="date" type="date"></label>' +
    '    <label>Station<input name="station" maxlength="80" autocomplete="off" placeholder="Ex. Total, Leclerc…"></label>' +
    '    <label>Lieu<input name="location" maxlength="80" autocomplete="off"></label>' +
    '    <label>Commentaire<input name="comment" maxlength="500" autocomplete="off"></label>' +
    '  </fieldset>' +
    '  <div id="fuelLines"></div>' +
    '  <button id="fuelAddLine" class="btn-secondary add-line" type="button">+ Ajouter un véhicule à ce plein</button>' +
    '  <p id="fuelTotal" class="total"></p>' +
    '  <div id="fuelMessage" class="message"></div>' +
    '  <div class="form-actions">' +
    '    <button id="fuelCancel" class="btn-secondary" type="button">Annuler</button>' +
    '    <button class="btn-primary" type="submit">Enregistrer le plein</button>' +
    '  </div>' +
    '</form>';
  document.querySelector('main').appendChild(panel);

  const listBtn = el('button', 'btn-secondary hidden', 'Nouveau plein');
  listBtn.type = 'button';
  listBtn.addEventListener('click', function () { go(ROUTE); });
  $('listActions').appendChild(listBtn);

  function addLine(vehicleId) {
    const vehicles = fuelableVehicles();
    const line = el('fieldset', 'section fuel-line');
    line.innerHTML =
      '<legend>Véhicule</legend>' +
      '<label>Véhicule<span class="req">*</span><select data-f="vehicle_id"></select></label>' +
      '<label>Carburant<select data-f="fuel_type"></select></label>' +
      '<div class="two">' +
      '  <label>Litres<span class="req">*</span><input data-f="liters" inputmode="decimal" autocomplete="off"></label>' +
      '  <label>Montant (€)<span class="req">*</span><input data-f="amount" inputmode="decimal" autocomplete="off"></label>' +
      '</div>' +
      '<label data-counter>Compteur (facultatif)<input data-f="counter" inputmode="decimal" autocomplete="off"></label>' +
      '<p class="hint"></p>' +
      '<button class="btn-link" type="button" data-remove>Retirer ce véhicule</button>';

    const f = function (name) { return line.querySelector('[data-f="' + name + '"]'); };
    vehicles.forEach(function (v) { f('vehicle_id').appendChild(new Option(v.name || v.vehicle_id, v.vehicle_id)); });
    fillSelect(f('fuel_type'), 'fuel_type', '—');
    if (vehicleId) f('vehicle_id').value = vehicleId;

    function onVehicleChange() {
      const v = vehicles.find(function (x) { return x.vehicle_id === f('vehicle_id').value; });
      const canCounter = !!(v && v.can_update_counter);
      line.querySelector('[data-counter]').classList.toggle('hidden', !canCounter);
      f('counter').value = '';
      f('counter').placeholder = (v && v.current_counter !== null && v.current_counter !== undefined)
        ? 'Actuel : ' + formatCounter(v.current_counter, v.counter_unit) : '';
      const known = v && fuelCache[v.vehicle_id];
      const last = known && known.fuel.find(function (x) { return x.fuel_type; });
      f('fuel_type').value = last ? last.fuel_type : '';
    }
    function onAmounts() {
      const liters = parseNumber(f('liters').value);
      const amount = parseNumber(f('amount').value);
      line.querySelector('.hint').textContent = (liters > 0 && amount >= 0) ? pricePerLiter(amount / liters) : '';
      updateTotal();
    }

    f('vehicle_id').addEventListener('change', onVehicleChange);
    f('liters').addEventListener('input', onAmounts);
    f('amount').addEventListener('input', onAmounts);
    line.querySelector('[data-remove]').addEventListener('click', function () { line.remove(); refreshLines(); });

    $('fuelLines').appendChild(line);
    onVehicleChange();
    refreshLines();
  }

  function refreshLines() {
    const lines = $('fuelLines').querySelectorAll('.fuel-line');
    lines.forEach(function (l, i) {
      l.querySelector('legend').textContent = 'Véhicule ' + (i + 1);
      l.querySelector('[data-remove]').classList.toggle('hidden', lines.length === 1);
    });
    $('fuelAddLine').classList.toggle('hidden', lines.length >= fuelableVehicles().length);
    updateTotal();
  }

  function updateTotal() {
    let liters = 0;
    let amount = 0;
    $('fuelLines').querySelectorAll('.fuel-line').forEach(function (l) {
      liters += parseNumber(l.querySelector('[data-f="liters"]').value) || 0;
      amount += parseNumber(l.querySelector('[data-f="amount"]').value) || 0;
    });
    setText('fuelTotal', liters || amount ? 'Total : ' + fmt(liters) + ' L · ' + formatPrice(amount) : '');
  }

  function showFuelForm(vehicleId) {
    showPanel('fuelView');
    formVehicleId = vehicleId;
    const form = $('fuelForm');
    form.reset();
    setText('fuelMessage', '');
    $('fuelLines').replaceChildren();
    form.elements['date'].value = todayIso();
    if (!fuelableVehicles().length) {
      setText('fuelMessage', "Aucun véhicule pour lequel tu peux saisir un plein.");
      return;
    }
    addLine(vehicleId);
  }

  async function submitFuel(e) {
    e.preventDefault();
    const form = $('fuelForm');
    const lines = [];
    $('fuelLines').querySelectorAll('.fuel-line').forEach(function (l) {
      const get = function (n) { return l.querySelector('[data-f="' + n + '"]').value.trim(); };
      const withCounter = !l.querySelector('[data-counter]').classList.contains('hidden');
      lines.push({
        vehicle_id: get('vehicle_id'), fuel_type: get('fuel_type'),
        liters: get('liters'), amount: get('amount'), counter: withCounter ? get('counter') : ''
      });
    });

    const buttons = form.querySelectorAll('button, input, select');
    buttons.forEach(function (b) { b.disabled = true; });
    setText('fuelMessage', '');
    try {
      const res = await api('fuel.create', { fuel: {
        date: form.elements['date'].value, station: form.elements['station'].value,
        location: form.elements['location'].value, comment: form.elements['comment'].value, lines: lines
      } });
      if (res.ok) {
        lines.forEach(function (l) { invalidate(l.vehicle_id); });
        return goBack(formVehicleId ? ROUTES.detail + encodeURIComponent(formVehicleId) : '');
      }
      handleError(res, 'fuelMessage');
    } catch (err) {
      setText('fuelMessage', 'Connexion impossible : ' + err.message);
    } finally {
      buttons.forEach(function (b) { b.disabled = false; });
    }
  }

  $('fuelForm').addEventListener('submit', submitFuel);
  $('fuelAddLine').addEventListener('click', function () {
    const used = Array.from($('fuelLines').querySelectorAll('[data-f="vehicle_id"]')).map(function (s) { return s.value; });
    const next = fuelableVehicles().find(function (v) { return used.indexOf(v.vehicle_id) === -1; });
    addLine(next ? next.vehicle_id : null);
  });
  $('fuelCancel').addEventListener('click', function () {
    goBack(formVehicleId ? ROUTES.detail + encodeURIComponent(formVehicleId) : '');
  });

  // ===== Section Carburant de la fiche =====
  function renderFuel(v, body, data) {
    body.replaceChildren();
    const s = data.stats;
    if (!s.count) {
      body.appendChild(el('p', 'empty', 'Aucun plein pour le moment.'));
      return;
    }

    const rows = [
      ['Pleins', String(s.count)],
      ['Total', fmt(s.total_liters) + ' L · ' + formatPrice(s.total_amount)],
      ['Prix moyen', s.avg_price_per_liter ? pricePerLiter(s.avg_price_per_liter) : null]
    ];
    if (s.consumption) {
      rows.push(['Consommation moyenne', fmt(s.consumption) + ' ' + s.consumption_unit + ' (sur ' + formatCounter(s.distance, v.counter_unit) + ')']);
    }
    const dl = el('dl');
    rows.forEach(function (r) {
      const row = el('div', 'row');
      row.appendChild(el('dt', null, r[0]));
      row.appendChild(el('dd', null, r[1] || 'Non renseigné'));
      dl.appendChild(row);
    });
    body.appendChild(dl);

    const ul = el('ul', 'fuel-list');
    data.fuel.forEach(function (f, i) {
      const li = el('li', 'fuel-item' + (i >= SHOWN ? ' hidden' : ''));
      const text = el('div');
      text.appendChild(el('div', 'fuel-main', formatDate(f.date) + ' · ' + fmt(f.liters) + ' L · ' + formatPrice(f.amount)));
      const sub = [labelOf('fuel_type', f.fuel_type), f.price_per_liter ? pricePerLiter(f.price_per_liter) : null, f.station];
      if (f.counter !== null && f.counter !== undefined && f.counter !== '') {
        let c = 'à ' + formatCounter(f.counter, v.counter_unit);
        if (f.distance_since_previous !== null && f.distance_since_previous !== undefined && f.distance_since_previous !== '') {
          c += ' (+' + formatCounter(f.distance_since_previous, v.counter_unit) + ')';
        }
        sub.push(c);
      }
      text.appendChild(el('div', 'fuel-sub', sub.filter(Boolean).join(' · ')));
      li.appendChild(text);

      if (data.can_delete) {
        const del = el('button', 'icon-btn', '×');
        del.type = 'button';
        del.setAttribute('aria-label', 'Supprimer ce plein');
        del.addEventListener('click', function () { deleteFuel(v, body, f); });
        li.appendChild(del);
      }
      ul.appendChild(li);
    });
    body.appendChild(ul);

    if (data.fuel.length > SHOWN) {
      const more = el('button', 'btn-secondary btn-small more', 'Afficher les ' + data.fuel.length + ' pleins');
      more.type = 'button';
      more.addEventListener('click', function () {
        ul.querySelectorAll('.hidden').forEach(function (x) { x.classList.remove('hidden'); });
        more.remove();
      });
      body.appendChild(more);
    }
  }

  async function loadFuel(v, body) {
    const key = 'fuel:' + v.vehicle_id;
    const cached = fuelCache[v.vehicle_id];
    if (cached) renderFuel(v, body, cached);
    else body.replaceChildren(el('p', 'empty', 'Chargement des pleins…'));
    if (cached && isFresh(key)) return;

    try {
      const res = await api('fuel.list', { vehicleId: v.vehicle_id });
      if (!res.ok) {
        if (res.code === 'AUTH') return showLogin(res.error);
        return body.replaceChildren(el('p', 'message', res.error));
      }
      const changed = !sameData(cached, res.data);
      fuelCache[v.vehicle_id] = remember(key, res.data);
      if (changed && body.isConnected) renderFuel(v, body, res.data);
    } catch (err) {
      if (!cached) body.replaceChildren(el('p', 'message', 'Connexion impossible : ' + err.message));
    }
  }

  async function deleteFuel(v, body, f) {
    const label = formatDate(f.date) + ' (' + fmt(f.liters) + ' L, ' + formatPrice(f.amount) + ')';
    if (!confirm('Supprimer le plein du ' + label + ' ?\n\nCette action est irréversible.')) return;
    try {
      const res = await api('fuel.delete', { fuelId: f.fuel_id });
      if (!res.ok) return alert(res.error);
      invalidate(v.vehicle_id);
      loadFuel(v, body);
    } catch (err) {
      alert('Connexion impossible : ' + err.message);
    }
  }

  registerModule({
    route: function (h) {
      if (h !== ROUTE && h.indexOf(ROUTE + '-') !== 0) return false;
      showFuelForm(h.length > ROUTE.length ? decodeURIComponent(h.slice(ROUTE.length + 1)) : null);
      return true;
    },
    detail: function (v, box) {
      if (!v.can_add_fuel) return;
      const s = el('section', 'section');
      const head = el('div', 'section-head');
      head.appendChild(el('h3', null, 'Carburant'));
      const add = el('button', 'btn-secondary btn-small', 'Ajouter un plein');
      add.type = 'button';
      add.addEventListener('click', function () { go(ROUTE + '-' + encodeURIComponent(v.vehicle_id)); });
      head.appendChild(add);
      s.appendChild(head);
      const body = el('div');
      s.appendChild(body);
      box.appendChild(s);
      loadFuel(v, body);
    },
    onVehicles: function (vehicles) {
      listBtn.classList.toggle('hidden', !vehicles.some(function (v) { return v.can_add_fuel; }));
    },
    clear: function () {
      Object.keys(fuelCache).forEach(function (k) { delete fuelCache[k]; });
    }
  });
})();
