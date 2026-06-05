/**
 * Portfolio project password protection
 * - Session-based: unlocking one project unlocks all for the browser session
 * - Content hidden immediately via injected style to prevent flash
 * - Password verified with SHA-256 (Web Crypto API)
 */
(function () {
  const SESSION_KEY = 'pf_auth_v1';
  // SHA-256 of the password (secure contexts) or btoa fallback (HTTP)
  const PASSWORD_HASH = 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f';
  const PASSWORD_FALLBACK = 'fallback:' + btoa('password123');

  // Already authenticated — do nothing
  if (sessionStorage.getItem(SESSION_KEY) === 'granted') return;

  // Immediately hide body to prevent content flash
  var hideStyle = document.createElement('style');
  hideStyle.id = 'auth-hide';
  hideStyle.textContent = 'body{visibility:hidden!important}';
  document.head.appendChild(hideStyle);

  async function sha256(str) {
    if (crypto && crypto.subtle) {
      const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
      return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
    }
    // Fallback for non-secure contexts (HTTP): use btoa-based check
    return 'fallback:' + btoa(str);
  }

  function buildOverlay() {
    const overlay = document.createElement('div');
    overlay.id = 'auth-overlay';
    overlay.innerHTML = `
      <div class="auth-card">
        <div class="auth-lock">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
          </svg>
        </div>
        <div class="auth-logo">Adarssssh.</div>
        <h2 class="auth-title">Protected Work</h2>
        <p class="auth-sub">This case study is password protected. Enter the password to continue.</p>
        <form class="auth-form" id="authForm" autocomplete="off">
          <div class="auth-input-wrap">
            <input
              type="password"
              id="authInput"
              class="auth-input"
              placeholder="Enter password"
              autocomplete="current-password"
              autofocus
            />
          </div>
          <p class="auth-error" id="authError"></p>
          <button type="submit" class="auth-btn" id="authBtn">
            <span class="auth-btn-text">Unlock</span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
          </button>
        </form>
      </div>
    `;

    const style = document.createElement('style');
    style.textContent = `
      #auth-overlay {
        position: fixed;
        inset: 0;
        z-index: 9999;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 24px;
        background-color: var(--white, #18181a);
        background-image: radial-gradient(circle, rgba(255,255,255,0.18) 1px, transparent 1px);
        background-size: 24px 24px;
        transition: opacity 0.4s ease;
      }
      html[data-theme="light"] #auth-overlay {
        background-color: var(--white, #f5f3ef);
        background-image: radial-gradient(circle, rgba(0,0,0,0.10) 1px, transparent 1px);
      }
      #auth-overlay.auth-fade-out {
        opacity: 0;
        pointer-events: none;
      }
      .auth-card {
        background: var(--gray-100, #232323);
        border-radius: 20px;
        padding: clamp(32px, 5vw, 56px);
        max-width: 420px;
        width: 100%;
        text-align: center;
      }
      html[data-theme="light"] .auth-card {
        background: var(--gray-100, #efede9);
      }
      .auth-lock {
        width: 52px;
        height: 52px;
        border-radius: 14px;
        background: var(--gray-200, #2c2c2c);
        display: flex;
        align-items: center;
        justify-content: center;
        margin: 0 auto 20px;
        color: var(--gray-500, #888);
      }
      html[data-theme="light"] .auth-lock {
        background: var(--gray-200, #e0ddd7);
        color: var(--gray-500, #888);
      }
      .auth-logo {
        font-size: 13px;
        font-weight: 600;
        letter-spacing: 0.03em;
        color: var(--gray-400, #666);
        margin-bottom: 16px;
      }
      .auth-title {
        font-family: var(--font-sans, 'DM Sans', sans-serif);
        font-size: clamp(22px, 3vw, 28px);
        font-weight: 500;
        color: var(--black, #f2f0ec);
        margin: 0 0 10px;
        letter-spacing: -0.02em;
      }
      .auth-sub {
        font-size: 14px;
        color: var(--gray-500, #888);
        line-height: 1.6;
        margin: 0 0 28px;
      }
      .auth-form {
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      .auth-input-wrap {
        position: relative;
      }
      .auth-input {
        width: 100%;
        box-sizing: border-box;
        background: var(--gray-200, #2c2c2c);
        border: 1px solid var(--gray-300, #3a3a3a);
        border-radius: 10px;
        padding: 13px 16px;
        font-size: 15px;
        font-family: var(--font-sans, 'DM Sans', sans-serif);
        color: var(--black, #f2f0ec);
        outline: none;
        transition: border-color 0.2s;
      }
      html[data-theme="light"] .auth-input {
        background: var(--white, #f5f3ef);
        border-color: var(--gray-300, #d0cdc7);
        color: var(--black, #18181a);
      }
      .auth-input:focus {
        border-color: var(--gray-500, #888);
      }
      .auth-input.auth-input--error {
        border-color: #ef4444;
        animation: auth-shake 0.3s ease;
      }
      @keyframes auth-shake {
        0%, 100% { transform: translateX(0); }
        25% { transform: translateX(-6px); }
        75% { transform: translateX(6px); }
      }
      .auth-error {
        font-size: 13px;
        color: #ef4444;
        margin: 0;
        min-height: 18px;
        text-align: left;
      }
      .auth-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        background: var(--black, #f2f0ec);
        color: var(--white, #18181a);
        border: none;
        border-radius: 10px;
        padding: 13px 20px;
        font-size: 14px;
        font-weight: 600;
        font-family: var(--font-sans, 'DM Sans', sans-serif);
        cursor: pointer;
        transition: opacity 0.2s;
        width: 100%;
      }
      html[data-theme="light"] .auth-btn {
        background: var(--black, #18181a);
        color: var(--white, #f5f3ef);
      }
      .auth-btn:hover { opacity: 0.85; }
      .auth-btn:disabled { opacity: 0.5; cursor: not-allowed; }
    `;

    document.head.appendChild(style);
    return overlay;
  }

  function unlock(overlay) {
    sessionStorage.setItem(SESSION_KEY, 'granted');
    overlay.classList.add('auth-fade-out');
    setTimeout(() => overlay.remove(), 400);
  }

  document.addEventListener('DOMContentLoaded', function () {
    // Reveal body (overlay will cover it)
    document.getElementById('auth-hide').remove();
    document.body.style.visibility = '';

    const overlay = buildOverlay();
    document.body.appendChild(overlay);

    const form = document.getElementById('authForm');
    const input = document.getElementById('authInput');
    const error = document.getElementById('authError');
    const btn = document.getElementById('authBtn');

    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      const val = input.value.trim();
      if (!val) return;

      btn.disabled = true;
      btn.querySelector('.auth-btn-text').textContent = 'Checking…';
      error.textContent = '';
      input.classList.remove('auth-input--error');

      const hash = await sha256(val);

      if (hash === PASSWORD_HASH || hash === PASSWORD_FALLBACK) {
        unlock(overlay);
      } else {
        error.textContent = 'Incorrect password. Please try again.';
        input.classList.add('auth-input--error');
        input.value = '';
        input.focus();
        btn.disabled = false;
        btn.querySelector('.auth-btn-text').textContent = 'Unlock';
      }
    });
  });
})();
