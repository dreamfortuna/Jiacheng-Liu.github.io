const themeLink = document.querySelector('.day-switch');
const languageLink = document.querySelector('.language-switch');
const root = document.documentElement;

function syncLinks() {
  const light = root.dataset.theme === 'light';
  const suffix = location.search + location.hash;
  themeLink.href = (light ? 'index.html' : 'light.html') + suffix;
  const label = light ? themeLink.dataset.toDark : themeLink.dataset.toLight;
  themeLink.title = label;
  themeLink.setAttribute('aria-label', label);
  languageLink.href = languageLink.dataset[root.dataset.theme] + suffix;
}
syncLinks();
window.addEventListener('hashchange', syncLinks);
window.addEventListener('pageshow', syncLinks);

themeLink.addEventListener('click', event => {
  if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  const light = root.dataset.theme !== 'light';
  history.replaceState(history.state, '', themeLink.href);
  root.dataset.theme = light ? 'light' : 'dark';
  document.querySelector('meta[name="theme-color"]').content = light ? '#f5f6ff' : '#070d1d';
  for (const link of document.querySelectorAll('a[href]')) {
    if (link === languageLink || link === themeLink) continue;
    const directory = /^((?!\/)[.\w/-]+\/)(?:light\.html)?$/.exec(link.getAttribute('href'));
    if (directory) link.setAttribute('href', directory[1] + (light ? 'light.html' : ''));
  }
  syncLinks();
});

languageLink.addEventListener('click', () => {
  syncLinks();
  if (location.hash) return;
  const marker = document.querySelector('.dk-nav').getBoundingClientRect().bottom + 32;
  for (const section of document.querySelectorAll('main > section[id]')) {
    const bounds = section.getBoundingClientRect();
    if (bounds.top <= marker && bounds.bottom > marker) {
      languageLink.hash = section.id;
      break;
    }
  }
});
