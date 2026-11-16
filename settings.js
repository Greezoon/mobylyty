/* MOBYLYTY : réglages (mon compte, affichage, assistant IA, proches et accès par personne, listes, structure). */
'use strict';
(function () {
  const isAdmin = function () { return state.user && state.user.role === 'admin'; };
  const SETTINGS_KEY = 'settings';

  const TOPIC_ICONS = {
    vehicle_info: '🪪', counter_usage: '🔢', fuel_consumption: '⛽', maintenance_controls: '🔧', tasks_memos: '📝',
    projects: '🏁', finances: '💶', documents: '📄', photos: '📷', memories: '🛣️', history: '🕑'
  };
  // Réglages rapides : sujets MASQUÉS pour chaque formule
  const PRESETS = [
    { id: 'full', icon: '👁️', label: 'Tout voir', mode: 'full', hide: [] },
    { id: 'nofin', icon: '💶', label: 'Tout sauf les finances', mode: 'restricted', hide: ['finances'] },
    { id: 'fun', icon: '📷', label: 'Photos et balades', mode: 'restricted', hide: ['vehicle_info', 'counter_usage', 'fuel_consumption', 'maintenance_controls', 'tasks_memos', 'projects', 'finances', 'documents', 'history'] },
    { id: 'drive', icon: '⛽', label: 'Carburant et entretien', mode: 'restricted', hide: ['vehicle_info', 'projects', 'finances', 'documents', 'photos', 'memories', 'history'] }
  ];

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

  function initial(name) { return String(name || '?').trim().charAt(0).toUpperCase() || '?'; }

  // ===== Page principale =====
  addRoute('reglages', function (parts) {
    const sub = parts[0];
    if (!sub) return showMain();
    if (!isAdmin() && sub !== 'affichage' && sub !== 'assistant') return replaceRoute(link('reglages'));
    if (sub === 'proches') return showUsers();
    if (sub === 'proche') return showUser(parts[1]);
    if (sub === 'listes') return showLists();
    if (sub === 'base') return showBase();
    if (sub === 'affichage') return showDisplay();
    if (sub === 'assistant') return showAssistantSettings();
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
      $('userBtn').textContent = initial(d.user.name);
      forget(function (k) { return k === SETTINGS_KEY; });
      toast('Prénom enregistré');
    });
    me.appendChild(f.node);
    view.appendChild(me);

    const menu = el('div', 'items');
    menu.appendChild(menuRow('🎨', 'Affichage et photos', 'Thème, taille du texte, qualité des photos', function () { go(link('reglages', 'affichage')); }));
    menu.appendChild(menuRow('✨', 'Assistant IA', state.ai.ready ? 'Branché : ta clé Gemini est active' : 'Brancher ma clé Gemini gratuite', function () { go(link('reglages', 'assistant')); }));
    if (isAdmin()) {
      menu.appendChild(menuRow('👨‍👩‍👧', 'Proches et accès', 'Qui utilise l\'appli et ce que chacun peut voir', function () { go(link('reglages', 'proches')); }));
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
    const view = page('Affichage et photos', link('reglages'));
    const box = el('section', 'logbook');
    box.appendChild(el('h3', null, 'Thème'));
    box.appendChild(segmented([['auto', 'Automatique'], ['light', 'Clair'], ['dark', 'Sombre']], getPref('theme', 'auto'), function (v) { setPref('theme', v); }));
    box.appendChild(el('h3', null, 'Taille du texte'));
    box.appendChild(segmented([['normal', 'Normale'], ['large', 'Grande']], getPref('size', 'normal'), function (v) { setPref('size', v); }));
    view.appendChild(box);

    const photos = el('section', 'logbook');
    photos.appendChild(el('h3', null, 'Qualité des photos envoyées'));
    photos.appendChild(segmented([['standard', 'Standard'], ['high', 'Haute'], ['max', 'Maximale']], getPref('photo', 'max'), function (v) { setPref('photo', v); hint(v); }));
    const note = el('p', 'note');
    function hint(v) {
      note.textContent = { standard: 'Jusqu\'à 1600 px : rapide, léger.', high: 'Jusqu\'à 2560 px : très belle qualité.', max: 'Qualité d\'origine : ta photo JPEG est envoyée telle quelle si elle pèse moins de 5,5 Mo, sinon en 4096 px, qualité maximale.' }[v];
    }
    hint(getPref('photo', 'max'));
    photos.appendChild(note);
    photos.appendChild(el('p', 'note', 'Les photos sont stockées en JPEG dans ton Google Drive. Les supprimer dans l\'appli les envoie aussi à la corbeille de ton Drive.'));
    view.appendChild(photos);
    view.appendChild(el('p', 'note', 'Ces choix te suivent sur tous tes appareils.'));
  }

  // ===== Proches : liste visuelle =====
  function accessChips(u, d) {
    const box = el('div', 'access-chips');
    if (u.role === 'admin') { box.appendChild(el('span', 'achip full', '👑 Voit et gère tout')); return box; }
    let n = 0;
    d.vehicles.forEach(function (v) {
      let kind = null;
      let icon = '';
      if (v.owner_user_id === u.user_id) { kind = 'owner'; icon = '🔑'; }
      else {
        const a = d.authorizations.find(function (x) { return x.user_id === u.user_id && x.vehicle_id === v.vehicle_id && x.status === 'active'; });
        if (a) { kind = a.mode === 'full' ? 'full' : 'part'; icon = a.mode === 'full' ? '👁️' : '🎛️'; }
      }
      if (!kind) return;
      n++;
      if (n <= 4) box.appendChild(el('span', 'achip ' + kind, icon + ' ' + (v.name || v.vehicle_id)));
    });
    if (n > 4) box.appendChild(el('span', 'achip', '+' + (n - 4)));
    if (!n) box.appendChild(el('span', 'achip none', 'Aucun véhicule'));
    return box;
  }

  function personCard(u, d, onClick) {
    const card = button('', 'person-card' + (u.status !== 'active' ? ' off' : ''), onClick);
    card.appendChild(el('span', 'person-avatar', initial(u.name)));
    const t = el('span', 'person-txt');
    const top = el('span', 'person-top');
    top.appendChild(el('b', null, u.name));
    top.appendChild(el('span', 'badge', labelOf('user_role', u.role)));
    if (u.status !== 'active') top.appendChild(el('span', 'badge', 'Désactivé'));
    else if (!u.has_logged_in) top.appendChild(el('span', 'badge', 'Jamais connecté'));
    t.appendChild(top);
    t.appendChild(el('small', null, u.email));
    t.appendChild(accessChips(u, d));
    card.appendChild(t);
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
          toast(d.user.name + ' ajouté. Choisis maintenant ce qu\'il peut voir.');
          go(link('reglages', 'proche', d.user.user_id));
        });
        sheet.appendChild(f.node);
      });
    }));
    loadSettings(view, function (body, d) {
      body.replaceChildren();
      const list = el('div', 'items');
      d.users.forEach(function (u) { list.appendChild(personCard(u, d, function () { go(link('reglages', 'proche', u.user_id)); })); });
      body.appendChild(list);
      body.appendChild(el('p', 'note', 'Touche une personne pour choisir, véhicule par véhicule, ce qu\'elle peut voir et faire.'));
      body.appendChild(legend());
    });
  }

  function legend() {
    const box = el('div', 'legend');
    [['🔑', 'Propriétaire : tous les droits'], ['👁️', 'Voit tout'], ['🎛️', 'Voit une partie']].forEach(function (l) {
      const s = el('span', 'legend-item');
      s.append(el('span', null, l[0]), document.createTextNode(' ' + l[1]));
      box.appendChild(s);
    });
    return box;
  }

  // ===== Une personne =====
  function showUser(userId) {
    const view = page('', link('reglages', 'proches'), 'Proches');
    const title = view.querySelector('h1');
    loadSettings(view, function (body, d) {
      const u = d.users.find(function (x) { return x.user_id === userId; });
      body.replaceChildren();
      if (!u) { body.appendChild(errorBox('Personne introuvable.')); return; }
      title.textContent = '';
      const isMe = u.user_id === state.user.user_id;

      const head = el('section', 'person-head');
      head.appendChild(el('span', 'person-avatar big', initial(u.name)));
      const ht = el('div');
      ht.appendChild(el('h2', null, u.name));
      ht.appendChild(el('p', 'muted', u.email));
      const badges = el('div', 'access-chips');
      badges.appendChild(el('span', 'badge', labelOf('user_role', u.role)));
      badges.appendChild(el('span', 'badge', u.status === 'active' ? (u.has_logged_in ? 'Connecté' : 'Jamais connecté') : 'Désactivé'));
      ht.appendChild(badges);
      head.appendChild(ht);
      body.appendChild(head);

      const box = el('section', 'logbook');
      box.appendChild(el('h3', null, 'Identité'));
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
      if (!u.has_logged_in) box.appendChild(el('p', 'note', 'Si tu changes son adresse, cette personne devra se reconnecter avec le nouveau compte Google.'));
      body.appendChild(box);

      if (u.role === 'admin') { body.appendChild(el('p', 'note', '👑 Un administrateur voit déjà tous les véhicules et peut tout modifier.')); return; }

      body.appendChild(el('h2', 'block-title', 'Ce que ' + u.name + ' peut voir'));
      body.appendChild(el('p', 'note', 'Voir une rubrique permet aussi d\'y ajouter des éléments (un plein, une tâche, une photo, une balade…). Seul le propriétaire peut modifier ou supprimer.'));

      const blocks = [];
      const targets = d.vehicles.filter(function (v) { return v.owner_user_id !== u.user_id; });
      if (targets.length > 1) body.appendChild(bulkBar(u, targets, blocks, d));
      d.vehicles.forEach(function (v) {
        const blk = accessCard(u, v, d);
        blocks.push(blk);
        body.appendChild(blk.node);
      });
      if (!d.vehicles.length) body.appendChild(emptyState('Aucun véhicule dans le garage.'));
    });
  }

  /** Applique une même formule à tous les véhicules de la personne. */
  function bulkBar(u, targets, blocks, d) {
    const box = el('section', 'logbook bulk');
    box.appendChild(el('h3', null, 'Pour tous les véhicules à la fois'));
    const row = el('div', 'preset-grid');
    PRESETS.concat([{ id: 'none', icon: '🚫', label: 'Aucun accès', mode: 'none', hide: [] }]).forEach(function (p) {
      const b = button('', 'preset', async function () {
        const ok = await confirmDialog('Appliquer « ' + p.label + ' » ?', 'Cela remplace l\'accès de ' + u.name + ' sur ' + targets.length + ' véhicules.', 'Appliquer');
        if (!ok) return;
        b.disabled = true;
        let done = 0;
        for (let i = 0; i < targets.length; i++) {
          const res = await send('settings.access.save', { access: { userId: u.user_id, vehicleId: targets[i].vehicle_id, access: p.mode, excluded: p.hide } }, toast);
          if (!res) break;
          done++;
        }
        b.disabled = false;
        forget(function (k) { return k === SETTINGS_KEY; });
        if (done === targets.length) { toast('Accès mis à jour pour ' + done + ' véhicules'); route(); }
      });
      b.appendChild(el('span', 'preset-icon', p.icon));
      b.appendChild(el('span', null, p.label));
      row.appendChild(b);
    });
    box.appendChild(row);
    return box;
  }

  /** Bloc d'accès d'une personne à UN véhicule : trois grosses tuiles, puis les rubriques. */
  function accessCard(u, v, d) {
    const box = el('section', 'access-card');
    const head = el('div', 'access-head');
    const ico = el('span', 'car-icon small', iconOf(v.category));
    if (v.main_photo_id) paintThumb(ico, v.main_photo_id, function () { ico.textContent = ''; });
    head.appendChild(ico);
    head.appendChild(el('b', null, v.name || v.vehicle_id));
    box.appendChild(head);

    if (v.owner_user_id === u.user_id) {
      box.appendChild(el('p', 'note', '🔑 ' + u.name + ' est propriétaire : tous les droits sur ce véhicule.'));
      return { node: box };
    }

    const row = d.authorizations.find(function (a) { return a.user_id === u.user_id && a.vehicle_id === v.vehicle_id; });
    let mode = (row && row.status === 'active') ? row.mode : 'none';
    const hidden = {};
    ((row && row.status === 'active') ? row.excluded : []).forEach(function (t) { hidden[t] = true; });
    let dirty = false;

    const tiles = el('div', 'tiles');
    const tileDefs = [['none', '🚫', 'Aucun', 'Ne le voit pas'], ['full', '👁️', 'Tout voir', 'Toutes les rubriques'], ['restricted', '🎛️', 'Au choix', 'Rubrique par rubrique']];
    const tileButtons = {};
    tileDefs.forEach(function (t) {
      const b = button('', 'tile', function () { mode = t[0]; dirty = true; sync(); });
      b.setAttribute('aria-pressed', 'false');
      b.appendChild(el('span', 'tile-icon', t[1]));
      b.appendChild(el('b', null, t[2]));
      b.appendChild(el('small', null, t[3]));
      tiles.appendChild(b);
      tileButtons[t[0]] = b;
    });
    box.appendChild(tiles);

    const zone = el('div', 'topics-zone');
    const presetRow = el('div', 'chips-row');
    PRESETS.filter(function (p) { return p.mode === 'restricted'; }).forEach(function (p) {
      presetRow.appendChild(button(p.icon + ' ' + p.label, 'tab', function () {
        Object.keys(hidden).forEach(function (k) { delete hidden[k]; });
        p.hide.forEach(function (t) { hidden[t] = true; });
        dirty = true;
        sync();
      }));
    });
    zone.appendChild(presetRow);
    const grid = el('div', 'topic-grid');
    const topicButtons = {};
    d.topics.forEach(function (t) {
      const b = button('', 'topic', function () { if (hidden[t.key]) delete hidden[t.key]; else hidden[t.key] = true; dirty = true; sync(); });
      b.appendChild(el('span', 'topic-icon', TOPIC_ICONS[t.key] || '•'));
      b.appendChild(el('span', 'topic-label', t.label));
      b.appendChild(el('span', 'topic-state'));
      grid.appendChild(b);
      topicButtons[t.key] = b;
    });
    zone.appendChild(grid);
    box.appendChild(zone);

    const msg = el('p', 'form-message');
    const saveBtn = button('Enregistrer cet accès', 'btn btn-small', async function () {
      saveBtn.disabled = true;
      msg.textContent = '';
      const res = await send('settings.access.save', { access: { userId: u.user_id, vehicleId: v.vehicle_id, access: mode, excluded: Object.keys(hidden) } }, function (m) { msg.textContent = m; });
      saveBtn.disabled = false;
      if (!res) return;
      dirty = false;
      forget(function (k) { return k === SETTINGS_KEY; });
      toast('Accès enregistré');
      sync();
    });
    box.append(msg, saveBtn);

    function sync() {
      Object.keys(tileButtons).forEach(function (k) {
        tileButtons[k].classList.toggle('on', k === mode);
        tileButtons[k].setAttribute('aria-pressed', k === mode ? 'true' : 'false');
      });
      zone.classList.toggle('hidden', mode !== 'restricted');
      Object.keys(topicButtons).forEach(function (k) {
        const off = !!hidden[k];
        topicButtons[k].classList.toggle('off', off);
        topicButtons[k].setAttribute('aria-pressed', off ? 'false' : 'true');
        topicButtons[k].querySelector('.topic-state').textContent = off ? 'Masqué' : 'Visible';
      });
      saveBtn.classList.toggle('btn-primary', dirty);
      saveBtn.classList.toggle('btn-ghost', !dirty);
      saveBtn.textContent = dirty ? 'Enregistrer cet accès' : 'Accès à jour';
    }
    sync();
    return { node: box };
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

      function store(lists) {
        d.lists = lists;
        put(SETTINGS_KEY, Object.assign({}, cached(SETTINGS_KEY), { lists: lists }));
        refreshLists();
      }

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
          store(res.lists);
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
          store(res.lists);
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
            store(res.lists);
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
    drive.appendChild(el('p', 'note', 'Les photos sont rangées dans le dossier « MOBYLYTY photos » de ton Google Drive, en privé. Les supprimer dans l\'appli les envoie aussi à la corbeille de ton Drive.'));
    view.appendChild(drive);
  }
})();
