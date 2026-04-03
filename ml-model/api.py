from fastapi import FastAPI
import pandas as pd
import joblib

from predict import (
    feature_engineering,
    predict,
    suggest_alternatives,
    check_food_interactions,
    explain_prediction
)

app = FastAPI()

# Load once
model = joblib.load("medivise_model.pkl")
label_encoder = joblib.load("label_encoder.pkl")


@app.post("/analyze")
def analyze(data: dict):
    try:
        input_df = pd.DataFrame([data])
        input_df = feature_engineering(input_df)

        pred_encoded, prediction, risk_score, prob_dist = predict(
            model, label_encoder, input_df
        )

        contributions = explain_prediction(model, input_df, pred_encoded)
        contributions = [(str(name), float(val)) for name, val in contributions]

        alternatives = suggest_alternatives(data, risk_score)
        foods = check_food_interactions(data)

        return {
            "severity": str(prediction),
            "risk_score": float(risk_score),
            "probabilities": {k: float(v) for k, v in prob_dist.items()},

            "factors": contributions,
            "alternatives": alternatives,
            "food_warnings": foods
        }

    except Exception as e:
        print("ERROR:", e)
        return {"error": str(e)}