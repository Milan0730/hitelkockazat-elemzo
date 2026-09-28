# Tesztelési terv — Hitelkockázat-elemző (M4)

## 1. Cél és elfogadási kritériumok

A cél igazolni, hogy az app **helyesen számol**, **nem omlik össze hibás bevitelre**, és egy **nem technikai felhasználó 5 percen belül önállóan használja**. A megtalált problémák probléma → hatás → javítás formában kerülnek a `TESZT_NAPLO.md`-be; ez lesz az AI-agent teszt-riport alapja.

| # | Kritérium | Mérés | Cél |
|---|---|---|---|
| K1 | Számítási helyesség | automatizált tesztek (orákulum) | 100% sikeres |
| K2 | Robusztusság | automatizált + feltáró tesztek | 0 összeomlás, 0 konzolhiba |
| K3 | Önálló használat | F2 feladat ideje segítség nélkül | ≤ 5 perc, a tesztelők ≥ 80%-ánál |
| K4 | Érthető indoklás | F2: meg tud nevezni ≥ 1 döntő tényezőt | a tesztelők ≥ 80%-ánál |
| K5 | Demo-jelleg egyértelmű | F1: tudja, hogy ez nem valódi hitelbírálat | minden tesztelőnél |
| K6 | Dokumentált iterációk | `TESZT_NAPLO.md` | ≥ 3–4 valós probléma → javítás |

## 2. Tesztelési szintek

| Szint | Ki / mi | Állapot |
|---|---|---|
| **A. Automatizált regressziós tesztek** | `selftest.js`, 96 teszt, 9 csoportban | ✅ 96/96 sikeres (2026-09-28) |
| **B. AI-agent feltáró tesztelés** | Claude: kódolás közbeni és böngészős tesztek | ✅ 7 talált probléma, ld. `TESZT_NAPLO.md` |
| **C. Külső felhasználói teszt** | 3–5 tesztelő, feladatalapú, moderált | ⏳ ez a dokumentum 3–8. pontja |

### A. Automatizált tesztek futtatása

```
powershell -ExecutionPolicy Bypass -File serve.ps1
```
Majd a böngészőben: `http://localhost:8080/?selftest`. A riport az oldal alján jelenik meg, a „Másolás Markdownként” gomb a vágólapra teszi. A `?selftest` nélkül a tesztek nem töltődnek be.

> A `file://`-ról való közvetlen megnyitás a normál használathoz elég, a tesztekhez viszont webszerver kell (a böngésző a helyi fájlokat nem mindig tölti be külső scriptként). Deploy után: `https://<felhasználó>.github.io/<repo>/?selftest`.

**Mit fed le** (csoportonként):
1. Modell-matematika: PD az orákulummal szemben (5 profil), prior-korrekció, logit-felbontás, változósorrend
2. Döntési küszöbök pontos határértékei (9,99% / 10,00% / 29,99% / 30,00%), kor- és kihasználtság-sávok határai
3. Számbevitel-értelmezés: magyar formátum („5 400”, „0,35”, „35%”), érvénytelen bemenetek
4. Validáció a felületen: üres, negatív, tartományon kívüli, tört, szöveges, HTML-injektálás; limitálás és extrapoláció figyelmeztetései
5. Folyamatok: példa-profilok, magyarázó panel (DebtRatio kizárva), szegmens-kiemelés, témaváltás, törlés
6. Portfólió: összesítők az orákulummal szemben, szűrők, üres állapot, rendezés egérrel és billentyűzettel, sor megnyitása
7. Excel export: a munkafüzetet elfogva és visszaolvasva ellenőrzi a munkalapokat, a tartományt, a számformátumokat, a rendezést, az adatminőségi oszlopot és a disclaimert
8. Alap-akadálymentesség: címkék, ARIA fülek, nyelv

**Orákulum**: a referencia-PD-k az apptól függetlenül, PowerShell-ben készültek a `model_export.json` együtthatóiból és a `sample_portfolio.json`-ból. Így a teszt nem saját magával hasonlítja az appot. Tűrés: 10⁻⁶ (a két implementáció eltérése ~4·10⁻⁸).

