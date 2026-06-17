// app.js — entry point. Boots the database, builds the tab bar, and renders the
// active page. Each page module exports { id, label, render(container) }.

import { initDb } from './db.js';
import { h, clear, statusBox } from './ui.js';

import searchPage from './pages/search.js';
import advancedPage from './pages/advanced.js';
import comparePage from './pages/compare.js';
import dailyPage from './pages/daily.js';
import recipesPage from './pages/recipes.js';
import labelPage from './pages/label.js';

const PAGES = [searchPage, advancedPage, comparePage, dailyPage, recipesPage, labelPage];

const main = document.getElementById('main');
const tabBar = document.getElementById('tab-bar');

let activeId = PAGES[0].id;

function renderActive() {
  clear(main);
  const page = PAGES.find((p) => p.id === activeId) || PAGES[0];
  const container = h('section', { class: 'page' });
  main.appendChild(container);
  try {
    page.render(container);
  } catch (err) {
    console.error(err);
    container.appendChild(statusBox('error', `שגיאה בטעינת העמוד: ${err.message}`));
  }
}

function buildTabs() {
  clear(tabBar);
  for (const page of PAGES) {
    const btn = h('button', {
      class: `tab-btn ${page.id === activeId ? 'active' : ''}`,
      text: page.label,
      onClick: () => {
        if (activeId === page.id) return;
        activeId = page.id;
        [...tabBar.children].forEach((c) => c.classList.toggle('active', c === btn));
        renderActive();
      },
    });
    tabBar.appendChild(btn);
  }
}

async function boot() {
  try {
    await initDb();
    buildTabs();
    renderActive();
  } catch (err) {
    console.error(err);
    clear(main);
    main.appendChild(statusBox('error',
      `שגיאה בטעינת בסיס הנתונים: ${err.message}. ` +
      'יש להגיש את האתר דרך שרת HTTP (ראה README).'));
  }
}

boot();
