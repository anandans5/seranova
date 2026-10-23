/* Seranova emblem assembly: reuses the supplied text-free logo mark on every page. */
(() => {
  'use strict';
  if (window.__seranovaLogoAssemblyMounted) return;
  window.__seranovaLogoAssemblyMounted = true;

  const mount = () => {
    if (!document.body || document.querySelector('.sr-logo-assembly')) return;

    const link = document.createElement('a');
    link.className = 'sr-logo-assembly';
    link.href = 'index.html';
    link.setAttribute('aria-label', 'Return to Seranova Infra homepage');
    link.setAttribute('title', 'Seranova Infra');

    const stage = document.createElement('span');
    stage.className = 'sr-logo-assembly__stage';
    stage.setAttribute('aria-hidden', 'true');

    const rows = 4;
    const cols = 3;
    let index = 0;
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const shard = document.createElement('span');
        shard.className = 'sr-logo-shard';
        shard.style.setProperty('--sr-shard-index', String(index));
        shard.style.animationDelay = `${index * 36}ms`;
        const top = row * (100 / rows);
        const right = 100 - (col + 1) * (100 / cols);
        const bottom = 100 - (row + 1) * (100 / rows);
        const left = col * (100 / cols);
        shard.style.clipPath = `inset(${top}% ${right}% ${bottom}% ${left}%)`;

        // Each cropped tile starts at a different offset and 3D angle, then snaps into the emblem.
        const dx = (col - 1) * 37 + (row % 2 ? 13 : -13);
        const dy = (row - 1.5) * 31 + (col % 2 ? 9 : -9);
        const dz = 72 + (index % 4) * 17;
        const rx = (row - 1.5) * 42;
        const ry = (col - 1) * 48;
        shard.style.setProperty('--sr-shard-x', `${dx}px`);
        shard.style.setProperty('--sr-shard-y', `${dy}px`);
        shard.style.setProperty('--sr-shard-z', `${dz}px`);
        shard.style.setProperty('--sr-shard-rx', `${rx}deg`);
        shard.style.setProperty('--sr-shard-ry', `${ry}deg`);
        stage.appendChild(shard);
        index++;
      }
    }

    const spark = document.createElement('span');
    spark.className = 'sr-logo-assembly__spark';
    spark.setAttribute('aria-hidden', 'true');
    link.append(stage, spark);
    document.body.appendChild(link);
    document.body.classList.add('sr-logo-mounted');

    const finePointer = window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    if (finePointer) {
      let frame = 0;
      link.addEventListener('pointermove', (event) => {
        const box = link.getBoundingClientRect();
        const nx = (event.clientX - box.left) / box.width - 0.5;
        const ny = (event.clientY - box.top) / box.height - 0.5;
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() => {
          link.style.setProperty('--sr-mark-tilt-x', `${-ny * 8}deg`);
          link.style.setProperty('--sr-mark-tilt-y', `${nx * 10}deg`);
        });
      });
      link.addEventListener('pointerleave', () => {
        link.style.setProperty('--sr-mark-tilt-x', '0deg');
        link.style.setProperty('--sr-mark-tilt-y', '0deg');
      });
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount, { once: true });
  } else {
    mount();
  }
})();
