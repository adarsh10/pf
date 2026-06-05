// ── Page loader ───────────────────────────────────────────────────
(function () {
  const loader = document.getElementById('page-loader');
  if (!loader) return;
  const start = Date.now();
  window.addEventListener('load', function () {
    const elapsed = Date.now() - start;
    const remaining = Math.max(0, 1000 - elapsed);
    setTimeout(() => loader.classList.add('hidden'), remaining);
  });
})();

// ── Theme toggle ──────────────────────────────────────────────────
const themeToggle = document.getElementById('themeToggle');
if (themeToggle) {
  themeToggle.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme') || 'dark';
    const next = current === 'light' ? 'dark' : 'light';

    document.documentElement.classList.add('theme-switching');
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);

    setTimeout(() => document.documentElement.classList.remove('theme-switching'), 500);
  });
}

// ── Nav scroll effect ─────────────────────────────────────────────
const nav = document.querySelector('.nav');
if (nav) {
  window.addEventListener('scroll', () => {
    nav.classList.toggle('scrolled', window.scrollY > 20);
  }, { passive: true });
}

// ── Mobile menu toggle ────────────────────────────────────────────
const toggle = document.querySelector('.nav-toggle');
const mobileMenu = document.querySelector('.mobile-menu');

if (toggle && mobileMenu) {
  toggle.addEventListener('click', () => {
    const isOpen = mobileMenu.classList.toggle('open');
    toggle.classList.toggle('open', isOpen);
    document.body.style.overflow = isOpen ? 'hidden' : '';
  });

  // Close on link click
  document.querySelectorAll('.mobile-link').forEach(link => {
    link.addEventListener('click', () => {
      mobileMenu.classList.remove('open');
      toggle.classList.remove('open');
      document.body.style.overflow = '';
    });
  });
}

// ── Scroll reveal ─────────────────────────────────────────────────
const revealElements = () => {
  const candidates = document.querySelectorAll(
    '.section-header, .project-card, .service-item, .about-inner > *, .testimonial, .contact-inner > *, .hero-content > *'
  );

  candidates.forEach((el, i) => {
    if (!el.classList.contains('reveal')) {
      el.classList.add('reveal');
      // stagger siblings inside the same parent
      const siblings = [...el.parentElement.children].filter(c => c.classList.contains('reveal'));
      const idx = siblings.indexOf(el);
      if (idx === 1) el.classList.add('reveal-delay-1');
      if (idx === 2) el.classList.add('reveal-delay-2');
      if (idx === 3) el.classList.add('reveal-delay-3');
    }
  });

  const observer = new IntersectionObserver(
    entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }
  );

  document.querySelectorAll('.reveal').forEach(el => observer.observe(el));
};

// Run after fonts / DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', revealElements);
} else {
  revealElements();
}

// ── Microsoft Journey Story Viewer ────────────────────────────────
const STORY_DATA = [
  {
    year: '2019', num: '01',
    title: 'The First Design System',
    desc: 'Built Microsoft 365 mobile\'s first ever design system from scratch — a shared vocabulary of components, tokens and patterns that became the foundation every team built on.',
    gradient: 'linear-gradient(160deg, #0a1a10 0%, #0f3020 55%, #081510 100%)',
    accent: '#4ade80',
  },
  {
    year: '2021', num: '02',
    title: 'iPad, Unlocked',
    desc: 'Brought the unified Office app to iPad — adapting mobile-first flows for a larger canvas and unlocking a richer productivity experience for millions of tablet users worldwide.',
    gradient: 'linear-gradient(160deg, #0a1530 0%, #102040 55%, #080f20 100%)',
    accent: '#93c5fd',
  },
  {
    year: '2021', num: '03',
    title: 'Quick Action Bar',
    desc: 'Designed the QAB — a persistent, context-aware toolbar that surfaced the right Copilot actions at exactly the right moment, cutting friction across every M365 app.',
    gradient: 'linear-gradient(160deg, #1a0a08 0%, #3a1008 55%, #180808 100%)',
    accent: '#fb923c',
  },
  {
    year: '2022', num: '04',
    title: 'Motion, Intentional',
    desc: 'Introduced Lottie animations into M365 mobile — bringing life to loading states, onboarding flows and empty states without adding bloat or hurting performance.',
    gradient: 'linear-gradient(160deg, #0a1020 0%, #1a0a40 55%, #100820 100%)',
    accent: '#c084fc',
  },
  {
    year: '2023', num: '05',
    title: 'Redesigning Home',
    desc: 'Redesigned the Home tab — the first screen millions see every day. Built a personalised, AI-aware surface that surfaced what mattered before users even thought to ask.',
    gradient: 'linear-gradient(160deg, #080f18 0%, #0f1a30 55%, #060c18 100%)',
    accent: '#38bdf8',
  },
  {
    year: '2022–24', num: '06',
    title: 'Three Names, One Vision',
    desc: 'Designed through three major rebrands — Office to Microsoft 365 to Copilot. Each shift had to feel seamless to hundreds of millions of existing users while signalling something entirely new.',
    gradient: 'linear-gradient(160deg, #120820 0%, #280a48 55%, #100820 100%)',
    accent: '#e879f9',
  },
];

