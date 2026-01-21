import streamlit as st
import streamlit.components.v1 as components
import sqlite3
import pandas as pd
import base64
import os

# Page configuration
st.set_page_config(page_title="מחשבון תזונתי", page_icon="🍎", layout="wide")

# Database connection
@st.cache_resource
def get_connection():
    """Create database connection"""
    return sqlite3.connect('nutrition.db', check_same_thread=False)


# Global Constants
# Global Constants
def get_base64_image(image_path):
    """Read image file and return base64 string"""
    try:
        with open(image_path, "rb") as img_file:
            return base64.b64encode(img_file.read()).decode()
    except Exception as e:
        return None

FIELDS_MAPPING = {
    # Macronutrients
    'food_energy': 'קלוריות (קק"ל)',
    'protein': 'חלבון (גרם)',
    'total_fat': 'שומן כולל (גרם)',
    'carbohydrates': 'פחמימות (גרם)',
    'total_dietary_fiber': 'סיבים תזונתיים (גרם)',
    'total_sugars': 'סוכרים (גרם)',
    'alcohol': 'אלכוהול (גרם)',
    'moisture': 'לחות (גרם)',
    
    # Fats
    'saturated_fat': 'שומן רווי (גרם)',
    'mono_unsaturated_fat': 'שומן חד בלתי רווי (גרם)',
    'poly_unsaturated_fat': 'שומן רב בלתי רווי (גרם)',
    'trans_fatty_acids': 'שומן טרנס (גרם)',
    'cholesterol': 'כולסטרול (מ"ג)',
    'linoleic': 'חומצה לינולאית (אומגה 6) (גרם)',
    'linolenic': 'חומצה לינולנית (אומגה 3) (גרם)',
    'oleic': 'חומצה אולאית (גרם)',
    'docosahexanoic': 'DHA (גרם)',
    'eicosapentaenoic': 'EPA (גרם)',
    'arachidonic': 'חומצה ארכידונית (גרם)',
    
    # Vitamins
    'vitamin_a_iu': 'ויטמין A (יחב"ל)',
    'vitamin_a_re': 'ויטמין A (מק"ג RE)',
    'carotene': 'קרוטן (מק"ג)',
    'vitamin_e': 'ויטמין E (מ"ג)',
    'vitamin_c': 'ויטמין C (מ"ג)',
    'thiamin': 'תיאמין B1 (מ"ג)',
    'riboflavin': 'ריבופלאבין B2 (מ"ג)',
    'niacin': 'ניאצין B3 (מ"ג)',
    'vitamin_b6': 'ויטמין B6 (מ"ג)',
    'folate': 'חומצה פולית (מק"ג)',
    'vitamin_b12': 'ויטמין B12 (מק"ג)',
    'vitamin_d': 'ויטמין D (מק"ג)',
    'vitamin_k': 'ויטמין K (מק"ג)',
    'pantothenic_acid': 'חומצה פנטותנית (מ"ג)',
    'biotin': 'ביוטין (מק"ג)',
    'choline': 'כולין (מ"ג)',
    
    # Minerals
    'calcium': 'סידן (מ"ג)',
    'iron': 'ברזל (מ"ג)',
    'magnesium': 'מגנזיום (מ"ג)',
    'phosphorus': 'זרחן (מ"ג)',
    'potassium': 'אשלגן (מ"ג)',
    'sodium': 'נתרן (מ"ג)',
    'zinc': 'אבץ (מ"ג)',
    'copper': 'נחושת (מ"ג)',
    'manganese': 'מנגן (מ"ג)',
    'selenium': 'סלניום (מק"ג)',
    'iodine': 'יוד (מק"ג)',
    
    # Amino Acids
    'isoleucine': 'איזולאוצין (גרם)',
    'leucine': 'לאוצין (גרם)',
    'valine': 'ואלין (גרם)',
    'lysine': 'ליזין (גרם)',
    'methionine': 'מתיונין (גרם)',
    'phenylalanine': 'פנילאלנין (גרם)',
    'threonine': 'תראונין (גרם)',
    'tryptophan': 'טריפטופן (גרם)',
    'histidine': 'היסטידין (גרם)',
    'arginine': 'ארגינין (גרם)',
    
    # Other
    'fructose': 'פרוקטוז (גרם)',
    'sugar_alcohols': 'רב כהלים (גרם)'
}

def count_sig_figs(value):
    """Count significant figures of a number"""
    if value is None:
        return 0
    
    # Convert to string
    s = str(value).lower()
    
    # Handle scientific notation
    if 'e' in s:
        base, _ = s.split('e')
        return count_sig_figs(base)
    
    # Remove negative sign
    s = s.replace('-', '')
    
    # Remove decimal point
    s_no_decimal = s.replace('.', '')
    
    # Strip leading zeros
    s_stripped = s_no_decimal.lstrip('0')
    
    if not s_stripped:
        return 0
        
    return len(s_stripped)

def round_to_sig_figs(x, sig_figs):
    """Round a number to a specific number of significant figures"""
    if x == 0:
        return 0
    
    import math
    try:
        return round(x, sig_figs - int(math.floor(math.log10(abs(x)))) - 1)
    except (ValueError, OverflowError):
        return x

def calculate_with_sig_figs(original_value, factor):
    """Calculate new value preserving significant figures"""
    if original_value is None:
        return 0
    
    try:
        val_float = float(original_value)
        if val_float == 0:
            return 0
            
        # Count sig figs from the original representation
        # If it's an integer in DB (e.g. 24), it comes as 24 or 24.0 depending on pandas
        # We should try to respect the input type if possible, but here we have values.
        # We'll use the string representation of the input value.
        sig_figs = count_sig_figs(original_value)
        
        # If sig_figs is 0 (e.g. input was 0), return 0
        if sig_figs == 0:
            return 0
            
        new_val = val_float * factor
        rounded_val = round_to_sig_figs(new_val, sig_figs)
        
        # Format logic:
        # If the result is an integer (e.g. 10.0) and original was int-like, maybe show int?
        # But 10.0 has 3 sig figs, 10 has 2.
        # We should return a string that represents the sig figs.
        # However, standard float formatting might be enough for now.
        # Let's return the rounded float.
        return rounded_val
        
    except (ValueError, TypeError):
        return 0

def search_foods(search_term):
    """Search for foods by name or smlmitzrach code"""
    conn = get_connection()
    query = """
    SELECT Code, smlmitzrach, shmmitzrach 
    FROM products 
    WHERE shmmitzrach LIKE ? OR CAST(smlmitzrach AS TEXT) LIKE ?
    ORDER BY shmmitzrach
    """
    df = pd.read_sql_query(query, conn, params=(f'%{search_term}%', f'%{search_term}%'))
    return df

def advanced_search(conditions, columns=None):
    """Advanced search with multiple conditions and individual AND/OR operators"""
    conn = get_connection()
    
    if not conditions:
        return pd.DataFrame()
    
    # Build WHERE clause with individual operators
    where_parts = []
    params = []
    
    for i, cond in enumerate(conditions):
        field = cond['field']
        operator = cond['operator']
        value = cond['value']
        
        # Build condition SQL
        if operator == 'שווה' or operator == '=':
            condition_sql = f"{field} = ?"
            params.append(value)
        elif operator == 'גדול מ' or operator == '>':
            condition_sql = f"{field} > ?"
            params.append(value)
        elif operator == 'קטן מ' or operator == '<':
            condition_sql = f"{field} < ?"
            params.append(value)
        elif operator == 'גדול שווה' or operator == '>=':
            condition_sql = f"{field} >= ?"
            params.append(value)
        elif operator == 'קטן שווה' or operator == '<=':
            condition_sql = f"{field} <= ?"
            params.append(value)
        elif operator == 'בין':
            if 'value2' in cond:
                condition_sql = f"{field} BETWEEN ? AND ?"
                params.extend([value, cond['value2']])
            else:
                continue
        else:
            continue
        
        # Add to parts with logic operator
        if i == 0:
            where_parts.append(condition_sql)
        else:
            # Get the logic operator from the previous condition
            logic_op = conditions[i-1].get('next_operator', 'AND')
            where_parts.append(f" {logic_op} {condition_sql}")
    
    if not where_parts:
        return pd.DataFrame()
    
    # Combine all parts
    where_clause = "".join(where_parts)
    
    # Determine columns to select
    if columns:
        # Ensure Code and shmmitzrach are always present
        cols_to_select = ['Code', 'shmmitzrach'] + [c for c in columns if c not in ['Code', 'shmmitzrach']]
        select_clause = ", ".join(cols_to_select)
    else:
        select_clause = "Code, shmmitzrach, protein, total_fat, carbohydrates, food_energy"

    query = f"""
    SELECT {select_clause}
    FROM products 
    WHERE {where_clause}
    ORDER BY shmmitzrach
    """
    
    df = pd.read_sql_query(query, conn, params=params)
    return df

def get_food_details(food_code):
    """Get nutritional details for a specific food"""
    conn = get_connection()
    query = """
    SELECT * 
    FROM products 
    WHERE Code = ?
    """
    df = pd.read_sql_query(query, conn, params=(food_code,))
    return df.iloc[0] if len(df) > 0 else None

def get_available_units(food_code):
    """Get available units for a specific food"""
    conn = get_connection()
    query = """
    SELECT c.mida, c.mishkal, u.shmmida
    FROM conversions c
    JOIN units u ON c.mida = u.smlmida
    WHERE c.mmitzrach = ?
    ORDER BY u.shmmida
    """
    df = pd.read_sql_query(query, conn, params=(food_code,))
    return df

