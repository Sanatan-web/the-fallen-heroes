/* A brief fade, then the map. Modified clicks open normally; reduced motion skips the fade. */
document.getElementById("enter").addEventListener("click", (e) => {
  if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  e.preventDefault();
  const href = e.currentTarget.getAttribute("href");
  document.querySelector(".entry").classList.add("is-leaving");
  setTimeout(() => (location.href = href), 400);
});
