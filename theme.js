// Hell/Dunkel-Umschalter, gemeinsam für alle Seiten.
(function () {
  const STORAGE_KEY = 'tuttobene-theme';

  function getPreferredTheme() {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') return stored;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    const toggle = document.getElementById('theme-toggle');
    if (toggle) {
      toggle.setAttribute('aria-label', theme === 'dark' ? 'Zu hellem Design wechseln' : 'Zu dunklem Design wechseln');
    }
  }

  let currentTheme = getPreferredTheme();
  applyTheme(currentTheme);

  document.addEventListener('DOMContentLoaded', () => {
    applyTheme(currentTheme);
    const toggle = document.getElementById('theme-toggle');
    if (toggle) {
      toggle.addEventListener('click', () => {
        currentTheme = currentTheme === 'dark' ? 'light' : 'dark';
        localStorage.setItem(STORAGE_KEY, currentTheme);
        applyTheme(currentTheme);
      });
    }
  });
})();
