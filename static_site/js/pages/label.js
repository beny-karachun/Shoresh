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
  THRESHOLDS_SOLID, THRESHOLDS_LIQUID,
} from '../nutrition.js';
import {
  searchFoods, searchRecipes, getFoodDetails, getAvailableUnits,
  getRecipeDetails, getRetentionOptions, getRetentionFactors,
} from '../db.js';

const SOURCE_RECIPE = 'מתכון קיים';
const SOURCE_MANUAL = 'הזנה ידנית';
const SOURCE_BUILD = '(מומלץ) צור מתכון ממוצרים במאגר';

// Inline CSS for the label, so the downloadable HTML file is self-contained.
const LABEL_CSS = `
<style>
.food-label { border: 2px solid #000; padding: 20px; background: white; color: black; font-family: 'Arial', sans-serif; direction: rtl; text-align: right; max-width: 500px; margin: 0 auto; box-shadow: 5px 5px 15px rgba(0,0,0,0.1); }
.label-header { text-align: center; border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 15px; }
.label-title { font-size: 24px; font-weight: bold; margin: 0; }
.label-marketing { font-style: italic; margin-top: 5px; }
.red-labels-container { display: flex; justify-content: center; gap: 15px; margin: 15px 0; }
.red-label-img { width: 80px; height: auto; }
.nutrition-table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 14px; }
.nutrition-table th, .nutrition-table td { border-bottom: 1px solid #ddd; padding: 4px; text-align: right; }
.nutrition-table th { font-weight: bold; }
.nutrition-header { background-color: #f5f5f5; font-weight: bold; padding: 5px; margin-top: 10px; border: 1px solid #ddd; }
.ingredients-section { margin-top: 15px; font-size: 13px; word-wrap: break-word; overflow-wrap: break-word; white-space: normal; }
.footer-info { margin-top: 15px; font-size: 12px; border-top: 1px solid #000; padding-top: 10px; }
.allergens-box { border: 1px solid #000; padding: 5px; margin-top: 10px; font-weight: bold; font-size: 13px; }
.red-fallback { color: red; font-weight: bold; border: 1px solid red; padding: 5px; }
</style>`;

// Red-label image filenames (matching the originals, including the typo).
const RED_LABEL_IMAGES = {
  'נתרן': 'highsaltlabel.png',
  'סוכר': 'highsugarlaber.png',
  'שומן רווי': 'highsaturatedfatlabel.png',
};

