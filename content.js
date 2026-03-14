// ── LeetCode Solution Detector (GraphQL + DOM polling) ───────────────────────
(function () {
  if (window.__lcTrackerInjected) return;
  window.__lcTrackerInjected = true;

  console.log('[LC Tracker] Loaded on', window.location.href);

  const originalFetch = window.fetch;

  // ── Intercept fetch ──────────────────────────────────────────────────────
  window.fetch = async function (...args) {
    const response = await originalFetch.apply(this, args);
    try {
      const url = (typeof args[0] === 'string' ? args[0] : args[0]?.url) || '';

      // Old REST check endpoint
      if (url.includes('/submissions/detail/') && url.includes('/check/')) {
        const clone = response.clone();
        clone.json().then(data => {
          if (data.status_msg === 'Accepted') {
            console.log('[LC Tracker] REST: Accepted!');
            setTimeout(buildAndPush, 300);
          }
        }).catch(() => {});
      }
    } catch (e) {}
    return response;
  };

  // ── DOM Polling — watches for Accepted verdict ───────────────────────────
  let lastPushTime = 0;

  setInterval(() => {
    // Find any element that ONLY contains the text "Accepted"
    const all = document.querySelectorAll('span, div, p');
    for (const el of all) {
      if (
        el.children.length === 0 &&
        el.textContent.trim() === 'Accepted' &&
        !el.__lcTracked
      ) {
        el.__lcTracked = true;
        const now = Date.now();
        // Debounce: don't push twice within 5 seconds
        if (now - lastPushTime > 5000) {
          lastPushTime = now;
          console.log('[LC Tracker] DOM: Found Accepted!');
          setTimeout(buildAndPush, 800);
        }
      }
    }
  }, 1000);

  // ── Build payload and push ───────────────────────────────────────────────
  function buildAndPush() {
    const title      = getProblemTitle();
    const number     = getProblemNumber();
    const difficulty = getDifficulty();
    const language   = getLanguage();
    const code       = getCode();
    const titleSlug  = getTitleSlug();

    console.log('[LC Tracker] Payload:', { title, number, difficulty, language, titleSlug, codeLen: code?.length });

    if (!code || code.length < 5) {
      console.warn('[LC Tracker] No code found, aborting.');
      return;
    }

    chrome.runtime.sendMessage({
      type: 'PUSH_TO_GITHUB',
      payload: { title, number, difficulty, language, code, titleSlug, timestamp: Date.now() }
    }, res => {
      console.log('[LC Tracker] Push result:', res);
    });
  }

  // ── Helpers ──────────────────────────────────────────────────────────────
  function getTitleSlug() {
    const m = window.location.pathname.match(/\/problems\/([^/]+)/);
    return m ? m[1] : '';
  }

  function getProblemTitle() {
    const slug = getTitleSlug();
    // Try DOM first
    const selectors = [
      '[data-cy="question-title"]',
      'div.text-title-large a',
      'div[class*="title-large"]',
      'a[href*="/problems/"] div',
    ];
    for (const s of selectors) {
      const el = document.querySelector(s);
      if (el?.textContent?.trim()) return el.textContent.trim();
    }
    // Fallback: prettify slug
    return slug.split('-').map(w => w[0]?.toUpperCase() + w.slice(1)).join(' ');
  }

  function getProblemNumber() {
    const text = document.title + ' ' + (document.querySelector('[data-cy="question-title"]')?.textContent || '');
    const m = text.match(/(\d+)\./);
    return m ? parseInt(m[1]) : null;
  }

  function getDifficulty() {
    const els = document.querySelectorAll('div, span');
    for (const el of els) {
      const t = el.textContent.trim();
      if (['Easy', 'Medium', 'Hard'].includes(t) && el.children.length === 0) return t;
    }
    return 'Medium';
  }

  function getLanguage() {
    const sel = [
      'button[id*="headlessui"] span',
      '[data-mode-id]',
      'div[class*="ant-select-selection-item"]',
    ];
    for (const s of sel) {
      const el = document.querySelector(s);
      const lang = el?.textContent?.trim() || el?.getAttribute('data-mode-id');
      if (lang && lang.length < 25 && lang.length > 1) return lang;
    }
    return 'Python3';
  }

  function getCode() {
    // 1. Monaco editor API
    try {
      if (window.monaco?.editor) {
        const models = window.monaco.editor.getModels();
        if (models.length) {
          const c = models[0].getValue();
          if (c?.length > 5) return c;
        }
      }
    } catch (e) {}

    // 2. CodeMirror
    try {
      const cm = document.querySelector('.CodeMirror')?.CodeMirror;
      if (cm) return cm.getValue();
    } catch (e) {}

    // 3. Monaco DOM lines
    try {
      const lines = [...document.querySelectorAll('.view-lines .view-line')];
      if (lines.length) return lines.map(l => l.innerText).join('\n');
    } catch (e) {}

    return null;
  }

})();
