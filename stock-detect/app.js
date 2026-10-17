function dataBadge(r) {
  if (isUnchanged(r)) {
    return '<span class="tag unchanged">no new data</span>';
  }
  if (typeof r.api_posts_new === 'number' && r.api_posts_new > 0) {
    return `<span class="tag new-data">+${r.api_posts_new} new</span>`;
  }
  return '';
}

function isUnchanged(r) {
  return r.data_unchanged === true || r.api_posts_new === 0;
}

function apiMeta(r) {
  if (typeof r.api_posts_new !== 'number') return '';
  if (r.api_posts_new === 0) {
    return ' · cache only · 0 API posts';
  }
  return ` · +${r.api_posts_new} API posts`;
}

function runStatusLine(r) {
  if (isUnchanged(r)) {
    return '<div class="run-status unchanged">✓ cache only · 0 new posts from X API</div>';
  }
  if (typeof r.api_posts_new === 'number' && r.api_posts_new > 0) {
    return `<div class="run-status new">✓ ${r.api_posts_new} new post(s) from X API</div>`;
  }
  return '';
}

async function parseApiResponse(r, fallbackMsg) {
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = data.message || data.error || fallbackMsg;
    throw new Error(msg);
  }
  return data;
}

function loadingHtml() {
  return '<div class="loading"><div class="loading-spinner"></div><span>加载报告中…</span></div>';
}

function errorHtml(message) {
  return `<div class="err"><div class="err-title">无法加载报告</div>${message}</div>`;
}

function apiBaseUrl(cfg) {
  if (cfg.apiBase) return cfg.apiBase.replace(/\/$/, '');
  const h = window.location.hostname;
  if (h === 'localhost' || h === '127.0.0.1' || h === '') {
    return 'http://localhost:64480/api/stock-detect';
  }
  return 'https://quadraticequation.top/api/stock-detect';
}

async function fetchManifestAndReport(cfg, qs, bust) {
  const base = apiBaseUrl(cfg);
  const manifest = await parseApiResponse(
    await fetch(`${base}/manifest?${qs}&${bust}`, { cache: 'no-store' }),
    'manifest API failed'
  );
  const report = await parseApiResponse(
    await fetch(`${base}/report?${qs}&${bust}`, { cache: 'no-store' }),
    'report API failed'
  );
  return { manifest, report };
}

function reportQuery(filters, cfg) {
  const q = new URLSearchParams();
  const accounts = filters.account || (cfg.defaultAccount || 'aleabitoreddit');
  q.set('accounts', accounts);
  if (cfg.windowDays) q.set('window_days', String(cfg.windowDays));
  if (filters.source) q.set('source', filters.source);
  return q.toString();
}

function srcTag(s) {
  const labels = { x: 'X', wsb: 'WSB', both: 'X+WSB' };
  return `<span class="tag src">${labels[s] || s}</span>`;
}

function fmtUtc(iso) {
  return new Date(iso).toLocaleString('en-GB', { timeZone: 'UTC' }) + ' UTC';
}

function tag(c) {
  const cls = c === 'buy' ? 'buy' : c === 'sell' ? 'sell' : 'neutral';
  return `<span class="tag ${cls}">${c}</span>`;
}

