# AI-agent teszt- és javítási napló — Hitelkockázat-elemző

Formátum: probléma → hatás → javítás. Ez a 2. AI-agent teszt-riport nyersanyaga.

## 1. Kalibrálatlan PD a `class_weight="balanced"` miatt (M2, 2026-09-28)

- **Probléma**: a modell kiegyensúlyozott osztálysúlyokkal tanult, ezért a nyers kimenet ~50%-os bázisarányra van kalibrálva. A teljes (tisztított) mintán az átlagos nyers PD **34,9%**, a valós nemteljesítési arány **6,6%**.
- **Hatás**: a tervezett döntési küszöbökkel (<10% jóváhagyás) szinte senki nem kapott volna jóváhagyást, a kiírt „PD” pedig félrevezetően, több mint 5-szörösen túlbecsülte volna a kockázatot. Az AUC ezt nem mutatja, mert a rangsorolást nem érinti.
- **Javítás**: prior-korrekció a kliensoldalon: `logit += ln(0,066 / 0,934)`. Ellenőrzés a 149 730 soron: átlagos korrigált PD 6,9% (valós 6,6%). Sávonként (előrejelzett vs. valós): <5%: 2,1% vs. 2,0%; 5–10%: 7,2% vs. 8,3%; 10–20%: 13,5% vs. 14,7%; 20–35%: 26,2% vs. 28,7%; 35%+: **64,1% vs. 48,7%**.
- **Maradék korlát**: a legmagasabb kockázati sávban a modell még mindig túlbecsül (lineáris logit, nincs isotonic/Platt kalibráció). A döntést nem befolyásolja (mindkét érték az elutasítási küszöb felett van), de a kiírt szám túlzó. Lehetséges v1.1: Platt-kalibráció a tréning-szkriptben.

## 2. Hiányzó bemeneti limitek a böngészős számításban (M2)

- **Probléma**: a tréning-szkript 99,5. percentilis felett limitálta az `RevolvingUtilizationOfUnsecuredLines`, `DebtRatio` **és `MonthlyIncome`** oszlopokat (az átadási dokumentum csak az első kettőt említette), de a limitértékeket nem exportálta a `model_export.json`-ba.
- **Hatás**: a felhasználó által beírt extrém érték (pl. 500%-os kihasználtság, 200 000 USD jövedelem) a tanításkor soha nem látott z-score-t adott volna, a PD pedig torzult volna.
- **Javítás**: a tisztítási lépéseket PowerShellben reprodukáltam a nyers CSV-n (sorszám-egyezés: 149 730 = 119 784 + 29 946), és így kaptam meg a limiteket: kihasználtság 1,3682; DebtRatio 6188,36; jövedelem 31 250 USD. Az app ugyanezeket alkalmazza, és figyelmeztet a felhasználónak. A késedelem-számlálóknál (tanítási max. 13 ill. 17) és az életkornál (max. 109) extrapolációs figyelmeztetés jelenik meg.
- **Javaslat**: a limiteket a jövőben a `model_export.json`-ba kell exportálni (`train_caps` kulcs), hogy ne kelljen utólag rekonstruálni őket.

## 3. Félrevezető korcsoport-címkék a szegmens-adatban (M2)

- **Probléma**: a szegmensek `pd.cut(bins=[0,30,40,50,60,120])` sávokkal készültek, amelyek jobbról zártak, így a 30 éves a „<30”, a 40 éves a „30-39” sávba esik. A címkék nem egyeznek a tényleges határokkal.
- **Hatás**: böngészős tesztben egy 30 éves kérelmezőre az app ezt írta ki: „A <30 korcsoportban…”, ami ellentmondásos, és egy figyelmes felhasználó hibának látná.
- **Javítás**: a szegmens-keresés továbbra is a helyes (jobbról zárt) logikát használja, de a UI a valós határokat mutatja: ≤30, 31–40, 41–50, 51–60, 61+.

## 4. Bemenet-validáció (M2, ellenőrzött viselkedés)

Böngészőben tesztelve, összeomlás nélkül:
- negatív érték → „Nem lehet negatív.”
- nem szám („abc”) → „Csak számot adj meg…”
- üres mező → „Kötelező mező.”
- tört érték darabszámnál („1,5”) → „Egész számot adj meg.”
- magyar számformátum („0,35”, „5 400”, „35%”) → elfogadva
- 0 jövedelem → számol, de figyelmeztet, hogy az adósságteher-arány nem értelmezhető

