# Codex issue worker 24/7

Workflow `.github/workflows/codex-issue-worker.yml` uruchamia Codexa na runnerze GitHub po otwarciu, ponownym otwarciu lub odpowiednim oznaczeniu issue. Lokalny komputer i aplikacja Codex nie muszą być włączone.

## Jednorazowa konfiguracja

1. Utwórz klucz OpenAI API z aktywnym rozliczaniem API.
2. W repozytorium otwórz **Settings → Secrets and variables → Actions → New repository secret**.
3. Dodaj sekret o dokładnej nazwie `OPENAI_API_KEY`. Nigdy nie zapisuj jego wartości w pliku, issue ani logu.
4. Otwórz **Settings → Actions → General → Workflow permissions**:
   - wybierz **Read and write permissions**;
   - zaznacz **Allow GitHub Actions to create and approve pull requests**.
5. Pozostaw ochronę `main`: PR i ludzkie review są nadal wymagane. Worker tworzy wyłącznie draft PR i nie wykonuje merge.

Koszty uruchomień są naliczane na koncie OpenAI API powiązanym z kluczem, niezależnie od abonamentu ChatGPT.

## Uruchamianie

Najprościej utworzyć issue z formularza **Zadanie dla Codexa — backend/logika**. Formularz dodaje etykiety:

- `codex`
- `logika/backend`

Workflow przyjmuje zadanie wyłącznie, gdy autor issue ma w repo status `OWNER`, `MEMBER` albo `COLLABORATOR`. Publiczne issue obcej osoby nie uruchomi modelu nawet po samodzielnym dodaniu etykiet.

Automat dodaje status:

- `codex-in-progress` — praca trwa;
- `codex-review` — draft PR czeka na człowieka;
- `codex-blocked` — potrzebna jest interwencja i sprawdzenie logu Actions.

Ponowne uruchomienie zablokowanego issue: doprecyzuj opis, usuń `codex-blocked`, a następnie usuń i ponownie dodaj `codex` albo zamknij i otwórz issue ponownie.

## Granice bezpieczeństwa

- Jedno issue może mieć tylko jedno aktywne uruchomienie (`concurrency`).
- Otwarte PR-y i statusy issue zapobiegają ponownemu podjęciu zadania.
- Treść issue jest przekazywana jako niezaufana specyfikacja i nie może zmienić roli ani ujawnić sekretów.
- Codex działa w `workspace-write` po usunięciu `sudo`.
- Kontrola zakresu odrzuca zmiany poza backendem, testami, dokumentacją kontraktu, `TASKS.md` i plikami pakietu.
- Każda implementacja przechodzi `node --check`, test z `package.json` (jeżeli istnieje) i `git diff --check`.
- Push oraz draft PR wykonuje dopiero zaufany krok workflow po kontroli zmian.
- Merge zawsze wykonuje człowiek.

## Diagnostyka

Stan uruchomień jest widoczny w zakładce **Actions → Codex backend issue worker**. Jeśli sekret nie istnieje, pierwszym błędem będzie `Missing repository secret OPENAI_API_KEY`.
