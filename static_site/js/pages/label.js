// pages/label.js — "עיצוב תווית" (label designer).
// Builds a food label per Israeli standard 1145, including the red ("high in…")
// warning marks. Three data sources: an existing recipe, manual entry, or a mix
// assembled from database products (with per-ingredient oil retention, cooking
// retention codes and liquid loss). Ported from the Streamlit implementation.

import {
  h, clear, statusBox, sectionHeader, searchSelect, numberField, selectField,
} from '../ui.js';
import {
  FIELDS_MAPPING, RETENTION_FIELD_MAPPING, NUTRIENT_CATEGORIES, MANDATORY_FIELDS,
  THRESHOLDS_SOLID, THRESHOLDS_LIQUID, IL_ALLERGENS,
} from '../nutrition.js';

// The two labeling standards offered by the designer.
const STANDARD_META = {
  '1145': {
    short: 'תקן 1145',
    subtitle: 'יצירת תווית מוצר לפי תקן 1145 — סימון תזונתי ישראלי, כולל סימון אדום',
  },
  '1169': {
    short: 'תקן 1169',
    subtitle: 'יצירת תווית מוצר לפי תקן 1169 (התאמה ישראלית) — כולל סימון אדום, ערך אנרגטי בקי״ג, % מהצריכה היומית והדגשת אלרגנים',
  },
};
import {
  searchFoods, searchRecipes, getFoodDetails, getAvailableUnits,
  getRecipeDetails, getRetentionOptions, getRetentionFactors,
} from '../db.js';
import { buildLabelSvg, fitSvgHeight } from '../label/svg.js';
import { exportPng, exportPdf, printLabel, exportSvg } from '../label/export.js';
import {
  WIDTH_PRESETS, TEMPLATES, DEFAULT_LABEL_SPEC, clampWidthMm,
} from '../label/spec.js';

const SOURCE_RECIPE = 'מתכון קיים';
const SOURCE_MANUAL = 'הזנה ידנית';
const SOURCE_BUILD = '(מומלץ) צור מתכון ממוצרים במאגר';

// Red-label image filenames (matching the originals, including the typo).
const RED_LABEL_IMAGES = {
  'נתרן': 'highsaltlabel.png',
  'סוכר': 'highsugarlaber.png',
  'שומן רווי': 'highsaturatedfatlabel.png',
};

// Persisted state (survives tab switches).
let sourceType = SOURCE_BUILD;
let labelIngredients = []; // builder ingredients
let standard = '1145'; // '1145' (current Israeli) or '1169' (Israeli-adapted EU)
let labelSpec = { ...DEFAULT_LABEL_SPEC }; // physical width (mm) + density variant
const imageDataUrls = {};  // filename -> dataURL (loaded lazily)

function emptyNutrition() {
  const n = {};
  for (const k of Object.keys(FIELDS_MAPPING)) n[k] = 0.0;
  return n;
}

async function preloadImages(onReady) {
  const files = [...new Set(Object.values(RED_LABEL_IMAGES))];
  await Promise.all(files.map(async (file) => {
    if (imageDataUrls[file]) return;
    try {
      const res = await fetch(`labels/${file}`);
      if (!res.ok) return;
      const blob = await res.blob();
      imageDataUrls[file] = await new Promise((resolve) => {
        const fr = new FileReader();
        fr.onload = () => resolve(fr.result);
        fr.readAsDataURL(blob);
      });
    } catch { /* ignore — fall back to red text box */ }
  }));
  onReady();
}

// -------------------------------------------------------------------------
// Builder: compute the mix nutrition per 100g (incl. liquid loss, retention
// codes and oil retention). Direct port of app.py lines ~1402-1469.
// -------------------------------------------------------------------------
function computeBuilderData() {
  const data = { name: '', ingredients: '', nutrition: emptyNutrition() };
  if (labelIngredients.length === 0) return data;

  const totalMixWeight = labelIngredients.reduce((s, it) => s + it.weight, 0);

  // Ingredients list for the label: main ingredients + retained oils, by weight.
  const all = [];
  for (const item of labelIngredients) {
    all.push({ name: item.name, weight: item.weight });
    if (item.oil_retention) {
      all.push({
        name: item.oil_retention.oil_name,
        weight: item.weight * item.oil_retention.percentage / 100,
      });
    }
  }
  all.sort((a, b) => b.weight - a.weight);
  data.ingredients = all.map((x) => x.name).join(', ');

  const sortedIngredients = [...labelIngredients].sort((a, b) => b.weight - a.weight);
  if (!data.name && sortedIngredients.length) {
    data.name = `תערובת ${sortedIngredients[0].name}...`;
  }

  // Total weight including retained oil.
  let totalWeightWithOil = totalMixWeight;
  for (const item of labelIngredients) {
    if (item.oil_retention) {
      totalWeightWithOil += item.weight * item.oil_retention.percentage / 100;
    }
  }
  if (totalWeightWithOil <= 0) return data;

  const mix = emptyNutrition();
  for (const item of labelIngredients) {
    const prod = getFoodDetails(item.code);
    if (prod) {
      const itemFactor = item.weight / 100;
      const concentration = item.liquid_loss ? 1 / (1 - item.liquid_loss / 100) : 1;
      const retFactors = item.retention_code ? getRetentionFactors(item.retention_code.code) : null;

      for (const k of Object.keys(FIELDS_MAPPING)) {
        let val = Number(prod[k]);
        if (!Number.isFinite(val)) val = 0;
        let retentionMultiplier = 1;
        if (retFactors && RETENTION_FIELD_MAPPING[k]) {
          const pct = Number(retFactors[RETENTION_FIELD_MAPPING[k]] ?? 100);
          retentionMultiplier = Number.isFinite(pct) ? pct / 100 : 1;
        }
        mix[k] += val * itemFactor * concentration * retentionMultiplier;
      }
    }

    if (item.oil_retention) {
      const oil = getFoodDetails(item.oil_retention.oil_code);
      if (oil) {
        const oilWeight = item.weight * item.oil_retention.percentage / 100;
        const oilFactor = oilWeight / 100;
        for (const k of Object.keys(FIELDS_MAPPING)) {
          let val = Number(oil[k]);
          if (!Number.isFinite(val)) val = 0;
          mix[k] += val * oilFactor;
        }
      }
    }
  }

  const finalFactor = 100 / totalWeightWithOil;
  for (const k of Object.keys(FIELDS_MAPPING)) data.nutrition[k] = mix[k] * finalFactor;
  return data;
}

