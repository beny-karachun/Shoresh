// label/spec.js — physical-size and layout options for the label designer.
//
// A full nutrition declaration is dense, so size control is expressed as the
// label WIDTH (mm) with the height flowing to fit the content — this is what a
// print shop / sticker run actually needs, and it feeds straight into the
// exact-mm PNG/PDF/print exports. A compact density variant tightens fonts and
// spacing for narrower stickers.

export const WIDTH_PRESETS = [
  { id: 'w80', label: 'צר — 80 מ"מ', widthMm: 80 },
  { id: 'w90', label: 'רגיל — 90 מ"מ', widthMm: 90 },
  { id: 'w100', label: 'רחב — 100 מ"מ', widthMm: 100 },
  { id: 'w110', label: 'רחב מאוד — 110 מ"מ', widthMm: 110 },
  { id: 'custom', label: 'מותאם אישית (מ"מ)', widthMm: null },
];

// Layout templates — CSS style variants applied to the label root. They keep the
// same RTL content flow (and thus the same Hebrew fidelity) while offering
// distinct looks: classic (the original framed label), compact (tight, for
// narrow stickers), and modern (dark header bar, rounded frame, zebra rows).
export const TEMPLATES = [
  { id: 'classic', label: 'קלאסי' },
  { id: 'compact', label: 'קומפקטי' },
  { id: 'modern', label: 'מודרני' },
];

export const DEFAULT_LABEL_SPEC = { widthMm: 90, variant: 'classic' };

// Clamp a user-entered custom width to a sane printable range.
export function clampWidthMm(mm) {
  const n = Number(mm);
  if (!Number.isFinite(n)) return DEFAULT_LABEL_SPEC.widthMm;
  return Math.min(200, Math.max(40, n));
}
