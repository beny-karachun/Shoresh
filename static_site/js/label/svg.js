// label/svg.js — render the food label as an inline <svg>, the single source of
// truth reused for the on-screen preview and every export (PNG / print / PDF).
//
// Strategy: the label content is laid out by the browser inside an SVG
// <foreignObject> using ordinary RTL HTML — this gives perfect Hebrew bidi,
// wrapping and font shaping for the preview, PNG and print paths. The internal
// coordinate system is CSS px at 96dpi (1mm = 96/25.4 px); attaching a physical
// `width="<mm>mm"` to the <svg> at export time scales it to an exact size.
//
// (The vector-PDF path, added in a later phase, will instead emit native SVG
// <text>/<tspan> because svg2pdf does not render <foreignObject>.)

import { REFERENCE_INTAKES, KCAL_TO_KJ, saltFromSodiumMg } from '../nutrition.js';

export const PX_PER_MM = 96 / 25.4; // 96dpi CSS reference pixel
const SVGNS = 'http://www.w3.org/2000/svg';
const XHTMLNS = 'http://www.w3.org/1999/xhtml';

// Default physical label size (mm). Width drives the internal px viewBox; height
// auto-fits to content in the preview until size presets are added (Phase 3).
export const DEFAULT_SPEC = { widthMm: 110 };

// CSS for the label content. Kept inline inside the <foreignObject> so a
// serialized SVG (for PNG / .svg download) is fully self-contained.
const LABEL_CONTENT_CSS = `
.food-label { box-sizing: border-box; border: 2px solid #000; padding: 20px; background: #fff; color: #000; font-family: 'Heebo','Arial',sans-serif; direction: rtl; text-align: right; width: 100%; }
.food-label .label-header { text-align: center; border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 15px; }
.food-label .label-title { font-size: 24px; font-weight: bold; margin: 0; }
.food-label .label-marketing { font-style: italic; margin-top: 5px; }
.food-label .red-labels-container { display: flex; justify-content: center; gap: 15px; margin: 15px 0; }
.food-label .red-label-img { width: 80px; height: auto; }
.food-label .nutrition-table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 14px; }
.food-label .nutrition-table th, .food-label .nutrition-table td { border-bottom: 1px solid #ddd; padding: 4px; text-align: right; }
.food-label .nutrition-table th { font-weight: bold; }
.food-label .nutrition-header { background-color: #f5f5f5; font-weight: bold; padding: 5px; margin-top: 10px; border: 1px solid #ddd; }
.food-label .ingredients-section { margin-top: 15px; font-size: 13px; word-wrap: break-word; overflow-wrap: break-word; white-space: normal; }
.food-label .footer-info { margin-top: 15px; font-size: 12px; border-top: 1px solid #000; padding-top: 10px; }
.food-label .allergens-box { border: 1px solid #000; padding: 5px; margin-top: 10px; font-weight: bold; font-size: 13px; }
.food-label .red-fallback { color: red; font-weight: bold; border: 1px solid red; padding: 5px; }
/* Compact template — tighter for narrow stickers. */
.food-label.compact { padding: 12px; }
.food-label.compact .label-title { font-size: 19px; }
.food-label.compact .label-header { padding-bottom: 6px; margin-bottom: 9px; }
.food-label.compact .nutrition-table { font-size: 12px; }
.food-label.compact .nutrition-table th, .food-label.compact .nutrition-table td { padding: 2px; }
.food-label.compact .red-label-img { width: 60px; }
.food-label.compact .red-labels-container { gap: 10px; margin: 9px 0; }
.food-label.compact .ingredients-section { margin-top: 9px; font-size: 12px; }
.food-label.compact .footer-info { margin-top: 9px; font-size: 11px; }
/* Modern template — full-bleed dark header bar, rounded frame, zebra rows. */
.food-label.modern { border: 1px solid #999; border-radius: 8px; padding: 0; overflow: hidden; }
.food-label.modern .label-header { background: #20201d; color: #fff; padding: 14px 20px; margin: 0; border-bottom: none; }
.food-label.modern .label-title, .food-label.modern .label-marketing { color: #fff; }
.food-label.modern > *:not(.label-header) { margin-left: 20px; margin-right: 20px; }
.food-label.modern .red-labels-container { margin-top: 16px; }
.food-label.modern .nutrition-header { background: #f3e6dd; color: #a64b2c; border: 1px solid #eadfd3; }
.food-label.modern .nutrition-table tbody tr:nth-child(odd) td { background: #faf7f2; }
.food-label.modern .footer-info { margin-bottom: 16px; }
`;

