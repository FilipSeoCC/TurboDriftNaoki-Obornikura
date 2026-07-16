# Turbo Kret Drift

Przeglądarkowa gra żartobliwa w klimacie JDM anime: napompuj kreta w gaciach Bukovskiego do pełnej turbiny (która strzela ogniem!), zamień się w fioletowe BMW E36 touring w stylu JDM — z naklejkami sponsorskimi i wydechem strzelającym ogniem podczas driftu — i zdriftuj wybrany tor (rondo albo ósemka) w 40 sekund, żeby maksymalnie go wkurwić. Wpisz nick, wejdź na TOP 5, odblokuj karty Bukovskiego.

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
- Pełna pętla wokół rondo/pętli daje bonus "PĘTLA!"; w trybie ósemki przejechanie obu pętli pod rząd (w ciągu 7s) daje dodatkowy bonus "ÓSEMKA!"
- Pachołki stoją w dwóch pierścieniach — na wewnętrznej i zewnętrznej krawędzi pasa driftu — więc jedziesz środkiem między nimi, nie przez nie

## Tor, nick, TOP 5 i karty

Na ekranie startowym wybierasz tor (**Rondo** — jedna pętla, albo **Ósemka** — dwie) i wpisujesz nick (zapamiętywany w przeglądarce). Po rundzie ekran końcowy pokazuje TOP 5 najlepszych wyników (Twój aktualny wynik podświetlony), zapisywane lokalnie w `localStorage` — nie ma serwera ani konta, wyniki są per przeglądarka/urządzenie.

Na ekranie startowym widać też galerię kart Bukovskiego, odblokowywanych za wynik: 1000 pkt = "Bukovski Bojowy", 2000 pkt = "Bukovski Legenda". (Poproszono o karty w bardziej rozebranej wersji Bukovskiego — celowo tego nie zrobiłem, bo to realna, nazwana osoba, i nie tworzę seksualizowanych wizerunków bez jej zgody; zamiast tego dostał dwie żartobliwe karty w tym samym klimacie co reszta gry.)

**Telefon/tablet:** na urządzeniach dotykowych klawiatura jest automatycznie zastępowana wirtualnymi przyciskami (◀ ▶ w lewym dolnym rogu, GAZ i POMPUJ/DRIFT w prawym) — działa w pionie i poziomie, wspiera notch/safe-area na iOS. Dotknięcie ekranu w fazie pompowania też działa, na wypadek gdyby wykrywanie dotyku zawiodło.

## Dźwięk

Cały dźwięk jest syntezowany w locie przez Web Audio API — brak plików audio, więc strona zostaje lekka i samowystarczalna:
- pisk opon narasta i cichnie razem z intensywnością driftu
- uderzenie w pachołek i utrata combo mają własne efekty dźwiękowe
- kwestie Bukovskiego są też **mówione na głos** przez wbudowaną syntezę mowy przeglądarki (Web Speech API, głos polski), z tempem i wysokością rosnącymi wraz z jego wkurwieniem

Przycisk 🔊/🔇 w prawym górnym rogu HUD wycisza wszystko naraz (w tym mowę).
