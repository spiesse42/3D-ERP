# Kritische doorlichting — 3D Print ERP (2026-09-10)

_Op verzoek: "Loop nu nog eens heel kritisch door het ganse pakket en stel voor wat anders kan (layout, werkwijze, flow, ...)." Dit is een verzamel- en prioriteitendocument, geen actielijst die al uitgevoerd is — niets hieronder is gebouwd, dit is puur een bevindingenlijst ter bespreking. Methodiek: het volledige pakket vers van het toestel gehaald en in 3 delen (verkoop/productieflow, data-beheer, navigatie/layout/instellingen) grondig doorgelicht. De belangrijkste/meest verrassende bevindingen zijn nadien persoonlijk met grep/broncode geverifieerd vóór opname hier — waar dat niet kon (bv. omdat het live rendering of live data vereist), staat dat er expliciet bij._

_Bekende, bewust zo gebouwde keuzes zijn NIET opnieuw als probleem opgevoerd: Dashboard blijft bewust compact t.o.v. Jobs, geen BTW-regel op documenten (vrijstellingsregel art. 56bis), machinekost per specifieke printer met terugval op het globale tarief, BMCU-vaste kost, facturatienummers uitsluitend intern, Kobra cloud-only zonder live telemetrie, Bambu-camera bewust gedeprioriseerd._

---

## A. Financieel/administratief risico — hoogste prioriteit

Dit zijn de bevindingen die rechtstreeks met geld, boekhouding of documenten-naar-de-klant te maken hebben. Persoonlijk geverifieerd in de broncode, niet enkel gerapporteerd.

**1. De BTW-knop in het job-kostenscherm ("€ Kost") is dode UI die een verkeerde indruk geeft — Hoog.**
`KostenModal.jsx` heeft nog een volledig werkende "BTW 21% (zakelijk)"-checkbox: ze toont een live BTW-berekening in de modal zelf en hangt `&btw=1` aan de PDF-/e-maillink. Maar `kosten.js`'s `buildPdfHtml()` leest die query-parameter **helemaal nooit** — bevestigd via broncode: er staat zelfs een commentaarregel die expliciet zegt dat de BTW-schakelaar sinds de vrijstellingsregel overal verwijderd is. Het resultaat: je vinkt "BTW 21%" aan, ziet in de modal een ander (hoger) totaalbedrag, maar de effectief gegenereerde PDF/e-mail toont gewoon altijd het bedrag zonder BTW. Dit is geen risico op een foutieve BTW-vermelding (die kán niet meer op een PDF komen), maar wél een verwarrende/misleidende schermweergave — het lijkt iets te doen wat het niet doet.

**2. Er bestaan twee losse "werkbon"-documenten voor dezelfde job — Hoog.**
De "€ Kost"-knop op een job opent een modal die zelf ook "Werkbon — {jobnaam}" heet, met een eigen PDF (kop "WERKBON"), eigen e-mailknop en eigen statusknoppen. Dat is volledig los van de échte Werkbon (via Offerte → "Maak werkbon", op de Werkbons-pagina), met een eigen PDF, eigen e-mailknop, eigen betaal-/factuurstatus. Voor een job die wél aan een werkbon-regel gekoppeld is, kun je dus per ongeluk het verkeerde document naar de klant sturen — met mogelijk een ander bedrag. Dit lijkt een overblijfsel van vóór de werkbon/job-ontkoppeling (sessie "deel 11").

**3. Downloaden van de job-PDF wijzigt stilzwijgend de jobstatus; downloaden van de echte Offerte-/Werkbon-PDF doet dat niet — Middelhoog/Hoog.**
Klik op "↓ Download" in `KostenModal` zet de jobstatus automatisch van "gecontroleerd" naar "gefactureerd". Dezelfde handeling (PDF downloaden) op Offertes/Werkbonnen heeft nooit een bijwerking. Onvoorspelbaar gedrag voor exact dezelfde knop-actie, afhankelijk van welk scherm je toevallig in zit.

