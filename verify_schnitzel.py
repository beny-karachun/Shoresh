import sqlite3
import pandas as pd

def safe_print(s):
    try:
        print(s)
    except:
        print(s.encode('ascii', 'replace').decode('ascii'))

def verify_schnitzel():
    conn = sqlite3.connect('nutrition.db')
    
    # 1. Find the correct code for Soy Oil
    print("Searching for Soy Oil in products...")
    soy_oil = pd.read_sql_query("SELECT Code, shmmitzrach FROM products WHERE shmmitzrach LIKE '%שמן%' AND shmmitzrach LIKE '%סויה%'", conn)
    soy_oil_code = None
    if not soy_oil.empty:
        print("Found Soy Oil candidates:")
        for _, row in soy_oil.iterrows():
            safe_print(f"Code: {row['Code']} | Name: {row['shmmitzrach']}")
        
        # Pick the most generic one or first one
        soy_oil_code = soy_oil.iloc[0]['Code']
        print(f"Using Soy Oil Code: {soy_oil_code}")
    else:
        print("No Soy Oil found in products! Searching for ANY oil...")
        any_oil = pd.read_sql_query("SELECT Code, shmmitzrach FROM products WHERE shmmitzrach LIKE 'שמן%' LIMIT 5", conn)
        for _, row in any_oil.iterrows():
            safe_print(f"Code: {row['Code']} | Name: {row['shmmitzrach']}")
            if soy_oil_code is None: soy_oil_code = row['Code']

    # 2. Find any Schnitzel recipe that has components
    print("\nSearching for valid Schnitzel recipes...")
    schnitzels = pd.read_sql_query("SELECT Code, shmmitzrach FROM products WHERE shmmitzrach LIKE '%שניצל%'", conn)
    
    target_code = None
    
    if not schnitzels.empty:
        for _, row in schnitzels.iterrows():
            code = row['Code']
            # Check if it has recipe rows
            chk = pd.read_sql_query("SELECT count(*) FROM recipes WHERE mmitzrach = ?", conn, params=(float(code),))
            count = chk.iloc[0,0]
            if count > 0:
                safe_print(f"FOUND VALID RECIPE! Code: {code} | Name: {row['shmmitzrach']} | Components: {count}")
                target_code = code
                break
            else:
                pass # safe_print(f"Product {code} has no recipe.")
    
    if target_code is None:
        print("No Schnitzel recipes found with components. Searching for ANY recipe using the Oil found above...")
        q = "SELECT DISTINCT mmitzrach FROM recipes WHERE mitzbsisi = ? LIMIT 1"
        res = pd.read_sql_query(q, conn, params=(float(soy_oil_code),))
        if not res.empty:
            target_code = res.iloc[0]['mmitzrach']
            print(f"Found generic recipe using oil: {target_code}")
        else:
             print("Critical: No recipes found using the selected oil.")
             return

    # 3. Analyze the found recipe
    print(f"\n=== Analyzing Recipe {target_code} (Type: {type(target_code)}) ===")
    
    # Debug: Check if simple select works
    chk = pd.read_sql_query("SELECT count(*) FROM recipes WHERE mmitzrach = ?", conn, params=(target_code,))
    print(f"Count of rows for {target_code}: {chk.iloc[0,0]}")

    query = """
    SELECT r.mmitzrach, r.mitzbsisi, r.mishkal, r.retention, r.ahuz, p.shmmitzrach
    FROM recipes r
    LEFT JOIN products p ON r.mitzbsisi = p.Code
    WHERE r.mmitzrach = ?
    """
    
    df = pd.read_sql_query(query, conn, params=(target_code,))
    print(f"Dataframe shape: {df.shape}")
    # if not df.empty:
    #    print(df.head())
    
    total_weight = 0
    total_oil = 0
    oil_details = None
    
    for _, row in df.iterrows():
        weight = row['mishkal']
        total_weight += weight
        
        ing_code = row['mitzbsisi']
        ing_name = row['shmmitzrach']
        is_oil = 'שמן' in str(ing_name) or ing_code == 82108000
        
        if is_oil:
            total_oil += weight
            oil_details = row
            
        safe_print(f"Ing: {ing_code} ({ing_name}) | Weight: {weight} | Retention: {row['retention']} | Ahuz: {row['ahuz']} | IsOil: {is_oil}")

    print("-" * 50)
    print(f"Total Weight according to DB sum: {total_weight}")
    
    if oil_details is not None:
        print("\n=== Oil Analysis ===")
        print(f"Oil Weight: {oil_details['mishkal']}")
        print(f"Oil Ahuz (Factor): {oil_details['ahuz']}")
        print(f"Oil Retention: {oil_details['retention']}")
        
        # Check logic
        # Is oil weight = Ahuz % of (Total Weight - Oil Weight)?
        # Or Ahuz % of Total Weight?
        
        base_weight = total_weight - oil_details['mishkal']
        if base_weight > 0:
            calc_from_base = (oil_details['mishkal'] / base_weight) * 100
            print(f"Oil as % of Base (Total-Oil): {calc_from_base:.2f}%")
            
        calc_from_total = (oil_details['mishkal'] / total_weight) * 100
        print(f"Oil as % of Total: {calc_from_total:.2f}%")
        
    conn.close()

if __name__ == "__main__":
    verify_schnitzel()
