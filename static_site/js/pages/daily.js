// pages/daily.js — "מחשבון יומי" (daily intake calculator).
// Add foods with a quantity + unit; the page sums the chosen nutrients across
// everything in the list.

import {
  h, clear, statusBox, sectionHeader, searchSelect, numberField, selectField, table,
} from '../ui.js';
import { FIELDS_MAPPING, calcField } from '../nutrition.js';
import { searchFoods, getFoodDetails, getAvailableUnits } from '../db.js';

const DEFAULT_PARAMS = ['food_energy', 'protein', 'carbohydrates', 'total_fat'];

let dailyList = []; // [{ id, name, quantity(grams), displayUnit, displayAmount }]

// Sum of significant-figure-rounded contributions; shown with light 2-decimal
// formatting for readability.
function fmtTotal(x) {
  if (!Number.isFinite(x)) return '0';
  const r = Math.round(x * 100) / 100;
  return Number.isInteger(r) ? String(r) : String(r);
}

function render(container) {
  clear(container);
  container.appendChild(sectionHeader('🧮 מחשבון תזונה יומי',
    'חשב את הערכים התזונתיים הכוללים של מספר מוצרים.'));

  // --- Add product ---
  const addPanel = h('div', { class: 'panel' });
  let selected = null;        // { id, name }
  const controls = h('div', {});

  const picker = searchSelect({
    placeholder: 'חפש מוצר להוספה...',
    search: (term) => searchFoods(term).map((r) => ({ value: r.Code, label: r.shmmitzrach })),
    onSelect: (item) => { selected = { id: item.value, name: item.label }; renderControls(); },
  });
  addPanel.appendChild(h('label', { class: 'field' }, [
    h('span', { class: 'field-label', text: 'חפש מוצר להוספה:' }),
    picker.wrapper,
  ]));
  addPanel.appendChild(controls);
  container.appendChild(addPanel);

  function renderControls() {
    clear(controls);
    if (!selected) return;
    const units = getAvailableUnits(selected.id);
    const unitOpts = [{ label: 'גרם', weight: 1.0 }, ...units.map((u) => ({ label: u.shmmida, weight: u.mishkal }))];

    const amount = numberField('כמות:', { value: 1.0, min: 0.1, step: 0.1 });
    const unit = selectField('יחידה:', unitOpts.map((u, idx) => ({ value: idx, label: u.label })));
    const addBtn = h('div', { class: 'field' }, [
      h('span', { class: 'field-label', text: ' ' }),
      h('button', {
        class: 'btn primary', text: 'הוסף לרשימה',
        onClick: () => {
          const amt = parseFloat(amount.input.value) || 0;
          const u = unitOpts[Number(unit.select.value)];
          const grams = amt * u.weight;
          dailyList.push({
            id: selected.id, name: selected.name, quantity: grams,
            displayUnit: u.label, displayAmount: amt,
          });
          renderList();
        },
      }),
    ]);
    controls.appendChild(h('div', { class: 'row', style: { marginTop: '12px' } }, [amount.wrapper, unit.wrapper, addBtn]));
  }

  container.appendChild(h('hr', { class: 'divider' }));

  const listArea = h('div', {});
  container.appendChild(listArea);

  function renderList() {
    clear(listArea);
    if (dailyList.length === 0) {
      listArea.appendChild(statusBox('info', 'הוסף מוצרים לרשימה כדי לראות סיכום תזונתי.'));
      return;
    }

    listArea.appendChild(h('h3', { class: 'block-title', text: '📋 רשימת מוצרים' }));
    dailyList.forEach((item, i) => {
      listArea.appendChild(h('div', { class: 'list-row' }, [
        h('span', { class: 'grow', text: `${i + 1}. ${item.name}` }),
        h('span', { class: 'meta', text: `${item.displayAmount} ${item.displayUnit} (${item.quantity.toFixed(1)} גרם)` }),
        h('button', {
          class: 'btn danger small', text: 'הסר',
          onClick: () => { dailyList.splice(i, 1); renderList(); },
        }),
      ]));
    });

    listArea.appendChild(h('hr', { class: 'divider' }));
    listArea.appendChild(h('h3', { class: 'block-title', text: '📊 סיכום ערכים תזונתיים' }));

    // Parameter selection.
    const paramChecks = {};
    const paramGrid = h('div', { class: 'nutri-cols' });
    for (const [key, label] of Object.entries(FIELDS_MAPPING)) {
      const cb = h('input', { type: 'checkbox' });
      cb.checked = DEFAULT_PARAMS.includes(key);
      cb.addEventListener('change', renderTotals);
      paramChecks[key] = cb;
      paramGrid.appendChild(h('label', { class: 'checkbox' }, [cb, label]));
    }
    const selectAll = h('input', { type: 'checkbox' });
    selectAll.addEventListener('change', () => {
      Object.values(paramChecks).forEach((cb) => { cb.checked = selectAll.checked; });
      renderTotals();
    });
    listArea.appendChild(h('label', { class: 'checkbox', style: { marginBottom: '10px' } }, [selectAll, 'בחר הכל']));
    listArea.appendChild(paramGrid);

    const totalsArea = h('div', {});
    listArea.appendChild(totalsArea);

    function renderTotals() {
      const params = Object.keys(FIELDS_MAPPING).filter((k) => paramChecks[k].checked);
      clear(totalsArea);
      if (params.length === 0) return;

      const totals = {};
      for (const p of params) totals[p] = 0;
      for (const item of dailyList) {
        const food = getFoodDetails(item.id);
        if (!food) continue;
        const factor = item.quantity / 100;
        for (const p of params) totals[p] += calcField(p, food[p], factor);
      }

      const rows = params.map((p) => [FIELDS_MAPPING[p], fmtTotal(totals[p])]);
      totalsArea.appendChild(h('div', { class: 'caption', text: 'סה"כ יומי:' }));
      totalsArea.appendChild(h('div', { class: 'table-scroll' }, [table(['פרמטר', 'סה"כ'], rows)]));
    }

    renderTotals();
  }

  renderList();
}

export default { id: 'daily', label: 'מחשבון יומי', render };
