# =========================
# train_model.py (FINAL FIX)
# =========================

import pandas as pd
import numpy as np
import joblib

from sklearn.model_selection import train_test_split, GridSearchCV, cross_val_score
from sklearn.preprocessing import StandardScaler, OneHotEncoder, LabelEncoder
from sklearn.compose import ColumnTransformer
from sklearn.pipeline import Pipeline
from sklearn.metrics import classification_report, accuracy_score

from xgboost import XGBClassifier


# =========================
# LOAD DATA
# =========================
def load_data(path):
    return pd.read_csv(path)


# =========================
# FEATURE ENGINEERING
# =========================
def feature_engineering(df):

    # Convert to numeric safely
    df["dosage1"] = pd.to_numeric(df["dosage1"], errors="coerce")
    df["dosage2"] = pd.to_numeric(df["dosage2"], errors="coerce")

    # Fill NaNs (NO inplace)
    df["dosage1"] = df["dosage1"].fillna(0)
    df["dosage2"] = df["dosage2"].fillna(0)

    # Create features
    df["total_dosage"] = df["dosage1"] + df["dosage2"]
    df["age_dosage_ratio"] = df["age"] / (df["total_dosage"] + 1)

    df["dosage_ratio"] = df["dosage1"] / (df["dosage2"] + 1)
    df["same_class"] = (df["drug1_class"] == df["drug2_class"]).astype(int)

    return df


# =========================
# BUILD PIPELINE
# =========================
def build_pipeline(num_cols, cat_cols):

    preprocessor = ColumnTransformer([
        ("num", StandardScaler(), num_cols),
        ("cat", OneHotEncoder(handle_unknown='ignore', max_categories=5), cat_cols)
    ])

    model = Pipeline([
        ("preprocessing", preprocessor),
        ("classifier", XGBClassifier(
            eval_metric='mlogloss',
            n_estimators=300,
            max_depth=6,
            learning_rate=0.05,
            subsample=0.8,
            colsample_bytree=0.8
        ))
    ])

    return model


# =========================
# MAIN
# =========================
def main():

    df = load_data("../data/datasetnew.csv")

    print("Columns:", df.columns)

    # Feature engineering
    df = feature_engineering(df)

    # Split features/target
    X = df.drop("severity", axis=1)
    y = df["severity"]

    # 🔥 FIX: Encode labels
    label_encoder = LabelEncoder()
    y = label_encoder.fit_transform(y)

    # Save encoder (important for predict.py later)
    joblib.dump(label_encoder, "label_encoder.pkl")

    # Columns
    num_cols = ["age", "dosage1", "dosage2", "total_dosage", "age_dosage_ratio"]
    cat_cols = ["drug1", "drug2", "drug1_class", "drug2_class", "condition"]

    model = build_pipeline(num_cols, cat_cols)

    # Split
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )

    # Cross-validation
    cv_scores = cross_val_score(model, X, y, cv=5)
    print("CV Accuracy:", np.mean(cv_scores))

    # Train
    model.fit(X_train, y_train)

    # Predict
    y_pred = model.predict(X_test)

    print("\nAccuracy:", accuracy_score(y_test, y_pred))
    print("\nClassification Report:\n")
    print(classification_report(y_test, y_pred))

    # Save model
    joblib.dump(model, "medivise_model.pkl")

    print("\n✅ Model + Encoder saved successfully!")


# =========================
# ENTRY
# =========================
if __name__ == "__main__":
    main()