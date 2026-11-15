(() => {
  const root = document.documentElement;
  const key = 'linux-studio.website-appearance';
  const dark = matchMedia('(prefers-color-scheme: dark)');
  const themes = ['system', 'light', 'dark'];
  const accents = ['green', 'copper', 'blue'];
  let saved;
  try { saved = JSON.parse(localStorage.getItem(key)); } catch { /* Use defaults. */ }
  let theme = themes.includes(saved?.theme) ? saved.theme : 'dark';
  let accent = accents.includes(saved?.accent) ? saved.accent : 'green';

  function apply() {
    root.dataset.theme = theme === 'system' ? (dark.matches ? 'dark' : 'light') : theme;
    root.dataset.accent = accent;
  }

  apply();
  dark.addEventListener('change', apply);
  document.addEventListener('DOMContentLoaded', () => {
    const themeInput = document.getElementById('site-theme');
    const accentInput = document.getElementById('site-accent');
    themeInput.value = theme;
    accentInput.value = accent;
    function update() {
      theme = themeInput.value;
      accent = accentInput.value;
      apply();
      try { localStorage.setItem(key, JSON.stringify({ theme, accent })); } catch { /* Current page still updates. */ }
    }
    themeInput.addEventListener('change', update);
    accentInput.addEventListener('change', update);
  });
})();