def get_recipe_details(recipe_code):
    """Get components of a recipe"""
    conn = get_connection()
    query = """
    SELECT r.*, p.shmmitzrach
    FROM recipes r
    LEFT JOIN products p ON r.mitzbsisi = p.Code
    WHERE r.mmitzrach = ?
    """
    df = pd.read_sql_query(query, conn, params=(recipe_code,))
    return df

def get_retention_options():
    """Get list of retention cooking methods from database"""
    conn = get_connection()
    query = """
    SELECT retention_code, retention_name, hebrew_name 
    FROM retentions 
    ORDER BY hebrew_name
    """
    try:
        df = pd.read_sql_query(query, conn)
        return df
    except:
        return pd.DataFrame()

def get_retention_factors(retention_code):
    """Get retention factors for a specific cooking method"""
    conn = get_connection()
    query = """
    SELECT * FROM retentions WHERE retention_code = ?
    """
    try:
        df = pd.read_sql_query(query, conn, params=(retention_code,))
        return df.iloc[0] if len(df) > 0 else None
    except:
        return None

# Mapping from product nutrition fields to retention factor columns
RETENTION_FIELD_MAPPING = {
    'vitamin_b12': 'vitamin_b12',
    'folate': 'folate',
    'vitamin_b6': 'vitamin_b6',
    'niacin': 'niacin',
    'riboflavin': 'riboflavin',
    'thiamin': 'thiamin',
    'vitamin_c': 'vitamin_c',
    'carotene': 'carotene',
    'vitamin_a_re': 'vitamin_a_re',
    'vitamin_a_iu': 'vitamin_a_iu',
    'copper': 'copper',
    'zinc': 'zinc',
    'sodium': 'sodium',
    'potassium': 'potassium',
    'phosphorus': 'phosphorus',
    'magnesium': 'magnesium',
    'iron': 'iron',
    'calcium': 'calcium'
}

def display_all_nutrition(food_data, factor=1.0):
    """Display all nutritional parameters"""
    
    def get_val(param):
        return calculate_with_sig_figs(food_data.get(param), factor)

    # Main macronutrients
    st.markdown("### מקרו-נוטריינטים")
    col1, col2, col3, col4 = st.columns(4)
    with col1:
        st.metric("קלוריות (קק\"ל)", f"{get_val('food_energy')}")
    with col2:
        st.metric("חלבון (גרם)", f"{get_val('protein')}")
    with col3:
        st.metric("פחמימות (גרם)", f"{get_val('carbohydrates')}")
    with col4:
        st.metric("שומן כולל (גרם)", f"{get_val('total_fat')}")
    
    # Fats breakdown
    with st.expander("🧈 פירוט שומנים"):
        col1, col2, col3 = st.columns(3)
        with col1:
            st.write(f"**שומן רווי:** {get_val('saturated_fat')} גרם")
            st.write(f"**שומן חד בלתי רווי:** {get_val('mono_unsaturated_fat')} גרם")
            st.write(f"**שומן רב בלתי רווי:** {get_val('poly_unsaturated_fat')} גרם")
        with col2:
            st.write(f"**חומצות שומן טרנס:** {get_val('trans_fatty_acids')} גרם")
            st.write(f"**כולסטרול:** {get_val('cholesterol')} מ\"ג")
            st.write(f"**אומגה 3 (לינולנית):** {get_val('linolenic')} גרם")
        with col3:
            st.write(f"**אומגה 6 (לינולאית):** {get_val('linoleic')} גרם")
            st.write(f"**חומצה אולאית:** {get_val('oleic')} גרם")
    
    # Vitamins
    with st.expander("💊 ויטמינים"):
        col1, col2, col3 = st.columns(3)
        with col1:
            st.write(f"**ויטמין A (יחב\"ל):** {get_val('vitamin_a_iu')}")
            st.write(f"**ויטמין A (מק\"ג):** {get_val('vitamin_a_re')}")
            st.write(f"**ויטמין C (מ\"ג):** {get_val('vitamin_c')}")
            st.write(f"**ויטמין D (מק\"ג):** {get_val('vitamin_d')}")
            st.write(f"**ויטמין E (מ\"ג):** {get_val('vitamin_e')}")
        with col2:
            st.write(f"**ויטמין K (מק\"ג):** {get_val('vitamin_k')}")
            st.write(f"**תיאמין B1 (מ\"ג):** {get_val('thiamin')}")
            st.write(f"**ריבופלאבין B2 (מ\"ג):** {get_val('riboflavin')}")
            st.write(f"**ניאצין B3 (מ\"ג):** {get_val('niacin')}")
        with col3:
            st.write(f"**ויטמין B6 (מ\"ג):** {get_val('vitamin_b6')}")
            st.write(f"**ויטמין B12 (מק\"ג):** {get_val('vitamin_b12')}")
            st.write(f"**חומצה פולית (מק\"ג):** {get_val('folate')}")
            st.write(f"**חומצה פנטותנית (מ\"ג):** {get_val('pantothenic_acid')}")
    
    # Minerals
    with st.expander("⚗️ מינרלים"):
        col1, col2, col3 = st.columns(3)
        with col1:
            st.write(f"**סידן (מ\"ג):** {get_val('calcium')}")
            st.write(f"**ברזל (מ\"ג):** {get_val('iron')}")
            st.write(f"**מגנזיום (מ\"ג):** {get_val('magnesium')}")
            st.write(f"**זרחן (מ\"ג):** {get_val('phosphorus')}")
        with col2:
            st.write(f"**אשלגן (מ\"ג):** {get_val('potassium')}")
            st.write(f"**נתרן (מ\"ג):** {get_val('sodium')}")
            st.write(f"**אבץ (מ\"ג):** {get_val('zinc')}")
            st.write(f"**נחושת (מ\"ג):** {get_val('copper')}")
        with col3:
            st.write(f"**סלניום (מק\"ג):** {get_val('selenium')}")
            st.write(f"**מנגן (מ\"ג):** {get_val('manganese')}")
            st.write(f"**יוד (מק\"ג):** {get_val('iodine')}")
    
    # Other components
    with st.expander("📊 רכיבים נוספים"):
        col1, col2 = st.columns(2)
        with col1:
            st.write(f"**סיבים תזונתיים (גרם):** {get_val('total_dietary_fiber')}")
            st.write(f"**סוכרים (גרם):** {get_val('total_sugars')}")
            st.write(f"**לחות (גרם):** {get_val('moisture')}")
            st.write(f"**אלכוהול (גרם):** {get_val('alcohol')}")
        with col2:
            st.write(f"**קרוטן (מק\"ג):** {get_val('carotene')}")
            st.write(f"**כולין (מ\"ג):** {get_val('choline')}")
            st.write(f"**ביוטין (מק\"ג):** {get_val('biotin')}")

# Sidebar for navigation
page = st.sidebar.radio("בחר מצב:", ["חיפוש רגיל", "חיפוש מתקדם", "השוואת מוצרים", "מחשבון יומי", "מחשבון מתכונים", "עיצוב תווית"])

st.title("🍎 מחשבון תזונתי")
st.markdown("---")

if page == "חיפוש רגיל":
    # Regular search section
    st.subheader("חיפוש מזון")
    search_term = st.text_input("הזן שם מזון לחיפוש:", placeholder="לדוגמה: חלב, לחם, תפוח...")

    if search_term:
        results = search_foods(search_term)
        
        if len(results) > 0:
            st.success(f"נמצאו {len(results)} תוצאות")
            
            food_options = {row['shmmitzrach']: row['Code'] for _, row in results.iterrows()}
            selected_food_name = st.selectbox("בחר מזון:", options=list(food_options.keys()))
            
            if selected_food_name:
                selected_food_code = food_options[selected_food_name]
                food_data = get_food_details(selected_food_code)
                
                if food_data is not None:
                    st.markdown("---")
                    st.subheader(f"נבחר: {selected_food_name}")
                    
                    units_df = get_available_units(selected_food_code)
                    
                    if len(units_df) > 0:
                        col1, col2 = st.columns(2)
                        
                        with col1:
                            amount = st.number_input("כמות:", min_value=0.1, max_value=10000.0, value=1.0, step=0.1)
                        
                        with col2:
                            unit_options = {row['shmmida']: (row['mida'], row['mishkal']) for _, row in units_df.iterrows()}
                            selected_unit_name = st.selectbox("יחידת מידה:", options=list(unit_options.keys()))
                        
                        if selected_unit_name:
                            unit_id, unit_weight = unit_options[selected_unit_name]
                            factor = (amount * unit_weight) / 100
                            
                            st.markdown("---")
                            st.info(f"**{amount} {selected_unit_name}** = **{amount * unit_weight:.1f} גרם**")
                            
                            # Display all nutrition
                            display_all_nutrition(food_data, factor)
                    else:
                        st.warning("אין יחידות מידה זמינות למזון זה")
        else:
            st.warning("לא נמצאו תוצאות. נסה חיפוש אחר.")
    else:
        st.info("👆 התחל בחיפוש מזון כדי לראות ערכים תזונתיים")

