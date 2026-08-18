function pad(n) {
  return String(n).padStart(2, '0');
}

function updateCountdown() {
  var target = new Date("2026-11-13T10:00:00-05:00").getTime();
  var diff = Math.max(0, target - Date.now());
  var day = 24 * 60 * 60 * 1000;
  var hour = 60 * 60 * 1000;
  var minute = 60 * 1000;

  var days = Math.floor(diff / day); diff -= days * day;
  var hours = Math.floor(diff / hour); diff -= hours * hour;
  var minutes = Math.floor(diff / minute); diff -= minutes * minute;
  var seconds = Math.floor(diff / 1000);

  document.querySelectorAll('[data-cd="days"]').forEach(function (el) { el.textContent = days; });
  document.querySelectorAll('[data-cd="hours"]').forEach(function (el) { el.textContent = pad(hours); });
  document.querySelectorAll('[data-cd="minutes"]').forEach(function (el) { el.textContent = pad(minutes); });
  document.querySelectorAll('[data-cd="seconds"]').forEach(function (el) { el.textContent = pad(seconds); });
}

if (document.querySelector('[data-cd]')) {
  updateCountdown();
  setInterval(updateCountdown, 1000);
}
