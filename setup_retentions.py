import sqlite3
import pandas as pd
import os

def setup_retentions_table():
    """Add retentions table to the existing nutrition database"""
    
    db_path = 'nutrition.db'
    retentions_file = 'retentions_2026_01_21_10_36_11.xls'
    
    # Check if database exists
    if not os.path.exists(db_path):
        print(f"Error: Database {db_path} not found. Run setup_db.py first.")
        return False
    
    # Read the retentions file (it's actually a UTF-16 TSV file)
    print(f"Reading {retentions_file}...")
    try:
        df = pd.read_csv(retentions_file, sep='\t', encoding='utf-16')
        print(f"Successfully read {len(df)} retention records")
    except Exception as e:
        print(f"Error reading file: {e}")
        return False
    
    # Connect to database
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    try:
        # Drop existing table if it exists
        cursor.execute("DROP TABLE IF EXISTS retentions")
        
        # Create the retentions table with the retention data
        df.to_sql('retentions', conn, if_exists='replace', index=False)
        print(f"Created retentions table with {len(df)} records")
        
        # Create index on retention_code for faster lookups
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_retentions_code ON retentions(retention_code)")
        print("Created index on retention_code")
        
        conn.commit()
        
        # Verify the data
        cursor.execute("SELECT COUNT(*) FROM retentions")
        count = cursor.fetchone()[0]
        print(f"\nVerification: {count} records in retentions table")
        
        # Show sample data
        cursor.execute("SELECT retention_code, retention_name, hebrew_name FROM retentions LIMIT 5")
        print("\nSample data:")
        for row in cursor.fetchall():
            print(f"  Code: {row[0]}, Name: {row[1]}, Hebrew: {row[2]}")
        
        print("\n=== Retentions table setup complete! ===")
        return True
        
    except Exception as e:
        print(f"Error setting up retentions table: {e}")
        conn.rollback()
        return False
    finally:
        conn.close()

if __name__ == "__main__":
    setup_retentions_table()
