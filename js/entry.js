/* A brief fade, then the map. Modified clicks open normally; reduced motion skips the fade. */
document.getElementById("enter").addEventListener("click", (e) => {
  if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  e.preventDefault();
  const href = e.currentTarget.getAttribute("href");
  document.querySelector(".entry").classList.add("is-leaving");
  setTimeout(() => (location.href = href), 400);
});
(function () {
  const INTERVAL = 1500; // ms per slide
  const slides = document.querySelectorAll('.entry-carousel .entry-bg');
  if (slides.length < 2) return;

  // Respect users who've turned off animations
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  // Load the other images in the background so the first fade isn't blank
  slides.forEach((img, i) => { if (i > 0) img.loading = 'eager'; });

  let current = 0;
  let timer = null;

  function next() {
    slides[current].classList.remove('is-active');
    current = (current + 1) % slides.length;
    slides[current].classList.add('is-active');
  }

  function start() { if (!timer) timer = setInterval(next, INTERVAL); }
  function stop() { clearInterval(timer); timer = null; }

  // Pause when the tab is hidden, to save battery and CPU
  document.addEventListener('visibilitychange', () => {
    document.hidden ? stop() : start();
  });

  start();
})();
