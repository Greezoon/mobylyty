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

function toJpegBase64(img, maxSide, quality) {
  const k = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(img.naturalWidth * k));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * k));
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  let q = quality;
  let data = canvas.toDataURL('image/jpeg', q).split(',')[1];
  while (data.length > 3000000 && q > 0.4) { q -= 0.15; data = canvas.toDataURL('image/jpeg', q).split(',')[1]; }
  return data;
}

/**
 * Envoie des photos une par une. base = { vehicleIds, memoryId, setAsMain, description }.
 * Renvoie le nombre de photos envoyées.
 */
async function uploadPhotos(files, base) {
  let done = 0;
  for (let i = 0; i < files.length; i++) {
    toast('Envoi de la photo ' + (i + 1) + ' sur ' + files.length + '…');
    let image, thumb;
    try {
      const img = await readImage(files[i]);
      image = toJpegBase64(img, 1600, 0.8);
      thumb = toJpegBase64(img, 360, 0.7);
    } catch (err) { toast(err.message); break; }
    let failed = false;
    const data = await send('photos.upload', { photo: Object.assign({}, base, { image: image, thumb: thumb }) }, function (m) { failed = true; toast(m); });
    if (!data || failed) break;
    done++;
  }
  return done;
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

function openViewer(photos, startIndex, actions) {
  closeLayer();
  let index = startIndex;
  const layer = $('layer');
  const box = el('div', 'viewer');
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-modal', 'true');
  const img = el('div', 'viewer-img');
  const caption = el('p', 'viewer-caption');
  const bar = el('div', 'viewer-bar');
  const prev = button('‹', 'viewer-nav prev', function () { show(index - 1); });
  const next = button('›', 'viewer-nav next', function () { show(index + 1); });
  const closeBtn = button('Fermer', 'btn btn-ghost btn-small viewer-close', function () { close(); });
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
    img.style.backgroundImage = '';
    img.classList.add('loading');
    paintThumb(img, p.photo_id);
    caption.textContent = [fmtDateLong(p.date), p.description].filter(Boolean).join(', ') + (photos.length > 1 ? '  (' + (i + 1) + '/' + photos.length + ')' : '');
    prev.classList.toggle('hidden', i === 0);
    next.classList.toggle('hidden', i === photos.length - 1);
    bar.replaceChildren();
    if (actions.setMain && !p.is_main) bar.appendChild(button('Photo de profil', 'btn btn-amber btn-small', function () { close(); actions.setMain(p); }));
    if (actions.remove && p.can_delete) bar.appendChild(button('Supprimer', 'btn btn-danger btn-small', function () { close(); actions.remove(p); }));
    bar.appendChild(closeBtn);
    try {
      const res = await api('photos.get', { photoId: p.photo_id });
      if (res.ok && mine === token) { img.style.backgroundImage = 'url("' + res.data.image + '")'; img.classList.remove('loading'); }
    } catch (err) { /* on garde la miniature */ }
  }
  box.append(img, prev, next, caption, bar);
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
      const n = await uploadPhotos(files.slice(0, 1), { vehicleIds: [v.vehicle_id], setAsMain: true });
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