**4. Jobstatus kan een waarde krijgen die de eigen statuslijst niet aanbiedt — Middelhoog.**
`Jobs.jsx`'s statusdropdown kent enkel productiestatussen (in te plannen/gepland/bezig/voltooid/gefaald/geannuleerd). Maar via bovenstaande "€ Kost"-flow kan een job wél op "gecontroleerd" of "gefactureerd" komen te staan — waarden die niet in die dropdown voorkomen. Open je dan het gewone bewerkformulier, dan toont een `<select>` een waarde die niet bij zijn eigen opties hoort; een onbedoelde klik kan de status ongemerkt terugzetten.

**5. Het globale "machinekost per uur"-tarief (terugval als een printer er zelf geen heeft) staat nergens in Instellingen — Hoog, bevestigd.**
`regelmotor.js`, `offertes_v2.js` en `regelEditor.jsx` gebruiken alle drie `t.machine_per_uur` (met stille standaardwaarde €0,13) als een printer geen eigen tarief heeft. Maar de tarievenlijst in `Instellingen.jsx` (`GROEPEN`) bevat dat veld nergens — het is dus onzichtbaar/onbewerkbaar via de app zelf. Wie dat tarief wil aanpassen, kan dat nu niet.

**6. Een werkbon ontvangen via Offerte kan achteraf geen regel meer bijkrijgen — Hoog, bevestigd.**
De "✏ Bewerken"-knop op een werkbon is expliciet enkel zichtbaar `!w.offerte_id` (dus alleen voor een los aangemaakte werkbon). Een heel gewoon scenario — "klant wil er nog eentje bij" nadat de werkbon al bestaat — heeft dus geen pad in de app zolang die werkbon uit een offerte komt; je zou een volledig aparte tweede werkbon moeten maken (twee documenten, twee betaalopvolgingen voor dezelfde klant/opdracht).

**7. Verwijderbevestiging bij een offerte beweert het tegenovergestelde van wat er echt gebeurt — Hoog.**
De bevestigingstekst zegt: "Offerte verwijderen? De gekoppelde werkbon wordt ook verwijderd." Maar de backend (en zijn eigen code-commentaar) doet net het omgekeerde: de werkbon blijft bewust bestaan, enkel de link terug naar de offerte wordt losgemaakt. Een waarschuwing vlak vóór een onomkeerbare actie die het verkeerde vertelt, is op zich al een probleem — welke kant ook fout is.

**8. Bestelling ontvangen (voorraad binnenkrijgen) maakt geen boekhoudkundig spoor — Hoog, bevestigd.**
`bestellingen.js` bevat helemaal geen enkele verwijzing naar de `uitgaven`-tabel (0 treffers). Voorraad ontvangen via de Bestellingen-pagina (de voor-de-hand-liggende weg bij een gewone leverancierslevering) registreert dus nooit een uitgave en koppelt nooit een `factuur_id` — enkel de aparte "Factuur inlezen"-flow (los OCR-scherm) doet dat wél. Wie gewoon zijn normale bestel→ontvangst-flow volgt, krijgt stock zonder kostprijs-spoor in Financiën, tenzij hij daarnaast nog eens apart een uitgave/factuur inboekt (met risico op dubbel).
_Ligt in het verlengde hiervan (niet apart geverifieerd, wel plausibel): "Materiaalkosten" in het Financiën-overzicht zou hierdoor structureel te laag kunnen uitvallen, en de omzetdrempel-/winstberekening zou dat foutief kunnen meenemen — dit verdient een blik op echte cijfers voor het als vaststaand wordt aangenomen._

**9. Twee losse "is dit betaald"-bedieningen op een werkbon kunnen uit sync raken — Middelhoog.**
De statusdropdown (met "betaald" als waarde) én een apart aan-/uitvinkbaar "Betaald"-vakje bestaan naast elkaar en kunnen onafhankelijk bediend worden. Het is dus mogelijk dat `betaald = true` staat terwijl de status nog "gefactureerd" toont, of omgekeerd — net voor iemand die zijn facturatie-opvolging hierop baseert.

