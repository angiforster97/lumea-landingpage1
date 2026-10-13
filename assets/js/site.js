/* =============================================================================
   LUMEA · SEITENLOGIK
   Ereignisse pro Seite gemäß Tracking-Konzept (Teil D):
     /           → ViewContent (Preisblock ≥ 50 % sichtbar, 1× pro Sitzung)
     /bestellen  → InitiateCheckout (beim Laden), AddPaymentInfo (Zahlart gewählt)
     /danke      → Subscribe + Purchase (1× pro Bestellung, gleiche event_id)
   PageView feuert tracking.js auf allen Seiten nach Einwilligung.
   ========================================================================== */
(function () {
  'use strict';
  var T = window.LumeaTracking;
  var C = T.CONFIG;
  var page = document.body.getAttribute('data-page');

  // Gemeinsame Parameter-Bausteine (nur Standard-Parameter, neutral benannt)
  function metaProduct() {
    return { content_ids: [C.CONTENT_ID], content_type: 'product', value: C.PRICE_FIRST_MONTH, currency: C.CURRENCY };
  }
  function gaItems() {
    return [{ item_id: C.CONTENT_ID, item_name: 'Lumea Monatsabo', price: C.PRICE_FIRST_MONTH, quantity: 1 }];
  }
  function fmtDate(d) { return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }); }
  function addDays(d, n) { var x = new Date(d); x.setDate(x.getDate() + n); return x; }

  /* ---------------------------------------------------------------------------
     PRODUKTSEITE  /
     ------------------------------------------------------------------------ */
  if (page === 'produkt') {
    var target = document.getElementById('preis');
    // TRACKING: ViewContent nur einmal pro Sitzung (sessionStorage-Merker),
    // damit wiederholtes Scrollen nichts doppelt zählt.
    if (target && 'IntersectionObserver' in window && !T.ssGet('lumea_vc_sent')) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (en.isIntersecting && en.intersectionRatio >= 0.5) {
            io.disconnect();
            // TRACKING: ViewContent – Preis/Abo-Block ist zu ≥ 50 % sichtbar
            // = echtes Interesse statt bloßer Seitenaufruf. Ausweich-
            // Optimierungsziel, falls Meta Kauf-Ereignisse einschränkt.
            T.track({
              metaName: 'ViewContent',
              metaParams: metaProduct(),
              gaName: 'view_item',
              gaParams: { currency: C.CURRENCY, value: C.PRICE_FIRST_MONTH, items: gaItems() },
              onSent: function () { T.ssSet('lumea_vc_sent', true); }
            });
          }
        });
      }, { threshold: [0.5] });
      io.observe(target);
    }
  }

  /* ---------------------------------------------------------------------------
     BESTELLSTRECKE  /bestellen  (2 Schritte auf einer Seite)
     ------------------------------------------------------------------------ */
  if (page === 'bestellen') {
    // TRACKING: InitiateCheckout beim LADEN der Bestellseite (nicht beim Klick
    // auf den Button) – robust gegen Doppelklicks, zählt auch Direkteinstiege.
    T.track({
      metaName: 'InitiateCheckout',
      metaParams: Object.assign(metaProduct(), { num_items: 1 }),
      gaName: 'begin_checkout',
      gaParams: { currency: C.CURRENCY, value: C.PRICE_FIRST_MONTH, items: gaItems() }
    });

    var form = document.getElementById('order');
    var step1 = document.getElementById('step-1');
    var step2 = document.getElementById('step-2');
    var progress = document.querySelectorAll('.progress li');
    var nextDate = fmtDate(addDays(new Date(), 30));
    document.querySelectorAll('[data-next-charge]').forEach(function (n) { n.textContent = nextDate; });

    function showStep(n) {
      step1.hidden = n !== 1; step2.hidden = n !== 2;
      progress.forEach(function (li, i) { li.classList.toggle('is-done', i < n); });
      (n === 1 ? step1 : step2).querySelector('h1, h2').focus();
      window.scrollTo(0, 0);
    }
    function fieldsValid(scope) {
      var ok = true;
      scope.querySelectorAll('input[required]').forEach(function (i) {
        if (!i.checkValidity()) { ok = false; }
      });
      if (!ok) { var first = scope.querySelector('input:invalid'); if (first) first.reportValidity(); }
      return ok;
    }

    document.getElementById('to-step-2').addEventListener('click', function () {
      if (!fieldsValid(step1)) return;
      // Adresse für den Überblick spiegeln (bleibt nur im DOM, wird nirgends gespeichert)
      var d = new FormData(form);
      document.getElementById('summary-address').textContent =
        d.get('vorname') + ' ' + d.get('nachname') + ', ' + d.get('strasse') + ', ' + d.get('plz') + ' ' + d.get('ort');
      showStep(2);
    });
    document.getElementById('back-to-1').addEventListener('click', function () { showStep(1); });

    // TRACKING: AddPaymentInfo – sobald eine Zahlart gewählt ist. Schritt 1 ist
    // zu diesem Zeitpunkt bereits validiert. Nur 1× pro Seitenaufruf.
    // Es werden KEINE Zahlungsdaten erhoben oder übertragen – nur das Ereignis.
    var apiSent = false;
    form.querySelectorAll('input[name="zahlart"]').forEach(function (r) {
      r.addEventListener('change', function () {
        if (apiSent) return;
        apiSent = true;
        T.track({
          metaName: 'AddPaymentInfo',
          metaParams: metaProduct(),
          gaName: 'add_payment_info',
          gaParams: { currency: C.CURRENCY, value: C.PRICE_FIRST_MONTH, payment_type: r.value, items: gaItems() }
        });
      });
    });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!fieldsValid(step2)) return;
      // TRACKING: event_id = Bestellnummer. Wird HIER (beim Absenden) erzeugt
      // und an die Dankeseite übergeben. Dieselbe ID würde ein Server
      // (Conversions API) mitschicken → Meta verwirft das Duplikat.
      var orderId = 'LUM-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8).toUpperCase();
      // Gespeichert werden NUR Bestell-Metadaten, keine personenbezogenen Daten.
      T.ssSet('lumea_order', {
        id: orderId,
        value: C.PRICE_FIRST_MONTH,
        created: new Date().toISOString(),
        tracked: false            // Merker gegen doppeltes Feuern auf /danke
      });
      location.href = '/danke';
    });
  }

  /* ---------------------------------------------------------------------------
     DANKESEITE  /danke
     ------------------------------------------------------------------------ */
  if (page === 'danke') {
    var order = T.ssGet('lumea_order');
    var withOrder = document.getElementById('with-order');
    var noOrder = document.getElementById('no-order');

    if (!order) {
      // TRACKING: Direktaufruf von /danke ohne Bestellung → KEIN Ereignis.
      withOrder.hidden = true; noOrder.hidden = false;
      T.log('blocked', 'Kein Subscribe/Purchase: keine Bestellung in dieser Sitzung');
      return;
    }

    var created = new Date(order.created);
    document.getElementById('order-id').textContent = order.id;
    document.getElementById('next-charge').textContent = fmtDate(addDays(created, 30));

    if (order.tracked) {
      // TRACKING: Schutz gegen doppeltes Feuern – Seite wurde neu geladen
      // oder erneut aufgerufen, Abschluss ist bereits gemeldet.
      T.log('blocked', 'Subscribe/Purchase bereits gesendet für ' + order.id + ' – kein zweites Mal');
      return;
    }

    // Merker erst setzen, wenn tatsächlich gesendet wurde. Ohne Einwilligung
    // wird nichts gesendet und nichts als „gesendet“ markiert.
    function markTracked() {
      var o = T.ssGet('lumea_order');
      if (o && o.id === order.id) { o.tracked = true; T.ssSet('lumea_order', o); }
    }

    // TRACKING: Subscribe = Abo-Abschluss (bezahltes Abo, kein Trial).
    // PRIMÄRES OPTIMIERUNGSZIEL. value = gezahlter Erstkauf (14,50),
    // predicted_ltv = erwarteter Umsatz pro Kundin (91,35).
    // eventID = Bestellnummer (Deduplizierung mit Conversions API).
    T.track({
      metaName: 'Subscribe',
      metaParams: { value: order.value, currency: C.CURRENCY, predicted_ltv: C.PREDICTED_LTV },
      eventId: order.id,
      onSent: markTracked
    });

    // TRACKING: Purchase = tatsächlicher Umsatz für Berichte / Reserve-Ziel.
    // value + currency sind bei Purchase Pflicht. Gleiche eventID wie
    // Subscribe ist zulässig – Meta dedupliziert je Ereignisname.
    // GA4: purchase mit transaction_id = Bestellnummer (GA4 entfernt doppelte
    // Transaktionen anhand dieser ID).
    T.track({
      metaName: 'Purchase',
      metaParams: Object.assign(metaProduct(), { value: order.value, num_items: 1 }),
      eventId: order.id,
      gaName: 'purchase',
      gaParams: { transaction_id: order.id, currency: C.CURRENCY, value: order.value, items: gaItems() },
      onSent: markTracked
    });
  }
})();
