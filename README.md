# Credit Risk Analyzer (Hitelkockázat-elemző)

A single-file web app that estimates a loan applicant's **probability of default (PD)** with an interpretable logistic regression model trained on real public credit data. It returns a decision recommendation, an explanation of the drivers, and a comparison with how similar borrowers actually performed.

**Live demo:** https://milan0730.github.io/hitelkockazat-elemzo/ · **Run the test suite live:** [`?selftest`](https://milan0730.github.io/hitelkockazat-elemzo/?selftest) · **UI language:** Hungarian

> ⚠️ **Educational / demo project.** Not a credit decision tool, not a loan offer, not financial advice.

## Features

- **Single application:** 6-field form → calibrated PD → approve / manual review / decline, with input validation (Hungarian number formats, range checks, out-of-training-range warnings)
- **Explainability:** per-factor log-odds contributions (text + chart) relative to the average borrower
- **Historical benchmark:** actual default rate of the applicant's age × utilization segment, plus a 5×5 heatmap
- **Sample portfolio:** 100 real (anonymized, cleaned) borrowers, with model recommendation vs. actual outcome, sorting, filtering and data-quality flags
- **Formatted Excel export** (xlsx-js-style) for both views
- Dark / light mode, responsive layout, no backend, no build step

## Model

| | |
|---|---|
| Data | [Give Me Some Credit](https://www.kaggle.com/c/GiveMeSomeCredit) (Kaggle, 2011), 149,730 rows after cleaning |
| Model | Logistic regression, 6 standardized features, `class_weight="balanced"` |
| Test AUC | **0.839** (29,946-row hold-out set) |
| Calibration | Prior correction to the true 6.6% base rate (see finding #1 below) |
| Target | Serious delinquency (90+ days past due) within 2 years |

## Testing & QA

This project is also a case study in **systematic AI-agent testing**: it was built with an AI coding agent, and every issue found was logged in a *problem → impact → fix* format.

📄 **Read the full case study: [CASE_STUDY.md](CASE_STUDY.md)**

**Automated regression suite** ([`selftest.js`](selftest.js)): 77 tests in 8 groups (model math, thresholds and band edges, input parsing, UI validation, user flows, portfolio, Excel export, basic accessibility).
- Expected values come from an **independent oracle**: they were computed outside the app (PowerShell), not by the code under test.
- A **mutation check** (2 injected bugs → 14 failing tests) confirms that the suite actually catches regressions.

**Notable real findings** ([`TESZT_NAPLO.md`](TESZT_NAPLO.md), in Hungarian):
1. **Uncalibrated PD.** Balanced class weights inflated the mean predicted PD to 34.9% against a true rate of 6.6%, which would have made the planned thresholds meaningless. Fixed with a prior correction, which brings the mean to 6.9%.
2. **Mixed units in `DebtRatio`.** Where income was missing (~20% of rows), the source data stores *absolute debt* instead of a ratio (median 1,170 vs. 0.30). This is the root cause of the feature's counter-intuitive coefficient. The app flags these rows.
3. **Undocumented capping.** Training-time caps (99.5th percentile) were not exported, so they were reconstructed from the raw data and applied client-side.
4. **Misleading segment labels.** `pd.cut` bands are right-closed, so a 30-year-old fell into the "<30" band. The UI now shows the true boundaries (≤30, 31–40, …).
5. Mobile overflow, missing input warnings, and a non-reproducible training script (fixed and verified bit-for-bit).

**User testing plan:** [`TESZTELESI_TERV.md`](TESZTELESI_TERV.md) covers task-based moderated testing with acceptance criteria.

## Run locally

Open `index.html` directly in a browser (internet access is needed for the Chart.js and xlsx-js-style CDNs).

To run the automated tests, serve the folder over HTTP:

```powershell
powershell -ExecutionPolicy Bypass -File serve.ps1   # or: python -m http.server 8080
```

Then open `http://localhost:8080/?selftest`.

## Reproduce the model

1. Download `cs-training.csv` from the [Kaggle competition](https://www.kaggle.com/c/GiveMeSomeCredit/data) into this folder. It is not included in the repo for licensing reasons.
2. Run the training script:

```powershell
python -m venv .venv
.venv\Scripts\python -m pip install -r requirements.txt
.venv\Scripts\python explore_and_train.py
```

This regenerates `model_export.json` and `sample_portfolio.json`. The app embeds a copy of both, so update `index.html` if they change.

## Project structure

| File | Purpose |
|---|---|
| `index.html` | The entire app (HTML/CSS/JS, model and sample data embedded) |
| `selftest.js` | Automated regression tests (loaded only with `?selftest`) |
| `serve.ps1` | Minimal local web server (PowerShell, no dependencies) |
| `explore_and_train.py` | Data cleaning, model training and export |
| `model_export.json`, `sample_portfolio.json` | Model parameters, segment default rates, 100-row sample |
| `CASE_STUDY.md` | AI-agent testing case study (English) |
| `TESZT_NAPLO.md` | Test & fix log (problem → impact → fix) |
| `TESZTELESI_TERV.md` | Test plan (automated + user testing) |
| `HALADAS.md` | Progress log |

## Author

György Milán Tóth
