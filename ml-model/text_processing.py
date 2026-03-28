import re

NOISE_WORDS = {
    "tab", "tablet", "cap", "capsule",
    "mg", "ml", "g",
    "take", "once", "twice", "daily",
    "after", "before", "food",
    "morning", "night",
    "bd", "od", "tid"
}

COMMON_NON_DRUGS = {
    "adobe", "stock", "medical", "centre", "street",
    "new", "york", "usa", "name", "example",
    "signature", "refill", "label", "doctor"
}


def extract_drug_candidates(ocr_words):
    """
    ⚠️ DO NOT over-filter here
    Just clean + remove obvious junk
    """

    drugs = []

    for w in ocr_words:
        word = w["word"].lower()

        # Clean word
        word = re.sub(r'[^a-zA-Z]', '', word)

        if len(word) <= 3:
            continue

        if word in NOISE_WORDS:
            continue

        if word in COMMON_NON_DRUGS:
            continue

        drugs.append({
            "word": word,
            "confidence": w["confidence"]
        })

    return drugs