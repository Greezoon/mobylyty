/* MOBYLYTY : photos (miniatures, envoi depuis le téléphone, galerie, visionneuse, photo de profil). */
'use strict';

// ===== Miniatures : mémoire + stockage local, demandées par lots =====
const THUMB_KEY = 'mt:';
const thumbMem = {};
let thumbPending = {};
let thumbTimer = null;

function storedThumb(id) { try { return localStorage.getItem(THUMB_KEY + id); } catch (e) { return null; } }
function storeThumb(id, url) {
  try { localStorage.setItem(THUMB_KEY + id, url); }
  catch (e) { clearThumbStore(); }
}
function clearThumbStore() {
  try { Object.keys(localStorage).filter(function (k) { return k.indexOf(THUMB_KEY) === 0; }).forEach(function (k) { localStorage.removeItem(k); }); } catch (e) { /* stockage indisponible */ }
  Object.keys(thumbMem).forEach(function (k) { delete thumbMem[k]; });
}

function thumbUrl(id) {
  if (!id) return Promise.resolve(null);
  if (thumbMem[id]) return Promise.resolve(thumbMem[id]);
  const stored = storedThumb(id);
  if (stored) { thumbMem[id] = stored; return Promise.resolve(stored); }
  return new Promise(function (resolve) {
    (thumbPending[id] = thumbPending[id] || []).push(resolve);
    clearTimeout(thumbTimer);
    thumbTimer = setTimeout(flushThumbs, 40);
  });
}

async function flushThumbs() {
  const batch = thumbPending;
  thumbPending = {};
  const ids = Object.keys(batch);
  for (let i = 0; i < ids.length; i += 12) {
    const chunk = ids.slice(i, i + 12);
    let images = {};
    try {
      const res = await api('photos.thumbs', { ids: chunk });
      if (res.ok) images = res.data.images || {};
    } catch (err) { /* pas de réseau : les miniatures restent vides */ }
    chunk.forEach(function (id) {
      const url = images[id] || null;
      if (url) { thumbMem[id] = url; storeThumb(id, url); }
      batch[id].forEach(function (resolve) { resolve(url); });
    });
  }
}

/** Affiche la miniature d'une photo dans un élément (fond d'image), dès qu'elle est prête. */
function paintThumb(node, photoId, onReady) {
  thumbUrl(photoId).then(function (url) {
    if (!url || !node.isConnected) return;
    node.style.backgroundImage = 'url("' + url + '")';
    node.classList.add('has-photo');
    if (onReady) onReady(url);
  });
}

/** Pastille ronde d'un véhicule : sa photo de profil si elle existe, sinon l'icône de sa catégorie. */
function vehicleIcon(v, extraClass) {
  const node = el('span', 'car-icon' + (extraClass ? ' ' + extraClass : ''), iconOf(v.category));
  if (v.main_photo_id) paintThumb(node, v.main_photo_id, function () { node.textContent = ''; });
  return node;
}

// ===== Choix et préparation des images =====
function pickImages(multiple) {
  return new Promise(function (resolve) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.multiple = !!multiple;
    input.style.display = 'none';
    document.body.appendChild(input);
    input.addEventListener('change', function () {
      const files = Array.prototype.slice.call(input.files || []);
      input.remove();
      resolve(files);
    });
    input.click();
  });
}

function readImage(file) {
  return new Promise(function (resolve, reject) {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = function () { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = function () { URL.revokeObjectURL(url); reject(new Error("Cette image n'est pas dans un format pris en charge.")); };
    img.src = url;
  });
}

const PHOTO_PRESETS = { standard: [1600, 0.8], high: [2560, 0.9], max: [4096, 0.92] };

/** JPEG redimensionné en base64. Si le résultat dépasse maxLen, on baisse d'abord la qualité, puis la taille. */
function toJpegBase64(img, maxSide, quality, maxLen) {
  maxLen = maxLen || 7500000;
  const srcW = img.naturalWidth || img.width;
  const srcH = img.naturalHeight || img.height;
  let side = maxSide;
  let q = quality;
  let data = '';
  for (let attempt = 0; attempt < 8; attempt++) {
    const k = Math.min(1, side / Math.max(srcW, srcH));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(srcW * k));
    canvas.height = Math.max(1, Math.round(srcH * k));
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    data = canvas.toDataURL('image/jpeg', q).split(',')[1];
    if (data.length <= maxLen) return data;
    if (q > 0.6) q -= 0.1; else side = Math.round(side * 0.85);
  }
  return data;
}

