// nutrition.js
// Core nutrition data tables and math — a faithful port of the calculation
// logic from the original Streamlit app.py (count_sig_figs / round_to_sig_figs
// / calculate_with_sig_figs), plus the field mappings, nutrient categories and
// red-label thresholds.

// ---------------------------------------------------------------------------
// Field label mapping (DB column -> Hebrew label). Mirrors FIELDS_MAPPING.
// ---------------------------------------------------------------------------
export const FIELDS_MAPPING = {
  // Macronutrients
  food_energy: 'קלוריות (קק"ל)',
  protein: 'חלבון (גרם)',
  total_fat: 'שומן כולל (גרם)',
  carbohydrates: 'פחמימות (גרם)',
  total_dietary_fiber: 'סיבים תזונתיים (גרם)',
  total_sugars: 'סוכרים (גרם)',
  alcohol: 'אלכוהול (גרם)',
  moisture: 'לחות (גרם)',

  // Fats
  saturated_fat: 'שומן רווי (גרם)',
  mono_unsaturated_fat: 'שומן חד בלתי רווי (גרם)',
  poly_unsaturated_fat: 'שומן רב בלתי רווי (גרם)',
  trans_fatty_acids: 'שומן טרנס (גרם)',
  cholesterol: 'כולסטרול (מ"ג)',
  linoleic: 'חומצה לינולאית (אומגה 6) (גרם)',
  linolenic: 'חומצה לינולנית (אומגה 3) (גרם)',
  oleic: 'חומצה אולאית (גרם)',
  docosahexanoic: 'DHA (גרם)',
  eicosapentaenoic: 'EPA (גרם)',
  arachidonic: 'חומצה ארכידונית (גרם)',

  // Vitamins
  vitamin_a_iu: 'ויטמין A (יחב"ל)',
  vitamin_a_re: 'ויטמין A (מק"ג RE)',
  carotene: 'קרוטן (מק"ג)',
  vitamin_e: 'ויטמין E (מ"ג)',
  vitamin_c: 'ויטמין C (מ"ג)',
  thiamin: 'תיאמין B1 (מ"ג)',
  riboflavin: 'ריבופלאבין B2 (מ"ג)',
  niacin: 'ניאצין B3 (מ"ג)',
  vitamin_b6: 'ויטמין B6 (מ"ג)',
  folate: 'חומצה פולית (מק"ג)',
  vitamin_b12: 'ויטמין B12 (מק"ג)',
  vitamin_d: 'ויטמין D (מק"ג)',
  vitamin_k: 'ויטמין K (מק"ג)',
  pantothenic_acid: 'חומצה פנטותנית (מ"ג)',
  biotin: 'ביוטין (מק"ג)',
  choline: 'כולין (מ"ג)',

  // Minerals
  calcium: 'סידן (מ"ג)',
  iron: 'ברזל (מ"ג)',
  magnesium: 'מגנזיום (מ"ג)',
  phosphorus: 'זרחן (מ"ג)',
  potassium: 'אשלגן (מ"ג)',
  sodium: 'נתרן (מ"ג)',
  zinc: 'אבץ (מ"ג)',
  copper: 'נחושת (מ"ג)',
  manganese: 'מנגן (מ"ג)',
  selenium: 'סלניום (מק"ג)',
  iodine: 'יוד (מק"ג)',

  // Amino Acids
  isoleucine: 'איזולאוצין (גרם)',
  leucine: 'לאוצין (גרם)',
  valine: 'ואלין (גרם)',
  lysine: 'ליזין (גרם)',
  methionine: 'מתיונין (גרם)',
  phenylalanine: 'פנילאלנין (גרם)',
  threonine: 'תראונין (גרם)',
  tryptophan: 'טריפטופן (גרם)',
  histidine: 'היסטידין (גרם)',
  arginine: 'ארגינין (גרם)',

  // Other
  fructose: 'פרוקטוז (גרם)',
  sugar_alcohols: 'רב כהלים (גרם)',
};

