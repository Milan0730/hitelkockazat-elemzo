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

## 9. Angol nyelvű felület: tervezett kockázatok és azok tesztelése (M4)

Új funkció: HU/EN nyelvváltó gomb és `?lang=en` link. Nem hibajavítás, hanem egy olyan változtatás, amely nagyjából 150 felületi szöveget érint, ezért előre azonosított kockázatokkal és célzott tesztekkel ment.

- **Kockázat 1, számformátum**: angolul a `5,400` ötezer-négyszázat jelent, magyarul az `5,4` öt egész négy tizedet. Ha az app mindkét nyelven ugyanúgy értelmezi a vesszőt, egy angol felhasználó 5400 USD helyett 5,4 USD jövedelemmel kapna PD-t, figyelmeztetés nélkül.
  - **Döntés**: nyelvfüggő értelmezés. Angolul a vessző csak szabályos ezres tagolásként fogadható el (`1,234.5`), minden más vesszős bevitel **hibaüzenetet kap, nem tippelünk** (`0,35` → „Please enter a number”).
  - **Tesztek**: `5,400` → 5400, `1,234.5` → 1234.5, `0,35` → érvénytelen (EN); a magyar viselkedés változatlan.
- **Kockázat 2, érték-elcsúszás váltáskor**: a mezőben lévő „72,5” angolra váltás után 725-nek vagy érvénytelennek értelmeződne.
  - **Javítás**: váltáskor a mezők értékei az új nyelv formátumára íródnak át (`72,5` → `72.5`).
  - **Teszt**: a váltás előtti és utáni PD azonos.
- **Kockázat 3, lefordítatlan szöveg**: egy kihagyott kulcs csendben a magyar szövegre esik vissza.
  - **Tesztek**: (a) minden kulcs megvan mindkét nyelven, azonos típussal (tömböknél azonos hosszal); (b) angol módban a látható felületen, valamint a `title` és `aria-label` attribútumokban nem lehet magyar ékezetes szó.
  - **Mutációs próba**:
    - egy kulcs törlése → az (a) teszt bukik;
    - két szöveg magyarra cserélése → a (b) teszt mindkét fülön bukik, és pontosan megnevezi a szavakat.
  - **Tanulság**: a törölt „Keret-kihaszn.” ékezet nélküli, ezért azt a (b) szkennelés **nem** vette volna észre. A két teszt kiegészíti egymást, egyik sem elég egyedül.
- **Eredmény**: 96/96 teszt (19 új, 9. csoport). Mobilon 375 px mellett sincs túlcsúszás angol szövegekkel, konzolhiba nincs.

## 8. Nem reprodukálható tréning-szkript, majd reprodukció-ellenőrzés (M4)

- **Probléma**: az `explore_and_train.py` a felhős sandbox abszolút Linux-útvonalait tartalmazta (`/root/.claude/uploads/...`), így a saját gépen nem futott volna. A „reprodukálható szkript” állítás ellenőrizetlen volt.
- **Hatás**: egy reviewer (vagy interjúztató), aki klónozza a repót, nem tudta volna újrafuttatni a tréninget, és nem lehetett volna igazolni, hogy az app valóban ebből a modellből számol.
- **Javítás**: relatív útvonalak (a szkript mappája), felülírhatóak a `HK_SRC` / `HK_OUT_DIR` környezeti változókkal; függőségek a `requirements.txt`-ben. Ellenőrzés: újrafuttatás egy külön mappába, Python 3.14 + pandas 3.0 + scikit-learn 1.9 alatt (az eredeti más verziókkal készült), majd tételes összevetés az eredeti exporttal:
  - scaler (átlag, szórás), szegmensek, meta, minta-portfólió: **bitre azonos**
  - együtthatók: max. eltérés 1,1·10⁻¹⁵, intercept 4,4·10⁻¹⁶ (lebegőpontos zaj)
  - Test AUC: 0,8391 (azonos)

## 10. Új vizuális design („privátbanki jelentés”): regressziós ellenőrzés (M4, 2026-09-29)

Nem hibajavítás, hanem a teljes felület átstílusozása: új színpaletta világos és sötét módban, Cormorant Garamond / Manrope betűtípus, új fejléc, háromoszlopos összefoglaló (PD · javaslat · referenciacsoport), zónafeliratos kockázati skála, egységjelölés a beviteli mezőkben.

