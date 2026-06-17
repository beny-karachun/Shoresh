// ui.js
// Small DOM helpers + reusable widgets shared across pages. No framework — just
// thin wrappers over the DOM so the page modules stay readable.

// Create an element. `attrs` may include: class/className, text, html, dataset,
// style (object), on* event handlers, and any other attribute. `children` is a
// node or array of nodes/strings.
export function h(tag, attrs = {}, children = []) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'class' || key === 'className') {
      el.className = value;
    } else if (key === 'text') {
      el.textContent = value;
    } else if (key === 'html') {
      el.innerHTML = value;
    } else if (key === 'dataset') {
      Object.assign(el.dataset, value);
    } else if (key === 'style' && typeof value === 'object') {
      Object.assign(el.style, value);
    } else if (key.startsWith('on') && typeof value === 'function') {
      el.addEventListener(key.slice(2).toLowerCase(), value);
    } else {
      el.setAttribute(key, value);
    }
  }
  appendChildren(el, children);
  return el;
}

export function appendChildren(el, children) {
  const list = Array.isArray(children) ? children : [children];
  for (const child of list) {
    if (child === null || child === undefined || child === false) continue;
    el.appendChild(typeof child === 'string' || typeof child === 'number'
      ? document.createTextNode(String(child))
      : child);
  }
}

// Remove all children of an element.
export function clear(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
}

// Debounce a function by `wait` ms.
export function debounce(fn, wait = 200) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

// Styled status box (mirrors st.info / st.success / st.warning / st.error).
export function statusBox(kind, text) {
  return h('div', { class: `status status-${kind}`, text });
}

// A labelled number input. Returns { wrapper, input }.
export function numberField(labelText, { value = 0, min, max, step, id } = {}) {
  const input = h('input', {
    type: 'number',
    class: 'num-input',
    value: String(value),
  });
  if (min !== undefined) input.min = String(min);
  if (max !== undefined) input.max = String(max);
  if (step !== undefined) input.step = String(step);
  if (id) input.id = id;
  const wrapper = h('label', { class: 'field' }, [
    h('span', { class: 'field-label', text: labelText }),
    input,
  ]);
  return { wrapper, input };
}

// A <select> populated from [{ value, label }] options.
export function selectField(labelText, options, { value, id } = {}) {
  const select = h('select', { class: 'select-input' });
  if (id) select.id = id;
  for (const opt of options) {
    const o = h('option', { value: String(opt.value), text: opt.label });
    if (value !== undefined && String(opt.value) === String(value)) o.selected = true;
    select.appendChild(o);
  }
  const wrapper = h('label', { class: 'field' }, [
    h('span', { class: 'field-label', text: labelText }),
    select,
  ]);
  return { wrapper, select };
}

// -------------------------------------------------------------------------
// searchSelect: a text box that runs a search as you type and shows a dropdown
// of matching results; picking one fires onSelect({ value, label }). This is
// the static-site analogue of Streamlit's "type to search, then selectbox".
// -------------------------------------------------------------------------
//   opts.search(term)  -> array of { value, label }   (sync)
//   opts.onSelect(item)
//   opts.placeholder
//   opts.minChars (default 1)
//   opts.emptyText shown when no results
export function searchSelect(opts) {
  const {
    placeholder = 'הקלד לחיפוש...',
    minChars = 1,
    emptyText = 'לא נמצאו תוצאות',
    onSelect = () => {},
    search,
  } = opts;

  const input = h('input', { type: 'text', class: 'search-input', placeholder });
  const list = h('div', { class: 'search-results hidden' });
  const wrapper = h('div', { class: 'search-select' }, [input, list]);

  let currentResults = [];

  function close() {
    list.classList.add('hidden');
  }

  function renderResults() {
    clear(list);
    if (currentResults.length === 0) {
      list.appendChild(h('div', { class: 'search-empty', text: emptyText }));
    } else {
      currentResults.slice(0, 100).forEach((item) => {
        const row = h('div', { class: 'search-option', text: item.label });
        row.addEventListener('mousedown', (e) => {
          e.preventDefault();
          input.value = item.label;
          close();
          onSelect(item);
        });
        list.appendChild(row);
      });
    }
    list.classList.remove('hidden');
  }

  const runSearch = debounce(() => {
    const term = input.value.trim();
    if (term.length < minChars) {
      close();
      return;
    }
    currentResults = search(term) || [];
    renderResults();
  }, 200);

  input.addEventListener('input', runSearch);
  input.addEventListener('focus', () => {
    if (input.value.trim().length >= minChars && currentResults.length) renderResults();
  });
  input.addEventListener('blur', () => setTimeout(close, 150));

  return { wrapper, input, clear: () => { input.value = ''; close(); } };
}

// Build a <table> from headers + rows (rows = array of arrays of cell content).
export function table(headers, rows, { className = '' } = {}) {
  const thead = h('thead', {}, [
    h('tr', {}, headers.map((hd) => h('th', { text: hd }))),
  ]);
  const tbody = h('tbody', {}, rows.map((row) => h('tr', {}, row.map((cell) => {
    if (cell && cell.nodeType) return h('td', {}, cell);
    return h('td', { text: cell === null || cell === undefined ? '' : String(cell) });
  }))));
  return h('table', { class: `data-table ${className}`.trim() }, [thead, tbody]);
}

// Section header + optional subtitle.
export function sectionHeader(title, subtitle) {
  return h('div', { class: 'section-header' }, [
    h('h2', { text: title }),
    subtitle ? h('p', { class: 'subtitle', text: subtitle }) : null,
  ]);
}

// A collapsible <details> block (mirrors st.expander).
export function expander(summaryText, contentNodes, { open = false } = {}) {
  const details = h('details', { class: 'expander' });
  if (open) details.open = true;
  details.appendChild(h('summary', { text: summaryText }));
  const body = h('div', { class: 'expander-body' });
  appendChildren(body, contentNodes);
  details.appendChild(body);
  return details;
}
