/* MOBYLYTY : assistant Gemini (clé personnelle de chaque personne) et lecture de factures / tickets. */
'use strict';

const AI_SUGGESTIONS = [
  'Qu\'est-ce que je dois prévoir en ce moment ?',
  'Combien ai-je dépensé cette année, par véhicule ?',
  'Quelle est la consommation moyenne de mes véhicules ?',
  'Où en sont mes projets ?'
];
let aiHistory = { owner: null, messages: [] };

/** Carte d'accès à l'assistant, affichée sur l'accueil. */
function assistantEntry() {
  const b = button('', 'assistant-card', function () { go(link(state.ai && state.ai.ready ? 'assistant' : 'reglages', state.ai && state.ai.ready ? '' : 'assistant')); });
  b.appendChild(el('span', 'assistant-spark', '✨'));
  const t = el('span');
  t.appendChild(el('b', null, "Demander à l'assistant"));
  t.appendChild(el('small', null, state.ai && state.ai.ready ? 'Échéances, dépenses, consommation…' : 'Branche ta clé Gemini pour l\'activer'));
  b.appendChild(t);
  return b;
}

// ===== Discussion =====
addRoute('assistant', function () {
  const view = mountView('home');
  view.appendChild(backLink('Accueil', function () { goBack(link()); }));
  view.appendChild(el('h1', 'page-title', 'Assistant'));
  if (!state.ai || !state.ai.ready) {
    view.appendChild(emptyState("L'assistant utilise ta clé Gemini personnelle, gratuite. Elle se branche en une minute.", 'Brancher ma clé', function () { go(link('reglages', 'assistant')); }));
    return;
  }
  if (aiHistory.owner !== state.user.user_id) aiHistory = { owner: state.user.user_id, messages: [] };

  const log = el('div', 'chat');
  log.setAttribute('aria-live', 'polite');
  const sugg = el('div', 'chat-suggestions');
  const form = el('form', 'chat-form');
  const input = el('input');
  input.placeholder = 'Pose ta question…';
  input.maxLength = 800;
  input.autocomplete = 'off';
  input.setAttribute('aria-label', 'Ta question');
  const send = el('button', 'btn btn-primary', 'Envoyer');
  send.type = 'submit';
  form.append(input, send);
  view.append(log, sugg, form, el('p', 'note', "L'assistant ne voit que ce que tu as le droit de voir, et ne peut rien modifier. Vérifie les montants importants."));

  function bubble(role, text) {
    const b = el('div', 'bubble ' + (role === 'user' ? 'me' : 'bot'));
    b.textContent = text;
    log.appendChild(b);
    b.scrollIntoView({ block: 'end', behavior: REDUCED_MOTION ? 'auto' : 'smooth' });
    return b;
  }
  aiHistory.messages.forEach(function (m) { bubble(m.role, m.text); });
  if (!aiHistory.messages.length) {
    AI_SUGGESTIONS.forEach(function (q) { sugg.appendChild(button(q, 'tab', function () { ask(q); })); });
  }

  async function ask(question) {
    question = String(question || '').trim();
    if (!question) return;
    sugg.replaceChildren();
    input.value = '';
    bubble('user', question);
    const wait = bubble('model', '…');
    wait.classList.add('typing');
    send.disabled = true;
    input.disabled = true;
    const history = aiHistory.messages.slice(-6);
    let failed = null;
    const data = await send_('ai.ask', { question: question, history: history }, function (m) { failed = m; });
    send.disabled = false;
    input.disabled = false;
    wait.classList.remove('typing');
    if (!data) { wait.classList.add('error'); wait.textContent = failed || 'Impossible de répondre pour le moment.'; input.focus(); return; }
    wait.textContent = data.answer;
    aiHistory.messages.push({ role: 'user', text: question }, { role: 'model', text: data.answer });
    input.focus();
  }
  form.addEventListener('submit', function (e) { e.preventDefault(); ask(input.value); });
});

// `send` est le nom d'une variable locale ci-dessus : on garde un alias vers la fonction commune
const send_ = send;

// ===== Lecture d'une facture ou d'un ticket =====
/** Bouton « Scanner » : photo -> Gemini -> champs pré-remplis (rien n'est enregistré sans validation). */
function scanButton(kind, label, apply) {
  const b = button('📄 ' + label, 'btn btn-ghost btn-block scan-btn', async function () {
    if (!state.ai || !state.ai.ready) { go(link('reglages', 'assistant')); return; }
    const files = await pickImages(false);
    if (!files.length) return;
    b.disabled = true;
    toast('Lecture du document…');
    try {
      const img = await readImage(files[0]);
      const data = toJpegBase64(img, 1600, 0.8, 3000000);
      const res = await send_('ai.scan', { kind: kind, image: data }, toast);
      if (res) {
        const n = Object.keys(res.fields).length;
        if (!n) toast("Je n'ai rien pu lire sur ce document.");
        else { apply(res.fields); toast('Document lu : vérifie les champs avant d\'enregistrer'); }
      }
    } catch (err) { toast(err.message); }
    b.disabled = false;
  });
  return b;
}

