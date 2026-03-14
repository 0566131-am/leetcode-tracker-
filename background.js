// ── Background Service Worker ─────────────────────────────────────────────────
// Receives accepted solution from content script and pushes to GitHub.

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'PUSH_TO_GITHUB') {
    pushToGitHub(message.payload).then(result => {
      sendResponse(result);
    }).catch(err => {
      console.error('[LC Tracker] Push failed:', err);
      sendResponse({ success: false, error: err.message });
    });
    return true; // keep channel open for async
  }
});

async function pushToGitHub(payload) {
  const { lcConfig } = await chrome.storage.local.get('lcConfig');
  if (!lcConfig?.token) return { success: false, error: 'Not configured' };

  const { token, username, repo } = lcConfig;
  const { title, number, difficulty, language, code, timestamp, titleSlug } = payload;

  // Build file path: e.g. Easy/0001-Two-Sum/solution.py
  const ext = getExtension(language);
  const num  = number ? String(number).padStart(4, '0') : '0000';
  const slug = titleSlug || title.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  const folder = `${difficulty}/${num}-${slug}`;
  const filePath = `${folder}/solution.${ext}`;
  const readmePath = `${folder}/README.md`;

  const headers = {
    Authorization: `token ${token}`,
    Accept: 'application/vnd.github.v3+json',
    'Content-Type': 'application/json'
  };

  const baseUrl = `https://api.github.com/repos/${username}/${repo}/contents`;

  try {
    // Push solution file
    await upsertFile(baseUrl, filePath, code, headers, `Add ${title} solution`);

    // Push README
    const readme = buildReadme(title, number, difficulty, language, slug);
    await upsertFile(baseUrl, readmePath, readme, headers, `Add ${title} README`);

    // Save to local storage
    const { lcPushes } = await chrome.storage.local.get('lcPushes');
    const pushes = lcPushes || [];
    pushes.push({ title, number, difficulty, language, timestamp, titleSlug: slug });
    await chrome.storage.local.set({ lcPushes: pushes });

    console.log(`[LC Tracker] ✅ Pushed: ${title}`);
    return { success: true };
  } catch (e) {
    console.error('[LC Tracker] Error:', e);
    return { success: false, error: e.message };
  }
}

async function upsertFile(baseUrl, path, content, headers, message) {
  const encoded = btoa(unescape(encodeURIComponent(content)));

  // Check if file already exists (to get its SHA for update)
  let sha;
  const check = await fetch(`${baseUrl}/${path}`, { headers });
  if (check.ok) {
    const existing = await check.json();
    sha = existing.sha;
  }

  const body = { message, content: encoded };
  if (sha) body.sha = sha;

  const res = await fetch(`${baseUrl}/${path}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message || 'Failed to push file');
  }
  return res.json();
}

function buildReadme(title, number, difficulty, language, slug) {
  const diffEmoji = { Easy: '🟢', Medium: '🟡', Hard: '🔴' }[difficulty] || '⚪';
  return `# ${number ? `${number}. ` : ''}${title}

${diffEmoji} **Difficulty:** ${difficulty}  
💻 **Language:** ${language}  
🔗 **LeetCode:** https://leetcode.com/problems/${slug}/

## Solution

See \`solution.${getExtension(language)}\`
`;
}

function getExtension(language) {
  const map = {
    'Python':     'py',   'Python3':    'py',
    'C++':        'cpp',  'C':          'c',
    'Java':       'java', 'JavaScript': 'js',
    'TypeScript': 'ts',   'C#':         'cs',
    'Go':         'go',   'Kotlin':     'kt',
    'Swift':      'swift','Rust':       'rs',
    'Scala':      'scala','Ruby':       'rb',
    'PHP':        'php',  'Dart':       'dart',
  };
  return map[language] || 'txt';
}
