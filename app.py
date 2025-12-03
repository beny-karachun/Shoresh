import streamlit as st
import sqlite3
import pandas as pd

# Page configuration
st.set_page_config(page_title="מחשבון תזונתי", page_icon="🍎", layout="wide")

# Database connection
@st.cache_resource
def get_connection():
    """Create database connection"""
    return sqlite3.connect('nutrition.db', check_same_thread=False)


# Global Constants
# Global Constants
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

def search_foods(search_term):
    """Search for foods by name"""
    conn = get_connection()
    query = """
    SELECT Code, shmmitzrach 
    FROM products 
    WHERE shmmitzrach LIKE ?
    ORDER BY shmmitzrach
    """
    df = pd.read_sql_query(query, conn, params=(f'%{search_term}%',))
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

def display_all_nutrition(food_data, factor=1.0):
    """Display all nutritional parameters"""
    
    # Main macronutrients
    st.markdown("### מקרו-נוטריינטים")
    col1, col2, col3, col4 = st.columns(4)
    with col1:
        st.metric("קלוריות (קק\"ל)", f"{float(food_data.get('food_energy', 0) or 0) * factor:.1f}")
    with col2:
        st.metric("חלבון (גרם)", f"{float(food_data.get('protein', 0) or 0) * factor:.1f}")
    with col3:
        st.metric("פחמימות (גרם)", f"{float(food_data.get('carbohydrates', 0) or 0) * factor:.1f}")
    with col4:
        st.metric("שומן כולל (גרם)", f"{float(food_data.get('total_fat', 0) or 0) * factor:.1f}")
    
    # Fats breakdown
    with st.expander("🧈 פירוט שומנים"):
        col1, col2, col3 = st.columns(3)
        with col1:
            st.write(f"**שומן רווי:** {float(food_data.get('saturated_fat', 0) or 0) * factor:.2f} גרם")
            st.write(f"**שומן חד בלתי רווי:** {float(food_data.get('mono_unsaturated_fat', 0) or 0) * factor:.2f} גרם")
            st.write(f"**שומן רב בלתי רווי:** {float(food_data.get('poly_unsaturated_fat', 0) or 0) * factor:.2f} גרם")
        with col2:
            st.write(f"**חומצות שומן טרנס:** {float(food_data.get('trans_fatty_acids', 0) or 0) * factor:.2f} גרם")
            st.write(f"**כולסטרול:** {float(food_data.get('cholesterol', 0) or 0) * factor:.2f} מ\"ג")
            st.write(f"**אומגה 3 (לינולנית):** {float(food_data.get('linolenic', 0) or 0) * factor:.2f} גרם")
        with col3:
            st.write(f"**אומגה 6 (לינולאית):** {float(food_data.get('linoleic', 0) or 0) * factor:.2f} גרם")
            st.write(f"**חומצה אולאית:** {float(food_data.get('oleic', 0) or 0) * factor:.2f} גרם")
    
    # Vitamins
    with st.expander("💊 ויטמינים"):
        col1, col2, col3 = st.columns(3)
        with col1:
            st.write(f"**ויטמין A (יחב\"ל):** {float(food_data.get('vitamin_a_iu', 0) or 0) * factor:.1f}")
            st.write(f"**ויטמין A (מק\"ג):** {float(food_data.get('vitamin_a_re', 0) or 0) * factor:.1f}")
            st.write(f"**ויטמין C (מ\"ג):** {float(food_data.get('vitamin_c', 0) or 0) * factor:.2f}")
            st.write(f"**ויטמין D (מק\"ג):** {float(food_data.get('vitamin_d', 0) or 0) * factor:.2f}")
            st.write(f"**ויטמין E (מ\"ג):** {float(food_data.get('vitamin_e', 0) or 0) * factor:.2f}")
        with col2:
            st.write(f"**ויטמין K (מק\"ג):** {float(food_data.get('vitamin_k', 0) or 0) * factor:.2f}")
            st.write(f"**תיאמין B1 (מ\"ג):** {float(food_data.get('thiamin', 0) or 0) * factor:.2f}")
            st.write(f"**ריבופלאבין B2 (מ\"ג):** {float(food_data.get('riboflavin', 0) or 0) * factor:.2f}")
            st.write(f"**ניאצין B3 (מ\"ג):** {float(food_data.get('niacin', 0) or 0) * factor:.2f}")
        with col3:
            st.write(f"**ויטמין B6 (מ\"ג):** {float(food_data.get('vitamin_b6', 0) or 0) * factor:.2f}")
            st.write(f"**ויטמין B12 (מק\"ג):** {float(food_data.get('vitamin_b12', 0) or 0) * factor:.2f}")
            st.write(f"**חומצה פולית (מק\"ג):** {float(food_data.get('folate', 0) or 0) * factor:.2f}")
            st.write(f"**חומצה פנטותנית (מ\"ג):** {float(food_data.get('pantothenic_acid', 0) or 0) * factor:.2f}")
    
    # Minerals
    with st.expander("⚗️ מינרלים"):
        col1, col2, col3 = st.columns(3)
        with col1:
            st.write(f"**סידן (מ\"ג):** {float(food_data.get('calcium', 0) or 0) * factor:.1f}")
            st.write(f"**ברזל (מ\"ג):** {float(food_data.get('iron', 0) or 0) * factor:.2f}")
            st.write(f"**מגנזיום (מ\"ג):** {float(food_data.get('magnesium', 0) or 0) * factor:.2f}")
            st.write(f"**זרחן (מ\"ג):** {float(food_data.get('phosphorus', 0) or 0) * factor:.2f}")
        with col2:
            st.write(f"**אשלגן (מ\"ג):** {float(food_data.get('potassium', 0) or 0) * factor:.1f}")
            st.write(f"**נתרן (מ\"ג):** {float(food_data.get('sodium', 0) or 0) * factor:.1f}")
            st.write(f"**אבץ (מ\"ג):** {float(food_data.get('zinc', 0) or 0) * factor:.2f}")
            st.write(f"**נחושת (מ\"ג):** {float(food_data.get('copper', 0) or 0) * factor:.2f}")
        with col3:
            st.write(f"**סלניום (מק\"ג):** {float(food_data.get('selenium', 0) or 0) * factor:.2f}")
            st.write(f"**מנגן (מ\"ג):** {float(food_data.get('manganese', 0) or 0) * factor:.2f}")
            st.write(f"**יוד (מק\"ג):** {float(food_data.get('iodine', 0) or 0) * factor:.2f}")
    
    # Other components
    with st.expander("📊 רכיבים נוספים"):
        col1, col2 = st.columns(2)
        with col1:
            st.write(f"**סיבים תזונתיים (גרם):** {float(food_data.get('total_dietary_fiber', 0) or 0) * factor:.2f}")
            st.write(f"**סוכרים (גרם):** {float(food_data.get('total_sugars', 0) or 0) * factor:.2f}")
            st.write(f"**לחות (גרם):** {float(food_data.get('moisture', 0) or 0) * factor:.2f}")
            st.write(f"**אלכוהול (גרם):** {float(food_data.get('alcohol', 0) or 0) * factor:.2f}")
        with col2:
            st.write(f"**קרוטן (מק\"ג):** {float(food_data.get('carotene', 0) or 0) * factor:.1f}")
            st.write(f"**כולין (מ\"ג):** {float(food_data.get('choline', 0) or 0) * factor:.2f}")
            st.write(f"**ביוטין (מק\"ג):** {float(food_data.get('biotin', 0) or 0) * factor:.2f}")

# Sidebar for navigation
page = st.sidebar.radio("בחר מצב:", ["חיפוש רגיל", "חיפוש מתקדם", "השוואת מוצרים"])

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
                        val = food_details.get(param, 0)
                        if pd.isna(val):
                            val = 0
                        product_values[param] = float(val) * factor
                    
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


# Footer
st.markdown("---")
st.caption("נתונים ממאגר משרד הבריאות")