elif page == "חיפוש מתקדם":
    st.subheader("חיפוש מתקדם")
    st.write("הגדר תנאים לחיפוש מוצרים")
    
    # Available fields for search
    # Available fields for search
    available_fields = FIELDS_MAPPING
    
    operators = ['שווה', 'גדול מ', 'קטן מ', 'גדול שווה', 'קטן שווה', 'בין']
    
    # Initialize session state for conditions
    if 'conditions' not in st.session_state:
        st.session_state.conditions = []
    
    # Add condition button
    if st.button("➕ הוסף תנאי"):
        st.session_state.conditions.append({
            'field': 'protein', 
            'operator': 'גדול מ', 
            'value': 0,
            'next_operator': 'AND'  # Default to AND
        })
    
    # Display conditions
    conditions_to_search = []
    for i, cond in enumerate(st.session_state.conditions):
        col1, col2, col3, col4, col5 = st.columns([3, 2, 2, 2, 1])
        
        with col1:
            field = st.selectbox(f"פרמטר", options=list(available_fields.keys()), 
                               format_func=lambda x: available_fields[x], key=f"field_{i}")
        
        with col2:
            operator = st.selectbox(f"תנאי", options=operators, key=f"op_{i}")
        
        with col3:
            value = st.number_input(f"ערך", value=0.0, key=f"val_{i}")
        
        with col4:
            value2 = None
            if operator == 'בין':
                value2 = st.number_input(f"עד", value=0.0, key=f"val2_{i}")
        
        with col5:
            if st.button("🗑️", key=f"del_{i}"):
                st.session_state.conditions.pop(i)
                st.rerun()
        
        condition = {
            'field': field, 
            'operator': operator, 
            'value': value
        }
        if value2 is not None:
            condition['value2'] = value2
        
        # Add logic operator selector AFTER each condition (except the last)
        if i < len(st.session_state.conditions) - 1:
            st.markdown("##### צירוף תנאים עם:")
            logic_choice = st.radio(
                f"בחר לוגיקה בין תנאי {i+1} לתנאי {i+2}:",
                options=['AND (וגם)', 'OR (או)'],
                key=f"logic_{i}",
                horizontal=True,
                index=0 if st.session_state.conditions[i].get('next_operator', 'AND') == 'AND' else 1
            )
            condition['next_operator'] = 'AND' if 'AND' in logic_choice else 'OR'
            st.markdown("---")
        
        conditions_to_search.append(condition)
    
    # Column selection
    st.markdown("### תצוגה")
    show_all_cols = st.checkbox("הצג את כל העמודות (כל הפרמטרים)")
    
    selected_columns = []
    if not show_all_cols:
        default_cols = ['food_energy', 'protein', 'total_fat', 'carbohydrates']
        selected_columns = st.multiselect(
            "בחר עמודות להצגה:",
            options=list(available_fields.keys()),
            format_func=lambda x: available_fields[x],
            default=default_cols
        )
    else:
        selected_columns = list(available_fields.keys())

    # Search button
    if st.button("🔍 חפש", type="primary") and conditions_to_search:
        results = advanced_search(conditions_to_search, selected_columns)
        
        if len(results) > 0:
            st.success(f"נמצאו {len(results)} תוצאות")
            
            # Rename columns for display
            display_df = results.copy()
            rename_dict = {k: v for k, v in available_fields.items() if k in display_df.columns}
            rename_dict['shmmitzrach'] = 'שם המזון'
            rename_dict['Code'] = 'קוד'
            display_df = display_df.rename(columns=rename_dict)
            
            st.dataframe(display_df, use_container_width=True)
            
            # Allow selecting from results
            food_options = {row['shmmitzrach']: row['Code'] for _, row in results.iterrows()}
            selected_food_name = st.selectbox("בחר מזון להצגה מפורטת:", options=[''] + list(food_options.keys()))
            
            if selected_food_name and selected_food_name != '':
                selected_food_code = food_options[selected_food_name]
                food_data = get_food_details(selected_food_code)
                
                if food_data is not None:
                    st.markdown("---")
                    st.subheader(f"פרטים: {selected_food_name}")
                    display_all_nutrition(food_data, factor=1.0)
        else:
            st.warning("לא נמצאו תוצאות התואמות את התנאים")

elif page == "השוואת מוצרים":
    st.subheader("השוואת מוצרים")
    st.write("בחר מוצרים להשוואה וראה את ההבדלים התזונתיים ביניהם")

    # Initialize comparison list
    if 'comparison_list' not in st.session_state:
        st.session_state.comparison_list = []

    # Product Search Section
    with st.expander("🔍 הוסף מוצרים להשוואה", expanded=True):
        search_term = st.text_input("חפש מוצר להוספה:", placeholder="לדוגמה: חלב, גבינה...")
        
        if search_term:
            results = search_foods(search_term)
            if len(results) > 0:
                food_options = {row['shmmitzrach']: row['Code'] for _, row in results.iterrows()}
                selected_food_to_add = st.selectbox("בחר מוצר:", options=[''] + list(food_options.keys()))
                
                if selected_food_to_add and selected_food_to_add != '':
                    code = food_options[selected_food_to_add]
                    
                    # Check if already in list
                    if any(item['code'] == code for item in st.session_state.comparison_list):
                        st.warning("המוצר כבר נמצא ברשימת ההשוואה")
                    else:
                        if st.button("הוסף להשוואה"):
                            st.session_state.comparison_list.append({
                                'name': selected_food_to_add,
                                'code': code
                            })
                            st.success(f"נוסף: {selected_food_to_add}")
                            st.rerun()
            else:
                st.warning("לא נמצאו תוצאות")

    # Selected Products List
    if st.session_state.comparison_list:
        st.markdown("### מוצרים שנבחרו")
        
        # Display selected products with remove buttons
        for i, item in enumerate(st.session_state.comparison_list):
            col1, col2 = st.columns([4, 1])
            with col1:
                st.info(item['name'])
            with col2:
                if st.button("❌ הסר", key=f"remove_{i}"):
                    st.session_state.comparison_list.pop(i)
                    st.rerun()
        
        st.markdown("---")
        
        # Parameter Selection
        st.markdown("### פרמטרים להשוואה")
        
        # Define available parameters (reuse from advanced search but maybe structured differently if needed)
        # For simplicity, we'll use the same dictionary but flattened for multiselect
        
        # We need to access the available_fields from the advanced search section or define them globally.
        # Since they are defined inside the 'else' block of advanced search, we should probably move them to a global scope or redefine them.
        # To avoid massive refactoring, I will redefine a comprehensive list here or move the definition up.
        # Moving the definition up is better engineering.
        
        # Let's define the fields here for now to avoid breaking the other section if I mess up the move.
        # Actually, I'll just copy the dictionary for safety and simplicity in this iteration.
        
        # Use global fields mapping
        comparison_fields = FIELDS_MAPPING
        
        col_params1, col_params2 = st.columns([3, 1])
        
        with col_params2:
            select_all = st.checkbox("בחר הכל")
        
        with col_params1:
            if select_all:
                selected_params = list(comparison_fields.keys())
                st.info("כל הפרמטרים נבחרו")
            else:
                default_params = ['food_energy', 'protein', 'total_fat', 'carbohydrates']
                selected_params = st.multiselect(
                    "בחר פרמטרים:",
                    options=list(comparison_fields.keys()),
                    format_func=lambda x: comparison_fields[x],
                    default=default_params
                )
        
        # Generate Comparison Table
        if selected_params:
            st.markdown("### הגדרות השוואה")
            col_conf1, col_conf2 = st.columns(2)
            
            with col_conf1:
                comparison_amount = st.number_input("כמות להשוואה (גרם):", min_value=1.0, value=100.0, step=10.0)
            
            with col_conf2:
                sort_by = st.selectbox("מיין לפי:", options=['ללא'] + selected_params, format_func=lambda x: comparison_fields.get(x, x))

            st.markdown(f"### טבלת השוואה (ל-{comparison_amount:g} גרם)")
            
            comparison_data = {}
            
            # First pass: collect data
            products_data = []
            for item in st.session_state.comparison_list:
                food_details = get_food_details(item['code'])
                if food_details is not None:
                    product_values = {}
                    product_values['name'] = item['name']
                    
                    # Calculate factor based on custom amount (default data is per 100g)
                    factor = comparison_amount / 100.0
                    
                    for param in selected_params:
                        val = food_details.get(param)
                        product_values[param] = calculate_with_sig_figs(val, factor)
                    
                    products_data.append(product_values)
            
            # Sort data if requested
            if sort_by and sort_by != 'ללא':
                products_data.sort(key=lambda x: x.get(sort_by, 0), reverse=True)
            
            # Rearrange for DataFrame (Rows: Parameters, Columns: Products)
            final_data = {}
            for prod in products_data:
                final_data[prod['name']] = [prod[p] for p in selected_params]
            
            # Create DataFrame
            df_compare = pd.DataFrame(final_data, index=[comparison_fields[p] for p in selected_params])
            
            # Calculate dynamic height (approx 35px per row + header)
            table_height = (len(df_compare) + 1) * 35 + 3
            st.dataframe(df_compare, use_container_width=True, height=table_height)
            
    else:
        st.info("👆 הוסף מוצרים כדי להתחיל בהשוואה")