class StoryViewer {
  constructor(data) {
    this.data    = data;
    this.current = 0;
    this.raf     = null;
    this.startTime = null;
    this.elapsed   = 0;
    this.duration  = 5000;

    this.el          = document.getElementById('storyViewer');
    this.progressRow = document.getElementById('svProgressRow');
    this.slideArea   = document.getElementById('svSlideArea');
    this.fills       = [];
    this.slides      = [];

    this._buildDOM();
    this._bindEvents();
  }

  _buildDOM() {
    this.progressRow.innerHTML = this.data.map((_, i) =>
      `<div class="sv-bar"><div class="sv-fill" id="svf${i}"></div></div>`
    ).join('');

    this.slideArea.innerHTML = this.data.map((s, i) =>
      `<div class="sv-slide${i === 0 ? ' is-active' : ''}" data-idx="${i}" style="background:${s.gradient}">
        <div class="sv-bg-year">${s.year}</div>
        <div class="sv-slide-inner">
          <div class="sv-slide-num">
            <span class="sv-dot" style="background:${s.accent}"></span>
            ${s.num} / ${String(this.data.length).padStart(2, '0')}
          </div>
          <div class="sv-slide-year">${s.year}</div>
          <h2 class="sv-slide-title">${s.title}</h2>
          <p class="sv-slide-desc">${s.desc}</p>
        </div>
      </div>`
    ).join('');

    this.fills  = this.data.map((_, i) => document.getElementById(`svf${i}`));
    this.slides = [...this.slideArea.querySelectorAll('.sv-slide')];
  }

  open() {
    this.el.classList.add('is-open');
    document.body.style.overflow = 'hidden';
    this.goTo(0);
  }

  close() {
    cancelAnimationFrame(this.raf);
    this.el.classList.remove('is-open');
    document.body.style.overflow = '';
    this.elapsed = 0;
    this.fills.forEach(f => { f.style.width = '0%'; });
  }

  goTo(idx) {
    cancelAnimationFrame(this.raf);
    this.elapsed = 0;
    this.current = Math.max(0, Math.min(idx, this.data.length - 1));

    this.slides.forEach((s, i) => s.classList.toggle('is-active', i === this.current));

    this.fills.forEach((f, i) => {
      f.style.transition = 'none';
      f.style.width = i < this.current ? '100%' : '0%';
    });

    requestAnimationFrame(() => { this._startProgress(); });
  }

  _startProgress() {
    const fill = this.fills[this.current];
    this.startTime = performance.now() - this.elapsed;

    const tick = (now) => {
      const t = Math.min((now - this.startTime) / this.duration, 1);
      fill.style.width = (t * 100) + '%';
      if (t < 1) {
        this.raf = requestAnimationFrame(tick);
      } else {
        this.current < this.data.length - 1 ? this.goTo(this.current + 1) : this.close();
      }
    };
    this.raf = requestAnimationFrame(tick);
  }

  next() { this.goTo(this.current + 1); }
  prev() { this.goTo(this.current - 1); }

  _bindEvents() {
    document.getElementById('openStories').addEventListener('click', () => this.open());
    document.getElementById('svClose').addEventListener('click',  () => this.close());
    document.getElementById('svNext').addEventListener('click',   (e) => { e.stopPropagation(); this.next(); });
    document.getElementById('svPrev').addEventListener('click',   (e) => { e.stopPropagation(); this.prev(); });

    document.addEventListener('keydown', e => {
      if (!this.el.classList.contains('is-open')) return;
      if (e.key === 'ArrowRight') this.next();
      if (e.key === 'ArrowLeft')  this.prev();
      if (e.key === 'Escape')     this.close();
    });

    // Swipe on touch
    let touchX = 0;
    const wrap = document.getElementById('svWrap');
    if (wrap) {
      wrap.addEventListener('touchstart', e => { touchX = e.touches[0].clientX; }, { passive: true });
      wrap.addEventListener('touchend', e => {
        const dx = touchX - e.changedTouches[0].clientX;
        if (Math.abs(dx) > 60) dx > 0 ? this.next() : this.prev();
      });
    }

    // Tap backdrop to close
    this.el.addEventListener('click', e => { if (e.target === this.el) this.close(); });
  }
}

if (document.getElementById('openStories')) {
  const storyViewer = new StoryViewer(STORY_DATA);
}

