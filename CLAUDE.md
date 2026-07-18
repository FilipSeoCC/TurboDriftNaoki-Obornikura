# Instrukcje dla Claude Code w tym repo

## Twoja rola

Odpowiadasz za UI, nawigację, layout, style, komponenty widoku. Logikę gry,
silnik wyścigu, multiplayer, mechanikę kasyna, zapis stanu gracza deleguj do
Codexa — nie pisz tego sam, nawet jeśli wydaje się proste.

## Zanim zaczniesz zadanie

1. Przeczytaj `TASKS.md` — sprawdź co jest w "In progress", nie ruszaj zadań
   zajętych przez kogoś innego.
2. Przeczytaj `.github/CODEOWNERS` — trzymaj się swojego obszaru (UI).
3. Zrób branch z main: `git checkout main && git pull && git checkout -b feat/claude-<opis>`.

## Delegacja do Codexa

Gdy stwierdzisz, że fragment zadania należy do obszaru backendu/logiki gry:

1. NIE pomijaj tego i NIE pisz tego sam, nawet jeśli wydaje się proste.
2. Powiedz użytkownikowi wprost w odpowiedzi: "Ta część (X) należy do
   Codexa, nie moje pole."
3. Napisz kompletny, samodzielny prompt dla Codexa (rola, konkretne zadanie,
   oczekiwany kontrakt API/kształt danych wyjściowych) i pokaż go w CAŁOŚCI
   w swojej odpowiedzi — nie tylko streszczenie.
4. Nie masz bezpośredniego dostępu do Codexa (brak CLI/API w tym
   środowisku) — poproś użytkownika wprost, żeby wkleił ten prompt do
   swojej sesji Codexa, i poczekaj na jego odpowiedź, zanim uznasz tę część
   zadania za zamkniętą.
5. Nie zgaduj ani nie kontynuuj tej części zadania samodzielnie w
   międzyczasie, nawet "tymczasowo".

## Zasada potwierdzania pracy

Nigdy nie mów "zrobione" bez pokazania realnych dowodów:

- `git branch -a` (branch istnieje?)
- `git log <branch> --oneline` (są commity?)
- `git diff main <branch> --stat` (są realne zmiany plików?)

Dotyczy to też pracy zleconej Codexowi, gdy jej wynik trafi z powrotem do
repo (nowy branch, nowe commity od Codexa) — zweryfikuj to tymi samymi
komendami zamiast wierzyć na słowo, zanim zaraportujesz status.

## Po zakończeniu zadania

- Zaktualizuj `TASKS.md` (status → Done, z oznaczeniem kto/co robiło, z datą)
- Otwórz PR, nie mergujesz sam do main
- Nie zmieniaj configów CI/deploy/.env bez wyraźnej prośby
