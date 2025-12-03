import sqlite3
import pandas as pd
import os

def clean_column_names(df):
    """Clean column names by removing quotes and special characters"""
    df.columns = df.columns.str.strip().str.replace('"', '').str.replace("'", '')
    return df

def read_csv_with_encoding(file_path):
    """Try reading CSV with different encodings"""
    encodings = ['utf-8', 'windows-1255', 'iso-8859-8']
    
    for encoding in encodings:
        try:
            print(f"Trying to read {file_path} with encoding: {encoding}")
            df = pd.read_csv(file_path, encoding=encoding)
            df = clean_column_names(df)
            print(f"Successfully read {file_path} with {encoding}")
            return df
        except UnicodeDecodeError:
            print(f"Failed with {encoding}, trying next...")
            continue
        except Exception as e:
            print(f"Error with {encoding}: {e}")
            continue
    
    raise Exception(f"Could not read {file_path} with any encoding")

def setup_database():
    """Import CSV files into SQLite database"""
    
    # Database file
    db_path = 'nutrition.db'
    
    # Remove existing database if it exists
    if os.path.exists(db_path):
        os.remove(db_path)
        print(f"Removed existing database: {db_path}")
    
    # Create connection
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    try:
        # Read CSV files - note the actual file name with (1)
        print("\n=== Reading Products File ===")
        products_df = read_csv_with_encoding('moh_mitzrachim (1).csv')
        
        print("\n=== Reading Units File ===")
        units_df = read_csv_with_encoding('moh_yehidot_mida.csv')
        
        print("\n=== Reading Conversions File ===")
        conversions_df = read_csv_with_encoding('moh_yehidot_mida_lemitzrachim.csv')
        
        # Create tables and import data
        print("\n=== Creating Products Table ===")
        products_df.to_sql('products', conn, if_exists='replace', index=False)
        print(f"Imported {len(products_df)} products")
        
        print("\n=== Creating Units Table ===")
        units_df.to_sql('units', conn, if_exists='replace', index=False)
        print(f"Imported {len(units_df)} units")
        
        print("\n=== Creating Conversions Table ===")
        conversions_df.to_sql('conversions', conn, if_exists='replace', index=False)
        print(f"Imported {len(conversions_df)} conversion records")
        
        # Create indexes for better performance
        print("\n=== Creating Indexes ===")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_products_code ON products(Code)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_units_smlmida ON units(smlmida)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_conv_mmitzrach ON conversions(mmitzrach)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_conv_mida ON conversions(mida)")
        
        conn.commit()
        
        print("\n=== Database Setup Complete! ===")
        print(f"Database created: {db_path}")
        print(f"Tables: products, units, conversions")
        
        # Display sample counts (avoid printing Hebrew to console)
        print("\n=== Sample Data Info ===")
        print(f"Products columns: {list(products_df.columns[:5])}...")
        print(f"Units columns: {list(units_df.columns)}")
        print(f"Conversions columns: {list(conversions_df.columns)}")
        
    except Exception as e:
        print(f"Error during database setup: {e}")
        raise
    finally:
        conn.close()

if __name__ == "__main__":
    setup_database()