function render(container) {
  clear(container);

  // Header with a subtitle that reflects the chosen standard.
  const subtitle = h('p', { class: 'subtitle' });
  container.appendChild(h('div', { class: 'section-header' }, [
    h('h2', { text: '🏷️ עיצוב תווית למוצר' }),
    subtitle,
  ]));

  // Holds the current step-2 recompute fn so the standard toggle can re-render
  // the preview without rebuilding (and losing) the edited form.
  let currentRecompute = null;
  const updateSubtitle = () => { subtitle.textContent = STANDARD_META[standard].subtitle; };

  // Standard toggle: תקן 1145 ↔ תקן 1169.
  const stdToggle = h('div', { class: 'btn-group' });
  for (const key of ['1145', '1169']) {
    const radio = h('input', { type: 'radio', name: 'label-standard' });
    radio.checked = standard === key;
    radio.addEventListener('change', () => {
      if (!radio.checked) return;
      standard = key;
      updateSubtitle();
      if (currentRecompute) currentRecompute();
    });
    stdToggle.appendChild(h('label', { class: 'checkbox' }, [radio, STANDARD_META[key].short]));
  }
  container.appendChild(h('div', { class: 'panel' }, [
    h('span', { class: 'field-label', text: 'תקן הסימון:' }),
    stdToggle,
  ]));
  updateSubtitle();

  // labelData is recomputed from the active source; the Step-2 form reads its
  // defaults from it.
  let labelData = { name: '', ingredients: '', nutrition: emptyNutrition() };

  // --- Step 1: data source ---
  container.appendChild(h('h3', { class: 'block-title', text: '1. פרטי המוצר' }));
  const sourceRadios = h('div', { class: 'btn-group', style: { marginBottom: '12px' } });
  for (const opt of [SOURCE_RECIPE, SOURCE_MANUAL, SOURCE_BUILD]) {
    const radio = h('input', { type: 'radio', name: 'source' });
    radio.checked = sourceType === opt;
    radio.addEventListener('change', () => {
      if (radio.checked) { sourceType = opt; renderSource(); rebuildSteps(); }
    });
    sourceRadios.appendChild(h('label', { class: 'checkbox' }, [radio, opt]));
  }
  container.appendChild(sourceRadios);

  const sourceArea = h('div', { class: 'panel' });
  container.appendChild(sourceArea);

  const stepsArea = h('div', {});
  container.appendChild(stepsArea);

  // ---- source renderers ----
  function renderSource() {
    clear(sourceArea);
    if (sourceType === SOURCE_RECIPE) renderRecipeSource();
    else if (sourceType === SOURCE_MANUAL) renderManualSource();
    else renderBuildSource();
  }

  function renderManualSource() {
    sourceArea.appendChild(h('p', { class: 'caption', text: 'הזן את כל הנתונים ידנית בשלב הבא.' }));
    labelData = { name: '', ingredients: '', nutrition: emptyNutrition() };
  }

  function renderRecipeSource() {
    const picker = searchSelect({
      placeholder: 'שניצל...',
      search: (term) => searchRecipes(term, 20).map((r) => ({ value: r.Code, label: r.shmmitzrach })),
      onSelect: (item) => {
        const details = getRecipeDetails(item.value);
        labelData = { name: item.label, ingredients: '', nutrition: emptyNutrition() };
        if (details.length) {
          const sorted = [...details].sort((a, b) => Number(b.mishkal) - Number(a.mishkal));
          labelData.ingredients = sorted.map((r) => r.shmmitzrach).join(', ');
          const prod = getFoodDetails(item.value);
          if (prod) {
            for (const k of Object.keys(FIELDS_MAPPING)) labelData.nutrition[k] = Number(prod[k]) || 0;
          }
        }
        rebuildSteps();
      },
    });
    sourceArea.appendChild(h('label', { class: 'field' }, [
      h('span', { class: 'field-label', text: 'חפש מתכון:' }),
      picker.wrapper,
    ]));
  }

  function renderBuildSource() {
    sourceArea.appendChild(h('p', { class: 'caption',
      text: 'הרכב מוצר ממספר רכיבים. המערכת תחשב את הערכים הסופיים ותסדר את רשימת הרכיבים.' }));

    // Add ingredient.
    let selected = null;
    const addControls = h('div', {});
    const picker = searchSelect({
      placeholder: 'קמח, סוכר, ביצים...',
      search: (term) => searchFoods(term).map((r) => ({ value: r.Code, label: r.shmmitzrach })),
      onSelect: (item) => { selected = item; renderAddControls(); },
    });
    sourceArea.appendChild(h('label', { class: 'field' }, [
      h('span', { class: 'field-label', text: 'חפש רכיב להוספה:' }),
      picker.wrapper,
    ]));
    sourceArea.appendChild(addControls);

    function renderAddControls() {
      clear(addControls);
      if (!selected) return;
      const units = getAvailableUnits(selected.value);
      const unitOpts = [{ label: 'גרם', weight: 1.0 }, ...units.map((u) => ({ label: u.shmmida, weight: u.mishkal }))];
      const amount = numberField('כמות:', { value: 100, min: 0.1, step: 10 });
      const unit = selectField('יחידה:', unitOpts.map((u, i) => ({ value: i, label: u.label })));
      const addBtn = h('div', { class: 'field' }, [
        h('span', { class: 'field-label', text: ' ' }),
        h('button', {
          class: 'btn primary', text: '➕ הוסף',
          onClick: () => {
            const amt = parseFloat(amount.input.value) || 0;
            const u = unitOpts[Number(unit.select.value)];
            labelIngredients.push({
              code: selected.value, name: selected.label, weight: amt * u.weight,
              display_amount: amt, display_unit: u.label,
              oil_retention: null, liquid_loss: null, retention_code: null,
            });
            picker.clear();
            selected = null;
            renderSource();
            rebuildSteps();
          },
        }),
      ]);
      addControls.appendChild(h('div', { class: 'row', style: { marginTop: '12px' } }, [amount.wrapper, unit.wrapper, addBtn]));
    }

    // Ingredient list with per-ingredient option forms.
    if (labelIngredients.length) {
      sourceArea.appendChild(h('hr', { class: 'divider' }));
      sourceArea.appendChild(h('div', { class: 'block-title', text: '🛒 רכיבים שנבחרו:' }));

      let totalMix = 0;
      let totalOil = 0;

      labelIngredients.forEach((item, i) => {
        const row = h('div', { class: 'list-row' }, [
          h('span', { class: 'grow', text: `${i + 1}. ${item.name}` }),
          h('span', { class: 'meta', text: `${item.display_amount} ${item.display_unit} (${item.weight.toFixed(1)} גרם)` }),
          h('button', { class: 'btn small', text: 'ספיחת שמן', onClick: () => toggle(i, 'oil') }),
          h('button', { class: 'btn small', text: 'קוד שימור', onClick: () => toggle(i, 'ret') }),
          h('button', { class: 'btn small', text: 'איבוד נוזלים', onClick: () => toggle(i, 'loss') }),
          h('button', { class: 'btn danger icon', text: '🗑️', onClick: () => { labelIngredients.splice(i, 1); renderSource(); rebuildSteps(); } }),
        ]);
        sourceArea.appendChild(row);

        if (item.retention_code) sourceArea.appendChild(h('div', { class: 'caption', text: `🍳 קוד שימור: ${item.retention_code.hebrew_name}` }));
        if (item.liquid_loss) sourceArea.appendChild(h('div', { class: 'caption', text: `💧 איבוד נוזלים: ${item.liquid_loss}% (ריכוז x${(1 / (1 - item.liquid_loss / 100)).toFixed(2)})` }));
        if (item.oil_retention) {
          const ow = item.weight * item.oil_retention.percentage / 100;
          totalOil += ow;
          sourceArea.appendChild(h('div', { class: 'caption', text: `🛢️ ספיחת שמן: ${item.oil_retention.oil_name} (${item.oil_retention.percentage}%) = ${ow.toFixed(1)} גרם` }));
        }

        if (expand[`oil_${i}`]) sourceArea.appendChild(oilForm(i));
        if (expand[`ret_${i}`]) sourceArea.appendChild(retForm(i));
        if (expand[`loss_${i}`]) sourceArea.appendChild(lossForm(i));

        totalMix += item.weight;
      });

      sourceArea.appendChild(totalOil > 0
        ? statusBox('info', `⚖️ משקל כולל של התערובת: ${totalMix.toFixed(1)} גרם + ${totalOil.toFixed(1)} גרם שמן = ${(totalMix + totalOil).toFixed(1)} גרם`)
        : statusBox('info', `⚖️ משקל כולל של התערובת: ${totalMix.toFixed(1)} גרם`));
    }

    labelData = computeBuilderData();
  }

  // expand state for the inline forms
  const expand = {};
  function toggle(i, type) {
    const key = `${type}_${i}`;
    expand[key] = !expand[key];
    renderSource();
  }

  // ---- inline option forms ----
  function oilForm(i) {
    const item = labelIngredients[i];
    const form = h('div', { class: 'inline-form' });
    form.appendChild(h('div', { class: 'block-title', text: `⚙️ הגדרת ספיחת שמן עבור: ${item.name}` }));
    let oilSel = null;
    const pctField = numberField('אחוז ספיחת שמן (%):', { value: item.oil_retention ? item.oil_retention.percentage : 7.0, min: 0, max: 100, step: 0.5 });
    const picker = searchSelect({
      placeholder: 'שמן סויה, שמן זית...',
      search: (term) => searchFoods(term).map((r) => ({ value: r.Code, label: r.shmmitzrach })),
      onSelect: (it) => { oilSel = it; },
    });
    form.appendChild(h('label', { class: 'field' }, [h('span', { class: 'field-label', text: 'חפש מוצר (שמן):' }), picker.wrapper]));
    form.appendChild(pctField.wrapper);
    form.appendChild(h('div', { class: 'btn-group', style: { marginTop: '10px' } }, [
      h('button', { class: 'btn primary small', text: '💾 שמור', onClick: () => {
        if (oilSel) {
          item.oil_retention = { oil_code: oilSel.value, oil_name: oilSel.label, percentage: parseFloat(pctField.input.value) || 0 };
        }
        expand[`oil_${i}`] = false; renderSource(); rebuildSteps();
      } }),
      h('button', { class: 'btn small', text: '🗑️ נקה', onClick: () => { item.oil_retention = null; expand[`oil_${i}`] = false; renderSource(); rebuildSteps(); } }),
      h('button', { class: 'btn small', text: '❌ ביטול', onClick: () => { expand[`oil_${i}`] = false; renderSource(); } }),
    ]));
    return form;
  }

  function retForm(i) {
    const item = labelIngredients[i];
    const form = h('div', { class: 'inline-form' });
    form.appendChild(h('div', { class: 'block-title', text: `🍳 הגדרת קוד שימור (Retention) עבור: ${item.name}` }));
    form.appendChild(h('p', { class: 'caption', text: 'חפש שיטת בישול/עיבוד כדי להתאים את אחוזי השימור של הויטמינים והמינרלים' }));

    const options = getRetentionOptions();
    const sel = selectField('בחר שיטת בישול/עיבוד:', [{ value: '', label: '-- ללא --' },
      ...options.map((o) => ({ value: o.retention_code, label: o.hebrew_name }))],
      { value: item.retention_code ? item.retention_code.code : '' });

    const filter = h('input', { type: 'text', class: 'search-input', placeholder: 'לדוגמה: מטוגן, אפוי, מבושל, ביצה, עוף...' });
    filter.addEventListener('input', () => {
      const term = filter.value.trim().toLowerCase();
      clear(sel.select);
      const filtered = options.filter((o) => !term
        || String(o.hebrew_name || '').toLowerCase().includes(term)
        || String(o.retention_name || '').toLowerCase().includes(term));
      sel.select.appendChild(h('option', { value: '', text: '-- ללא --' }));
      for (const o of filtered) sel.select.appendChild(h('option', { value: o.retention_code, text: o.hebrew_name }));
    });

    form.appendChild(h('label', { class: 'field' }, [h('span', { class: 'field-label', text: 'חפש שיטת בישול:' }), filter]));
    form.appendChild(sel.wrapper);
    form.appendChild(h('div', { class: 'btn-group', style: { marginTop: '10px' } }, [
      h('button', { class: 'btn primary small', text: '💾 שמור', onClick: () => {
        const code = sel.select.value;
        if (code) {
          const opt = options.find((o) => String(o.retention_code) === String(code));
          item.retention_code = { code: opt.retention_code, name: opt.retention_name, hebrew_name: opt.hebrew_name };
        } else {
          item.retention_code = null;
        }
        expand[`ret_${i}`] = false; renderSource(); rebuildSteps();
      } }),
      h('button', { class: 'btn small', text: '🗑️ נקה', onClick: () => { item.retention_code = null; expand[`ret_${i}`] = false; renderSource(); rebuildSteps(); } }),
      h('button', { class: 'btn small', text: '❌ ביטול', onClick: () => { expand[`ret_${i}`] = false; renderSource(); } }),
    ]));
    return form;
  }

  function lossForm(i) {
    const item = labelIngredients[i];
    const form = h('div', { class: 'inline-form' });
    form.appendChild(h('div', { class: 'block-title', text: `💧 הגדרת איבוד נוזלים עבור: ${item.name}` }));
    form.appendChild(h('p', { class: 'caption', text: 'הערכים התזונתיים של מוצר זה ירוכזו - אם 50% מהנוזל אבד, הערכים יהיו כפולים (לפני הוספת ספיחת שמן)' }));
    const pctField = numberField('אחוז איבוד נוזלים (%):', { value: item.liquid_loss || 0, min: 0, max: 99, step: 0.1 });
    form.appendChild(pctField.wrapper);
    form.appendChild(h('div', { class: 'btn-group', style: { marginTop: '10px' } }, [
      h('button', { class: 'btn primary small', text: '💾 שמור', onClick: () => { item.liquid_loss = parseFloat(pctField.input.value) || 0; expand[`loss_${i}`] = false; renderSource(); rebuildSteps(); } }),
      h('button', { class: 'btn small', text: '🗑️ נקה', onClick: () => { item.liquid_loss = null; expand[`loss_${i}`] = false; renderSource(); rebuildSteps(); } }),
      h('button', { class: 'btn small', text: '❌ ביטול', onClick: () => { expand[`loss_${i}`] = false; renderSource(); } }),
    ]));
    return form;
  }

  // -------------------------------------------------------------------------
  // Steps 2-5: edit data, full composition, extra info, red labels, preview.
  // -------------------------------------------------------------------------
  function rebuildSteps() {
    clear(stepsArea);

    // Step 2 — edit data
    stepsArea.appendChild(h('hr', { class: 'divider' }));
    stepsArea.appendChild(h('h3', { class: 'block-title', text: '2. עריכת נתונים' }));

    const nameField = h('input', { type: 'text', class: 'text-input', value: labelData.name || '' });
    const isLiquid = h('input', { type: 'checkbox' });
    const marketing = h('textarea', { class: 'text-input', rows: '3' });

    // Ingredient chips: each ingredient is an editable name + a bold toggle + a
    // remove button. Editing a name does not re-render (keeps input focus); only
    // add / remove / auto-highlight rebuild.
    let ingredientItems = parseIngredients(labelData.ingredients);
    const chipsBox = h('div', { class: 'chips-box' });
    const addInput = h('input', { type: 'text', class: 'chip-input add', placeholder: 'הוסף רכיב…' });

    const sizeInput = (input, value) => { input.size = Math.max(4, String(value || '').length + 1); };

    const makeChip = (item) => {
      const nameInput = h('input', { type: 'text', class: 'chip-input', value: item.name });
      sizeInput(nameInput, item.name);
      nameInput.style.fontWeight = item.bold ? '700' : '400';
      nameInput.addEventListener('input', () => {
        item.name = nameInput.value;
        sizeInput(nameInput, item.name);
        recompute();
      });
      const boldBtn = h('button', { class: `btn small chip-bold${item.bold ? ' active' : ''}`, text: 'B', title: 'הדגשה (מודגש)' });
      boldBtn.addEventListener('click', () => {
        item.bold = !item.bold;
        nameInput.style.fontWeight = item.bold ? '700' : '400';
        boldBtn.classList.toggle('active', item.bold);
        recompute();
      });
      const delBtn = h('button', { class: 'btn danger small', text: '×', title: 'הסר' });
      const chip = h('div', { class: 'ingredient-chip' }, [nameInput, boldBtn, delBtn]);
      delBtn.addEventListener('click', () => {
        const i = ingredientItems.indexOf(item);
        if (i >= 0) ingredientItems.splice(i, 1);
        chip.remove();
        recompute();
      });
      return chip;
    };

    const renderChips = () => { clear(chipsBox); ingredientItems.forEach((it) => chipsBox.appendChild(makeChip(it))); };
    const addIngredient = () => {
      const name = addInput.value.trim();
      if (!name) return;
      const item = { name, bold: false };
      ingredientItems.push(item);
      chipsBox.appendChild(makeChip(item));
      addInput.value = '';
      addInput.focus();
      recompute();
    };
    addInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addIngredient(); } });
    renderChips();

    const autoBtn = h('button', { class: 'btn small', text: '✨ הדגש אלרגנים', title: 'הדגשת רכיבים שהם אלרגנים נפוצים' });
    autoBtn.addEventListener('click', () => {
      ingredientItems.forEach((it) => { if (allergensInName(it.name).length) it.bold = true; });
      renderChips();
      recompute();
    });

    stepsArea.appendChild(h('div', { class: 'panel' }, [
      h('div', { class: 'row' }, [
        h('label', { class: 'field' }, [h('span', { class: 'field-label', text: 'שם מוצר (כפי שיופיע על התווית):' }), nameField]),
        h('label', { class: 'field' }, [h('span', { class: 'field-label', text: 'טקסט שיווקי / תיאור:' }), marketing]),
      ]),
      h('label', { class: 'checkbox', style: { margin: '10px 0' } }, [isLiquid, 'האם המוצר נוזלי? (משפיע על ספים למדבקות אדומות)']),
      h('div', { class: 'field' }, [
        h('span', { class: 'field-label', text: 'רשימת רכיבים — ערוך שם, לחץ B להדגשה, × להסרה:' }),
        chipsBox,
        h('div', { class: 'row tight', style: { marginTop: '8px' } }, [
          addInput,
          h('button', { class: 'btn small', text: '➕ הוסף', onClick: addIngredient }),
          autoBtn,
        ]),
      ]),
    ]));

    // Mandatory nutrition (editable)
    stepsArea.appendChild(h('h3', { class: 'block-title', text: 'ערכים תזונתיים (ל-100 גרם/מל)' }));
    const editedInputs = {};
    const mandGrid = h('div', { class: 'nutri-cols' });
    for (const field of MANDATORY_FIELDS) {
      let val = labelData.nutrition[field];
      if (val === null || val === undefined) val = 0;
      const f = numberField(FIELDS_MAPPING[field], { value: Number(val).toFixed(1), step: 0.1 });
      f.input.addEventListener('input', recompute);
      editedInputs[field] = f.input;
      mandGrid.appendChild(f.wrapper);
    }
    stepsArea.appendChild(h('div', { class: 'panel' }, [mandGrid]));

    // Step 2.5 — full composition
    stepsArea.appendChild(h('hr', { class: 'divider' }));
    stepsArea.appendChild(h('h3', { class: 'block-title', text: '2.5 הרכב תזונתי מלא' }));
    const fluidLoss = numberField('אחוז איבוד נוזלים (%):', { value: 0, min: 0, max: 99.9, step: 0.1 });
    const displayWeight = numberField('משקל להצגה (גרם):', { value: 100, min: 1, max: 10000, step: 10 });
    fluidLoss.input.addEventListener('input', recompute);
    displayWeight.input.addEventListener('input', recompute);
    stepsArea.appendChild(h('div', { class: 'panel' }, [h('div', { class: 'row' }, [fluidLoss.wrapper, displayWeight.wrapper])]));
    const fluidNote = h('div', {});
    const compositionArea = h('div', {});
    stepsArea.appendChild(fluidNote);
    stepsArea.appendChild(compositionArea);

    // Step 3 — extra info
    stepsArea.appendChild(h('hr', { class: 'divider' }));
    stepsArea.appendChild(h('h3', { class: 'block-title', text: '3. פרטים נוספים' }));
    const storage = h('input', { type: 'text', class: 'text-input', value: 'יש לשמור במקום קריר ויבש' });
    const manufacturer = h('input', { type: 'text', class: 'text-input', value: 'מיוצר ע"י...' });
    const expiry = h('input', { type: 'text', class: 'text-input', value: 'עדיף להשתמש לפני...' });
    const allergens = h('input', { type: 'text', class: 'text-input', value: 'מכיל: ...' });
    [storage, manufacturer, expiry, allergens].forEach((el) => el.addEventListener('input', recompute));
    stepsArea.appendChild(h('div', { class: 'panel' }, [
      h('div', { class: 'row' }, [
        h('label', { class: 'field' }, [h('span', { class: 'field-label', text: 'תנאי אחסון:' }), storage]),
        h('label', { class: 'field' }, [h('span', { class: 'field-label', text: 'יצרן/משווק:' }), manufacturer]),
        h('label', { class: 'field' }, [h('span', { class: 'field-label', text: 'לשימוש עד' }), expiry]),
      ]),
      h('label', { class: 'field', style: { marginTop: '10px' } }, [h('span', { class: 'field-label', text: 'מידע על אלרגנים:' }), allergens]),
    ]));

    // Step 4/5 — preview
    stepsArea.appendChild(h('hr', { class: 'divider' }));
    stepsArea.appendChild(h('h3', { class: 'block-title', text: '4. תצוגה מקדימה' }));

    // Physical size + density controls (the height flows to fit the content).
    const presetId = WIDTH_PRESETS.find((p) => p.widthMm === labelSpec.widthMm)?.id || 'custom';
    const widthSel = selectField('רוחב התווית',
      WIDTH_PRESETS.map((p) => ({ value: p.id, label: p.label })), { value: presetId });
    const customWidth = numberField('רוחב מותאם (מ"מ)', { value: labelSpec.widthMm, min: 40, max: 200, step: 1 });
    customWidth.wrapper.classList.toggle('hidden', presetId !== 'custom');
    const variantSel = selectField('סגנון עיצוב',
      TEMPLATES.map((v) => ({ value: v.id, label: v.label })), { value: labelSpec.variant });

    widthSel.select.addEventListener('change', () => {
      const preset = WIDTH_PRESETS.find((p) => p.id === widthSel.select.value);
      const isCustom = !preset || preset.widthMm === null;
      customWidth.wrapper.classList.toggle('hidden', !isCustom);
      labelSpec.widthMm = isCustom ? clampWidthMm(customWidth.input.value) : preset.widthMm;
      recompute();
    });
    customWidth.input.addEventListener('input', () => {
      labelSpec.widthMm = clampWidthMm(customWidth.input.value);
      recompute();
    });
    variantSel.select.addEventListener('change', () => {
      labelSpec.variant = variantSel.select.value;
      recompute();
    });
    stepsArea.appendChild(h('div', { class: 'row tight' }, [widthSel.wrapper, customWidth.wrapper, variantSel.wrapper]));

    const redLabelNote = h('div', {});
    stepsArea.appendChild(redLabelNote);
    const previewArea = h('div', { class: 'label-preview-wrap' });
    const downloadArea = h('div', { style: { marginTop: '16px' } });
    stepsArea.appendChild(previewArea);
    stepsArea.appendChild(downloadArea);

    [nameField, marketing].forEach((el) => el.addEventListener('input', recompute));
    isLiquid.addEventListener('change', recompute);

    function readEdited() {
      const edited = {};
      for (const field of MANDATORY_FIELDS) edited[field] = parseFloat(editedInputs[field].value) || 0;
      return edited;
    }

    function recompute() {
      const edited = readEdited();
      const liquid = isLiquid.checked;
      const dispW = parseFloat(displayWeight.input.value) || 0;
      const fLoss = parseFloat(fluidLoss.input.value) || 0;

      // Composition table.
      const combinedFactor = (1 - fLoss / 100) * (dispW / 100);
      clear(fluidNote);
      if (fLoss > 0) {
        fluidNote.appendChild(statusBox('info', `⚠️ עם איבוד נוזלים של ${fLoss.toFixed(1)}%, כל הערכים מופחתים ב-${fLoss.toFixed(1)}%`));
      }
      renderComposition(compositionArea, edited, labelData.nutrition, combinedFactor, dispW);

      // Red marks — the Israeli warning marks are retained under BOTH standards,
      // using the current Israeli thresholds (solid vs liquid).
      const thresholds = liquid ? THRESHOLDS_LIQUID : THRESHOLDS_SOLID;
      const redLabels = [];
      if (edited.sodium > thresholds.sodium) redLabels.push(['נתרן', 'גבוה בנתרן']);
      if (edited.total_sugars > thresholds.total_sugars) redLabels.push(['סוכר', 'גבוה בסוכר']);
      if (edited.saturated_fat > thresholds.saturated_fat) redLabels.push(['שומן רווי', 'גבוה בשומן רווי']);

      // Note: active standard + thresholds + which marks were triggered.
      const unitTxt = liquid ? '100 מ"ל' : '100 גרם';
      const marksTxt = redLabels.length
        ? `סימוני אזהרה: ${redLabels.map((r) => r[1]).join(', ')}`
        : 'אין סימוני אזהרה אדומים';
      clear(redLabelNote);
      redLabelNote.appendChild(statusBox(redLabels.length ? 'warning' : 'success',
        `${STANDARD_META[standard].short} · ספי סימון אדום ל-${unitTxt}: נתרן ${thresholds.sodium} מ"ג, ` +
        `סוכר ${thresholds.total_sugars} גרם, שומן רווי ${thresholds.saturated_fat} גרם. ${marksTxt}.`));

      // Ingredients HTML (manual bold per chip) + detected allergens for 1169.
      const ingredientsHtml = ingredientItems
        .filter((it) => it.name.trim())
        .map((it) => (it.bold ? `<strong>${escapeHtml(it.name)}</strong>` : escapeHtml(it.name)))
        .join(', ');
      const containsAllergens = standard === '1169'
        ? [...new Set(ingredientItems.flatMap((it) => allergensInName(it.name)))]
        : [];

      // Resolve red-mark image sources (data URL if preloaded, else relative path).
      const redLabelImageSrcs = {};
      for (const [type] of redLabels) {
        const file = RED_LABEL_IMAGES[type];
        redLabelImageSrcs[type] = file && imageDataUrls[file]
          ? imageDataUrls[file] : (file ? `labels/${file}` : null);
      }

      const labelState = {
        finalName: nameField.value, marketing: marketing.value, redLabels,
        isLiquid: liquid, edited, ingredientsHtml, containsAllergens,
        allergens: allergens.value, storage: storage.value,
        manufacturer: manufacturer.value, expiry: expiry.value, redLabelImageSrcs,
      };

      // Preview — rendered as an <svg> (the source of truth for all exports).
      const svg = buildLabelSvg(standard, labelState, labelSpec);
      previewArea.replaceChildren(svg);
      fitSvgHeight(svg);

      renderExportToolbar(downloadArea, svg, nameField.value);
    }

    currentRecompute = recompute;
    recompute();
  }

  // Initial render
  renderSource();
  rebuildSteps();
  preloadImages(() => { renderSource(); rebuildSteps(); });
}