**Mutációs ellenőrzés** (a tesztek valóban hibát fognak-e?): két szándékos hibát injektáltunk (a prior-korrekció kihagyása, illetve a 10%-os küszöb elcsúszása). Eredmény: **14 teszt bukott**, mindkét hibát elkapták. ✅

## 3. Tesztelők

- **Létszám**: 3–5 fő. Nielsen szerint 5 felhasználó a használhatósági hibák ~85%-át felszínre hozza.
- **Összetétel** (lehetőleg):
  - 1–2 pénzügyes/üzleti hátterű (Corvinus): szakmai hitelesség, értik-e a PD-t
  - 1–2 nem pénzügyes: érthetőség, a „5 perc” kritérium valódi próbája
  - legalább 1 fő telefonon
- **Nyelv**: a felület magyar és angol (HU/EN gomb, vagy közvetlen link: `?lang=en`). A nem magyar anyanyelvű (pl. UBC-s) tesztelők az angol változatot kapják; a feladatlapot ilyenkor angolul kell kiadni, és a várt értékek angol számformátumban szerepelnek (pl. 10.2%).

## 4. Lebonyolítás (moderátornak)

- **Időtartam**: 20–25 perc/fő (feladatok ~15 perc + kérdőív 5 perc).
- **Formátum**: személyesen vagy videóhívásban, képernyőmegosztással. A tesztelő a saját gépén dolgozik.
- **Hozzáférés**: deploy előtt az `index.html` fájl elküldhető, dupla kattintással megnyílik (internet kell a diagramokhoz és az exporthoz). Deploy után a link.
- **Hangosan gondolkodás**: kérd meg, hogy mondja ki, mit keres, mit gondol, mi zavarja.
- **Ne segíts.** Ha elakad, először kérdezz vissza: „Mit keresel most?”. Csak 2 perc elakadás után adj tippet, és jegyezd fel „segítséggel”-ként.
- **Jegyezd fel szó szerint** a meglepett vagy bosszús megjegyzéseket; ezek a legértékesebb idézetek a riporthoz.
- Minden tesztelő után: töltsd ki a megfigyelési lapot (6. pont), mielőtt a következő jön.

## 5. Feladatok — tesztelőnek kiosztandó lap

> Köszönöm, hogy segítesz! Egy oktatási célú webalkalmazást tesztelünk. **Nem téged tesztelünk, hanem az appot.** Ha valami nem megy, az az app hibája. Kérlek, mondd hangosan, amit gondolsz.

**F1. Első benyomás** (≈ 30 mp, csak nézd, ne kattints)
Mire való szerinted ez az oldal? Hozhat-e valódi hitelbírálati döntést?

**F2. Egy ismerős kérelme**
Egy ismerősöd hitelt kérne. Adatai: 29 éves, havi nettó jövedelme 3 800 USD, a hitelkártya-kerete 45%-át használja, az adósságterhe a jövedelme 35%-a, és az elmúlt 2 évben egyszer késett 30–59 napot (90 napnál többet soha).
→ Mit javasol az app? Miért? Mi befolyásolta leginkább az eredményt?

**F3. Elírás**
Írd át a jövedelmet úgy, ahogy hétköznapon mondanád: „3,8 ezer”, majd próbáld meg úgy is elküldeni, hogy az életkor mezőt üresen hagyod.
→ Mit csinál az app? Rájössz, hogyan javítsd?

**F4. „Mi lenne, ha…”**
Mennyivel változna az ismerősöd kockázata, ha a hitelkártya-kerete 95%-át használná?

**F5. Hogyan jártak a hasonlók?**
A valóságban a hozzá hasonló korú és hasonló kártya-kihasználtságú emberek hány százaléka nem fizetett vissza?

**F6. Portfólió**
Egy bank vezetője vagy. Keresd meg a minta-portfólióban azokat az ügyfeleket, akiket az app elutasított volna, **és** a valóságban tényleg nem fizettek. Hányan vannak? Utána mentsd el a teljes listát Excelbe, és nyisd meg.

**F7. (opcionális) Telefonon / sötét módban**
Nyisd meg az appot telefonon, kapcsold sötét módba, és ismételd meg röviden az F2-t.

## 6. Megfigyelési lap (moderátor, tesztelőnként)

Tesztelő: `T_` · Háttér: ________ · Eszköz/böngésző: ________ · Dátum: ________

