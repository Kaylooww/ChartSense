// The labeling page served by review.mts. Model text (notes, errors) is always HTML-escaped.
export const PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>ChartSense label review</title>
<style>
body{margin:0;font:14px system-ui,sans-serif;background:#111827;color:#e5e7eb;display:flex;flex-direction:column;height:100vh}
header{display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:8px 12px;border-bottom:1px solid #374151}
header input{background:#1f2937;color:inherit;border:1px solid #4b5563;border-radius:4px;padding:4px 6px}
.wrap{flex:1;display:flex;min-height:0}
#list{width:250px;overflow:auto;border-right:1px solid #374151;padding:8px}
#list select{width:100%;margin-bottom:6px;background:#1f2937;color:inherit;border:1px solid #4b5563;padding:4px}
#items button{display:block;width:100%;text-align:left;background:none;border:0;color:inherit;padding:3px 6px;font:12px monospace;cursor:pointer}
#items button.on{background:#1f2937}
.s-unlabeled::before{content:"\\00b7  ";color:#9ca3af}.s-draft::before{content:"AI ";color:#60a5fa}.s-approved::before{content:"\\2713  ";color:#34d399}
.s-rejected::before{content:"\\2717  ";color:#f87171}.s-failed::before{content:"!  ";color:#fbbf24}
main{flex:1;overflow:auto;padding:12px 16px}.imgs{display:flex;gap:8px;align-items:flex-start}
.imgs img{border:1px solid #374151;max-height:340px;max-width:100%}.imgs a:first-child{max-width:70%}
.panel{border:1px solid #374151;border-radius:6px;padding:6px 10px;margin:8px 0;background:#0f172a}
.warn{color:#fbbf24}.err{color:#f87171}
fieldset{border:1px solid #374151;margin:8px 0;padding:6px 10px}legend{font-weight:600}
label{display:block;margin:2px 0}small{color:#9ca3af}.bar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-top:8px}
button.act{background:#1f2937;color:#e5e7eb;border:1px solid #4b5563;border-radius:6px;padding:6px 10px;cursor:pointer}
button.act:disabled{opacity:.5;cursor:default}button.ok{border-color:#34d399}button.no{border-color:#f87171}
#msg{color:#fbbf24}
</style></head><body>
<header>
<label style="display:inline">Model <input id="model" size="22"></label>
<label style="display:inline">Retries <input id="retries" type="number" min="0" max="5" value="2" style="width:3em"></label>
<button class="act" id="auto" type="button">Auto-Label All</button><button class="act" id="cancel" type="button" disabled>Cancel</button>
<span id="prog"><small>Drafts unlabeled and failed crops with the local model. A draft is never a label until you approve it.</small></span>
<span style="flex:1"></span><button class="act" id="export" type="button">Export Verified Dataset</button><span id="exp"></span>
</header>
<div class="wrap">
<nav id="list"><select id="filter" aria-label="Filter by review status"></select><div id="items"></div></nav>
<main>
<h2 id="title"></h2><p><small id="origin"></small></p>
<p><small>Label only what is visible in this crop. Pick "unclear" / "none" / no setup when unsure. Never infer prices, indicators or what happens next.
The right image is the newest 30% strip: judge latestMove there. Click an image to open it full size.</small></p>
<div class="imgs"><a id="chartA" target="_blank"><img id="chart" alt="whole crop"></a><a id="recentA" target="_blank"><img id="recent" alt="newest-candles strip"></a></div>
<div id="info"></div>
<form id="f"></form>
<div class="bar"><button class="act ok" id="approve" type="button">Approve &amp; next</button>
<button class="act no" id="reject" type="button">Reject / needs correction</button>
<button class="act" id="clear" type="button">Clear review</button><button class="act" id="copy" type="button">Copy previous labels</button><span id="msg"></span></div>
</main></div>
<script>
const STATUS = { all: 'All', unlabeled: 'Unlabeled', draft: 'AI-labeled, awaiting review', approved: 'Approved', rejected: 'Rejected / needs correction', failed: 'Failed analysis' };
let S, i = 0, prev = null, timer = null;
const $ = (id) => document.getElementById(id);
const esc = (t) => String(t).replace(/[&<>"']/g, (c) => '&#' + c.charCodeAt(0) + ';');
const radios = (name, opts) => '<fieldset><legend>' + name + '</legend>' + opts.map((o) => { const [v, d] = Array.isArray(o) ? o : [o, '']; return '<label><input type="radio" name="' + name + '" value="' + v + '"> ' + v + (d ? ' <small>' + d + '</small>' : '') + '</label>'; }).join('') + '</fieldset>';
function build() {
  const o = S.options;
  $('f').innerHTML = radios('imageQuality', o.imageQuality) + radios('candlesVisible', [['true', 'candlesticks or price bars visible'], ['false', 'no candles (e.g. line chart)']])
    + radios('visibleTrend', o.visibleTrend) + radios('structure', o.structure) + radios('latestMove', o.latestMove)
    + '<fieldset><legend>completedSetups (only if already completed)</legend>' + o.completedSetups.map(([v, d]) => '<label><input type="checkbox" name="completedSetups" value="' + v + '"> ' + v + ' <small>' + d + '</small></label>').join('') + '</fieldset>';
}
const cur = () => S.examples[i];
function shown() { const f = $('filter').value || 'all'; return S.examples.filter((e) => f === 'all' || e.status === f || e === cur()); }
function list() {
  const n = (k) => k === 'all' ? S.examples.length : S.examples.filter((e) => e.status === k).length, f = $('filter').value || 'all';
  $('filter').innerHTML = Object.entries(STATUS).map(([k, t]) => '<option value="' + k + '"' + (k === f ? ' selected' : '') + '>' + t + ' (' + n(k) + ')</option>').join('');
  $('items').innerHTML = shown().map((e) => '<button class="s-' + e.status + (e === cur() ? ' on' : '') + '" data-id="' + e.id + '">' + e.id + '</button>').join('');
}
function fill(l) {
  $('f').reset();
  if (!l) return;
  for (const k of ['imageQuality', 'visibleTrend', 'structure', 'latestMove']) { const r = $('f').querySelector('input[name=' + k + '][value=' + l[k] + ']'); if (r) r.checked = true; }
  $('f').querySelector('input[name=candlesVisible][value=' + l.candlesVisible + ']').checked = true;
  for (const v of l.completedSetups) $('f').querySelector('input[name=completedSetups][value=' + v + ']').checked = true;
}
function read() {
  const fd = new FormData($('f')), one = (k) => fd.get(k);
  for (const k of ['imageQuality', 'candlesVisible', 'visibleTrend', 'structure', 'latestMove']) if (!one(k)) throw new Error('Choose ' + k);
  return { imageQuality: one('imageQuality'), candlesVisible: one('candlesVisible') === 'true', visibleTrend: one('visibleTrend'), structure: one('structure'), latestMove: one('latestMove'), completedSetups: fd.getAll('completedSetups') };
}
function show(n) {
  i = Math.max(0, Math.min(S.examples.length - 1, n));
  const e = cur(), line = e.origin && e.origin.chartStyle === 'line';
  $('title').textContent = e.id + '  [' + STATUS[e.status] + ']' + (e.status === 'approved' || e.status === 'rejected' ? ' by ' + (e.annotator || '?') : '');
  $('origin').textContent = e.origin ? e.origin.instrument + ' · ' + e.origin.chartStyle + ' chart · screenshot ' + e.origin.sourceId + ' · group ' + e.group + ' (all crops of a group stay in one split)' : 'group ' + e.group;
  for (const k of ['chart', 'recent']) { $(k).src = $(k + 'A').href = '/img/' + e.id + '/' + k + '.png'; }
  let info = '';
  if (e.draft) {
    const d = e.draft;
    info += '<div class="panel"><b>AI draft (unverified)</b> <small>' + esc(d.model) + ' · ' + esc(d.createdAt) + '</small><br>timeframe label: ' + esc(d.visibleTimeframeLabel ?? 'none legible')
      + (d.notes.length ? '<br>notes: ' + d.notes.map(esc).join(' | ') : '') + d.warnings.map((w) => '<br><span class="warn">' + esc(w) + '</span>').join('')
      + (e.status === 'approved' && JSON.stringify(d.labels) !== JSON.stringify(e.labels) ? '<br><small>Approved labels differ from the draft.</small>' : '') + '</div>';
  }
  if (e.autoLabelError) info += '<div class="panel err">Auto-label failed after ' + e.autoLabelError.attempts + ' attempt(s) with ' + esc(e.autoLabelError.model) + ': ' + esc(e.autoLabelError.message) + '</div>';
  if (e.reviewNote) info += '<div class="panel">Review note: ' + esc(e.reviewNote) + '</div>';
  $('info').innerHTML = info;
  fill(e.labels || (e.draft && e.draft.labels));
  $('f').querySelector('input[name=candlesVisible][value=true]').disabled = !!line;
  $('msg').textContent = e.status === 'draft' ? 'Pre-filled from the AI draft: check every field before approving.' : '';
  list();
}
async function api(path, body) {
  const r = await fetch(path, { method: 'POST', body: JSON.stringify(body || {}) });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error);
  return j;
}
async function act(kind, body) { S.examples[i] = await api('/api/' + kind + '/' + cur().id, body); }
const nextOpen = () => { const k = S.examples.findIndex((e, k) => k > i && (e.status === 'draft' || e.status === 'unlabeled')); return k >= 0 ? k : i + 1; };
$('approve').onclick = async () => { try { const l = read(); await act('approve', { labels: l }); prev = l; show(nextOpen()); } catch (err) { $('msg').textContent = err.message; } };
$('reject').onclick = async () => { const note = prompt('What is wrong or needs correcting? (optional)'); if (note === null) return; try { await act('reject', { note }); show(nextOpen()); } catch (err) { $('msg').textContent = err.message; } };
$('clear').onclick = async () => { try { await act('clear'); show(i); } catch (err) { $('msg').textContent = err.message; } };
$('copy').onclick = () => { if (prev) { fill(prev); $('msg').textContent = 'Copied: check every field against THIS crop before approving.'; } else $('msg').textContent = 'Nothing approved yet in this session.'; };
$('items').onclick = (ev) => { const id = ev.target.dataset && ev.target.dataset.id; if (id) show(S.examples.findIndex((e) => e.id === id)); };
$('filter').onchange = list;
$('auto').onclick = async () => { try { await api('/api/autolabel/start', { model: $('model').value.trim(), retries: Number($('retries').value) }); poll(); } catch (err) { $('prog').textContent = err.message; } };
$('cancel').onclick = () => api('/api/autolabel/cancel').catch(() => {});
$('export').onclick = async () => { try { const m = await api('/api/export'); $('exp').textContent = m.count + ' approved exported (train ' + m.splits.train + ' / val ' + m.splits.validation + ' / test ' + m.splits.test + ') to ' + m.dir; } catch (err) { $('exp').textContent = err.message; } };
async function poll() {
  const j = await (await fetch('/api/autolabel')).json();
  if (!j) return;
  $('auto').disabled = j.running; $('cancel').disabled = !j.running;
  $('prog').textContent = (j.running ? 'Running ' : 'Last run ') + j.model + ': ' + j.done + '/' + j.total + ' · drafted ' + j.drafted + ' · failed ' + j.failed
    + (j.current ? ' · now ' + j.current : '') + (j.stopped ? ' · stopped: ' + j.stopped : '') + (j.lastError ? ' · last error ' + j.lastError : '');
  // Refresh statuses without moving the reviewer or overwriting a form being edited.
  const s = await (await fetch('/api/state')).json(), id = cur() && cur().id, wasDraft = cur() && cur().draft;
  S.examples = s.examples; i = Math.max(0, S.examples.findIndex((e) => e.id === id));
  if (!wasDraft && cur() && cur().draft) show(i); else list();
  if (j.running) { clearTimeout(timer); timer = setTimeout(poll, 1500); }
}
fetch('/api/state').then((r) => r.json()).then((s) => { S = s; $('model').value = s.defaultModel; build(); if (!S.examples.length) { $('title').textContent = 'No real examples. Run npm run training:import-crops or training:import first.'; return; } const first = S.examples.findIndex((e) => e.status === 'draft' || e.status === 'unlabeled'); show(first >= 0 ? first : 0); poll(); });
</script></body></html>`;
