# ocr.py

import cv2
import pytesseract
from pytesseract import Output
import os


def extract_text(image_path):
    """
    Existing function (unchanged)
    Returns plain extracted text
    """
    img = cv2.imread(image_path)

    if img is None:
        raise ValueError(f"Image not found at path: {image_path}")

    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

    text = pytesseract.image_to_string(gray)

    return text


def extract_text_with_confidence(image_path, threshold=80):
    """
    Returns word-level data with confidence and uncertainty flag
    """
    img = cv2.imread(image_path)

    if img is None:
        raise ValueError(f"Image not found at path: {image_path}")

    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

    data = pytesseract.image_to_data(gray, output_type=Output.DICT)

    words = []

    for i in range(len(data["text"])):
        word = data["text"][i].strip()

        try:
            conf = int(data["conf"][i])
        except:
            conf = -1

        if word != "":
            words.append({
                "word": word,
                "confidence": conf,
                "uncertain": conf < threshold
            })

    return words


# 🔹 Test block (no hardcoding)
if __name__ == "__main__":
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))
    image_path = os.path.join(BASE_DIR, "prescription", "handwritten.jpg")

    print("----- Plain Text -----")
    print(extract_text(image_path))

    print("\n----- With Confidence -----")
    result = extract_text_with_confidence(image_path)
    for w in result:
        print(w)