// Kündigungsformular (Demo): validiert und zeigt die Bestätigung. Keine Übertragung, kein Tracking.
document.getElementById('kuendigung').addEventListener('submit', function (e) {
  e.preventDefault();
  var f = e.target, bad = f.querySelector('input:invalid');
  if (bad) { bad.reportValidity(); return; }
  f.hidden = true;
  document.getElementById('k-done').hidden = false;
});