// ---- composition grid (Step 2.5) ----
function renderComposition(area, edited, computed, combinedFactor, displayWeight) {
  clear(area);
  area.appendChild(h('h3', { class: 'block-title', text: `טבלת הרכב תזונתי ל-${displayWeight.toFixed(0)} גרם` }));

  // Mirrors get_adjusted_val: use the edited value for the 10 mandatory fields,
  // otherwise fall back to the computed mix value (label_data.nutrition).
  const adjusted = (field) => {
    let v = edited[field];
    if (v === undefined) v = computed ? computed[field] : 0;
    return (Number(v) || 0) * combinedFactor;
  };
  const fmt = (val) => {
    if (val >= 100) return val.toFixed(0);
    if (val >= 10) return val.toFixed(1);
    if (val >= 1) return val.toFixed(2);
    return val.toFixed(3);
  };

  const parts = ['<div class="nutrient-table-container">'];
  for (const [cat, nutrients] of Object.entries(NUTRIENT_CATEGORIES)) {
    parts.push(`<div class="nutrient-category">${cat}</div><div class="nutrient-grid">`);
    for (const [field, name, unit] of nutrients) {
      parts.push(`<div class="nutrient-item"><span class="nutrient-name">${name}</span><span class="nutrient-value">${fmt(adjusted(field))} ${unit}</span></div>`);
    }
    parts.push('</div>');
  }
  parts.push('</div>');
  const wrap = h('div', {});
  wrap.innerHTML = parts.join('');
  area.appendChild(wrap);
}

