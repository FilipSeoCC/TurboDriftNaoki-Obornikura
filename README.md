# Turbo Mucha Drift

Przeglądarkowa gra żartobliwa w klimacie JDM anime: napompuj kreta do pełnej turbiny (która strzela ogniem!), zamień się w fioletowe BMW E36 touring w stylu JDM — z naklejkami sponsorskimi i wydechem strzelającym ogniem podczas driftu — i zdriftuj wybrany tor (rondo albo ósemka) w 40 sekund, żeby maksymalnie wkurzyć muchę. Wpisz nick, wejdź na TOP 5, odblokuj album zdjęć BMW E36.

**Nowość: 🪰 Mucha za kierownicą.** W wyborze trybu jest opcja, w której autem steruje mózg prawdziwej muszki owocówki: 1926 neuronów wyciętych 1:1 z konektomu FlyWire i symulowanych na żywo w przeglądarce (`fly-brain.js` + `assets/fly-circuit.json`). Mucha widzi czerwoną linię i nadlatujący mur, a jej neurony skrętu kręcą kierownicą, bez żadnego treningu. Szczegóły, źródła i jak odtworzyć obwód: [docs/MUCHA.md](docs/MUCHA.md).

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

Na ekranie startowym widać też **album E36**: 8 zdjęć prawdziwych driftowych BMW (`assets/bmw/e36-01…08.jpg`, ~100 KB każde) odblokowywanych za wynik: 25 / 50 / 80 / 100 / 120 / 150 / 200 / 250 pkt. Odblokowane zdjęcie można kliknąć — otwiera się jak polaroid z komentarzem w stylu wiechowym. Zablokowane nie ładują obrazu (zostaje znak zapytania), więc menu nie ciągnie 800 KB na starcie. Zdjęcia są też losowym tłem ekranów menu. Na zdjęciach widać tablice rejestracyjne i postronne osoby; zdjęcia są własnością autora gry — rozważ rozmycie tablic przed szerszą publikacją.

## Garaż i profile

Każdy ukończony przejazd daje 1000 śrubek. W garażu można wybrać Touring, czarnego sedana z body kitem albo srebrne M3 oraz kupować po trzy poziomy silnika, turbo lub kompresora, wtrysków, pompy paliwa, sprzęgła, skrzyni i opon (500 śrubek za poziom). Turbo wymaga na każdym Stage równie mocnych wtrysków, pompy i sprzęgła, a kompresor równie mocnego sprzęgła; obie ścieżki doładowania są wzajemnie wykluczające. Profil jest przechowywany w Redisie pod znormalizowanym nickiem przez `api/profile.js`. Nick nie jest bezpiecznym kontem i nie ma hasła — osoby używające tego samego nicku współdzielą portfel, auto i tuning.

**Telefon/tablet:** na urządzeniach dotykowych klawiatura jest automatycznie zastępowana wirtualnymi przyciskami (◀ ▶ w lewym dolnym rogu, GAZ i POMPUJ/HYDROŁAPA w prawym) — działa w pionie i poziomie, wspiera notch/safe-area na iOS. Dotknięcie ekranu w fazie pompowania też działa, na wypadek gdyby wykrywanie dotyku zawiodło.

## Dźwięk

Większość efektów jest syntezowana w locie przez Web Audio API, a główne brzmienie samochodu korzysta z dołączonego nagrania `assets/mazda-rx8-dyno.mp3` (dyno Mazdy RX-8):
- każde pompowanie turbiny uruchamia narastające `sututututu` typu turbo flutter, a pełne doładowanie kończy się głośnym blow-off `pssshh–tutututu`
- nagranie jest zapętlone, przyspiesza wraz z prędkością i współpracuje z syntetycznym odcięciem oraz strzałami wydechu. **Sprawdź, skąd pochodzi ten plik** — jeśli to czyjeś nagranie dyno bez jasnej licencji na redystrybucję, warto je zastąpić czymś z potwierdzonymi prawami (własne nagranie, royalty-free, albo zostać przy w pełni syntetycznym silniku sprzed tej zmiany)
- pisk opon narasta i cichnie razem z intensywnością driftu
- uderzenie w pachołek i uderzenie w mur (utrata połowy punktów) mają własne efekty dźwiękowe
- kwestie muchy są też **mówione na głos** przez wbudowaną syntezę mowy przeglądarki (Web Speech API, głos polski), z tempem i wysokością rosnącymi wraz z jej wkurwieniem

Przycisk 🔊/🔇 w prawym górnym rogu HUD wycisza wszystko naraz (w tym mowę).

Trzymanie gazu podczas jazdy powoduje ciągłe płomienie z wydechu; na odcięciu płomienie i strzały pojawiają się częściej.

## Mucha jako przeciwnik i wyścig much w kasynie

- **Przeciwnik:** przycisk „🪰 MUCHA JAKO PRZECIWNIK” dodaje na torze czerwone E36 prowadzone przez własny obwód neuronów (ta sama fizyka i punktacja co gracz: `rival-car.js`). Mózg liczy się w Web Workerze (`fly-agent.js`, `fly-brain-worker.js`). Jeśli mucha wygra, pojawia się plansza „Masz za małe kule he he”.
- **Wyścig much (kasyno):** losowa para aut z konfiguracji seryjnych, dwa osobne mózgi, 30 s, wygrywa wyższy wynik; wypłata ×1,9, remis zwraca stawkę. Stawkę pobiera serwer (`api/_lib/flybet.js`, akcje `fly_bet_place` / `fly_bet_settle`).
- **Uczciwie o ograniczeniu:** zwycięzcę zgłasza klient, serwer go nie weryfikuje (pilnuje tylko stawki, biletu, minimalnego czasu 20 s i ważności 15 min). W grze wirtualnej za śrubki to akceptowalne; przed jakąkolwiek wartością realną wymagałoby to symulacji po stronie serwera.
- **Kasyno** (blackjack, wyścig much, plansza wygranej) ma stylistykę vintage: zielone sukno, mosiądz, kremowe karty.