export function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Current Israeli (תקן 1145) nutrition table: kcal, sodium (mg), sugar
// teaspoons, trans fat, cholesterol, fibre.
function il1145TableHtml(e, isLiquid) {
  const fmtVal = (v) => (Number(v) || 0).toFixed(1);
  const unitLabel = isLiquid ? 'מל' : 'גרם';
  const sugs = Number(e.total_sugars) || 0;
  const trans = Number(e.trans_fatty_acids) || 0;
  const transStr = (trans < 0.5 && trans > 0) ? '< 0.5' : fmtVal(trans);
  const rows = [
    `<tr><td>אנרגיה (קלוריות)</td><td>${Math.trunc(e.food_energy || 0)}</td></tr>`,
    `<tr><td>סך השומנים (גרם)</td><td>${fmtVal(e.total_fat)}</td></tr>`,
    `<tr><td style='padding-right: 20px;'>מתוכם: חומצות שומן רוויות (גרם)</td><td>${fmtVal(e.saturated_fat)}</td></tr>`,
    `<tr><td style='padding-right: 20px;'>חומצות שומן טרנס (גרם)</td><td>${transStr}</td></tr>`,
    `<tr><td style='padding-right: 20px;'>כולסטרול (מ"ג)</td><td>${fmtVal(e.cholesterol)}</td></tr>`,
    `<tr><td>נתרן (מ"ג)</td><td>${fmtVal(e.sodium)}</td></tr>`,
    `<tr><td>סך הפחמימות (גרם)</td><td>${fmtVal(e.carbohydrates)}</td></tr>`,
    `<tr><td style='padding-right: 20px;'>מתוכן: סוכרים (גרם)</td><td>${fmtVal(sugs)}</td></tr>`,
    `<tr><td style='padding-right: 20px;'>כפיות סוכר</td><td>${fmtVal(sugs / 4)}</td></tr>`,
    `<tr><td>סיבים תזונתיים (גרם)</td><td>${fmtVal(e.total_dietary_fiber)}</td></tr>`,
    `<tr><td>חלבונים (גרם)</td><td>${fmtVal(e.protein)}</td></tr>`,
  ];
  return `<div class="nutrition-header">ערכים תזונתיים ל-100 ${unitLabel}</div>`
    + `<table class="nutrition-table"><thead><tr><th>סימון תזונתי</th><th>ל-100 ${unitLabel}</th></tr></thead>`
    + `<tbody>${rows.join('')}</tbody></table>`;
}