// Mapping from product nutrition fields to retention factor columns.
// Mirrors RETENTION_FIELD_MAPPING.
export const RETENTION_FIELD_MAPPING = {
  vitamin_b12: 'vitamin_b12',
  folate: 'folate',
  vitamin_b6: 'vitamin_b6',
  niacin: 'niacin',
  riboflavin: 'riboflavin',
  thiamin: 'thiamin',
  vitamin_c: 'vitamin_c',
  carotene: 'carotene',
  vitamin_a_re: 'vitamin_a_re',
  vitamin_a_iu: 'vitamin_a_iu',
  copper: 'copper',
  zinc: 'zinc',
  sodium: 'sodium',
  potassium: 'potassium',
  phosphorus: 'phosphorus',
  magnesium: 'magnesium',
  iron: 'iron',
  calcium: 'calcium',
};

// Storage class of each `products` column (INTEGER | REAL | TEXT), taken from
// `PRAGMA table_info(products)`. Needed so the significant-figures logic can
// reproduce Python's behaviour: pandas reads REAL columns as floats, so e.g.
// the stored value 17 in `sodium` becomes the string "17.0" (3 sig figs),
// whereas the INTEGER column `food_energy` stays "70" (2 sig figs).
export const PRODUCT_COL_TYPES = {
  Code: 'INTEGER', smlmitzrach: 'INTEGER', shmmitzrach: 'TEXT', makor: 'REAL',
  edible: 'REAL', psolet: 'REAL', ahuz_ibud_nozlim: 'REAL', protein: 'REAL',
  total_fat: 'REAL', carbohydrates: 'REAL', food_energy: 'INTEGER', alcohol: 'REAL',
  moisture: 'REAL', total_dietary_fiber: 'REAL', calcium: 'REAL', iron: 'REAL',
  magnesium: 'REAL', phosphorus: 'REAL', potassium: 'REAL', sodium: 'REAL',
  zinc: 'REAL', copper: 'REAL', vitamin_a_iu: 'REAL', carotene: 'REAL',
  vitamin_e: 'REAL', vitamin_c: 'REAL', thiamin: 'REAL', riboflavin: 'REAL',
  niacin: 'REAL', vitamin_b6: 'REAL', folate: 'REAL', folate_dfe: 'REAL',
  vitamin_b12: 'REAL', cholesterol: 'REAL', saturated_fat: 'REAL', butyric: 'REAL',
  caproic: 'REAL', caprylic: 'REAL', capric: 'REAL', lauric: 'REAL', myristic: 'REAL',
  palmitic: 'REAL', stearic: 'REAL', oleic: 'REAL', linoleic: 'REAL', linolenic: 'REAL',
  arachidonic: 'REAL', docosahexanoic: 'REAL', palmitoleic: 'REAL', parinaric: 'REAL',
  gadoleic: 'REAL', eicosapentaenoic: 'REAL', erucic: 'REAL', docosapentaenoic: 'REAL',
  mono_unsaturated_fat: 'REAL', poly_unsaturated_fat: 'REAL', vitamin_d: 'REAL',
  total_sugars: 'REAL', trans_fatty_acids: 'REAL', vitamin_a_re: 'REAL',
  isoleucine: 'REAL', leucine: 'REAL', valine: 'REAL', lysine: 'REAL', threonine: 'REAL',
  methionine: 'REAL', phenylalanine: 'REAL', tryptophan: 'REAL', histidine: 'REAL',
  tyrosine: 'REAL', arginine: 'REAL', cystine: 'REAL', serine: 'REAL', vitamin_k: 'REAL',
  pantothenic_acid: 'REAL', iodine: 'REAL', selenium: 'REAL', sugar_alcohols: 'REAL',
  choline: 'REAL', biotin: 'REAL', manganese: 'REAL', fructose: 'REAL',
  tarich_ptiha: 'REAL', tarich_idkun: 'TEXT', english_name: 'TEXT',
};

// ---------------------------------------------------------------------------
// Significant-figures math — faithful port of the Python helpers.
// ---------------------------------------------------------------------------

// Reproduce Python's str() for a value coming out of the DB / float math.
// The only material difference between JS String() and Python str() for our
// data is integer-valued floats: Python str(17.0) === "17.0" while
// String(17.0) === "17". For REAL columns we therefore append ".0".
function reprForSigFigs(value, isReal) {
  if (
    isReal &&
    typeof value === 'number' &&
    Number.isFinite(value) &&
    Number.isInteger(value)
  ) {
    return `${value}.0`;
  }
  return String(value);
}

