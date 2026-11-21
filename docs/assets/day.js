// Native disclosure elements keep navigation and the topic list usable without JavaScript.
const menu = document.querySelector('.more');
document.addEventListener('click', event => {
  if (menu.open && !menu.contains(event.target)) menu.open = false;
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && menu.open) {
    menu.open = false;
    menu.querySelector('summary').focus();
  }
});
const switcher = document.querySelector('[data-appearance]');
switcher.addEventListener('click', () => { switcher.hash = location.hash; });