// Israeli-adapted EU 1169 nutrition declaration: dual energy (kJ + kcal), salt
// (from sodium), and a "% of reference intake" column. Order per EU Annex XV.
function eu1169TableHtml(e, isLiquid) {
  const unitLabel = isLiquid ? 'מ"ל' : 'גרם';
  const g = (v) => (Number(v) || 0).toFixed(1);
  const kcal = Math.round(Number(e.food_energy) || 0);
  const kj = Math.round(kcal * KCAL_TO_KJ);
  const salt = saltFromSodiumMg(e.sodium);
  const RI = REFERENCE_INTAKES;
  const pct = (val, ref) => (ref > 0 ? `${Math.round((val / ref) * 100)}%` : '—');
  const rows = [
    `<tr><td>אנרגיה</td><td>${kj} קי"ג / ${kcal} קק"ל</td><td>${pct(kcal, RI.energy_kcal)}</td></tr>`,
    `<tr><td>שומנים</td><td>${g(e.total_fat)} גרם</td><td>${pct(Number(e.total_fat) || 0, RI.total_fat)}</td></tr>`,
    `<tr><td style='padding-right: 20px;'>מתוכן: חומצות שומן רוויות</td><td>${g(e.saturated_fat)} גרם</td><td>${pct(Number(e.saturated_fat) || 0, RI.saturated_fat)}</td></tr>`,
    `<tr><td>פחמימות</td><td>${g(e.carbohydrates)} גרם</td><td>${pct(Number(e.carbohydrates) || 0, RI.carbohydrates)}</td></tr>`,
    `<tr><td style='padding-right: 20px;'>מתוכן: סוכרים</td><td>${g(e.total_sugars)} גרם</td><td>${pct(Number(e.total_sugars) || 0, RI.total_sugars)}</td></tr>`,
    `<tr><td style='padding-right: 20px;'>סיבים תזונתיים</td><td>${g(e.total_dietary_fiber)} גרם</td><td>${pct(Number(e.total_dietary_fiber) || 0, RI.total_dietary_fiber)}</td></tr>`,
    `<tr><td>חלבונים</td><td>${g(e.protein)} גרם</td><td>${pct(Number(e.protein) || 0, RI.protein)}</td></tr>`,
    `<tr><td>מלח</td><td>${salt.toFixed(2)} גרם</td><td>${pct(salt, RI.salt)}</td></tr>`,
  ];
  return `<div class="nutrition-header">ערכים תזונתיים ל-100 ${unitLabel}</div>`
    + `<table class="nutrition-table"><thead><tr><th>רכיב תזונתי</th><th>ל-100 ${unitLabel}</th><th>% מהצריכה*</th></tr></thead>`
    + `<tbody>${rows.join('')}</tbody></table>`
    + `<div style="font-size:11px;color:#555;margin-top:4px;">* מבוסס על צריכה יומית מומלצת למבוגר ממוצע (8,400 קי"ג / 2,000 קק"ל). נתרן: ${Math.round(Number(e.sodium) || 0)} מ"ג.</div>`;
}

// The label body as an HTML string (no outer <svg>). `state` carries the same
// payload recompute() produces, plus `redLabelImageSrcs` mapping a red-mark type
// to a resolved <img> src (data URL or relative path), or null for a text fallback.
export function buildLabelInnerHtml(standardKey, s, variant = 'classic') {
  const parts = [`<div class="food-label ${variant || 'classic'}" dir="rtl">`];

  // Header
  parts.push('<div class="label-header">');
  parts.push(`<h1 class="label-title">${escapeHtml(s.finalName)}</h1>`);
  if (s.marketing) parts.push(`<div class="label-marketing">${escapeHtml(s.marketing)}</div>`);
  parts.push('</div>');

  // Red warning marks — retained under BOTH standards.
  if (s.redLabels && s.redLabels.length) {
    parts.push('<div class="red-labels-container">');
    for (const [type, text] of s.redLabels) {
      const src = s.redLabelImageSrcs ? s.redLabelImageSrcs[type] : null;
      if (src) parts.push(`<img src="${src}" class="red-label-img" alt="${escapeHtml(text)}">`);
      else parts.push(`<div class="red-fallback">${escapeHtml(text)}</div>`);
    }
    parts.push('</div>');
  }

  // Nutrition declaration — format depends on the standard.
  parts.push(standardKey === '1169'
    ? eu1169TableHtml(s.edited, s.isLiquid)
    : il1145TableHtml(s.edited, s.isLiquid));

  // Ingredients — pre-rendered with per-chip manual bold highlighting.
  parts.push(`<div class="ingredients-section"><strong>רכיבים:</strong> ${s.ingredientsHtml || ''}</div>`);

  // "Contains" line: auto-detected allergens (1169) + any manual note.
  if (s.containsAllergens && s.containsAllergens.length) {
    parts.push(`<div class="allergens-box">מכיל: ${escapeHtml(s.containsAllergens.join(', '))}.</div>`);
  }
  if (s.allergens) parts.push(`<div class="allergens-box">${escapeHtml(s.allergens)}</div>`);

  // Footer
  parts.push('<div class="footer-info">');
  parts.push(`<div><strong>תנאי אחסון:</strong> ${escapeHtml(s.storage)}</div>`);
  parts.push(`<div><strong>יצרן:</strong> ${escapeHtml(s.manufacturer)}</div>`);
  parts.push(`<div><strong>תוקף:</strong> ${escapeHtml(s.expiry)}</div>`);
  parts.push('</div>');

  parts.push('</div>');
  return parts.join('');
}

