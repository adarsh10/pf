(() => {
  const collage = document.querySelector('.play-collage');
  if (!collage) return;
  const motionToggle = collage.querySelector('.motion-toggle');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let paused = false;
  let inView = false;
  const updateMotion = () => {
    const stopped = paused || reducedMotion.matches;
    document.body.classList.toggle('is-motion-paused', stopped);
    collage.classList.toggle('is-play-active', !stopped && inView && !document.hidden);
    motionToggle.setAttribute('aria-pressed', String(stopped));
    motionToggle.disabled = reducedMotion.matches;
    motionToggle.textContent = reducedMotion.matches ? 'Motion reduced' : paused ? 'Resume motion' : 'Pause motion';
  };
  motionToggle.hidden = false;
  motionToggle.addEventListener('click', () => {
    paused = !paused;
    updateMotion();
  });
  reducedMotion.addEventListener('change', updateMotion);
  document.addEventListener('visibilitychange', updateMotion);
  const observer = new IntersectionObserver(([entry]) => {
    inView = entry.isIntersecting;
    updateMotion();
  });
  observer.observe(collage);
  updateMotion();
})();
