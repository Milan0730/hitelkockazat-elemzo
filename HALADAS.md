# Hitelbírálati / hitelkockázat-elemző app — haladás

Állapot: 2026-09-28, M1 mérföldkő (adatszerzés + modell) kész.

## Amit eddig megcsináltunk

1. **Adathalmaz**: "Give Me Some Credit" (Kaggle, 2011), 150 000 sor, `cs-training.csv`. A felhasználó töltötte fel manuálisan (a felhő sandbox hálózati szabályzata miatt a közvetlen letöltés innen nem volt lehetséges GitHub/Kaggle/UCI-ról).
2. **Feltáró elemzés és tisztítás** (`explore_and_train.py`):
   - `MonthlyIncome`: 29 731 hiányzó érték → mediánnal pótolva
   - `NumberOfDependents`: 3 924 hiányzó érték → 0-val pótolva
   - 1 sor `age=0` → kizárva
   - **Valós adatminőségi hiba**: 269 sorban a késedelem-számláló oszlopokban (30-59/60-89/90+ napos késedelem) 96 vagy 98 hibakód szerepelt valós érték helyett → ezek a sorok kizárva a tréningből. Ezt dokumentálni kell a case study-ban (ugyanaz az adathitelességi elv, mint a befektetés-követőnél).
   - `RevolvingUtilizationOfUnsecuredLines` és `DebtRatio`: extrém kiugró értékek (max 50 708 ill. 329 664) → 99,5. percentilis felett limitálva.
3. **Modell**: logisztikus regresszió, 6 változó (utilization, kor, 30-59 napos késedelem, DebtRatio, havi jövedelem, 90+ napos késedelem), 80/20 tanító/teszt split, StandardScaler.
   - **Test AUC = 0,839** — erős eredmény egy interpretálható, 6 változós modellre ezen a datasetten.
   - Minden együttható iránya logikus, egy kivétellel: `DebtRatio` együtthatója gyakorlatilag nulla/enyhén ellentmondásos a kiugró értékek torzító hatása miatt. **Döntés**: a modellben marad (kicsit javítja az AUC-t), de a UI magyarázó paneljén NEM elsődleges tényezőként jelenik meg — ez is dokumentált, valós talált probléma lesz a case study-ban.
4. **Export**: `model_export.json` (együtthatók, skálázási paraméterek, szegmens-szintű historikus default-arányok kor×utilization bontásban), `sample_portfolio.json` (100 anonim minta-sor a portfólió-nézethez).

## Fájlok ebben a mappában

- `cs-training.csv` — eredeti nyers adat
- `explore_and_train.py` — tisztítási és modelltréning szkript (reprodukálható)
- `model_export.json` — a webapp által betöltendő modell-adat
- `sample_portfolio.json` — minta-portfólió a demo táblázathoz
- `HALADAS.md` — ez a fájl

## M2 — KÉSZ (2026-09-28)

