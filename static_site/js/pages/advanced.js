// pages/advanced.js — "חיפוש מתקדם" (advanced search).
// Build a list of conditions (field / operator / value), join them with
// per-condition AND/OR, choose which columns to show, run the search, and drill
// into any result for the full breakdown.

import {
  h, clear, statusBox, sectionHeader, selectField, numberField, table,
} from '../ui.js';
import { FIELDS_MAPPING, SEARCH_OPERATORS } from '../nutrition.js';
import { advancedSearch, getFoodDetails } from '../db.js';
import { renderNutrition } from '../nutritionView.js';

const FIELD_OPTS = Object.entries(FIELDS_MAPPING).map(([value, label]) => ({ value, label }));
const DEFAULT_COLS = ['food_energy', 'protein', 'total_fat', 'carbohydrates'];

// Persisted across tab switches.
let conditions = [];

function render(container) {
  clear(container);
  container.appendChild(sectionHeader('חיפוש מתקדם', 'הגדר תנאים לחיפוש מוצרים'));

  // --- Conditions panel ---
  const condPanel = h('div', { class: 'panel' });
  const condList = h('div', {});
  const addBtn = h('button', {
    class: 'btn', text: '➕ הוסף תנאי',
    onClick: () => {
      conditions.push({ field: 'protein', operator: 'גדול מ', value: 0, value2: 0, nextOperator: 'AND' });
      renderConditions();
    },
  });
  condPanel.appendChild(condList);
  condPanel.appendChild(addBtn);
  container.appendChild(condPanel);

  function renderConditions() {
    clear(condList);
    conditions.forEach((cond, i) => {
      const field = selectField('פרמטר', FIELD_OPTS, { value: cond.field });
      field.select.addEventListener('change', () => { cond.field = field.select.value; });

      const operator = selectField('תנאי', SEARCH_OPERATORS.map((o) => ({ value: o, label: o })), { value: cond.operator });
      operator.select.addEventListener('change', () => {
        cond.operator = operator.select.value;
        renderConditions(); // toggle the "value2" box for בין
      });

      const value = numberField('ערך', { value: cond.value, step: 0.1 });
      value.input.addEventListener('input', () => { cond.value = parseFloat(value.input.value) || 0; });

      const cells = [field.wrapper, operator.wrapper, value.wrapper];

      if (cond.operator === 'בין') {
        const value2 = numberField('עד', { value: cond.value2 ?? 0, step: 0.1 });
        value2.input.addEventListener('input', () => { cond.value2 = parseFloat(value2.input.value) || 0; });
        cells.push(value2.wrapper);
      }

      const del = h('div', { class: 'field' }, [
        h('span', { class: 'field-label', text: ' ' }),
        h('button', {
          class: 'btn danger icon', text: '🗑️',
          onClick: () => { conditions.splice(i, 1); renderConditions(); },
        }),
      ]);
      cells.push(del);

      condList.appendChild(h('div', { class: 'row tight' }, cells));

      // Logic operator between this condition and the next.
      if (i < conditions.length - 1) {
        const andLabel = h('label', { class: 'checkbox' }, [
          (() => { const r = h('input', { type: 'radio', name: `logic_${i}` }); r.checked = cond.nextOperator !== 'OR'; r.addEventListener('change', () => { if (r.checked) cond.nextOperator = 'AND'; }); return r; })(),
          'AND (וגם)',
        ]);
        const orLabel = h('label', { class: 'checkbox' }, [
          (() => { const r = h('input', { type: 'radio', name: `logic_${i}` }); r.checked = cond.nextOperator === 'OR'; r.addEventListener('change', () => { if (r.checked) cond.nextOperator = 'OR'; }); return r; })(),
          'OR (או)',
        ]);
        condList.appendChild(h('div', { class: 'caption' }, ['צירוף תנאים עם:']));
        condList.appendChild(h('div', { class: 'btn-group', style: { margin: '0 0 10px' } }, [andLabel, orLabel]));
        condList.appendChild(h('hr', { class: 'divider' }));
      }
    });
  }
  renderConditions();

  // --- Column display selection ---
  const dispPanel = h('div', { class: 'panel' });
  dispPanel.appendChild(h('h3', { class: 'block-title', text: 'תצוגה' }));

  const colChecks = {};
  const colGrid = h('div', { class: 'nutri-cols' });
  for (const [key, label] of Object.entries(FIELDS_MAPPING)) {
    const cb = h('input', { type: 'checkbox' });
    cb.checked = DEFAULT_COLS.includes(key);
    colChecks[key] = cb;
    colGrid.appendChild(h('label', { class: 'checkbox' }, [cb, label]));
  }
  const colWrap = h('div', {}, [
    h('div', { class: 'caption', text: 'בחר עמודות להצגה:' }),
    colGrid,
  ]);

  const showAll = h('input', { type: 'checkbox' });
  showAll.addEventListener('change', () => { colWrap.classList.toggle('hidden', showAll.checked); });
  dispPanel.appendChild(h('label', { class: 'checkbox', style: { marginBottom: '10px' } }, [showAll, 'הצג את כל העמודות (כל הפרמטרים)']));
  dispPanel.appendChild(colWrap);
  container.appendChild(dispPanel);

  // --- Search button + results ---
  const resultsArea = h('div', {});
  const searchBtn = h('button', {
    class: 'btn primary', text: '🔍 חפש',
    onClick: () => runSearch(),
  });
  container.appendChild(searchBtn);
  container.appendChild(resultsArea);

  function selectedColumns() {
    if (showAll.checked) return Object.keys(FIELDS_MAPPING);
    return Object.keys(FIELDS_MAPPING).filter((k) => colChecks[k].checked);
  }

  function runSearch() {
    clear(resultsArea);
    if (conditions.length === 0) {
      resultsArea.appendChild(statusBox('warning', 'יש להוסיף לפחות תנאי אחד'));
      return;
    }
    const cols = selectedColumns();
    const results = advancedSearch(conditions, cols);

    if (results.length === 0) {
      resultsArea.appendChild(statusBox('warning', 'לא נמצאו תוצאות התואמות את התנאים'));
      return;
    }

    resultsArea.appendChild(statusBox('success', `נמצאו ${results.length} תוצאות`));

    // Build the results table. Columns: code, name, then the selected columns.
    const dataCols = Object.keys(results[0]).filter((c) => c !== 'Code' && c !== 'shmmitzrach');
    const headers = ['קוד', 'שם המזון', ...dataCols.map((c) => FIELDS_MAPPING[c] || c)];
    const rows = results.map((r) => [
      r.Code, r.shmmitzrach, ...dataCols.map((c) => (r[c] === null || r[c] === undefined ? '' : String(r[c]))),
    ]);
    resultsArea.appendChild(h('div', { class: 'table-scroll' }, [table(headers, rows)]));

    // Pick one for the detailed breakdown.
    const detailPick = selectField('בחר מזון להצגה מפורטת:',
      [{ value: '', label: '—' }, ...results.map((r) => ({ value: r.Code, label: r.shmmitzrach }))]);
    const detail = h('div', {});
    resultsArea.appendChild(h('div', { class: 'panel', style: { marginTop: '14px' } }, [detailPick.wrapper, detail]));

    detailPick.select.addEventListener('change', () => {
      clear(detail);
      if (!detailPick.select.value) return;
      const food = getFoodDetails(Number(detailPick.select.value));
      if (!food) return;
      detail.appendChild(h('hr', { class: 'divider' }));
      detail.appendChild(h('h3', { class: 'block-title', text: `פרטים: ${food.shmmitzrach}` }));
      const nut = h('div', {});
      detail.appendChild(nut);
      renderNutrition(nut, food, 1.0);
    });
  }
}

export default { id: 'advanced', label: 'חיפוש מתקדם', render };
