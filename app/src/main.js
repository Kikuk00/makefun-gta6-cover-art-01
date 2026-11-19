// Neon Coast Cover Studio — editor wiring. Photos stay on the machine: files
// are read with object URLs and never uploaded anywhere. The preview canvas
// repaints on every change; Export repaints the same cover at full post size
// on an offscreen canvas and downloads it as a PNG.
import { LAYOUTS, GRADES, SIZES, drawCoverArt, panelRectsFor } from './cover.js';
import { runShot } from './shots.js';

const $ = (id) => document.getElementById(id);
const preview = $('preview');
const SAMPLES = ['boulevard', 'pier'];

/** The whole editor state: what the cover painter reads. */
export function freshState() {
  return {
    layout: 'hero',
    grade: 'sunset',
    title: 'NEON COAST',
    subtitle: 'a sunset heist in three panels',
    titleScale: 1,
    size: 'square',
    photos: [null, null, null],
    panels: [
      { photo: 0, zoom: 1, ox: 0, oy: 0 },
      { photo: 1, zoom: 1, ox: 0, oy: 0 },
      { photo: 0, zoom: 1, ox: 0, oy: 0 },
      { photo: 1, zoom: 1, ox: 0, oy: 0 },
    ],
  };
}

const state = freshState();
let selectedPanel = 0;
let drag = null;

export function getState() { return state; }

/** Loads an image from a URL, resolving once it can be drawn. */
export function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('could not load image'));
    img.src = url;
  });
}

/** Repaints the preview canvas at the chosen post size's aspect ratio. */
export function repaint() {
  const size = SIZES[state.size] ?? SIZES.square;
  const scale = 760 / Math.max(size.w, size.h);
  preview.width = Math.round(size.w * scale);
  preview.height = Math.round(size.h * scale);
  drawCoverArt(preview, state);
  syncPanelEditor();
}

/** Shows the selected panel's controls and highlights its button. */
export function syncPanelEditor() {
  const layout = LAYOUTS[state.layout];
  const count = layout.panels.length;
  if (selectedPanel >= count) selectedPanel = 0;
  document.querySelectorAll('#panel-pick button').forEach((btn, i) => {
    btn.hidden = i >= count;
    btn.classList.toggle('active', i === selectedPanel);
    btn.textContent = `Panel ${i + 1}`;
  });
  const panel = state.panels[selectedPanel];
  $('panel-photo').value = String(panel.photo);
  $('panel-zoom').value = String(panel.zoom);
  $('panel-x').value = String(panel.ox);
  $('panel-y').value = String(panel.oy);
  $('zoom-val').textContent = `${Math.round(panel.zoom * 100)}%`;
  $('x-val').textContent = panel.ox.toFixed(2);
  $('y-val').textContent = panel.oy.toFixed(2);
  $('panel-note').textContent = layout.panels.length > 1
    ? `Panel ${selectedPanel + 1} of ${layout.panels.length} — drag the photo on the preview to move it.`
    : 'One full-bleed panel — drag the photo on the preview to move it.';
}

/** Fills every panel with the loaded photos, round-robin. */
export function autofillPanels() {
  const loaded = state.photos.map((p, i) => (p ? i : -1)).filter((i) => i >= 0);
  const count = LAYOUTS[state.layout].panels.length;
  for (let i = 0; i < count; i++) {
    state.panels[i].photo = loaded.length ? loaded[i % loaded.length] : -1;
    state.panels[i].zoom = 1;
    state.panels[i].ox = 0;
    state.panels[i].oy = 0;
  }
}

/** Which panel (if any) sits under a point on the preview canvas. */
export function panelAt(clientX, clientY) {
  const box = preview.getBoundingClientRect();
  const px = ((clientX - box.left) / box.width) * preview.width;
  const py = ((clientY - box.top) / box.height) * preview.height;
  const rects = panelRectsFor(state.layout, preview.width, preview.height);
  for (let i = 0; i < rects.length; i++) {
    const r = rects[i];
    if (px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h) return i;
  }
  return -1;
}

function setStatus(text) { $('status').textContent = text; }

