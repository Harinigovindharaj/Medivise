import sys
import json

from ocr import extract_text_with_confidence
from text_processing import extract_drug_candidates
from drug_extraction import extract_drugs_fuzzy

image_path = sys.argv[1]

words = extract_text_with_confidence(image_path)
candidates = extract_drug_candidates(words)

text = " ".join([w["word"] for w in candidates])

drugs = extract_drugs_fuzzy(text)

# return only names
result = [d["drug"] for d in drugs]

print(json.dumps(result))