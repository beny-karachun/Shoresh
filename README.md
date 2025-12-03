# Nutrition App - מחשבון תזונתי

This application allows you to search for food items from the Israeli Ministry of Health database and calculate nutritional values based on different serving sizes.

## Files

- `setup_db.py` - Script to import CSV files into SQLite database
- `app.py` - Streamlit web application
- `requirements.txt` - Python dependencies
- `nutrition.db` - SQLite database (created by setup_db.py)

## Setup Instructions

1. Install dependencies:
```bash
pip install -r requirements.txt
```

2. Import data into database:
```bash
python setup_db.py
```

3. Run the application:
```bash
streamlit run app.py
```

## Data Files

The application uses the following CSV files from the Ministry of Health:

- `moh_mitzrachim (1).csv` - Master food list with nutritional values per 100g
- `moh_yehidot_mida.csv` - Dictionary of measurement units
- `moh_yehidot_mida_lemitzrachim.csv` - Conversion table linking foods, units, and weights

## Features

- **Search**: Search for foods in Hebrew by name
- **Unit Selection**: Choose from available units for each food (cups, spoons, portions, etc.)
- **Calculation**: Automatically calculates calories, protein, carbs, and fat based on selected amount and unit
- **Hebrew UI**: Full Hebrew interface for better usability

## Usage

1. Enter a food name in the search box (in Hebrew)
2. Select the desired food from the results
3. Choose a unit of measurement
4. Enter the amount
5. View the calculated nutritional values