/** Puts an image into a photo slot and refreshes the slot's label. */
export function setPhoto(slot, img, label) {
  state.photos[slot] = img;
  const card = document.querySelector(`.slot[data-slot="${slot}"]`);
  if (card) {
    card.classList.add('filled');
    card.querySelector('.slot-name').textContent = label;
  }
  const empty = state.panels.every((p) => p.photo < 0);
  if (empty) autofillPanels();
  repaint();
}

async function loadSample(slot, name) {
  try {
    const img = await loadImage(`samples/${name}.jpg`);
    setPhoto(slot, img, `Sample: ${name}`);
    setStatus(`Loaded sample photo ${name} into slot ${slot + 1}.`);
  } catch {
    setStatus(`Could not load sample ${name}.`);
  }
}

function buildSlotButtons() {
  document.querySelectorAll('.slot').forEach((card) => {
    const slot = Number(card.dataset.slot);
    const file = card.querySelector('input[type=file]');
    file.addEventListener('change', async () => {
      const f = file.files && file.files[0];
      if (!f) return;
      try {
        const img = await loadImage(URL.createObjectURL(f));
        setPhoto(slot, img, f.name);
        setStatus(`Photo ${slot + 1} loaded: ${f.name}.`);
      } catch {
        setStatus(`Could not read ${f.name} as an image.`);
      }
    });
    card.querySelectorAll('[data-sample]').forEach((btn) => {
      btn.addEventListener('click', () => loadSample(slot, btn.dataset.sample));
    });
  });
}

function buildLayoutButtons() {
  const wrap = $('layout-pick');
  Object.entries(LAYOUTS).forEach(([id, layout]) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = layout.name;
    btn.dataset.layout = id;
    btn.classList.toggle('active', id === state.layout);
    btn.addEventListener('click', () => {
      state.layout = id;
      wrap.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b === btn));
      autofillPanels();
      repaint();
    });
    wrap.appendChild(btn);
  });
}

function buildGradeButtons() {
  const wrap = $('grade-pick');
  Object.entries(GRADES).forEach(([id, grade]) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.classList.add('swatch');
    btn.dataset.grade = id;
    btn.style.setProperty('--g1', grade.sky);
    btn.style.setProperty('--g2', grade.wash);
    btn.style.setProperty('--g3', grade.deep);
    btn.title = grade.name;
    btn.setAttribute('aria-label', grade.name);
    btn.classList.toggle('active', id === state.grade);
    btn.addEventListener('click', () => {
      state.grade = id;
      $('grade-name').textContent = grade.name;
      wrap.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b === btn));
      repaint();
    });
    wrap.appendChild(btn);
  });
  $('grade-name').textContent = GRADES[state.grade].name;
}

function buildSizeButtons() {
  const wrap = $('size-pick');
  Object.entries(SIZES).forEach(([id, size]) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = size.label;
    btn.dataset.size = id;
    btn.classList.toggle('active', id === state.size);
    btn.addEventListener('click', () => {
      state.size = id;
      wrap.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b === btn));
      repaint();
    });
    wrap.appendChild(btn);
  });
}

function buildPanelControls() {
  const pick = $('panel-pick');
  for (let i = 0; i < 4; i++) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.addEventListener('click', () => { selectedPanel = i; repaint(); });
    pick.appendChild(btn);
  }
  $('panel-photo').addEventListener('change', (e) => {
    state.panels[selectedPanel].photo = Number(e.target.value);
    repaint();
  });
  $('panel-zoom').addEventListener('input', (e) => {
    state.panels[selectedPanel].zoom = Number(e.target.value);
    repaint();
  });
  $('panel-x').addEventListener('input', (e) => {
    state.panels[selectedPanel].ox = Number(e.target.value);
    repaint();
  });
  $('panel-y').addEventListener('input', (e) => {
    state.panels[selectedPanel].oy = Number(e.target.value);
    repaint();
  });
  $('panel-reset').addEventListener('click', () => {
    state.panels[selectedPanel] = { ...state.panels[selectedPanel], zoom: 1, ox: 0, oy: 0 };
    repaint();
  });
}

