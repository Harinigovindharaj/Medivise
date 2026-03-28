import os
import pandas as pd
from itertools import combinations
from datetime import datetime
import json

from ocr import extract_text_with_confidence
from text_processing import extract_drug_candidates
from drug_extraction import extract_drugs_fuzzy

from predict import (
    predict,
    feature_engineering,
    load_artifacts,
    explain_prediction,
    suggest_alternatives,
    check_food_interactions,
    generate_report
)


def log_prediction(log_data):
    with open("ml_logs.json", "a") as f:
        f.write(json.dumps(log_data) + "\n")


def predict_interactions(drugs):

    if len(drugs) < 2:
        return []

    model, label_encoder = load_artifacts()
    results = []

    pairs = list(combinations(drugs, 2))
    best_result = None

    for d1, d2 in pairs:

        input_data = {
            "drug1": d1,
            "drug2": d2,
            "drug1_class": "NSAID",
            "drug2_class": "NSAID",
            "age": 30,
            "condition": "general",
            "dosage1": 500,
            "dosage2": 200
        }

        input_df = pd.DataFrame([input_data])
        input_df = feature_engineering(input_df)

        pred_encoded, prediction, risk_score, prob_dist = predict(
            model, label_encoder, input_df
        )

        contributions = explain_prediction(model, input_df, pred_encoded)
        alternatives = suggest_alternatives(input_data, risk_score)
        foods = check_food_interactions(input_data)

        result = {
            "drug1": d1,
            "drug2": d2,
            "severity": prediction,
            "confidence": float(risk_score),
            "alternatives": alternatives,
            "food_warnings": foods,
            "top_factors": contributions[:5]
        }

        results.append(result)

        # Keep best interaction
        if best_result is None or risk_score > best_result["risk_score"]:
            best_result = {
                "input_data": input_data,
                "prediction": prediction,
                "risk_score": risk_score,
                "contributions": contributions,
                "alternatives": alternatives,
                "foods": foods
            }

        log_prediction({
            "timestamp": str(datetime.now()),
            "input_pair": [d1, d2],
            "prediction": prediction,
            "confidence": float(risk_score),
            "model_version": "v1"
        })

    # PRINT ONLY ONE REPORT
    if best_result:
        generate_report(
            best_result["input_data"],
            best_result["prediction"],
            best_result["risk_score"],
            best_result["contributions"],
            best_result["alternatives"],
            best_result["foods"]
        )

    return results


def run_pipeline(image_path):

    # Step 1: OCR
    ocr_words = extract_text_with_confidence(image_path)

    # Step 2: LIGHT CLEANING (no filtering by confidence)
    candidates = extract_drug_candidates(ocr_words)

    # Step 3: Convert to text
    text = " ".join([d["word"] for d in candidates])

    # Step 4: 🔥 FUZZY MATCH (MAIN FILTER)
    fuzzy_drugs = extract_drugs_fuzzy(text, threshold=70)

    # Step 5: Extract names
    drugs = [d["drug"] for d in fuzzy_drugs]

    # Step 6: Predict
    interactions = predict_interactions(drugs)

    return {
        "drugs": fuzzy_drugs,
        "interactions": interactions
    }


if __name__ == "__main__":
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))
    image_path = os.path.join(BASE_DIR, "prescription", "handwritten.jpg")

    if os.path.isfile(image_path):
        result = run_pipeline(image_path)
        print(json.dumps(result, indent=4))
    else:
        raise ValueError(f"Image not found at path: {image_path}")