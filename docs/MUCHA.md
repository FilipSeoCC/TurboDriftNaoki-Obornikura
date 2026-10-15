# 🪰 Mucha za kierownicą

Tryb, w którym fioletowym E36 steruje **mózg prawdziwej muszki owocówki** (*Drosophila melanogaster*). To nie AI ani bot: to fragment mapy połączeń neuronów (konektomu) odczytanej z mózgu muchy pod mikroskopem elektronowym, uruchomiony w przeglądarce w czasie rzeczywistym. **Nic nie jest trenowane i żadna waga nie jest ręcznie strojona.**

## Skąd jest mózg

| Co | Źródło |
|---|---|
| Połączenia (kto z kim, ile synaps, pobudzające/hamujące) | Konektom **FlyWire v783**, tabela połączeń z repo [philshiu/Drosophila_brain_model](https://github.com/philshiu/Drosophila_brain_model) (MIT) |
| Typy komórek i półkule (LC10a, DNa02…) | Oficjalne adnotacje FlyWire: [flyconnectome/flywire_annotations](https://github.com/flyconnectome/flywire_annotations) |
| Model neuronu i parametry | Shiu et al. 2024 — leaky integrate-and-fire, krok 0,1 ms, opóźnienie 1,8 ms, 0,275 mV na synapsę |

Prace źródłowe:
- Dorkenwald et al., *Neuronal wiring diagram of an adult brain*, Nature 2024 (FlyWire)
- Schlegel et al., *Whole-brain annotation and multi-connectome cell typing of Drosophila*, Nature 2024
- Shiu et al., *A Drosophila computational brain model reveals sensorimotor processing*, Nature 2024

## Jak z całego mózgu zrobił się obwód do gry

Cały mózg to ok. 139 tys. neuronów i 15 mln połączeń. To za dużo na telefon, więc skrypt [`tools/fly/extract_circuit.py`](../tools/fly/extract_circuit.py):

1. Symuluje **cały mózg** przy 28 kombinacjach bodźców, jakie może dać gra (linia z lewej/prawej, mur z lewej/prawej, różne natężenia).
2. Zostawia tylko neurony, które **choć raz wystrzeliły**, plus wszystkie wejścia i wyjścia. Wynik to **1926 neuronów, 135 tys. połączeń i 1,2 mln synaps**. Neuron, który nigdy nie strzela, na nic nie wpływa, bo synapsy działają tylko przez impulsy.
3. Porównuje obwód z pełnym mózgiem na nowych, losowych bodźcach. Średnia różnica częstotliwości neuronów wyjściowych wynosi **1,3 Hz**.

Plik `assets/fly-circuit.json` odtwarza się z publicznych danych bajt w bajt (instrukcja w nagłówku skryptu).

## Co mucha „widzi” i czym „kręci”

```
GRA                         MÓZG MUCHY                              AUTO
czerwona linia z lewej  →  LC10a lewa półkula (115 neuronów)  ─┐
czerwona linia z prawej →  LC10a prawa półkula (119)           ├→ DNa02 / DNa01 L/P  →  kierownica
mur nadlatuje z lewej   →  LPLC2 + LC4 lewe (162)              │
mur nadlatuje z prawej  →  LPLC2 + LC4 prawe (152)            ─┤→ DNp01 „giant fiber” → hydrołapa
                                                               └→ MDN „moonwalker”    → puszcza gaz
```

- **LC10a** to neurony wzrokowe reagujące na mały obiekt w polu widzenia (samiec używa ich do pościgu za samicą). Punkt na czerwonej linii przed maską jest dla muchy takim obiektem.
- **LPLC2 / LC4** to detektory „coś na mnie leci” (looming). Mur zbliżający się z jednej strony pobudza je po tej stronie.
- **DNa02 / DNa01** to neurony zstępujące, którymi prawdziwa mucha skręca.
- **DNp01 (giant fiber)** to odruch ucieczki (u muchy skok), a w grze hydrołapa.
- **MDN** to neurony „chodu do tyłu”; w grze mucha odpuszcza wtedy gaz.

## Co wyszło z symulacji pełnego mózgu (bez strojenia)

| Bodziec | Odpowiedź mózgu | Zachowanie |
|---|---|---|
| obiekt z **lewej** (LC10a) | DNa02 **lewy** ~55 Hz, prawy 0 | skręt **do** celu (pościg) |
| obiekt z **prawej** | DNa02 **prawy** ~55 Hz, lewy 0 | skręt **do** celu |
| looming z **lewej** (LPLC2+LC4) | DNa01/DNa02 **prawe** + giant fiber ~300 Hz | ucieczka **od** zagrożenia |
| looming z **prawej** | DNa02 **lewy** + giant fiber | ucieczka w drugą stronę |

Ta sama sieć sama z siebie robi pościg i ucieczkę, czyli dokładnie to, czego potrzeba do jazdy po linii bez walenia w mur.

## Co jest „nasze”, a nie z muchy

Uczciwie: jedyne decyzje projektowe to tłumaczenie gra ↔ mucha w [`fly-brain.js`](../fly-brain.js):
- jak mocno świeci bodziec, czyli maks. 90 Hz dla LC10a (powyżej ~120 Hz obwód sam się hamuje) i 140 Hz dla loomingu,
- gdzie mucha patrzy (punkt na linii ~70 px + prędkość przed autem) i pod jakim kątem „widzi” mur (±34°),
- jak częstotliwość neuronów skrętu zamienia się na kierownicę (30 Hz różnicy = pełny skręt), próg giant fiber dla hydrołapy (260 Hz) i MDN dla odpuszczenia gazu (4 Hz).

Mucha jeździ autem gracza z jego tuningiem. Nie zarabia śrubek, nie odblokowuje kart i nie nadpisuje Twojego ducha rekordu. Jej wynik trafia do rankingu jako **🪰 MUCHA**.

## Wyniki testowe (headless Chromium, 40 s)

| Tor | Wynik muchy |
|---|---|
| Rondo | 642 pkt |
| Ósemka | 195 pkt |
| Uliczny | 175 pkt |

Wyniki się różnią między przejazdami, bo neurony wejściowe strzelają losowo (proces Poissona), tak jak w oryginalnym modelu.

## Testy

`test/fly-brain.test.js` sprawdza na okrojonym obwodzie, że pościg w lewo/prawo, ucieczka od muru i giant fiber działają tak jak w pełnym mózgu.
