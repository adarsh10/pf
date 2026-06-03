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
    year: '2018', num: '01',
    title: 'Intern Days',
    desc: 'Walked in as an intern. Fell in love with designing at Microsoft\'s scale — and never really left.',
    gradient: 'linear-gradient(160deg, #0a0520 0%, #200a50 55%, #0e0a30 100%)',
    accent: '#a78bfa',
  },
  {
    year: '2019', num: '02',
    title: 'Small Ask, Big Impact',
    desc: 'Joined full-time. First project: design a filter. Simple brief — shipped to millions and set the bar for everything after.',
    gradient: 'linear-gradient(160deg, #0f0a35 0%, #1e1060 55%, #0a1040 100%)',
    accent: '#818cf8',
  },
  {
    year: '2020', num: '03',
    title: 'One App',
    desc: 'Shipped the unified Office app — bringing Word, Excel, PowerPoint and more under one roof on mobile.',
    gradient: 'linear-gradient(160deg, #061830 0%, #0a2a5a 55%, #061828 100%)',
    accent: '#60a5fa',
  },
  {
    year: '2021', num: '04',
    title: 'Expanding Scope',
    desc: 'Took on broader design challenges across Microsoft 365 — growing from feature designer to platform thinker.',
    gradient: 'linear-gradient(160deg, #041820 0%, #063040 55%, #041820 100%)',
    accent: '#34d399',
  },
  {
    year: '2022', num: '05',
    title: 'A New Name',
    desc: 'Led design for the rebrand of the Office app to Microsoft 365 — a name change that signalled a whole new product direction.',
    gradient: 'linear-gradient(160deg, #060a20 0%, #0a1850 55%, #060818 100%)',
    accent: '#38bdf8',
  },
  {
    year: '2023', num: '06',
    title: 'The AI Revolution',
    desc: 'Part of the core team that launched Microsoft Copilot — the most significant product shift of a generation.',
    gradient: 'linear-gradient(160deg, #180830 0%, #3a0a60 55%, #160830 100%)',
    accent: '#e879f9',
  },
  {
    year: '2024', num: '07',
    title: 'Intelligence, Native',
    desc: 'Rebranded Microsoft 365 and shipped AI-first mobile experiences — making Copilot feel native, not bolted on.',
    gradient: 'linear-gradient(160deg, #0a1530 0%, #0f2a50 55%, #080f28 100%)',
    accent: '#7dd3fc',
  },
  {
    year: '2025', num: '08',
    title: 'The AI Charter',
    desc: 'Took over the AI design charter for M365 mobile — leading design for the most transformative shift in Microsoft\'s history.',
    gradient: 'linear-gradient(160deg, #100830 0%, #2a0a60 45%, #0e1050 100%)',
    accent: '#a78bfa',
  },
  {
    year: '2026', num: '09',
    title: 'Intelligence by Design',
    desc: 'Designing the AI-native experiences of tomorrow — building Copilot features that make intelligence feel natural, useful, and human.',
    gradient: 'linear-gradient(160deg, #150520 0%, #320a55 50%, #100a35 100%)',
    accent: '#f0abfc',
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

