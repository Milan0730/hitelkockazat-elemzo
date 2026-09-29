# Case Study: Testing an AI-Built Credit Risk App

**Project:** [Credit Risk Analyzer](https://milan0730.github.io/hitelkockazat-elemzo/) · **Author:** György Milán Tóth · **Period:** September 2026
**Status:** Automated and exploratory testing complete. Moderated user testing in progress (section 6).

---

## TL;DR

I built a credit risk web app with an AI coding agent (Claude) as the implementer. My role was to scope the product, make the decisions, and validate every result. The code worked and the model scored well (AUC 0.839), yet **systematic testing surfaced 8 real defects**, including one that made every displayed probability **~5× too high** without affecting any headline metric.

| | |
|---|---|
| Defects found and fixed | **8** (1 critical, 3 high, 3 medium, 1 low) |
| Automated regression tests | **115**, in 10 groups, run against an **independent oracle** |
| Test-suite effectiveness | **2/2 injected bugs caught**, 14 tests failed on mutation |
| Model reproducibility | re-trained on a different stack, results **bit-identical** (≤ 1.1·10⁻¹⁵) |
| Live suite | [`?selftest`](https://milan0730.github.io/hitelkockazat-elemzo/?selftest): 115/115 on the deployed site |

## 1. Context

- **Product:** a single-file web app that estimates the probability of default (PD) for a loan applicant. It explains the drivers, shows what would change the decision, estimates the expected loss, benchmarks the applicant against real historical segments, validates the model on the 29,946-loan test set, and offers a 100-borrower browsable sample, a printable credit memo and Excel export.
- **Data and model:** *Give Me Some Credit* (Kaggle, 150k borrowers). Logistic regression on 6 features, with balanced class weights.
- **Division of labour:** the AI agent wrote the code, the training script and the documentation, and carried out most hands-on test execution. I defined the scope and the acceptance criteria, directed what to verify, reviewed the evidence, and decided how each finding was handled. In this report, "I" refers to that directed and verified work.
- **This is my second AI-agent test report.** It uses the same *problem → impact → fix* method as my earlier investment-tracker case study.

## 2. Test Approach

Three layers, each designed to catch what the others miss:

| Layer | What it catches | How |
|---|---|---|
| **A. Automated regression** | calculation errors, regressions after changes | 115 browser tests; expected values computed **outside the app** (PowerShell, numpy), so the code is never checked against itself; boundary values at every threshold; the suite's own quality verified with **mutation testing** |
| **B. Exploratory / agent testing** | wrong assumptions, data issues, UX defects | questioning outputs against ground truth, reproducing pipeline steps from raw data, device and edge-case sweeps |
| **C. Moderated user testing** | comprehension and usability | 3–5 non-technical testers, 7 task-based scenarios, success criteria and a questionnaire ([test plan](TESZTELESI_TERV.md)) |

**Acceptance criteria (excerpt):** 100% of oracle tests pass · 0 crashes on invalid input · a non-technical user completes the core task unaided in ≤ 5 minutes · the demo/educational nature is understood by every tester.

## 3. Findings

| # | Finding | Severity | Found by | Status |
|---|---|---|---|---|
| F1 | Displayed PD ~5× too high (uncalibrated) | 🔴 Critical | B: output vs. ground truth | ✅ Fixed |
| F2 | `DebtRatio` mixes two units (ratio vs. absolute debt) | 🟠 High | B: data profiling | ✅ Mitigated in UI; model fix proposed |
| F3 | Training-time input caps missing from the app | 🟠 High | B: pipeline reproduction | ✅ Fixed |
| F4 | Training script not reproducible outside the agent's sandbox | 🟠 High | B: re-run on own machine | ✅ Fixed and verified |
| F5 | Age-band labels contradict the real boundaries | 🟡 Medium | B: boundary testing | ✅ Fixed |
| F6 | Horizontal overflow on mobile (451 px content in a 375 px viewport) | 🟡 Medium | B: device sweep | ✅ Fixed |
| F7 | Implausible debt ratios (e.g. 20,000%) accepted silently | 🟢 Low | B: edge cases | ✅ Fixed |
| F8 | Showcase portfolio drawn from training data (~80% in-sample) | 🟡 Medium | B: questioning a small-sample result | ✅ Fixed |

### F1 — Displayed PD ~5× too high 🔴

- **Problem:** the model was trained with `class_weight="balanced"`, which implicitly assumes a 50% default rate. Across all 149,730 borrowers the **mean predicted PD was 34.9%, while the true default rate is 6.6%**.
- **Impact:** every probability shown to users would have been inflated about 5×. The planned "approve below 10%" rule would have approved almost nobody. **The AUC (0.839) could not reveal this**, because AUC measures ranking, not calibration.
- **Fix:** a standard prior correction in the app: `logit + ln(0.066 / 0.934)`.
- **Verification:** the mean PD is now 6.9% against the true 6.6%. Per band, predicted vs. actual: 2.1 vs. 2.0% · 7.2 vs. 8.3% · 13.5 vs. 14.7% · 26.2 vs. 28.7%.
- **Residual:** the top band (35%+) still over-predicts (64% vs. 49%). The decision is unaffected, because both values are above the decline threshold. This is documented as a known limitation.
- **Lesson:** a strong headline metric can coexist with a critical user-facing error. Test the number the user actually sees.

### F2 — One column, two units 🟠

- **Problem:** in the sample portfolio, 20 of 100 borrowers had a debt ratio above 1,000%, and all 20 had exactly the imputed median income. On the full data, where income was missing (~20% of rows) the `DebtRatio` median is **1,170**; where income was present it is **0.30**. For those rows the source stores absolute debt, not a ratio.
- **Impact:** this is the **root cause of a counter-intuitive model coefficient** that had been noticed earlier but left unexplained. Median imputation also hid the fact that income was missing.
- **Fix:**
  - The app flags these rows with ⚠ and a tooltip, shows the value as an amount rather than a percentage, and offers a filter.
  - The Excel export carries a data-quality column.
  - The single-application form warns above 1,000%.
- **Proposed model fix (v1.1):** a `income_missing` indicator and separate handling of `DebtRatio` for those rows.
- **Lesson:** an anomaly that is "noted and moved past" is often a symptom. Profiling the data by subgroup found the cause.

### F3 — Training caps not carried into the app 🟠

- **Problem:** the training script capped three columns at the 99.5th percentile, but the cap values were never exported. The AI-written handoff document **listed only two of the three columns**.
- **Impact:** extreme inputs (e.g. 500% utilization, $100k income) would have produced z-scores the model never saw during training.
- **Fix:** I reproduced the cleaning pipeline from the raw CSV (the row counts matched exactly, 149,730) and derived the caps. The app now applies them and tells the user when it does. It also warns when an input goes beyond the training range.
- **Lesson:** AI-generated documentation is a claim, not a specification. Verify it against the artifact.

### F4 — "Reproducible" script that did not run 🟠

- **Problem:** the training script had hard-coded absolute paths from the agent's cloud sandbox. The claim that it was reproducible had never been tested.
- **Impact:** anyone cloning the repository, a reviewer or an interviewer for example, could not have verified that the app's model came from this code.
- **Fix:** relative paths, environment overrides and a `requirements.txt`.
- **Verification:** I re-trained on a different stack (Python 3.14, pandas 3.0, scikit-learn 1.9) and compared the output field by field:
  - scaler, segments and sample data are identical;
  - coefficients differ by at most 1.1·10⁻¹⁵;
  - AUC is 0.8391, the same as before.

### F5 — Labels that contradict the data 🟡

- **Problem:** segments were built with right-closed bins (`pd.cut`), so a 30-year-old falls into the band labelled "<30".
- **Impact:** a 30-year-old applicant was told they were in the "<30" group. The statement looks wrong even though the underlying number is correct.
- **Fix:** the lookup logic was kept as it was, and the displayed labels now state the true boundaries (≤30, 31–40, …). A boundary test for age 30 guards against regression.

### F6 — Mobile overflow 🟡

- **Problem:** in a 375 px viewport the portfolio tab was 451 px wide. A 5-column table inside a CSS grid item (`min-width: auto`) stretched the whole layout.
- **Fix:** `min-width: 0` on the grid items, plus a scroll container for the table. Re-measured at 375 px: no overflow.

### F7 — Implausible input accepted silently 🟢

- **Problem:** opening a flagged portfolio row in the analysis form put a debt ratio of 20,000% into the form, and no warning was shown.
- **Fix:** the form now warns above 1,000% and explains the likely data-quality cause.

### F8 — The showcase portfolio was mostly training data 🟡

- **Problem:** the 100 loans on the portfolio tab were sampled from the whole cleaned dataset. About 80 of them had been used to train the model, and the tab's statistics rested on 100 loans with 7 defaults (for example, a "33% default rate" in the decline band was based on 3 loans).
- **Impact:** the portfolio view flattered the model and presented noise as evidence. A reviewer would rightly discount it.
- **Found by:** asking why a 150k-row project showed conclusions from 100 rows, then re-reading the sampling line in the training script.
- **Fix:** the browsable sample is now drawn only from the test set, and the tab shows validation on all 29,946 test loans (AUC 0.839, Gini 0.678, KS 0.524, calibration by decile, decision-band outcomes). Only aggregates are exported, never raw rows. After re-running the training script, the model parameters were verified to be **bit-identical**.

## 4. Automated Suite

The 115 tests are grouped as follows:
1. Model math against the oracle
2. Threshold and band boundaries
3. Input parsing (Hungarian number formats)
4. UI validation, including HTML-injection attempts
5. User flows
6. Portfolio aggregates, filters, sorting and keyboard access
7. Excel export: the download is intercepted, and the workbook is read back and inspected
8. Basic accessibility
9. Language switching (Hungarian / English): translation-key completeness, locale-aware number parsing, values converted on switch, and a scan of the visible UI and attributes for untranslated text
10. New features: scorecard scale definition (600 points at 50:1, +20 per doubling), counterfactual thresholds verified by re-scoring at the suggested value, expected loss against an independent formula, optional-field validation, live updates that never flash errors, the print memo, and validation aggregates that must add up to the test-set size

**Testing the tests:** I injected two realistic bugs, a skipped calibration and an off-by-one at the 10% threshold. **14 tests failed**, and both bugs were caught. A suite that stays green under mutation would have given false confidence.

**Independent oracle:** reference PDs were computed in a separate PowerShell implementation directly from the exported model, and the portfolio-sample expectations with numpy. The two implementations agree within ~4·10⁻⁸, and the tolerance is set at 10⁻⁶.

## 5. What I Would Tell a Team Using AI Coding Agents

1. **Validate outputs against ground truth, not against the agent's summary.** F1, F3 and F4 were all hidden behind statements that sounded reasonable.
2. **Headline metrics are not acceptance criteria.** AUC was excellent and the displayed numbers were still wrong.
3. **Keep the oracle independent of the code under test**, and **mutation-test the suite** before trusting a green run.
4. **Chase anomalies to their root cause.** The "odd coefficient" (F2) turned out to be a data-integrity issue affecting 20% of the rows.
5. **Reproduce the pipeline on a clean machine.** A "reproducible" claim is untested until someone re-runs it.

## 6. User Testing — *in progress*

Moderated, task-based sessions with 3–5 non-technical testers. The plan, the tasks and the criteria are in [`TESZTELESI_TERV.md`](TESZTELESI_TERV.md).

| Criterion | Target | Result |
|---|---|---|
| Core task (F2) completed unaided | ≤ 5 min for ≥ 80% of testers | _pending_ |
| Can name ≥ 1 decision driver | ≥ 80% | _pending_ |
| Understands it is a demo, not a real credit decision | 100% | _pending_ |
| Questionnaire Q1–Q5 (1–5 scale) | average ≥ 4 | _pending_ |

_Findings from user testing will be added here in the same problem → impact → fix format, with iterations between sessions._

## 7. Known Limitations

- Calibration is imperfect in the highest-risk band (F1 residual).
- `DebtRatio` is flagged in the UI but not yet fixed in the model (F2).
- The dataset is US data from 2011. The model is a teaching tool and has not been validated for any real lending use.
- Expected loss uses a fixed LGD assumption (45%) and converts the 2-year PD to 1-year assuming a constant hazard. The score scale (600 at 50:1, PDO 20) is a convention, not a calibrated business scale.
- The counterfactual only varies credit utilization. It is exact for this linear model, but it is not a full recourse analysis across all features.
- The UI is bilingual (Hungarian / English). Only the internal test log (`TESZT_NAPLO.md`) and test plan are in Hungarian.

---

*Full test log (Hungarian): [`TESZT_NAPLO.md`](TESZT_NAPLO.md) · Test plan: [`TESZTELESI_TERV.md`](TESZTELESI_TERV.md) · Source: [repository](https://github.com/Milan0730/hitelkockazat-elemzo)*
