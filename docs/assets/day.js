// A real sibling URL also supports sharing, modifier-clicks and browsing without JS.
const switcher = document.querySelector('.day-switch');
function updateTarget() {
  const next = document.documentElement.dataset.theme === 'light' ? 'index.html' : 'light.html';
  switcher.href = next + location.search + location.hash;
}
updateTarget();
window.addEventListener('hashchange', updateTarget);
switcher.addEventListener('click', event => {
  if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  const light = document.documentElement.dataset.theme !== 'light';
  history.replaceState(history.state, '', switcher.href);
  document.documentElement.dataset.theme = light ? 'light' : 'dark';
  document.querySelector('meta[name="theme-color"]').content = light ? '#f5f6ff' : '#070d1d';
  switcher.textContent = light ? '深色' : '亮色';
  switcher.setAttribute('aria-label', '切换为' + switcher.textContent + '版');
  for (const link of document.querySelectorAll('a[href]')) {
    const directory = /^((?!\/)[.\w/-]+\/)(?:light\.html)?$/.exec(link.getAttribute('href'));
    if (directory) link.setAttribute('href', directory[1] + (light ? 'light.html' : ''));
  }
  updateTarget();
});
