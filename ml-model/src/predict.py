# =========================
# predict.py (FINAL STABLE VERSION)
# =========================

import joblib
import pandas as pd
import shap
import numpy as np


# =========================
# LOAD MODEL + ENCODER
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
# PREPARE INPUT
# =========================
def prepare_input(data_dict):

    df = pd.DataFrame([data_dict])
    df = feature_engineering(df)

    return df


# =========================
# PREDICT
# =========================
def predict(model, label_encoder, input_df):

    pred_encoded = model.predict(input_df)[0]
    prediction = label_encoder.inverse_transform([pred_encoded])[0]

    probs = model.predict_proba(input_df)[0]
    class_labels = label_encoder.classes_
    prob_dict = dict(zip(class_labels, probs))

    risk_score = prob_dict.get("high", max(probs))

    return pred_encoded, prediction, risk_score, prob_dict


# =========================
# HUMAN-FRIENDLY EXPLANATION
# =========================
def generate_human_explanation(feature_contributions):

    explanations = []

    for name, val in feature_contributions[:5]:

        if "dosage" in name and val > 0:
            explanations.append("Higher dosage is increasing interaction risk")

        elif "drug1_class" in name or "drug2_class" in name:
            if val > 0:
                explanations.append("Drug class combination increases interaction severity")

        elif "drug1_" in name or "drug2_" in name:
            if val > 0:
                explanations.append("Specific drug combination contributes to higher risk")

        elif "age" in name:
            if val > 0:
                explanations.append("Patient age increases risk slightly")
            else:
                explanations.append("Patient age slightly reduces risk")

    return list(set(explanations))


# =========================
# SHAP EXPLANATION (FINAL FIXED)
# =========================
def explain_prediction(model, input_df, pred_class_index):

    xgb_model = model.named_steps["classifier"]
    preprocessor = model.named_steps["preprocessing"]

    # Transform input
    X_transformed = preprocessor.transform(input_df)
    feature_names = preprocessor.get_feature_names_out()

    # SHAP
    explainer = shap.Explainer(xgb_model)
    shap_values = explainer(X_transformed)

    shap_single = shap_values[0, pred_class_index]

    # Fix base value (multi-class)
    base_value = shap_values.base_values[0][pred_class_index]

    # Convert sparse → dense
    if hasattr(X_transformed, "toarray"):
        data_row = X_transformed.toarray()[0]
    else:
        data_row = X_transformed[0]

    # Create proper explanation object
    shap_fixed = shap.Explanation(
        values=shap_single.values,
        base_values=base_value,
        data=data_row,
        feature_names=feature_names
    )

    # =========================
    # VISUAL PLOT
    # =========================
    shap.plots.waterfall(shap_fixed)

    # =========================
    # CLEAN FEATURE CONTRIBUTIONS
    # =========================
    feature_contributions = list(zip(feature_names, shap_single.values))

    # Remove near-zero values (IMPORTANT FIX)
    feature_contributions = [
        (n, v) for n, v in feature_contributions if abs(v) > 1e-6
    ]

    # Sort properly
    feature_contributions = sorted(
        feature_contributions, key=lambda x: abs(x[1]), reverse=True
    )

    # =========================
    # DEBUG (REAL FEATURES)
    # =========================
    print("\n🔍 Top RAW SHAP features:")
    for name, val in feature_contributions[:10]:
        print(name, round(val, 4))

    # =========================
    # TECHNICAL OUTPUT
    # =========================
    print("\n🔬 Top contributing features:")
    for name, val in feature_contributions[:10]:
        impact = "↑ increases risk" if val > 0 else "↓ decreases risk"
        print(f"{name}: {round(val, 4)} ({impact})")

    # =========================
    # HUMAN EXPLANATION
    # =========================
    human_explanations = generate_human_explanation(feature_contributions)

    print("\n🧠 Human-readable explanation:")
    for exp in human_explanations:
        print(f"- {exp}")


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
        "age": 45,
        "condition": "hypertension",
        "dosage1": 100,
        "dosage2": 200
    }

    input_df = prepare_input(sample_input)

    pred_encoded, prediction, risk_score, prob_dist = predict(
        model, label_encoder, input_df
    )

    print("\n🔍 Prediction Result")
    print("----------------------")
    print("Predicted Severity:", prediction)
    print("Risk Score (High):", round(risk_score, 3))
    print("Class Probabilities:", prob_dist)

    # Explanation
    explain_prediction(model, input_df, pred_encoded)


# =========================
# ENTRY
# =========================
if __name__ == "__main__":
    main()