import json
import os
import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import roc_auc_score, confusion_matrix

# Alapértelmezés: a nyers CSV és a kimenetek a szkript mappájában.
# Felülírható: HK_SRC / HK_OUT_DIR környezeti változóval (pl. reprodukciós ellenőrzéshez másik mappába).
HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.environ.get("HK_SRC", os.path.join(HERE, "cs-training.csv"))
OUT_DIR = os.environ.get("HK_OUT_DIR", HERE)
os.makedirs(OUT_DIR, exist_ok=True)

df = pd.read_csv(SRC, index_col=0)

print("=== ALAP ===")
print("shape:", df.shape)
print("target eloszlás:\n", df["SeriousDlqin2yrs"].value_counts(normalize=True))
print("\nhiányzó értékek:\n", df.isna().sum())

print("\n=== ANOMÁLIÁK ===")
print("age==0 sorok:", (df["age"] == 0).sum())
for col in ["NumberOfTime30-59DaysPastDueNotWorse", "NumberOfTime60-89DaysPastDueNotWorse", "NumberOfTimes90DaysLate"]:
    print(col, "value_counts tail:\n", df[col].value_counts().sort_index().tail(6))

print("\nRevolvingUtilizationOfUnsecuredLines describe:\n", df["RevolvingUtilizationOfUnsecuredLines"].describe())
print("\nDebtRatio describe:\n", df["DebtRatio"].describe())

# ---- TISZTÍTÁS ----
d = df.copy()

# 1) age==0 -> egyetlen hibás sor, dobjuk
d = d[d["age"] > 0]

# 2) a 96/98 kódolt "hibás" értékek a késedelmi oszlopokban (dokumentált adatminőségi hiba
#    ebben a nyilvános datasetben) -> ezeket a sorokat kizárjuk a tréningből
late_cols = ["NumberOfTime30-59DaysPastDueNotWorse", "NumberOfTime60-89DaysPastDueNotWorse", "NumberOfTimes90DaysLate"]
bad_code_mask = (d[late_cols] >= 96).any(axis=1)
n_bad = bad_code_mask.sum()
d = d[~bad_code_mask]

# 3) MonthlyIncome hiányzó -> medián imputálás
income_median = d["MonthlyIncome"].median()
d["MonthlyIncome"] = d["MonthlyIncome"].fillna(income_median)

# 4) NumberOfDependents hiányzó -> 0 (a leggyakoribb érték)
d["NumberOfDependents"] = d["NumberOfDependents"].fillna(0)

# 5) extrém kiugró értékek limitálása (99.5. percentilis felett capping)
for col in ["RevolvingUtilizationOfUnsecuredLines", "DebtRatio", "MonthlyIncome"]:
    cap = d[col].quantile(0.995)
    d[col] = d[col].clip(upper=cap)

print("\n=== TISZTÍTÁS UTÁN ===")
print("kizárt hibás-kódú sorok (96/98):", n_bad)
print("shape tisztítás után:", d.shape)

# ---- FEATURE VÁLASZTÁS (6 változó) ----
features = [
    "RevolvingUtilizationOfUnsecuredLines",
    "age",
    "NumberOfTime30-59DaysPastDueNotWorse",
    "DebtRatio",
    "MonthlyIncome",
    "NumberOfTimes90DaysLate",
]
X = d[features].values
y = d["SeriousDlqin2yrs"].values

X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42, stratify=y)

scaler = StandardScaler()
X_train_s = scaler.fit_transform(X_train)
X_test_s = scaler.transform(X_test)

model = LogisticRegression(max_iter=1000, class_weight="balanced", random_state=42)
model.fit(X_train_s, y_train)

proba_test = model.predict_proba(X_test_s)[:, 1]
auc = roc_auc_score(y_test, proba_test)

print("\n=== MODELL EREDMÉNY ===")
print("Tanító sorok:", len(y_train), "Teszt sorok:", len(y_test))
print("Test AUC:", round(auc, 4))

thr = 0.5
pred_test = (proba_test >= thr).astype(int)
cm = confusion_matrix(y_test, pred_test)
print("Confusion matrix @0.5 threshold:\n", cm)

coef_dict = dict(zip(features, model.coef_[0]))
print("\nEgyütthatók (standardizált skálán):")
for f, c in coef_dict.items():
    print(f"  {f}: {c:+.4f}")

# ---- SZEGMENS-SZINTŰ TÖRTÉNETI DEFAULT ARÁNYOK ----
d["age_band"] = pd.cut(d["age"], bins=[0, 30, 40, 50, 60, 120], labels=["<30", "30-39", "40-49", "50-59", "60+"])
d["util_band"] = pd.cut(
    d["RevolvingUtilizationOfUnsecuredLines"],
    bins=[-0.01, 0.1, 0.3, 0.6, 1.0, 100],
    labels=["0-10%", "10-30%", "30-60%", "60-100%", "100%+"],
)
segment_rates = (
    d.groupby(["age_band", "util_band"], observed=True)["SeriousDlqin2yrs"]
    .agg(["mean", "count"])
    .reset_index()
)
segment_rates = segment_rates[segment_rates["count"] >= 30]
segment_rates["mean"] = segment_rates["mean"].round(4)

overall_rate = float(d["SeriousDlqin2yrs"].mean())
print("\nTeljes minta historikus nemteljesítési aránya:", round(overall_rate, 4))
print("Szegmensek száma (>=30 minta):", len(segment_rates))

export = {
    "meta": {
        "source_dataset": "Give Me Some Credit (Kaggle, 2011) - publikus, CC0-jellegű oktatási dataset",
        "trained_rows": int(len(y_train)),
        "test_rows": int(len(y_test)),
        "excluded_bad_code_rows": int(n_bad),
        "test_auc": round(float(auc), 4),
        "overall_default_rate": round(overall_rate, 4),
        "disclaimer": "Oktatási / demo célú, egyszerűsített modell. Nem éles hitelbírálati döntéshozatalra készült.",
    },
    "features": features,
    "scaler_mean": scaler.mean_.tolist(),
    "scaler_scale": scaler.scale_.tolist(),
    "coefficients": model.coef_[0].tolist(),
    "intercept": float(model.intercept_[0]),
    "segments": segment_rates.astype(object).where(pd.notnull(segment_rates), None).to_dict(orient="records"),
}

with open(f"{OUT_DIR}/model_export.json", "w", encoding="utf-8") as f:
    json.dump(export, f, ensure_ascii=False, indent=2, default=str)

sample = d[features + ["SeriousDlqin2yrs"]].sample(n=100, random_state=7).reset_index(drop=True)
sample.to_json(f"{OUT_DIR}/sample_portfolio.json", orient="records", indent=2)

print("\nExport kész: model_export.json, sample_portfolio.json")
