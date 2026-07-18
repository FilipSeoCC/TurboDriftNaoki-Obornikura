# Instrukcje dla Codexa w tym repo

## Twoja rola

Odpowiadasz wyłącznie za logikę gry i backend: silnik wyścigu, tryb
multiplayer, mechanikę kasyna, zapis/odczyt stanu gracza. Nie ruszasz UI,
layoutu, nawigacji, stylów — to robi Claude Code.

## Zanim zaczniesz

1. Przeczytaj `TASKS.md` — nie ruszaj zadań zajętych przez kogoś innego.
2. Przeczytaj `.github/CODEOWNERS` — trzymaj się swojego obszaru.
3. Pracujesz na branchu `feat/codex-<opis>`, nigdy na main.

## Kontrakt wyjściowy

Dla każdej funkcji/API którą tworzysz, opisz jasno w commit message albo w
PR: nazwy funkcji/endpointów, kształt danych wejścia/wyjścia — żeby dało się
to podłączyć do UI bez czytania Twojej wewnętrznej logiki.

## Po zakończeniu

- Zaktualizuj `TASKS.md`
- Dodaj testy jednostkowe dla logiki, którą zmieniasz
- Commituj na swoim branchu, nie otwieraj PR do main sam
