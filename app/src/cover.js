// Neon Coast cover renderer: draws a multi-panel poster-style cover onto any
// 2D canvas. The caller owns the state object; this file only paints it.
// State shape:
//   { layout, grade, title, subtitle, titleScale, photos, panels }
// photos is an array of images (or null); panels is an array of
// { photo, zoom, ox, oy } — photo is an index into photos, or -1 for empty.
// Layouts name their panel rectangles as fractions of the canvas; every
// layout reserves a title band along the bottom edge.

export const SIZES = {
  square: { label: 'Square 1080 x 1080', w: 1080, h: 1080 },
  portrait: { label: 'Portrait 1080 x 1350', w: 1080, h: 1350 },
  wide: { label: 'Wide 1920 x 1080', w: 1920, h: 1080 },
};

export const LAYOUTS = {
  hero: {
    name: 'Hero Split',
    panels: [
      { x: 0, y: 0, w: 0.62, h: 0.78 },
      { x: 0.62, y: 0, w: 0.38, h: 0.39 },
      { x: 0.62, y: 0.39, w: 0.38, h: 0.39 },
    ],
  },
  grid: {
    name: 'Four Panel Grid',
    panels: [
      { x: 0, y: 0, w: 0.5, h: 0.39 },
      { x: 0.5, y: 0, w: 0.5, h: 0.39 },
      { x: 0, y: 0.39, w: 0.5, h: 0.39 },
      { x: 0.5, y: 0.39, w: 0.5, h: 0.39 },
    ],
  },
  trio: {
    name: 'Trio Strip',
    panels: [
      { x: 0, y: 0, w: 0.3333, h: 0.78 },
      { x: 0.3333, y: 0, w: 0.3334, h: 0.78 },
      { x: 0.6667, y: 0, w: 0.3333, h: 0.78 },
    ],
  },
  full: {
    name: 'Full Bleed',
    panels: [{ x: 0, y: 0, w: 1, h: 0.78 }],
  },
};

export const GRADES = {
  sunset: { name: 'Vice Sunset', wash: '#ff5e3a', sky: '#ffb347', deep: '#7a1e6e', glow: '#ff8a3d' },
  neon: { name: 'Neon Nights', wash: '#ff2e88', sky: '#22d3ee', deep: '#3b0a6e', glow: '#ff2e88' },
  teal: { name: 'Teal Dusk', wash: '#0ea5a5', sky: '#fde68a', deep: '#0b3b4d', glow: '#2dd4bf' },
  gold: { name: 'Golden Hour', wash: '#f59e0b', sky: '#fff1a8', deep: '#7c2d12', glow: '#fbbf24' },
  rose: { name: 'Rose Fade', wash: '#e11d74', sky: '#fda4af', deep: '#4c0519', glow: '#fb7185' },
};

const BAND_H = 0.22; // title band height, as a fraction of the canvas height
const PAPER = '#f6efe3'; // warm off-white poster paper for gutters and frame

/** A tiny deterministic random generator, so the grain looks the same twice. */
export function seededRandom(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Panel rectangles for a layout, in canvas pixels. */
export function panelRectsFor(layoutId, w, h) {
  const layout = LAYOUTS[layoutId] ?? LAYOUTS.hero;
  const g = Math.max(4, Math.round(w * 0.011)); // gutter between panels
  return layout.panels.map((p) => ({
    x: Math.round(p.x * w) + (p.x > 0 ? g / 2 : g),
    y: Math.round(p.y * h) + (p.y > 0 ? g / 2 : g),
    w: Math.round(p.w * w) - g - (p.x > 0 ? g / 2 : g) + (p.x + p.w >= 0.999 ? g : 0),
    h: Math.round(p.h * h) - g - (p.y > 0 ? g / 2 : g) + (p.y + p.h >= 0.779 ? g : 0),
  }));
}

/** Title band rectangle, in canvas pixels. */
export function bandRectFor(w, h) {
  const g = Math.max(4, Math.round(w * 0.011));
  return { x: g, y: Math.round(h * (1 - BAND_H)) + g / 2, w: w - 2 * g, h: Math.round(h * BAND_H) - g };
}

/** Draws one photo cover-fit inside a rectangle, honouring zoom and pan. */
export function drawFittedPhoto(ctx, img, rect, zoom, ox, oy) {
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  if (!iw || !ih) return;
  const scale = Math.max(rect.w / iw, rect.h / ih) * (zoom || 1);
  const dw = iw * scale;
  const dh = ih * scale;
  const dx = rect.x + (rect.w - dw) / 2 + (ox || 0) * rect.w * 0.35;
  const dy = rect.y + (rect.h - dh) / 2 + (oy || 0) * rect.h * 0.35;
  ctx.save();
  ctx.beginPath();
  ctx.rect(rect.x, rect.y, rect.w, rect.h);
  ctx.clip();
  ctx.drawImage(img, dx, dy, dw, dh);
  ctx.restore();
}

/** Sunset / neon colour grade over one panel rectangle. */
export function gradePanel(ctx, rect, grade) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(rect.x, rect.y, rect.w, rect.h);
  ctx.clip();
  // Warm wash, strongest at the bottom of the panel.
  const wash = ctx.createLinearGradient(0, rect.y, 0, rect.y + rect.h);
  wash.addColorStop(0, 'rgba(255, 190, 90, 0.05)');
  wash.addColorStop(0.55, grade.wash + '22');
  wash.addColorStop(1, grade.wash + '55');
  ctx.fillStyle = wash;
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  // Sky glow from the top corner.
  const sky = ctx.createRadialGradient(
    rect.x + rect.w * 0.82, rect.y + rect.h * 0.08, 4,
    rect.x + rect.w * 0.82, rect.y + rect.h * 0.08, rect.w * 0.9,
  );
  sky.addColorStop(0, grade.sky + '44');
  sky.addColorStop(1, grade.sky + '00');
  ctx.fillStyle = sky;
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  // Deep shade along the foot so panels read as one poster.
  const foot = ctx.createLinearGradient(0, rect.y + rect.h * 0.62, 0, rect.y + rect.h);
  foot.addColorStop(0, grade.deep + '00');
  foot.addColorStop(1, grade.deep + '44');
  ctx.fillStyle = foot;
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  ctx.restore();
  // Ink outline around the panel, poster style.
  ctx.lineWidth = Math.max(2, Math.round(rect.w * 0.006));
  ctx.strokeStyle = 'rgba(16, 6, 28, 0.85)';
  ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
}

