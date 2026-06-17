// db.js
// Loads the SQLite nutrition database in the browser via sql.js (SQLite
// compiled to WebAssembly) and exposes the query helpers that the original
// Streamlit app implemented in Python. Keeping the SQL identical means the
// data behaviour matches the source app exactly.

let SQL = null; // the sql.js module
let db = null; // the loaded Database instance

// initSqlJs is provided by vendor/sql-wasm.js (loaded as a classic script in
// index.html, so it lives on window).
async function loadSqlJs() {
  if (SQL) return SQL;
  // eslint-disable-next-line no-undef
  SQL = await initSqlJs({ locateFile: (file) => `vendor/${file}` });
  return SQL;
}

// Initialise the database. Fetches data/nutrition.db and opens it with sql.js.
export async function initDb() {
  if (db) return db;
  await loadSqlJs();
  const response = await fetch('data/nutrition.db');
  if (!response.ok) {
    throw new Error(`לא ניתן לטעון את בסיס הנתונים (${response.status})`);
  }
  const buffer = await response.arrayBuffer();
  db = new SQL.Database(new Uint8Array(buffer));
  return db;
}

// Run a query and return an array of plain row objects ({col: value, ...}).
// Mirrors pandas.read_sql_query(...).to_dict('records').
export function queryAll(sql, params = []) {
  const stmt = db.prepare(sql);
  try {
    stmt.bind(params);
    const rows = [];
    while (stmt.step()) {
      rows.push(stmt.getAsObject());
    }
    return rows;
  } finally {
    stmt.free();
  }
}

// Run a query expected to return a single row; returns the row object or null.
export function queryOne(sql, params = []) {
  const rows = queryAll(sql, params);
  return rows.length > 0 ? rows[0] : null;
}

// ---------------------------------------------------------------------------
// Query helpers — direct ports of the functions in app.py.
// ---------------------------------------------------------------------------

// search_foods(search_term): match by Hebrew name or numeric smlmitzrach code.
export function searchFoods(searchTerm) {
  const like = `%${searchTerm}%`;
  return queryAll(
    `SELECT Code, smlmitzrach, shmmitzrach
     FROM products
     WHERE shmmitzrach LIKE ? OR CAST(smlmitzrach AS TEXT) LIKE ?
     ORDER BY shmmitzrach`,
    [like, like],
  );
}

// advanced_search(conditions, columns): multi-condition search where each
// condition carries its own AND/OR join to the next one.
//   condition = { field, operator, value, value2?, nextOperator? }
// `columns` is an optional array of extra product columns to select.
export function advancedSearch(conditions, columns = null) {
  if (!conditions || conditions.length === 0) return [];

  const whereParts = [];
  const params = [];

  conditions.forEach((cond, i) => {
    const { field, operator, value } = cond;
    let conditionSql;

    switch (operator) {
      case 'שווה':
      case '=':
        conditionSql = `${field} = ?`;
        params.push(value);
        break;
      case 'גדול מ':
      case '>':
        conditionSql = `${field} > ?`;
        params.push(value);
        break;
      case 'קטן מ':
      case '<':
        conditionSql = `${field} < ?`;
        params.push(value);
        break;
      case 'גדול שווה':
      case '>=':
        conditionSql = `${field} >= ?`;
        params.push(value);
        break;
      case 'קטן שווה':
      case '<=':
        conditionSql = `${field} <= ?`;
        params.push(value);
        break;
      case 'בין':
        if (cond.value2 !== undefined && cond.value2 !== null) {
          conditionSql = `${field} BETWEEN ? AND ?`;
          params.push(value, cond.value2);
        } else {
          return; // skip incomplete BETWEEN
        }
        break;
      default:
        return;
    }

    if (whereParts.length === 0) {
      whereParts.push(conditionSql);
    } else {
      const logicOp = conditions[i - 1].nextOperator || 'AND';
      whereParts.push(` ${logicOp} ${conditionSql}`);
    }
  });

  if (whereParts.length === 0) return [];

  const whereClause = whereParts.join('');

  let selectClause;
  if (columns && columns.length) {
    const cols = ['Code', 'shmmitzrach', ...columns.filter((c) => c !== 'Code' && c !== 'shmmitzrach')];
    selectClause = cols.join(', ');
  } else {
    selectClause = 'Code, shmmitzrach, protein, total_fat, carbohydrates, food_energy';
  }

  return queryAll(
    `SELECT ${selectClause}
     FROM products
     WHERE ${whereClause}
     ORDER BY shmmitzrach`,
    params,
  );
}

// get_food_details(food_code): full product row, or null.
export function getFoodDetails(foodCode) {
  return queryOne('SELECT * FROM products WHERE Code = ?', [foodCode]);
}

// get_available_units(food_code): unit conversions joined to unit names.
export function getAvailableUnits(foodCode) {
  return queryAll(
    `SELECT c.mida, c.mishkal, u.shmmida
     FROM conversions c
     JOIN units u ON c.mida = u.smlmida
     WHERE c.mmitzrach = ?
     ORDER BY u.shmmida`,
    [foodCode],
  );
}

// get_recipe_details(recipe_code): recipe components joined to product names.
export function getRecipeDetails(recipeCode) {
  return queryAll(
    `SELECT r.*, p.shmmitzrach
     FROM recipes r
     LEFT JOIN products p ON r.mitzbsisi = p.Code
     WHERE r.mmitzrach = ?`,
    [recipeCode],
  );
}

// Search products that are themselves recipes (have rows in `recipes`).
export function searchRecipes(searchTerm, limit = 50) {
  return queryAll(
    `SELECT DISTINCT p.Code, p.shmmitzrach
     FROM products p
     JOIN recipes r ON p.Code = r.mmitzrach
     WHERE p.shmmitzrach LIKE ?
     LIMIT ?`,
    [`%${searchTerm}%`, limit],
  );
}

// get_retention_options(): list of cooking/processing retention methods.
export function getRetentionOptions() {
  try {
    return queryAll(
      `SELECT retention_code, retention_name, hebrew_name
       FROM retentions
       ORDER BY hebrew_name`,
    );
  } catch {
    return [];
  }
}

// get_retention_factors(retention_code): the per-nutrient retention row.
export function getRetentionFactors(retentionCode) {
  try {
    return queryOne('SELECT * FROM retentions WHERE retention_code = ?', [retentionCode]);
  } catch {
    return null;
  }
}
