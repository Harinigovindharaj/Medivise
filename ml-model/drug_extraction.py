from rapidfuzz import fuzz
import re

DRUG_LIST = [
    "paracetamol", "calpol",
    "amoxicillin",
    "ibuprofen",
    "aspirin",
    "metformin",
    "atorvastatin",
    "omeprazole",
    "pantoprazole",
    "azithromycin",
    "cetirizine",
    "delcon",
    "levolin",
    "meftal",
    "betaloc",
    "dorzolamidum",
    "cimetidine",
    "oxprelol"
]


def extract_drugs_fuzzy(text, threshold=70):
    """
    Takes cleaned text → returns matched real drugs
    """

    # 🔥 Clean locally (instead of importing)
    text = text.lower()
    text = re.sub(r'[^a-zA-Z\s]', ' ', text)
    words = text.split()

    found = {}

    for word in words:

        if len(word) < 4:
            continue

        best_match = None
        best_score = 0

        for drug in DRUG_LIST:
            score = fuzz.ratio(word, drug)

            if score > best_score:
                best_score = score
                best_match = drug

        if best_score >= threshold:
            if best_match not in found or best_score > found[best_match]["confidence"]:
                found[best_match] = {
                    "input": word,
                    "drug": best_match,
                    "confidence": best_score
                }

    return list(found.values())