/** Placeholder art for a panel with no photo yet: gradient sky + striped sun. */
export function drawEmptyPanel(ctx, rect, grade) {
  const g = ctx.createLinearGradient(0, rect.y, 0, rect.y + rect.h);
  g.addColorStop(0, grade.sky);
  g.addColorStop(0.55, grade.glow);
  g.addColorStop(1, grade.deep);
  ctx.fillStyle = g;
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  drawStripedSun(ctx, rect.x + rect.w / 2, rect.y + rect.h * 0.42, Math.min(rect.w, rect.h) * 0.26, grade);
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.font = `800 ${Math.max(11, Math.round(rect.w * 0.045))}px "Arial Black", Arial, sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText('YOUR PHOTO HERE', rect.x + rect.w / 2, rect.y + rect.h * 0.82);
}

/** A synthwave sun: a circle with horizontal slices cut out of its lower half. */
export function drawStripedSun(ctx, cx, cy, r, grade) {
  ctx.save();
  const g = ctx.createLinearGradient(0, cy - r, 0, cy + r);
  g.addColorStop(0, '#ffe27a');
  g.addColorStop(0.5, grade.glow);
  g.addColorStop(1, grade.wash);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  // Cut stripes across the lower half.
  ctx.globalCompositeOperation = 'destination-out';
  let y = cy + r * 0.08;
  let thick = Math.max(2, r * 0.07);
  while (y < cy + r) {
    ctx.fillRect(cx - r - 2, y, r * 2 + 4, thick);
    y += thick * 2.4;
    thick *= 1.25;
  }
  ctx.restore();
}

/** Halftone dot field, used inside the title band. */
export function drawHalftone(ctx, x, y, w, h, colour, maxR) {
  ctx.save();
  ctx.fillStyle = colour;
  const step = Math.max(10, maxR * 4);
  for (let row = 0; row * step < h; row++) {
    for (let col = 0; col * step < w; col++) {
      const r = maxR * (0.35 + 0.65 * (1 - (row * step) / Math.max(1, h)));
      ctx.beginPath();
      ctx.arc(x + col * step + (row % 2 ? step / 2 : 0), y + row * step, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

/** The title band: striped sun emblem, big gradient caption, script subtitle. */
export function drawTitleBand(ctx, band, state, grade) {
  const { w, h } = { w: band.w, h: band.h };
  // Deep plum band with a sunset bar across its top edge.
  const bg = ctx.createLinearGradient(0, band.y, 0, band.y + band.h);
  bg.addColorStop(0, '#2a1250');
  bg.addColorStop(1, '#12081f');
  ctx.fillStyle = bg;
  ctx.fillRect(band.x, band.y, band.w, band.h);
  const bar = ctx.createLinearGradient(band.x, 0, band.x + band.w, 0);
  bar.addColorStop(0, '#ffd76a');
  bar.addColorStop(0.35, '#ff7a3d');
  bar.addColorStop(0.7, '#ff2e88');
  bar.addColorStop(1, '#7c3aed');
  ctx.fillStyle = bar;
  ctx.fillRect(band.x, band.y, band.w, Math.max(4, band.h * 0.045));
  // Halftone corners.
  drawHalftone(ctx, band.x + band.w * 0.86, band.y + band.h * 0.5, band.w * 0.13, band.h * 0.45, 'rgba(255,46,136,0.35)', Math.max(2, band.h * 0.02));
  drawHalftone(ctx, band.x + band.w * 0.01, band.y + band.h * 0.55, band.w * 0.1, band.h * 0.4, 'rgba(255,183,60,0.3)', Math.max(2, band.h * 0.018));

  // Striped sun emblem on the left, kept clear of the title.
  const sunR = band.h * 0.23;
  const sunX = band.x + band.w * 0.068;
  const sunY = band.y + band.h * 0.48;
  drawStripedSun(ctx, sunX, sunY, sunR, grade);

  const title = (state.title || 'NEON COAST').trim().toUpperCase() || 'NEON COAST';
  const centreX = band.x + band.w * 0.58;
  const titleY = band.y + band.h * 0.52;
  let size = band.h * 0.46 * (state.titleScale || 1);
  const family = '"Arial Black", "Helvetica Neue", Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const setFont = (s) => { ctx.font = `900 ${Math.round(s)}px ${family}`; };
  setFont(size);
  const maxW = band.w * 0.76;
  while (ctx.measureText(title).width > maxW && size > 14) {
    size -= 2;
    setFont(size);
  }
  try { ctx.letterSpacing = `${Math.max(1, Math.round(size * 0.02))}px`; } catch { /* older canvas */ }
  // Neon chromatic offset: magenta and cyan ghosts behind the letters.
  ctx.fillStyle = 'rgba(255, 46, 136, 0.55)';
  ctx.fillText(title, centreX + size * 0.03, titleY + size * 0.015);
  ctx.fillStyle = 'rgba(34, 211, 238, 0.5)';
  ctx.fillText(title, centreX - size * 0.03, titleY - size * 0.015);
  // Gradient face with a dark ink outline.
  const face = ctx.createLinearGradient(0, titleY - size * 0.55, 0, titleY + size * 0.55);
  face.addColorStop(0, '#fff3b0');
  face.addColorStop(0.45, '#ffd76a');
  face.addColorStop(0.75, '#ff7a3d');
  face.addColorStop(1, '#ff2e88');
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(3, size * 0.09);
  ctx.strokeStyle = '#160a24';
  ctx.strokeText(title, centreX, titleY);
  ctx.fillStyle = face;
  ctx.fillText(title, centreX, titleY);
  try { ctx.letterSpacing = '0px'; } catch { /* older canvas */ }

  // Subtitle in italic serif, flanked by thin rules.
  const sub = (state.subtitle || '').trim();
  if (sub) {
    const subSize = Math.max(12, band.h * 0.155);
    ctx.font = `italic 600 ${Math.round(subSize)}px Georgia, "Times New Roman", serif`;
    ctx.fillStyle = '#ffd9a0';
    const subY = band.y + band.h * 0.86;
    const subW = ctx.measureText(sub).width;
    ctx.fillText(sub, centreX, subY);
    ctx.strokeStyle = 'rgba(255, 217, 160, 0.6)';
    ctx.lineWidth = Math.max(1, band.h * 0.008);
    const gap = subSize * 0.9;
    const ruleY = subY - subSize * 0.12;
    ctx.beginPath();
    ctx.moveTo(centreX - subW / 2 - gap - band.w * 0.07, ruleY);
    ctx.lineTo(centreX - subW / 2 - gap, ruleY);
    ctx.moveTo(centreX + subW / 2 + gap, ruleY);
    ctx.lineTo(centreX + subW / 2 + gap + band.w * 0.07, ruleY);
    ctx.stroke();
  }
  // Ink outline around the band.
  ctx.lineWidth = Math.max(2, Math.round(band.w * 0.004));
  ctx.strokeStyle = 'rgba(16, 6, 28, 0.85)';
  ctx.strokeRect(band.x, band.y, band.w, band.h);
}

/** Film grain + vignette over the whole cover, for a printed-poster feel. */
export function finishCover(ctx, w, h) {
  const rand = seededRandom(20261119 + w * 7 + h * 13);
  const dots = Math.floor((w * h) / 1100);
  ctx.save();
  for (let i = 0; i < dots; i++) {
    const v = rand();
    ctx.fillStyle = v > 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.06)';
    ctx.fillRect(rand() * w, rand() * h, 1 + rand() * 1.5, 1 + rand() * 1.5);
  }
  const vig = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.42, w / 2, h / 2, Math.max(w, h) * 0.72);
  vig.addColorStop(0, 'rgba(8,4,18,0)');
  vig.addColorStop(1, 'rgba(8,4,18,0.30)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

/** Paints the whole cover for `state` onto `canvas` at its own pixel size. */
export function drawCoverArt(canvas, state) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  const grade = GRADES[state.grade] ?? GRADES.sunset;
  const layout = state.layout ?? 'hero';
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, w, h);
  const rects = panelRectsFor(layout, w, h);
  rects.forEach((rect, i) => {
    const panel = (state.panels && state.panels[i]) || { photo: -1, zoom: 1, ox: 0, oy: 0 };
    const img = panel.photo >= 0 && state.photos ? state.photos[panel.photo] : null;
    if (img) {
      drawFittedPhoto(ctx, img, rect, panel.zoom, panel.ox, panel.oy);
      gradePanel(ctx, rect, grade);
    } else {
      drawEmptyPanel(ctx, rect, grade);
      gradePanel(ctx, rect, grade);
    }
  });
  drawTitleBand(ctx, bandRectFor(w, h), state, grade);
  finishCover(ctx, w, h);
}
