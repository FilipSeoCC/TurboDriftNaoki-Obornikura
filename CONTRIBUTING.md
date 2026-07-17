# Jak pracujemy w tym repo

Zespół: Ty, kolega (drugi developer) oraz dwaj agenci - Claude Code (UI/nawigacja/frontend) i Codex (logika gry/backend). Ten dokument to skrócony workflow dla wszystkich czterech.

## Zasady

1. **Nigdy commit na main.** Wszystko idzie przez branch + PR.
2. **Branch naming:** `feat/<osoba-lub-agent>-<krótki-opis>` (np. `feat/kolega-fix-scoring`, `feat/claude-code-navigation`, `feat/ja-readme`). Dla prac porządkowych/procesowych używaj `chore/<opis>` zamiast `feat/`.
3. **PR jest wymagany** dla każdej zmiany, także drobnej.
4. **Review od drugiej osoby przed mergem.** Jeśli PR robi agent, review i tak robi człowiek (Ty albo kolega) - agenci nie mergują sami.
5. **Przed startem zadania:** sprawdź `TASKS.md` (sekcja "In progress") i board (`.github/PROJECT_SETUP.md`), żeby nie robić czegoś, co już ktoś robi.
6. **Po zadaniu:** przenieś wpis w `TASKS.md` do "Done" z datą, przenieś kartę na boardzie do `Done`, oznacz PR etykietami kto/obszar - patrz `.github/PULL_REQUEST_TEMPLATE.md`.
7. **Trzymaj się swojego obszaru** (patrz `.github/CODEOWNERS`): UI/nawigacja/frontend vs logika gry/backend. Jeśli zadanie wymaga wejścia w drugi obszar, zatrzymaj się i zapytaj/zsynchronizuj zamiast zgadywać.

## Skrócony przepływ

```
sprawdź TASKS.md / board
  -> checkout -b <branch wg konwencji nazw>
  -> praca + commity
  -> zaktualizuj TASKS.md (przenieś zadanie do Done)
  -> otwórz PR (szablon wypełnia się checklistą automatycznie)
  -> review od drugiej osoby
  -> merge
```

## Gdzie szukać więcej

- Kto za co odpowiada w kodzie: `.github/CODEOWNERS`
- Board i etykiety: `.github/PROJECT_SETUP.md`
- Aktualny stan zadań: `TASKS.md`
