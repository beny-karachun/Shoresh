# Agent Directory Map - Shoresh (מחשבון תזונתי)

> **Purpose**: Israeli Ministry of Health nutrition calculator - a Streamlit web app for searching foods and calculating nutritional values based on different serving sizes.

## Quick Start

```bash
# Install dependencies
pip install -r requirements.txt

# Setup database (imports CSV files into SQLite)
python setup_db.py

# Run the application
streamlit run app.py
```

---

## Project Structure

```
Shoresh/
├── app.py                              # Main Streamlit application (979 lines)
├── setup_db.py                         # Database setup script (imports CSVs)
├── verify_schnitzel.py                 # Debug/verification script for recipes
├── nutrition.db                        # SQLite database (generated)
├── README.md                           # User-facing documentation
│
├── moh_mitzrachim (1).csv              # Master food list with nutritional values per 100g
├── moh_yehidot_mida.csv                # Dictionary of measurement units
├── moh_yehidot_mida_lemitzrachim.csv   # Conversion table (foods ↔ units ↔ weights)
├── moh_matkonim_11.7.2022.csv          # Recipes/compound foods
│
└── Tzameret/                           # Legacy PowerBuilder app (80+ DLLs, not Python)
    ├── Tzameret.mdb                    # Original Access database
    ├── Tzameret.PDF                    # Documentation
    └── *.dll, *.exe, *.pbd             # PowerBuilder binaries (ignore)
```

---

## Key Files

### `app.py` - Main Application
The Streamlit web interface. Hebrew UI (RTL).

**Key Functions:**
| Function | Purpose |
|----------|---------|
| `get_connection()` | SQLite connection factory |
| `search_foods(search_term)` | Basic food search |
| `advanced_search(conditions, columns)` | Multi-condition search with AND/OR logic |
| `get_food_details(food_code)` | Get all nutritional data for a food |
| `get_available_units(food_code)` | Get valid measurement units for a food |
| `get_recipe_details(recipe_code)` | Get components of compound foods |
| `display_all_nutrition(food_data, factor)` | Render nutrition facts with significant figures |
| `count_sig_figs(value)` | Significant figures calculation |
| `round_to_sig_figs(x, sig_figs)` | Round preserving sig figs |
| `calculate_with_sig_figs(original_value, factor)` | Scale values preserving precision |

**App Pages (Sidebar Navigation):**
- `חיפוש רגיל` - Regular search
- `חיפוש מתקדם` - Advanced search with filters
- `השוואת מוצרים` - Product comparison
- `מחשבון יומי` - Daily intake calculator
- `מחשבון מתכונים` - Recipe calculator

### `setup_db.py` - Database Setup
Run once to import CSV data into SQLite.

**Key Functions:**
| Function | Purpose |
|----------|---------|
| `clean_column_names(df)` | Strip quotes from column names |
| `read_csv_with_encoding(file_path)` | Try Hebrew encodings (utf-8, windows-1255, iso-8859-8) |
| `setup_database()` | Main import logic |

**Creates Tables:**
- `products` - Food items with nutritional values
- `units` - Measurement unit definitions
- `conversions` - Food-to-unit weight conversions
- `recipes` - Compound food components

### `verify_schnitzel.py` - Debug Utility
Test script for verifying recipe data relationships. Useful for understanding the data model.

---

## Database Schema

### `products` Table
| Column | Description |
|--------|-------------|
| `Code` | Primary key - food code |
| `shmmitzrach` | Food name (Hebrew) |
| `protein` | Protein per 100g |
| `carbohydrates` | Carbs per 100g |
| `total_fat` | Fat per 100g |
| `energy_kcal` | Calories per 100g |
| ... | Many more nutritional parameters |

### `units` Table
| Column | Description |
|--------|-------------|
| `smlmida` | Unit symbol/code |
| (more columns) | Unit descriptions |

### `conversions` Table
| Column | Description |
|--------|-------------|
| `mmitzrach` | Food code (FK to products) |
| `mida` | Unit code (FK to units) |
| (weight columns) | Gram weight for this unit |

### `recipes` Table
| Column | Description |
|--------|-------------|
| `mmitzrach` | Recipe/compound food code |
| `mitzbsisi` | Ingredient food code |
| `mishkal` | Ingredient weight |
| `retention` | Retention factor |
| `ahuz` | Percentage factor |

---

## Data Notes

- **Hebrew Encoding**: Files use various Hebrew encodings. `read_csv_with_encoding()` handles this.
- **Food Codes**: Numeric codes like `82108000`. Use as integers or floats, not strings.
- **Measurements**: All base nutritional values are per 100g. Use `conversions` table to translate units.
- **Significant Figures**: App preserves significant figures from source data.

---

## Tzameret Folder

> ⚠️ **Legacy System - Do Not Modify**

This folder contains the original PowerBuilder application (`tzameret.exe`) and its Access database (`Tzameret.mdb`). The Python app was built to replace/modernize this. The `.dll`, `.pbd`, and `.exe` files are not relevant to the Python project.

The only potentially useful file is `Tzameret.PDF` which contains documentation about the original system.

---

## Common Tasks

### Add a new nutritional parameter to display
1. Find the column name in `products` table
2. Add to `display_all_nutrition()` in `app.py`
3. Update the nutrition categories dict

### Modify search behavior
- Basic search: `search_foods()` (line ~161)
- Advanced search: `advanced_search()` (line ~173)

### Add new app page
1. Add to sidebar radio options (line ~367)
2. Add corresponding `elif page == "..."` block

### Debug data issues
Use `verify_schnitzel.py` as a template for querying relationships.

---

## Dependencies

- `streamlit` - Web framework
- `sqlite3` - Database (stdlib)
- `pandas` - Data manipulation