- **Kockázat**: a tesztcsomag ID-kre, osztályokra (`err`/`warn`, `good`/`warn`/`bad`, `me`), ARIA-fülekre és i18n kulcsokra épül; egy átnevezés csendben tesztbukást vagy — rosszabb — hibásan zöld tesztet okozhatna.
- **Döntés**: a számítási logika érintetlen; a markup csak burkolóelemeket kapott, minden tesztelt ID és osztály megmaradt. Az új szövegek (8 új kulcs) mindkét nyelven szerepelnek.
- **Ellenőrzés** (headless Chromium, a CDN-könyvtárak helyi másolatával):
  - automatizált tesztek: **96/96**, konzolhiba nincs;
  - 375 px: nincs vízszintes túlcsúszás egyik fülön sem;
  - képernyőképek: világos/sötét × HU/EN, egyedi és portfólió nézet.
- **Talált és javított apróságok**:
  - mobilon a skála zónafeliratai egymásra csúsztak → mobilon tördelődnek;
  - az életkor mező súgója („év”) duplikálta az új egységjelölést → értelmes súgó („Betöltött életkor (18–110)”).

## 11. Betűtípus-csere (Instrument) és finom mozgás: regressziós ellenőrzés (M4, 2026-09-29)

Nem hibajavítás: Cormorant Garamond / Manrope helyett **Instrument Serif / Instrument Sans**, valamint egységes, visszafogott animációs rendszer (egyetlen lassuló görbe, 6 px-es beúszás, 40–90 ms-os lépcsőzés; oldalbetöltéskor a logó kirajzolódik, a fejléc, az űrlap és a mezők egymás után jelennek meg; kiértékeléskor a jelentés blokkjai, a tényezők, a hőtérkép cellái és a skálajelölő animál).

- **Kockázat 1 — tesztek és időzítés**: a tesztek a `#pdValue` szövegét szinkron olvassák a kiértékelés után. Egy felszámláló PD-animáció (0 → 15,0%) a tesztek alatt köztes értéket mutatott volna.
  - **Döntés**: a PD szövege azonnal a végleges érték, csak az elhelyezkedése/átlátszósága animál. Ez a „finomabb mozgás” kérésnek is jobban megfelel.
- **Kockázat 2 — animáció ragad**: ha egy animáció nem fut le (háttérfül, lassú gép), az elem láthatatlan maradhat.
  - **Döntés**: minden animáció CSS-ben, `both` kitöltéssel; a vezérlő osztály (`is-revealing`) 2,2 s után lekerül, a végállapot azonos az animáció nélküli állapottal.
- **Kockázat 3 — hozzáférhetőség**: minden mozgás csak `prefers-reduced-motion: no-preference` mellett fut; csökkentett mozgásnál a Chart.js animáció is ki van kapcsolva.
- **Kockázat 4 — műfélkövér**: az Instrument Serifnek egyetlen súlya van; a korábbi 500/600-as címsúlyokat a böngésző szintetikus félkövérrel rajzolta volna → minden serif elem 400-as súlyra állítva.
- **Kockázat 5 — nemkívánt újrajátszás**: téma- vagy nyelvváltáskor az eredmény újrarenderel. Az animáció csak a „Kiértékelés”/minta-profil/portfólió-sor megnyitásakor fut (`render(input, true)`), téma/nyelv váltáskor nem.
- **Ellenőrzés** (headless Chromium, valódi Instrument betűkkel a GitHub-tárolóból):
  - automatizált tesztek: **96/96**, konzolhiba nincs;
  - 375 px: nincs vízszintes túlcsúszás;
  - képkockák betöltés közben (150 / 450 / 900 ms) és kiértékelés közben (200 / 550 ms);
  - végállapot-ellenőrzés világos és sötét módban, mindkét fülön: minden látható elem `opacity: 1`, nincs maradék eltolás, nincs bennragadt `is-revealing` osztály, a jelölő 30%-on áll.

## 12. Asztali alkalmazás és offline működés (M4, 2026-09-29)

Cél: az app parancsikonnal, saját ablakban, weboldal és internet nélkül is fusson.

- **Megoldás**: Microsoft Edge „alkalmazás mód” (`--app=file:///…/index.html`) parancsikonnal (Asztal + Start menü, saját ikon). Egy Electron-csomag 100+ MB és külön frissítést igényelne, ez viszont csak két `.lnk` fájl, és nem ír a rendszerbe.
- **Függőségek helyben**: Chart.js 4.4.1 és xlsx-js-style 1.2.0 (bájtra azonos a korábbi CDN-verzióval), az Instrument betűk WOFF-ban, Latin + Latin Extended-A részhalmazzal (ő, ű), licencekkel (`vendor/licenses/`). Az `index.html` már semmilyen külső címet nem tölt.
- **Talált hibák a telepítő írása közben**:
  - Ha a `ProgramFiles(x86)` környezeti változó üres (pl. 32 bites Windows), a `Join-Path` kivételt dobott → az üres helyek kimaradnak.
  - `$args` a PowerShell foglalt automatikus változója → átnevezve `$appArgs`-ra.
  - A manifest `file://` alatt konzolhibát okozna (CORS) → csak http(s) alatt kerül be.
