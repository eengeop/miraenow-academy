const button = document.querySelector('#zoom');
const viewport = document.querySelector('#image-viewport');

button.addEventListener('click', () => {
  const expanded = viewport.classList.toggle('is-zoomed');
  button.setAttribute('aria-pressed', String(expanded));
  button.textContent = expanded ? '화면에 맞추기' : '확대 보기';
});