// Port of count_sig_figs(value). `isReal` indicates the value originated from a
// REAL column (or is a computed float), so integer-valued numbers keep a
// trailing ".0" exactly as Python's float repr would.
export function countSigFigs(value, isReal = false) {
  if (value === null || value === undefined) return 0;

  let s = reprForSigFigs(value, isReal).toLowerCase();

  // Handle scientific notation
  if (s.includes('e')) {
    const base = s.split('e')[0];
    return countSigFigs(base, false);
  }

  // Remove negative sign
  s = s.replace(/-/g, '');

  // Remove decimal point
  const sNoDecimal = s.replace(/\./g, '');

  // Strip leading zeros
  const sStripped = sNoDecimal.replace(/^0+/, '');

  if (!sStripped) return 0;

  return sStripped.length;
}

// Port of round_to_sig_figs(x, sig_figs) — round x to `sigFigs` significant
// figures, matching CPython's round() (round-half-to-EVEN on the true double).
//
// We take 41 significant digits of the true IEEE-754 value via toExponential,
// then round that digit string with explicit half-to-even. This matches CPython
// for both genuine ties (70 * 1.5 = 105.0 -> 100, not 110) and binary near-ties
// (24.85 is really 24.850000000000001 -> 24.9), neither of which
// Number.toPrecision (half-away) nor naive `x * 10^n` scaling get right.
//
// Why 41 digits: a double sits at most ~0.5 ULP (~1e-16 relative) from a
// decimal rounding boundary, so a run of 9s/0s past the sig-fig position (which
// is <= 17) can extend at most ~17 digits. 41 leaves ample margin, so
// toExponential's own rounding at the 41st digit can never carry-cascade back
// to the boundary and fabricate (or erase) a tie.
export function roundToSigFigs(x, sigFigs) {
  if (x === 0) return 0;
  if (!Number.isFinite(x)) return x;
  const sf = Math.max(1, Math.min(100, sigFigs));

  const neg = x < 0;
  const [mantissa, expPart] = Math.abs(x).toExponential(40).split('e');
  const exp = parseInt(expPart, 10);
  const digits = mantissa.replace('.', ''); // 17 significant digit chars

  if (sf >= digits.length) return x; // already at/under available precision

  const keep = digits.slice(0, sf).split('').map(Number);
  const nextDigit = Number(digits[sf]);
  const restNonZero = /[1-9]/.test(digits.slice(sf + 1));

  let roundUp;
  if (nextDigit > 5) roundUp = true;
  else if (nextDigit < 5) roundUp = false;
  else if (restNonZero) roundUp = true;          // > half
  else roundUp = keep[sf - 1] % 2 === 1;          // exact half -> round to even

  // The decimal place value of the last kept digit (fixed even if a carry
  // prepends a new leading digit, e.g. 9.99 -> 10.0).
  const lastPlace = exp - (sf - 1);

  if (roundUp) {
    let i = sf - 1;
    while (i >= 0 && keep[i] === 9) { keep[i] = 0; i -= 1; }
    if (i < 0) keep.unshift(1);
    else keep[i] += 1;
  }

  const result = Number(`${keep.join('')}e${lastPlace}`);
  return neg ? -result : result;
}

// Port of calculate_with_sig_figs(original_value, factor). Returns the scaled
// value rounded to the significant figures present in the original value.
// `isReal` should be true when the original value came from a REAL column or a
// previous float computation (default true — matches every nutrition field
// except the INTEGER `food_energy`, which callers flag explicitly).
export function calculateWithSigFigs(originalValue, factor, isReal = true) {
  if (originalValue === null || originalValue === undefined) return 0;

  const valFloat = Number(originalValue);
  if (Number.isNaN(valFloat)) return 0;
  if (valFloat === 0) return 0;

  const sigFigs = countSigFigs(originalValue, isReal);
  if (sigFigs === 0) return 0;

  const newVal = valFloat * factor;
  return roundToSigFigs(newVal, sigFigs);
}