// Persisted state (survives tab switches).
let sourceType = SOURCE_BUILD;
let labelIngredients = []; // builder ingredients
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
  container.appendChild(sectionHeader('🏷️ עיצוב תווית למוצר',
    'יצירת תווית מוצר לפי תקן 1145 כולל סימון אדום'));

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
    const ingredientsField = h('textarea', { class: 'text-input', rows: '3' });
    ingredientsField.value = labelData.ingredients || '';

    stepsArea.appendChild(h('div', { class: 'panel' }, [
      h('div', { class: 'row' }, [
        h('label', { class: 'field' }, [h('span', { class: 'field-label', text: 'שם מוצר (כפי שיופיע על התווית):' }), nameField]),
        h('label', { class: 'field' }, [h('span', { class: 'field-label', text: 'טקסט שיווקי / תיאור:' }), marketing]),
      ]),
      h('label', { class: 'checkbox', style: { margin: '10px 0' } }, [isLiquid, 'האם המוצר נוזלי? (משפיע על ספים למדבקות אדומות)']),
      h('label', { class: 'field' }, [h('span', { class: 'field-label', text: 'רשימת רכיבים:' }), ingredientsField]),
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
    const previewArea = h('div', { class: 'label-preview-wrap' });
    const downloadArea = h('div', { style: { marginTop: '16px' } });
    stepsArea.appendChild(previewArea);
    stepsArea.appendChild(downloadArea);

    [nameField, isLiquid, marketing, ingredientsField].forEach((el) => el.addEventListener('input', recompute));
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

      // Red labels.
      const thresholds = liquid ? THRESHOLDS_LIQUID : THRESHOLDS_SOLID;
      const redLabels = [];
      if (edited.sodium > thresholds.sodium) redLabels.push(['נתרן', 'גבוה בנתרן']);
      if (edited.total_sugars > thresholds.total_sugars) redLabels.push(['סוכר', 'גבוה בסוכר']);
      if (edited.saturated_fat > thresholds.saturated_fat) redLabels.push(['שומן רווי', 'גבוה בשומן רווי']);

      // Preview.
      const markup = buildLabelMarkup({
        finalName: nameField.value, marketing: marketing.value, redLabels,
        isLiquid: liquid, edited, ingredients: ingredientsField.value,
        allergens: allergens.value, storage: storage.value,
        manufacturer: manufacturer.value, expiry: expiry.value,
      });
      previewArea.innerHTML = markup;

      renderDownload(downloadArea, markup);
    }

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

// ---- label markup (Steps 4/5) ----
function buildLabelMarkup(s) {
  const fmtVal = (v) => (Number(v) || 0).toFixed(1);
  const parts = [LABEL_CSS, '<div class="food-label" dir="rtl">'];

  parts.push('<div class="label-header">');
  parts.push(`<h1 class="label-title">${escapeHtml(s.finalName)}</h1>`);
  if (s.marketing) parts.push(`<div class="label-marketing">${escapeHtml(s.marketing)}</div>`);
  parts.push('</div>');

  if (s.redLabels.length) {
    parts.push('<div class="red-labels-container">');
    for (const [type, text] of s.redLabels) {
      const file = RED_LABEL_IMAGES[type];
      const src = file && imageDataUrls[file] ? imageDataUrls[file] : (file ? `labels/${file}` : null);
      if (src) parts.push(`<img src="${src}" class="red-label-img" alt="${text}">`);
      else parts.push(`<div class="red-fallback">${text}</div>`);
    }
    parts.push('</div>');
  }

  const unitLabel = s.isLiquid ? 'מל' : 'גרם';
  parts.push(`<div class="nutrition-header">ערכים תזונתיים ל-100 ${unitLabel}</div>`);
  parts.push('<table class="nutrition-table">');
  parts.push(`<thead><tr><th>סימון תזונתי</th><th>ל-100 ${unitLabel}</th></tr></thead><tbody>`);

  const e = s.edited;
  parts.push(`<tr><td>אנרגיה (קלוריות)</td><td>${Math.trunc(e.food_energy || 0)}</td></tr>`);
  parts.push(`<tr><td>סך השומנים (גרם)</td><td>${fmtVal(e.total_fat)}</td></tr>`);
  parts.push(`<tr><td style='padding-right: 20px;'>מתוכם: חומצות שומן רוויות (גרם)</td><td>${fmtVal(e.saturated_fat)}</td></tr>`);

  const trans = Number(e.trans_fatty_acids) || 0;
  const transStr = (trans < 0.5 && trans > 0) ? '< 0.5' : fmtVal(trans);
  parts.push(`<tr><td style='padding-right: 20px;'>חומצות שומן טרנס (גרם)</td><td>${transStr}</td></tr>`);
  parts.push(`<tr><td style='padding-right: 20px;'>כולסטרול (מ"ג)</td><td>${fmtVal(e.cholesterol)}</td></tr>`);
  parts.push(`<tr><td>נתרן (מ"ג)</td><td>${fmtVal(e.sodium)}</td></tr>`);
  parts.push(`<tr><td>סך הפחמימות (גרם)</td><td>${fmtVal(e.carbohydrates)}</td></tr>`);

  const sugs = Number(e.total_sugars) || 0;
  parts.push(`<tr><td style='padding-right: 20px;'>מתוכן: סוכרים (גרם)</td><td>${fmtVal(sugs)}</td></tr>`);
  parts.push(`<tr><td style='padding-right: 20px;'>כפיות סוכר</td><td>${fmtVal(sugs / 4)}</td></tr>`);
  parts.push(`<tr><td>סיבים תזונתיים (גרם)</td><td>${fmtVal(e.total_dietary_fiber)}</td></tr>`);
  parts.push(`<tr><td>חלבונים (גרם)</td><td>${fmtVal(e.protein)}</td></tr>`);
  parts.push('</tbody></table>');

  parts.push(`<div class="ingredients-section"><strong>רכיבים:</strong> ${escapeHtml(s.ingredients)}</div>`);
  if (s.allergens) parts.push(`<div class="allergens-box">${escapeHtml(s.allergens)}</div>`);

  parts.push('<div class="footer-info">');
  parts.push(`<div><strong>תנאי אחסון:</strong> ${escapeHtml(s.storage)}</div>`);
  parts.push(`<div><strong>יצרן:</strong> ${escapeHtml(s.manufacturer)}</div>`);
  parts.push(`<div><strong>תוקף:</strong> ${escapeHtml(s.expiry)}</div>`);
  parts.push('</div>');

  parts.push('</div>');
  return parts.join('');
}

function renderDownload(area, labelHtml) {
  clear(area);
  const fullHtml = `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
    <meta charset="UTF-8">
    <title>תצוגה מקדימה - תווית</title>
    <style>
        body { font-family: Arial, sans-serif; padding: 20px; margin: 0; background: #f0f0f0; }
        .print-instructions { background: #e3f2fd; border: 1px solid #2196f3; border-radius: 5px; padding: 10px; margin-bottom: 15px; font-size: 12px; text-align: center; }
        @media print { .print-instructions { display: none; } body { background: white; } }
    </style>
</head>
<body>
    <div class="print-instructions">
        💡 שנה את גודל החלון כרצונך, ואז לחץ <strong>Ctrl+P</strong> להדפסה או צלם מסך
    </div>
    ${labelHtml}
</body>
</html>`;

  const blob = new Blob([fullHtml], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = h('a', {
    href: url, download: 'label_preview.html',
    class: 'btn primary', text: '🖼️ הורד תווית כקובץ HTML (לפתיחה בחלון נפרד)',
  });
  area.appendChild(link);
  area.appendChild(statusBox('info',
    '💡 הוראות הדפסה: 1. לחץ על הכפתור "הורד תווית כקובץ HTML". 2. פתח את הקובץ שהורד בדפדפן. 3. שנה את גודל החלון כרצונך. 4. להדפסה: לחץ Ctrl+P או צלם מסך.'));
}

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export default { id: 'label', label: 'עיצוב תווית', render };