// Build the label as an <svg> element. Internal units are CSS px; `spec.widthMm`
// sets the content width. Height is provisional until fitSvgHeight() measures the
// laid-out content (call it once the svg is in the DOM).
export function buildLabelSvg(standardKey, state, spec = DEFAULT_SPEC) {
  const widthMm = spec.widthMm || DEFAULT_SPEC.widthMm;
  const widthPx = Math.round(widthMm * PX_PER_MM);
  const heightPx = widthPx; // provisional square; corrected by fitSvgHeight()

  const svg = document.createElementNS(SVGNS, 'svg');
  svg.setAttribute('xmlns', SVGNS);
  svg.setAttribute('viewBox', `0 0 ${widthPx} ${heightPx}`);
  svg.setAttribute('width', `${widthMm}mm`);
  svg.dataset.widthMm = String(widthMm);

  const fo = document.createElementNS(SVGNS, 'foreignObject');
  fo.setAttribute('x', '0');
  fo.setAttribute('y', '0');
  fo.setAttribute('width', String(widthPx));
  fo.setAttribute('height', String(heightPx));

  const root = document.createElementNS(XHTMLNS, 'div');
  root.setAttribute('xmlns', XHTMLNS);
  root.innerHTML = `<style>${LABEL_CONTENT_CSS}</style>${buildLabelInnerHtml(standardKey, state, spec.variant)}`;

  fo.appendChild(root);
  svg.appendChild(fo);
  return svg;
}

// Measure the laid-out label content and set the svg/foreignObject height to fit.
// Must run while the svg is attached to the document. Returns the height in px.
export function fitSvgHeight(svg) {
  const fo = svg.querySelector('foreignObject');
  const label = fo && fo.firstElementChild && fo.firstElementChild.querySelector('.food-label');
  if (!label) return null;
  // offsetHeight is in the foreignObject's own coordinate space (= viewBox user
  // units), unaffected by the outer mm scaling — getBoundingClientRect would be.
  const heightPx = label.offsetHeight || Math.ceil(label.getBoundingClientRect().height);
  if (!heightPx) return null;
  const widthPx = parseFloat(fo.getAttribute('width'));
  const widthMm = parseFloat(svg.dataset.widthMm) || DEFAULT_SPEC.widthMm;
  svg.setAttribute('viewBox', `0 0 ${widthPx} ${heightPx}`);
  svg.setAttribute('height', `${(heightPx / PX_PER_MM).toFixed(2)}mm`);
  fo.setAttribute('height', String(heightPx));
  // Keep the physical aspect ratio honest for exports.
  svg.dataset.heightMm = (heightPx / PX_PER_MM).toFixed(2);
  svg.dataset.widthMm = String(widthMm);
  return heightPx;
}

// Serialize an svg element to a standalone XML string (for .svg download / PNG).
export function svgToString(svg) {
  return '<?xml version="1.0" encoding="UTF-8"?>\n'
    + new XMLSerializer().serializeToString(svg);
}