elif page == "מחשבון יומי":
    st.title("🧮 מחשבון תזונה יומי")
    st.write("חשב את הערכים התזונתיים הכוללים של מספר מוצרים.")

    # Initialize session state for daily list
    if 'daily_list' not in st.session_state:
        st.session_state.daily_list = []

    # Search and Add Section
    col1, col2 = st.columns([3, 1])
    
    with col1:
        search_term = st.text_input("חפש מוצר להוספה:", key="daily_search")
    
    if search_term:
        results = search_foods(search_term)
        if len(results) > 0:
            product_options = {f"{row['shmmitzrach']}": row['Code'] for _, row in results.iterrows()}
            selected_product_name = st.selectbox("בחר מוצר:", list(product_options.keys()), key="daily_select")
            
            if selected_product_name:
                selected_id = product_options[selected_product_name]
                
                # Fetch available units
                units_df = get_available_units(selected_id)
                
                col_qty, col_unit, col_add = st.columns([1, 1, 1])
                
                with col_qty:
                    amount = st.number_input("כמות:", min_value=0.1, value=1.0, step=0.1, key="daily_qty")
                
                with col_unit:
                    # Default unit is grams (100g usually, but here we treat 'grams' as a unit where 1 unit = 1g if we want, 
                    # but typically the DB has units. If no units, we fallback to grams input directly?
                    # The user wants to choose units.
                    
                    unit_options = {'גרם': 1.0} # Default
                    if not units_df.empty:
                        for _, row in units_df.iterrows():
                            unit_options[row['shmmida']] = row['mishkal']
                    
                    selected_unit = st.selectbox("יחידה:", list(unit_options.keys()), key="daily_unit")
                
                with col_add:
                    st.write("") # Spacer
                    st.write("") # Spacer
                    if st.button("הוסף לרשימה", key="daily_add_btn"):
                        unit_weight = unit_options[selected_unit]
                        quantity_grams = amount * unit_weight
                        
                        st.session_state.daily_list.append({
                            'id': selected_id,
                            'name': selected_product_name,
                            'quantity': quantity_grams,
                            'display_unit': selected_unit,
                            'display_amount': amount
                        })
                        st.success(f"הוסף: {selected_product_name} ({amount} {selected_unit})")
                        st.rerun()
        else:
            st.warning("לא נמצאו מוצרים")

    st.divider()

    # Display List and Calculate
    if st.session_state.daily_list:
        st.subheader("📋 רשימת מוצרים")
        
        # Display list with remove buttons
        for i, item in enumerate(st.session_state.daily_list):
            col_name, col_qty, col_remove = st.columns([3, 1, 1])
            with col_name:
                st.write(f"**{i+1}. {item['name']}**")
            with col_qty:
                if 'display_unit' in item:
                    st.write(f"{item['display_amount']} {item['display_unit']} ({item['quantity']:.1f} גרם)")
                else:
                    st.write(f"{item['quantity']} גרם")
            with col_remove:
                if st.button("הסר", key=f"remove_{i}"):
                    st.session_state.daily_list.pop(i)
                    st.rerun()
        
        st.divider()
        
        # Parameter Selection
        st.subheader("📊 סיכום ערכים תזונתיים")
        
        # Use global fields mapping
        calc_fields = FIELDS_MAPPING
        
        # Default selected parameters (Macronutrients)
        default_params = ['food_energy', 'protein', 'carbohydrates', 'total_fat']
        default_selected = [k for k in calc_fields.keys() if k in default_params]
        
        col_params1, col_params2 = st.columns([3, 1])
        with col_params2:
             select_all = st.checkbox("בחר הכל", key="daily_select_all")
        
        with col_params1:
            if select_all:
                selected_params = st.multiselect(
                    "בחר פרמטרים לסיכום:",
                    options=list(calc_fields.keys()),
                    format_func=lambda x: calc_fields[x],
                    default=list(calc_fields.keys()),
                    key="daily_params"
                )
            else:
                selected_params = st.multiselect(
                    "בחר פרמטרים לסיכום:",
                    options=list(calc_fields.keys()),
                    format_func=lambda x: calc_fields[x],
                    default=default_selected,
                    key="daily_params"
                )

        if selected_params:
            # Calculate totals
            totals = {param: 0.0 for param in selected_params}
            
            for item in st.session_state.daily_list:
                food_data = get_food_details(item['id'])
                if food_data is not None:
                    factor = item['quantity'] / 100.0
                    for param in selected_params:
                        val = food_data.get(param)
                        # Calculate contribution with sig figs
                        contribution = calculate_with_sig_figs(val, factor)
                        totals[param] += contribution
            
            # Display results
            # Create a nice display for the results
            st.write("### סה\"כ יומי:")
            # ... (rest of daily calculator logic)
            
            # Display summary table
            summary_df = pd.DataFrame([totals])
            st.dataframe(summary_df, use_container_width=True)

elif page == "מחשבון מתכונים":
    st.title("👨‍🍳 מחשבון מתכונים")
    st.write("צפה במרכיבי מתכונים וערכי ספיחת שמן")

    # Search for recipe
    search_term = st.text_input("חפש מתכון:", placeholder="לדוגמה: שניצל...")
    
    if search_term:
        # We search in products, but filter for those that HAVE a recipe
        conn = get_connection()
        query = """
        SELECT DISTINCT p.Code, p.shmmitzrach 
        FROM products p
        JOIN recipes r ON p.Code = r.mmitzrach
        WHERE p.shmmitzrach LIKE ?
        LIMIT 50
        """
        results = pd.read_sql_query(query, conn, params=(f'%{search_term}%',))
        
        if not results.empty:
            recipe_options = {row['shmmitzrach']: row['Code'] for _, row in results.iterrows()}
            selected_recipe = st.selectbox("בחר מתכון:", list(recipe_options.keys()))
            
            if selected_recipe:
                code = recipe_options[selected_recipe]
                
                # Get details
                details = get_recipe_details(code)
                
                if not details.empty:
                    st.subheader(f"רכיבים ל- {selected_recipe}")
                    
                    # Calculate totals
                    total_weight = details['mishkal'].sum()
                    
                    # Prepare display dataframe
                    display_df = details[['shmmitzrach', 'mishkal', 'ahuz', 'retention']].copy()
                    display_df.columns = ['רכיב', 'משקל (גרם)', 'אחוז ספיחה/איבוד (%)', 'קוד Retention']
                    
                    st.dataframe(display_df, use_container_width=True)
                    
                    st.info(f"משקל כולל מחושב: {total_weight:.1f} גרם")
                    
                    st.markdown("---")
                    st.write("### 📉 חישוב ערכים סופיים (עם איבוד נוזלים)")
                    
                    col_loss, col_final = st.columns(2)
                    with col_loss:
                         liquid_loss_pct = st.number_input("אחוז איבוד נוזלים (%)", min_value=0.0, max_value=90.0, value=0.0, step=1.0, help="ראה טבלה 7 בחוברת ההדרכה")
                    
                    # Calculate Final Weight and Factor
                    concentration_factor = 1.0
                    final_weight = total_weight
                    
                    if liquid_loss_pct > 0:
                        final_weight = total_weight * (1 - liquid_loss_pct / 100.0)
                        concentration_factor = 1 / (1 - liquid_loss_pct / 100.0)
                    
                    with col_final:
                        st.metric("משקל סופי (אחרי בישול)", f"{final_weight:.1f} גרם", delta=f"{final_weight - total_weight:.1f} גרם (איבוד)")
                        if liquid_loss_pct > 0:
                            st.caption(f"פקטור ריכוז: x{concentration_factor:.2f}")

                    # Calculate Final Nutrition per 100g (Theoretical)
                    # Logic: Sum(Raw Nutrients) / Final Weight * 100
                    
                    if st.button("🧮 חשב ערכים תזונתיים ל-100 גרם (מוצר מוגמר)"):
                         # 1. Sum raw nutrients
                        raw_totals = {}
                        
                        # We need to iterate over all ingredients and sum their nutrients
                        # This requires fetching food details for each ingredient code
                        # We can do this efficiently?
                        
                        valid_ingredients = []
                        for _, row in details.iterrows():
                             ing_code = row['mitzbsisi']
                             ing_weight = row['mishkal']
                             
                             food_data = get_food_details(ing_code)
                             if food_data is not None:
                                 valid_ingredients.append({'data': food_data, 'weight': ing_weight})
                        
                        if valid_ingredients:
                            # Use first ingredient keys as schema
                            all_params = list(FIELDS_MAPPING.keys())
                            for param in all_params:
                                total_val = 0
                                for item in valid_ingredients:
                                    val = item['data'].get(param)
                                    if val is not None:
                                         try:
                                             val_float = float(val)
                                             total_val += val_float * (item['weight'] / 100.0) # Nutrient amount in this ingredient
                                         except:
                                             pass
                                raw_totals[param] = total_val
                                
                            # 2. Divide by Final Weight and multiply by 100 to get per 100g
                            final_100g_values = {}
                            for param, total_val in raw_totals.items():
                                if final_weight > 0:
                                    final_100g_values[param] = (total_val / final_weight) * 100.0
                                else:
                                    final_100g_values[param] = 0
                                    
                            st.write("#### ערכים תזונתיים ל-100 גרם (מוצר מוגמר)")
                            display_all_nutrition(final_100g_values, factor=1.0) # Factor 1.0 because values are already per 100g
                        else:
                            st.warning("לא סופקו נתונים תזונתיים למרכיבים")

                    
                    # Highlight Oil Absorption
                    oil_rows = details[details['ahuz'].notna() & (details['ahuz'] > 0)]
                    
                    if not oil_rows.empty:
                        st.markdown("### 🛢️ נתוני ספיחת שמן")
                        for _, row in oil_rows.iterrows():
                            # Heuristic: if name contains "oil" or "fat"
                            is_probably_oil = 'שמן' in str(row['shmmitzrach'])
                            
                            icon = "💧" if not is_probably_oil else "🛢️"
                            msg_type = "איבוד נוזלים" if not is_probably_oil else "ספיחת שמן"
                            
                            st.warning(f"**{row['shmmitzrach']}**: {msg_type} {row['ahuz']:.3f}% (משקל נוכחי: {row['mishkal']} גרם)")
                            
                            # Calculate theoretical
                            # Assuming factor applies to the MAIN ingredient (max weight in recipe usually)
                            # or Sum of all others?
                            # For Schnitzel (815), we saw it matches Main Ingredient (500g) * 6.9% = 34.5g
                            
                            main_ing = details.loc[details['mishkal'].idxmax()]
                            if main_ing['mitzbsisi'] != row['mitzbsisi']: # Don't compare to self
                                theory = main_ing['mishkal'] * (row['ahuz'] / 100.0)
                                st.caption(f"בדיקה: {row['ahuz']:.3f}% מ-{main_ing['shmmitzrach']} ({main_ing['mishkal']} גרם) = {theory:.1f} גרם")

                else:
                    st.error("לא נמצאו רכיבים למתכון זה")
        else:
            st.warning("לא נמצאו מתכונים תואמים")
            # Or just a simple list/table. Let's do a dataframe for clarity and exportability.
            
            results_data = []
            for param in selected_params:
                results_data.append({
                    "פרמטר": calc_fields[param],
                    "סה\"כ": f"{totals[param]:.2f}"
                })
            
            df_results = pd.DataFrame(results_data)
            
            # Calculate dynamic height
            res_table_height = (len(df_results) + 1) * 35 + 3
            st.dataframe(df_results, use_container_width=True, height=res_table_height, hide_index=True)
            
    else:
        st.info("הוסף מוצרים לרשימה כדי לראות סיכום תזונתי.")