---

## B. Offerte→werkbon→levering-flow — structuur en gemak

**10. Offertes is het enige document in de hele keten zonder een "verstuur per e-mail"-knop — Hoog.**
Werkbon, pakbon en de job-kostenfiche hebben elk een ✉ Mail-knop. De offerte — het allereerste document, meestal net na een gesprek met een klant, vaak vanaf de telefoon verstuurd — heeft enkel "↓ PDF downloaden". Je moet dus zelf de PDF opslaan, in je eigen mailprogramma verzenden, en nadien zelf onthouden de offertestatus van "concept" naar "verstuurd" te zetten. Precies het eerste, meest gebruikte document mist de vlotste flow.

**11. "Maak werkbon" heeft geen bevestiging, en een werkbon kan nergens via de UI verwijderd worden — Middelhoog.**
Klikken op "Maak werkbon" gebeurt zonder enige "weet je het zeker?" — terwijl dat de offerte stempelt als "goedgekeurd" en een echt document aanmaakt. Sluiten van een modal zonder opslaan vraagt wél om bevestiging; deze onomkeerbare actie niet. Er bestaat ook geen verwijderknop voor een werkbon in de UI (de backend-route bestaat wel) — bij een misklik zit je eraan vast.

**12. "Maak werkbon" kan ook op een nog niet goedgekeurde offerte — Middelhoog.**
De knop is klikbaar op elke offerte die niet geannuleerd is — ook eentje die nog op "concept" of "verstuurd" staat. Er is dus niets dat verhindert (of zelfs maar signaleert) dat een werkbon wordt aangemaakt voordat de klant echt akkoord ging. Daardoor verliest het label "goedgekeurd" een stuk van zijn betekenis: het kan evengoed betekenen "de klant zei ja" als "ik heb op één knop geklikt".

**13. Geen "dupliceer"-actie voor offertes of werkbons — Middelhoog.**
Bij een herhaalklant of een gelijkaardige bestelling moet elke offerte helemaal opnieuw regel per regel opgebouwd worden. Een "dupliceer deze offerte"-knop zou net dat veelvoorkomende scenario direct bedienen.

**14. Geen zoek/filter op Offertes en Werkbonnen (Jobs heeft dat wel) — Middelhoog, groeit met de tijd.**
Naarmate het aantal offertes/werkbons toeneemt, is er geen manier om snel een specifieke te vinden (geen filter op status/klant, geen zoekveld op nummer) — enkel scrollen.

**15. Drie verschillende lijst/detail-patronen binnen dezelfde keten — Middelhoog.**
Offertes: rij aanklikken → apart detailpaneel rechts + een modal om te bewerken. Jobs: hetzelfde rechtspaneel-patroon. Werkbonnen: rij aanklikken → klapt inline open in de tabel zelf — een derde, ander interactiepatroon, terwijl Werkbonnen conceptueel net de rechtstreekse opvolger van Offertes is.

**16. Leveringsvoortgang (pakbon) is onzichtbaar in de ingeklapte werkbonlijst — Middelhoog.**
De koppelvoortgang (hoeveel is al aan een job gekoppeld) staat wel op de ingeklapte rij, maar of er al (deels) geleverd is, zie je pas na het openklappen. Op het overzicht kun je dus niet in één oogopslag zien welke werkbons nog een levering wachten.

**17. Multicolor-filament invoeren werkt totaal anders op de offerte dan bij het echt kosten-registreren van de job — Middelhoog.**
Op het offerte-/werkbonscherm: nette rijen "+ Kleur" met type/rol/gram per kleur. Op het job-kostenscherm: één platte filamentlijst met een tekst-tip die zegt dat je het totale Bambu-gewicht zelf handmatig over de rijen moet verdelen. Twee volledig verschillende manieren om hetzelfde te doen, binnen dezelfde app.

