# Credit Risk Analyzer (Hitelkockázat-elemző)

A single-file web app that estimates a loan applicant's **probability of default (PD)** with an interpretable logistic regression model trained on real public credit data. It returns a decision recommendation, a credit score, an explanation of the drivers, what would change the decision, the expected loss, and a comparison with how similar borrowers actually performed. It also shows how well the model holds up on ~30,000 loans it never saw.

**Live demo:** https://milan0730.github.io/hitelkockazat-elemzo/ · **Run the test suite live:** [`?selftest`](https://milan0730.github.io/hitelkockazat-elemzo/?selftest) · **UI language:** English / Hungarian ([`?lang=en`](https://milan0730.github.io/hitelkockazat-elemzo/?lang=en))

> ⚠️ **Educational / demo project.** Not a credit decision tool, not a loan offer, not financial advice.

## Features

- **Single application:** 6-field form → calibrated PD → approve / manual review / decline, with input validation (Hungarian number formats, range checks, out-of-training-range warnings). Results **update live as you type** after the first evaluation.
- **Credit score:** the PD on a standard scorecard scale (600 points at 50:1 odds, PDO = 20), with the band cut-offs in points
- **What would change the decision (counterfactual):** the exact credit-utilization level that would move the application across the approval or decline threshold. It is solved in closed form, because the logit is linear in the feature. Only a lever the client can act on is used.
- **Expected loss (optional loan amount):** EL = PD × LGD × EAD, with the 2-year PD converted to 1-year and LGD 45% (Basel F-IRB, senior unsecured), plus the minimum risk premium
- **Printable credit memo:** a one-page A4 report with reviewer sign-off lines (print or save as PDF)
- **Explainability:** per-factor log-odds contributions (text + chart) relative to the average borrower
- **Historical benchmark:** actual default rate of the applicant's age × utilization segment, plus a 5×5 heatmap
- **Model validation on the 29,946-loan test set:** AUC, Gini, KS, a calibration chart by decile, and decision-band outcomes (aggregates only)
- **Browsable sample:** 100 real (anonymized, cleaned) borrowers **drawn only from the test set**, with model recommendation vs. actual outcome, sorting, filtering and data-quality flags
- **Formatted Excel export** (xlsx-js-style) for both views, including validation tables
- **Bilingual UI (English / Hungarian)** with locale-aware number input (5,400 vs. 5 400), language-specific Excel exports and shareable ?lang=en links
- Dark / light mode, responsive layout, no backend, no build step

## Model

| | |
|---|---|
| Data | [Give Me Some Credit](https://www.kaggle.com/c/GiveMeSomeCredit) (Kaggle, 2011), 149,730 rows after cleaning |
| Model | Logistic regression, 6 standardized features, `class_weight="balanced"` |
| Test AUC · Gini · KS | **0.839 · 0.678 · 0.524** (29,946-row hold-out set) |
| Calibration | Prior correction to the true 6.6% base rate (see finding #1 below); mean predicted 6.76% vs. actual 6.60% on the test set |
| Target | Serious delinquency (90+ days past due) within 2 years |

## Testing & QA

This project is also a case study in **systematic AI-agent testing**: it was built with an AI coding agent, and every issue found was logged in a *problem → impact → fix* format.

📄 **Read the full case study: [CASE_STUDY.md](CASE_STUDY.md)**

**Automated regression suite** ([`selftest.js`](selftest.js)): 115 tests in 10 groups (model math, thresholds and band edges, input parsing, UI validation, user flows, portfolio, Excel export, basic accessibility, language switching, and the score / counterfactual / expected-loss / live-update / memo / validation features).
- Expected values come from an **independent oracle**: they were computed outside the app (PowerShell for single PDs, numpy for the portfolio sample), not by the code under test. Counterfactual thresholds are verified by re-scoring at the suggested value.
- A **mutation check** (2 injected bugs → 14 failing tests) confirms that the suite actually catches regressions.

**Notable real findings** ([`TESZT_NAPLO.md`](TESZT_NAPLO.md), in Hungarian):
1. **Uncalibrated PD.** Balanced class weights inflated the mean predicted PD to 34.9% against a true rate of 6.6%, which would have made the planned thresholds meaningless. Fixed with a prior correction, which brings the mean to 6.9%.
2. **Mixed units in `DebtRatio`.** Where income was missing (~20% of rows), the source data stores *absolute debt* instead of a ratio (median 1,170 vs. 0.30). This is the root cause of the feature's counter-intuitive coefficient. The app flags these rows.
3. **Undocumented capping.** Training-time caps (99.5th percentile) were not exported, so they were reconstructed from the raw data and applied client-side.
4. **Misleading segment labels.** `pd.cut` bands are right-closed, so a 30-year-old fell into the "<30" band. The UI now shows the true boundaries (≤30, 31–40, …).
5. **Showcase data leakage.** The 100-loan sample portfolio was drawn from the full dataset, so ~80% of it had been used for training and made the model look better than it is. The sample now comes from the test set only, and validation metrics use all 29,946 test loans.
6. Mobile overflow, missing input warnings, and a non-reproducible training script (fixed and verified bit-for-bit).

**User testing plan:** [`TESZTELESI_TERV.md`](TESZTELESI_TERV.md) covers task-based moderated testing with acceptance criteria.

## Run locally

**Windows desktop app (recommended):** double-click **`Telepites.cmd`** once. It creates a *Hitelkockázat-elemző* shortcut with its own icon on the Desktop and in the Start menu. The shortcut opens the app in Microsoft Edge's app mode (Chrome as fallback): its own window, no address bar or browser UI, and **no internet or server needed**. All dependencies (Chart.js, xlsx-js-style, the Instrument fonts) ship in `vendor/`. Nothing is installed system-wide; `Eltavolitas.cmd` removes the two shortcuts.

**Local server:** double-click **`Inditas.cmd`** (app) or **`Tesztek_futtatasa.cmd`** (automated test suite). It starts a tiny built-in PowerShell server and opens the browser. Close the console window to stop it. If port 8080 is busy, the next free port is used.

Manually:

```powershell
powershell -ExecutionPolicy Bypass -File serve.ps1 -Open          # app
powershell -ExecutionPolicy Bypass -File serve.ps1 -Open -Test    # automated tests (?selftest)
# or, anywhere: python -m http.server 8080  → http://localhost:8080/?selftest
```

`index.html` also works opened straight from disk, including `?selftest`. On the live site, Edge and Chrome offer to install it as an app (web manifest + icons).

Third-party licenses: [`vendor/licenses/`](vendor/licenses/) (Chart.js: MIT, xlsx-js-style: Apache-2.0, Instrument Serif / Sans: SIL OFL 1.1).

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
