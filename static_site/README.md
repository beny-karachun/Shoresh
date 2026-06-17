# מחשבון תזונתי — Static Website

A **static, client-side** rewrite of the original Streamlit nutrition calculator
(`../app.py`). There is **no Python server and no backend** — the entire app runs
in the browser. The Israeli Ministry of Health nutrition database (`nutrition.db`)
is loaded directly in the browser with [sql.js](https://sql.js.org/) (SQLite
compiled to WebAssembly), so every SQL query from the original app runs unchanged,
client-side.

This means the site can be hosted on any static host (GitHub Pages, Netlify,
S3, nginx, …) with zero server-side code.

## Running locally

Because the app `fetch()`es the database and WebAssembly files, it must be served
over HTTP (opening `index.html` directly via `file://` is blocked by browser
security). Any static server works:

```bash
cd static_site
python3 -m http.server 8000
# then open http://localhost:8000
```

or use the helper:

```bash
./serve.sh
```

## Deploying to GitHub Pages

A workflow at [`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml)
publishes the `static_site/` folder to GitHub Pages automatically.

**One-time setup:** in the GitHub repo, go to **Settings → Pages** and set
**Source → "GitHub Actions"**.

After that, every push to `main` that touches `static_site/` builds and deploys.
You can also trigger it manually from the **Actions** tab ("Run workflow"). The
site will be served at:

```
https://beny-karachun.github.io/Shoresh/
```

Everything uses **relative paths**, so it works under that project subpath with no
config changes (verified). The `.nojekyll` file disables Jekyll so all files
(including `data/nutrition.db`) are served verbatim.

### Alternative: deploy from a branch/folder (no Actions)

If you prefer not to use Actions, in **Settings → Pages** choose
**"Deploy from a branch"**, then either:

- put the **contents of `static_site/`** into a `/docs` folder on `main` and pick
  `main` + `/docs`, or
- push the **contents of `static_site/`** to a `gh-pages` branch root and pick that.

(The Actions workflow above is simpler because it deploys the subfolder directly,
with no copying or restructuring.)

## Features (parity with the Streamlit app)

The same six modes, as tabs across the top:

| Tab | Hebrew | What it does |
|-----|--------|--------------|
| Regular search | חיפוש רגיל | Search a food, pick unit + amount, see scaled nutrition |
| Advanced search | חיפוש מתקדם | Multi-condition search (per-condition AND/OR), choose columns |
| Comparison | השוואת מוצרים | Side-by-side nutrient comparison of several products |
| Daily calculator | מחשבון יומי | Sum nutrients across a day's foods |
| Recipe calculator | מחשבון מתכונים | Recipe ingredients, liquid loss, finished-product per-100g |
| Label designer | עיצוב תווית | Build a label incl. red ("high in…") marks; old/new standard toggle |

### Significant-figures fidelity

The original app preserves the significant figures of the source data when
scaling values. That logic (`count_sig_figs` / `round_to_sig_figs` /
`calculate_with_sig_figs`) is ported faithfully in `js/nutrition.js` and was
verified to produce **identical results to the Python implementation across
1.4 million (value × factor) cases** — both the numeric value and the exact
display string (e.g. `"17.0"`, `"5e-05"`). See the note in `nutrition.js` for how
Python's `round()` (round-half-to-even) and `str()` (notation thresholds) are
reproduced in JavaScript.

## Project structure

```
static_site/
├── index.html            # App shell: header, tab bar, loads js/app.js (ES module)
├── styles.css            # All styling (RTL Hebrew, clean light theme)
├── serve.sh              # Convenience: python3 -m http.server
├── js/
│   ├── app.js            # Entry point: boots DB, builds tabs, routes pages
│   ├── db.js             # sql.js init + DB load + query helpers (ports of app.py)
│   ├── nutrition.js      # Field maps, sig-fig math, categories, thresholds
│   ├── nutritionView.js  # Shared "display_all_nutrition" renderer
│   ├── ui.js             # DOM helpers + reusable widgets (searchSelect, table…)
│   └── pages/            # One module per tab (search, advanced, compare,
│                         #   daily, recipes, label)
├── data/
│   └── nutrition.db      # SQLite DB (copy of ../nutrition.db, ~3.8 MB)
├── labels/               # Red-label PNGs (sodium / sugar / saturated fat)
└── vendor/
    ├── sql-wasm.js       # sql.js loader (v1.10.3)
    └── sql-wasm.wasm     # SQLite WebAssembly binary
```

## Updating the data

The database is a direct copy of the project's `nutrition.db`. To refresh it
after regenerating the source DB (see `../setup_db.py` / `../setup_retentions.py`):

```bash
cp ../nutrition.db data/nutrition.db
```

No other build step is required — there is no bundler and no `node_modules`; the
site is plain ES modules plus the vendored sql.js.

## Notes / minor differences from Streamlit

- Search boxes are live "type-and-pick" comboboxes (the static analogue of
  Streamlit's search-then-selectbox).
- The daily-summary table formats totals to 2 decimals for readability; the
  per-item contributions are computed with the same significant-figures logic as
  the original.
- The downloadable label HTML embeds the red-label images as base64, so the saved
  file is self-contained (matching the original app's behaviour).

### Red-label standard (old / new)

The label designer has a **"תקן סימון אדום"** selector for the Israeli front-of-pack
warning regulation, which rolled out in two phases with different thresholds
(per 100 g solid / 100 ml liquid):

| Nutrient | Old — Phase A (2020) solid / liquid | New — Phase B (2021→) solid / liquid |
|----------|--------------------------------------|---------------------------------------|
| Sodium (mg)        | 500 / 400  | **400 / 300** |
| Total sugars (g)   | 13.5 / 5   | **10 / 5** |
| Saturated fat (g)  | 5 / 3      | **4 / 3** |

The default is **New (Phase B)** — the current, permanent, compliant thresholds.
The "Old" mode is provided for reference / re-issuing older labels. The chosen
standard drives which red warning marks appear; a note under the preview shows the
active thresholds and which marks were triggered.
