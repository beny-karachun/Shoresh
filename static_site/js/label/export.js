// label/export.js — turn the label <svg> into deliverables.
//
//   • printLabel  — direct browser print, page sized to the label (self-print)
//   • exportPng   — high-res raster (designer / on-screen review)
//   • exportPdf   — exact-mm PDF page with a high-DPI raster (print shop)
//   • exportSvg   — standalone editable vector file (packaging designer)
//
// Note on "vector": the editable SVG download and the browser Print → "Save as
// PDF" path are true vector. The one-click PDF embeds a high-DPI raster of the
// proven <foreignObject> render at the exact physical page size — this avoids
// the fragile RTL-Hebrew / font-subset issues of native SVG→PDF text while still
// giving the print shop a correct, exact-size, high-resolution file.

import { svgToString } from './svg.js';

const JSPDF_SRC = 'vendor/jspdf.umd.min.js';
let jsPdfPromise = null;

// Lazy-load jsPDF on first PDF export (keeps it off the initial page load).
function ensureJsPdf() {
  if (window.jspdf && window.jspdf.jsPDF) return Promise.resolve(window.jspdf.jsPDF);
  if (!jsPdfPromise) {
    jsPdfPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = JSPDF_SRC;
      script.onload = () => {
        if (window.jspdf && window.jspdf.jsPDF) resolve(window.jspdf.jsPDF);
        else reject(new Error('jsPDF loaded but window.jspdf.jsPDF is missing'));
      };
      script.onerror = () => reject(new Error('Failed to load ' + JSPDF_SRC));
      document.head.appendChild(script);
    });
  }
  return jsPdfPromise;
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

// Physical dimensions (mm) recorded on the svg by buildLabelSvg / fitSvgHeight.
function physicalMm(svg) {
  const widthMm = parseFloat(svg.dataset.widthMm) || 100;
  const heightMm = parseFloat(svg.dataset.heightMm) || widthMm;
  return { widthMm, heightMm };
}

// Rasterize the label svg to a <canvas> at a given DPI. Shared by PNG + PDF.
async function rasterizeToCanvas(svg, dpi) {
  const { widthMm, heightMm } = physicalMm(svg);
  const pxPerMm = dpi / 25.4;
  const w = Math.max(1, Math.round(widthMm * pxPerMm));
  const h = Math.max(1, Math.round(heightMm * pxPerMm));

  // Clone and pin explicit pixel dimensions so the vector content scales up
  // crisply to the target resolution before rasterization.
  const clone = svg.cloneNode(true);
  clone.setAttribute('width', String(w));
  clone.setAttribute('height', String(h));

  if (document.fonts && document.fonts.ready) {
    try { await document.fonts.ready; } catch { /* non-fatal */ }
  }

  const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgToString(clone));
  const img = new Image();
  await new Promise((resolve, reject) => {
    img.onload = resolve;
    img.onerror = () => reject(new Error('SVG image failed to load for rasterization'));
    img.src = url;
  });

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
  return { canvas, w, h, widthMm, heightMm };
}

// High-res PNG download. 150 = on-screen review, 300 = print, 600 = high-res.
export async function exportPng(svg, { dpi = 300, filename = 'label.png' } = {}) {
  const { canvas } = await rasterizeToCanvas(svg, dpi);
  await new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) { reject(new Error('Canvas is empty (toBlob returned null)')); return; }
      downloadBlob(blob, filename);
      resolve();
    }, 'image/png');
  });
}

// Exact-mm PDF for a print shop: one page sized to the label, containing a
// high-DPI raster of the label.
export async function exportPdf(svg, { dpi = 300, filename = 'label.pdf' } = {}) {
  const JsPDF = await ensureJsPdf();
  const { canvas, widthMm, heightMm } = await rasterizeToCanvas(svg, dpi);
  const orientation = widthMm >= heightMm ? 'landscape' : 'portrait';
  const doc = new JsPDF({ unit: 'mm', format: [widthMm, heightMm], orientation, compress: true });
  // Guard against jsPDF re-ordering the page dims by orientation.
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  doc.addImage(canvas, 'PNG', 0, 0, pageW, pageH, undefined, 'FAST');
  doc.save(filename);
}

// Direct browser print, page sized exactly to the label (mm), no margins/headers.
export function printLabel(svg) {
  const { widthMm, heightMm } = physicalMm(svg);
  const clone = svg.cloneNode(true);
  clone.setAttribute('width', `${widthMm}mm`);
  clone.setAttribute('height', `${heightMm}mm`);

  const html = `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
  <meta charset="UTF-8">
  <style>
    @page { size: ${widthMm}mm ${heightMm}mm; margin: 0; }
    html, body { margin: 0; padding: 0; }
    svg { display: block; }
  </style>
</head>
<body>${svgToString(clone)}</body>
</html>`;

  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  Object.assign(iframe.style, {
    position: 'fixed', right: '0', bottom: '0',
    width: '0', height: '0', border: '0',
  });
  document.body.appendChild(iframe);

  const cleanup = () => setTimeout(() => iframe.remove(), 1000);
  iframe.onload = () => {
    try {
      const win = iframe.contentWindow;
      win.focus();
      win.print();
    } catch (e) {
      console.error('Print failed', e);
    } finally {
      cleanup();
    }
  };

  const doc = iframe.contentWindow.document;
  doc.open();
  doc.write(html);
  doc.close();
}

// Serialize the label to a standalone .svg file (editable in Illustrator /
// Inkscape / Figma). Restores the physical mm size on the downloaded asset.
export function exportSvg(svg, { filename = 'label.svg' } = {}) {
  const { widthMm, heightMm } = physicalMm(svg);
  const clone = svg.cloneNode(true);
  clone.setAttribute('width', `${widthMm}mm`);
  clone.setAttribute('height', `${heightMm}mm`);
  const blob = new Blob([svgToString(clone)], { type: 'image/svg+xml;charset=utf-8' });
  downloadBlob(blob, filename);
}
