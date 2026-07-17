const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');

function initNavigation() {
  const header = document.querySelector('#site-header');
  const toggle = document.querySelector('#nav-toggle');
  const menu = document.querySelector('#nav-menu');
  const links = [...document.querySelectorAll('.nav-menu a[href^="#"]')];
  const sections = links
    .map((link) => document.querySelector(link.getAttribute('href')))
    .filter(Boolean);

  if (!header || !toggle || !menu) return;

  let ticking = false;
  const updateHeader = () => {
    header.classList.toggle('scrolled', window.scrollY > 24);
    ticking = false;
  };

  window.addEventListener('scroll', () => {
    if (!ticking) {
      requestAnimationFrame(updateHeader);
      ticking = true;
    }
  }, { passive: true });
  updateHeader();

  const setMenu = (open) => {
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Close navigation menu' : 'Open navigation menu');
    menu.classList.toggle('open', open);
  };

  toggle.addEventListener('click', () => {
    setMenu(toggle.getAttribute('aria-expanded') !== 'true');
  });

  links.forEach((link) => link.addEventListener('click', () => setMenu(false)));
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') {
      setMenu(false);
      toggle.focus();
    }
  });
  document.addEventListener('pointerdown', (event) => {
    if (!menu.contains(event.target) && !toggle.contains(event.target)) setMenu(false);
  });

  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver((entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (!visible) return;
      links.forEach((link) => {
        const active = link.getAttribute('href') === `#${visible.target.id}`;
        link.classList.toggle('active', active);
        if (active) link.setAttribute('aria-current', 'location');
        else link.removeAttribute('aria-current');
      });
    }, { rootMargin: '-28% 0px -62% 0px', threshold: [0, 0.15, 0.45] });
    sections.forEach((section) => observer.observe(section));
  }
}

function initReveals() {
  const elements = [...document.querySelectorAll('.reveal')];
  if (!elements.length || reducedMotion.matches || !('IntersectionObserver' in window)) return;

  elements.forEach((element) => element.classList.add('reveal-pending'));
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.remove('reveal-pending');
      entry.target.classList.add('reveal-visible');
      observer.unobserve(entry.target);
    });
  }, { rootMargin: '0px 0px -7% 0px', threshold: 0.08 });

  requestAnimationFrame(() => elements.forEach((element) => observer.observe(element)));
}

function initTilt() {
  if (!finePointer.matches || reducedMotion.matches) return;

  document.querySelectorAll('.tilt').forEach((card) => {
    let frame = 0;

    const update = (event) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const rect = card.getBoundingClientRect();
        const x = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
        const y = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height));
        card.style.setProperty('--ry', `${((x - 0.5) * 4.5).toFixed(2)}deg`);
        card.style.setProperty('--rx', `${((0.5 - y) * 4.5).toFixed(2)}deg`);
        card.style.setProperty('--spot-x', `${(x * 100).toFixed(1)}%`);
        card.style.setProperty('--spot-y', `${(y * 100).toFixed(1)}%`);
      });
    };

    const reset = () => {
      cancelAnimationFrame(frame);
      card.style.setProperty('--ry', '0deg');
      card.style.setProperty('--rx', '0deg');
    };

    card.addEventListener('pointermove', update, { passive: true });
    card.addEventListener('pointerleave', reset, { passive: true });
  });
}

function initHeroParallax() {
  const root = document.querySelector('[data-parallax-root]');
  if (!root || !finePointer.matches || reducedMotion.matches) return;

  const layers = [...root.querySelectorAll('[data-parallax-layer]')];
  let frame = 0;

  root.addEventListener('pointermove', (event) => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      const rect = root.getBoundingClientRect();
      const x = ((event.clientX - rect.left) / rect.width - 0.5) * 2;
      const y = ((event.clientY - rect.top) / rect.height - 0.5) * 2;
      layers.forEach((layer) => {
        const strength = Number(layer.dataset.parallaxLayer || 10);
        layer.style.translate = `${(x * strength).toFixed(2)}px ${(y * strength).toFixed(2)}px`;
      });
    });
  }, { passive: true });

  root.addEventListener('pointerleave', () => {
    cancelAnimationFrame(frame);
    layers.forEach((layer) => { layer.style.translate = '0 0'; });
  }, { passive: true });
}