## 5. A DebtRatio hiányzó jövedelemnél abszolút összeg (M3, a DebtRatio-anomália gyökéroka)

- **Probléma**: a minta-portfólió 100 sorából 20-nál a DebtRatio 10 feletti (1000%+ arány), és mind a 20 sor jövedelme pontosan 5 400 USD, azaz a pótolt medián. A teljes adaton ellenőrizve: ahol a jövedelem hiányzott (29 610 sor, ~20%), ott a DebtRatio mediánja **1 170**, 90%-a 10 feletti. Ahol megvolt, ott a medián **0,30**, és csak 1,75% haladja meg a 10-et. Hiányzó jövedelemnél tehát a forrásadat abszolút adósságösszeget tartalmaz arány helyett.
- **Hatás**: ez magyarázza az M1-ben talált ellentmondásos, ~0 DebtRatio-együtthatót: a változó két különböző mértékegységet kever. A medián-imputálás ráadásul elrejti, hogy a jövedelem hiányzott. A portfólió-táblázatban 139 400%-os „adósságteher-arányok” jelentek volna meg magyarázat nélkül.
- **Javítás (UI)**: a portfólió-nézet ⚠ jellel és magyarázó tooltippel jelöli ezeket a sorokat (pótolt jövedelem és DebtRatio > 10). Az adósságterhet itt összegként mutatja, nem százalékként, van rá szűrő („Csak adatminőségi jelzéssel”), és az Excel exportban külön „Adatminőség” oszlop szerepel. Az egyedi űrlap 1000% feletti aránynál figyelmeztet.
- **Javaslat a modellhez (v1.1)**: a tréning-szkriptben `income_missing` indikátor-változó, és hiányzó jövedelemnél a DebtRatio kezelése külön (pl. NaN → medián arány). Ez várhatóan értelmezhetővé teszi a DebtRatio együtthatóját.

## 6. Vízszintes túlcsúszás mobilon (M3)

- **Probléma**: 375 px széles nézetben a portfólió-fül tartalma 451 px széles volt.
- **Hatás**: a telefonos felhasználónak oldalra kellett volna görgetnie az egész oldalt.
- **Javítás**: a CSS grid elemek alapértelmezett `min-width: auto` értéke miatt az 5 oszlopos mátrix-táblázat szétfeszítette a rácsot. A rács-elemek `min-width: 0` beállítást kaptak, a mátrix saját görgethető dobozba került, és mobilon kisebb a cellatávolság. Újramérve: 375 px, nincs túlcsúszás.

## 7. Excel export és konzisztencia (M3, ellenőrzött viselkedés)

- Mindkét export (portfólió, egyedi kiértékelés) a valódi `XLSX.write`-tal generálva, majd visszaolvasva: a munkalapok (Portfólió / Összesítő / Módszertan, ill. Kiértékelés / Módszertan), a számformátumok (`0.0%`, `#,##0`) és az autoszűrő (`A4:K104`) rendben vannak.
- A portfólió-export az aktuális szűrést és rendezést követi, a szűrés a fejlécben szerepel.
- Konzisztencia: a portfólió #100-as sorát megnyitva az egyedi elemzés ugyanazt a PD-t adja (31,1%), mint a táblázat.

## 8. Nem reprodukálható tréning-szkript, majd reprodukció-ellenőrzés (M4)

- **Probléma**: az `explore_and_train.py` a felhős sandbox abszolút Linux-útvonalait tartalmazta (`/root/.claude/uploads/...`), így a saját gépen nem futott volna. A „reprodukálható szkript” állítás ellenőrizetlen volt.
- **Hatás**: egy reviewer (vagy interjúztató), aki klónozza a repót, nem tudta volna újrafuttatni a tréninget, és nem lehetett volna igazolni, hogy az app valóban ebből a modellből számol.
- **Javítás**: relatív útvonalak (a szkript mappája), felülírhatóak a `HK_SRC` / `HK_OUT_DIR` környezeti változókkal; függőségek a `requirements.txt`-ben. Ellenőrzés: újrafuttatás egy külön mappába, Python 3.14 + pandas 3.0 + scikit-learn 1.9 alatt (az eredeti más verziókkal készült), majd tételes összevetés az eredeti exporttal:
  - scaler (átlag, szórás), szegmensek, meta, minta-portfólió: **bitre azonos**
  - együtthatók: max. eltérés 1,1·10⁻¹⁵, intercept 4,4·10⁻¹⁶ (lebegőpontos zaj)
  - Test AUC: 0,8391 (azonos)
