/*
  Preloader voor Minimal3D.

  WAT DOET DIT BESTAND?
  Dit bestand beheert het laadscherm dat je ziet terwijl 3D-modellen worden
  opgehaald uit Supabase. Het laadscherm verdwijnt automatisch zodra alle
  modellen geladen zijn.

  HOE WERKT HET?
  Het W3D.Preloader object houdt twee tellers bij:
    _total  = hoeveel items we moeten laden (3 lokale + N uit Supabase)
    _loaded = hoeveel items al klaar zijn

  Zodra _loaded >= _total EN er geen actieve 'lock' is, verdwijnt het scherm.

  WAT IS EEN LOCK?
  Een lock voorkomt dat het laadscherm te vroeg verdwijnt.
  Voorbeeld: de 3 lokale modellen laden snel klaar, maar we wachten nog op
  de Supabase-lijst. De lock houdt het scherm open totdat we weten hoeveel
  Supabase-modellen er zijn. Daarna roepen we unlock() aan.

  PUBLIEKE METHODEN:
    setTotal(n)      - Stel het totaal aantal te laden items in
    addToTotal(n)    - Voeg extra items toe aan het totaal (voor Supabase-modellen)
    increment()      - Meld dat 1 item klaar is (succesvol OF mislukt)
    setStatus(text)  - Toon een eigen tekst in het laadscherm
    lock()           - Verhoog het slotgetal (scherm blijft open)
    unlock()         - Verlaag het slotgetal (scherm mag sluiten als klaar)
    finish()         - Forceer het einde van het laadscherm (voor edge cases)
*/
W3D.Preloader = {
  _total: 0,
  _loaded: 0,
  _locked: 0,

  // DOM-referenties worden de eerste keer opgezocht en daarna gecachet.
  _el: null,
  _bar: null,
  _status: null,

  // Zoek de DOM-elementen op als dat nog niet gedaan is.
  // We doen dit lui (lazy) omdat dit script geladen wordt vóór de HTML-body.
  _init() {
    if (!this._el)     this._el     = document.getElementById('preloader');
    if (!this._bar)    this._bar    = document.getElementById('preloader-bar');
    if (!this._status) this._status = document.getElementById('preloader-status');
  },

  // Stel het totale aantal te laden items in.
  // Roep dit aan vóórdat je begint met laden.
  setTotal(n) {
    this._total = Math.max(0, n);
    this._update();
  },

  // Voeg extra items toe aan het totaal.
  // Gebruik dit wanneer je pas later weet hoeveel items er zijn (bijv. na Supabase-fetch).
  addToTotal(n) {
    this._total += Math.max(0, n);
    this._update();
  },

  // Vergrendel het laadscherm: het mag niet sluiten zolang er 1+ locks actief zijn.
  lock() {
    this._locked++;
  },

  // Verwijder één vergrendeling. Als alle locks weg zijn én alles geladen is → sluit.
  unlock() {
    this._locked = Math.max(0, this._locked - 1);
    this._update();
  },

  // Toon een aangepaste tekst in het laadscherm (bijv. "Vloer laden...").
  setStatus(text) {
    this._init();
    if (this._status) this._status.textContent = text;
  },

  // Meld dat 1 item klaar is (zowel bij succes als bij mislukking, zodat de teller klopt).
  increment() {
    this._loaded++;
    this._update();
  },

  // Reset het laadscherm volledig en maak het opnieuw zichtbaar.
  // Gebruik dit bij re-login: de preloader was al verborgen na de eerste sessie,
  // maar na uitloggen en terug inloggen moet hij weer verschijnen.
  reset() {
    this._init();
    this._total = 0;
    this._loaded = 0;
    this._locked = 0;
    if (this._bar) this._bar.style.width = '0%';
    if (this._status) this._status.textContent = 'Laden...';
    if (this._el) {
      // Zet de CSS-transitie tijdelijk uit zodat de preloader INSTANT verschijnt
      // en niet langzaam infadet (wat de 3D map kortstondig zichtbaar maakt).
      // Na 2 frames (double requestAnimationFrame) wordt de transitie teruggezet
      // zodat de fade-OUT later nog wel soepel werkt.
      this._el.style.transition = 'none';
      this._el.classList.remove('preloader--hidden');
      requestAnimationFrame(() => requestAnimationFrame(() => {
        if (this._el) this._el.style.transition = '';
      }));
    }
  },

  // Forceer het einde van het laadscherm, ongeacht de tellers.
  // Gebruik dit als fallback wanneer er 0 items te laden zijn.
  finish() {
    this._locked = 0;
    if (this._total === 0) {
      this._total = 1;
      this._loaded = 1;
    } else {
      this._loaded = this._total;
    }
    this._update();
  },

  // Interne update: herbereken de voortgangsbalk en beslis of we sluiten.
  _update() {
    this._init();
    if (!this._el) return;

    // Bereken percentage (0-100).
    const pct = this._total > 0
      ? Math.min(100, Math.round((this._loaded / this._total) * 100))
      : 0;

    // Pas de breedte van de balk aan. De CSS-transitie zorgt voor het animeren.
    if (this._bar) this._bar.style.width = pct + '%';

    // Update de statustekst automatisch met een percentage.
    if (this._status) {
      this._status.textContent = this._total > 0
        ? `${pct}%`
        : 'Laden...';
    }

    // Sluit het laadscherm als alles klaar is én er geen locks actief zijn.
    if (this._loaded >= this._total && this._total > 0 && this._locked === 0) {
      this._hide();
    }
  },

  // Verberg het laadscherm met een kleine vertraging zodat de balk visueel 100% bereikt.
  _hide() {
    this._init();
    if (!this._el) return;
    if (this._bar) this._bar.style.width = '100%';
    setTimeout(() => {
      if (this._el) this._el.classList.add('preloader--hidden');
    }, 350);
  },
};