| Feladat | Siker (Igen / Részben / Nem) | Idő | Segítség kellett? | Kulcs-idézet / megfigyelés |
|---|---|---|---|---|
| F1 | | | | |
| F2 | | | | |
| F3 | | | | |
| F4 | | | | |
| F5 | | | | |
| F6 | | | | |
| F7 | | | | |

**Sikerkritériumok (csak moderátornak, ne mutasd meg):**
- F1: említi, hogy demo/oktatási célú, nem valódi döntés (K5)
- F2: ≤ 5 perc alatt eljut a javaslatig (várható: **PD 10,2% → Egyedi felülvizsgálat**), és meg tud nevezni ≥ 1 tényezőt, pl. a 30–59 napos késést vagy a kihasználtságot (K3, K4). *Szándékosan határeset*: 0,2 százalékponttal a jóváhagyási küszöb felett van, a szegmens valós aránya viszont 8,8%. Figyeld, hogy zavarja-e ez az ellentmondás, és hogyan értelmezi.
- F3: érti a hibaüzenetet és kijavítja („3,8 ezer” → „3800”)
- F4: átírja a mezőt, újra kiértékel, és leolvassa az új PD-t (**23,3%**, továbbra is felülvizsgálat)
- F5: megtalálja a „Hasonló profilúak valós aránya” értéket (**8,8%**, ≤30 év, 30–60%) vagy a hőtérkép kiemelt celláját
- F6: szűrőket használ (Elutasítás + Nemteljesített → **1 ügyfél**), az Excel megnyílik
- F7: nincs vízszintes görgetés, minden olvasható

## 7. Utólagos kérdőív (tesztelő tölti ki)

Értékeld 1-től (egyáltalán nem) 5-ig (teljesen):

| # | Állítás | 1–5 |
|---|---|---|
| Q1 | Könnyű volt használni. | |
| Q2 | Értettem, miért ezt a javaslatot adta az app. | |
| Q3 | Az eredményt hihetőnek tartottam. | |
| Q4 | Egyértelmű volt, hogy ez oktatási/demo eszköz, nem valódi hitelbírálat. | |
| Q5 | Megmutatnám egy ismerősömnek. | |

- Mi volt a **legzavaróbb**?
- Mi **hiányzott**?
- Ha egy dolgot változtathatnál, mi lenne az?

## 8. Hibajegy-sablon és súlyosság

```
Azonosító: UT-<tesztelő>-<sorszám>     Súlyosság: Kritikus / Magas / Közepes / Alacsony
Feladat: F_                            Eszköz / böngésző:
Mit csinált a tesztelő (lépések):
Mit várt:
Mi történt:
Idézet:
```

| Súlyosság | Jelentés | Példa |
|---|---|---|
| Kritikus | hibás eredmény vagy összeomlás | rossz PD, üres oldal, az export sérült fájlt ad |
| Magas | a feladat segítség nélkül nem teljesíthető | nem találja a kiértékelés gombot |
| Közepes | teljesíthető, de lassan vagy tévesen értelmezve | félreérti, mit jelent a PD |
| Alacsony | kozmetikai vagy szöveges | elírás, rossz igazítás |

## 9. Kiértékelés és iteráció

1. Minden tesztelő után: a hibajegyek rögzítése, súlyosság szerinti rendezése.
2. Kritikus és Magas: azonnali javítás, majd a `?selftest` újrafuttatása (regresszió), végül bejegyzés a `TESZT_NAPLO.md`-be (probléma → hatás → javítás, a tesztelő idézetével).
3. Közepes és Alacsony: összegyűjtés, javítás a körök között.
4. A javított verziót a következő tesztelő kapja. Így a riportban látszik az iteráció (pl. „T1 és T2 elakadt → javítás → T3–T5 már nem”).
5. Összesítő táblázat a végén:

| Kritérium | T1 | T2 | T3 | T4 | T5 | Teljesült? |
|---|---|---|---|---|---|---|
| K3: F2 ≤ 5 perc, segítség nélkül | | | | | | |
| K4: tényező megnevezése | | | | | | |
| K5: demo-jelleg érthető | | | | | | |
| Q1–Q5 átlag | | | | | | |
