// Fixed scenes for screenshots: ?shot=cover draws the cover alone at full
// frame; ?shot=editor shows the editor with sample photos loaded. Query
// params pick the look: layout, grade, caption, subtitle, size, photo, photo2.
// window.__shotReady is set once the scene has painted, so a screenshot
// runner knows when to capture.
import { SIZES, GRADES, drawCoverArt } from './cover.js';

/** Applies the scene's query params onto the editor state. */
export function applySceneParams(query, state) {
  const layout = query.get('layout');
  if (layout) state.layout = layout;
  const grade = query.get('grade');
  if (grade) state.grade = grade;
  const caption = query.get('caption');
  if (caption !== null) state.title = caption;
  const subtitle = query.get('subtitle');
  if (subtitle !== null) state.subtitle = subtitle;
  const size = query.get('size');
  if (size && SIZES[size]) state.size = size;
  return state;
}

/** Marks the scene ready after two animation frames, once paint has landed. */
export function markShotReady() {
  requestAnimationFrame(() => requestAnimationFrame(() => {
    window.__shotReady = true;
  }));
}

/** Keeps the editor's buttons, labels and inputs in step with the scene state,
    so a screenshot of the editor shows the grade and layout it really uses. */
export function syncEditorChrome(state) {
  document.querySelectorAll('#grade-pick button').forEach((b) => {
    b.classList.toggle('active', b.dataset.grade === state.grade);
  });
  const gradeName = document.getElementById('grade-name');
  if (gradeName) gradeName.textContent = (GRADES[state.grade] ?? GRADES.sunset).name;
  document.querySelectorAll('#layout-pick button').forEach((b) => {
    b.classList.toggle('active', b.dataset.layout === state.layout);
  });
  document.querySelectorAll('#size-pick button').forEach((b) => {
    b.classList.toggle('active', b.dataset.size === state.size);
  });
  const title = document.getElementById('title');
  if (title) title.value = state.title;
  const subtitle = document.getElementById('subtitle');
  if (subtitle) subtitle.value = state.subtitle;
}

export async function runShot(shot, query, hooks) {
  const { state, loadImage, setPhoto, repaint } = hooks;
  applySceneParams(query, state);
  syncEditorChrome(state);
  const first = query.get('photo') ?? 'pier';
  const second = query.get('photo2') ?? 'boulevard';
  const imgA = await loadImage(`samples/${first}.jpg`);
  const imgB = await loadImage(`samples/${second}.jpg`);
  setPhoto(0, imgA, `Sample: ${first}`);
  setPhoto(1, imgB, `Sample: ${second}`);
  // Spread the two photos across the layout's panels.
  const layouts = { hero: [0, 1, 0], grid: [0, 1, 1, 0], trio: [0, 1, 0], full: [0] };
  const spread = layouts[state.layout] ?? [0, 1, 0];
  spread.forEach((photo, i) => {
    state.panels[i].photo = photo;
    state.panels[i].zoom = 1;
    state.panels[i].ox = 0;
    state.panels[i].oy = 0;
  });
  if (shot === 'cover') {
    // Cover alone: hide the editor, size the canvas to the chosen post size
    // scaled to fit the window, and paint the cover at full resolution.
    document.body.classList.add('shot-cover');
    const size = SIZES[state.size] ?? SIZES.square;
    const canvas = document.getElementById('preview');
    canvas.width = size.w;
    canvas.height = size.h;
    const scale = Math.min(window.innerWidth / size.w, window.innerHeight / size.h);
    canvas.style.width = `${Math.round(size.w * scale)}px`;
    canvas.style.height = `${Math.round(size.h * scale)}px`;
    drawCoverArt(canvas, state);
    document.title = `Cover — ${state.title}`;
  } else {
    repaint();
  }
  markShotReady();
}
