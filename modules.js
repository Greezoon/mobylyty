/* MOBYLYTY : entretien et rappels, dépenses, tâches et mémos, projets, historique. */
'use strict';
(function () {
  const SLUGS = { maintenance: 'entretien', expenses: 'depenses', tasks: 'taches', projects: 'projets' };
  const ICONS = { maintenance: '🔧', expenses: '🧾', tasks: '📝', projects: '🏁' };
  const TAB_LABELS = { maintenance: 'Entretien', expenses: 'Dépenses', tasks: 'Tâches', projects: 'Projets' };

  function schema(type) { return state.schemas[type]; }
  function canCreateOn(type, v) {
    const s = schema(type);
    return !!s && topicVisible(v, s.topic) && (v.can_edit || s.procheCanCreate);
  }
  function recKey(type, vehicleId) { return 'rec:' + type + ':' + vehicleId; }
  function loadRecords(type, vehicleId) { return function () { return api('records.list', { type: type, vehicleId: vehicleId }); }; }

  /** Rend un onglet de module : barre d'action + liste chargée depuis la mémoire puis le serveur. */
  function moduleTab(type, order, renderList) {
    addTab({
      slug: SLUGS[type], label: TAB_LABELS[type], order: order,
      visible: function (v) { return !!schema(type) && topicVisible(v, schema(type).topic); },
      render: function (box, v) {
        const body = el('div');
        box.appendChild(body);
        function paint() {
          load(recKey(type, v.vehicle_id), loadRecords(type, v.vehicle_id), function (data) {
            body.replaceChildren();
            renderList(body, v, data, paint);
          }, {
            loading: function () { body.replaceChildren(skeleton(3)); },
            error: function (msg, had) { if (!had) body.replaceChildren(errorBox(msg)); },
            stillHere: function () { return body.isConnected; }
          });
        }
        paint();
      }
    });
  }

  function addButton(type, v, data, label) {
    if (!data.can_create) return null;
    return button(label, 'btn btn-primary btn-small', function () { go(link('ajout', type, v.vehicle_id)); });
  }
  function toolbar(text, btn) {
    const bar = el('div', 'toolbar');
    bar.appendChild(el('p', null, text));
    if (btn) bar.appendChild(btn);
    return bar;
  }
  function openEdit(type, v, item) { go(link('edition', type, v.vehicle_id, item.id)); }

  // ===== Entretien =====
  function ruleLabel(item, v) {
    const unit = UNIT_SHORT[v.counter_unit] || 'km';
    const p = item.periodicity;
    switch (item.trigger_type) {
      case 'counter': return p ? 'Tous les ' + fmtNum(p, 0) + ' ' + unit : 'Au compteur';
      case 'hours': return p ? 'Toutes les ' + fmtNum(p, 0) + ' h' : 'Aux heures';
      case 'periodic':
        if (!p) return 'Périodique';
        return p % 12 === 0 ? 'Tous les ' + (p / 12 > 1 ? (p / 12) + ' ans' : 'ans') : 'Tous les ' + p + ' mois';
      case 'date': return item.next_due ? 'Échéance le ' + fmtDate(item.next_due) : 'À une date';
      default: return 'Sans rappel automatique';
    }
  }

  moduleTab('maintenance', 10, function (body, v, data) {
    const s = data.summary || {};
    const status = [s.overdue ? s.overdue + ' en retard' : '', s.soon ? s.soon + ' bientôt' : ''].filter(Boolean).join(', ');
    body.appendChild(toolbar(status || (data.items.length ? 'Tout est à jour' : 'Rappels d\'entretien'), addButton('maintenance', v, data, 'Ajouter un rappel')));
    if (!data.items.length) {
      body.appendChild(emptyState('Ajoute tes rappels : vidange tous les 15 000 km, contrôle technique tous les 2 ans, assurance à date fixe…',
        data.can_create ? 'Ajouter un rappel' : null, function () { go(link('ajout', 'maintenance', v.vehicle_id)); }));
      return;
    }
    const list = el('div', 'items');
    data.items.forEach(function (item) {
      const card = el(data.can_edit ? 'button' : 'div', 'item');
      if (data.can_edit) { card.type = 'button'; card.addEventListener('click', function () { openEdit('maintenance', v, item); }); }
      card.appendChild(el('span', 'item-title', item.title));
      card.appendChild(el('span', 'item-due ' + (item.alert || ''), item.due_label || ''));
      const sub = [labelOf('operation_type', item.type), ruleLabel(item, v)];
      if (item.last_performed) sub.push('fait le ' + fmtDate(item.last_performed) + (isEmpty(item.counter_at_performance) ? '' : ' à ' + fmtCounter(item.counter_at_performance, v.counter_unit)));
      card.appendChild(el('span', 'item-sub', sub.filter(Boolean).join(', ')));
      if (item.progress !== null && item.progress !== undefined && item.active) card.appendChild(gauge(item.progress, item.alert));
      if (data.can_edit && item.active) {
        const actions = el('div', 'row-actions');
        const done = button("C'est fait", 'btn btn-amber btn-small', function (e) {
          e.stopPropagation();
          go(link('fait', v.vehicle_id, item.id));
        });
        actions.appendChild(done);
        card.appendChild(actions);
      }
      list.appendChild(card);
    });
    body.appendChild(list);
  });

  addRoute('fait', function (parts) { showDoneForm(parts[0], parts[1]); });

  async function showDoneForm(vehicleId, id) {
    const view = mountView('garage');
    const back = function () { goBack(link('v', vehicleId, 'entretien')); };
    view.appendChild(backLink('Entretien', back));
    const holder = el('div');
    view.appendChild(holder);
    const item = await findRecord('maintenance', vehicleId, id, holder);
    if (!item || !view.isConnected) return;
    const v = vehicleFromCache(vehicleId) || {};
    holder.appendChild(el('h1', 'page-title', item.title));
    const counterVisible = 'current_counter' in v;
    const f = buildForm([
      { section: 'Réalisation' },
      { name: 'date', label: 'Fait le', kind: 'date', required: true, defaultToday: true },
      counterVisible ? { name: 'counter', label: 'Au compteur', kind: 'number', default: isEmpty(v.current_counter) ? '' : String(v.current_counter) } : null,
      topicVisible(v, 'finances') ? { name: 'cost', label: 'Coût (€)', kind: 'number', help: 'Un coût crée automatiquement une dépense.' } : null,
      { name: 'performed_by', label: 'Fait par', kind: 'choice', group: 'performed_by' },
      { name: 'comment', label: 'Commentaire', kind: 'longtext' }
    ].filter(Boolean), {}, { isCreate: true });
    f.node.appendChild(formActions('Enregistrer', back));
    f.node.addEventListener('submit', async function (e) {
      e.preventDefault();
      const values = f.read();
      if (!values) return;
      f.busy(true);
      const data = await send('maintenance.done', { id: id, done: values }, f.message);
      f.busy(false);
      if (!data) return;
      forgetVehicle(vehicleId);
      toast('Entretien enregistré');
      back();
    });
    holder.appendChild(f.node);
  }

  // ===== Dépenses =====
  moduleTab('expenses', 30, function (body, v, data) {
    const s = data.summary || { total: 0, by_category: {} };
    body.appendChild(toolbar(data.items.length ? 'Total : ' + fmtMoney(s.total) : 'Entretien, pièces, réparations…', addButton('expenses', v, data, 'Ajouter une dépense')));
    if (!data.items.length) {
      body.appendChild(emptyState('Aucune dépense pour le moment. Les pleins sont suivis dans l\'onglet Carburant.',
        data.can_create ? 'Ajouter une dépense' : null, function () { go(link('ajout', 'expenses', v.vehicle_id)); }));
      return;
    }
    const cats = Object.keys(s.by_category).sort(function (a, b) { return s.by_category[b] - s.by_category[a]; });
    const max = cats.length ? s.by_category[cats[0]] : 0;
    const bars = el('div', 'bars');
    cats.forEach(function (c) {
      const row = el('div', 'bar-row');
      row.appendChild(el('span', null, labelOf('expense_category', c)));
      row.appendChild(el('b', null, fmtMoney(s.by_category[c])));
      const track = el('span', 'track');
      const fill = el('i');
      fill.style.setProperty('--p', (max ? Math.round(s.by_category[c] / max * 100) : 0) + '%');
      track.appendChild(fill);
      row.appendChild(track);
      bars.appendChild(row);
    });
    body.appendChild(logbookWrap(bars));
    const list = el('div', 'items');
    data.items.forEach(function (item) {
      const card = el(data.can_edit ? 'button' : 'div', 'item');
      if (data.can_edit) { card.type = 'button'; card.addEventListener('click', function () { openEdit('expenses', v, item); }); }
      card.appendChild(el('span', 'item-title', item.description));
      card.appendChild(el('span', 'item-amount', fmtMoney(item.amount)));
      card.appendChild(el('span', 'item-sub', [fmtDateLong(item.date), labelOf('expense_category', item.category), item.supplier].filter(Boolean).join(', ')));
      list.appendChild(card);
    });
    body.appendChild(list);
  });

  function logbookWrap(node) {
    const box = el('section', 'logbook');
    box.style.paddingTop = '14px';
    box.appendChild(node);
    return box;
  }

  // ===== Tâches et mémos =====
  const CHECK_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';

  moduleTab('tasks', 40, function (body, v, data) {
    const open = data.items.filter(function (i) { return i.type !== 'memo' && i.open; });
    const memos = data.items.filter(function (i) { return i.type === 'memo'; });
    const closed = data.items.filter(function (i) { return i.type !== 'memo' && !i.open; });
    body.appendChild(toolbar(open.length ? open.length + (open.length > 1 ? ' tâches à faire' : ' tâche à faire') : 'Tâches et mémos', addButton('tasks', v, data, 'Ajouter')));
    if (!data.items.length) {
      body.appendChild(emptyState('Note ici ce qu\'il reste à faire sur ce véhicule, ou un simple mémo.',
        data.can_create ? 'Ajouter une tâche' : null, function () { go(link('ajout', 'tasks', v.vehicle_id)); }));
      return;
    }
    const list = el('div', 'items');
    open.forEach(function (t) { list.appendChild(taskCard(v, data, t)); });
    body.appendChild(list);

    if (memos.length) {
      body.appendChild(el('h2', 'block-title', 'Mémos'));
      const ml = el('div', 'items');
      memos.forEach(function (m) {
        const card = el(data.can_edit ? 'button' : 'div', 'item memo');
        if (data.can_edit) { card.type = 'button'; card.addEventListener('click', function () { openEdit('tasks', v, m); }); }
        card.appendChild(el('span', 'item-title', m.title));
        if (m.description) card.appendChild(el('span', 'item-sub', m.description));
        ml.appendChild(card);
      });
      body.appendChild(ml);
    }
    if (closed.length) {
      const cl = el('div', 'items hidden');
      closed.forEach(function (t) { cl.appendChild(taskCard(v, data, t)); });
      const toggle = button('Voir les tâches terminées (' + closed.length + ')', 'btn btn-ghost btn-small toggle-more', function () {
        cl.classList.toggle('hidden');
        toggle.textContent = cl.classList.contains('hidden') ? 'Voir les tâches terminées (' + closed.length + ')' : 'Masquer les tâches terminées';
      });
      body.append(toggle, cl);
      cl.style.marginTop = '10px';
    }
  });

  function taskCard(v, data, t) {
    const card = el('div', 'item task' + (t.open ? '' : ' closed'));
    const check = button('', 'checkbtn' + (t.open ? '' : ' done'));
    check.innerHTML = CHECK_SVG;
    check.setAttribute('aria-label', t.open ? 'Marquer comme terminée' : 'Terminée');
    if (t.open && data.can_create) {
      check.addEventListener('click', async function () {
        check.classList.add('done');
        check.disabled = true;
        const res = await send('tasks.complete', { id: t.id }, function (m) { check.classList.remove('done'); check.disabled = false; toast(m); });
        if (!res) return;
        forgetVehicle(v.vehicle_id);
        toast('Tâche terminée');
        setTimeout(function () { if (card.isConnected) route(); }, REDUCED_MOTION ? 0 : 450);
      });
    } else {
      check.disabled = true;
    }
    card.appendChild(check);
    const title = el('span', 'item-title');
    if (t.open && t.priority && t.priority !== 'normal') title.appendChild(el('span', 'prio ' + t.priority));
    title.appendChild(document.createTextNode(t.title));
    card.appendChild(title);
    card.appendChild(el('span', 'item-due ' + (t.open ? t.alert : ''), t.open ? (t.due_label || '') : (t.completion_date ? 'Le ' + fmtDate(t.completion_date) : '')));
    const sub = [];
    if (t.open && t.priority) sub.push('Priorité ' + String(labelOf('priority', t.priority)).toLowerCase());
    if (t.open && t.status === 'in_progress') sub.push('en cours');
    if (t.description) sub.push(t.description);
    if (sub.length) card.appendChild(el('span', 'item-sub', sub.join(', ')));
    if (data.can_edit) {
      title.style.cursor = 'pointer';
      title.addEventListener('click', function () { openEdit('tasks', v, t); });
    }
    return card;
  }

  // ===== Projets =====
  function projectCard(v, data, p) {
    const card = button('', 'item', function () { go(link('projet', v.vehicle_id, p.id)); });
    card.appendChild(el('span', 'item-title', p.name));
    card.appendChild(el('span', 'badge', labelOf('project_status', p.status)));
    card.appendChild(gauge((p.progress || 0) / 100, p.status === 'completed' ? '' : 'soon'));
    const sub = [];
    sub.push(p.parts_total ? p.parts_done + ' pièce' + (p.parts_done > 1 ? 's' : '') + ' sur ' + p.parts_total : p.progress + ' % réalisé');
    if ('actual_spend' in p) sub.push(fmtMoney(p.actual_spend || 0) + ' dépensés' + (p.remaining_cost ? ', ' + fmtMoney(p.remaining_cost) + ' à prévoir' : ''));
    if (p.planned_end && p.status !== 'completed') sub.push('fin le ' + fmtDate(p.planned_end));
    card.appendChild(el('span', 'item-sub', sub.join(', ')));
    return card;
  }

  moduleTab('projects', 50, function (body, v, data) {
    body.appendChild(toolbar('Restaurations et améliorations', addButton('projects', v, data, 'Nouveau projet')));
    if (!data.items.length) {
      body.appendChild(emptyState('Suis tes chantiers : liste de pièces à cocher avec liens et prix, avancement et argent dépensé.',
        data.can_create ? 'Nouveau projet' : null, function () { go(link('ajout', 'projects', v.vehicle_id)); }));
      return;
    }
    const list = el('div', 'items');
    data.items.forEach(function (p) { list.appendChild(projectCard(v, data, p)); });
    body.appendChild(list);
  });

  function safeUrl(u) { return /^https?:\/\//i.test(String(u || '')) ? u : null; }

  addRoute('projet', function (parts) { showProject(parts[0], parts[1]); });

  function showProject(vehicleId, projectId) {
    const view = mountView('garage');
    const tabLink = link('v', vehicleId, 'projets');
    view.appendChild(backLink('Projets', function () { goBack(tabLink); }));
    const body = el('div');
    view.appendChild(body);
    const key = recKey('projects', vehicleId);

    function find(data) { return data.items.find(function (i) { return i.id === projectId; }); }
    function paint(data) {
      const p = find(data);
      if (!p) { body.replaceChildren(errorBox('Projet introuvable.')); return; }
      renderProject(body, vehicleId, p, data, refresh);
    }
    /** Redemande les projets sans quitter la page (la position de défilement est conservée). */
    async function refresh() {
      const res = await send('records.list', { type: 'projects', vehicleId: vehicleId }, toast);
      if (!res) return;
      put(key, res);
      forgetVehicle(vehicleId);
      put(key, res);
      if (body.isConnected) paint(res);
    }
    load(key, loadRecords('projects', vehicleId), paint, {
      loading: function () { body.replaceChildren(skeleton(3)); },
      error: function (msg, had) { if (!had) body.replaceChildren(errorBox(msg)); },
      stillHere: function () { return view.isConnected; }
    });
  }

  function projectRange(p) {
    if (p.planned_start && p.planned_end) return 'Du ' + fmtDate(p.planned_start) + ' au ' + fmtDate(p.planned_end);
    if (p.planned_start) return 'Débuté le ' + fmtDate(p.planned_start);
    if (p.planned_end) return "Jusqu'au " + fmtDate(p.planned_end);
    return '';
  }

  function renderProject(body, vehicleId, p, data, refresh) {
    body.replaceChildren();
    const head = el('section', 'vhead memory-head');
    const top = el('div', 'vhead-top');
    top.appendChild(el('span', 'car-icon', '🏁'));
    const names = el('div');
    names.appendChild(el('h1', null, p.name));
    names.appendChild(el('div', 'vhead-desc', [labelOf('project_status', p.status), projectRange(p)].filter(Boolean).join(', ')));
    top.appendChild(names);
    head.appendChild(top);
    if (p.description) head.appendChild(el('p', 'vhead-desc memory-meta', p.description));
    const g = gauge((p.progress || 0) / 100, p.status === 'completed' ? '' : 'soon');
    g.classList.add('on-dark');
    head.appendChild(g);
    head.appendChild(el('p', 'vhead-desc memory-meta', p.parts_total
      ? p.parts_done + ' pièce' + (p.parts_done > 1 ? 's' : '') + ' sur ' + p.parts_total + ' (' + p.progress + ' %)'
      : p.progress + ' % réalisé'));
    if (data.can_edit) {
      const actions = el('div', 'row-actions');
      actions.appendChild(button('Modifier le projet', 'btn btn-ghost btn-small', function () { go(link('edition', 'projects', vehicleId, p.id)); }));
      head.appendChild(actions);
    }
    body.appendChild(head);

    if ('actual_spend' in p) {
      const total = (p.actual_spend || 0) + (p.remaining_cost || 0);
      const rows = [
        ['Dépensé', fmtMoney(p.actual_spend || 0)],
        ['Reste à dépenser', fmtMoney(p.remaining_cost || 0)],
        ['Total prévu', fmtMoney(total)]
      ];
      if (!isEmpty(p.planned_budget)) rows.push(['Budget', fmtMoney(p.planned_budget)]);
      const money = logbook('Argent', rows);
      if (p.planned_budget && total > p.planned_budget) {
        money.appendChild(el('p', 'note over', 'Le total prévu dépasse le budget de ' + fmtMoney(total - p.planned_budget) + '.'));
      }
      body.appendChild(money);
    }

    body.appendChild(el('h2', 'block-title', 'Pièces et étapes'));
    const list = el('div', 'items');
    if (!p.parts.length) list.appendChild(emptyState('Ajoute les pièces ou étapes du projet, avec un lien et un prix. Coche-les au fur et à mesure : l\'argent dépensé suit.'));
    p.parts.forEach(function (part) { list.appendChild(partRow(vehicleId, p, part, data, refresh)); });
    body.appendChild(list);

    if (data.can_edit) body.appendChild(partAddForm(vehicleId, p, refresh));
    body.appendChild(el('p', 'note', "Une pièce cochée avec un prix devient automatiquement une dépense du véhicule : inutile de la saisir deux fois."));
  }

  const CHECK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';

  function partRow(vehicleId, project, part, data, refresh) {
    const row = el('div', 'item task part' + (part.done ? ' closed' : ''));
    const check = button('', 'checkbtn' + (part.done ? ' done' : ''));
    check.innerHTML = CHECK;
    check.setAttribute('aria-label', part.done ? 'Décocher' : 'Cocher');
    if (!data.can_edit) check.disabled = true;
    check.addEventListener('click', async function () {
      const next = !check.classList.contains('done');
      check.classList.toggle('done', next);
      check.disabled = true;
      const res = await send('parts.toggle', { id: part.id, done: next }, function (m) { check.classList.toggle('done', !next); toast(m); });
      check.disabled = false;
      if (!res) return;
      forgetVehicle(vehicleId);
      stale(function (k) { return k.indexOf('hist:') === 0 || k === recKey('expenses', vehicleId); });
      setTimeout(refresh, REDUCED_MOTION ? 0 : 350);
    });
    row.appendChild(check);
    const title = el('span', 'item-title', part.name);
    row.appendChild(title);
    row.appendChild(el('span', 'item-amount', isEmpty(part.price) ? '' : fmtMoney(part.price)));
    const sub = el('span', 'item-sub');
    const url = safeUrl(part.url);
    if (url) {
      const a = el('a', 'ext-link', 'Voir le lien');
      a.href = url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      sub.appendChild(a);
    }
    if (part.done && part.done_date) sub.appendChild(document.createTextNode((url ? ', ' : '') + 'fait le ' + fmtDate(part.done_date)));
    if (sub.childNodes.length) row.appendChild(sub);
    if (data.can_edit) {
      title.style.cursor = 'pointer';
      title.addEventListener('click', function () { openPartSheet(vehicleId, project, part, refresh); });
    }
    return row;
  }

  function partFields(seesPrice) {
    return [
      { name: 'name', label: 'Pièce ou étape', kind: 'text', max: 100, required: true, placeholder: 'Ex. Kit embrayage' },
      { name: 'url', label: 'Lien', kind: 'url', placeholder: 'https://…' },
      seesPrice ? { name: 'price', label: 'Prix (€)', kind: 'number' } : null
    ].filter(Boolean);
  }

  function partAddForm(vehicleId, project, refresh) {
    const seesPrice = 'actual_spend' in project;
    const box = el('section', 'logbook add-part');
    box.appendChild(el('h3', null, 'Ajouter une pièce'));
    const f = buildForm(partFields(seesPrice), {}, { isCreate: true });
    const add = el('button', 'btn btn-primary btn-small', 'Ajouter');
    add.type = 'submit';
    f.node.appendChild(add);
    f.node.addEventListener('submit', async function (e) {
      e.preventDefault();
      const values = f.read();
      if (!values) return;
      values.project_id = project.id;
      f.busy(true);
      const res = await send('records.create', { type: 'parts', vehicleId: vehicleId, record: values }, f.message);
      f.busy(false);
      if (!res) return;
      forgetVehicle(vehicleId);
      toast('Pièce ajoutée');
      f.node.reset();
      refresh();
    });
    box.appendChild(f.node);
    return box;
  }

  function openPartSheet(vehicleId, project, part, refresh) {
    const seesPrice = 'actual_spend' in project;
    openSheet(function (sheet, close) {
      sheet.appendChild(el('h2', null, 'Modifier la pièce'));
      const f = buildForm(partFields(seesPrice), part, {});
      f.node.appendChild(formActions('Enregistrer', close));
      f.node.addEventListener('submit', async function (e) {
        e.preventDefault();
        const values = f.read();
        if (!values) return;
        f.busy(true);
        const res = await send('records.update', { type: 'parts', id: part.id, record: values }, f.message);
        f.busy(false);
        if (!res) return;
        forgetVehicle(vehicleId);
        close();
        toast('Pièce modifiée');
        refresh();
      });
      sheet.appendChild(f.node);
      const del = button('Supprimer cette pièce', 'btn btn-danger btn-block', async function () {
        const ok = await confirmDialog('Supprimer « ' + part.name + ' » ?', part.done && part.price ? 'La dépense créée en la cochant sera aussi supprimée.' : 'Cette action est irréversible.');
        if (!ok) return;
        const res = await send('records.delete', { type: 'parts', id: part.id }, toast);
        if (!res) return;
        forgetVehicle(vehicleId);
        toast('Pièce supprimée');
        refresh();
      });
      sheet.appendChild(del);
    });
  }

  // ===== Historique =====
  addTab({
    slug: 'historique', label: 'Historique', order: 60,
    visible: function (v) { return topicVisible(v, 'history'); },
    render: function (box, v) {
      const body = el('div');
      box.appendChild(body);
      load('hist:' + v.vehicle_id, function () { return api('history.list', { vehicleId: v.vehicle_id }); }, function (data) {
        body.replaceChildren();
        if (!data.events.length) { body.appendChild(emptyState('L\'historique se remplit tout seul : pleins, entretiens, dépenses, projets.')); return; }
        body.appendChild(timeline(data.events, false, data.counter_unit));
      }, {
        loading: function () { body.replaceChildren(skeleton(3)); },
        error: function (msg, had) { if (!had) body.replaceChildren(errorBox(msg)); },
        stillHere: function () { return body.isConnected; }
      });
    }
  });

  // ===== Formulaires d'ajout et de modification =====
  addRoute('ajout', function (parts) { showRecordForm(parts[0], parts[1], null); });
  addRoute('edition', function (parts) { showRecordForm(parts[0], parts[1], parts[2]); });

  /** Retrouve un élément dans la mémoire, sinon le redemande. */
  async function findRecord(type, vehicleId, id, holder) {
    const key = recKey(type, vehicleId);
    let data = cached(key);
    let item = data && data.items.find(function (i) { return i.id === id; });
    if (item) return item;
    holder.appendChild(skeleton(3));
    const fresh = await send('records.list', { type: type, vehicleId: vehicleId }, function (m) { holder.replaceChildren(errorBox(m)); });
    if (!fresh) return null;
    put(key, fresh);
    holder.replaceChildren();
    item = fresh.items.find(function (i) { return i.id === id; });
    if (!item) holder.appendChild(errorBox('Élément introuvable.'));
    return item || null;
  }

  async function showRecordForm(type, vehicleId, id) {
    const s = schema(type);
    const view = mountView('garage');
    const tabLink = link('v', vehicleId, SLUGS[type]);
    const fromVehicle = String(state.prevHash || '').indexOf(link('v', vehicleId)) === 0;
    const back = function () { goBack(tabLink); };
    // Après enregistrement : retour à l'onglet du véhicule, même si on venait de l'accueil
    const afterSave = function () {
      if (!fromVehicle) return replaceRoute(tabLink);
      state.pendingTab = SLUGS[type];
      goBack(tabLink);
    };
    view.appendChild(backLink(TAB_LABELS[type] || 'Fiche', back));
    if (!s) { view.appendChild(errorBox('Module inconnu.')); return; }
    view.appendChild(el('h1', 'page-title', id ? 'Modifier' : 'Ajouter ' + s.singular));
    const holder = el('div');
    view.appendChild(holder);

    const v = vehicleFromCache(vehicleId);
    let item = null;
    if (id) {
      item = await findRecord(type, vehicleId, id, holder);
      if (!item || !view.isConnected) return;
    }

    // Liste des projets du véhicule pour rattacher une dépense
    const refOptions = {};
    if (s.fields.some(function (f) { return f.kind === 'ref'; }) && v && topicVisible(v, 'projects')) {
      let projects = cached(recKey('projects', vehicleId));
      if (!projects) {
        projects = await send('records.list', { type: 'projects', vehicleId: vehicleId }, function () {});
        if (projects) put(recKey('projects', vehicleId), projects);
      }
      refOptions.project_id = ((projects && projects.items) || []).map(function (p) { return [p.id, p.name]; });
    }
    if (!view.isConnected) return;

    const fields = s.fields.filter(function (f) { return f.kind !== 'ref' || (refOptions[f.name] && refOptions[f.name].length); });
    const f = buildForm(fields, item || {}, { isCreate: !id, hiddenTopics: v ? v.hidden_topics : [], refOptions: refOptions });
    f.node.appendChild(formActions(id ? 'Enregistrer' : 'Ajouter', back));
    f.node.addEventListener('submit', async function (e) {
      e.preventDefault();
      const values = f.read();
      if (!values) return;
      f.busy(true);
      const data = await send(id ? 'records.update' : 'records.create', { type: type, vehicleId: vehicleId, id: id, record: values }, f.message);
      f.busy(false);
      if (!data) return;
      forgetVehicle(vehicleId);
      toast(id ? 'Modifications enregistrées' : 'Ajouté');
      afterSave();
    });
    holder.replaceChildren(f.node);

    if (id) {
      const zone = el('div', 'danger-zone');
      zone.appendChild(button('Supprimer', 'btn btn-danger', async function () {
        const name = item.title || item.name || item.description || '';
        const extra = type === 'maintenance' ? '\nLes entretiens déjà faits restent dans l\'historique.' : '';
        const ok = await confirmDialog('Supprimer « ' + name + ' » ?', 'Cette action est irréversible.' + extra);
        if (!ok) return;
        const res = await send('records.delete', { type: type, id: id }, f.message);
        if (!res) return;
        forgetVehicle(vehicleId);
        toast('Supprimé');
        afterSave();
      }));
      view.appendChild(zone);
    }
  }

  // ===== Menu « + » =====
  [['maintenance', 20, 'Nouveau rappel d\'entretien', 'Vidange, contrôle technique, assurance…'],
   ['expenses', 30, 'Nouvelle dépense', 'Pièces, réparation, frais…'],
   ['tasks', 40, 'Nouvelle tâche ou mémo', null],
   ['projects', 50, 'Nouveau projet', 'Restauration, amélioration']].forEach(function (a) {
    addQuickAction({
      order: a[1], icon: ICONS[a[0]], label: a[2], hint: a[3], needsVehicle: true,
      allowed: function (v) { return canCreateOn(a[0], v); },
      run: function (vehicleId) { go(link('ajout', a[0], vehicleId)); }
    });
  });
})();
