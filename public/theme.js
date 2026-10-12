// applies the saved theme before the first paint (no flash); external file so the CSP needs no inline script
try { var t = localStorage.getItem('mt-theme'); if (t) document.documentElement.dataset.theme = t; } catch (e) {}
  