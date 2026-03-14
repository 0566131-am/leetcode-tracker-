// ── Helpers ──────────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);

function showView(name) {
  $('setupView').classList.toggle('hidden', name !== 'setup');
  $('mainView').classList.toggle('hidden', name !== 'main');
}

function setError(msg) {
  $('setupError').textContent = msg;
}

function formatDate(ts) {
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ── Load state ────────────────────────────────────────────────────────────────
async function loadState() {
  const { lcConfig, lcPushes } = await chrome.storage.local.get(['lcConfig', 'lcPushes']);

  if (lcConfig?.token && lcConfig?.username && lcConfig?.repo) {
    showView('main');
    $('statusDot').classList.add('connected');
    $('connectedRepo').textContent = `${lcConfig.username}/${lcConfig.repo}`;
    $('viewGithubBtn').href = `https://github.com/${lcConfig.username}/${lcConfig.repo}`;

    const pushes = lcPushes || [];
    updateStats(pushes);
    renderRecent(pushes);
  } else {
    showView('setup');
  }
}

function updateStats(pushes) {
  $('totalPushed').textContent = pushes.length;
  $('easyCount').textContent   = pushes.filter(p => p.difficulty === 'Easy').length;
  $('medCount').textContent    = pushes.filter(p => p.difficulty === 'Medium').length;
  $('hardCount').textContent   = pushes.filter(p => p.difficulty === 'Hard').length;
}

function renderRecent(pushes) {
  const list = $('recentList');
  if (!pushes.length) {
    list.innerHTML = `<div class="empty-state">No solutions pushed yet.<br/>Solve a problem on LeetCode!</div>`;
    return;
  }
  const sorted = [...pushes].sort((a, b) => b.timestamp - a.timestamp).slice(0, 10);
  list.innerHTML = sorted.map(p => `
    <div class="recent-item">
      <span class="recent-name" title="${p.title}">${p.title}</span>
      <span class="diff-badge ${p.difficulty}">${p.difficulty}</span>
      <span class="recent-date">${formatDate(p.timestamp)}</span>
      <span class="pushed-badge">✓</span>
    </div>
  `).join('');
}

// ── Save config ───────────────────────────────────────────────────────────────
$('saveBtn').addEventListener('click', async () => {
  const token    = $('tokenInput').value.trim();
  const username = $('usernameInput').value.trim();
  const repo     = $('repoInput').value.trim() || 'leetcode-solutions';

  if (!token)    return setError('Please enter your GitHub token.');
  if (!username) return setError('Please enter your GitHub username.');

  $('saveBtn').disabled = true;
  $('saveBtn').textContent = 'Connecting...';
  setError('');

  try {
    // Verify token works
    const res = await fetch('https://api.github.com/user', {
      headers: { Authorization: `token ${token}`, Accept: 'application/vnd.github.v3+json' }
    });
    if (!res.ok) throw new Error('Invalid token — could not authenticate with GitHub.');

    const user = await res.json();
    if (user.login.toLowerCase() !== username.toLowerCase()) {
      throw new Error(`Token belongs to "${user.login}", not "${username}".`);
    }

    // Create repo if it doesn't exist
    await ensureRepo(token, username, repo);

    await chrome.storage.local.set({ lcConfig: { token, username, repo } });
    await loadState();
  } catch (e) {
    setError(e.message);
  } finally {
    $('saveBtn').disabled = false;
    $('saveBtn').textContent = 'Save & Connect';
  }
});

async function ensureRepo(token, username, repo) {
  const check = await fetch(`https://api.github.com/repos/${username}/${repo}`, {
    headers: { Authorization: `token ${token}`, Accept: 'application/vnd.github.v3+json' }
  });
  if (check.ok) return; // already exists

  const create = await fetch('https://api.github.com/user/repos', {
    method: 'POST',
    headers: {
      Authorization: `token ${token}`,
      Accept: 'application/vnd.github.v3+json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      name: repo,
      description: 'My LeetCode solutions — auto-pushed by LeetCode GitHub Tracker',
      private: false,
      auto_init: true
    })
  });
  if (!create.ok) {
    const err = await create.json();
    throw new Error(err.message || 'Failed to create repository.');
  }
}

// ── Disconnect ────────────────────────────────────────────────────────────────
$('disconnectBtn').addEventListener('click', async () => {
  await chrome.storage.local.remove('lcConfig');
  $('statusDot').classList.remove('connected');
  showView('setup');
});

// ── Toggle password ───────────────────────────────────────────────────────────
$('toggleToken').addEventListener('click', () => {
  const inp = $('tokenInput');
  inp.type = inp.type === 'password' ? 'text' : 'password';
});

// ── Init ──────────────────────────────────────────────────────────────────────
loadState();