// Convenience wrapper that knows the products-table column types, so callers
// can pass a raw field name and get the correct sig-fig treatment.
export function calcField(field, rawValue, factor) {
  const isReal = PRODUCT_COL_TYPES[field] !== 'INTEGER';
  return calculateWithSigFigs(rawValue, factor, isReal);
}

// ---------------------------------------------------------------------------
// Display formatting
// ---------------------------------------------------------------------------

// Reproduce Python str() of a number that is the result of
// calculate_with_sig_figs (always a float, except an exact 0 which Python
// returns as int 0). Used so displayed values match the original app exactly,
// e.g. "2.0" rather than "2", and "5e-05" rather than "0.00005".
export function fmtCalc(value) {
  if (value === 0) return '0';
  if (typeof value !== 'number' || !Number.isFinite(value)) return String(value);
  return pyFloatRepr(value);
}

// Reproduce Python's str()/repr() of a float:
//  - scientific notation when the decimal exponent < -4 or >= 16
//    (Python pads the exponent to >= 2 digits, e.g. "5e-05", "1.5e-05")
//  - otherwise plain decimal, with a trailing ".0" for integer-valued floats
function pyFloatRepr(x) {
  const neg = x < 0;
  const ax = Math.abs(x);
  const expStr = ax.toExponential(); // shortest round-trip mantissa + exponent
  const exp = parseInt(expStr.split('e')[1], 10);
  let s;
  if (exp < -4 || exp >= 16) {
    // pad a single-digit exponent to two digits (V8 "5e-5" -> Python "5e-05")
    s = expStr.replace(/e([+-])(\d)$/, 'e$10$2');
  } else {
    s = Number.isInteger(ax) ? `${ax}.0` : String(ax);
  }
  return neg ? `-${s}` : s;
}

// ---------------------------------------------------------------------------
// Label designer support tables (ported verbatim from app.py).
// ---------------------------------------------------------------------------

// Full nutrient composition table, grouped by category: [field, label, unit].
export const NUTRIENT_CATEGORIES = {
  'מקרו-נוטריינטים': [
    ['food_energy', 'אנרגיה', 'קק"ל'],
    ['protein', 'חלבון', 'גרם'],
    ['total_fat', 'שומן כולל', 'גרם'],
    ['carbohydrates', 'פחמימות', 'גרם'],
    ['total_dietary_fiber', 'סיבים', 'גרם'],
    ['total_sugars', 'סוכרים', 'גרם'],
    ['alcohol', 'אלכוהול', 'גרם'],
    ['moisture', 'לחות', 'גרם'],
  ],
  'שומנים': [
    ['saturated_fat', 'שומן רווי', 'גרם'],
    ['mono_unsaturated_fat', 'חד בלתי רווי', 'גרם'],
    ['poly_unsaturated_fat', 'רב בלתי רווי', 'גרם'],
    ['trans_fatty_acids', 'טרנס', 'גרם'],
    ['cholesterol', 'כולסטרול', 'מ"ג'],
    ['linoleic', 'אומגה 6', 'גרם'],
    ['linolenic', 'אומגה 3', 'גרם'],
    ['oleic', 'אולאית', 'גרם'],
    ['docosahexanoic', 'DHA', 'גרם'],
    ['eicosapentaenoic', 'EPA', 'גרם'],
    ['arachidonic', 'ארכידונית', 'גרם'],
  ],
  'ויטמינים': [
    ['vitamin_a_iu', 'ויטמין A', 'יחב"ל'],
    ['vitamin_a_re', 'ויטמין A', 'מק"ג RE'],
    ['carotene', 'קרוטן', 'מק"ג'],
    ['vitamin_e', 'ויטמין E', 'מ"ג'],
    ['vitamin_c', 'ויטמין C', 'מ"ג'],
    ['thiamin', 'B1', 'מ"ג'],
    ['riboflavin', 'B2', 'מ"ג'],
    ['niacin', 'B3', 'מ"ג'],
    ['vitamin_b6', 'B6', 'מ"ג'],
    ['folate', 'פולית', 'מק"ג'],
    ['vitamin_b12', 'B12', 'מק"ג'],
    ['vitamin_d', 'ויטמין D', 'מק"ג'],
    ['vitamin_k', 'ויטמין K', 'מק"ג'],
    ['pantothenic_acid', 'פנטותנית', 'מ"ג'],
    ['biotin', 'ביוטין', 'מק"ג'],
    ['choline', 'כולין', 'מ"ג'],
  ],
  'מינרלים': [
    ['calcium', 'סידן', 'מ"ג'],
    ['iron', 'ברזל', 'מ"ג'],
    ['magnesium', 'מגנזיום', 'מ"ג'],
    ['phosphorus', 'זרחן', 'מ"ג'],
    ['potassium', 'אשלגן', 'מ"ג'],
    ['sodium', 'נתרן', 'מ"ג'],
    ['zinc', 'אבץ', 'מ"ג'],
    ['copper', 'נחושת', 'מ"ג'],
    ['manganese', 'מנגן', 'מ"ג'],
    ['selenium', 'סלניום', 'מק"ג'],
    ['iodine', 'יוד', 'מק"ג'],
  ],
  'חומצות אמינו': [
    ['isoleucine', 'איזולאוצין', 'גרם'],
    ['leucine', 'לאוצין', 'גרם'],
    ['valine', 'ואלין', 'גרם'],
    ['lysine', 'ליזין', 'גרם'],
    ['methionine', 'מתיונין', 'גרם'],
    ['phenylalanine', 'פנילאלנין', 'גרם'],
    ['threonine', 'תראונין', 'גרם'],
    ['tryptophan', 'טריפטופן', 'גרם'],
    ['histidine', 'היסטידין', 'גרם'],
    ['arginine', 'ארגינין', 'גרם'],
  ],
  'אחרים': [
    ['fructose', 'פרוקטוז', 'גרם'],
    ['sugar_alcohols', 'רב כהלים', 'גרם'],
  ],
};