**18. "Gebruik gemeten data" is een stille, herhaalbare overschrijving zonder duidelijke terugkoppeling — Laag/Middelhoog.**
De knop overschrijft het bedrag van een werkbon-regel met de gemeten jobkost, maar verdwijnt niet na klikken en toont geen "toegepast!"-bevestiging — enkel het kleine ↺-terugzetpictogram elders wijst er achteraf op dat er een override actief is.

**19. Kleine, dicht-opeen-geplaatste icoon-knopjes overal in deze schermen — Middelhoog, gezien telefoongebruik in de werkplaats.**
Veel rij-acties (✕/↓/✉, koppel-select naast "+Printopdracht" naast "gebruik gemeten data") zijn erg klein (±10-11px tekst, 3-8px padding) en dicht opeen — op een telefoon een reëel tikrisico. (Niet visueel bevestigd, enkel op basis van de inline-stijlen in de code.)

---

## C. Klanten / Voorraad / Bestellingen / Financiën

**20. Nieuw artikeltype via factuur-scan krijgt altijd categorie "overig", nooit automatisch "filament" — Middelhoog.**
Ook als Gemini duidelijk "PLA 1kg" herkent, wordt een nieuw aangemaakt artikeltype via `FactuurUploadModal` altijd op categorie "overig" gezet. Omdat de hele app strikt filtert op `categorie === 'filament'` (offerte-dropdowns, filamentrapporten, …), duikt zo'n nieuw type nergens op als filament totdat je het zelf handmatig corrigeert — net op het moment (snel een bonnetje inscannen) dat je daar het minst op let.

**21. Geen link van een klant naar diens offertes — enkel naar diens jobs.**
Klantdetail toont een lijst jobs met een link naar Jobs, maar niets naar offertes. "Wat heb ik deze klant ooit voorgesteld" vereist dus apart zoeken op naam in Offertes.

**22. Nieuw artikel bestellen vereist een omweg — eerst apart aanmaken, dan pas bestelbaar.**
"+ Artikel toevoegen" in Bestellingen laat enkel kiezen uit bestaande artikeltypes; een geheel nieuw artikel bestellen moet dus eerst via Filament aangemaakt worden. Nochtans laten zowel het Ontvangst-scherm als de factuur-scan wél inline een nieuw type aanmaken — een omweg die de rest van de app net vermijdt.

**23. Artikeltype-dropdowns bij bestellen/voorraad tonen ook diensten en eigen producten.**
Bij het bestellen of "voorraad toevoegen" staan ook categorieën als "dienst" (expliciet zonder voorraad) en "product" (je eigen eindproduct, geen aankoop bij een leverancier) gewoon tussen de keuzes — categorieën die daar niet thuishoren.

**24. Twee losse kleurkiezer-systemen voor dezelfde taak.**
Filament gebruikt een volledig kleurenpalet-systeem met eigen hex-toevoeging; Bestellingen gebruikt een eenvoudiger, apart onderdeel dat enkel eerder-geziene kleuren of vrije tekst toont.

**25. Overal de kale browser-`confirm()`/`alert()` in plaats van een eigen gestylede melding.**
Elke verwijdering, opslaanfout en "sluiten zonder opslaan"-waarschuwing door de hele app gebruikt het onopgemaakte systeemdialoogvenster van de browser — inconsistent met de rest van de (nu net herstijlde) interface, en op mobiel minder prettig.

**26. Boekhoudkundige CSV-export staat op Statistieken, heet "Jobs exporteren"; Uitgaven/Financiën-overzicht hebben er geen.**
De enige export in de hele app zit op de Statistieken-pagina en dekt enkel jobs — terwijl net Financiën (met een expliciete verwijzing naar "je boekhouder") en Uitgaven de meest voor de hand liggende kandidaten zijn voor "dit wil ik naar mijn boekhouder doorsturen".