function renderReportBody(d) {
  const accounts = (d.accounts || []).map(a => '@' + a.replace(/^@/, '')).join(', ') || '—';
  const apiNew = typeof d.api_posts_new === 'number' ? d.api_posts_new : null;
  const pages = typeof d.pages_fetched === 'number' ? d.pages_fetched : null;
  const cachePosts = typeof d.cache_posts === 'number' ? d.cache_posts : null;
  const unchanged = isUnchanged(d);
  const statusBanner = unchanged
    ? `<div class="status-banner ok">Live from MySQL cache · no new X API posts in last fetch</div>`
    : (apiNew !== null && apiNew > 0
      ? `<div class="status-banner new">Live from MySQL · ${apiNew} new post(s) from X API</div>`
      : '');
  const ciLink = d.ci_run_url
    ? `<p class="sub"><a href="${d.ci_run_url}" target="_blank" rel="noopener">View CI run →</a></p>`
    : '';
  const stats = `
    ${statusBanner}
    <div class="grid">
      <div class="stat"><div class="label">Generated (UTC)</div><div class="value" style="font-size:.95rem">${fmtUtc(d.generated_at)}</div></div>
      <div class="stat"><div class="label">Source</div><div class="value">${srcTag(d.source)}</div></div>
      <div class="stat"><div class="label">Posts</div><div class="value">${d.fetched_posts}</div></div>
      <div class="stat"><div class="label">Signals</div><div class="value">${d.signal_count}</div></div>
      <div class="stat"><div class="label">Consensus</div><div class="value">${d.consensus_count}</div></div>
      ${apiNew !== null ? `<div class="stat"><div class="label">API new</div><div class="value">${apiNew}</div></div>` : ''}
      ${pages !== null ? `<div class="stat"><div class="label">API pages</div><div class="value">${pages}</div></div>` : ''}
      ${cachePosts !== null ? `<div class="stat"><div class="label">Cache</div><div class="value">${cachePosts}</div></div>` : ''}
    </div>
    <p class="sub">Accounts: ${accounts} · Run ID: <code>${d.id || '—'}</code></p>${ciLink}`;
  let rows = '';
  for (const t of d.top_tickers || []) {
    rows += `<tr><td><strong>${t.ticker}</strong></td><td>${t.mentions}</td><td>${t.buy}</td><td>${t.x}</td><td>${t.wsb}</td><td>${t.authors || '—'}</td><td>${tag(t.consensus)}</td></tr>`;
  }
  return stats + `
    <section><h2>Top Tickers</h2>
      <table><thead><tr><th>Ticker</th><th>Posts</th><th>Buy</th><th>X</th><th>WSB</th><th>Authors</th><th>Consensus</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="7">No tickers</td></tr>'}</tbody></table>
    </section>`;
}

function unique(values) {
  return [...new Set(values.filter(Boolean))].sort();
}

function filterRuns(runs, source, account) {
  return runs.filter(r => {
    if (source && r.source !== source) return false;
    if (account && !(r.accounts || []).includes(account)) return false;
    return true;
  });
}

function querySuffix(filters) {
  const q = new URLSearchParams();
  if (filters.source) q.set('source', filters.source);
  if (filters.account) q.set('account', filters.account);
  const s = q.toString();
  return s ? '?' + s : '';
}

function buildNavbar(manifest, cfg, filters) {
  const runs = manifest.runs || [];
  const filtered = filterRuns(runs, filters.source, filters.account);
  const sources = unique(runs.map(r => r.source));
  const accounts = unique(runs.flatMap(r => r.accounts || []));

  let runOptions = '';
  for (const r of filtered) {
    const label = `${fmtUtc(r.generated_at)} · ${r.source} · ${(r.accounts || []).map(a => '@' + a).join(',')} · ${r.signal_count} sig${apiMeta(r)}`;
    const sel = r.id === cfg.runId ? ' selected' : '';
    runOptions += `<option value="report.html${querySuffix(filters)}"${sel}>${label}</option>`;
  }

  let sourceOptions = '<option value="">All sources</option>';
  for (const s of sources) {
    const sel = s === filters.source ? ' selected' : '';
    sourceOptions += `<option value="${s}"${sel}>${s === 'x' ? 'X/Twitter' : s === 'wsb' ? 'WSB' : 'X + WSB'}</option>`;
  }

  let accountOptions = '<option value="">All accounts</option>';
  for (const a of accounts) {
    const sel = a === filters.account ? ' selected' : '';
    accountOptions += `<option value="${a}"${sel}>@${a}</option>`;
  }

  return `
    <nav class="topnav">
      <a class="brand" href="${cfg.homeUrl}">Stock Detect</a>
      <div class="nav-group">
        <label for="run-select">Report</label>
        <select id="run-select">${runOptions || '<option>No reports</option>'}</select>
      </div>
      <div class="nav-group">
        <label for="source-filter">Source</label>
        <select id="source-filter">${sourceOptions}</select>
      </div>
      <div class="nav-group">
        <label for="account-filter">Account</label>
        <select id="account-filter">${accountOptions}</select>
      </div>
      <span class="nav-meta">${filtered.length} run(s) · live API</span>
    </nav>`;
}