const ORIGINAL_MAX_BYTES = 5500000;

function fileToBase64(file) {
  return new Promise(function (resolve, reject) {
    const r = new FileReader();
    r.onload = function () { resolve(String(r.result).split(',')[1]); };
    r.onerror = function () { reject(new Error('Lecture du fichier impossible.')); };
    r.readAsDataURL(file);
  });
}

/**
 * Envoie des photos une par une, avec un écran de recadrage pour chacune.
 * base = { vehicleIds, memoryId, setAsMain, description } ; opts = { crop: false pour tout envoyer tel quel, title }.
 * Qualité « Maximale » : une photo JPEG de moins de 5,5 Mo est envoyée telle quelle, octet pour octet.
 * Renvoie le nombre de photos envoyées.
 */
async function uploadPhotos(files, base, opts) {
  opts = opts || {};
  let skipCrop = opts.crop === false;
  let done = 0;
  for (let i = 0; i < files.length; i++) {
    let img;
    try { img = await readImage(files[i]); } catch (err) { toast(err.message); break; }
    let source = img;
    let image = null;

    if (!skipCrop) {
      const choice = await openCropper(img, { index: i, total: files.length, title: opts.title });
      if (choice.action === 'cancel') break;
      if (choice.action === 'skipAll') skipCrop = true;
      if (choice.action === 'crop') {
        source = choice.canvas;
        image = toJpegBase64(choice.canvas, 8192, 0.95, 7500000);
      }
    }

    toast('Envoi de la photo ' + (i + 1) + ' sur ' + files.length + '…');
    let thumb;
    try {
      const level = getPref('photo', 'max');
      const preset = PHOTO_PRESETS[level] || PHOTO_PRESETS.max;
      if (!image) {
        const original = level === 'max' && /^image\/jpe?g$/i.test(files[i].type) && files[i].size <= ORIGINAL_MAX_BYTES;
        image = original ? await fileToBase64(files[i]) : toJpegBase64(img, preset[0], preset[1], 7500000);
      }
      thumb = toJpegBase64(source, 480, 0.75, 380000);
    } catch (err) { toast(err.message); break; }

    let failed = false;
    const data = await send('photos.upload', { photo: Object.assign({}, base, { image: image, thumb: thumb }) }, function (m) { failed = true; toast(m); });
    if (!data || failed) break;
    done++;
  }
  return done;
}

// ===== Recadrage =====
const CROP_RATIOS = [['', 'Libre'], ['1', '1:1'], ['1.3333', '4:3'], ['0.75', '3:4'], ['1.7778', '16:9']];

/**
 * Écran de recadrage. Renvoie { action: 'crop', canvas } | { action: 'whole' } | { action: 'skipAll' } | { action: 'cancel' }.
 * Glisse le cadre pour le déplacer, tire sur ses poignées pour le redimensionner.
 */
