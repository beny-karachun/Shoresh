// pages/search.js — "חיפוש רגיל" (regular search).
// Type a food name (or code), pick it, choose a unit and amount, and see the
// scaled nutrition breakdown.

import { h, clear, searchSelect, numberField, selectField, statusBox, sectionHeader } from '../ui.js';
import { searchFoods, getFoodDetails, getAvailableUnits } from '../db.js';
import { renderNutrition } from '../nutritionView.js';

function render(container) {
  clear(container);
  container.appendChild(sectionHeader('חיפוש מזון',
    'הקלד שם מזון (בעברית) או קוד, בחר מוצר, יחידת מידה וכמות לצפייה בערכים התזונתיים.'));

  const picker = searchSelect({
    placeholder: 'לדוגמה: חלב, לחם, תפוח...',
    search: (term) => searchFoods(term).map((r) => ({ value: r.Code, label: r.shmmitzrach })),
    onSelect: (item) => showFood(item),
  });
  container.appendChild(h('div', { class: 'panel' }, [
    h('label', { class: 'field' }, [
      h('span', { class: 'field-label', text: 'הזן שם מזון לחיפוש:' }),
      picker.wrapper,
    ]),
  ]));

  const detail = h('div', {});
  container.appendChild(detail);

  function showFood(item) {
    clear(detail);
    const foodData = getFoodDetails(item.value);
    if (!foodData) return;

    detail.appendChild(h('hr', { class: 'divider' }));
    detail.appendChild(h('h3', { class: 'block-title', text: `נבחר: ${item.label}` }));

    const units = getAvailableUnits(item.value);
    if (units.length === 0) {
      detail.appendChild(statusBox('warning', 'אין יחידות מידה זמינות למזון זה'));
      return;
    }

    const amount = numberField('כמות:', { value: 1.0, min: 0.1, max: 10000, step: 0.1 });
    const unit = selectField('יחידת מידה:', units.map((u) => ({
      value: u.mida,
      label: u.shmmida,
    })));

    detail.appendChild(h('div', { class: 'panel' }, [
      h('div', { class: 'row' }, [amount.wrapper, unit.wrapper]),
    ]));

    const info = h('div', {});
    const nutrition = h('div', {});
    detail.appendChild(info);
    detail.appendChild(nutrition);

    function recompute() {
      const amt = parseFloat(amount.input.value) || 0;
      const selectedUnit = units.find((u) => String(u.mida) === unit.select.value);
      const unitWeight = selectedUnit ? selectedUnit.mishkal : 0;
      const grams = amt * unitWeight;
      const factor = grams / 100;

      clear(info);
      const unitName = selectedUnit ? selectedUnit.shmmida : '';
      info.appendChild(h('hr', { class: 'divider' }));
      info.appendChild(statusBox('info',
        `${amt} ${unitName} = ${grams.toFixed(1)} גרם`));

      renderNutrition(nutrition, foodData, factor);
    }

    amount.input.addEventListener('input', recompute);
    unit.select.addEventListener('change', recompute);
    recompute();
  }
}

export default { id: 'search', label: 'חיפוש רגיל', render };