`index.html` — egyfájlos app, a modell beágyazva (file://-ról is fut, nincs szükség `fetch`-re):
- Beviteli űrlap 6 mezővel, magyar címkékkel, 3 példa-profillal (alacsony/közepes/magas)
- Validáció (üres, nem szám, negatív, nem egész, tartomány) és figyelmeztetés a tanítási tartományon kívüli értékekre
- Kliensoldali PD **prior-korrekcióval** (ld. TESZT_NAPLO.md 1. pont), döntés: <10% jóváhagyás, 10–30% felülvizsgálat, ≥30% elutasítás
- Magyarázó panel: top 4 tényező szövegesen + Chart.js hozzájárulás-diagram; DebtRatio csak lábjegyzetben
- Historikus szegmens-összevetés: 3 KPI + 5×5 hőtérkép, kiemelve a kérelmező cellája
- Dark/light mód, disclaimer, módszertan-szekció

Böngészőben tesztelve: példa-profilok → 1,5% / 15,0% / 69,2%; hibakezelés rendben.
Talált és javított problémák: `TESZT_NAPLO.md`.

## M3 — KÉSZ (2026-09-28)

`index.html` bővítése, továbbra is egyetlen fájl:
- Fülek: „Egyedi kérelem” / „Minta-portfólió” (a választott fület megjegyzi)
- Minta-portfólió (100 valós sor beágyazva): KPI-k, döntési sávonkénti diagram (darabszám + valós default-arány), modell-javaslat vs. valós kimenet mátrix, rendezhető (egér és billentyűzet) és szűrhető táblázat; egy sorra kattintva az egyedi elemzés nyílik meg
- Adatminőségi jelölés (⚠) a hiányzó jövedelmű soroknál (TESZT_NAPLO 5. pont)
- Excel export (xlsx-js-style): portfólió (3 munkalap, formázott fejléc, színezett döntések, autoszűrő) és egyedi kiértékelés (2 munkalap)
- Mobilnézet javítva (375 px)

Minta-eredmények: 88 jóváhagyás / 9 felülvizsgálat / 3 elutasítás. A 7 nemteljesítőből 4 került felülvizsgálatra vagy elutasításra. Átlagos becsült PD 4,7%, valós arány 7,0%.

## M4 — folyamatban

**Tesztelés, 1. rész — KÉSZ (2026-09-28):**
- `selftest.js`: 77 automatizált regressziós teszt 8 csoportban, független (PowerShell) orákulummal; futtatás: `index.html?selftest`. Eredmény 77/77. Mutációs próba: 2 injektált hibára 14 teszt bukott, tehát a tesztek valóban ellenőriznek.
- `serve.ps1`: helyi webszerver Python/Node nélkül (a tesztekhez kell, a `file://` nem elég).
- `TESZTELESI_TERV.md`: elfogadási kritériumok (K1–K6), feladatalapú forgatókönyvek (F1–F7) várt eredményekkel, moderátori útmutató, megfigyelési lap, kérdőív, hibajegy-sablon.

**Reprodukció és deploy-előkészítés — KÉSZ (2026-09-28):**
- Python 3.14 + `.venv` (pandas, scikit-learn). A tréning-szkript relatív útvonalakkal fut, a modell bitre reprodukálódott (TESZT_NAPLO 8. pont).
- Helyi Git-repó (`main`), `.gitignore` (kimarad: ATADAS_CLAUDE_CODE.md, nyers CSV, .venv, .claude), `.gitattributes`, angol nyelvű `README.md`, `requirements.txt`. A fájlok stage-elve vannak; **a commithoz Git-identitás kell** (név + e-mail).

**Deploy — KÉSZ (2026-09-28):**
- Repó: https://github.com/Milan0730/hitelkockazat-elemzo (public, `main`)
- Élő app: https://milan0730.github.io/hitelkockazat-elemzo/ (GitHub Pages, `main` / gyökér)
- Az élő oldalon a `?selftest` eredménye 77/77. A privát fájlok (ATADAS, nyers CSV, .venv) nem publikusak (404, ellenőrizve).
- Frissítés: `git commit` + `git push`, a Pages 1–2 percen belül újraépül. Megjegyzés: Claude parancssorából a GitHubra írást a sandbox-hálózat blokkolja; a push a felhasználó kifejezett engedélyével, sandbox nélkül fut.

**Leadandók — KÉSZ (2026-09-28):**
- `CASE_STUDY.md` (publikus, angol): AI-agent teszt-riport, 7 találat súlyossággal, tesztelési módszer, tanulságok. A 6. fejezet (felhasználói teszt) helyőrző, a külső teszt után kell kitölteni.
- `private/DEMO_SCRIPT.md`: 2 perces demo angolul és magyarul, képernyő-lépésekkel és várható kérdésekkel.
- `private/CV_LINKEDIN.md`: CV-bejegyzés két fókusszal (AI QA / Credit Risk), LinkedIn Projects szöveg, poszt-vázlat, STAR interjú-beszédtémák.
- A `private/` mappa gitignore-ban van.

**Angol nyelvű felület — KÉSZ (2026-09-28):**
- HU/EN gomb a fejlécben, `?lang=en` link, automatikus nyelvválasztás (URL → mentett választás → böngésző nyelve). Minden szöveg átvált: űrlap, hibák, magyarázatok, portfólió, diagramok, Excel (munkalapnevek, fájlnév). Nyelvfüggő számbevitel (TESZT_NAPLO 9. pont).
- Automatizált tesztek: 96/96 (új, 9. csoport a nyelvváltásra).

**Egyetlen nyitott tétel: külső tesztelés** 3–5 fővel a `TESZTELESI_TERV.md` alapján (a felhasználó szervezi, az élő linkkel). Utána: az eredmények és a javítások bevezetése a `TESZT_NAPLO.md`-be és a `CASE_STUDY.md` 6. fejezetébe, valamint a CV ⏳ sora.

_(Korábbi terv, archív:)_
1. Külső tesztelés 3–5 fővel.
2. AI-agent teszt-riport a `TESZT_NAPLO.md` + a külső teszt eredményei alapján, 2 perces demo-script, CV/LinkedIn frissítés.
Opcionális v1.1: `income_missing` változó és `train_caps` export a tréning-szkriptben, Platt-kalibráció.

**Új design — KÉSZ (2026-09-29):**
- Design-feltárás 7 irányban (Claude Design canvas), a választott: **E · Privátbanki jelentés** (éjkék + sárgaréz, serif címsorok).
- `index.html` átstílusozva: új fejléc és fülek, kártyás űrlap egységjelöléssel, jelentésszerű eredmény (összefoglaló, skála zónákkal, tényezők, historikus összevetés), portfólió KPI-sáv; világos/sötét, HU/EN.
- Regresszió: 96/96 teszt, mobil 375 px túlcsúszás nélkül (TESZT_NAPLO 10. pont).

**Betűtípus és mozgás — KÉSZ (2026-09-29):**
- Betűtípus: **Instrument Serif + Instrument Sans** (négy pár közül választva a canvason: Cormorant/Manrope, Instrument, Newsreader/Public Sans, Geist).
- Mozgás: finom, egységes rendszer; oldalbetöltéskor is (logó kirajzolódás, fejléc, űrlap, mezők lépcsőzve), kiértékeléskor (jelentésblokkok, címsor alatti vonal, skálajelölő, tényezők, hőtérkép), fülváltáskor (portfólió KPI-k). Csökkentett mozgás beállítás tiszteletben tartva.
- Regresszió: 96/96 teszt, mobil 375 px rendben (TESZT_NAPLO 11. pont).

**Asztali alkalmazás — KÉSZ (2026-09-29):**
- `Telepites.cmd`: parancsikon az Asztalon és a Start menüben, saját ikonnal; saját ablakban nyílik (Edge alkalmazás mód), internet és szerver nélkül. `Eltavolitas.cmd` törli a parancsikonokat.
- Minden függőség helyben (`vendor/`), licencekkel; az élő oldal telepíthető alkalmazásként (manifest + ikonok).
- Egyszerű indítás szerverrel: `Inditas.cmd` / `Tesztek_futtatasa.cmd`.
- Regresszió: 96/96 offline (`file://`) és HTTP-n is (TESZT_NAPLO 12. pont).
- Új alkalmazásikon: az Instrument Serif „%” jele sárgarézben éjkék alapon (a PD maga egy százalék); a keretes „M” túlságosan a Gmailre emlékeztetett. A fejléc logója is erre cserélve, megnyitáskor kirajzolódik, majd kitöltődik.