// Mandatory fields shown (and editable) on the nutrition label.
export const MANDATORY_FIELDS = [
  'food_energy', 'total_fat', 'saturated_fat', 'trans_fatty_acids',
  'cholesterol', 'sodium', 'carbohydrates', 'total_sugars',
  'total_dietary_fiber', 'protein',
];

// Red-label thresholds (mg/g per 100g solid or 100ml liquid), from the Israeli
// front-of-pack warning regulation (תקנות הגנה על בריאות הציבור (מזון) (סימון
// תזונתי)). The regulation rolled out in two phases with different thresholds:
//   old = Phase A (שלב א׳)  — in force 1 Jan 2020 – 31 Dec 2020
//   new = Phase B (שלב ב׳)  — in force from 1 Jan 2021 (current & permanent)
// Sources: he.wikipedia.org "תקנות הגנה על בריאות הציבור (מזון) (סימון תזונתי)";
// health.gov.il food-labeling pages; FoodNavigator 2020-01-27.
export const RED_LABEL_STANDARDS = {
  new: {
    key: 'new',
    name: 'תקן חדש (שלב ב׳ — 2021 ואילך)',
    short: 'תקן חדש',
    solid: { sodium: 400, total_sugars: 10, saturated_fat: 4 },
    liquid: { sodium: 300, total_sugars: 5, saturated_fat: 3 },
  },
  old: {
    key: 'old',
    name: 'תקן ישן (שלב א׳ — 2020)',
    short: 'תקן ישן',
    solid: { sodium: 500, total_sugars: 13.5, saturated_fat: 5 },
    liquid: { sodium: 400, total_sugars: 5, saturated_fat: 3 },
  },
};

// The current, compliant standard — used as the default.
export const DEFAULT_STANDARD = 'new';

// Backwards-compatible aliases (point at the current/new standard).
export const THRESHOLDS_SOLID = RED_LABEL_STANDARDS.new.solid;
export const THRESHOLDS_LIQUID = RED_LABEL_STANDARDS.new.liquid;

// Operators available in advanced search (Hebrew label -> SQL).
export const SEARCH_OPERATORS = ['שווה', 'גדול מ', 'קטן מ', 'גדול שווה', 'קטן שווה', 'בין'];