**27. Uitgaven-tabblad negeert een datumfilter die de eigen backend al ondersteunt.**
`uitgaven.js` accepteert al `?van=&tot=`, maar `Financien.jsx` roept dat zonder parameters aan en toont dus altijd élke uitgave ooit, ongefilterd, in één platte tabel.

**28. Klanttype wisselen (particulier ↔ zakelijk) wist bedrijfsnaam/btw-nummer niet.**
Die velden worden enkel verborgen, niet leeggemaakt — vul je per ongeluk bedrijfsgegevens in en schakel je terug naar particulier, dan blijft die data onzichtbaar aanwezig en wordt ze gewoon mee opgeslagen.

**29. Geen zoek/filter op Filament en Bestellingen (Klanten heeft dat wel).**
Zelfde probleem als bij Offertes/Werkbonnen (punt 14) — groeit met de tijd tot een reëel probleem.

**30. Kalibratie-instellingen (nozzle-temperatuur, flow, pressure advance, …) zitten verstopt binnen de voorraadpagina.**
Een volledig ander soort taak (printer/slicer-afstelling) dan voorraadbeheer, maar enkel bereikbaar via een detailvenster binnen Filament.

---

## D. Navigatie, layout, thema (incl. de net afgeleverde rebrand), Instellingen

**31. De voortgangsring op elke printerkaart heeft nog een donkere achtergrondkleur uit het oude thema — Hoog, bevestigd, meest zichtbare "niet-afgewerkte restyling".**
`PrinterCard.jsx`: `stroke="#1e2330"` (bijna-zwart navy) als achtergrondcirkel achter de gekleurde voortgangsboog — een letterlijk overblijfsel uit het donkere thema van vóór de rebrand. Op het nieuwe lichte thema staat dat nu als een donkere ring op elke printerkaart op de Jobs-pagina, de plek waar je het vaakst kijkt.

**32. De rand van een kleurstip (KleurDot) is voor een donkere achtergrond getekend, niet voor de nieuwe lichte.**
`rgba(255,255,255,0.15)` als rand — op een donkere kaart gaf dat net de witte/zilveren stalen contour, op de nieuwe witte kaarten is die rand vrijwel onzichtbaar, exact bij de kleuren die een randje het hardst nodig hebben.

**33. Verspreide hardcoded oude rood/geel/groen-tinten in plaats van de nieuwe --danger/--warn/--accent2-variabelen.**
Dashboard-widgets, PrinterCard's energiecijfers, en `kleuren.js` gebruiken her en der eigen hexwaarden die niet meer exact overeenkomen met de nieuwe paletkleuren uit `index.css`. Dit is precies de "audit van losse hardcoded kleuren" die ik na de rebrand-levering al als openstaand vervolgpunt genoemd had — dit geeft er nu concrete aanknopingspunten bij.

**34. Geen enkele responsive/mobiele aanpassing in de CSS — Hoog risico, niet visueel bevestigd.**
Geen enkele `@media`-query in `App.css`/`index.css`. De zijbalk is een vaste 200px, en formuliervelden staan vaak in een vaste 2-koloms-grid zonder mobiel alternatief. Gezien het expliciete gebruik vanaf de telefoon in de werkplaats is dit het risico met de grootste potentiële impact — maar dit verdient een blik op een echt scherm vóór het als vaststaand probleem behandeld wordt.

**35. Dashboard haalt "gepland" en "voltooid" op, maar toont ze nergens.**
De data komt al binnen via de bestaande rapportage-call, enkel het "bezig"-deel wordt gebruikt. Een blik op wat er nu aankomt in de wachtrij, of wat er net klaar is (en dus klaar voor levering), ontbreekt op precies de pagina die daarvoor bedoeld is.