- **Ellenőrzés**:
  - Chromium `--app` módban, `file://`-ból, **minden hálózati kérés tiltva**: 0 hálózati kérés; a betűk betöltődnek, a Chart.js és az XLSX elérhető, a kiértékelés és a diagram működik, az Excel-export letölt; a teljes tesztcsomag **96/96**, konzolhiba nincs.
  - HTTP-n (tesztharness) is 96/96.
  - `install.ps1`: PowerShell 7.4 szintaxis-ellenőrzés; dry-run böngésző nélkül (érthető hibaüzenet) és álböngészővel (helyes útvonalak). A Windows-útvonal → `file:///` URL átalakítás ékezetes, szóközös útvonallal is helyes.
  - **Nem ellenőrizhető itt**: a `.lnk` tényleges létrehozása (WScript.Shell COM csak Windows alatt létezik) → első futtatás a saját gépen.

## 13. Új funkciók és a portfólió mintavételi hibája (M4, 2026-09-29)

**Talált hiba (CASE_STUDY F8):** a 100 elemű „minta-portfólió” a teljes tisztított adatból volt véletlenszerűen kiválasztva (`d.sample(n=100)`), így kb. 80%-a a tanítóhalmazból jött. A portfólió fül következtetései ráadásul 100 hitelen és 7 nemteljesítőn alapultak (az elutasítási sáv „33%”-a 3 hitelen).
- **Hatás:** a bemutató a valósnál jobbnak mutatta a modellt, és zajt mutatott bizonyítékként.
- **Javítás:** a böngészhető minta csak a teszthalmazból jön. Az indexekre alkalmazott split azonosságát a szkript `assert`-tel ellenőrzi. A portfólió fül a teljes, 29 946 soros teszthalmazon validál: AUC 0,839, Gini 0,678, KS 0,524, kalibráció tizedenként, döntési sávok. Csak összesítések kerülnek a fájlba.
- **Reprodukció:** a tréningszkript újrafuttatva. Az együtthatók, a skálázás és a szegmensek **bitre azonosak**, csak a `validation` blokk és az adatforrás pontosabb megnevezése új. A beágyazott `MODEL` és `PORTFOLIO_RAW` 1:1 egyezik a JSON-fájlokkal (géppel ellenőrizve).
- **Tesztorákulum:** az új minta elvárt értékeit numpy-val számoltam, az apptól függetlenül: átlagos PD 7,06%, a 100. sor PD-je 11,83%, 80/14/6 sáv, 4 nemteljesítő, 15 adatminőségi jelzés.

**Új funkciók:**
- pontszám (600 pont 50:1 esélynél, PDO 20);
- kontrafaktuális magyarázat (zárt képlet a keret-kihasználtságra);
- várható veszteség (opcionális hitelösszeg, 2 évesből éves PD, LGD 45%);
- élő újraszámolás;
- nyomtatható A4 hitelmemo;
- modellvalidáció.

**Ellenőrzés:**
- **115/115 teszt.** A 19 új teszt a 10. csoportban van:
  - a pontskála definíciója;
  - a kontrafaktuális határ, újraszámolással ellenőrizve (a javasolt értéken a határ alatt, 1 százalékponttal feljebb már nem);
  - a várható veszteség független képlettel;
  - az opcionális mező validációja;
  - az élő számolás (félig beírt értékre nem ad hibaüzenetet);
  - a memo tartalma és rejtettsége;
  - a validációs összegek (sávok, tizedek = 29 946);
  - mindkét Excel-export.
- **Megjelenés:** képernyőképek világos és sötét módban, HU és EN nyelven. A memo A4 PDF-ként egyoldalas. Mobilon (375 px) nincs túlcsúszás.
- **Diagramszínek:** a kalibrációs diagram színpárját mindkét témára palettaellenőrzővel validáltam (CVD-elválasztás, kontraszt).
- **Javított apróság:** a memón a tényezők hatás-oszlopa túl keskeny volt („mérsékelten növeli” két sorba tört), ezért kiszélesítettem.
