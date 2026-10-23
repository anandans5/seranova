/* SERANOVA IMMERSIVE INTERACTIONS
 * Lightweight, dependency-free 3D interaction layer for all pages.
 * Does not rewrite content or depend on WebGL/CDN assets.
 */
(() => {
  'use strict';

  const doc = document;
  const root = doc.documentElement;
  const body = doc.body;
  if (!body || !body.classList.contains('site-theme')) return;

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
  const raf = window.requestAnimationFrame.bind(window);

  // A thin instrument-style scroll meter stays consistent across the whole site.
  const progress = doc.createElement('div');
  progress.className = 'seranova-scroll-progress';
  progress.setAttribute('aria-hidden', 'true');
  progress.innerHTML = '<span></span>';
  body.appendChild(progress);

  // Construct an architectural study for interior-page hero panels using CSS only.
  // The tower is decorative; all business copy and actual image assets remain untouched.
  function buildPageHeroObject() {
    const hero = doc.querySelector('.inner-page .page-hero');
    if (!hero || hero.querySelector('.sr-page-hero-object')) return;

    const object = doc.createElement('div');
    object.className = 'sr-page-hero-object';
    object.setAttribute('aria-hidden', 'true');

    const orbitA = doc.createElement('div');
    orbitA.className = 'sr-hero-orbit';
    const orbitB = doc.createElement('div');
    orbitB.className = 'sr-hero-orbit orbit-two';
    const axis = doc.createElement('div');
    axis.className = 'sr-hero-axis';

    const tower = doc.createElement('div');
    tower.className = 'sr-hero-tower';
    const front = doc.createElement('div');
    front.className = 'sr-hero-front';
    const side = doc.createElement('div');
    side.className = 'sr-hero-side';
    const roof = doc.createElement('div');
    roof.className = 'sr-hero-roof';
    tower.append(front, side, roof);
    for (let i = 0; i < 7; i += 1) {
      const slab = doc.createElement('span');
      slab.className = 'sr-hero-slab';
      slab.style.setProperty('--floor', String(i));
      tower.appendChild(slab);
    }

    const crane = doc.createElement('div');
    crane.className = 'sr-hero-crane';
    for (let i = 0; i < 4; i += 1) {
      const tie = doc.createElement('span');
      tie.style.setProperty('--tie', String(i * 14 + 6));
      crane.appendChild(tie);
    }
    crane.appendChild(doc.createElement('i'));

    const crosshair = doc.createElement('div');
    crosshair.className = 'sr-hero-crosshair';
    object.append(orbitA, orbitB, axis, tower, crane, crosshair);
    hero.appendChild(object);
  }

  buildPageHeroObject();

  // Tilt interactive visual surfaces with pointer input, with conservative motion range.
  const tiltSelector = [
    '.home-service-card', '.package', '.principle', '.home-gallery-card',
    '.seranova-gallery-card', '.service', '.detail', '.placeholder-card',
    '.director', '.value', '.contact-list', '.contact-map-frame', '.empty'
  ].join(',');
  const tiltTargets = Array.from(doc.querySelectorAll(tiltSelector));
  const parallaxImages = Array.from(doc.querySelectorAll('.home-page .gallery-photo img, .inner-page .seranova-gallery-card img'));
  const scrollCardTargets = tiltTargets;
  if (finePointer.matches && !reducedMotion.matches) {
    tiltTargets.forEach((card) => {
      card.classList.add('sr-tilt-target');
      card.addEventListener('pointermove', (event) => {
        if (event.pointerType && event.pointerType !== 'mouse') return;
        const r = card.getBoundingClientRect();
        const nx = clamp((event.clientX - r.left) / Math.max(1, r.width), 0, 1) - 0.5;
        const ny = clamp((event.clientY - r.top) / Math.max(1, r.height), 0, 1) - 0.5;
        card.style.setProperty('--sr-tilt-x', `${(-ny * 7).toFixed(2)}deg`);
        card.style.setProperty('--sr-tilt-y', `${(nx * 8).toFixed(2)}deg`);
      }, { passive: true });
      card.addEventListener('pointerleave', () => {
        card.style.setProperty('--sr-tilt-x', '0deg');
        card.style.setProperty('--sr-tilt-y', '0deg');
      }, { passive: true });
    });
  } else {
    tiltTargets.forEach((card) => card.classList.add('sr-static-depth'));
  }

  // Add staggered arrival, but only enable conceal/reveal after an observer is ready.
  const revealSelector = [
    '.inner-page .page-hero .wrap', '.section-head', '.intro-copy',
    '.home-service-card', '.package', '.home-gallery-card', '.principle',
    '.home-about-grid > div', '.faq-item', '.service', '.detail',
    '.placeholder-card', '.director', '.value', '.seranova-gallery-card',
    '.contact-layout > *', '.contact-map', '.empty'
  ].join(',');
  const revealTargets = Array.from(doc.querySelectorAll(revealSelector));
  if ('IntersectionObserver' in window && !reducedMotion.matches) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('sr-visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -5% 0px' });
    revealTargets.forEach((el) => {
      el.classList.add('sr-reveal');
      observer.observe(el);
    });
    root.classList.add('sr-motion-ready');
  } else {
    revealTargets.forEach((el) => el.classList.add('sr-visible'));
  }

  const pageHeroObject = doc.querySelector('.sr-page-hero-object');
  let pointerRaf = 0;
  let scrollRaf = 0;
  let pointerX = window.innerWidth * 0.68;
  let pointerY = window.innerHeight * 0.2;

  function pointerMove(event) {
    if (!finePointer.matches || reducedMotion.matches) return;
    pointerX = event.clientX;
    pointerY = event.clientY;
    if (pointerRaf) return;
    pointerRaf = raf(() => {
      pointerRaf = 0;
      root.style.setProperty('--sr-pointer-x', `${pointerX}px`);
      root.style.setProperty('--sr-pointer-y', `${pointerY}px`);
      if (pageHeroObject) {
        const nx = pointerX / Math.max(1, window.innerWidth) - 0.5;
        const ny = pointerY / Math.max(1, window.innerHeight) - 0.5;
        pageHeroObject.style.setProperty('--sr-hero-rx', `${(4 - ny * 7).toFixed(2)}deg`);
        pageHeroObject.style.setProperty('--sr-hero-ry', `${(-10 + nx * 12).toFixed(2)}deg`);
        pageHeroObject.style.setProperty('--sr-hero-pointer-x', `${(nx * 8).toFixed(2)}px`);
        pageHeroObject.style.setProperty('--sr-hero-pointer-y', `${(ny * 7).toFixed(2)}px`);
      }
    });
  }

  function updateScroll() {
    scrollRaf = 0;
    const maxScroll = Math.max(1, doc.documentElement.scrollHeight - window.innerHeight);
    const p = clamp(window.scrollY / maxScroll, 0, 1);
    root.style.setProperty('--sr-scroll-progress', `${(p * 100).toFixed(2)}%`);
    if (pageHeroObject) {
      const hero = pageHeroObject.closest('.page-hero');
      if (hero) {
        const rect = hero.getBoundingClientRect();
        const progressInHero = clamp((window.innerHeight - rect.top) / (window.innerHeight + rect.height), 0, 1);
        pageHeroObject.style.setProperty('--sr-hero-scroll-y', `${((progressInHero - 0.5) * -24).toFixed(2)}px`);
      }
    }
    // Actual gallery photos drift a few pixels at a different speed from the page.
    parallaxImages.forEach((img) => {
      const rect = img.getBoundingClientRect();
      if (rect.bottom < -50 || rect.top > window.innerHeight + 50) return;
      const center = rect.top + rect.height / 2;
      const normalized = clamp((center - window.innerHeight / 2) / Math.max(1, window.innerHeight), -1, 1);
      img.style.setProperty('--sr-photo-parallax', `${(-normalized * 8).toFixed(2)}px`);
    });
    scrollCardTargets.forEach((card) => {
      const rect = card.getBoundingClientRect();
      if (rect.bottom < -50 || rect.top > window.innerHeight + 50) return;
      const normalized = clamp((rect.top + rect.height / 2 - window.innerHeight / 2) / Math.max(1, window.innerHeight), -1, 1);
      card.style.setProperty('--sr-scroll-card-y', `${(-normalized * 3).toFixed(2)}px`);
    });
  }
  function requestScroll() {
    if (scrollRaf) return;
    scrollRaf = raf(updateScroll);
  }

  if (finePointer.matches && !reducedMotion.matches) window.addEventListener('pointermove', pointerMove, { passive: true });
  window.addEventListener('scroll', requestScroll, { passive: true });
  window.addEventListener('resize', requestScroll, { passive: true });
  updateScroll();
})();