class SpaceField {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: true });
    this.stars = [];
    this.pointer = { x: 0, y: 0, tx: 0, ty: 0 };
    this.raf = 0;
    this.resizeFrame = 0;
    this.lastFrame = 0;
    this.visible = true;
    this.width = 0;
    this.height = 0;
    this.dpr = 1;
    this.frameInterval = this.lowPowerDevice() ? 1000 / 30 : 1000 / 45;

    this.resize = this.resize.bind(this);
    this.handleResize = this.handleResize.bind(this);
    this.draw = this.draw.bind(this);
    this.handlePointer = this.handlePointer.bind(this);
    this.handleVisibility = this.handleVisibility.bind(this);

    this.resize();
    this.bind();
    this.raf = requestAnimationFrame(this.draw);
  }

  lowPowerDevice() {
    const memory = navigator.deviceMemory || 8;
    const cores = navigator.hardwareConcurrency || 8;
    return memory <= 4 || cores <= 4 || navigator.connection?.saveData;
  }

  bind() {
    window.addEventListener('resize', this.handleResize, { passive: true });
    if (finePointer.matches) window.addEventListener('pointermove', this.handlePointer, { passive: true });
    document.addEventListener('visibilitychange', this.handleVisibility);
  }

  resize() {
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.dpr = Math.min(window.devicePixelRatio || 1, this.lowPowerDevice() ? 1 : 1.5);
    this.canvas.width = Math.round(this.width * this.dpr);
    this.canvas.height = Math.round(this.height * this.dpr);
    this.canvas.style.width = `${this.width}px`;
    this.canvas.style.height = `${this.height}px`;
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.buildStars();
  }

  handleResize() {
    if (this.resizeFrame) return;
    this.resizeFrame = requestAnimationFrame(() => {
      this.resizeFrame = 0;
      this.resize();
    });
  }

  buildStars() {
    const area = this.width * this.height;
    const cap = this.lowPowerDevice() ? 54 : 100;
    const count = Math.min(cap, Math.max(35, Math.round(area / 14500)));
    this.stars = Array.from({ length: count }, () => ({
      x: Math.random() * this.width,
      y: Math.random() * this.height,
      radius: Math.random() * 1.05 + 0.25,
      alpha: Math.random() * 0.55 + 0.18,
      phase: Math.random() * Math.PI * 2,
      speed: Math.random() * 0.35 + 0.12,
      depth: Math.random() * 0.7 + 0.12,
      cyan: Math.random() > 0.84
    }));
  }

  handlePointer(event) {
    this.pointer.tx = event.clientX / this.width - 0.5;
    this.pointer.ty = event.clientY / this.height - 0.5;
  }

  handleVisibility() {
    this.visible = !document.hidden;
    if (this.visible && !this.raf) this.raf = requestAnimationFrame(this.draw);
  }

  draw(time) {
    this.raf = 0;
    if (!this.visible) return;
    this.raf = requestAnimationFrame(this.draw);
    if (time - this.lastFrame < this.frameInterval) return;
    this.lastFrame = time;

    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.width, this.height);
    this.pointer.x += (this.pointer.tx - this.pointer.x) * 0.025;
    this.pointer.y += (this.pointer.ty - this.pointer.y) * 0.025;

    for (const star of this.stars) {
      const twinkle = 0.72 + Math.sin(time * 0.001 * star.speed + star.phase) * 0.28;
      const x = star.x + this.pointer.x * 22 * star.depth;
      const y = star.y + this.pointer.y * 22 * star.depth;
      ctx.beginPath();
      ctx.arc(x, y, star.radius, 0, Math.PI * 2);
      ctx.fillStyle = star.cyan
        ? `rgba(111,235,255,${star.alpha * twinkle})`
        : `rgba(217,229,255,${star.alpha * twinkle})`;
      ctx.fill();
    }
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    cancelAnimationFrame(this.resizeFrame);
    window.removeEventListener('resize', this.handleResize);
    window.removeEventListener('pointermove', this.handlePointer);
    document.removeEventListener('visibilitychange', this.handleVisibility);
  }
}

function initSpaceField() {
  const canvas = document.querySelector('#space-canvas');
  if (!canvas || reducedMotion.matches || navigator.connection?.saveData) return null;
  return new SpaceField(canvas);
}

function init() {
  initNavigation();
  initReveals();
  initTilt();
  initHeroParallax();
  const field = initSpaceField();

  const year = document.querySelector('#year');
  if (year) year.textContent = String(new Date().getFullYear());

  reducedMotion.addEventListener?.('change', () => {
    if (reducedMotion.matches) field?.destroy();
  });
}

init();
