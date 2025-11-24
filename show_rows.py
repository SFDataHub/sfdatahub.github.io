import csv
from pathlib import Path
rows=list(csv.reader(Path("current_records.csv").read_text().splitlines()))
for i,row in enumerate(rows[:30]):
    print(i,row)

