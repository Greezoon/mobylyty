/* MOBYLYTY : réglages (mon compte, affichage, proches et accès, listes, structure). */
'use strict';
(function () {
  const isAdmin = function () { return state.user && state.user.role === 'admin'; };
  const SETTINGS_KEY = 'settings';

  function page(title, backTo, backLabel) {
    const view = mountView('settings');
    if (backTo) view.appendChild(backLink(backLabel || 'Réglages', function () { goBack(backTo); }));
    view.appendChild(el('h1', 'page-title', title));
    return view;
  }

  function loadSettings(view, render) {
    const body = el('div');
    view.appendChild(body);
    load(SETTINGS_KEY, function () { return api('settings.get'); }, function (d) { render(body, d); }, {
      loading: function () { body.replaceChildren(skeleton(3)); },
      error: function (msg, had) { if (!had) body.replaceChildren(errorBox(msg)); },
      stillHere: function () { return body.isConnected; }
    });
    return body;
  }

  function menuRow(icon, title, hint, onClick) {
    const b = button('', 'menu-item row-card', onClick);
    b.appendChild(el('span', 'mi-icon', icon));
    const t = el('span');
    t.appendChild(el('b', null, title));
    if (hint) t.appendChild(el('small', null, hint));
    b.appendChild(t);
    return b;
  }

  // ===== Page principale =====
  addRoute('reglages', function (parts) {
    const sub = parts[0];
    if (!sub) return showMain();
    if (!isAdmin() && sub !== 'affichage') return replaceRoute(link('reglages'));
    if (sub === 'proches') return showUsers();
    if (sub === 'proche') return showUser(parts[1]);
    if (sub === 'listes') return showLists();
    if (sub === 'base') return showBase();
    if (sub === 'affichage') return showDisplay();
    showMain();
  });

  function showMain() {
    const view = page('Réglages');
    const me = el('section', 'logbook');
    me.appendChild(el('h3', null, 'Mon compte'));
    const f = buildForm([{ name: 'name', label: 'Prénom affiché', kind: 'text', max: 60, required: true }], { name: state.user.name }, {});
    f.node.appendChild(el('p', 'note', [state.user.email, labelOf('user_role', state.user.role)].filter(Boolean).join(', ')));
    const save = el('button', 'btn btn-primary btn-small', 'Enregistrer');
    save.type = 'submit';
    f.node.appendChild(save);
    f.node.addEventListener('submit', async function (e) {
      e.preventDefault();
      const v = f.read();
      if (!v) return;
      f.busy(true);
      const d = await send('me.save', { name: v.name }, f.message);
      f.busy(false);
      if (!d) return;
      state.user.name = d.user.name;
      if (d.people) state.people = d.people;
      $('userBtn').textContent = String(d.user.name).charAt(0).toUpperCase();
      forget(function (k) { return k === SETTINGS_KEY; });
      toast('Prénom enregistré');
    });
    me.appendChild(f.node);
    view.appendChild(me);

    const menu = el('div', 'items');
    menu.appendChild(menuRow('🎨', 'Affichage', 'Thème et taille du texte', function () { go(link('reglages', 'affichage')); }));
    if (isAdmin()) {
      menu.appendChild(menuRow('👨‍👩‍👧', 'Proches et accès', 'Qui utilise l\'appli et ce qu\'il peut voir', function () { go(link('reglages', 'proches')); }));
      menu.appendChild(menuRow('🗂️', 'Listes', 'Catégories, carburants, types de balades…', function () { go(link('reglages', 'listes')); }));
      menu.appendChild(menuRow('🧰', 'Base de données', 'Vérifier et mettre à jour la structure', function () { go(link('reglages', 'base')); }));
    }
    view.appendChild(menu);

    const out = el('div', 'danger-zone');
    out.appendChild(button('Se déconnecter', 'btn btn-ghost', doLogout));
    out.appendChild(el('p', 'note', 'Version ' + (state.version || '')));
    view.appendChild(out);
  }

  // ===== Affichage =====
  function segmented(options, current, onPick) {
    const box = el('div', 'segmented');
    options.forEach(function (o) {
      const b = button(o[1], 'seg' + (o[0] === current ? ' on' : ''), function () {
        box.querySelectorAll('.seg').forEach(function (x) { x.classList.remove('on'); });
        b.classList.add('on');
        onPick(o[0]);
      });
      box.appendChild(b);
    });
    return box;
  }

  function showDisplay() {
    const view = page('Affichage', link('reglages'));
    const box = el('section', 'logbook');
    box.appendChild(el('h3', null, 'Thème'));
    box.appendChild(segmented([['auto', 'Automatique'], ['light', 'Clair'], ['dark', 'Sombre']], getPref('theme', 'auto'), function (v) { setPref('theme', v); }));
    box.appendChild(el('h3', null, 'Taille du texte'));
    box.appendChild(segmented([['normal', 'Normale'], ['large', 'Grande']], getPref('size', 'normal'), function (v) { setPref('size', v); }));
    box.appendChild(el('p', 'note', 'Ces choix sont enregistrés sur cet appareil.'));
    view.appendChild(box);
  }

  // ===== Proches =====
  function userCard(u, onClick) {
    const card = button('', 'item', onClick);
    card.appendChild(el('span', 'item-title', u.name));
    card.appendChild(el('span', 'badge', labelOf('user_role', u.role)));
    card.appendChild(el('span', 'item-sub', [u.email, u.status !== 'active' ? 'désactivé' : (u.has_logged_in ? '' : 'jamais connecté')].filter(Boolean).join(', ')));
    return card;
  }

  function userFields() {
    return [
      { name: 'name', label: 'Prénom', kind: 'text', max: 60, required: true },
      { name: 'email', label: 'Adresse email (compte Google)', kind: 'text', max: 120, required: true, help: "L'adresse exacte du compte Google que cette personne utilisera." },
      { name: 'role', label: 'Rôle', kind: 'choice', group: 'user_role', required: true, default: 'user' },
      { name: 'status', label: 'Statut', kind: 'choice', group: 'user_status', required: true, default: 'active' }
    ];
  }

  function showUsers() {
    const view = page('Proches et accès', link('reglages'));
    view.appendChild(el('div', 'toolbar')).appendChild(button('Ajouter un proche', 'btn btn-primary btn-small', function () {
      openSheet(function (sheet, close) {
        sheet.appendChild(el('h2', null, 'Nouveau proche'));
        const f = buildForm(userFields(), {}, { isCreate: true });
        f.node.appendChild(formActions('Ajouter', close));
        f.node.addEventListener('submit', async function (e) {
          e.preventDefault();
          const v = f.read();
          if (!v) return;
          f.busy(true);
          const d = await send('settings.user.save', { user: v }, f.message);
          f.busy(false);
          if (!d) return;
          if (d.people) state.people = d.people;
          forget(function (k) { return k === SETTINGS_KEY; });
          close();
          toast(d.user.name + ' ajouté. Il pourra se connecter avec son compte Google.');
          go(link('reglages', 'proche', d.user.user_id));
        });
        sheet.appendChild(f.node);
      });
    }));
    loadSettings(view, function (body, d) {
      body.replaceChildren();
      const list = el('div', 'items');
      d.users.forEach(function (u) { list.appendChild(userCard(u, function () { go(link('reglages', 'proche', u.user_id)); })); });
      body.appendChild(list);
      body.appendChild(el('p', 'note', 'Pour donner accès à l\'appli : ajoute la personne, puis ouvre sa fiche pour choisir les véhicules qu\'elle peut voir.'));
    });
  }

  function showUser(userId) {
    const view = page('Proche', link('reglages', 'proches'), 'Proches');
    loadSettings(view, function (body, d) {
      const u = d.users.find(function (x) { return x.user_id === userId; });
      body.replaceChildren();
      if (!u) { body.appendChild(errorBox('Personne introuvable.')); return; }
      view.querySelector('h1').textContent = u.name;

      const box = el('section', 'logbook');
      box.appendChild(el('h3', null, 'Identité'));
      const isMe = u.user_id === state.user.user_id;
      const fields = userFields().filter(function (f) { return !(isMe && (f.name === 'role' || f.name === 'status')); });
      const f = buildForm(fields, u, {});
      const save = el('button', 'btn btn-primary btn-small', 'Enregistrer');
      save.type = 'submit';
      f.node.appendChild(save);
      f.node.addEventListener('submit', async function (e) {
        e.preventDefault();
        const v = f.read();
        if (!v) return;
        const payload = Object.assign({ role: u.role, status: u.status }, v);
        f.busy(true);
        const res = await send('settings.user.save', { id: u.user_id, user: payload }, f.message);
        f.busy(false);
        if (!res) return;
        if (res.people) state.people = res.people;
        forget(function (k) { return k === SETTINGS_KEY; });
        toast('Enregistré');
        route();
      });
      box.appendChild(f.node);
      if (!u.has_logged_in) box.appendChild(el('p', 'note', 'Cette personne ne s\'est pas encore connectée. Si tu changes son adresse, elle devra se reconnecter avec le nouveau compte Google.'));
      body.appendChild(box);

      if (u.role === 'admin') { body.appendChild(el('p', 'note', 'Un administrateur voit déjà tous les véhicules et peut tout modifier.')); return; }

      body.appendChild(el('h2', 'block-title', 'Accès aux véhicules'));
      d.vehicles.forEach(function (v) { body.appendChild(accessBlock(u, v, d)); });
      if (!d.vehicles.length) body.appendChild(emptyState('Aucun véhicule dans le garage.'));
    });
  }

  function accessBlock(u, v, d) {
    const box = el('section', 'logbook access');
    box.appendChild(el('h3', null, iconOf(v.category) + ' ' + (v.name || v.vehicle_id)));
    if (v.owner_user_id === u.user_id) {
      box.appendChild(el('p', 'note', 'Propriétaire : tous les droits.'));
      return box;
    }
    const row = d.authorizations.find(function (a) { return a.user_id === u.user_id && a.vehicle_id === v.vehicle_id; });
    let mode = (row && row.status === 'active') ? row.mode : 'none';
    const excluded = (row && row.status === 'active') ? row.excluded.slice() : [];

    const topics = el('div', 'checks');
    const checks = {};
    d.topics.forEach(function (t) {
      const label = el('label', 'check');
      const input = el('input');
      input.type = 'checkbox';
      input.checked = excluded.indexOf(t.key) !== -1;
      checks[t.key] = input;
      label.append(input, el('span', null, t.label));
      topics.appendChild(label);
    });
    const hint = el('p', 'note', 'Coche ce que cette personne ne doit pas voir.');
    const zone = el('div');
    zone.append(hint, topics);
    const msg = el('p', 'form-message');
    const saveBtn = button('Enregistrer cet accès', 'btn btn-primary btn-small', async function () {
      saveBtn.disabled = true;
      msg.textContent = '';
      const hidden = Object.keys(checks).filter(function (k) { return checks[k].checked; });
      const res = await send('settings.access.save', { access: { userId: u.user_id, vehicleId: v.vehicle_id, access: mode, excluded: hidden } }, function (m) { msg.textContent = m; });
      saveBtn.disabled = false;
      if (!res) return;
      forget(function (k) { return k === SETTINGS_KEY; });
      toast('Accès enregistré');
    });
    function sync() { zone.classList.toggle('hidden', mode !== 'restricted'); }
    box.appendChild(segmented([['none', 'Aucun'], ['full', 'Complet'], ['restricted', 'Restreint']], mode, function (m) { mode = m; sync(); }));
    box.append(zone, msg, saveBtn);
    sync();
    return box;
  }

  // ===== Listes =====
  function showLists() {
    const view = page('Listes', link('reglages'));
    let group = null;
    loadSettings(view, function (body, d) {
      const names = Object.keys(d.lists);
      if (!group || !d.lists[group]) group = names[0];
      body.replaceChildren();
      const tabs = el('div', 'chips-row');
      names.forEach(function (g) {
        tabs.appendChild(button(d.lists[g].label, 'tab' + (g === group ? ' active' : ''), function () { group = g; render(); }));
      });
      const holder = el('div');
      body.append(tabs, holder);

      function render() {
        tabs.querySelectorAll('.tab').forEach(function (t, i) { t.classList.toggle('active', names[i] === group); });
        holder.replaceChildren();
        const rows = el('div', 'items');
        d.lists[group].values.forEach(function (val) { rows.appendChild(listRow(val)); });
        holder.appendChild(rows);

        const add = el('form', 'inline-add');
        const input = el('input');
        input.placeholder = 'Nouvelle valeur';
        input.maxLength = 60;
        input.setAttribute('aria-label', 'Nouvelle valeur');
        const btn = el('button', 'btn btn-primary btn-small', 'Ajouter');
        btn.type = 'submit';
        const msg = el('p', 'form-message');
        add.append(input, btn);
        add.addEventListener('submit', async function (e) {
          e.preventDefault();
          if (!input.value.trim()) return;
          btn.disabled = true;
          const res = await send('settings.list.add', { group: group, label: input.value.trim() }, function (m) { msg.textContent = m; });
          btn.disabled = false;
          if (!res) return;
          d.lists = res.lists;
          put(SETTINGS_KEY, Object.assign({}, cached(SETTINGS_KEY), { lists: res.lists }));
          refreshLists();
          toast('Valeur ajoutée');
          render();
        });
        holder.append(add, msg, el('p', 'note', 'Les valeurs masquées disparaissent des menus, mais les éléments déjà enregistrés les gardent.'));
      }

      function listRow(val) {
        const row = el('div', 'item list-row');
        const input = el('input');
        input.value = val.label;
        input.maxLength = 60;
        input.setAttribute('aria-label', 'Libellé');
        input.addEventListener('change', async function () {
          const res = await send('settings.list.update', { id: val.id, value: { label: input.value } }, function (m) { toast(m); input.value = val.label; });
          if (!res) return;
          d.lists = res.lists;
          put(SETTINGS_KEY, Object.assign({}, cached(SETTINGS_KEY), { lists: res.lists }));
          refreshLists();
          toast('Libellé enregistré');
        });
        row.appendChild(input);
        if (val.protected) row.appendChild(el('span', 'badge', 'Utilisé par l\'appli'));
        else {
          const sw = el('label', 'switch mini');
          const cb = el('input');
          cb.type = 'checkbox';
          cb.checked = val.active;
          cb.setAttribute('aria-label', 'Afficher dans les menus');
          cb.addEventListener('change', async function () {
            const res = await send('settings.list.update', { id: val.id, value: { active: cb.checked } }, function (m) { toast(m); cb.checked = !cb.checked; });
            if (!res) return;
            d.lists = res.lists;
            put(SETTINGS_KEY, Object.assign({}, cached(SETTINGS_KEY), { lists: res.lists }));
            refreshLists();
            toast(cb.checked ? 'Valeur affichée' : 'Valeur masquée');
          });
          sw.append(el('span', null, 'Afficher'), cb);
          row.appendChild(sw);
        }
        return row;
      }
      render();
    });
  }

  /** Recharge les listes de l'appli (menus déroulants) après une modification. */
  async function refreshLists() {
    try {
      const res = await api('lists.all');
      if (res.ok) state.lists = res.data.lists;
    } catch (err) { /* les anciennes listes restent en place */ }
  }

  // ===== Base de données =====
  function showBase() {
    const view = page('Base de données', link('reglages'));
    const box = el('section', 'logbook');
    box.appendChild(el('h3', null, 'Structure du classeur'));
    box.appendChild(el('p', 'note', 'L\'appli crée toute seule les onglets et colonnes dont elle a besoin. Ce bouton force la vérification. Il ne supprime ni ne modifie jamais tes données.'));
    const result = el('p', 'note');
    const btn = button('Vérifier la structure', 'btn btn-primary btn-small', async function () {
      btn.disabled = true;
      result.textContent = 'Vérification…';
      const res = await send('settings.schema', {}, function (m) { result.textContent = m; });
      btn.disabled = false;
      if (!res) return;
      result.textContent = res.report.length ? res.report.join(' · ') : 'Tout est à jour : rien à créer.';
    });
    box.append(btn, result);
    view.appendChild(box);

    const drive = el('section', 'logbook');
    drive.appendChild(el('h3', null, 'Photos'));
    drive.appendChild(el('p', 'note', 'Les photos sont rangées dans le dossier « MOBYLYTY photos » de ton Google Drive, en privé. Les supprimer dans l\'appli les retire aussi du Drive.'));
    view.appendChild(drive);
  }
})();
