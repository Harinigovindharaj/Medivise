# =========================
# predict.py (FULL SYSTEM + REPORT)
# =========================

import joblib
import pandas as pd
import shap
import numpy as np
import json
from datetime import datetime


# =========================
# KNOWLEDGE BASES
# =========================

ALTERNATIVES = {
    "NSAID": ["paracetamol"],
    "Anticoagulant": ["heparin"],
    "Antiplatelet": ["aspirin"],
    "Statin": ["rosuvastatin"],
    "Antihypertensive": ["losartan"],
    "Analgesic": ["acetaminophen"],
    "Antidiabetic": ["insulin"]
}

FOOD_INTERACTIONS = {
    "aspirin": ["alcohol", "spicy food"],
    "ibuprofen": ["alcohol"],
    "paracetamol": ["alcohol"],
    "warfarin": ["leafy greens (vitamin K)", "cranberry juice"],
    "metformin": ["alcohol"],
    "amlodipine": ["grapefruit"],
    "atorvastatin": ["grapefruit"],
    "clopidogrel": ["alcohol"]
}

CLASS_FOOD_INTERACTIONS = {
    "NSAID": ["alcohol"],
    "Anticoagulant": ["vitamin K rich foods"],
    "Statin": ["grapefruit"],
    "Antiplatelet": ["alcohol"],
    "Antidiabetic": ["high sugar foods"],
    "Antihypertensive": ["high salt foods"]
}


# =========================
# LOAD MODEL
# =========================
def load_artifacts():
    model = joblib.load("medivise_model.pkl")
    label_encoder = joblib.load("label_encoder.pkl")
    return model, label_encoder


# =========================
# FEATURE ENGINEERING
# =========================
def feature_engineering(df):

    df["dosage1"] = pd.to_numeric(df["dosage1"], errors="coerce")
    df["dosage2"] = pd.to_numeric(df["dosage2"], errors="coerce")

    df["dosage1"] = df["dosage1"].fillna(0)
    df["dosage2"] = df["dosage2"].fillna(0)

    df["total_dosage"] = df["dosage1"] + df["dosage2"]
    df["age_dosage_ratio"] = df["age"] / (df["total_dosage"] + 1)

    return df


# =========================
# PREDICT
# =========================
def predict(model, label_encoder, input_df):

    pred_encoded = model.predict(input_df)[0]
    prediction = label_encoder.inverse_transform([pred_encoded])[0]

    probs = model.predict_proba(input_df)[0]
    prob_dict = dict(zip(label_encoder.classes_, probs))

    risk_score = prob_dict.get("high", max(probs))

    return pred_encoded, prediction, risk_score, prob_dict


# =========================
# ALTERNATIVES
# =========================
def suggest_alternatives(input_data, risk_score):

    if risk_score < 0.5:
        return ["No safer alternative needed"]

    suggestions = []

    for drug, cls in [(input_data["drug1"], input_data["drug1_class"]),
                      (input_data["drug2"], input_data["drug2_class"])]:

        if cls in ALTERNATIVES:
            suggestions.append(f"Replace {drug} with {ALTERNATIVES[cls][0]}")

    return suggestions


# =========================
# FOOD INTERACTIONS
# =========================
def check_food_interactions(input_data):

    warnings = set()

    for drug in [input_data["drug1"], input_data["drug2"]]:
        if drug in FOOD_INTERACTIONS:
            warnings.update(FOOD_INTERACTIONS[drug])

    for cls in [input_data["drug1_class"], input_data["drug2_class"]]:
        if cls in CLASS_FOOD_INTERACTIONS:
            warnings.update(CLASS_FOOD_INTERACTIONS[cls])

    return list(warnings)


# =========================
# SHAP + HUMAN EXPLANATION
# =========================
def explain_prediction(model, input_df, pred_class_index):

    xgb_model = model.named_steps["classifier"]
    preprocessor = model.named_steps["preprocessing"]

    X_transformed = preprocessor.transform(input_df)
    feature_names = preprocessor.get_feature_names_out()

    explainer = shap.Explainer(xgb_model)
    shap_values = explainer(X_transformed)

    shap_single = shap_values[0, pred_class_index]

    contributions = [
        (n, float(v))
        for n, v in zip(feature_names, shap_single.values)
        if abs(v) > 1e-6
    ]

    contributions = sorted(contributions, key=lambda x: abs(x[1]), reverse=True)

    return contributions


# =========================
# MEDICAL REPORT
# =========================
def generate_report(input_data, prediction, risk_score, contributions, alternatives, foods):

    print("\n📄 MEDICAL RISK REPORT")
    print("=" * 40)

    print(f"Patient Age: {input_data['age']}")
    print(f"Condition: {input_data['condition']}")
    print(f"Drugs: {input_data['drug1']} + {input_data['drug2']}")

    print("\n🔍 Risk Assessment:")
    print(f"Severity: {prediction}")
    print(f"High Risk Probability: {round(risk_score, 3)}")

    print("\n🧠 Key Factors:")
    for name, val in contributions[:5]:
        print(f"- {name} ({round(val,3)})")

    print("\n💊 Suggested Alternatives:")
    for alt in alternatives:
        print("-", alt)

    print("\n🍽️ Foods to Avoid:")
    for food in foods:
        print("-", food)

    print("=" * 40)


# =========================
# MAIN
# =========================
def main():

    model, label_encoder = load_artifacts()

    sample_input = {
        "drug1": "aspirin",
        "drug2": "ibuprofen",
        "drug1_class": "NSAID",
        "drug2_class": "NSAID",
        "age": 5,
        "condition": "hypertension",
        "dosage1": 500,
        "dosage2": 200
    }

    input_df = pd.DataFrame([sample_input])
    input_df = feature_engineering(input_df)

    pred_encoded, prediction, risk_score, prob_dist = predict(
        model, label_encoder, input_df
    )

    print("\n🔍 Prediction Result")
    print("----------------------")
    print("Predicted Severity:", prediction)
    print("Risk Score (High):", round(risk_score, 3))
    print("Class Probabilities:", prob_dist)

    # SHAP explanation
    contributions = explain_prediction(model, input_df, pred_encoded)

    # Alternatives
    alternatives = suggest_alternatives(sample_input, risk_score)

    # Food interactions
    foods = check_food_interactions(sample_input)

    # Final report
    generate_report(sample_input, prediction, risk_score, contributions, alternatives, foods)


# =========================
# ENTRY
# =========================
if __name__ == "__main__":
    main()