function openCropper(img, opts) {
  return new Promise(function (resolve) {
    closeLayer();
    const layer = $('layer');
    const box = el('div', 'cropper');
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');

    const top = el('div', 'crop-top');
    top.appendChild(el('b', null, (opts.title || 'Recadrer la photo') + (opts.total > 1 ? '  (' + (opts.index + 1) + ' sur ' + opts.total + ')' : '')));
    const cancel = button('✕', 'viewer-x static', function () { finish({ action: 'cancel' }); });
    cancel.setAttribute('aria-label', 'Annuler');
    top.appendChild(cancel);

    const stage = el('div', 'crop-stage');
    const view = document.createElement('canvas');
    view.className = 'crop-view';
    const rectEl = el('div', 'crop-rect');
    ['nw', 'ne', 'sw', 'se', 'n', 's', 'e', 'w'].forEach(function (h) {
      const handle = el('span', 'crop-handle ' + h + (h.length === 1 ? ' edge' : ''));
      handle.dataset.h = h;
      rectEl.appendChild(handle);
    });
    stage.append(view, rectEl);
    const info = el('p', 'crop-info');

    const tools = el('div', 'crop-tools');
    const ratioRow = el('div', 'chips-row');
    CROP_RATIOS.forEach(function (r, i) {
      const b = button(r[1], 'tab' + (i === 0 ? ' active' : ''), function () {
        ratio = r[0] ? Number(r[0]) : null;
        ratioRow.querySelectorAll('.tab').forEach(function (x) { x.classList.remove('active'); });
        b.classList.add('active');
        stage.classList.toggle('has-ratio', !!ratio);
        applyRatio();
      });
      ratioRow.appendChild(b);
    });
    const rotRow = el('div', 'row-actions crop-rot');
    rotRow.appendChild(button('↺ Pivoter', 'btn btn-ghost btn-small', function () { rotate(-90); }));
    rotRow.appendChild(button('↻ Pivoter', 'btn btn-ghost btn-small', function () { rotate(90); }));
    tools.append(ratioRow, rotRow);

    const actions = el('div', 'crop-actions');
    actions.appendChild(button('Recadrer et envoyer', 'btn btn-amber', function () { validate(true); }));
    actions.appendChild(button('Envoyer sans recadrer', 'btn btn-ghost', function () { validate(false); }));
    if (opts.total > 1) actions.appendChild(button('Tout envoyer sans recadrer', 'btn btn-ghost', function () { finish({ action: 'skipAll' }); }));
    box.append(top, stage, info, tools, actions);

    // ----- état
    let rot = 0, work = null, scale = 1, W = 0, H = 0, ratio = null;
    const rect = { x: 0, y: 0, w: 0, h: 0 };
    const MIN = 36;
    const clamp = function (v, lo, hi) { return Math.max(lo, Math.min(hi, v)); };

    function buildWork() {
      const sw = img.naturalWidth, sh = img.naturalHeight;
      const k = Math.min(1, 4096 / Math.max(sw, sh));
      const swapped = rot % 180 !== 0;
      work = document.createElement('canvas');
      work.width = Math.round((swapped ? sh : sw) * k);
      work.height = Math.round((swapped ? sw : sh) * k);
      const c = work.getContext('2d');
      c.translate(work.width / 2, work.height / 2);
      c.rotate(rot * Math.PI / 180);
      c.drawImage(img, -sw * k / 2, -sh * k / 2, sw * k, sh * k);
    }
    function layout() {
      const availW = Math.max(120, Math.min(window.innerWidth - 24, 900));
      const availH = Math.max(120, window.innerHeight - 270);
      scale = Math.min(availW / work.width, availH / work.height);
      W = Math.round(work.width * scale);
      H = Math.round(work.height * scale);
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      view.width = Math.round(W * dpr);
      view.height = Math.round(H * dpr);
      view.style.width = W + 'px';
      view.style.height = H + 'px';
      view.getContext('2d').drawImage(work, 0, 0, view.width, view.height);
      stage.style.width = W + 'px';
      stage.style.height = H + 'px';
    }
    function render() {
      rectEl.style.left = rect.x + 'px';
      rectEl.style.top = rect.y + 'px';
      rectEl.style.width = rect.w + 'px';
      rectEl.style.height = rect.h + 'px';
      info.textContent = Math.round(rect.w * work.width / W) + ' × ' + Math.round(rect.h * work.height / H) + ' px';
    }
    function applyRatio() {
      if (!ratio) { rect.x = 0; rect.y = 0; rect.w = W; rect.h = H; }
      else {
        let w = W;
        let h = W / ratio;
        if (h > H) { h = H; w = H * ratio; }
        rect.w = w; rect.h = h; rect.x = (W - w) / 2; rect.y = (H - h) / 2;
      }
      render();
    }
    function rotate(deg) { rot = (rot + deg + 360) % 360; buildWork(); layout(); applyRatio(); }

    // ----- pointeur : déplacer / redimensionner
    let drag = null;
    function pos(e) { const r = stage.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
    function update(p) {
      const o = drag.orig;
      if (drag.mode === 'move') {
        rect.x = clamp(o.x + p.x - drag.start.x, 0, W - o.w);
        rect.y = clamp(o.y + p.y - drag.start.y, 0, H - o.h);
      } else if (drag.mode.length === 2) {
        const sx = drag.mode.indexOf('e') !== -1 ? 1 : -1;
        const sy = drag.mode.indexOf('s') !== -1 ? 1 : -1;
        const ax = sx > 0 ? o.x : o.x + o.w;
        const ay = sy > 0 ? o.y : o.y + o.h;
        const maxW = sx > 0 ? W - ax : ax;
        const maxH = sy > 0 ? H - ay : ay;
        let w = Math.min(Math.max(MIN, (p.x - ax) * sx), maxW);
        let h = Math.min(Math.max(MIN, (p.y - ay) * sy), maxH);
        if (ratio) {
          w = Math.max(w, h * ratio);
          h = w / ratio;
          if (w > maxW) { w = maxW; h = w / ratio; }
          if (h > maxH) { h = maxH; w = h * ratio; }
        }
        rect.w = w; rect.h = h;
        rect.x = sx > 0 ? ax : ax - w;
        rect.y = sy > 0 ? ay : ay - h;
      } else {
        if (drag.mode === 'e') rect.w = clamp(p.x - o.x, MIN, W - o.x);
        if (drag.mode === 'w') { const right = o.x + o.w; rect.x = clamp(p.x, 0, right - MIN); rect.w = right - rect.x; }
        if (drag.mode === 's') rect.h = clamp(p.y - o.y, MIN, H - o.y);
        if (drag.mode === 'n') { const bottom = o.y + o.h; rect.y = clamp(p.y, 0, bottom - MIN); rect.h = bottom - rect.y; }
      }
      render();
    }
    rectEl.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      drag = { mode: (e.target.dataset && e.target.dataset.h) || 'move', start: pos(e), orig: { x: rect.x, y: rect.y, w: rect.w, h: rect.h } };
      try { rectEl.setPointerCapture(e.pointerId); } catch (err) { /* navigateur ancien */ }
    });
    rectEl.addEventListener('pointermove', function (e) { if (drag) { e.preventDefault(); update(pos(e)); } });
    const endDrag = function () { drag = null; };
    rectEl.addEventListener('pointerup', endDrag);
    rectEl.addEventListener('pointercancel', endDrag);

    // ----- sortie
    function onKey(e) { if (e.key === 'Escape') finish({ action: 'cancel' }); }
    function finish(result) {
      document.removeEventListener('keydown', onKey);
      layerClose = null;
      layer.replaceChildren();
      resolve(result);
    }
    function validate(withCrop) {
      const full = rect.x <= 1 && rect.y <= 1 && rect.w >= W - 1 && rect.h >= H - 1;
      if (rot === 0 && (!withCrop || full)) return finish({ action: 'whole' });
      const kx = work.width / W;
      const ky = work.height / H;
      const sx = withCrop ? Math.round(rect.x * kx) : 0;
      const sy = withCrop ? Math.round(rect.y * ky) : 0;
      const sw = withCrop ? Math.min(work.width - sx, Math.max(1, Math.round(rect.w * kx))) : work.width;
      let sh = withCrop ? Math.min(work.height - sy, Math.max(1, Math.round(rect.h * ky))) : work.height;
      if (withCrop && ratio) sh = Math.min(work.height - sy, Math.max(1, Math.round(sw / ratio)));   // proportion exacte au pixel près
      const out = document.createElement('canvas');
      out.width = sw;
      out.height = sh;
      out.getContext('2d').drawImage(work, sx, sy, sw, sh, 0, 0, sw, sh);
      finish({ action: 'crop', canvas: out });
    }

    layer.replaceChildren(box);
    layerClose = function () { finish({ action: 'cancel' }); };
    document.addEventListener('keydown', onKey);
    buildWork();
    layout();
    applyRatio();
  });
}

