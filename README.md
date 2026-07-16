# Turbo Kret Drift

Przeglądarkowa gra żartobliwa w klimacie JDM anime: napompuj kreta w gaciach Bukovskiego do pełnej turbiny (która strzela ogniem!), zamień się w fioletowe BMW E36 touring w stylu JDM — z naklejkami sponsorskimi i wydechem strzelającym ogniem podczas driftu — i zdriftuj wybrany tor (rondo albo ósemka) w 40 sekund, żeby maksymalnie go wkurwić. Wpisz nick, wejdź na TOP 5, odblokuj karty Bukovskiego.

Front jest statyczny (`index.html`, bez buildu, bez zależności). Globalna tablica wyników korzysta z jednej serverless function (`api/scores.js`) i bazy Redis (Upstash) podpiętej pod projekt na Vercelu.

## Uruchomienie lokalnie

Wystarczy otworzyć `index.html` w przeglądarce, albo odpalić dowolny lokalny serwer, np.:

```
npx serve .
```

## Deploy na Vercel

1. Zainstaluj CLI (jednorazowo): `npm i -g vercel`
2. W tym folderze uruchom: `vercel` (pierwsze uruchomienie poprosi o zalogowanie i nazwę projektu)
3. Do produkcji: `vercel --prod`

Można też wejść na [vercel.com/new](https://vercel.com/new), zaimportować to repo z GitHuba i wdrożyć bez CLI — Vercel sam wykryje statyczną stronę i `api/scores.js` jako funkcję, nic więcej nie trzeba konfigurować.

## Backend tablicy wyników (Vercel Storage + Upstash Redis)

`api/scores.js` to pojedyncza funkcja Vercela, która rozmawia bezpośrednio z REST API Upstasha (bez żadnej biblioteki npm) — czyta i zapisuje jeden sorted set w Redisie.

1. W projekcie na Vercelu: **Storage → Create Database → Upstash for Redis** (albo połącz istniejącą, tak jak już zrobiłeś).
2. Vercel sam wstrzykuje zmienne środowiskowe (`KV_REST_API_URL` / `KV_REST_API_TOKEN` albo `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`, w zależności od tego jak dokładnie łączyłeś) — funkcja obsługuje obie nazwy, więc nic nie trzeba ręcznie ustawiać.
3. Redeploy po połączeniu bazy (albo po każdym pushu — Vercel robi to automatycznie).

**Endpoint:**
- `GET /api/scores` → `{ top: [...5 najlepszych], bottom: [...5 najgorszych] }`
- `POST /api/scores` z body `{ name, score, mode }` → zapisuje wynik i zwraca to samo co GET

**Ograniczenia, o których warto wiedzieć:** to prosty, nieuwierzytelniony endpoint — każdy, kto zna adres, może wysłać dowolny wynik bezpośrednio przez API (z pominięciem samej gry). Funkcja waliduje typy i utnie absurdalne wartości (limit 200 000 pkt — realne wyniki w grze mieszczą się w setkach/tysiącach, więc to tylko siatka bezpieczeństwa; nick maks. 16 znaków, oczyszczony ze znaków HTML), ale to nie jest pełny anti-cheat — dla żartobliwej gry ze znajomymi to akceptowalne ryzyko, ale nie polegaj na tym rankingu jako na czymś odpornym na złośliwe wpisy.

Jeśli strona jest otwarta poza Vercelem (np. w podglądzie artefaktu albo lokalnie z pliku), `/api/scores` nie istnieje — front łapie błąd i po cichu przełącza się na tablicę zapisywaną w `localStorage` przeglądarki, żeby gra dalej działała.

## Wypchnięcie na GitHub

```
git remote add origin <adres-twojego-repo-na-githubie>
git push -u origin main
```

(Repo trzeba wcześniej założyć na github.com albo przez `gh repo create`.)

## Sterowanie

**Klawiatura:**
- Spacja — pompowanie turbiny / hydrołapa (hydrauliczny hamulec ręczny) podczas jazdy
- W / Strzałka w górę — gaz
- Strzałki w lewo/prawo lub A/D — skręt; hydrołapa zrywa przyczepność i pogłębia poślizg
- Punkty wpadają wyłącznie podczas driftu po animowanej, świecącej czerwonej linii. Wynik rośnie wraz z prędkością, kątem poślizgu i dokładnością utrzymania auta na linii. Na rondzie linia biegnie dookoła ronda, a na drugim torze tworzy cyfrę 8
- Uderzenie w mur (skraj areny) odbiera połowę dotychczas zdobytych punktów — bądź precyzyjny
- Pełna pętla pokazuje komunikat "PĘTLA!", a przejechanie obu pętli ósemki pod rząd pokazuje "ÓSEMKA!" — te komunikaty nie dodają punktów
- Pachołki stoją w dwóch pierścieniach — na wewnętrznej i zewnętrznej krawędzi pasa driftu — więc jedziesz środkiem między nimi, nie przez nie

## Tor, nick, TOP 5 i karty

Na ekranie startowym wybierasz tor (**Rondo** — jedna pętla, albo **Ósemka** — dwie) i wpisujesz nick. Po rundzie ekran końcowy pokazuje **globalny** ranking — TOP 5 najlepszych wyników i 5 najgorszych, widoczne dla wszystkich graczy (Twój aktualny wynik podświetlony), zapisywane we wspólnej bazie Redis (patrz sekcja o backendzie wyżej).

Na ekranie startowym widać też galerię kart Bukovskiego, odblokowywanych za wynik: 1500 pkt = "Bukovski Bojowy", 3500 pkt = "Bukovski Legenda" (progi dobrane pod nową, trudniejszą punktację — dobra runda to raczej setki/tysiące punktów niż miliony). Odblokowaną kartę można kliknąć — pokazuje obrazek i krótki żartobliwy "raport" z podziękowaniem za wkurwienie Bukovskiego. (Poproszono kiedyś o karty w bardziej rozebranej wersji Bukovskiego — celowo tego nie zrobiłem, bo to realna, nazwana osoba, i nie tworzę seksualizowanych wizerunków bez jej zgody; obie karty są w pełni ubrane, w tym samym żartobliwym klimacie co reszta gry.)

**Telefon/tablet:** na urządzeniach dotykowych klawiatura jest automatycznie zastępowana wirtualnymi przyciskami (◀ ▶ w lewym dolnym rogu, GAZ i POMPUJ/HYDROŁAPA w prawym) — działa w pionie i poziomie, wspiera notch/safe-area na iOS. Dotknięcie ekranu w fazie pompowania też działa, na wypadek gdyby wykrywanie dotyku zawiodło.

## Dźwięk

Większość efektów jest syntezowana w locie przez Web Audio API, a główne brzmienie samochodu korzysta z dołączonego nagrania `assets/shelby-gt500-v8.mp3`:
- każde pompowanie turbiny uruchamia narastające `sututututu` typu turbo flutter, a pełne doładowanie kończy się głośnym blow-off `pssshh–tutututu`
- prawdziwe nagranie Shelby GT500 V8 jest zapętlone, przyspiesza wraz z prędkością i współpracuje z syntetycznym odcięciem oraz strzałami wydechu
- pisk opon narasta i cichnie razem z intensywnością driftu
- uderzenie w pachołek i uderzenie w mur (utrata połowy punktów) mają własne efekty dźwiękowe
- kwestie Bukovskiego są też **mówione na głos** przez wbudowaną syntezę mowy przeglądarki (Web Speech API, głos polski), z tempem i wysokością rosnącymi wraz z jego wkurwieniem

Przycisk 🔊/🔇 w prawym górnym rogu HUD wycisza wszystko naraz (w tym mowę).

Trzymanie gazu podczas jazdy powoduje ciągłe płomienie z wydechu; na odcięciu płomienie i strzały pojawiają się częściej.