**36. Een mislukte print en een gewoon inactieve printer zien er op het Dashboard identiek uit.**
De compacte statusstip kent maar 3 kleuren (actief/onbekend/"al de rest" in amber) — falen en gewoon-niets-aan-het-doen vallen samen. Dit gaat niet over "meer telemetrie tonen" (dat blijft bewust bij Jobs) maar puur over of de kleur het juiste signaal geeft op het scherm dat bedoeld is om in één oogopslag te zien wat aandacht nodig heeft.

**37. Dashboard-strip en de "Bezig"-widget kunnen elkaar tegenspreken.**
Ze komen uit twee verschillende bronnen (live HA-polling vs. databank-jobstatus) die tijdelijk uit sync kunnen lopen — op hetzelfde scherm, naast elkaar, allebei claimend "wat draait er nu".

**38. HA-koppeling en Gemini-sleutel — twee gelijkaardige "externe dienst"-instellingen — staan in twee verschillende tabbladen, niet samen.**
HA zit bij "Printers", Gemini bij "Integraties". Wie zoekt naar "waar stel ik mijn Home Assistant-verbinding in" kijkt vermoedelijk eerst bij Integraties (waar de andere externe koppeling staat) en vindt hem daar niet.

**39. Een niet-werkend oogicoontje op velden die sowieso nooit een waarde tonen.**
HA-token en Gemini-sleutel zijn uitgeschakelde velden die altijd enkel een plaatshoudertekst tonen ("Stel in via de add-onconfiguratie") — maar er staat nog een 👁/🙈-toggle naast, die niets zichtbaar maakt. Voor een niet-programmeur oogt dat als kapotte UI, niet als "dit wordt elders beheerd".

**40. Printer-entiteitconfiguratie is 8 blinde tekstvelden zonder validatie of voorbeeldwaarde.**
Tot 8 Home-Assistant-entiteit-ID's per printer worden gewoon getypt, met enkel een placeholder als voorbeeld. De enige test is een algemene "Verbinding testen"-knop die enkel URL/token checkt, niet of een individuele entiteit echt bestaat. Een typfout in bv. `watt_entity` valt pas op wanneer het wattage nooit verschijnt.

**41. "Nieuw jaar starten" (destructief) zit op hetzelfde tabblad als gewoon back-uppen/exporteren.**
De actie zelf is goed beveiligd (rode rand, lange waarschuwing, typ "RESET"), maar het tabblad heet neutraal "Data & Backup" — niets verraadt dat er onderaan een onomkeerbare, database-legende actie staat.

**42. Werkbons staat in de navigatie 4 plekken verwijderd van Offertes, terwijl het één doorlopend documenttraject is.**
Volgorde: Dashboard → Jobs → Werkbons → Klanten → Artikelen → Bestellingen → Offertes → Financiën → Statistieken. Offerte → werkbon is de kernstroom van het bedrijf, maar de twee tabbladen staan niet naast elkaar.

**43. Navigatielabel "Artikelen" terwijl de sectie zelf overal elders "Filament" heet.**
Mogelijk een bewuste, al doorgevoerde naamswijziging (de tab bevat meer dan enkel filament) — waard om even te bevestigen of dat klopt, anders is het een kleine "welke naam zoek ik nu weer"-frictie.

---

## Wat niet (volledig) geverifieerd kon worden

- Alles wat visuele weergave/contrast/leesbaarheid betreft (badge-kleuren naast elkaar, echte mobiele layout) is beoordeeld op basis van broncode/CSS, niet op een echt gerenderd scherm.
- De precieze financiële impact van punt 8 (materiaalkosten mogelijk onderschat) is niet nagerekend op echte cijfers.
- Live/HA-gedrag (hoe de UI zich gedraagt bij een offline printer, sensor-vertraging) is niet doorlopen.

## Suggestie voor aanpak

Dit is bewust een volledige, ruwe lijst — niet alles hoeft (of moet) aangepakt worden. Groep A (financieel/documenten) weegt het zwaarst, omdat het rechtstreeks met geld en klantcommunicatie te maken heeft; groep D bevat de makkelijkste "quick wins" (vooral punt 31, de donkere ring, is één regel).