function isEmbedded() {
  return new URLSearchParams(window.location.search).get('embedded') === '1';
}

function wireNavbar(manifest, cfg) {
  if (isEmbedded()) {
    document.getElementById('navbar').innerHTML = '';
    document.body.classList.add('embedded');
    return;
  }
  const params = new URLSearchParams(window.location.search);
  const filters = {
    source: params.get('source') || '',
    account: params.get('account') || cfg.defaultAccount || ''
  };

  document.getElementById('navbar').innerHTML = buildNavbar(manifest, cfg, filters);

  const runSelect = document.getElementById('run-select');
  const sourceFilter = document.getElementById('source-filter');
  const accountFilter = document.getElementById('account-filter');

  function applyFilters() {
    filters.source = sourceFilter.value;
    filters.account = accountFilter.value;
    const qs = querySuffix(filters);
    window.location.href = cfg.homeUrl + qs;
  }

  if (runSelect) {
    runSelect.onchange = () => {
      const val = runSelect.value;
      if (!val || val === 'No reports') return;
      const qs = querySuffix(filters);
      window.location.href = val + qs;
    };
  }
  sourceFilter.onchange = applyFilters;
  accountFilter.onchange = applyFilters;
}

function renderIndex(manifest, cfg) {
  const params = new URLSearchParams(window.location.search);
  const source = params.get('source') || '';
  const account = params.get('account') || cfg.defaultAccount || '';
  const runs = filterRuns(manifest.runs || [], source, account);

  wireNavbar(manifest, cfg);

  if (!runs.length) {
    document.getElementById('content').innerHTML = '<div class="err">No reports match the current filters.</div>';
    return;
  }

  const qs = querySuffix({ source, account });
  let cards = '';
  for (const r of runs) {
    const latest = r.id === manifest.latest ? ' latest' : '';
    const latestBadge = r.id === manifest.latest ? ' · latest' : '';
    const badge = dataBadge(r);
    cards += `<a class="run-card${latest}${isUnchanged(r) ? ' unchanged' : ''}" href="report.html${qs}">
      <div class="title">${fmtUtc(r.generated_at)} ${srcTag(r.source)}${latestBadge} ${badge}</div>
      ${runStatusLine(r)}
      <div class="meta">@${(r.accounts || []).join(', @')} · ${r.fetched_posts} posts · ${r.signal_count} signals · ${r.consensus_count} consensus${apiMeta(r)}</div>
    </a>`;
  }

  const latestRun = manifest.latest && runs.find(r => r.id === manifest.latest);
  const jump = latestRun ? `<p class="sub"><a href="report.html${qs}">Open latest report →</a></p>` : '';

  document.getElementById('content').innerHTML = jump + `<div class="run-list">${cards}</div>`;
}

async function init() {
  const cfg = window.STOCK_DETECT;
  const params = new URLSearchParams(window.location.search);
  const account = params.get('account') || cfg.defaultAccount || 'aleabitoreddit';
  const qs = reportQuery({ account, source: params.get('source') || '' }, cfg);
  const bust = `t=${Date.now()}`;

  try {
    const { manifest, report } = await fetchManifestAndReport(cfg, qs, bust);

    if (cfg.mode === 'index') {
      renderIndex(manifest, cfg);
      return;
    }

    wireNavbar(manifest, cfg);
    if (report.message && !report.id) {
      throw new Error(report.message);
    }
    cfg.runId = report.id;
    document.getElementById('content').innerHTML = renderReportBody(report);
  } catch (e) {
    if (document.getElementById('navbar') && !isEmbedded()) {
      document.getElementById('navbar').innerHTML = `<nav class="topnav"><a class="brand" href="${cfg.homeUrl}">Stock Detect</a></nav>`;
    }
    document.getElementById('content').innerHTML = errorHtml(e.message);
  }
}

init();
