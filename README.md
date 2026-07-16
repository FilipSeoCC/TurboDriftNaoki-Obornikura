# Turbo Kret Drift

Przeglądarkowa gra żartobliwa w klimacie JDM anime: napompuj kreta w gaciach Bukovskiego do pełnej turbiny (która strzela ogniem!), zamień się w fioletowe BMW E36 touring w stylu JDM i zdriftuj figurę-8 wokół dwóch pętli z pachołkami, żeby maksymalnie go wkurwić.

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
- Punkty (x2) za przejazd jak najbliżej pachołków w trakcie driftu — im bliżej, tym więcej
- Pełna pętla wokół jednej z dwóch rond daje bonus "PĘTLA!", a przejechanie obu rond pod rząd (w ciągu 7s) daje dodatkowy bonus "ÓSEMKA!"

**Telefon/tablet:** na urządzeniach dotykowych klawiatura jest automatycznie zastępowana wirtualnymi przyciskami (◀ ▶ w lewym dolnym rogu, GAZ i POMPUJ/DRIFT w prawym) — działa w pionie i poziomie, wspiera notch/safe-area na iOS.