/** Remplit un champ de formulaire (créé par buildForm) en déclenchant ses événements. */
function fillControl(f, name, value) {
  const c = f.controls[name];
  if (!c || value === undefined || value === null) return;
  c.input.value = typeof value === 'number' ? String(value).replace('.', ',') : value;
  c.input.dispatchEvent(new Event('input', { bubbles: true }));
  c.input.dispatchEvent(new Event('change', { bubbles: true }));
}

// ===== Réglages de l'assistant (clé personnelle) =====
function showAssistantSettings() {
  const view = mountView('settings');
  view.appendChild(backLink('Réglages', function () { goBack(link('reglages')); }));
  view.appendChild(el('h1', 'page-title', 'Assistant IA'));

  const status = el('section', 'logbook');
  status.appendChild(el('h3', null, 'Ma clé Gemini'));
  const stateLine = el('p', 'ai-state');
  const paintState = function () {
    stateLine.className = 'ai-state ' + (state.ai.ready ? 'on' : 'off');
    stateLine.textContent = state.ai.ready ? '✓ Branché, clé ' + state.ai.hint : 'Non branché';
  };
  paintState();
  status.appendChild(stateLine);

  const steps = el('ol', 'steps');
  [['Ouvre ', 'aistudio.google.com/apikey', ' avec ton compte Google.'], ['Clique sur « Créer une clé API » et copie-la.', null, ''], ['Colle-la ci-dessous, puis touche « Tester et enregistrer ».', null, '']].forEach(function (st) {
    const li = el('li');
    li.appendChild(document.createTextNode(st[0]));
    if (st[1]) {
      const a = el('a', 'ext-link', st[1]);
      a.href = 'https://aistudio.google.com/apikey';
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      li.appendChild(a);
    }
    li.appendChild(document.createTextNode(st[2]));
    steps.appendChild(li);
  });
  status.appendChild(steps);

  const f = buildForm([{ name: 'key', label: 'Clé Gemini', kind: 'text', max: 80 }], {}, {});
  const keyInput = f.controls.key.input;
  keyInput.type = 'password';
  keyInput.autocomplete = 'off';
  keyInput.autocapitalize = 'none';
  keyInput.placeholder = 'AIza…';
  const row = el('div', 'row-actions');
  const save = el('button', 'btn btn-primary btn-small', 'Tester et enregistrer');
  save.type = 'submit';
  row.appendChild(save);
  const remove = button('Retirer ma clé', 'btn btn-ghost btn-small', async function () {
    const ok = await confirmDialog('Retirer ta clé ?', "L'assistant et la lecture de factures seront désactivés pour toi. Ta clé reste valable dans Google AI Studio.", 'Retirer');
    if (!ok) return;
    const res = await send_('ai.saveKey', { key: '' }, f.message);
    if (!res) return;
    state.ai = res.ai;
    aiHistory = { owner: null, messages: [] };
    paintState();
    remove.classList.add('hidden');
    toast('Clé retirée');
  });
  if (!state.ai.ready) remove.classList.add('hidden');
  row.appendChild(remove);
  f.node.appendChild(row);
  f.node.addEventListener('submit', async function (e) {
    e.preventDefault();
    const v = f.read();
    if (!v || !v.key) { f.message('Colle ta clé Gemini.'); return; }
    f.busy(true);
    f.message('Test de la clé…');
    const res = await send_('ai.saveKey', { key: v.key }, f.message);
    f.busy(false);
    if (!res) return;
    state.ai = res.ai;
    keyInput.value = '';
    f.message('');
    paintState();
    remove.classList.remove('hidden');
    toast('Assistant branché');
  });
  status.appendChild(f.node);
  view.appendChild(status);

  const info = el('section', 'logbook');
  info.appendChild(el('h3', null, 'À savoir'));
  [
    "Chacun branche sa propre clé : les questions de Florence passent par son compte, celles de Bertrand par le sien.",
    "C'est gratuit dans la limite d'un quota fixé par Google (affiché dans Google AI Studio). Si la limite est atteinte, l'assistant te le dit : réessaie plus tard.",
    "Pour les personnes en Europe, les conditions de Google indiquent que les échanges ne servent pas à améliorer ses produits, même avec le quota gratuit. Vérifie sur ai.google.dev/terms.",
    "L'assistant reçoit uniquement les données que tu peux voir dans l'appli. Jamais les plaques, numéros de série ni emails.",
    "Ta clé est gardée côté serveur, jamais affichée en entier et jamais envoyée aux autres personnes."
  ].forEach(function (t) { info.appendChild(el('p', 'note', '• ' + t)); });
  info.appendChild(el('p', 'note', 'Modèle utilisé : ' + (state.ai.model || '')));
  view.appendChild(info);
}
