/* Automatizált regressziós tesztcsomag — Hitelkockázat-elemző
   Futtatás: index.html?selftest  (csak ekkor töltődik be, a normál működést nem érinti)

   Az orákulum-értékek az apptól FÜGGETLENÜL, PowerShell-ben készültek a model_export.json
   és a sample_portfolio.json alapján (ld. TESZTELESI_TERV.md, "Orákulum"). A tesztek az app
   globális függvényeit (score, decide, parseNum, ...) és a DOM-ot használják. */
(function () {
  "use strict";

  const TOL = 1e-6; // PowerShell vs. JS lebegőpontos eltérés ~4e-8, a UI 0,1%-ra kerekít
  const ORACLE = {
    // felhasználói egységek: [kor, jövedelem USD, kihasználtság %, adósságteher %, 30-59 késés, 90+ késés]
    low:    { in: [58, 7500, 8, 25, 0, 0],        pd: 0.015454628396372339 },
    mid:    { in: [34, 4200, 72, 45, 1, 0],       pd: 0.14984647797719905 },
    high:   { in: [27, 2600, 105, 60, 2, 1],      pd: 0.69208706369875828 },
    zero:   { in: [18, 0, 0, 0, 0, 0],            pd: 0.028308694066841927 },
    capped: { in: [45, 100000, 500, 10000, 0, 0], pd: 0.15358879381219784 },
    extrap: { in: [40, 3000, 50, 30, 20, 20],     pd: 0.9999999999999889 },
    old:    { in: [110, 5000, 20, 30, 0, 0],      pd: 0.008445853197037374 }
  };
  const ORACLE_PF = { mean: 0.046529074110745174, row100: 0.31128214317908831, good: 88, warn: 9, bad: 3, defaults: 7, flagged: 20 };
  const KEYS = ["age", "MonthlyIncome", "RevolvingUtilizationOfUnsecuredLines", "DebtRatio",
                "NumberOfTime30-59DaysPastDueNotWorse", "NumberOfTimes90DaysLate"];

  const results = [];
  let group = "";
  function test(name, fn) {
    try {
      const r = fn();
      if (r === true || r === undefined) results.push({ group, name, ok: true });
      else results.push({ group, name, ok: false, detail: String(r) });
    } catch (e) {
      results.push({ group, name, ok: false, detail: "Kivétel: " + (e && e.message || e) });
    }
  }
  const near = (a, b, tol = TOL) => Math.abs(a - b) <= tol || `várt ${b}, kapott ${a}`;
  const eq = (a, b) => a === b || `várt ${JSON.stringify(b)}, kapott ${JSON.stringify(a)}`;
  const q = sel => document.querySelector(sel);
  const qa = sel => [...document.querySelectorAll(sel)];

  function fill(vals) {
    KEYS.forEach((k, i) => { document.getElementById("in-" + k).value = vals[i] === undefined ? "" : String(vals[i]); });
  }
  function submit() { document.getElementById("form").requestSubmit(); }
  function msg(k) { return q(`#f-${CSS.escape(k)} .msg`).textContent; }
  function fieldState(k) { const el = document.getElementById("f-" + k); return el.classList.contains("err") ? "err" : el.classList.contains("warn") ? "warn" : "ok"; }
  function setSelect(id, v) { const el = document.getElementById(id); el.value = v; el.dispatchEvent(new Event("change")); }
  function modelFromUser(v) {
    return { age: v[0], MonthlyIncome: v[1], RevolvingUtilizationOfUnsecuredLines: v[2] / 100, DebtRatio: v[3] / 100,
             "NumberOfTime30-59DaysPastDueNotWorse": v[4], NumberOfTimes90DaysLate: v[5] };
  }

  // Az állapot mentése, hogy a tesztfutás után visszaállítható legyen
  const savedTheme = document.documentElement.dataset.theme;
  const savedPf = Object.assign({}, pfState);
  const savedStorage = {};
  try { for (const k of ["hk-theme", "hk-tab", "hk-lang"]) savedStorage[k] = localStorage.getItem(k); } catch (e) {}
  // Az 1–8. csoport a magyar felületre készült elvárt szövegeket használ
  const savedLang = LANG;
  setLang("hu", false);

  /* 1. Modell-matematika az orákulum ellen (tiszta függvény, capping nélkül = score() közvetlen hívása) */
  group = "1. Modell-matematika";
  for (const name of ["low", "mid", "high", "zero", "old"]) {
    test(`PD orákulum: ${name}`, () => near(score(modelFromUser(ORACLE[name].in)).pd, ORACLE[name].pd));
  }
  test("Prior-korrekció: nyers PD > korrigált PD minden esetben", () => {
    for (const k in ORACLE) { const s = score(modelFromUser(ORACLE[k].in)); if (!(s.pdRaw > s.pd)) return k; }
  });
  test("Prior-offset = ln(0,066/0,934)", () => near(PRIOR_OFFSET, Math.log(0.066 / 0.934), 1e-12));
  test("Hozzájárulások összege + intercept = logit", () => {
    const s = score(modelFromUser(ORACLE.mid.in));
    const logit = MODEL.intercept + s.contrib.reduce((a, c) => a + c.value, 0);
    return near(1 / (1 + Math.exp(-logit)), s.pdRaw, 1e-12);
  });
  test("Beágyazott modell = model_export.json (6 változó, sorrend)", () =>
    eq(MODEL.features.join("|"), "RevolvingUtilizationOfUnsecuredLines|age|NumberOfTime30-59DaysPastDueNotWorse|DebtRatio|MonthlyIncome|NumberOfTimes90DaysLate"));

  /* 2. Döntési küszöbök és sávhatárok */
  group = "2. Küszöbök és sávok";
  test("PD 9,99% → jóváhagyás", () => eq(decide(0.0999).cls, "good"));
  test("PD 10,00% → felülvizsgálat (határ)", () => eq(decide(0.10).cls, "warn"));
  test("PD 29,99% → felülvizsgálat", () => eq(decide(0.2999).cls, "warn"));
  test("PD 30,00% → elutasítás (határ)", () => eq(decide(0.30).cls, "bad"));
  test("Korsáv: 30 → '<30' (pandas jobbról zárt)", () => eq(ageBand(30), "<30"));
  test("Korsáv: 31 → '30-39'", () => eq(ageBand(31), "30-39"));
  test("Korsáv: 60 → '50-59', 61 → '60+'", () => ageBand(60) === "50-59" && ageBand(61) === "60+" || `${ageBand(60)}, ${ageBand(61)}`);
  test("Kihasználtság-sáv: 10% → '0-10%', 10,01% → '10-30%'", () => utilBand(0.1) === "0-10%" && utilBand(0.1001) === "10-30%" || "hibás");
  test("Kihasználtság-sáv: 100% → '60-100%', 100,01% → '100%+'", () => utilBand(1.0) === "60-100%" && utilBand(1.0001) === "100%+" || "hibás");
  test("Minden kor × kihasználtság kombinációhoz van szegmens", () => {
    for (const a of [18, 35, 45, 55, 70]) for (const u of [0.05, 0.2, 0.5, 0.8, 1.2]) {
      if (!MODEL.segments.find(s => s.age_band === ageBand(a) && s.util_band === utilBand(u))) return `${a} / ${u}`;
    }
  });
  test("UI korcsoport-címke: 30 éves → '≤30'", () => eq(AGE_LABEL[ageBand(30)], "≤30"));

  /* 3. Számbevitel-értelmezés */
  group = "3. Számbevitel";
  const P = parseNum;
  test("'5 400' → 5400", () => eq(P("5 400").value, 5400));
  test("'5 400' (nem törő szóköz) → 5400", () => eq(P("5 400").value, 5400));
  test("'0,35' → 0.35", () => eq(P("0,35").value, 0.35));
  test("'35%' → 35", () => eq(P("35%").value, 35));
  test("'  42  ' → 42", () => eq(P("  42  ").value, 42));
  test("'' → üres", () => eq(P("").empty, true));
  test("'abc' → érvénytelen", () => eq(P("abc").invalid, true));
  test("'1e5' → érvénytelen (tudományos jelölés nem engedett)", () => eq(P("1e5").invalid, true));
  test("'1.234,5' → érvénytelen (kétértelmű)", () => eq(P("1.234,5").invalid, true));
  test("'-3' → -3 (a negatívot a validáció szűri)", () => eq(P("-3").value, -3));

  /* 4. Űrlap-validáció a felületen */
  group = "4. Validáció (UI)";
  showTab("single");
  test("Üres űrlap → 6 'Kötelező mező' hiba, nincs eredmény", () => {
    q("#resetBtn").click(); submit();
    const errs = qa(".field.err").length;
    return errs === 6 && q("#results").classList.contains("hidden") || `hibák: ${errs}`;
  });
  test("Negatív kor → hiba", () => { fill([-5, 3000, 30, 30, 0, 0]); submit(); return eq(msg("age"), "Nem lehet negatív."); });
  test("Kor 17 → tartomány-hiba", () => { fill([17, 3000, 30, 30, 0, 0]); submit(); return fieldState("age") === "err" || msg("age"); });
  test("Kor 111 → tartomány-hiba", () => { fill([111, 3000, 30, 30, 0, 0]); submit(); return fieldState("age") === "err" || msg("age"); });
  test("Tört késésszám → 'Egész számot adj meg.'", () => { fill([40, 3000, 30, 30, "1,5", 0]); submit(); return eq(msg("NumberOfTime30-59DaysPastDueNotWorse"), "Egész számot adj meg."); });
  test("Szöveg a jövedelemben → hiba", () => { fill([40, "sok", 30, 30, 0, 0]); submit(); return fieldState("MonthlyIncome") === "err" || "nincs hiba"; });
  test("HTML/script bevitel nem kerül a DOM-ba", () => {
    fill(['<img src=x onerror="window.__xss=1">', 3000, 30, 30, 0, 0]); submit();
    return !window.__xss && !q("#fields img") && fieldState("age") === "err" || "injektálás lehetséges";
  });
  test("Hiba javítása után a hibaüzenet eltűnik", () => { fill([40, 3000, 30, 30, 0, 0]); submit(); return qa(".field.err").length === 0 || "maradt hiba"; });
  test("Kihasználtság 500% → limitálás-figyelmeztetés", () => { fill(ORACLE.capped.in); submit(); return fieldState("RevolvingUtilizationOfUnsecuredLines") === "warn" || "nincs figyelmeztetés"; });
  test("Jövedelem 100 000 → limitálás-figyelmeztetés", () => fieldState("MonthlyIncome") === "warn" || "nincs figyelmeztetés");
  test("Adósságteher 10 000% → 'szokatlanul magas' figyelmeztetés", () => /Szokatlanul magas/.test(msg("DebtRatio")) || msg("DebtRatio"));
  test("Limitált bemenet PD-je = orákulum (capping helyes)", () => near(lastResult.pd, ORACLE.capped.pd));
  test("Késésszám 20 → extrapolációs figyelmeztetés", () => { fill(ORACLE.extrap.in); submit(); return /extrapoláció/.test(msg("NumberOfTimes90DaysLate")) || msg("NumberOfTimes90DaysLate"); });
  test("Extrém bemenet: PD véges, ≤ 100%, nincs összeomlás", () => Number.isFinite(lastResult.pd) && lastResult.pd <= 1 && near(lastResult.pd, ORACLE.extrap.pd) === true || lastResult.pd);
  test("0 jövedelem → figyelmeztetés, de számol", () => { fill(ORACLE.zero.in); submit(); return fieldState("MonthlyIncome") === "warn" && near(lastResult.pd, ORACLE.zero.pd) === true || "hibás"; });

  /* 5. Felhasználói folyamatok */
  group = "5. Folyamatok (UI)";
  const presetExpect = { low: ["1,5%", "good"], mid: ["15,0%", "warn"], high: ["69,2%", "bad"] };
  for (const p in presetExpect) {
    test(`Példa-profil '${p}' → ${presetExpect[p][0]}`, () => {
      q(`[data-preset=${p}]`).click();
      return q("#pdValue").textContent === presetExpect[p][0] && q("#decisionBadge").classList.contains(presetExpect[p][1])
        || `${q("#pdValue").textContent} / ${q("#decisionBadge").className}`;
    });
  }
  test("Magyarázó panel: 4 tényező, DebtRatio nincs köztük", () => {
    const items = qa("#factorList li");
    return items.length === 4 && !items.some(li => /Adósságteher/.test(li.textContent)) || `${items.length} tétel`;
  });
  test("Szegmens-cella kiemelve, értéke = szegmens-arány", () => {
    const me = qa("#heat td.me");
    return me.length === 1 && me[0].textContent === pct(lastResult.seg.mean) || `${me.length} kiemelt cella`;
  });
  test("Témaváltás után az eredmény megmarad", () => {
    const before = q("#pdValue").textContent;
    q("#themeBtn").click(); const after = q("#pdValue").textContent; q("#themeBtn").click();
    return eq(after, before);
  });
  test("Törlés gomb: üres mezők, eredmény elrejtve", () => {
    q("#resetBtn").click();
    return KEYS.every(k => document.getElementById("in-" + k).value === "") && q("#results").classList.contains("hidden") || "nem ürült";
  });

  /* 6. Minta-portfólió */
  group = "6. Portfólió";
  showTab("portfolio");
  test("100 sor, alapból PD szerint csökkenő", () => {
    Object.assign(pfState, { sortKey: "pd", dir: -1, decision: "", outcome: "", flagged: false });
    setSelect("pfDecision", ""); setSelect("pfOutcome", ""); q("#pfFlagged").checked = false; renderPfTable();
    const pds = pfFiltered().map(r => r.pd);
    return pds.length === 100 && pds.every((v, i) => i === 0 || pds[i - 1] >= v) || "rendezés hibás";
  });
  test("Átlagos PD = orákulum", () => near(pfSummary(PORTFOLIO).avgPd, ORACLE_PF.mean));
  test("#100 PD = orákulum", () => near(PORTFOLIO[99].pd, ORACLE_PF.row100));
  test("Döntés-megoszlás 88 / 9 / 3", () => {
    const b = pfSummary(PORTFOLIO).by;
    return b.good.n === ORACLE_PF.good && b.warn.n === ORACLE_PF.warn && b.bad.n === ORACLE_PF.bad || `${b.good.n}/${b.warn.n}/${b.bad.n}`;
  });
  test("7 nemteljesítő, 20 adatminőségi jelzés", () => {
    const s = pfSummary(PORTFOLIO);
    return s.defaults === ORACLE_PF.defaults && s.flagged === ORACLE_PF.flagged || `${s.defaults} / ${s.flagged}`;
  });
  test("Szűrés: Elutasítás → 3 sor", () => { setSelect("pfDecision", "bad"); return eq(qa("#pfBody tr[data-id]").length, 3); });
  test("Szűrés: Elutasítás + Nemteljesített → 1 sor", () => { setSelect("pfOutcome", "1"); return eq(qa("#pfBody tr[data-id]").length, 1); });
  test("Üres szűrési eredmény → üzenet, nincs összeomlás", () => {
    setSelect("pfDecision", "bad"); setSelect("pfOutcome", "1"); q("#pfFlagged").checked = true; q("#pfFlagged").dispatchEvent(new Event("change"));
    const n = qa("#pfBody tr[data-id]").length;
    const ok = n === 0 ? !!q("#pfBody .empty-row") : true; // ha véletlenül van találat, az sem hiba
    q("#pfFlagged").checked = false; q("#pfFlagged").dispatchEvent(new Event("change"));
    setSelect("pfDecision", ""); setSelect("pfOutcome", "");
    return ok || "hiányzó üres-állapot üzenet";
  });
  test("Csak jelzéssel → 20 sor, mind ⚠", () => {
    q("#pfFlagged").click();
    const rows = qa("#pfBody tr[data-id]");
    const ok = rows.length === 20 && rows.every(tr => tr.querySelector(".flag"));
    q("#pfFlagged").click();
    return ok || `${rows.length} sor`;
  });
  test("Rendezés kor szerint: kattintás csökkenő, újabb kattintás növekvő", () => {
    q('#pfHead th[data-key="age"]').click();
    const d = pfFiltered().map(r => r.model.age);
    q('#pfHead th[data-key="age"]').click();
    const a = pfFiltered().map(r => r.model.age);
    const desc = d.every((v, i) => i === 0 || d[i - 1] >= v), asc = a.every((v, i) => i === 0 || a[i - 1] <= v);
    return desc && asc && q('#pfHead th[data-key="age"]').getAttribute("aria-sort") === "ascending" || `desc=${desc} asc=${asc}`;
  });
  test("Rendezés billentyűzettel (Enter) és a fókusz megmarad", () => {
    const th = q('#pfHead th[data-key="pd"]'); th.focus();
    th.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    return document.activeElement && document.activeElement.dataset.key === "pd" && pfState.sortKey === "pd" || "fókusz elveszett";
  });
  test("Sorra kattintás → egyedi elemzés ugyanazzal a PD-vel", () => {
    const r = PORTFOLIO[99];
    q('#pfBody tr[data-id="100"]').click();
    const ok = q("#tabbtn-single").getAttribute("aria-selected") === "true" && q("#pdValue").textContent === pct(r.pd);
    return ok || `${q("#pdValue").textContent} vs ${pct(r.pd)}`;
  });
  test("Megjelölt sor megnyitása → adósságteher-figyelmeztetés", () => /Szokatlanul magas/.test(msg("DebtRatio")) || msg("DebtRatio"));

  /* 7. Excel export (a letöltést elfogjuk, a munkafüzetet visszaolvassuk) */
  group = "7. Excel export";
  if (typeof XLSX === "undefined") {
    test("xlsx-js-style betöltve", () => "nem érhető el (offline?)");
  } else {
    const captured = [];
    const orig = XLSX.writeFile;
    XLSX.writeFile = (wb, name) => {
      const buf = XLSX.write(wb, { type: "array", bookType: "xlsx", cellStyles: true });
      captured.push({ name, wb: XLSX.read(buf, { cellStyles: true }) });
    };
    try {
      showTab("portfolio");
      Object.assign(pfState, { sortKey: "pd", dir: -1 }); setSelect("pfDecision", ""); setSelect("pfOutcome", "");
      q("#pfExportBtn").click();
      q("[data-preset=high]") && (showTab("single"), q("[data-preset=high]").click());
      q("#singleExportBtn").click();
    } finally { XLSX.writeFile = orig; }
    const [pf, single] = captured;
    test("Két fájl készült, dátumozott névvel", () => captured.length === 2 && /_\d{4}-\d{2}-\d{2}\.xlsx$/.test(pf.name) || captured.map(c => c.name).join(", "));
    test("Portfólió: munkalapok", () => eq(pf.wb.SheetNames.join("|"), "Portfólió|Összesítő|Módszertan"));
    test("Portfólió: fejléc + 100 adatsor (A1:K104)", () => { const sh = pf.wb.Sheets["Portfólió"]; return sh["!ref"] === "A1:K104" && !!sh.A104 && sh.A4.v === "Ügyfél" || sh["!ref"]; });
    test("Portfólió: PD százalékformátumú szám", () => { const c = pf.wb.Sheets["Portfólió"].H5; return c.t === "n" && /%/.test(c.z) || JSON.stringify(c); });
    test("Portfólió: első sor = legmagasabb PD", () => near(pf.wb.Sheets["Portfólió"].H5.v, Math.max(...PORTFOLIO.map(r => r.pd))));
    test("Portfólió: megjelölt sorokban 'Adatminőség' szöveg", () => {
      const sh = pf.wb.Sheets["Portfólió"]; let n = 0;
      for (let r = 5; r <= 104; r++) if (sh["K" + r] && /Hiányzó jövedelem/.test(sh["K" + r].v)) n++;
      return eq(n, 20);
    });
    test("Módszertan: disclaimer szerepel", () => /Oktatási \/ demo/.test(pf.wb.Sheets["Módszertan"].A3.v) || "nincs disclaimer");
    test("Egyedi: munkalapok és PD = orákulum (magas profil)", () => {
      const sh = single.wb.Sheets["Kiértékelés"];
      return single.wb.SheetNames.join("|") === "Kiértékelés|Módszertan" && near(sh.B5.v, ORACLE.high.pd) === true || JSON.stringify(sh.B5);
    });
  }

  /* 8. Akadálymentesség és robusztusság (alap-ellenőrzések) */
  group = "8. Alap-akadálymentesség";
  test("Minden beviteli mezőnek van címkéje", () => {
    const bad = qa("#fields input").filter(i => !q(`label[for="${i.id}"]`));
    return bad.length === 0 || bad.map(i => i.id).join(", ");
  });
  test("Fülek: role=tab + aria-selected", () => qa(".tab[role=tab]").length === 2 && qa(".tab[aria-selected=true]").length === 1 || "hibás ARIA");
  test("Disclaimer látható mindkét fülön (a füleken kívül van)", () => !q("#disclaimer").closest("[role=tabpanel]") || "tabpanelen belül van");
  test("<html lang='hu'>", () => eq(document.documentElement.lang, "hu"));

  /* 9. Nyelvváltás (HU ↔ EN) */
  group = "9. Nyelvváltás (EN)";
  test("Minden fordítási kulcs megvan mindkét nyelven, azonos típussal", () => {
    const missing = [];
    for (const [a, b] of [["hu", "en"], ["en", "hu"]])
      for (const k of Object.keys(STR[a])) if (!(k in STR[b]) || typeof STR[a][k] !== typeof STR[b][k]) missing.push(`${b}:${k}`);
    return missing.length === 0 || missing.join(", ");
  });
  test("Tömb-értékű kulcsok hossza egyezik (Excel fejlécek)", () => {
    const bad = Object.keys(STR.hu).filter(k => Array.isArray(STR.hu[k]) && STR.hu[k].length !== STR.en[k].length);
    return bad.length === 0 || bad.join(", ");
  });
  test("EN számbevitel: '5,400' → 5400", () => eq(parseNum("5,400", "en").value, 5400));
  test("EN számbevitel: '1,234.5' → 1234.5", () => eq(parseNum("1,234.5", "en").value, 1234.5));
  test("EN számbevitel: '0.35' → 0.35", () => eq(parseNum("0.35", "en").value, 0.35));
  test("EN számbevitel: '0,35' → érvénytelen (nem tippelünk)", () => eq(parseNum("0,35", "en").invalid, true));
  test("HU számbevitel változatlan: '0,35' → 0.35", () => eq(parseNum("0,35", "hu").value, 0.35));

  showTab("single");
  test("Váltás közben a mezőértékek átalakulnak ('0,5' → '0.5') és az eredmény megmarad", () => {
    fill([34, 4200, "72,5", 45, 1, 0]); submit();
    const pdHu = lastResult.pd;
    q("#langBtn").click();
    const v = document.getElementById("in-RevolvingUtilizationOfUnsecuredLines").value;
    return LANG === "en" && v === "72.5" && near(lastResult.pd, pdHu) === true || `LANG=${LANG}, mező='${v}'`;
  });
  test("EN: fejléc, gombok, <html lang>", () => {
    return q("h1").textContent === "Credit Risk Analyzer" && q("#langBtn").textContent === "HU" &&
      document.documentElement.lang === "en" && q('#form button[type="submit"]').textContent === "Evaluate" || q("h1").textContent;
  });
  test("EN: példa-profil 'mid' → '15.0%' és 'Manual review'", () => {
    q("[data-preset=mid]").click();
    return q("#pdValue").textContent === "15.0%" && q("#decisionBadge").textContent === "Manual review" || `${q("#pdValue").textContent} / ${q("#decisionBadge").textContent}`;
  });
  test("EN: PD azonos a magyar módban számolttal (nyelvfüggetlen számítás)", () => near(lastResult.pd, ORACLE.mid.pd));
  test("EN: tényező-magyarázat angolul", () => /compared with the average borrower/.test(q("#factorList").textContent) || q("#factorList").textContent.slice(0, 80));
  test("EN: validációs üzenet angolul", () => {
    fill([-5, 3000, 30, 30, 0, 0]); submit();
    const ok = msg("age") === "Cannot be negative.";
    q("[data-preset=mid]").click();
    return ok || msg("age");
  });
  test("EN: nincs magyar szöveg a látható felületen (egyedi fül)", () => {
    const hits = (document.body.innerText.match(/[^\s]*[őűŐŰáéíóöúüÁÉÍÓÖÚÜ][^\s]*/g) || []);
    return hits.length === 0 || [...new Set(hits)].slice(0, 8).join(" | ");
  });
  test("EN: nincs magyar szöveg a portfólió fülön (táblázat, KPI, mátrix)", () => {
    showTab("portfolio");
    const hits = (document.body.innerText.match(/[^\s]*[őűŐŰáéíóöúüÁÉÍÓÖÚÜ][^\s]*/g) || []);
    return hits.length === 0 || [...new Set(hits)].slice(0, 8).join(" | ");
  });
  test("EN: nincs magyar szöveg a title/aria attribútumokban", () => {
    const attrs = qa("[title],[aria-label]").map(el => (el.getAttribute("title") || "") + " " + (el.getAttribute("aria-label") || ""));
    // a nyelvváltó gomb aria-label-je szándékosan a másik nyelven van ("Váltás magyar nyelvre")
    const hits = attrs.filter(s => /[őűáéíóöúü]/i.test(s) && !/Váltás magyar/.test(s));
    return hits.length === 0 || hits.slice(0, 3).join(" | ");
  });
  if (typeof XLSX !== "undefined") {
    test("EN: Excel export angol munkalapnevekkel, fejlécekkel és fájlnévvel", () => {
      let cap = null; const orig = XLSX.writeFile;
      XLSX.writeFile = (wb, name) => { cap = { name, wb: XLSX.read(XLSX.write(wb, { type: "array", bookType: "xlsx" })) }; };
      try { q("#pfExportBtn").click(); } finally { XLSX.writeFile = orig; }
      const sh = cap && cap.wb.Sheets["Portfolio"];
      return cap && /^credit_risk_portfolio_/.test(cap.name) && cap.wb.SheetNames.join("|") === "Portfolio|Summary|Methodology" &&
        sh.A4.v === "Client" && /^NOTE:/.test(cap.wb.Sheets["Methodology"].A3.v) || (cap ? cap.name + " " + cap.wb.SheetNames.join("|") : "nincs export");
    });
  }
  test("Vissza HU-ra: szövegek és formátum visszaállnak", () => {
    showTab("single"); q("[data-preset=mid]").click();
    q("#langBtn").click();
    return LANG === "hu" && q("h1").textContent === "Hitelkockázat-elemző" && q("#pdValue").textContent === "15,0%" || `${LANG} ${q("#pdValue").textContent}`;
  });
  test("?lang=en URL-paraméter felismerése", () => {
    const original = location.href;
    const u = new URL(original); u.searchParams.set("lang", "en");
    history.replaceState(null, "", u);
    const r = initialLang();
    history.replaceState(null, "", original);
    return eq(r, "en");
  });

  // Állapot visszaállítása
  setLang(savedLang, false);
  Object.assign(pfState, savedPf);
  setSelect("pfDecision", savedPf.decision); setSelect("pfOutcome", savedPf.outcome); q("#pfFlagged").checked = savedPf.flagged;
  q("#resetBtn").click();
  if (document.documentElement.dataset.theme !== savedTheme) applyTheme(savedTheme);
  showTab("single");
  try { for (const k in savedStorage) savedStorage[k] === null ? localStorage.removeItem(k) : localStorage.setItem(k, savedStorage[k]); } catch (e) {}

  /* Riport */
  const passed = results.filter(r => r.ok).length, failed = results.length - passed;
  window.__selftest = { passed, failed, total: results.length, results };
  console.table(results.map(r => ({ csoport: r.group, teszt: r.name, eredmény: r.ok ? "OK" : "HIBA", részlet: r.detail || "" })));

  const box = document.createElement("section");
  box.className = "panel";
  box.id = "selftestReport";
  box.style.marginTop = "18px";
  const groups = [...new Set(results.map(r => r.group))];
  box.innerHTML = `
    <div class="panel-head">
      <h2>Automatizált tesztek: ${passed} / ${results.length} sikeres ${failed ? `· <span style="color:var(--bad)">${failed} hiba</span>` : "✅"}</h2>
      <button class="btn small" type="button" id="selftestCopy">Másolás Markdownként</button>
    </div>
    ${groups.map(g => `
      <h3 style="font-size:14px;margin:14px 0 6px">${esc(g)}</h3>
      <ul class="factors">${results.filter(r => r.group === g).map(r => `
        <li><span class="arrow ${r.ok ? "down" : "up"}">${r.ok ? "✓" : "✗"}</span>
        <span>${esc(r.name)}${r.detail ? ` — <span style="color:var(--bad)">${esc(r.detail)}</span>` : ""}</span></li>`).join("")}
      </ul>`).join("")}
    <div class="note">Futtatva: ${new Date().toLocaleString("hu-HU")} · ${esc(navigator.userAgent)}</div>`;
  document.querySelector(".wrap").insertBefore(box, document.querySelector("details.method"));
  document.getElementById("selftestCopy").addEventListener("click", () => {
    const md = [`## Automatizált tesztek — ${passed}/${results.length} sikeres (${new Date().toLocaleString("hu-HU")})`, ""]
      .concat(groups.flatMap(g => [`### ${g}`, ...results.filter(r => r.group === g).map(r => `- [${r.ok ? "x" : " "}] ${r.name}${r.detail ? ` — ${r.detail}` : ""}`), ""]))
      .join("\n");
    navigator.clipboard.writeText(md).then(() => { document.getElementById("selftestCopy").textContent = "Másolva ✓"; },
      () => alert("A vágólap nem érhető el; a riport a konzolban is megtalálható."));
  });
  box.scrollIntoView({ behavior: "smooth" });
})();
