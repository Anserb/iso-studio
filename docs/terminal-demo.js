const command = document.querySelector('#typewriter');
const lines = [...document.querySelectorAll('#terminal-output p')];

if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
  const fullCommand = command.textContent;
  command.textContent = '';
  lines.forEach(line => { line.hidden = true; });
  let position = 0;

  function typeNext() {
    command.textContent = fullCommand.slice(0, ++position);
    if (position < fullCommand.length) {
      setTimeout(typeNext, 32);
    } else {
      lines.forEach((line, index) => {
        setTimeout(() => { line.hidden = false; }, 350 + index * 550);
      });
    }
  }

  setTimeout(typeNext, 380);
}