elif page == "עיצוב תווית":
    st.title("🏷️ עיצוב תווית למוצר")
    st.write("יצירת תווית מוצר לפי תקן 1145 כולל סימון אדום")

    # --- Step 1: Data Source ---
    st.header("1. פרטי המוצר")
    
    source_type = st.radio("מקור הנתונים:", ["מתכון קיים", "הזנה ידנית", "(מומלץ) צור מתכון ממוצרים במאגר"], index=2, horizontal=True)
    
    label_data = {
        'name': '',
        'ingredients': '',
        'nutrition': {}
    }
    
    # Defaults
    for k in FIELDS_MAPPING.keys():
        label_data['nutrition'][k] = 0.0
    
    if source_type == "מתכון קיים":
        search_recipe = st.text_input("חפש מתכון:", placeholder="שניצל...")
        if search_recipe:
            conn = get_connection()
            query = """
            SELECT DISTINCT p.Code, p.shmmitzrach 
            FROM products p
            JOIN recipes r ON p.Code = r.mmitzrach
            WHERE p.shmmitzrach LIKE ?
            LIMIT 20
            """
            results = pd.read_sql_query(query, conn, params=(f'%{search_recipe}%',))
            
            if not results.empty:
                recipe_opts = {row['shmmitzrach']: row['Code'] for _, row in results.iterrows()}
                sel_recipe = st.selectbox("בחר מתוך התוצאות:", list(recipe_opts.keys()))
                
                if sel_recipe:
                    code = recipe_opts[sel_recipe]
                    label_data['name'] = sel_recipe
                    
                    # Get ingredients
                    details = get_recipe_details(code)
                    if not details.empty:
                        # Sort by weight descending
                        details = details.sort_values('mishkal', ascending=False)
                        # Build ingredients string
                        ing_list = details['shmmitzrach'].tolist()
                        label_data['ingredients'] = ", ".join(ing_list)
                        
                        # Get nutrition
                        prod_details = get_food_details(code)
                        if prod_details is not None:
                             for key in FIELDS_MAPPING.keys():
                                 label_data['nutrition'][key] = prod_details.get(key, 0)
    
    elif source_type == "(מומלץ) צור מתכון ממוצרים במאגר":
        st.caption("הרכב מוצר ממספר רכיבים. המערכת תחשב את הערכים הסופיים ותסדר את רשימת הרכיבים.")
        
        # Initialize ingredients list if not present
        if 'label_ingredients' not in st.session_state:
            st.session_state.label_ingredients = []

        # Add Product Section
        col_search, col_qty, col_unit, col_add = st.columns([3, 1, 1, 1])
        
        with col_search:
            search_prod = st.text_input("חפש רכיב להוספה:", placeholder="קמח, סוכר, ביצים...", key="label_search_prod")
            
        selected_code = None
        selected_name = None
        
        if search_prod:
            results = search_foods(search_prod)
            if not results.empty:
                prod_opts = {row['shmmitzrach']: row['Code'] for _, row in results.iterrows()}
                selected_name = st.selectbox("בחר רכיב:", list(prod_opts.keys()), key="label_sel_prod")
                if selected_name:
                    selected_code = prod_opts[selected_name]

        if selected_code:
            units_df = get_available_units(selected_code)
            
            with col_qty:
                amount = st.number_input("כמות:", min_value=0.1, value=100.0, step=10.0, key="label_amount")
            
            with col_unit:
                unit_options = {'גרם': 1.0}
                if not units_df.empty:
                    for _, row in units_df.iterrows():
                        unit_options[row['shmmida']] = row['mishkal']
                selected_unit = st.selectbox("יחידה:", list(unit_options.keys()), key="label_unit")
            
            with col_add:
                st.write("") # Spacer
                st.write("") 
                if st.button("➕ הוסף", key="label_add_btn"):
                    weight_in_grams = amount * unit_options[selected_unit]
                    st.session_state.label_ingredients.append({
                        'code': selected_code,
                        'name': selected_name,
                        'weight': weight_in_grams,
                        'display_amount': amount,
                        'display_unit': selected_unit,
                        'oil_retention': None,  # {oil_code, oil_name, percentage}
                        'nutrient_loss': None,  # percentage value
                        'retention_code': None  # {code, name, hebrew_name}
                    })
                    st.rerun()

        # Display Ingredients List
        if st.session_state.label_ingredients:
            st.write("---")
            st.markdown("###### 🛒 רכיבים שנבחרו:")
            
            total_mix_weight = 0
            total_oil_weight = 0  # Track total oil from retention
            
            for i, item in enumerate(st.session_state.label_ingredients):
                col1, col2, col3, col4, col5, col6 = st.columns([4, 2, 1, 1, 1, 1])
                with col1:
                    st.write(f"**{i+1}. {item['name']}**")
                with col2:
                    st.write(f"{item['display_amount']} {item['display_unit']} ({item['weight']:.1f} גרם)")
                with col3:
                    if st.button("ספיחת שמן", key=f"label_oil_{i}"):
                        st.session_state[f'oil_expand_{i}'] = not st.session_state.get(f'oil_expand_{i}', False)
                        st.rerun()
                with col4:
                    if st.button("קוד שימור", key=f"label_ret_{i}"):
                        st.session_state[f'ret_expand_{i}'] = not st.session_state.get(f'ret_expand_{i}', False)
                        st.rerun()
                with col5:
                    if st.button("איבוד נוטריינטים", key=f"label_loss_{i}"):
                        st.session_state[f'loss_expand_{i}'] = not st.session_state.get(f'loss_expand_{i}', False)
                        st.rerun()
                with col6:
                    if st.button("🗑️", key=f"label_del_{i}"):
                        st.session_state.label_ingredients.pop(i)
                        st.rerun()
                
                # Show retention code info if set
                retention_info = item.get('retention_code')
                if retention_info:
                    st.caption(f"   🍳 קוד שימור: {retention_info['hebrew_name']}")
                
                # Show nutrient loss info if set
                nutrient_loss = item.get('nutrient_loss')
                if nutrient_loss:
                    st.caption(f"   📉 איבוד נוטריינטים: {nutrient_loss}%")
                
                # Show oil retention info if set
                oil_ret = item.get('oil_retention')
                if oil_ret:
                    oil_weight = item['weight'] * oil_ret['percentage'] / 100.0
                    total_oil_weight += oil_weight
                    st.caption(f"   🛢️ ספיחת שמן: {oil_ret['oil_name']} ({oil_ret['percentage']}%) = {oil_weight:.1f} גרם")
                
                # Oil retention expander/form
                if st.session_state.get(f'oil_expand_{i}', False):
                    with st.container():
                        st.markdown("---")
                        st.markdown(f"**⚙️ הגדרת ספיחת שמן עבור: {item['name']}**")
                        
                        oil_search = st.text_input("חפש מוצר (שמן):", placeholder="שמן סויה, שמן זית...", key=f"oil_search_{i}")
                        
                        if oil_search:
                            oil_results = search_foods(oil_search)
                            if not oil_results.empty:
                                oil_opts = {row['shmmitzrach']: row['Code'] for _, row in oil_results.iterrows()}
                                selected_oil_name = st.selectbox("בחר שמן:", list(oil_opts.keys()), key=f"oil_select_{i}")
                                
                                if selected_oil_name:
                                    selected_oil_code = oil_opts[selected_oil_name]
                                    
                                    # Get current percentage if exists
                                    current_pct = oil_ret['percentage'] if oil_ret else 7.0
                                    
                                    oil_pct = st.number_input(
                                        "אחוז ספיחת שמן (%):",
                                        min_value=0.0,
                                        max_value=100.0,
                                        value=current_pct,
                                        step=0.5,
                                        key=f"oil_pct_{i}"
                                    )
                                    
                                    col_save, col_clear, col_cancel = st.columns(3)
                                    with col_save:
                                        if st.button("💾 שמור", key=f"oil_save_{i}"):
                                            st.session_state.label_ingredients[i]['oil_retention'] = {
                                                'oil_code': selected_oil_code,
                                                'oil_name': selected_oil_name,
                                                'percentage': oil_pct
                                            }
                                            st.session_state[f'oil_expand_{i}'] = False
                                            st.rerun()
                                    with col_clear:
                                        if st.button("🗑️ נקה", key=f"oil_clear_{i}"):
                                            st.session_state.label_ingredients[i]['oil_retention'] = None
                                            st.session_state[f'oil_expand_{i}'] = False
                                            st.rerun()
                                    with col_cancel:
                                        if st.button("❌ ביטול", key=f"oil_cancel_{i}"):
                                            st.session_state[f'oil_expand_{i}'] = False
                                            st.rerun()
                        
                        st.markdown("---")
                
                # Retention code expander/form
                if st.session_state.get(f'ret_expand_{i}', False):
                    with st.container():
                        st.markdown("---")
                        st.markdown(f"**🍳 הגדרת קוד שימור (Retention) עבור: {item['name']}**")
                        st.caption("חפש שיטת בישול/עיבוד כדי להתאים את אחוזי השימור של הויטמינים והמינרלים")
                        
                        # Search box for retention codes
                        ret_search = st.text_input(
                            "חפש שיטת בישול:",
                            placeholder="לדוגמה: מטוגן, אפוי, מבושל, ביצה, עוף...",
                            key=f"ret_search_{i}"
                        )
                        
                        # Get retention options from database
                        retention_options = get_retention_options()
                        
                        if not retention_options.empty:
                            # Filter by search term if provided
                            if ret_search:
                                # Search in both hebrew_name and retention_name
                                mask = (
                                    retention_options['hebrew_name'].str.contains(ret_search, case=False, na=False) |
                                    retention_options['retention_name'].str.contains(ret_search, case=False, na=False)
                                )
                                filtered_options = retention_options[mask]
                            else:
                                filtered_options = retention_options
                            
                            if not filtered_options.empty:
                                # Create options dict: hebrew_name -> (code, name)
                                ret_opts = {row['hebrew_name']: (row['retention_code'], row['retention_name']) 
                                           for _, row in filtered_options.iterrows()}
                                
                                # Add "none" option
                                ret_display_list = ['-- ללא --'] + list(ret_opts.keys())
                                
                                # Get current selection if exists
                                current_ret = item.get('retention_code')
                                current_idx = 0
                                if current_ret and current_ret['hebrew_name'] in ret_display_list:
                                    try:
                                        current_idx = ret_display_list.index(current_ret['hebrew_name'])
                                    except ValueError:
                                        current_idx = 0
                                
                                st.caption(f"נמצאו {len(filtered_options)} תוצאות")
                                
                                selected_ret_name = st.selectbox(
                                    "בחר שיטת בישול/עיבוד:",
                                    options=ret_display_list,
                                    index=current_idx,
                                    key=f"ret_select_{i}"
                                )
                                
                                col_save_r, col_clear_r, col_cancel_r = st.columns(3)
                                with col_save_r:
                                    if st.button("💾 שמור", key=f"ret_save_{i}"):
                                        if selected_ret_name != '-- ללא --':
                                            code, name = ret_opts[selected_ret_name]
                                            st.session_state.label_ingredients[i]['retention_code'] = {
                                                'code': code,
                                                'name': name,
                                                'hebrew_name': selected_ret_name
                                            }
                                        else:
                                            st.session_state.label_ingredients[i]['retention_code'] = None
                                        st.session_state[f'ret_expand_{i}'] = False
                                        st.rerun()
                                with col_clear_r:
                                    if st.button("🗑️ נקה", key=f"ret_clear_{i}"):
                                        st.session_state.label_ingredients[i]['retention_code'] = None
                                        st.session_state[f'ret_expand_{i}'] = False
                                        st.rerun()
                                with col_cancel_r:
                                    if st.button("❌ ביטול", key=f"ret_cancel_{i}"):
                                        st.session_state[f'ret_expand_{i}'] = False
                                        st.rerun()
                            else:
                                st.warning("לא נמצאו תוצאות לחיפוש זה")
                        else:
                            st.warning("לא נמצאו קודי שימור בבסיס הנתונים")
                        
                        st.markdown("---")
                
                # Nutrient loss expander/form
                if st.session_state.get(f'loss_expand_{i}', False):
                    with st.container():
                        st.markdown("---")
                        st.markdown(f"**📉 הגדרת איבוד נוטריינטים עבור: {item['name']}**")
                        st.caption("הערכים התזונתיים של מוצר זה יופחתו באחוז שתבחר (לפני הוספת ספיחת שמן)")
                        
                        current_loss = item.get('nutrient_loss') or 0.0
                        
                        loss_pct = st.number_input(
                            "אחוז איבוד נוטריינטים (%):",
                            min_value=0.0,
                            max_value=100.0,
                            value=float(current_loss),
                            step=0.1,
                            key=f"loss_pct_{i}"
                        )
                        
                        col_save_l, col_clear_l, col_cancel_l = st.columns(3)
                        with col_save_l:
                            if st.button("💾 שמור", key=f"loss_save_{i}"):
                                st.session_state.label_ingredients[i]['nutrient_loss'] = loss_pct
                                st.session_state[f'loss_expand_{i}'] = False
                                st.rerun()
                        with col_clear_l:
                            if st.button("🗑️ נקה", key=f"loss_clear_{i}"):
                                st.session_state.label_ingredients[i]['nutrient_loss'] = None
                                st.session_state[f'loss_expand_{i}'] = False
                                st.rerun()
                        with col_cancel_l:
                            if st.button("❌ ביטול", key=f"loss_cancel_{i}"):
                                st.session_state[f'loss_expand_{i}'] = False
                                st.rerun()
                        
                        st.markdown("---")
                
                total_mix_weight += item['weight']
            
            # Show totals including oil
            if total_oil_weight > 0:
                st.info(f"⚖️ משקל כולל של התערובת: {total_mix_weight:.1f} גרם + {total_oil_weight:.1f} גרם שמן = {total_mix_weight + total_oil_weight:.1f} גרם")
            else:
                st.info(f"⚖️ משקל כולל של התערובת: {total_mix_weight:.1f} גרם")
            
            # Update label_data
            # 1. Build ingredients list including retained oils, sorted by weight descending
            all_ingredients_for_label = []
            
            # Add main ingredients
            for item in st.session_state.label_ingredients:
                all_ingredients_for_label.append({
                    'name': item['name'],
                    'weight': item['weight']
                })
                # Add retained oil as separate ingredient
                oil_ret = item.get('oil_retention')
                if oil_ret:
                    oil_weight = item['weight'] * oil_ret['percentage'] / 100.0
                    all_ingredients_for_label.append({
                        'name': oil_ret['oil_name'],
                        'weight': oil_weight
                    })
            
            # Sort by weight descending
            sorted_ingredients_for_label = sorted(all_ingredients_for_label, key=lambda x: x['weight'], reverse=True)
            label_data['ingredients'] = ", ".join([item['name'] for item in sorted_ingredients_for_label])
            
            # Keep original sorted_ingredients for other uses
            sorted_ingredients = sorted(st.session_state.label_ingredients, key=lambda x: x['weight'], reverse=True)
            
            # Default name to first ingredient or mix
            if not label_data['name'] and sorted_ingredients:
                label_data['name'] = f"תערובת {sorted_ingredients[0]['name']}..."

            # 2. Calculate Nutrition per 100g of MIX (including oil retention)
            # First, calculate total weight including oil from retention
            total_weight_with_oil = total_mix_weight
            for item in st.session_state.label_ingredients:
                oil_ret = item.get('oil_retention')
                if oil_ret:
                    total_weight_with_oil += item['weight'] * oil_ret['percentage'] / 100.0
            
            if total_weight_with_oil > 0:
                mix_nutrition = {k: 0.0 for k in FIELDS_MAPPING.keys()}
                
                for item in st.session_state.label_ingredients:
                    prod_details = get_food_details(item['code'])
                    if prod_details is not None:
                        # Convert nutrition (per 100g) to actual amount in item
                        item_factor = item['weight'] / 100.0
                        
                        # Apply nutrient loss if set (BEFORE oil retention)
                        nutrient_loss = item.get('nutrient_loss')
                        loss_factor = 1.0 - (nutrient_loss / 100.0) if nutrient_loss else 1.0
                        
                        # Get retention factors if a retention code is set
                        retention_factors = None
                        retention_info = item.get('retention_code')
                        if retention_info:
                            retention_factors = get_retention_factors(retention_info['code'])
                        
                        for k in FIELDS_MAPPING.keys():
                            val = prod_details.get(k, 0)
                            try:
                                val = float(val)
                            except:
                                val = 0
                            
                            # Apply retention factor if applicable
                            retention_multiplier = 1.0
                            if retention_factors is not None and k in RETENTION_FIELD_MAPPING:
                                retention_col = RETENTION_FIELD_MAPPING[k]
                                try:
                                    retention_pct = float(retention_factors.get(retention_col, 100))
                                    retention_multiplier = retention_pct / 100.0
                                except:
                                    retention_multiplier = 1.0
                            
                            # Apply nutrient loss and retention factor to the product's values
                            mix_nutrition[k] += val * item_factor * loss_factor * retention_multiplier
                    
                    # Add oil retention nutrition if set
                    oil_ret = item.get('oil_retention')
                    if oil_ret:
                        oil_details = get_food_details(oil_ret['oil_code'])
                        if oil_details is not None:
                            # Oil weight = ingredient weight * percentage / 100
                            oil_weight = item['weight'] * oil_ret['percentage'] / 100.0
                            oil_factor = oil_weight / 100.0  # Convert to per-100g factor
                            for k in FIELDS_MAPPING.keys():
                                val = oil_details.get(k, 0)
                                try:
                                    val = float(val)
                                except:
                                    val = 0
                                mix_nutrition[k] += val * oil_factor
                
                # Normalize to 100g of final mix (including oil)
                final_factor = 100.0 / total_weight_with_oil
                for k in FIELDS_MAPPING.keys():
                    label_data['nutrition'][k] = mix_nutrition[k] * final_factor

    # --- Step 2: Refine Data ---
    st.markdown("---")
    st.header("2. עריכת נתונים")
    
    col_meta1, col_meta2 = st.columns(2)
    with col_meta1:
        final_name = st.text_input("שם מוצר (כפי שיופיע על התווית):", value=label_data['name'])
        is_liquid = st.checkbox("האם המוצר נוזלי? (משפיע על ספים למדבקות אדומות)")
    with col_meta2:
         marketing_text = st.text_area("טקסט שיווקי / תיאור:", height=100)
         
    final_ingredients = st.text_area("רשימת רכיבים:", value=label_data.get('ingredients', ''), height=100)
    
    st.subheader("ערכים תזונתיים (ל-100 גרם/מל)")
    
    mandatory_fields = [
        'food_energy', 'total_fat', 'saturated_fat', 'trans_fatty_acids', 
        'cholesterol', 'sodium', 'carbohydrates', 'total_sugars', 
        'total_dietary_fiber', 'protein'
    ]
    
    edited_nutrition = {}
    
    cols = st.columns(4)
    for i, field in enumerate(mandatory_fields):
        with cols[i % 4]:
            val = label_data.get('nutrition', {}).get(field, 0)
            if val is None: val = 0.0
            edited_nutrition[field] = st.number_input(
                FIELDS_MAPPING.get(field, field), 
                value=float(val), 
                step=0.1, 
                format="%.1f"
            )

    # --- Step 2.5: Fluid Loss and Nutrient Composition ---
    st.markdown("---")
    st.header("2.5 הרכב תזונתי מלא")
    
    col_fluid, col_weight = st.columns(2)
    
    with col_fluid:
        fluid_loss_pct = st.number_input(
            "אחוז איבוד נוזלים (%):",
            min_value=0.0,
            max_value=99.9,
            value=0.0,
            step=0.1,
            format="%.1f",
            help="אחוז הנוזלים שאבדו בתהליך הבישול/ייצור. ריכוז הרכיבים התזונתיים יותאם בהתאם."
        )
    
    with col_weight:
        display_weight = st.number_input(
            "משקל להצגה (גרם):",
            min_value=1.0,
            max_value=10000.0,
            value=100.0,
            step=10.0,
            format="%.1f",
            help="הערכים יחושבו עבור משקל זה"
        )
    
    # Calculate adjustment factors
    fluid_loss_factor = 1.0 - (fluid_loss_pct / 100.0)
    weight_factor = display_weight / 100.0
    combined_factor = fluid_loss_factor * weight_factor
    
    if fluid_loss_pct > 0:
        st.info(f"⚠️ עם איבוד נוזלים של {fluid_loss_pct:.1f}%, כל הערכים מופחתים ב-{fluid_loss_pct:.1f}%")
    
    # Get all nutrition values with adjustments
    def get_adjusted_val(field):
        val = edited_nutrition.get(field, label_data.get('nutrition', {}).get(field, 0))
        if val is None:
            val = 0
        try:
            return float(val) * combined_factor
        except:
            return 0
    
    # Define nutrient categories
    nutrient_categories = {
        "מקרו-נוטריינטים": [
            ('food_energy', 'אנרגיה', 'קק"ל'),
            ('protein', 'חלבון', 'גרם'),
            ('total_fat', 'שומן כולל', 'גרם'),
            ('carbohydrates', 'פחמימות', 'גרם'),
            ('total_dietary_fiber', 'סיבים', 'גרם'),
            ('total_sugars', 'סוכרים', 'גרם'),
            ('alcohol', 'אלכוהול', 'גרם'),
            ('moisture', 'לחות', 'גרם'),
        ],
        "שומנים": [
            ('saturated_fat', 'שומן רווי', 'גרם'),
            ('mono_unsaturated_fat', 'חד בלתי רווי', 'גרם'),
            ('poly_unsaturated_fat', 'רב בלתי רווי', 'גרם'),
            ('trans_fatty_acids', 'טרנס', 'גרם'),
            ('cholesterol', 'כולסטרול', 'מ"ג'),
            ('linoleic', 'אומגה 6', 'גרם'),
            ('linolenic', 'אומגה 3', 'גרם'),
            ('oleic', 'אולאית', 'גרם'),
            ('docosahexanoic', 'DHA', 'גרם'),
            ('eicosapentaenoic', 'EPA', 'גרם'),
            ('arachidonic', 'ארכידונית', 'גרם'),
        ],
        "ויטמינים": [
            ('vitamin_a_iu', 'ויטמין A', 'יחב"ל'),
            ('vitamin_a_re', 'ויטמין A', 'מק"ג RE'),
            ('carotene', 'קרוטן', 'מק"ג'),
            ('vitamin_e', 'ויטמין E', 'מ"ג'),
            ('vitamin_c', 'ויטמין C', 'מ"ג'),
            ('thiamin', 'B1', 'מ"ג'),
            ('riboflavin', 'B2', 'מ"ג'),
            ('niacin', 'B3', 'מ"ג'),
            ('vitamin_b6', 'B6', 'מ"ג'),
            ('folate', 'פולית', 'מק"ג'),
            ('vitamin_b12', 'B12', 'מק"ג'),
            ('vitamin_d', 'ויטמין D', 'מק"ג'),
            ('vitamin_k', 'ויטמין K', 'מק"ג'),
            ('pantothenic_acid', 'פנטותנית', 'מ"ג'),
            ('biotin', 'ביוטין', 'מק"ג'),
            ('choline', 'כולין', 'מ"ג'),
        ],
        "מינרלים": [
            ('calcium', 'סידן', 'מ"ג'),
            ('iron', 'ברזל', 'מ"ג'),
            ('magnesium', 'מגנזיום', 'מ"ג'),
            ('phosphorus', 'זרחן', 'מ"ג'),
            ('potassium', 'אשלגן', 'מ"ג'),
            ('sodium', 'נתרן', 'מ"ג'),
            ('zinc', 'אבץ', 'מ"ג'),
            ('copper', 'נחושת', 'מ"ג'),
            ('manganese', 'מנגן', 'מ"ג'),
            ('selenium', 'סלניום', 'מק"ג'),
            ('iodine', 'יוד', 'מק"ג'),
        ],
        "חומצות אמינו": [
            ('isoleucine', 'איזולאוצין', 'גרם'),
            ('leucine', 'לאוצין', 'גרם'),
            ('valine', 'ואלין', 'גרם'),
            ('lysine', 'ליזין', 'גרם'),
            ('methionine', 'מתיונין', 'גרם'),
            ('phenylalanine', 'פנילאלנין', 'גרם'),
            ('threonine', 'תראונין', 'גרם'),
            ('tryptophan', 'טריפטופן', 'גרם'),
            ('histidine', 'היסטידין', 'גרם'),
            ('arginine', 'ארגינין', 'גרם'),
        ],
        "אחרים": [
            ('fructose', 'פרוקטוז', 'גרם'),
            ('sugar_alcohols', 'רב כהלים', 'גרם'),
        ],
    }
    
    # Build compact multi-column HTML table
    st.markdown(f"#### טבלת הרכב תזונתי ל-{display_weight:.0f} גרם")
    
    table_css = """
    <style>
    .nutrient-table-container {
        direction: rtl;
        font-family: Arial, sans-serif;
        font-size: 12px;
    }
    .nutrient-category {
        background-color: #e8f4f8;
        font-weight: bold;
        padding: 6px 8px;
        margin-top: 8px;
        border-radius: 4px;
        color: #1a5276;
    }
    .nutrient-grid {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 4px;
        padding: 4px 0;
    }
    .nutrient-item {
        background-color: #f9f9f9;
        padding: 4px 6px;
        border-radius: 3px;
        display: flex;
        justify-content: space-between;
        border: 1px solid #eee;
    }
    .nutrient-name {
        color: #333;
    }
    .nutrient-value {
        color: #2874a6;
        font-weight: 500;
    }
    </style>
    """
    
    html_content = [table_css, '<div class="nutrient-table-container">']
    
    for category_name, nutrients in nutrient_categories.items():
        html_content.append(f'<div class="nutrient-category">{category_name}</div>')
        html_content.append('<div class="nutrient-grid">')
        
        for field, display_name, unit in nutrients:
            val = get_adjusted_val(field)
            # Format value based on magnitude
            if val >= 100:
                formatted_val = f"{val:.0f}"
            elif val >= 10:
                formatted_val = f"{val:.1f}"
            elif val >= 1:
                formatted_val = f"{val:.2f}"
            else:
                formatted_val = f"{val:.3f}"
            
            html_content.append(f'''
                <div class="nutrient-item">
                    <span class="nutrient-name">{display_name}</span>
                    <span class="nutrient-value">{formatted_val} {unit}</span>
                </div>
            ''')
        
        html_content.append('</div>')
    
    html_content.append('</div>')
    
    # Use components.html for proper HTML rendering
    full_html = "".join(html_content)
    # Calculate height based on number of categories (approx 40px per row + headers)
    num_categories = len(nutrient_categories)
    total_items = sum(len(nutrients) for nutrients in nutrient_categories.values())
    estimated_height = (num_categories * 40) + (total_items // 4 * 30) + 50
    components.html(full_html, height=estimated_height, scrolling=True)

    # --- Step 3: Additional Info ---
    st.markdown("---")
    st.header("3. פרטים נוספים")
    col_add1, col_add2, col_add3 = st.columns(3)
    
    with col_add1:
        storage = st.text_input("תנאי אחסון:", value="יש לשמור במקום קריר ויבש")
    with col_add2:
        manufacturer = st.text_input("יצרן/משווק:", value="מיוצר ע\"י...")
    with col_add3:
        expiry = st.text_input("לשימוש עד", value="עדיף להשתמש לפני...")

    allergens = st.text_input("מידע על אלרגנים:", value="מכיל: ...")

    # --- Step 4: Red Label Logic ---
    # Thresholds (grams per 100g/ml)
    THRESHOLDS_SOLID = {'sodium': 400, 'total_sugars': 10, 'saturated_fat': 4}
    THRESHOLDS_LIQUID = {'sodium': 300, 'total_sugars': 5, 'saturated_fat': 3}
    
    current_thresholds = THRESHOLDS_LIQUID if is_liquid else THRESHOLDS_SOLID
    
    red_labels = []
    
    # Check Sodium
    na_val = edited_nutrition.get('sodium', 0)
    if na_val > current_thresholds['sodium']:
        red_labels.append(('נתרן', 'גבוה בנתרן'))
        
    # Check Sugar
    sugar_val = edited_nutrition.get('total_sugars', 0)
    if sugar_val > current_thresholds['total_sugars']:
        red_labels.append(('סוכר', 'גבוה בסוכר'))
        
    # Check Sat Fat
    fat_val = edited_nutrition.get('saturated_fat', 0)
    if fat_val > current_thresholds['saturated_fat']:
        red_labels.append(('שומן רווי', 'גבוה בשומן רווי'))

    # --- Step 5: Preview ---
    st.markdown("---")
    st.header("4. תצוגה מקדימה")
    
    label_css = """
    <style>
    .food-label {
        border: 2px solid #000;
        padding: 20px;
        background: white;
        color: black;
        font-family: 'Arial', sans-serif;
        direction: rtl;
        text-align: right;
        max_width: 500px;
        margin: 0 auto;
        box-shadow: 5px 5px 15px rgba(0,0,0,0.1);
    }
    .label-header {
        text-align: center;
        border-bottom: 2px solid #000;
        padding-bottom: 10px;
        margin-bottom: 15px;
    }
    .label-title {
        font-size: 24px;
        font-weight: bold;
        margin: 0;
    }
    .label-marketing {
        font-style: italic;
        margin-top: 5px;
    }
    .red-labels-container {
        display: flex;
        justify-content: center;
        gap: 15px;
        margin: 15px 0;
    }
    .red-label-img {
        width: 80px;
        height: auto;
    }
    .nutrition-table {
        width: 100%;
        border-collapse: collapse;
        margin-top: 10px;
        font-size: 14px;
    }
    .nutrition-table th, .nutrition-table td {
        border-bottom: 1px solid #ddd;
        padding: 4px;
        text-align: right;
    }
    .nutrition-table th {
        font-weight: bold;
    }
    .nutrition-header {
        background-color: #f5f5f5;
        font-weight: bold;
        padding: 5px;
        margin-top: 10px;
        border: 1px solid #ddd;
    }
    .ingredients-section {
        margin-top: 15px;
        font-size: 13px;
    }
    .footer-info {
        margin-top: 15px;
        font-size: 12px;
        border-top: 1px solid #000;
        padding-top: 10px;
    }
    .allergens-box {
        border: 1px solid #000;
        padding: 5px;
        margin-top: 10px;
        font-weight: bold;
        font-size: 13px;
    }
    </style>
    """
    
    # Construct HTML parts (using list to avoid indentation issues)
    html_parts = []
    html_parts.append(label_css)
    html_parts.append('<div class="food-label" dir="rtl">')
    
    # Header
    html_parts.append('<div class="label-header">')
    html_parts.append(f'<h1 class="label-title">{final_name}</h1>')
    if marketing_text:
        html_parts.append(f'<div class="label-marketing">{marketing_text}</div>')
    html_parts.append('</div>')
    
    # Red Labels
    if red_labels:
        html_parts.append('<div class="red-labels-container">')
        for label_type, label_text in red_labels:
            img_filename = None
            if label_type == 'נתרן': 
                img_filename = "highsaltlabel.png"
            elif label_type == 'סוכר': 
                img_filename = "highsugarlaber.png" # Note: typo in filename from user
            elif label_type == 'שומן רווי': 
                img_filename = "highsaturatedfatlabel.png"
            
            if img_filename:
                # Assuming labels folder is in the same directory as app.py
                img_path = os.path.join("labels", img_filename)
                b64_img = get_base64_image(img_path)
                
                if b64_img:
                    html_parts.append(f'<img src="data:image/png;base64,{b64_img}" class="red-label-img" alt="{label_text}">')
                else:
                    # Fallback if image not found
                    html_parts.append(f'<div style="color: red; font-weight: bold; border: 1px solid red; padding: 5px;">{label_text}</div>')
            
        html_parts.append('</div>')
        
    # Nutrition Table
    unit_label = 'מל' if is_liquid else 'גרם'
    html_parts.append(f'<div class="nutrition-header">ערכים תזונתיים ל-100 {unit_label}</div>')
    html_parts.append('<table class="nutrition-table">')
    html_parts.append(f'<thead><tr><th>סימון תזונתי</th><th>ל-100 {unit_label}</th></tr></thead>')
    html_parts.append('<tbody>')
    
    def fmt_val(v): return f"{v:.1f}"
    
    # Generate Rows
    rows = []
    rows.append(f"<tr><td>אנרגיה (קלוריות)</td><td>{int(edited_nutrition.get('food_energy', 0))}</td></tr>")
    rows.append(f"<tr><td>סך השומנים (גרם)</td><td>{fmt_val(edited_nutrition.get('total_fat', 0))}</td></tr>")
    rows.append(f"<tr><td style='padding-right: 20px;'>מתוכם: חומצות שומן רוויות (גרם)</td><td>{fmt_val(edited_nutrition.get('saturated_fat', 0))}</td></tr>")
    
    trans = edited_nutrition.get('trans_fatty_acids', 0)
    trans_str = "< 0.5" if trans < 0.5 and trans > 0 else fmt_val(trans)
    rows.append(f"<tr><td style='padding-right: 20px;'>חומצות שומן טרנס (גרם)</td><td>{trans_str}</td></tr>")
    
    rows.append(f"<tr><td style='padding-right: 20px;'>כולסטרול (מ\"ג)</td><td>{fmt_val(edited_nutrition.get('cholesterol', 0))}</td></tr>")
    rows.append(f"<tr><td>נתרן (מ\"ג)</td><td>{fmt_val(edited_nutrition.get('sodium', 0))}</td></tr>")
    rows.append(f"<tr><td>סך הפחמימות (גרם)</td><td>{fmt_val(edited_nutrition.get('carbohydrates', 0))}</td></tr>")
    
    sugs = edited_nutrition.get('total_sugars', 0)
    rows.append(f"<tr><td style='padding-right: 20px;'>מתוכן: סוכרים (גרם)</td><td>{fmt_val(sugs)}</td></tr>")
    rows.append(f"<tr><td style='padding-right: 20px;'>כפיות סוכר</td><td>{fmt_val(sugs / 4.0)}</td></tr>")
    
    rows.append(f"<tr><td>סיבים תזונתיים (גרם)</td><td>{fmt_val(edited_nutrition.get('total_dietary_fiber', 0))}</td></tr>")
    rows.append(f"<tr><td>חלבונים (גרם)</td><td>{fmt_val(edited_nutrition.get('protein', 0))}</td></tr>")
    
    html_parts.extend(rows)
    html_parts.append('</tbody></table>')
    
    # Ingredients & Footer
    html_parts.append(f'<div class="ingredients-section"><strong>רכיבים:</strong> {final_ingredients}</div>')
    
    if allergens:
        html_parts.append(f'<div class="allergens-box">{allergens}</div>')
    
    html_parts.append('<div class="footer-info">')
    html_parts.append(f'<div><strong>תנאי אחסון:</strong> {storage}</div>')
    html_parts.append(f'<div><strong>יצרן:</strong> {manufacturer}</div>')
    html_parts.append(f'<div><strong>תוקף:</strong> {expiry}</div>')
    html_parts.append('</div>')
    
    html_parts.append('</div>') # Close food-label
    
    label_html = "".join(html_parts) # Join with empty string, checking spacing manually if needed, or join with \n
    st.markdown(label_html, unsafe_allow_html=True)
    
    st.markdown("---")
    
    # Create a complete HTML file for download/preview
    full_html_content = f'''<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
    <meta charset="UTF-8">
    <title>תצוגה מקדימה - תווית</title>
    <style>
        body {{
            font-family: Arial, sans-serif;
            padding: 20px;
            margin: 0;
            background: #f0f0f0;
        }}
        .print-instructions {{
            background: #e3f2fd;
            border: 1px solid #2196f3;
            border-radius: 5px;
            padding: 10px;
            margin-bottom: 15px;
            font-size: 12px;
            text-align: center;
        }}
        @media print {{
            .print-instructions {{
                display: none;
            }}
            body {{
                background: white;
            }}
        }}
    </style>
</head>
<body>
    <div class="print-instructions">
        💡 שנה את גודל החלון כרצונך, ואז לחץ <strong>Ctrl+P</strong> להדפסה או צלם מסך
    </div>
    {label_html}
</body>
</html>'''
    
    # Download button for the HTML file
    st.download_button(
        label="🖼️ הורד תווית כקובץ HTML (לפתיחה בחלון נפרד)",
        data=full_html_content.encode('utf-8'),
        file_name="label_preview.html",
        mime="text/html",
        help="הורד את התווית כקובץ HTML, פתח בדפדפן, שנה גודל החלון והדפס"
    )
    
    # Instructions box
    st.info("""
    **💡 הוראות הדפסה:**
    1. לחץ על הכפתור **"הורד תווית כקובץ HTML"** למעלה
    2. פתח את הקובץ שהורד בדפדפן (לחץ עליו פעמיים)
    3. שנה את גודל החלון והזז אותו כרצונך
    4. להדפסה: לחץ **Ctrl+P** או צלם מסך (Screenshot)
    """)


# Footer
st.markdown("---")
st.caption("נתונים ממאגר משרד הבריאות")
