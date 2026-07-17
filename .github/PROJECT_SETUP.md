# Konfiguracja GitHub Projects (board)

Ten plik to instrukcja do ręcznego wykonania w UI GitHuba - nie ma automatyzacji, która to zrobi za Ciebie.

## 1. Założenie boardu

1. Wejdź na stronę repo -> zakładka **Projects** -> **New project**.
2. Wybierz szablon **Board**.
3. Nazwa np. `Turbo Kret Drift - praca`.
4. Domyślne kolumny to zwykle `Todo / In Progress / Done` - zmień/dodaj kolumny tak, żeby było dokładnie:
   - `To do`
   - `In progress`
   - `Review`
   - `Done`
5. Podepnij repo do projektu (**Link a repository**), żeby PR-y i issues dało się dodawać bezpośrednio z boardu.

## 2. Etykiety (labels)

Wejdź w zakładkę **Issues -> Labels** (albo **Settings -> Labels** repo) i dodaj poniższe etykiety. Kolory dobierz wg uznania - poniżej propozycja, żeby osoby i agentów łatwo było odróżnić od obszarów.

| Etykieta | Znaczenie | Sugerowany kolor |
|---|---|---|
| `ja` | Zadanie/PR prowadzone przez Ciebie | `#0E8A16` (zielony) |
| `kolega` | Zadanie/PR prowadzone przez drugiego developera | `#1D76DB` (niebieski) |
| `claude-code` | Zadanie/PR wykonane przez agenta Claude Code | `#B60205` (czerwony) |
| `codex` | Zadanie/PR wykonane przez agenta Codex | `#FBCA04` (żółty) |
| `ui` | Dotyczy UI/nawigacji/frontendu | `#5319E7` (fiolet) |
| `logika/backend` | Dotyczy logiki gry, silnika, API, danych gracza | `#D93F0B` (pomarańcz) |

Każdy PR/issue powinien dostać: jedną etykietę "kto" (`ja` / `kolega` / `claude-code` / `codex`) i jedną etykietę "obszar" (`ui` / `logika/backend`). Można łączyć np. `claude-code` + `ui`, albo `kolega` + `logika/backend` jeśli kolega poprawia coś ręcznie w API.

## 3. Codzienny przepływ

1. Nowe zadanie -> karta w kolumnie `To do`, opisana krótko + etykiety kto/obszar.
2. Zaczynasz pracę -> przenosisz kartę do `In progress` (i dodajesz wpis w `TASKS.md`, patrz sekcja "In progress" tam).
3. Otwierasz PR -> przenosisz kartę do `Review`.
4. PR zmergowany -> przenosisz kartę do `Done` (i przenosisz odpowiadający wpis w `TASKS.md` do "Done" z datą - to powinno się dziać w tym samym PR, patrz szablon PR).

## 4. Dlaczego to osobny plik, a nie automatyzacja

GitHub Projects (nowej generacji, "Projects v2") nie ma prostego sposobu na założenie boardu z poziomu commitów/plików w repo - to ustawienie na poziomie konta/organizacji w UI, nie plik konfiguracyjny w repo. Stąd ten plik jest instrukcją krok po kroku zamiast automatycznie wdrożonej konfiguracji.