// ===== Grille et visionneuse =====
/** photos : [{ photo_id, description, can_delete, is_main }] ; actions : { setMain(photo), remove(photo) } */
function photoGrid(photos, actions) {
  const grid = el('div', 'photo-grid');
  const observer = ('IntersectionObserver' in window) ? new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (e.isIntersecting) { observer.unobserve(e.target); paintThumb(e.target, e.target.dataset.photo); }
    });
  }, { rootMargin: '200px' }) : null;
  photos.forEach(function (p, i) {
    const b = button('', 'ph');
    b.dataset.photo = p.photo_id;
    b.setAttribute('aria-label', p.description || 'Photo ' + (i + 1));
    if (p.is_main) b.appendChild(el('span', 'ph-badge', 'Profil'));
    b.addEventListener('click', function () { openViewer(photos, i, actions || {}); });
    grid.appendChild(b);
    if (observer) observer.observe(b); else paintThumb(b, p.photo_id);
  });
  return grid;
}

/** Visionneuse centrée : ✕, Échap ou un clic à côté de la photo pour fermer. */
function openViewer(photos, startIndex, actions) {
  closeLayer();
  let index = startIndex;
  const layer = $('layer');
  const box = el('div', 'viewer');
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-modal', 'true');
  const stage = el('div', 'viewer-stage');
  const img = el('img', 'viewer-photo');
  img.alt = '';
  stage.appendChild(img);
  const caption = el('p', 'viewer-caption');
  const bar = el('div', 'viewer-bar');
  const prev = button('‹', 'viewer-nav prev', function (e) { e.stopPropagation(); show(index - 1); });
  const next = button('›', 'viewer-nav next', function (e) { e.stopPropagation(); show(index + 1); });
  const closeBtn = button('✕', 'viewer-x', function () { close(); });
  closeBtn.setAttribute('aria-label', 'Fermer');
  stage.addEventListener('click', function (e) { if (e.target !== img) close(); });
  function close() { layerClose = null; document.removeEventListener('keydown', onKey); layer.replaceChildren(); }
  function onKey(e) {
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowLeft') show(index - 1);
    else if (e.key === 'ArrowRight') show(index + 1);
  }
  let token = 0;
  async function show(i) {
    if (i < 0 || i >= photos.length) return;
    index = i;
    const p = photos[i];
    const mine = ++token;
    let fullLoaded = false;
    img.removeAttribute('src');
    img.classList.add('loading');
    thumbUrl(p.photo_id).then(function (u) { if (u && mine === token && !fullLoaded) img.src = u; });
    caption.textContent = [fmtDateLong(p.date), p.description].filter(Boolean).join(', ') + (photos.length > 1 ? '  (' + (i + 1) + '/' + photos.length + ')' : '');
    prev.classList.toggle('hidden', i === 0);
    next.classList.toggle('hidden', i === photos.length - 1);
    bar.replaceChildren();
    if (actions.change) bar.appendChild(button('Changer la photo', 'btn btn-amber btn-small', function () { close(); actions.change(p); }));
    if (actions.setMain && !p.is_main) bar.appendChild(button('Photo de profil', 'btn btn-amber btn-small', function () { close(); actions.setMain(p); }));
    if (actions.remove && p.can_delete) bar.appendChild(button('Supprimer', 'btn btn-danger btn-small', function () { close(); actions.remove(p); }));
    bar.classList.toggle('hidden', !bar.childNodes.length);
    try {
      const res = await api('photos.get', { photoId: p.photo_id });
      if (res.ok && mine === token) { fullLoaded = true; img.src = res.data.image; img.classList.remove('loading'); }
    } catch (err) { /* on garde la miniature */ }
  }
  box.append(stage, closeBtn, prev, next, caption, bar);
  layer.replaceChildren(box);
  layerClose = close;
  document.addEventListener('keydown', onKey);
  show(index);
}

