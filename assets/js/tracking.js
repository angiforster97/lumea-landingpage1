/* =============================================================================
   LUMEA · TRACKING & CONSENT
   -----------------------------------------------------------------------------
   Grundsätze (siehe Tracking-Konzept, Teil D):
   1. Kein Drittanbieter-Skript vor der Einwilligung. Weder Meta (fbevents.js)
      noch Google (gtag.js) werden geladen, solange keine Einwilligung vorliegt.
      → Netzwerk-Tab ist vor dem Klick auf „Akzeptieren“ frei von Anfragen an
        connect.facebook.net / facebook.com / googletagmanager.com.
   2. Nur Meta-Standard-Ereignisse mit Standard-Parametern. Keine Gesundheits-
      begriffe in Ereignisnamen, Parametern, URLs oder Seitentiteln.
   3. Abo-Abschluss = Subscribe (Optimierungsziel) + Purchase (Umsatz), beide
      mit derselben event_id (= Bestellnummer) für die spätere Deduplizierung
      mit der Conversions API.
   4. Monatliche Verlängerungen laufen NICHT über den Pixel (siehe Teil D).
   ========================================================================== */

(function () {
  'use strict';

  /* ---------------------------------------------------------------------------
     KONFIGURATION
     ------------------------------------------------------------------------ */
  var CONFIG = {
    META_PIXEL_ID: '1234567890',   // Platzhalter-ID laut Briefing
    GA4_ID: 'G-LUMEA0000',         // Platzhalter-Mess-ID laut Briefing
    CURRENCY: 'EUR',
    CONTENT_ID: 'LUMEA-ABO-1M',    // neutrale Artikel-ID, kein Gesundheitsbezug
    PRICE_FIRST_MONTH: 14.50,      // tatsächlich gezahlter Erstkaufwert → value
    // predicted_ltv = (14,50 + 4 × 29,00) × 0,70 = 130,50 × 0,70 = 91,35
    // (Ø 5 Monate Laufzeit, 30 % Abschlag für Kaltakquise; Rechenweg in Teil D/E)
    PREDICTED_LTV: 91.35,
    CONSENT_KEY: 'lumea_consent_v1',
    CONSENT_VERSION: 1
  };

  /* ---------------------------------------------------------------------------
     SPEICHER-HILFEN
     Browser-Speicher kann blockiert sein (privater Modus etc.) → immer try/catch.
     Gespeichert wird ausschließlich die Einwilligungs-Entscheidung (technisch
     erforderlich, § 25 Abs. 2 Nr. 2 TDDDG) und Bestell-Metadaten ohne
     personenbezogene Daten.
     ------------------------------------------------------------------------ */
  function lsGet(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function ssGet(k) { try { return JSON.parse(sessionStorage.getItem(k)); } catch (e) { return null; } }
  function ssSet(k, v) { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }

  /* ---------------------------------------------------------------------------
     DEBUG-PROTOKOLL (?debug=1)
     Zeigt für Prüferinnen sichtbar an, welches Ereignis mit welchen Parametern
     gefeuert wurde – oder warum es NICHT gefeuert wurde (keine Einwilligung,
     bereits gefeuert …). Ergänzt Meta Pixel Helper und Netzwerk-Tab.
     ------------------------------------------------------------------------ */
  var DEBUG = (function () {
    var q = /[?&]debug=(1|0)/.exec(location.search);
    if (q) ssSet('lumea_debug', q[1] === '1');
    return ssGet('lumea_debug') === true;
  })();
  var debugBox = null;
  function log(status, label, data) {
    if (window.console) console.info('[Lumea Tracking]', status, label, data || '');
    if (!DEBUG) return;
    if (!debugBox) {
      debugBox = document.createElement('div');
      debugBox.className = 'debug-log';
      debugBox.setAttribute('aria-live', 'polite');
      debugBox.innerHTML = '<strong>Tracking-Protokoll</strong> <small>(?debug=0 zum Ausblenden)</small><ol></ol>';
      document.body.appendChild(debugBox);
    }
    var li = document.createElement('li');
    li.className = 'is-' + status;
    li.textContent = new Date().toLocaleTimeString('de-DE') + ' · ' + status.toUpperCase() + ' · ' + label +
      (data ? ' ' + JSON.stringify(data) : '');
    debugBox.querySelector('ol').appendChild(li);
  }

  /* ---------------------------------------------------------------------------
     EINWILLIGUNGS-STATUS
     Zwei getrennte Kategorien: statistik (GA4) und marketing (Meta-Pixel).
     ------------------------------------------------------------------------ */
  function getConsent() {
    var c = lsGet(CONFIG.CONSENT_KEY);
    return c && c.v === CONFIG.CONSENT_VERSION ? c : null;
  }
  function hasConsent(cat) { var c = getConsent(); return !!(c && c[cat]); }

  /* ---------------------------------------------------------------------------
     META-PIXEL LADEN – NUR NACH EINWILLIGUNG „MARKETING“
     Offizieller fbq-Stub, aber nicht im <head> fest eingebaut, sondern erst
     hier nach Opt-in ins DOM geschrieben (§ 25 Abs. 1 TDDDG).
     Bewusst KEIN <noscript>-Pixel-Bild: das würde ohne Einwilligung feuern.
     ------------------------------------------------------------------------ */
  var metaLoaded = false;
  function loadMeta() {
    if (metaLoaded) return;
    metaLoaded = true;
    /* eslint-disable */
    !function (f, b, e, v, n, t, s) {
      if (f.fbq) return; n = f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); };
      if (!f._fbq) f._fbq = n; n.push = n; n.loaded = !0; n.version = '2.0'; n.queue = [];
      t = b.createElement(e); t.async = !0; t.src = v; s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s);
    }(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
    /* eslint-enable */

    // TRACKING: Einwilligung an Meta melden (Consent-API des Pixels).
    window.fbq('consent', 'grant');
    // TRACKING: Automatische Ereigniserfassung AUS. Sonst liest der Pixel
    // Button-Texte und Seiten-Metadaten aus („SubscribedButtonClick“, Microdata)
    // – das könnte ungewollt Inhalte mit Gesundheitsbezug übertragen.
    window.fbq('set', 'autoConfig', false, CONFIG.META_PIXEL_ID);
    // TRACKING: Pixel initialisieren – ohne erweitertes Matching (keine E-Mail,
    // kein Name an Meta; Datenminimierung).
    window.fbq('init', CONFIG.META_PIXEL_ID);
    // TRACKING: PageView – auf jeder Seite, aber erst jetzt (nach Einwilligung).
    window.fbq('track', 'PageView');
    log('fired', 'Meta PageView', { pixel: CONFIG.META_PIXEL_ID, page: location.pathname });
  }

  /* ---------------------------------------------------------------------------
     GA4 LADEN – NUR NACH EINWILLIGUNG „STATISTIK“
     Google Consent Mode v2 im BASIC-Modus: gtag.js wird erst nach Opt-in
     geladen. Standard ist „denied“ für alle vier Signale; nach Einwilligung
     wird nur analytics_storage auf „granted“ gesetzt. Werbe-Signale bleiben
     „denied“, weil Lumea kein Google-Ads-Remarketing nutzt.
     (Advanced Mode – cookielose Pings ohne Einwilligung – bewusst nicht.)
     ------------------------------------------------------------------------ */
  var gaLoaded = false;
  function loadGA4() {
    if (gaLoaded) return;
    gaLoaded = true;
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    // TRACKING: Consent-Mode-Standardwerte (vor config!)
    window.gtag('consent', 'default', {
      ad_storage: 'denied', analytics_storage: 'denied',
      ad_user_data: 'denied', ad_personalization: 'denied'
    });
    // TRACKING: Einwilligung „Statistik“ liegt vor → nur Analyse freigeben
    window.gtag('consent', 'update', { analytics_storage: 'granted' });
    window.gtag('js', new Date());
    // TRACKING: page_view wird von config automatisch gesendet. Seitentitel
    // sind neutral gehalten („Lumea · …“), da GA4 sie mitschickt.
    window.gtag('config', CONFIG.GA4_ID);
    var s = document.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id=' + CONFIG.GA4_ID;
    document.head.appendChild(s);
    log('fired', 'GA4 page_view', { id: CONFIG.GA4_ID, page: location.pathname });
  }

  /* ---------------------------------------------------------------------------
     ZENTRALE TRACK-FUNKTION
     - Ereignisse einer Seite werden in eine Warteschlange gelegt.
     - Liegt Einwilligung vor → sofort senden.
     - Fehlt sie → warten. Wird auf DIESER Seite noch zugestimmt, gehen sie raus;
       bei Ablehnung werden sie verworfen.
     metaName: Meta-Standard-Ereignis · gaName: GA4-Empfehlungsereignis
     eventId: wird als 4. Argument an fbq übergeben ({eventID}) – Grundlage der
              Deduplizierung Browser ↔ Conversions API.
     onSent: Callback nach erfolgreichem Senden (z. B. „gefeuert“-Merker setzen)
     ------------------------------------------------------------------------ */
  var queue = [];
  function track(evt) {
    queue.push(evt);
    flush();
  }
  function flush() {
    var c = getConsent();
    if (!c) {
      queue.forEach(function (e) { if (!e._waitLogged) { log('waiting', e.metaName + ' (wartet auf Einwilligung)', e.metaParams); e._waitLogged = true; } });
      return;
    }
    var pending = queue.slice(); queue = [];
    pending.forEach(function (e) {
      var sent = false;
      if (c.marketing && e.metaName) {
        loadMeta();
        var opts = e.eventId ? { eventID: e.eventId } : undefined;
        // TRACKING: Meta-Standard-Ereignis mit Parametern (+ eventID falls vorhanden)
        window.fbq('track', e.metaName, e.metaParams || {}, opts);
        log('fired', 'Meta ' + e.metaName, Object.assign({}, e.metaParams, e.eventId ? { eventID: e.eventId } : {}));
        sent = true;
      }
      if (c.statistik && e.gaName) {
        loadGA4();
        // TRACKING: GA4-Ereignis (E-Commerce-Schema)
        window.gtag('event', e.gaName, e.gaParams || {});
        log('fired', 'GA4 ' + e.gaName, e.gaParams);
        sent = true;
      }
      if (!sent) log('blocked', e.metaName + ' (keine Einwilligung für diese Kategorie)');
      if (sent && typeof e.onSent === 'function') e.onSent();
    });
  }

  /* ---------------------------------------------------------------------------
     EINWILLIGUNG SETZEN / WIDERRUFEN
     ------------------------------------------------------------------------ */
  function setConsent(statistik, marketing) {
    var prev = getConsent();
    lsSet(CONFIG.CONSENT_KEY, { v: CONFIG.CONSENT_VERSION, statistik: !!statistik, marketing: !!marketing, ts: new Date().toISOString() });
    log('consent', 'Einwilligung gespeichert', { statistik: !!statistik, marketing: !!marketing });

    // Widerruf einer zuvor erteilten Einwilligung: Signale zurücknehmen,
    // Cookies löschen, Seite neu laden (geladene Skripte lassen sich nicht entladen).
    var revoked = prev && ((prev.marketing && !marketing) || (prev.statistik && !statistik));
    if (revoked) {
      // TRACKING: Meta-Einwilligung widerrufen
      if (window.fbq && prev.marketing && !marketing) window.fbq('consent', 'revoke');
      // TRACKING: GA4-Einwilligung widerrufen
      if (window.gtag && prev.statistik && !statistik) window.gtag('consent', 'update', { analytics_storage: 'denied' });
      deleteTrackingCookies();
      location.reload();
      return;
    }
    if (marketing) loadMeta();
    if (statistik) loadGA4();
    if (!marketing && !statistik) { queue = []; log('blocked', 'Abgelehnt – keine Ereignisse, keine Skripte'); return; }
    flush();
  }
  function deleteTrackingCookies() {
    var host = location.hostname;
    document.cookie.split(';').forEach(function (c) {
      var name = c.split('=')[0].trim();
      if (/^(_fbp|_fbc|_ga|_gid|_gat)/.test(name)) {
        ['', host, '.' + host].forEach(function (d) {
          document.cookie = name + '=; Max-Age=0; path=/' + (d ? '; domain=' + d : '');
        });
      }
    });
  }

  /* ---------------------------------------------------------------------------
     CONSENT-BANNER
     „Alle ablehnen“ und „Alle akzeptieren“ gleichwertig auf erster Ebene,
     keine vorausgewählten Häkchen in den Einstellungen.
     ------------------------------------------------------------------------ */
  function renderBanner(showSettings) {
    var old = document.getElementById('consent');
    if (old) old.remove();
    var c = getConsent() || { statistik: false, marketing: false };
    var el = document.createElement('section');
    el.id = 'consent';
    el.className = 'consent';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'false');
    el.setAttribute('aria-labelledby', 'consent-title');
    el.innerHTML =
      '<h2 id="consent-title">Dürfen wir messen?</h2>' +
      '<p>Mit deiner Einwilligung nutzen wir Google Analytics (Statistik) und das Meta-Pixel (Marketing), um zu sehen, welche Anzeigen funktionieren. Ohne Einwilligung funktioniert die Seite genauso – wir laden dann keine dieser Dienste. Du kannst deine Wahl jederzeit unter „Cookie-Einstellungen“ ändern. <a href="/rechtliches#datenschutz">Datenschutz</a></p>' +
      '<div class="consent-settings"' + (showSettings ? '' : ' hidden') + '>' +
        '<label><input type="checkbox" checked disabled> Notwendig <small>(speichert nur diese Entscheidung)</small></label>' +
        '<label><input type="checkbox" id="c-stat"' + (c.statistik ? ' checked' : '') + '> Statistik <small>(Google Analytics 4)</small></label>' +
        '<label><input type="checkbox" id="c-mkt"' + (c.marketing ? ' checked' : '') + '> Marketing <small>(Meta-Pixel)</small></label>' +
        '<button type="button" class="btn btn-ghost" data-act="save">Auswahl speichern</button>' +
      '</div>' +
      '<div class="consent-actions">' +
        '<button type="button" class="btn btn-secondary" data-act="deny">Alle ablehnen</button>' +
        '<button type="button" class="btn btn-secondary" data-act="accept">Alle akzeptieren</button>' +
      '</div>' +
      '<button type="button" class="link-btn" data-act="toggle">Einstellungen</button>';
    document.body.appendChild(el);
    el.addEventListener('click', function (ev) {
      var act = ev.target.getAttribute('data-act');
      if (!act) return;
      if (act === 'toggle') { el.querySelector('.consent-settings').hidden = !el.querySelector('.consent-settings').hidden; return; }
      if (act === 'accept') setConsent(true, true);
      if (act === 'deny') setConsent(false, false);
      if (act === 'save') setConsent(el.querySelector('#c-stat').checked, el.querySelector('#c-mkt').checked);
      el.remove();
    });
  }

  /* ---------------------------------------------------------------------------
     START
     ------------------------------------------------------------------------ */
  function init() {
    var c = getConsent();
    if (!c) {
      renderBanner(false);
      log('waiting', 'Keine Einwilligung – keine Skripte geladen');
    } else {
      // TRACKING: Bereits erteilte Einwilligung → Dienste laden (inkl. PageView)
      if (c.marketing) loadMeta();
      if (c.statistik) loadGA4();
      if (!c.marketing && !c.statistik) log('blocked', 'Abgelehnt – keine Skripte geladen');
    }
    // Footer-Link „Cookie-Einstellungen“ öffnet den Banner erneut (Widerruf)
    document.querySelectorAll('[data-consent-open]').forEach(function (a) {
      a.addEventListener('click', function (e) { e.preventDefault(); renderBanner(true); });
    });
    flush();
  }

  // Öffentliche Schnittstelle für die Seitenskripte
  window.LumeaTracking = { CONFIG: CONFIG, track: track, ssGet: ssGet, ssSet: ssSet, log: log };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
