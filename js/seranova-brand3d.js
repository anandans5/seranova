/* Seranova Material Vault: pointer-driven 3D cards and scroll-reactive lighting.
   Local-only enhancement; preserves brand logos and all existing page content. */
(() => {
  "use strict";
  const showcase = document.querySelector(".home-page .intro-panel .brand-showcase");
  if (!showcase) return;

  const cards = Array.from(showcase.querySelectorAll(".material-card.brand-card"));
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)");
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  let pointerFrame = 0;
  let latestPointer = null;
  let scrollFrame = 0;

  cards.forEach((card, index) => {
    const n = index % 8;
    const initialStyle = getComputedStyle(card);
    card.dataset.baseRotateX = String(Number.parseFloat(initialStyle.getPropertyValue("--brand-rotate-x")) || 4);
    card.dataset.baseRotateY = String(Number.parseFloat(initialStyle.getPropertyValue("--brand-rotate-y")) || 0);
    card.style.setProperty("--brand-float-delay", `${-(n * 0.43)}s`);
    card.style.setProperty("--brand-shine-delay", `${-(n * 0.67)}s`);
    card.style.setProperty("--brand-lift", `${(index % 3) * -1.4}px`);
  });

  function applyPointer() {
    pointerFrame = 0;
    if (!latestPointer || reducedMotion.matches || !finePointer.matches) return;
    const rect = showcase.getBoundingClientRect();
    const nx = clamp((latestPointer.x - rect.left) / Math.max(1, rect.width), 0, 1);
    const ny = clamp((latestPointer.y - rect.top) / Math.max(1, rect.height), 0, 1);
    cards.forEach((card) => {
      const cardRect = card.getBoundingClientRect();
      const cx = (cardRect.left + cardRect.width / 2 - rect.left) / Math.max(1, rect.width);
      const cy = (cardRect.top + cardRect.height / 2 - rect.top) / Math.max(1, rect.height);
      const dx = nx - cx;
      const dy = ny - cy;
      const distance = Math.hypot(dx, dy);
      const influence = clamp(1 - distance * 1.55, 0, 1);
      const baseX = Number.parseFloat(card.dataset.baseRotateX) || 4;
      const baseY = Number.parseFloat(card.dataset.baseRotateY) || 0;
      card.style.setProperty("--brand-rotate-x", `${clamp(baseX + (-dy * 17 * influence), -16, 17)}deg`);
      card.style.setProperty("--brand-rotate-y", `${clamp(baseY + (dx * 20 * influence), -22, 22)}deg`);
      card.style.setProperty("--brand-lift", `${-1 - (influence * 7)}px`);
      card.style.setProperty("--brand-depth", `${24 + influence * 23}px`);
    });
  }

  showcase.addEventListener("pointermove", (event) => {
    if (!finePointer.matches || reducedMotion.matches) return;
    latestPointer = { x: event.clientX, y: event.clientY };
    if (!pointerFrame) pointerFrame = requestAnimationFrame(applyPointer);
  }, { passive: true });

  showcase.addEventListener("pointerleave", () => {
    latestPointer = null;
    if (pointerFrame) cancelAnimationFrame(pointerFrame);
    pointerFrame = 0;
    cards.forEach((card) => {
      card.style.removeProperty("--brand-rotate-x");
      card.style.removeProperty("--brand-rotate-y");
      card.style.removeProperty("--brand-depth");
      const index = cards.indexOf(card);
      card.style.setProperty("--brand-lift", `${(index % 3) * -1.4}px`);
    });
  }, { passive: true });

  function applyScroll() {
    scrollFrame = 0;
    const rect = showcase.getBoundingClientRect();
    const viewport = Math.max(1, window.innerHeight);
    const centerDistance = (rect.top + rect.height / 2 - viewport / 2) / viewport;
    const tilt = clamp(-centerDistance * 3.8, -4.5, 4.5);
    const roll = clamp(centerDistance * 2.5, -3, 3);
    const visibility = clamp((viewport - rect.top) / (viewport + rect.height), 0, 1);
    showcase.style.setProperty("--brand-scroll-tilt", `${tilt.toFixed(2)}deg`);
    showcase.style.setProperty("--brand-scroll-roll", `${roll.toFixed(2)}deg`);
    showcase.style.setProperty("--brand-light-sweep", `${Math.round(visibility * 100)}%`);
    showcase.style.setProperty("--brand-scroll-progress", visibility.toFixed(3));
  }
  function requestScroll() {
    if (scrollFrame) return;
    scrollFrame = requestAnimationFrame(applyScroll);
  }

  window.addEventListener("scroll", requestScroll, { passive: true });
  window.addEventListener("resize", requestScroll, { passive: true });
  if (reducedMotion.addEventListener) {
    reducedMotion.addEventListener("change", () => {
      if (reducedMotion.matches) {
        cards.forEach((card) => {
          card.style.removeProperty("--brand-rotate-x");
          card.style.removeProperty("--brand-rotate-y");
        });
        showcase.style.setProperty("--brand-scroll-tilt", "0deg");
        showcase.style.setProperty("--brand-scroll-roll", "0deg");
      }
    });
  }
  applyScroll();
})();
