// nutritionView.js — shared "display_all_nutrition" renderer used by the
// regular search, advanced search and recipe pages.
//
// Faithful note on significant figures: in the original Python, count_sig_figs
// runs on whatever value is passed. For a raw product row that means the DB
// storage type matters (food_energy is INTEGER -> "70", everything else is a
// float). For a *computed* dict (recipe finished product / label mix) every
// value is a Python float, so even food_energy is treated as a float. The
// `allReal` flag below reproduces that distinction.

import { h, clear } from './ui.js';
import { calculateWithSigFigs, fmtCalc, PRODUCT_COL_TYPES } from './nutrition.js';

function makeGetVal(foodData, factor, allReal) {
  return (param) => {
    const isReal = allReal ? true : PRODUCT_COL_TYPES[param] !== 'INTEGER';
    const result = calculateWithSigFigs(foodData[param], factor, isReal);
    return fmtCalc(result);
  };
}

function metric(label, value) {
  return h('div', { class: 'metric' }, [
    h('div', { class: 'metric-label', text: label }),
    h('div', { class: 'metric-value', text: value }),
  ]);
}

function line(label, value, unit = '') {
  return h('div', { class: 'nut-line' }, [
    h('b', { text: `${label}: ` }),
    `${value}${unit ? ` ${unit}` : ''}`,
  ]);
}

function expanderBlock(summaryText, columns) {
  const details = h('details', { class: 'expander' });
  details.appendChild(h('summary', { text: summaryText }));
  const grid = h('div', { class: 'nutri-cols' });
  for (const col of columns) {
    for (const node of col) grid.appendChild(node);
  }
  const body = h('div', { class: 'expander-body' }, [grid]);
  details.appendChild(body);
  return details;
}

// Render the full nutrition breakdown into `container`.
//   foodData : product row (or computed dict of field -> value)
//   factor   : multiplier applied to the per-100g values
//   allReal  : treat every field as a float for sig-figs (computed sources)
export function renderNutrition(container, foodData, factor = 1.0, { allReal = false } = {}) {
  clear(container);
  const get = makeGetVal(foodData, factor, allReal);

  // Macronutrients
  container.appendChild(h('h3', { class: 'block-title', text: 'מקרו-נוטריינטים' }));
  container.appendChild(h('div', { class: 'metric-grid' }, [
    metric('קלוריות (קק"ל)', get('food_energy')),
    metric('חלבון (גרם)', get('protein')),
    metric('פחמימות (גרם)', get('carbohydrates')),
    metric('שומן כולל (גרם)', get('total_fat')),
  ]));

  // Fats breakdown
  container.appendChild(expanderBlock('🧈 פירוט שומנים', [
    [
      line('שומן רווי', get('saturated_fat'), 'גרם'),
      line('שומן חד בלתי רווי', get('mono_unsaturated_fat'), 'גרם'),
      line('שומן רב בלתי רווי', get('poly_unsaturated_fat'), 'גרם'),
    ],
    [
      line('חומצות שומן טרנס', get('trans_fatty_acids'), 'גרם'),
      line('כולסטרול', get('cholesterol'), 'מ"ג'),
      line('אומגה 3 (לינולנית)', get('linolenic'), 'גרם'),
    ],
    [
      line('אומגה 6 (לינולאית)', get('linoleic'), 'גרם'),
      line('חומצה אולאית', get('oleic'), 'גרם'),
    ],
  ]));

  // Vitamins
  container.appendChild(expanderBlock('💊 ויטמינים', [
    [
      line('ויטמין A (יחב"ל)', get('vitamin_a_iu')),
      line('ויטמין A (מק"ג)', get('vitamin_a_re')),
      line('ויטמין C (מ"ג)', get('vitamin_c')),
      line('ויטמין D (מק"ג)', get('vitamin_d')),
      line('ויטמין E (מ"ג)', get('vitamin_e')),
    ],
    [
      line('ויטמין K (מק"ג)', get('vitamin_k')),
      line('תיאמין B1 (מ"ג)', get('thiamin')),
      line('ריבופלאבין B2 (מ"ג)', get('riboflavin')),
      line('ניאצין B3 (מ"ג)', get('niacin')),
    ],
    [
      line('ויטמין B6 (מ"ג)', get('vitamin_b6')),
      line('ויטמין B12 (מק"ג)', get('vitamin_b12')),
      line('חומצה פולית (מק"ג)', get('folate')),
      line('חומצה פנטותנית (מ"ג)', get('pantothenic_acid')),
    ],
  ]));

  // Minerals
  container.appendChild(expanderBlock('⚗️ מינרלים', [
    [
      line('סידן (מ"ג)', get('calcium')),
      line('ברזל (מ"ג)', get('iron')),
      line('מגנזיום (מ"ג)', get('magnesium')),
      line('זרחן (מ"ג)', get('phosphorus')),
    ],
    [
      line('אשלגן (מ"ג)', get('potassium')),
      line('נתרן (מ"ג)', get('sodium')),
      line('אבץ (מ"ג)', get('zinc')),
      line('נחושת (מ"ג)', get('copper')),
    ],
    [
      line('סלניום (מק"ג)', get('selenium')),
      line('מנגן (מ"ג)', get('manganese')),
      line('יוד (מק"ג)', get('iodine')),
    ],
  ]));

  // Other components
  container.appendChild(expanderBlock('📊 רכיבים נוספים', [
    [
      line('סיבים תזונתיים (גרם)', get('total_dietary_fiber')),
      line('סוכרים (גרם)', get('total_sugars')),
      line('לחות (גרם)', get('moisture')),
      line('אלכוהול (גרם)', get('alcohol')),
    ],
    [
      line('קרוטן (מק"ג)', get('carotene')),
      line('כולין (מ"ג)', get('choline')),
      line('ביוטין (מק"ג)', get('biotin')),
    ],
  ]));
}
