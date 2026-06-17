// pages/recipes.js — "מחשבון מתכונים" (recipe calculator).
// Look up a recipe (a product that has component rows), show its ingredients,
// model liquid loss, and compute the finished-product nutrition per 100 g.

import {
  h, clear, statusBox, sectionHeader, searchSelect, numberField, table,
} from '../ui.js';
import { FIELDS_MAPPING } from '../nutrition.js';
import { searchRecipes, getRecipeDetails, getFoodDetails } from '../db.js';
import { renderNutrition } from '../nutritionView.js';

function render(container) {
  clear(container);
  container.appendChild(sectionHeader('👨‍🍳 מחשבון מתכונים',
    'צפה במרכיבי מתכונים וערכי ספיחת שמן'));

  const picker = searchSelect({
    placeholder: 'לדוגמה: שניצל...',
    search: (term) => searchRecipes(term).map((r) => ({ value: r.Code, label: r.shmmitzrach })),
    onSelect: (item) => showRecipe(item),
  });
  container.appendChild(h('div', { class: 'panel' }, [
    h('label', { class: 'field' }, [
      h('span', { class: 'field-label', text: 'חפש מתכון:' }),
      picker.wrapper,
    ]),
  ]));

  const detail = h('div', {});
  container.appendChild(detail);

  function showRecipe(item) {
    clear(detail);
    const details = getRecipeDetails(item.value);
    if (!details.length) {
      detail.appendChild(statusBox('error', 'לא נמצאו רכיבים למתכון זה'));
      return;
    }

    detail.appendChild(h('h3', { class: 'block-title', text: `רכיבים ל- ${item.label}` }));

    // Ingredients table.
    const headers = ['רכיב', 'משקל (גרם)', 'אחוז ספיחה/איבוד (%)', 'קוד Retention'];
    const rows = details.map((r) => [r.shmmitzrach, r.mishkal, r.ahuz, r.retention]);
    detail.appendChild(h('div', { class: 'table-scroll' }, [table(headers, rows)]));

    const totalWeight = details.reduce((s, r) => s + (Number(r.mishkal) || 0), 0);
    detail.appendChild(statusBox('info', `משקל כולל מחושב: ${totalWeight.toFixed(1)} גרם`));

    detail.appendChild(h('hr', { class: 'divider' }));
    detail.appendChild(h('h3', { class: 'block-title', text: '📉 חישוב ערכים סופיים (עם איבוד נוזלים)' }));

    const loss = numberField('אחוז איבוד נוזלים (%)', { value: 0, min: 0, max: 90, step: 1 });
    detail.appendChild(h('p', { class: 'caption', text: 'ראה טבלה 7 בחוברת ההדרכה' }));
    const finalInfo = h('div', {});
    detail.appendChild(h('div', { class: 'row' }, [loss.wrapper, finalInfo]));

    function currentFinalWeight() {
      const lossPct = parseFloat(loss.input.value) || 0;
      let finalWeight = totalWeight;
      let concentration = 1.0;
      if (lossPct > 0) {
        finalWeight = totalWeight * (1 - lossPct / 100);
        concentration = 1 / (1 - lossPct / 100);
      }
      return { lossPct, finalWeight, concentration };
    }

    function renderFinalInfo() {
      clear(finalInfo);
      const { lossPct, finalWeight, concentration } = currentFinalWeight();
      const deltaTxt = `${(finalWeight - totalWeight).toFixed(1)} גרם (איבוד)`;
      finalInfo.appendChild(h('div', { class: 'metric' }, [
        h('div', { class: 'metric-label', text: 'משקל סופי (אחרי בישול)' }),
        h('div', { class: 'metric-value', text: `${finalWeight.toFixed(1)} גרם` }),
        h('div', { class: 'caption', text: deltaTxt }),
        lossPct > 0 ? h('div', { class: 'caption', text: `פקטור ריכוז: x${concentration.toFixed(2)}` }) : null,
      ]));
    }
    loss.input.addEventListener('input', renderFinalInfo);
    renderFinalInfo();

    // Compute finished-product nutrition per 100g.
    const calcBtn = h('button', { class: 'btn primary', style: { marginTop: '12px' }, text: '🧮 חשב ערכים תזונתיים ל-100 גרם (מוצר מוגמר)' });
    const calcOut = h('div', {});
    calcBtn.addEventListener('click', () => {
      clear(calcOut);
      const { finalWeight } = currentFinalWeight();

      // Gather valid ingredients with nutrition data.
      const valid = [];
      for (const r of details) {
        const food = getFoodDetails(r.mitzbsisi);
        if (food) valid.push({ data: food, weight: Number(r.mishkal) || 0 });
      }
      if (!valid.length) {
        calcOut.appendChild(statusBox('warning', 'לא סופקו נתונים תזונתיים למרכיבים'));
        return;
      }

      const final100g = {};
      for (const param of Object.keys(FIELDS_MAPPING)) {
        let totalVal = 0;
        for (const ing of valid) {
          const v = Number(ing.data[param]);
          if (Number.isFinite(v)) totalVal += v * (ing.weight / 100);
        }
        final100g[param] = finalWeight > 0 ? (totalVal / finalWeight) * 100 : 0;
      }

      calcOut.appendChild(h('h3', { class: 'block-title', text: 'ערכים תזונתיים ל-100 גרם (מוצר מוגמר)' }));
      const nut = h('div', {});
      calcOut.appendChild(nut);
      renderNutrition(nut, final100g, 1.0, { allReal: true });
    });
    detail.appendChild(calcBtn);
    detail.appendChild(calcOut);

    // Oil absorption / liquid loss highlighting.
    const oilRows = details.filter((r) => r.ahuz !== null && r.ahuz !== undefined && Number(r.ahuz) > 0);
    if (oilRows.length) {
      detail.appendChild(h('hr', { class: 'divider' }));
      detail.appendChild(h('h3', { class: 'block-title', text: '🛢️ נתוני ספיחת שמן' }));

      // Main ingredient = the one with the largest weight.
      const mainIng = details.reduce((max, r) => (Number(r.mishkal) > Number(max.mishkal) ? r : max), details[0]);

      for (const r of oilRows) {
        const isOil = String(r.shmmitzrach || '').includes('שמן');
        const msgType = isOil ? 'ספיחת שמן' : 'איבוד נוזלים';
        const ahuz = Number(r.ahuz);
        const box = statusBox('warning',
          `${r.shmmitzrach}: ${msgType} ${ahuz.toFixed(3)}% (משקל נוכחי: ${r.mishkal} גרם)`);
        detail.appendChild(box);

        if (mainIng.mitzbsisi !== r.mitzbsisi) {
          const theory = Number(mainIng.mishkal) * (ahuz / 100);
          detail.appendChild(h('p', { class: 'caption',
            text: `בדיקה: ${ahuz.toFixed(3)}% מ-${mainIng.shmmitzrach} (${mainIng.mishkal} גרם) = ${theory.toFixed(1)} גרם` }));
        }
      }
    }
  }
}

export default { id: 'recipes', label: 'מחשבון מתכונים', render };
