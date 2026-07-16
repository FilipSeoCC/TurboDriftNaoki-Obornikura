# Turbo Kret Drift

Przeglądarkowa gra żartobliwa w klimacie JDM anime: napompuj kreta w gaciach Bukovskiego do pełnej turbiny (która strzela ogniem!), zamień się w fioletowe BMW E36 touring w stylu JDM — z naklejkami sponsorskimi i wydechem strzelającym ogniem podczas driftu — i zdriftuj figurę-8 wokół dwóch pętli z pachołkami w 40 sekund, żeby maksymalnie go wkurwić.

To statyczna strona — jeden plik `index.html`, bez buildu i bez zależności.

## Uruchomienie lokalnie

Wystarczy otworzyć `index.html` w przeglądarce, albo odpalić dowolny lokalny serwer, np.:

```
npx serve .
```

## Deploy na Vercel

1. Zainstaluj CLI (jednorazowo): `npm i -g vercel`
2. W tym folderze uruchom: `vercel` (pierwsze uruchomienie poprosi o zalogowanie i nazwę projektu)
3. Do produkcji: `vercel --prod`

Można też wejść na [vercel.com/new](https://vercel.com/new), zaimportować to repo z GitHuba i wdrożyć bez CLI — Vercel sam wykryje statyczną stronę, nic nie trzeba konfigurować.

## Wypchnięcie na GitHub

```
git remote add origin <adres-twojego-repo-na-githubie>
git push -u origin main
```

(Repo trzeba wcześniej założyć na github.com albo przez `gh repo create`.)

## Sterowanie

**Klawiatura:**
- Spacja — pompowanie turbiny / mocniejszy drift w trybie jazdy
- W / Strzałka w górę — gaz
- Strzałki w lewo/prawo lub A/D — skręt (auto samo driftuje w zakrętach, spacja to wzmacnia)
- Dryfowanie daje 10 pkt/s (x2 mnożnik bazowy), a przejazd jak najbliżej pachołka bez uderzenia daje dodatkowy bonus zależny od bliskości
- Każde uderzenie w pachołek podwaja twój mnożnik combo (x2, x4, x8...) — działa na wszystkie kolejne punkty; uderzenie w mur zeruje combo
- Pełna pętla wokół jednej z dwóch rond daje bonus "PĘTLA!", a przejechanie obu rond pod rząd (w ciągu 7s) daje dodatkowy bonus "ÓSEMKA!"

**Telefon/tablet:** na urządzeniach dotykowych klawiatura jest automatycznie zastępowana wirtualnymi przyciskami (◀ ▶ w lewym dolnym rogu, GAZ i POMPUJ/DRIFT w prawym) — działa w pionie i poziomie, wspiera notch/safe-area na iOS. Dotknięcie ekranu w fazie pompowania też działa, na wypadek gdyby wykrywanie dotyku zawiodło.

## Dźwięk

Cały dźwięk jest syntezowany w locie przez Web Audio API — brak plików audio, więc strona zostaje lekka i samowystarczalna:
- pisk opon narasta i cichnie razem z intensywnością driftu
- uderzenie w pachołek i utrata combo mają własne efekty dźwiękowe
- kwestie Bukovskiego są też **mówione na głos** przez wbudowaną syntezę mowy przeglądarki (Web Speech API, głos polski), z tempem i wysokością rosnącymi wraz z jego wkurwieniem

Przycisk 🔊/🔇 w prawym górnym rogu HUD wycisza wszystko naraz (w tym mowę).
