/* =============================================================================
   Netlify Edge Function · Basic Auth für /fachkreise/
   -----------------------------------------------------------------------------
   - Zugangsdaten kommen aus Umgebungsvariablen (nie im Code):
       FACHKREISE_USER      (optional, Standard: "fachkreise")
       FACHKREISE_PASSWORD  (Pflicht)
     → Netlify: Site configuration → Environment variables, Scope „Functions“.
   - Fail closed: Ist kein Passwort gesetzt, ist der Bereich gesperrt (503),
     statt versehentlich offen zu sein.
   - Antworten sind nicht cachebar (kein CDN-Cache, der die geschützte Seite
     an Unangemeldete ausliefert) und nicht indexierbar.
   - Auf der geschützten Seite läuft KEIN Tracking (kein Meta-Pixel, kein GA4).
   ========================================================================== */

const REALM = 'Lumea Fachkreise';

export default async (request, context) => {
  const user = Netlify.env.get('FACHKREISE_USER') || 'fachkreise';
  const pass = Netlify.env.get('FACHKREISE_PASSWORD');

  if (!pass) {
    return new Response('Bereich nicht konfiguriert.', {
      status: 503,
      headers: { 'Cache-Control': 'no-store', 'Content-Type': 'text/plain; charset=utf-8' }
    });
  }

  const creds = parseBasicAuth(request.headers.get('authorization'));
  if (creds && safeEqual(creds.user, user) && safeEqual(creds.pass, pass)) {
    const response = await context.next();
    const res = new Response(response.body, response);   // Header veränderbar machen
    res.headers.set('Cache-Control', 'private, no-store');
    res.headers.set('X-Robots-Tag', 'noindex, nofollow');
    return res;
  }

  return new Response('Anmeldung erforderlich. Dieser Bereich ist nur für Fachkreise.', {
    status: 401,
    headers: {
      'WWW-Authenticate': `Basic realm="${REALM}", charset="UTF-8"`,
      'Cache-Control': 'no-store',
      'Content-Type': 'text/plain; charset=utf-8'
    }
  });
};

/** "Basic base64(user:pass)" → {user, pass}; UTF-8-sicher (Umlaute im Passwort). */
function parseBasicAuth(header) {
  if (!header) return null;
  const [scheme, encoded] = header.split(' ');
  if (!scheme || scheme.toLowerCase() !== 'basic' || !encoded) return null;
  try {
    const bytes = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
    const decoded = new TextDecoder().decode(bytes);
    const i = decoded.indexOf(':');
    if (i < 0) return null;
    return { user: decoded.slice(0, i), pass: decoded.slice(i + 1) };
  } catch {
    return null;
  }
}

/** Vergleich mit konstanter Laufzeit (kein Rückschluss auf Passwortlänge/-inhalt über Antwortzeiten). */
function safeEqual(a, b) {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  const len = Math.max(ea.length, eb.length);
  let diff = ea.length ^ eb.length;
  for (let i = 0; i < len; i++) diff |= (ea[i] || 0) ^ (eb[i] || 0);
  return diff === 0;
}

export const config = { path: ['/fachkreise', '/fachkreise/*'] };
