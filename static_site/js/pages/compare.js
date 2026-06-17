// pages/compare.js — "השוואת מוצרים" (product comparison).
// Add several products, choose parameters and a serving size, and view a
// side-by-side table (rows = nutrients, columns = products), optionally sorted.

import {
  h, clear, statusBox, sectionHeader, searchSelect, numberField, selectField, table,
} from '../ui.js';
import { FIELDS_MAPPING, calcField, fmtCalc } from '../nutrition.js';
import { searchFoods, getFoodDetails } from '../db.js';

const DEFAULT_PARAMS = ['food_energy', 'protein', 'total_fat', 'carbohydrates'];

let comparisonList = []; // [{ name, code }]

function render(container) {
  clear(container);
  container.appendChild(sectionHeader('השוואת מוצרים',
    'בחר מוצרים להשוואה וראה את ההבדלים התזונתיים ביניהם'));

  // --- Add products ---
  const addPanel = h('div', { class: 'panel' });
  addPanel.appendChild(h('h3', { class: 'block-title', text: '🔍 הוסף מוצרים להשוואה' }));

  let pending = null;
  const pendingArea = h('div', {});
  const picker = searchSelect({
    placeholder: 'לדוגמה: חלב, גבינה...',
    search: (term) => searchFoods(term).map((r) => ({ value: r.Code, label: r.shmmitzrach })),
    onSelect: (item) => {
      pending = item;
      clear(pendingArea);
      if (comparisonList.some((p) => p.code === item.value)) {
        pendingArea.appendChild(statusBox('warning', 'המוצר כבר נמצא ברשימת ההשוואה'));
        return;
      }
      pendingArea.appendChild(h('div', { class: 'row tight' }, [
        h('button', {
          class: 'btn primary', text: `הוסף להשוואה: ${item.label}`,
          onClick: () => {
            if (!comparisonList.some((p) => p.code === pending.value)) {
              comparisonList.push({ name: pending.label, code: pending.value });
            }
            picker.clear();
            clear(pendingArea);
            renderAll();
          },
        }),
      ]));
    },
  });
  addPanel.appendChild(picker.wrapper);
  addPanel.appendChild(pendingArea);
  container.appendChild(addPanel);

  const body = h('div', {});
  container.appendChild(body);

  function renderAll() {
    clear(body);
    if (comparisonList.length === 0) {
      body.appendChild(statusBox('info', '👆 הוסף מוצרים כדי להתחיל בהשוואה'));
      return;
    }

    // Selected products list (with remove).
    body.appendChild(h('h3', { class: 'block-title', text: 'מוצרים שנבחרו' }));
    comparisonList.forEach((item, i) => {
      body.appendChild(h('div', { class: 'list-row' }, [
        h('span', { class: 'grow', text: item.name }),
        h('button', {
          class: 'btn danger small', text: '❌ הסר',
          onClick: () => { comparisonList.splice(i, 1); renderAll(); },
        }),
      ]));
    });

    body.appendChild(h('hr', { class: 'divider' }));

    // Parameter selection.
    body.appendChild(h('h3', { class: 'block-title', text: 'פרמטרים להשוואה' }));
    const paramChecks = {};
    const paramGrid = h('div', { class: 'nutri-cols' });
    for (const [key, label] of Object.entries(FIELDS_MAPPING)) {
      const cb = h('input', { type: 'checkbox' });
      cb.checked = DEFAULT_PARAMS.includes(key);
      cb.addEventListener('change', renderTable);
      paramChecks[key] = cb;
      paramGrid.appendChild(h('label', { class: 'checkbox' }, [cb, label]));
    }
    const selectAll = h('input', { type: 'checkbox' });
    selectAll.addEventListener('change', () => {
      Object.values(paramChecks).forEach((cb) => { cb.checked = selectAll.checked; });
      renderTable();
    });
    body.appendChild(h('label', { class: 'checkbox', style: { marginBottom: '10px' } }, [selectAll, 'בחר הכל']));
    body.appendChild(paramGrid);

    // Comparison settings.
    body.appendChild(h('hr', { class: 'divider' }));
    body.appendChild(h('h3', { class: 'block-title', text: 'הגדרות השוואה' }));
    const amount = numberField('כמות להשוואה (גרם):', { value: 100, min: 1, step: 10 });
    const sortSel = selectField('מיין לפי:', [{ value: 'ללא', label: 'ללא' }]);
    amount.input.addEventListener('input', renderTable);
    sortSel.select.addEventListener('change', renderTable);
    body.appendChild(h('div', { class: 'panel' }, [h('div', { class: 'row' }, [amount.wrapper, sortSel.wrapper])]));

    const tableArea = h('div', {});
    body.appendChild(tableArea);

    function selectedParams() {
      return Object.keys(FIELDS_MAPPING).filter((k) => paramChecks[k].checked);
    }

    function refreshSortOptions(params) {
      const prev = sortSel.select.value;
      clear(sortSel.select);
      const opts = [{ value: 'ללא', label: 'ללא' },
        ...params.map((p) => ({ value: p, label: FIELDS_MAPPING[p] }))];
      for (const o of opts) {
        const node = h('option', { value: o.value, text: o.label });
        if (o.value === prev) node.selected = true;
        sortSel.select.appendChild(node);
      }
    }

    function renderTable() {
      const params = selectedParams();
      refreshSortOptions(params);
      clear(tableArea);
      if (params.length === 0) return;

      const amt = parseFloat(amount.input.value) || 0;
      const factor = amt / 100;
      const sortBy = sortSel.select.value;

      // Collect each product's calculated values.
      const products = [];
      for (const item of comparisonList) {
        const food = getFoodDetails(item.code);
        if (!food) continue;
        const values = { name: item.name };
        for (const p of params) values[p] = calcField(p, food[p], factor);
        products.push(values);
      }

      if (sortBy && sortBy !== 'ללא') {
        products.sort((a, b) => (b[sortBy] || 0) - (a[sortBy] || 0));
      }

      const headers = ['פרמטר', ...products.map((p) => p.name)];
      const rows = params.map((p) => [
        FIELDS_MAPPING[p],
        ...products.map((prod) => fmtCalc(prod[p])),
      ]);
      tableArea.appendChild(h('h3', { class: 'block-title', text: `טבלת השוואה (ל-${amt} גרם)` }));
      tableArea.appendChild(h('div', { class: 'table-scroll' }, [table(headers, rows)]));
    }

    renderTable();
  }

  renderAll();
}

export default { id: 'compare', label: 'השוואת מוצרים', render };