// Parse a comma-separated ingredients string into editable chip items.
function parseIngredients(str) {
  return String(str || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((name) => ({ name, bold: false }));
}

// Return the allergen categories (Hebrew names) detected in a single ingredient
// name, respecting per-allergen excludes (e.g. milk "חלב" ≠ protein "חלבון").
function allergensInName(name) {
  const n = String(name || '');
  const found = [];
  for (const a of IL_ALLERGENS) {
    if (a.exclude && a.exclude.some((x) => n.includes(x))) continue;
    if (a.keywords.some((k) => n.includes(k))) found.push(a.he);
  }
  return found;
}

// Build a safe-ish file name from the product name (falls back to "label").
function safeFileName(name) {
  const base = String(name || '').trim().replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, '_');
  return base || 'label';
}

// Export toolbar (Step 5): print directly, or download a high-res PNG / editable
// SVG of the current label svg. Rebuilt on each recompute against the latest svg.
function renderExportToolbar(area, svg, productName) {
  clear(area);
  const fname = safeFileName(productName);

  const group = h('div', { class: 'btn-group' });

  const printBtn = h('button', { class: 'btn primary', type: 'button', text: '🖨️ הדפס תווית' });
  printBtn.addEventListener('click', () => printLabel(svg));

  // PNG with a resolution selector.
  const dpiSelect = h('select', { class: 'select-input', style: { maxWidth: '170px' } });
  for (const [val, label] of [['150', '150 DPI — תצוגה'], ['300', '300 DPI — הדפסה'], ['600', '600 DPI — איכות גבוהה']]) {
    dpiSelect.appendChild(h('option', { value: val, text: label, ...(val === '300' ? { selected: true } : {}) }));
  }
  const pngBtn = h('button', { class: 'btn', type: 'button', text: '🖼️ הורד PNG' });
  pngBtn.addEventListener('click', async () => {
    pngBtn.disabled = true;
    const prev = pngBtn.textContent;
    pngBtn.textContent = '… מכין PNG';
    try {
      await exportPng(svg, { dpi: parseInt(dpiSelect.value, 10) || 300, filename: `${fname}.png` });
    } catch (e) {
      area.appendChild(statusBox('error', `שגיאה ביצירת PNG: ${e.message}`));
    } finally {
      pngBtn.textContent = prev;
      pngBtn.disabled = false;
    }
  });

  const pdfBtn = h('button', { class: 'btn', type: 'button', text: '📄 הורד PDF (לבית דפוס)' });
  pdfBtn.addEventListener('click', async () => {
    pdfBtn.disabled = true;
    const prev = pdfBtn.textContent;
    pdfBtn.textContent = '… מכין PDF';
    try {
      await exportPdf(svg, { dpi: Math.max(300, parseInt(dpiSelect.value, 10) || 300), filename: `${fname}.pdf` });
    } catch (e) {
      area.appendChild(statusBox('error', `שגיאה ביצירת PDF: ${e.message}`));
    } finally {
      pdfBtn.textContent = prev;
      pdfBtn.disabled = false;
    }
  });

  const svgBtn = h('button', { class: 'btn', type: 'button', text: '✏️ הורד SVG (לעריכה)' });
  svgBtn.addEventListener('click', () => exportSvg(svg, { filename: `${fname}.svg` }));

  group.append(printBtn, pdfBtn, pngBtn, dpiSelect, svgBtn);
  area.appendChild(group);
  area.appendChild(statusBox('info',
    '🖨️ "הדפס תווית" פותח את חלון ההדפסה בגודל התווית המדויק (ייתכן שתצטרך לבחור "ללא שוליים" ולכבות כותרת עליונה/תחתונה). '
    + '📄 PDF בגודל פיזי מדויק לשליחה לבית דפוס. 🖼️ PNG באיכות גבוהה למעצב או לתצוגה. '
    + '✏️ SVG הוא קובץ וקטורי הניתן לעריכה באילוסטרייטור / אינקסקייפ.'));
}

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export default { id: 'label', label: 'עיצוב תווית', render };
