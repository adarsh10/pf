(() => {
  const param = new URLSearchParams(location.search).get('clawpilotTheme');
  let saved;
  try { saved = localStorage.getItem('theme'); } catch { /* Storage is optional. */ }
  const theme = [param, saved].find(value => value === 'light' || value === 'dark') || 'dark';
  document.documentElement.setAttribute('data-theme', theme);
})();
