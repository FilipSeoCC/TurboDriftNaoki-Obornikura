# Zadania

Wspólna lista zadań dla zespołu: ja, kolega (drugi developer) oraz agenci
Claude Code (UI/nawigacja/frontend) i Codex (logika gry/backend). Przed
startem nowego zadania sprawdź, czy nie jest już w "In progress" (tu albo na
boardzie - patrz `.github/PROJECT_SETUP.md`). Po skończeniu zadania przenieś
je do "Done" (z datą) w tym samym PR, w którym robisz zmianę.

Format wpisu: `[agent / osoba] opis`. Jeśli zadanie robi agent bez
konkretnej osoby przypisanej (np. zadanie zlecone od razu w treści promptu),
wystarczy `[agent]`.

## In progress

- [codex / ja] Fast login przez Google (OAuth) - potwierdzone przez ja (2026-07-18). Backend/auth, poza obszarem Claude Code. Do wyjaśnienia przy implementacji: skąd/po co placeholder e-maila `email@lizmejaja.pl` wspomniany przez Codeksa - opisać w PR jaką rolę pełni, zanim wyląduje w kodzie.

## Done

- [codex] Wieloosobowy tryb obecności (multiplayer presence) w `api/room.js` (2026-07-17)
- [codex] Zapis profilu/tuningu per samochód w `api/profile.js` (2026-07-17)
- [codex] Kasyno Blackjack (serwerowo losowany wynik) (2026-07-18)
- [codex] PWA: manifest, service worker, ikony (2026-07-18)
- [codex] Zbieranie e-maili graczy za zgodą + regulamin/polityka prywatności (2026-07-18)
- [claude-code / ja] Trzeci tor "Uliczny" (prostokąt z szykaną) w `index.html` (2026-07-18)
- [claude-code / ja] Konfiguracja infrastruktury współpracy: TASKS.md, CODEOWNERS, PR template (2026-07-18)
- [claude-code / ja] Rozszerzenie infrastruktury o drugą osobę: format TASKS.md, PROJECT_SETUP.md, CONTRIBUTING.md (2026-07-18)
- [claude-code / ja] Przebudowa nawigacji: login -> powitanie -> hub -> garaż -> tor -> tryb -> wyścig, globalny przycisk Menu, naprawa menedżera muzyki (visibilitychange) (2026-07-18)
- [claude-code / ja] CLAUDE.md + AGENTS.md: mechanizm delegacji zadań do Codexa (manualny relay przez użytkownika - brak bezpośredniego API/CLI między agentami w tym środowisku) (2026-07-18)

<!--
Wpisy sprzed dołączenia kolegi do zespołu zostały bez przypisanej osoby
(oznaczone samym agentem) - nie da się tego wiarygodnie odtworzyć wstecz.
Od teraz nowe wpisy powinny używać pełnego formatu [agent / osoba].
-->