function buildCaptionControls() {
  $('title').addEventListener('input', (e) => { state.title = e.target.value; repaint(); });
  $('subtitle').addEventListener('input', (e) => { state.subtitle = e.target.value; repaint(); });
  $('title-scale').addEventListener('input', (e) => {
    state.titleScale = Number(e.target.value);
    $('title-scale-val').textContent = `${Math.round(state.titleScale * 100)}%`;
    repaint();
  });
}

function buildPreviewDrag() {
  preview.addEventListener('pointerdown', (e) => {
    const hit = panelAt(e.clientX, e.clientY);
    if (hit < 0) return;
    selectedPanel = hit;
    drag = { x: e.clientX, y: e.clientY, ox: state.panels[hit].ox, oy: state.panels[hit].oy };
    preview.setPointerCapture(e.pointerId);
    repaint();
  });
  preview.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const box = preview.getBoundingClientRect();
    const rects = panelRectsFor(state.layout, preview.width, preview.height);
    const r = rects[selectedPanel];
    const panel = state.panels[selectedPanel];
    panel.ox = Math.max(-0.5, Math.min(0.5, drag.ox + ((e.clientX - drag.x) / box.width) * (preview.width / r.w) * 0.9));
    panel.oy = Math.max(-0.5, Math.min(0.5, drag.oy + ((e.clientY - drag.y) / box.height) * (preview.height / r.h) * 0.9));
    repaint();
  });
  const endDrag = () => { drag = null; };
  preview.addEventListener('pointerup', endDrag);
  preview.addEventListener('pointercancel', endDrag);
  preview.addEventListener('wheel', (e) => {
    const hit = panelAt(e.clientX, e.clientY);
    if (hit < 0) return;
    e.preventDefault();
    const panel = state.panels[hit];
    panel.zoom = Math.max(1, Math.min(2.5, panel.zoom * (e.deltaY < 0 ? 1.08 : 0.93)));
    selectedPanel = hit;
    repaint();
  }, { passive: false });
}

/** Renders the cover at full post size and downloads it as a PNG. */
export function exportCover() {
  const size = SIZES[state.size] ?? SIZES.square;
  const off = document.createElement('canvas');
  off.width = size.w;
  off.height = size.h;
  drawCoverArt(off, state);
  return new Promise((resolve) => {
    off.toBlob((blob) => {
      if (!blob) { setStatus('Export failed — the canvas was empty.'); resolve(null); return; }
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `neon-coast-cover-${size.w}x${size.h}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      setStatus(`Saved neon-coast-cover-${size.w}x${size.h}.png`);
      resolve(blob);
    }, 'image/png');
  });
}

function buildActions() {
  $('export').addEventListener('click', exportCover);
  $('shuffle').addEventListener('click', () => {
    const layouts = Object.keys(LAYOUTS);
    const grades = Object.keys(GRADES);
    state.layout = layouts[Math.floor(Math.random() * layouts.length)];
    state.grade = grades[Math.floor(Math.random() * grades.length)];
    document.querySelectorAll('#layout-pick button').forEach((b) => b.classList.toggle('active', b.dataset.layout === state.layout));
    document.querySelectorAll('#grade-pick button').forEach((b) => b.classList.toggle('active', b.dataset.grade === state.grade));
    $('grade-name').textContent = GRADES[state.grade].name;
    autofillPanels();
    repaint();
    setStatus(`Shuffled: ${LAYOUTS[state.layout].name} + ${GRADES[state.grade].name}.`);
  });
  $('fill').addEventListener('click', () => {
    autofillPanels();
    repaint();
    setStatus('Panels filled with your photos.');
  });
}

buildSlotButtons();
buildLayoutButtons();
buildGradeButtons();
buildSizeButtons();
buildPanelControls();
buildCaptionControls();
buildPreviewDrag();
buildActions();

// Test hooks for the screenshot scenes: ?shot=cover draws the cover alone,
// ?shot=editor shows the editor with sample photos loaded.
const shot = new URLSearchParams(location.search).get('shot');
if (shot) {
  runShot(shot, new URLSearchParams(location.search), {
    state, loadImage, setPhoto, repaint, SAMPLES,
  });
} else {
  loadSample(0, 'pier');
  loadSample(1, 'boulevard');
  repaint();
}
