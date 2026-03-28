from sklearn.feature_extraction.text import TfidfVectorizer

def preprocess_data(df):
    df["drug_pair"] = df["drug1"] + " " + df["drug2"]

    vectorizer = TfidfVectorizer()
    X = vectorizer.fit_transform(df["drug_pair"])

    y = df["severity"]

    return X, y, vectorizer