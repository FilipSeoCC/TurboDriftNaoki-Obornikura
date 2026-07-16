# Turbo Kret Drift

Przeglądarkowa gra żartobliwa: napompuj kreta w gaciach Bukovskiego do pełnej turbiny, potem zdriftuj BMW E36 touring dookoła ronda, żeby maksymalnie go wkurwić.

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

- Spacja — pompowanie turbiny / handbrake w trybie driftu
- W / Strzałka w górę — gaz
- Strzałki w lewo/prawo lub A/D — skręt
- Drift dookoła ronda (żółte pachołki) daje bonus "RONDO!" i najbardziej wkurza Bukovskiego