// ===== Photo de profil du véhicule =====
function openProfilePhotoSheet(v) {
  openSheet(function (sheet, close) {
    sheet.appendChild(el('h2', null, 'Photo de profil'));
    const menu = el('div', 'menu');
    const choose = button('', 'menu-item', async function () {
      close();
      const files = await pickImages(false);
      if (!files.length) return;
      const n = await uploadPhotos(files.slice(0, 1), { vehicleIds: [v.vehicle_id], setAsMain: true }, { title: 'Photo de profil' });
      if (n) { forgetVehicle(v.vehicle_id); forget(function (k) { return k.indexOf('photos:') === 0; }); toast('Photo de profil mise à jour'); route(); }
    });
    choose.appendChild(el('span', 'mi-icon', '📷'));
    const t = el('span');
    t.appendChild(el('b', null, 'Choisir une photo'));
    t.appendChild(el('small', null, 'Depuis ta galerie ou l\'appareil photo'));
    choose.appendChild(t);
    menu.appendChild(choose);
    if (v.main_photo_id) {
      const remove = button('', 'menu-item', async function () {
        close();
        const data = await send('photos.setMain', { vehicleId: v.vehicle_id, photoId: '' }, toast);
        if (!data) return;
        forgetVehicle(v.vehicle_id);
        toast('Photo de profil retirée');
        route();
      });
      remove.appendChild(el('span', 'mi-icon', '🚫'));
      remove.appendChild(el('b', null, 'Retirer la photo'));
      menu.appendChild(remove);
    }
    sheet.appendChild(menu);
  });
}

// ===== Onglet Photos de la fiche =====
addTab({
  slug: 'photos', label: 'Photos', order: 58,
  visible: function (v) { return topicVisible(v, 'photos'); },
  render: function (box, v) {
    const bar = el('div', 'toolbar');
    bar.appendChild(el('p', null, 'Galerie du véhicule'));
    bar.appendChild(button('Ajouter des photos', 'btn btn-primary btn-small', async function () {
      const files = await pickImages(true);
      if (!files.length) return;
      const n = await uploadPhotos(files, { vehicleIds: [v.vehicle_id] });
      if (n) { stale(function (k) { return k === 'photos:' + v.vehicle_id; }); toast(n > 1 ? n + ' photos ajoutées' : 'Photo ajoutée'); route(); }
    }));
    box.appendChild(bar);
    const body = el('div');
    box.appendChild(body);
    load('photos:' + v.vehicle_id, function () { return api('photos.list', { vehicleId: v.vehicle_id }); }, function (data) {
      body.replaceChildren();
      if (!data.photos.length) { body.appendChild(emptyState('Aucune photo pour le moment. Ajoute la première, elle pourra devenir la photo de profil.')); return; }
      body.appendChild(photoGrid(data.photos, {
        setMain: data.can_set_main ? async function (p) {
          const res = await send('photos.setMain', { vehicleId: v.vehicle_id, photoId: p.photo_id }, toast);
          if (!res) return;
          forgetVehicle(v.vehicle_id);
          stale(function (k) { return k === 'photos:' + v.vehicle_id; });
          toast('Photo de profil mise à jour');
          route();
        } : null,
        remove: async function (p) {
          const ok = await confirmDialog('Supprimer cette photo ?', 'Elle sera aussi retirée de ton Drive.');
          if (!ok) return;
          const res = await send('photos.delete', { photoId: p.photo_id }, toast);
          if (!res) return;
          forgetVehicle(v.vehicle_id);
          stale(function (k) { return k.indexOf('photos:') === 0 || k.indexOf('mem') === 0; });
          toast('Photo supprimée');
          route();
        }
      }));
    }, {
      loading: function () { body.replaceChildren(skeleton(2)); },
      error: function (msg, had) { if (!had) body.replaceChildren(errorBox(msg)); },
      stillHere: function () { return body.isConnected; }
    });
  }
});
