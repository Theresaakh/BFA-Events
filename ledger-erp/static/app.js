'use strict';
/* Ledger ERP – single page client (vanilla JS, no build step). */

// ----------------------------------------------------------------- utils
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = v => (v == null ? '' : String(v)).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const today = () => new Date().toISOString().slice(0, 10);
const yearStart = () => today().slice(0, 4) + '-01-01';
const num = v => { const n = parseFloat(v); return isNaN(n) ? 0 : n; };
const r2 = v => Math.round((num(v) + Number.EPSILON) * 100) / 100;
const S = { settings: {}, accounts: [], journals: [], partners: [], taxes: [], analytic_accounts: [], analytic_plans: [], products: [], apps: [] };
const view = () => $('#view');

function money(v, opts = {}) {
  const n = num(v);
  const s = Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (opts.blankZero && Math.abs(n) < 0.005) return '';
  return (n < -0.004 ? '-' : '') + (S.settings.currency || '') + ' ' + s;
}
function fdate(d) { if (!d) return ''; const [y, m, dd] = d.slice(0, 10).split('-'); return `${dd}/${m}/${y}`; }
function byId(list, id) { return list.find(x => String(x.id) === String(id)); }
function nm(list, id, f = 'name') { const r = byId(list, id); return r ? r[f] : ''; }
function accLabel(id) { const a = byId(S.accounts, id); return a ? `${a.code} ${a.name}` : ''; }

function toast(msg, kind = '') {
  const t = document.createElement('div');
  t.className = 'toast ' + kind; t.textContent = msg;
  $('#toasts').appendChild(t);
  setTimeout(() => t.remove(), kind === 'error' ? 6000 : 3000);
}

async function req(method, url, body) {
  let r;
  try {
    r = await fetch('/api/' + url, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
  } catch (e) {
    const msg = 'The app server is not running. Double-click start-windows.bat (and keep its black window open), then refresh this page.';
    toast(msg, 'error'); throw new Error(msg);
  }
  const data = await r.json().catch(() => ({}));
  if (!r.ok) { const msg = data.error || r.statusText; toast(msg, 'error'); throw new Error(msg); }
  return data;
}
const api = { get: u => req('GET', u), post: (u, b) => req('POST', u, b || {}), put: (u, b) => req('PUT', u, b), del: u => req('DELETE', u) };
const qs = o => Object.entries(o).filter(([, v]) => v !== '' && v != null).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');

async function loadRefs(keys) {
  keys = keys || ['accounts', 'journals', 'partners', 'taxes', 'analytic_accounts', 'analytic_plans', 'products', 'apps'];
  await Promise.all(keys.map(async k => { S[k] = await api.get(k); }));
}
async function loadSettings() { S.settings = await api.get('settings'); $('#company').textContent = S.settings.company_name || ''; }

function opts(list, sel, { label = r => r.name, blank = true, filter } = {}) {
  let rows = filter ? list.filter(filter) : list;
  return (blank ? '<option value=""></option>' : '') + rows.map(r =>
    `<option value="${r.id}" ${String(r.id) === String(sel) ? 'selected' : ''}>${esc(label(r))}</option>`).join('');
}
function sopts(pairs, sel, blank = false) {
  return (blank ? '<option value=""></option>' : '') + pairs.map(([v, l]) => `<option value="${esc(v)}" ${String(v) === String(sel) ? 'selected' : ''}>${esc(l)}</option>`).join('');
}
const accOpts = (sel, filter) => opts(S.accounts, sel, { label: a => `${a.code} ${a.name}`, filter: filter || (a => a.active || String(a.id) === String(sel)) });

function badge(state, label) { return `<span class="badge b-${esc(state)}">${esc(label || state)}</span>`; }
const STATE_L = { draft: 'Draft', posted: 'Posted', cancel: 'Cancelled' };
const PAY_L = { paid: 'Paid', partial: 'Partially Paid', not_paid: 'Not Paid' };
function moveBadges(m) {
  let s = badge(m.state, STATE_L[m.state]);
  if (m.payment_state) s += ' ' + badge(m.payment_state, PAY_L[m.payment_state]);
  if (m.overdue) s += ' ' + badge('overdue', 'Overdue');
  return s;
}

function modal(title, body, buttons) {
  const root = $('#modal-root');
  root.innerHTML = `<div class="modal-bg"><div class="modal"><div class="modal-h"><span>${esc(title)}</span><button class="modal-x">×</button></div>
    <div class="modal-b">${body}</div><div class="modal-f"></div></div></div>`;
  const close = () => { root.innerHTML = ''; };
  $('.modal-x', root).onclick = close;
  $('.modal-bg', root).addEventListener('mousedown', e => { if (e.target.classList.contains('modal-bg')) close(); });
  const f = $('.modal-f', root);
  (buttons || []).forEach(b => {
    const el = document.createElement('button');
    el.className = 'btn ' + (b.cls || ''); el.textContent = b.label;
    el.onclick = async () => { try { el.disabled = true; if ((await b.click($('.modal', root))) !== false) close(); } catch (e) { console.error(e); } finally { el.disabled = false; } };
    f.appendChild(el);
  });
  const c = document.createElement('button'); c.className = 'btn'; c.textContent = 'Discard'; c.onclick = close; f.appendChild(c);
  const first = $('input,select,textarea', $('.modal-b', root)); if (first) first.focus();
  return $('.modal', root);
}
function confirmBox(msg) { return new Promise(res => { modal('Confirmation', `<p>${esc(msg)}</p>`, [{ label: 'Ok', cls: 'btn-primary', click: () => res(true) }]); }); }

function downloadCSV(name, rows) {
  const csv = rows.map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = name + '.csv'; a.click();
}
function tableToCSV(name, table) {
  downloadCSV(name, $$('tr', table).map(tr => $$('th,td', tr).map(td => td.innerText.trim())));
}

// ----------------------------------------------------------------- navigation
const ACC_MENU = [
  { label: 'Dashboard', href: '#/accounting/dashboard' },
  { label: 'Customers', items: [['Invoices', '#/accounting/moves/invoices'], ['Credit Notes', '#/accounting/moves/credit_notes'], ['Payments', '#/accounting/payments/customer'], ['Products', '#/accounting/config/products'], ['Customers', '#/contacts?filter=customer']] },
  { label: 'Vendors', items: [['Bills', '#/accounting/moves/bills'], ['Refunds', '#/accounting/moves/refunds'], ['Payments', '#/accounting/payments/supplier'], ['Products', '#/accounting/config/products'], ['Vendors', '#/contacts?filter=vendor']] },
  { label: 'Accounting', items: [['Journal Entries', '#/accounting/moves/entries'], ['Journal Items', '#/accounting/items'], '-Analytic', ['Analytic Accounts', '#/accounting/config/analytic_accounts']] },
  { label: 'Reporting', items: ['-Statements', ['Profit and Loss', '#/accounting/report/profit_loss'], ['Balance Sheet', '#/accounting/report/balance_sheet'], ['Trial Balance', '#/accounting/report/trial_balance'], ['General Ledger', '#/accounting/report/general_ledger'], '-Partners', ['Aged Receivable', '#/accounting/report/aged_receivable'], ['Aged Payable', '#/accounting/report/aged_payable'], ['Partner Ledger', '#/accounting/report/partner_ledger'], '-Management', ['Analytic Report', '#/accounting/report/analytic'], ['Tax Report', '#/accounting/report/tax']] },
  { label: 'Configuration', items: [['Settings', '#/settings'], '-Accounting', ['Chart of Accounts', '#/accounting/config/accounts'], ['Journals', '#/accounting/config/journals'], ['Taxes', '#/accounting/config/taxes'], '-Analytic', ['Analytic Plans', '#/accounting/config/analytic_plans'], ['Analytic Accounts', '#/accounting/config/analytic_accounts'], '-Catalog', ['Products', '#/accounting/config/products']] },
];

function setNav(title, menu) {
  $('#app-title').textContent = title || '';
  const h = location.hash;
  $('#menu').innerHTML = (menu || []).map(m => {
    if (m.href) return `<div class="mi ${h.startsWith(m.href) ? 'active' : ''}"><a href="${m.href}">${esc(m.label)}</a></div>`;
    const active = m.items.some(i => Array.isArray(i) && h.startsWith(i[1].split('?')[0]) && i[1] !== '#/settings');
    return `<div class="mi ${active ? 'active' : ''}"><span>${esc(m.label)}</span><div class="dd">${m.items.map(i => typeof i === 'string' ? `<div class="sep">${esc(i.slice(1))}</div>` : `<a href="${i[1]}">${esc(i[0])}</a>`).join('')}</div></div>`;
  }).join('');
  $$('#menu .dd a').forEach(a => a.addEventListener('click', () => a.closest('.dd').style.display = 'none'));
  $$('#menu .mi').forEach(mi => mi.addEventListener('mouseleave', () => { const d = $('.dd', mi); if (d) d.style.display = ''; }));
}
const accNav = () => setNav('Accounting', ACC_MENU);
function cp(crumbs, tools = '') {
  const bc = crumbs.map((c, i) => i < crumbs.length - 1 && c[1] ? `<a href="${c[1]}">${esc(c[0])}</a><span class="sep">/</span>` : `<span>${esc(c[0])}</span>`).join('');
  return `<div class="cp"><div class="bc">${bc}</div><div class="tools">${tools}</div></div>`;
}
const go = h => { location.hash = h; };

const ROUTES = [
  [/^\/?$/, home],
  [/^\/accounting\/?$/, () => go('#/accounting/dashboard')],
  [/^\/accounting\/dashboard$/, dashboard],
  [/^\/accounting\/moves\/(\w+)$/, moveList],
  [/^\/accounting\/move\/(new|\d+)$/, moveForm],
  [/^\/accounting\/payments\/(customer|supplier)$/, paymentList],
  [/^\/accounting\/payment\/(new|\d+)$/, paymentForm],
  [/^\/accounting\/items$/, journalItems],
  [/^\/accounting\/config\/(\w+)$/, modelList],
  [/^\/accounting\/report\/(\w+)$/, report],
  [/^\/contacts$/, contacts],
  [/^\/contacts\/(\d+)$/, contactDetail],
  [/^\/studio$/, studio],
  [/^\/studio\/(\d+)$/, studioApp],
  [/^\/app\/(\d+)$/, customList],
  [/^\/app\/(\d+)\/(new|\d+)$/, customRecord],
  [/^\/settings$/, settingsView],
  [/^\/print\/move\/(\d+)$/, printMove],
];

async function route() {
  const raw = location.hash.replace(/^#/, '') || '/';
  const [path, query] = raw.split('?');
  const q = Object.fromEntries(new URLSearchParams(query || ''));
  $('#modal-root').innerHTML = '';
  for (const [re, fn] of ROUTES) {
    const m = path.match(re);
    if (m) {
      try { await fn(...m.slice(1), q); } catch (e) { console.error(e); view().innerHTML = `<div class="content"><div class="alert alert-warn">${esc(e.message)}</div></div>`; }
      window.scrollTo(0, 0);
      return;
    }
  }
  view().innerHTML = '<div class="empty"><div class="big">🤷</div>Page not found. <a href="#/">Home</a></div>';
}

// ----------------------------------------------------------------- home
function home() {
  setNav('', []);
  const builtins = [
    { name: 'Accounting', icon: '📒', color: '#714B67', href: '#/accounting/dashboard' },
    { name: 'Invoicing', icon: '🧾', color: '#00a09d', href: '#/accounting/moves/invoices' },
    { name: 'Bills', icon: '📥', color: '#e46e78', href: '#/accounting/moves/bills' },
    { name: 'Contacts', icon: '👤', color: '#3c6e9f', href: '#/contacts' },
    { name: 'Reports', icon: '📊', color: '#f4a261', href: '#/accounting/report/profit_loss' },
  ];
  const custom = S.apps.map(a => ({ name: a.name, icon: a.icon || '📦', color: a.color || '#6c757d', href: `#/app/${a.id}` }));
  const tail = [{ name: 'App Builder', icon: '🛠️', color: '#455a64', href: '#/studio' }, { name: 'Settings', icon: '⚙️', color: '#607d8b', href: '#/settings' }];
  const tile = a => `<a class="app-tile" href="${a.href}"><div class="app-icon" style="background:${esc(a.color)}">${esc(a.icon)}</div><div>${esc(a.name)}</div></a>`;
  view().innerHTML = `<div class="home"><h1>${esc(S.settings.company_name || 'Ledger ERP')}</h1><div class="home-grid">
    ${[...builtins, ...custom, ...tail].map(tile).join('')}
    <a class="app-tile add" href="#/studio?new=1"><div class="app-icon">＋</div><div>New App</div></a></div></div>`;
}

// ----------------------------------------------------------------- dashboard
async function dashboard() {
  accNav();
  const d = await api.get('reports/dashboard');
  const k = d.kpis;
  const kpi = (l, v, href) => `<a class="kpi" href="${href}" style="color:inherit;text-decoration:none"><div class="l">${l}</div><div class="v">${money(v)}</div></a>`;
  const card = j => {
    let body = '', btns = '';
    if (j.type === 'sale' || j.type === 'purchase') {
      const kind = j.type === 'sale' ? 'invoices' : 'bills', t = j.type === 'sale' ? 'out_invoice' : 'in_invoice';
      btns = `<a class="btn btn-primary" href="#/accounting/move/new?type=${t}&journal_id=${j.id}">New ${j.type === 'sale' ? 'Invoice' : 'Bill'}</a>`;
      body = `<div class="stat"><a href="#/accounting/moves/${kind}?state=draft">${j.draft} to validate</a></div>
        <div class="stat"><a href="#/accounting/moves/${kind}?payment_state=open">${j.unpaid_count} unpaid</a><b>${money(j.unpaid_amount)}</b></div>
        <div class="stat"><span class="${j.overdue_count ? 'neg' : ''}" style="color:${j.overdue_count ? 'var(--danger)' : ''}">${j.overdue_count} late</span><b>${money(j.overdue_amount)}</b></div>`;
    } else if (j.type === 'bank' || j.type === 'cash') {
      btns = `<a class="btn btn-primary" href="#/accounting/payment/new?partner_type=customer&journal_id=${j.id}">Receive</a> <a class="btn" href="#/accounting/payment/new?partner_type=supplier&payment_type=outbound&journal_id=${j.id}">Send</a>`;
      body = `<div class="stat"><span>Balance in GL</span><b>${money(j.balance)}</b></div><div class="stat"><span>${j.payments} payments</span><a href="#/accounting/report/general_ledger?account_id=${j.default_account_id}">View ledger</a></div>`;
    } else {
      btns = `<a class="btn btn-primary" href="#/accounting/move/new?type=entry&journal_id=${j.id}">New Entry</a>`;
      body = `<div class="stat"><span>${j.entries} posted entries</span></div><div class="stat"><a href="#/accounting/moves/entries?state=draft">${j.draft} drafts</a></div>`;
    }
    return `<div class="card" style="border-top-color:${esc(j.color || '#714B67')}"><h3>${esc(j.name)}</h3><div class="muted small">${esc(j.code)} · ${esc(j.type)}</div>${body}<div class="row">${btns}</div></div>`;
  };
  view().innerHTML = cp([['Accounting Dashboard']]) + `<div class="content">
    <div class="kpis">${kpi('Cash & Bank', k.cash, '#/accounting/report/balance_sheet')}${kpi('Receivable', k.receivable, '#/accounting/report/aged_receivable')}${kpi('Payable', k.payable, '#/accounting/report/aged_payable')}${kpi('Income this month', k.income_month, '#/accounting/report/profit_loss')}${kpi('Expenses this month', k.expense_month, '#/accounting/report/profit_loss')}${kpi('Profit this year', k.profit_year, '#/accounting/report/profit_loss')}</div>
    <div class="chart-box"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><b>Income vs Expenses – last 12 months</b>
      <div class="legend"><span><i style="background:#714B67"></i>Income</span><span><i style="background:#e9a3b0"></i>Expenses</span></div></div>${barChart(d.months)}</div>
    <div class="cards">${d.journals.map(card).join('')}</div></div>`;
}

function barChart(months) {
  const W = 1000, H = 220, P = 30, max = Math.max(1, ...months.flatMap(m => [m.income, m.expense]));
  const bw = (W - P * 2) / months.length;
  let bars = '';
  months.forEach((m, i) => {
    const x = P + i * bw, hi = (m.income / max) * (H - 50), he = (m.expense / max) * (H - 50);
    bars += `<rect x="${x + bw * .15}" y="${H - 25 - hi}" width="${bw * .33}" height="${Math.max(hi, 0)}" fill="#714B67" rx="2"><title>Income ${money(m.income)}</title></rect>`;
    bars += `<rect x="${x + bw * .52}" y="${H - 25 - he}" width="${bw * .33}" height="${Math.max(he, 0)}" fill="#e9a3b0" rx="2"><title>Expenses ${money(m.expense)}</title></rect>`;
    bars += `<text x="${x + bw / 2}" y="${H - 8}" text-anchor="middle" font-size="11" fill="#6b7280">${m.month.slice(5)}/${m.month.slice(2, 4)}</text>`;
  });
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" preserveAspectRatio="none"><line x1="${P}" x2="${W - P}" y1="${H - 25}" y2="${H - 25}" stroke="#e2e5ea"/>${bars}</svg>`;
}

// ----------------------------------------------------------------- moves list
const KINDS = {
  invoices: { title: 'Customer Invoices', types: 'out_invoice', newType: 'out_invoice', partner: 'Customer' },
  credit_notes: { title: 'Credit Notes', types: 'out_refund', newType: 'out_refund', partner: 'Customer' },
  bills: { title: 'Vendor Bills', types: 'in_invoice', newType: 'in_invoice', partner: 'Vendor' },
  refunds: { title: 'Vendor Refunds', types: 'in_refund', newType: 'in_refund', partner: 'Vendor' },
  entries: { title: 'Journal Entries', types: 'entry', newType: 'entry', partner: 'Partner' },
};
const TYPE_KIND = { out_invoice: 'invoices', out_refund: 'credit_notes', in_invoice: 'bills', in_refund: 'refunds', entry: 'entries' };
const TYPE_L = { out_invoice: 'Customer Invoice', out_refund: 'Credit Note', in_invoice: 'Vendor Bill', in_refund: 'Vendor Refund', entry: 'Journal Entry' };

async function moveList(kind, q) {
  accNav();
  const K = KINDS[kind]; if (!K) throw new Error('Unknown list');
  const isInv = kind !== 'entries';
  const f = { q: q.q || '', state: q.state || '', payment_state: q.payment_state || '', partner_id: q.partner_id || '' };
  view().innerHTML = cp([[K.title]], `
    <input type="search" id="f-q" placeholder="Search number, reference, partner…" value="${esc(f.q)}">
    <select id="f-state" style="width:auto">${sopts([['', 'All statuses'], ['draft', 'Draft'], ['posted', 'Posted'], ['cancel', 'Cancelled']], f.state)}</select>
    ${isInv ? `<select id="f-pay" style="width:auto">${sopts([['', 'Any payment'], ['open', 'Unpaid / partial'], ['not_paid', 'Not paid'], ['partial', 'Partially paid'], ['paid', 'Paid']], f.payment_state)}</select>` : ''}
    <button class="btn" id="csv">Export</button>
    <a class="btn btn-primary" href="#/accounting/move/new?type=${K.newType}">New</a>`) + '<div class="content"><div class="table-wrap" id="tbl"></div></div>';
  const load = async () => {
    const rows = await api.get('moves?' + qs({ move_type: K.types, q: $('#f-q').value, state: $('#f-state').value, payment_state: isInv ? $('#f-pay').value : '', partner_id: f.partner_id }));
    if (!rows.length) { $('#tbl').innerHTML = `<div class="empty"><div class="big">📄</div>No ${esc(K.title.toLowerCase())} yet.<br><br><a class="btn btn-primary" href="#/accounting/move/new?type=${K.newType}">Create one</a></div>`; return; }
    const tot = rows.reduce((a, r) => (a.t += r.amount_total, a.r += r.state === 'posted' ? r.amount_residual : 0, a), { t: 0, r: 0 });
    $('#tbl').innerHTML = `<table class="list"><thead><tr><th>Number</th><th>${K.partner}</th><th>Date</th>${isInv ? '<th>Due Date</th>' : '<th>Journal</th>'}<th>Reference</th>
      ${isInv ? '<th class="num">Untaxed</th><th class="num">Total</th><th class="num">Amount Due</th>' : '<th class="num">Amount</th>'}<th>Status</th></tr></thead><tbody>
      ${rows.map(r => `<tr class="click" data-id="${r.id}"><td><b>${esc(r.name || 'Draft')}</b></td><td>${esc(r.partner_name || '')}</td><td>${fdate(r.date)}</td>
        ${isInv ? `<td style="${r.overdue ? 'color:var(--danger)' : ''}">${fdate(r.invoice_date_due)}</td>` : `<td>${esc(r.journal_code)}</td>`}<td>${esc(r.ref || '')}</td>
        ${isInv ? `<td class="num">${money(r.amount_untaxed)}</td><td class="num">${money(r.amount_total)}</td><td class="num">${r.state === 'posted' ? money(r.amount_residual) : ''}</td>` : `<td class="num">${money(r.amount_total)}</td>`}
        <td>${moveBadges(r)}</td></tr>`).join('')}</tbody>
      <tfoot><tr><td colspan="${isInv ? 6 : 5}">${rows.length} records</td><td class="num">${money(tot.t)}</td>${isInv ? `<td class="num">${money(tot.r)}</td>` : ''}<td></td></tr></tfoot></table>`;
    $$('#tbl tr.click').forEach(tr => tr.onclick = () => go(`#/accounting/move/${tr.dataset.id}`));
  };
  let t; $('#f-q').oninput = () => { clearTimeout(t); t = setTimeout(load, 250); };
  $('#f-state').onchange = load; if (isInv) $('#f-pay').onchange = load;
  $('#csv').onclick = () => $('#tbl table') && tableToCSV(kind, $('#tbl table'));
  await load();
}

// ----------------------------------------------------------------- move form
async function moveForm(id, q) {
  accNav();
  await loadRefs(['partners', 'products', 'analytic_accounts', 'accounts', 'taxes', 'journals']);
  let m;
  if (id === 'new') {
    const t = q.type || 'out_invoice';
    m = { move_type: t, state: 'draft', date: today(), journal_id: q.journal_id || '', partner_id: q.partner_id || '', invoice_lines: [], lines: [] };
    if (!m.journal_id) { const jt = { out_invoice: 'sale', out_refund: 'sale', in_invoice: 'purchase', in_refund: 'purchase' }[t] || 'general'; m.journal_id = (S.journals.find(j => j.type === jt) || S.journals[0] || {}).id; }
    if (t === 'entry') m.lines = [{}, {}];
  } else m = await api.get('moves/' + id);
  renderMove(m);
}

function renderMove(m) {
  const t = m.move_type, isInv = t !== 'entry', out = t.startsWith('out'), K = KINDS[TYPE_KIND[t]];
  const draft = m.state === 'draft', dis = draft ? '' : 'disabled';
  const partnerFilter = p => !isInv || (out ? p.is_customer : p.is_vendor) || String(p.id) === String(m.partner_id);
  const jFilter = j => isInv ? j.type === (out ? 'sale' : 'purchase') : true;
  const M = { lines: (isInv ? m.invoice_lines : m.lines).map(l => ({ ...l })) };

  let actions = '';
  if (draft) {
    actions += `<button class="btn btn-primary" data-a="post">Confirm</button><button class="btn" data-a="save">Save</button>`;
    if (m.id) actions += `<button class="btn" data-a="cancel">Cancel</button><button class="btn btn-danger" data-a="delete">Delete</button>`;
  } else if (m.state === 'posted') {
    if (isInv && m.amount_residual > 0.005) actions += `<button class="btn btn-primary" data-a="pay">Register Payment</button>`;
    if (isInv) actions += `<a class="btn" href="#/print/move/${m.id}">Print</a>`;
    if (!m.payment_id) actions += `<button class="btn" data-a="reverse">${isInv ? (t.endsWith('refund') ? 'Reverse' : (out ? 'Credit Note' : 'Refund')) : 'Reverse Entry'}</button><button class="btn" data-a="draft">Reset to Draft</button>`;
    else actions += `<a class="btn" href="#/accounting/payment/${m.payment_id}">Open Payment</a>`;
  } else actions += `<button class="btn" data-a="draft">Reset to Draft</button><button class="btn btn-danger" data-a="delete">Delete</button>`;

  const stages = ['draft', 'posted'].concat(m.state === 'cancel' ? ['cancel'] : []).map(s => `<span class="stage ${m.state === s ? 'on' : ''}">${STATE_L[s]}</span>`).join('');
  const ribbon = m.payment_state === 'paid' ? '<div class="ribbon">PAID</div>' : m.payment_state === 'partial' ? '<div class="ribbon" style="background:var(--warning)">PARTIAL</div>' : '';

  view().innerHTML = cp([[K.title, `#/accounting/moves/${TYPE_KIND[t]}`], [m.name || 'New']]) +
    `<div class="statusbar"><div class="actions">${actions}</div><div class="stages">${stages}</div></div>
    <div class="sheet rel">${ribbon}
      <div class="doc-type">${TYPE_L[t]}</div>
      <h1 class="doc">${esc(m.name || 'Draft')}</h1>
      ${m.reversed_entry_id ? `<div class="alert alert-info">Reversal of <a href="#/accounting/move/${m.reversed_entry_id}">${esc(m.reversed_entry_name || '')}</a></div>` : ''}
      ${(m.reversals || []).length ? `<div class="alert alert-info">Reversed by ${m.reversals.map(r => `<a href="#/accounting/move/${r.id}">${esc(r.name || 'Draft')}</a>`).join(', ')}</div>` : ''}
      <div class="fgrid">
        <div class="frow"><label>${K.partner}</label><select id="m-partner" ${dis}>${opts(S.partners, m.partner_id, { filter: partnerFilter })}</select></div>
        <div class="frow"><label>${isInv ? (out ? 'Invoice Date' : 'Bill Date') : 'Date'}</label><input type="date" id="m-date" value="${esc(m.date)}" ${dis}></div>
        <div class="frow"><label>Reference</label><input id="m-ref" value="${esc(m.ref || '')}" ${dis} placeholder="${isInv && !out ? 'Vendor bill number' : ''}"></div>
        ${isInv ? `<div class="frow"><label>Due Date</label><input type="date" id="m-due" value="${esc(m.invoice_date_due || '')}" ${dis}></div>` : ''}
        <div class="frow"><label>Journal</label><select id="m-journal" ${dis}>${opts(S.journals, m.journal_id, { blank: false, label: j => `${j.name} (${j.code})`, filter: jFilter })}</select></div>
      </div>
      <div class="tabs"><div class="tab on" data-tab="lines">${isInv ? 'Invoice Lines' : 'Journal Items'}</div>${isInv && m.state === 'posted' ? '<div class="tab" data-tab="items">Journal Items</div>' : ''}<div class="tab" data-tab="notes">Notes</div></div>
      <div class="tabpane on" data-pane="lines"><div style="overflow-x:auto"><table class="list lines" id="lines"></table></div>
        ${draft ? '<div class="add-line"><button class="btn-link btn" id="add-line">+ Add a line</button></div>' : ''}<div id="totals"></div></div>
      ${isInv && m.state === 'posted' ? `<div class="tabpane" data-pane="items">${itemsTable(m.lines)}</div>` : ''}
      <div class="tabpane" data-pane="notes"><textarea id="m-notes" ${dis} placeholder="Terms and conditions, internal notes…">${esc(m.narration || '')}</textarea></div>
    </div>`;

  $$('.tab').forEach(tab => tab.onclick = () => { $$('.tab').forEach(x => x.classList.toggle('on', x === tab)); $$('.tabpane').forEach(p => p.classList.toggle('on', p.dataset.pane === tab.dataset.tab)); });

  const taxUse = out ? 'sale' : 'purchase';
  const anOpts = sel => opts(S.analytic_accounts, sel, { label: a => (a.code ? `[${a.code}] ` : '') + a.name, filter: a => a.active || String(a.id) === String(sel) });

  function renderLines() {
    const tbl = $('#lines');
    if (isInv) {
      tbl.innerHTML = `<thead><tr><th style="min-width:150px">Product</th><th style="min-width:180px">Label</th><th style="min-width:170px">Account</th><th style="min-width:150px">Analytic</th>
        <th class="num" style="width:80px">Qty</th><th class="num" style="width:110px">Price</th><th class="num" style="width:70px">Disc.%</th><th style="width:120px">Tax</th><th class="num">Subtotal</th>${draft ? '<th></th>' : ''}</tr></thead><tbody>
        ${M.lines.map((l, i) => `<tr data-i="${i}">
          <td><select data-f="product_id" ${dis}>${opts(S.products, l.product_id, { filter: p => p.active || String(p.id) === String(l.product_id) })}</select></td>
          <td><input data-f="name" value="${esc(l.name || '')}" ${dis}></td>
          <td><select data-f="account_id" ${dis}>${accOpts(l.account_id)}</select></td>
          <td><select data-f="analytic_account_id" ${dis}>${anOpts(l.analytic_account_id)}</select></td>
          <td><input data-f="quantity" type="number" step="any" class="num" value="${esc(l.quantity ?? 1)}" ${dis}></td>
          <td><input data-f="price_unit" type="number" step="any" class="num" value="${esc(l.price_unit ?? 0)}" ${dis}></td>
          <td><input data-f="discount" type="number" step="any" class="num" value="${esc(l.discount || 0)}" ${dis}></td>
          <td><select data-f="tax_id" ${dis}>${opts(S.taxes, l.tax_id, { label: x => x.name, filter: x => x.type_tax_use === taxUse && (x.active || String(x.id) === String(l.tax_id)) })}</select></td>
          <td class="num sub">${money(lineSub(l))}</td>${draft ? '<td><button class="del" title="Remove">🗑</button></td>' : ''}</tr>`).join('')}</tbody>`;
    } else {
      tbl.innerHTML = `<thead><tr><th style="min-width:200px">Account</th><th style="min-width:150px">Partner</th><th style="min-width:180px">Label</th><th style="min-width:150px">Analytic</th><th class="num" style="width:130px">Debit</th><th class="num" style="width:130px">Credit</th>${draft ? '<th></th>' : ''}</tr></thead><tbody>
        ${M.lines.map((l, i) => `<tr data-i="${i}">
          <td><select data-f="account_id" ${dis}>${accOpts(l.account_id)}</select></td>
          <td><select data-f="partner_id" ${dis}>${opts(S.partners, l.partner_id)}</select></td>
          <td><input data-f="name" value="${esc(l.name || '')}" ${dis}></td>
          <td><select data-f="analytic_account_id" ${dis}>${anOpts(l.analytic_account_id)}</select></td>
          <td><input data-f="debit" type="number" step="any" class="num" value="${l.debit ? esc(l.debit) : ''}" ${dis}></td>
          <td><input data-f="credit" type="number" step="any" class="num" value="${l.credit ? esc(l.credit) : ''}" ${dis}></td>
          ${draft ? '<td><button class="del" title="Remove">🗑</button></td>' : ''}</tr>`).join('')}</tbody>`;
    }
    $$('tbody tr', tbl).forEach(tr => {
      const i = +tr.dataset.i;
      $$('[data-f]', tr).forEach(inp => inp.addEventListener(inp.tagName === 'SELECT' ? 'change' : 'input', () => {
        const f = inp.dataset.f; M.lines[i][f] = inp.value;
        if (isInv && f === 'product_id' && inp.value) {
          const p = byId(S.products, inp.value);
          Object.assign(M.lines[i], { name: p.name, price_unit: out ? p.sale_price : p.cost, account_id: (out ? p.income_account_id : p.expense_account_id) || M.lines[i].account_id, tax_id: out ? p.sale_tax_id : p.purchase_tax_id });
          renderLines(); return;
        }
        if (!isInv && (f === 'debit' || f === 'credit') && num(inp.value)) { const o = f === 'debit' ? 'credit' : 'debit'; M.lines[i][o] = ''; $(`[data-f=${o}]`, tr).value = ''; }
        if (isInv) $('.sub', tr).textContent = money(lineSub(M.lines[i]));
        renderTotals();
      }));
      const del = $('.del', tr); if (del) del.onclick = () => { M.lines.splice(i, 1); renderLines(); };
    });
    renderTotals();
  }
  function lineSub(l) { return r2(num(l.quantity) * num(l.price_unit) * (1 - num(l.discount) / 100)); }
  function renderTotals() {
    if (isInv) {
      let u = 0, tx = 0;
      M.lines.forEach(l => { const s = lineSub(l); u += s; const tax = byId(S.taxes, l.tax_id); if (tax) tx += r2(s * tax.rate / 100); });
      u = r2(u); tx = r2(tx);
      let pays = '';
      if (m.state === 'posted') {
        pays = (m.payments || []).map(p => `<tr class="small"><td><a href="#/accounting/payment/${p.payment_id}">Paid on ${fdate(p.date)}</a> <span class="muted">(${esc(p.journal_name)})</span></td><td class="num">${money(-p.amount)}</td></tr>`).join('')
          + `<tr class="grand"><td>Amount Due</td><td class="num">${money(m.amount_residual)}</td></tr>`;
      }
      $('#totals').innerHTML = `<div class="totals"><table><tr><td>Untaxed Amount</td><td class="num">${money(u)}</td></tr><tr><td>Taxes</td><td class="num">${money(tx)}</td></tr>
        <tr class="grand"><td>Total</td><td class="num">${money(u + tx)}</td></tr>${pays}</table></div>`;
    } else {
      const d = r2(M.lines.reduce((a, l) => a + num(l.debit), 0)), c = r2(M.lines.reduce((a, l) => a + num(l.credit), 0));
      $('#totals').innerHTML = `<div class="totals"><table><tr><td>Total Debit</td><td class="num">${money(d)}</td></tr><tr><td>Total Credit</td><td class="num">${money(c)}</td></tr>
        ${Math.abs(d - c) > 0.005 ? `<tr><td colspan="2" style="color:var(--danger)">Unbalanced by ${money(d - c)}</td></tr>` : '<tr><td colspan="2" style="color:var(--success)">✓ Balanced</td></tr>'}</table></div>`;
    }
  }
  renderLines();

  if (draft) {
    $('#add-line').onclick = () => {
      if (isInv) { const j = byId(S.journals, $('#m-journal').value); M.lines.push({ quantity: 1, price_unit: 0, account_id: j && j.default_account_id }); }
      else {
        const d = M.lines.reduce((a, l) => a + num(l.debit) - num(l.credit), 0);
        M.lines.push(d > 0 ? { credit: r2(d), name: (M.lines[0] || {}).name } : d < 0 ? { debit: r2(-d), name: (M.lines[0] || {}).name } : {});
      }
      renderLines();
      const last = $$('#lines tbody tr').pop(); if (last) $('select,input', last).focus();
    };
    $('#m-partner').onchange = () => {
      const p = byId(S.partners, $('#m-partner').value);
      if (isInv && p && $('#m-date').value) { const d = new Date($('#m-date').value); d.setDate(d.getDate() + num(p.payment_term_days ?? 30)); $('#m-due').value = d.toISOString().slice(0, 10); }
    };
  }

  const payload = () => {
    const b = { move_type: t, partner_id: $('#m-partner').value || null, date: $('#m-date').value, ref: $('#m-ref').value, journal_id: $('#m-journal').value, narration: $('#m-notes').value };
    if (isInv) { b.invoice_date_due = $('#m-due').value; b.invoice_lines = M.lines; } else b.lines = M.lines;
    return b;
  };
  const save = async () => { const r = m.id ? await api.put('moves/' + m.id, payload()) : await api.post('moves', payload()); return r; };

  $$('.statusbar [data-a]').forEach(b => b.onclick = async () => {
    const a = b.dataset.a;
    try {
      if (a === 'save') { const r = await save(); toast('Saved', 'ok'); if (!m.id) go(`#/accounting/move/${r.id}`); else renderMove(r); }
      else if (a === 'post') { const r = await save(); const p = await api.post(`moves/${r.id}/post`); toast('Posted', 'ok'); if (!m.id) go(`#/accounting/move/${r.id}`); else renderMove(p); }
      else if (a === 'draft') renderMove(await api.post(`moves/${m.id}/draft`));
      else if (a === 'cancel') { if (await confirmBox('Cancel this entry?')) renderMove(await api.post(`moves/${m.id}/cancel`)); }
      else if (a === 'delete') { if (await confirmBox('Delete this entry permanently?')) { await api.del('moves/' + m.id); go(`#/accounting/moves/${TYPE_KIND[t]}`); } }
      else if (a === 'reverse') { const r = await api.post(`moves/${m.id}/reverse`); toast('Draft reversal created', 'ok'); go(`#/accounting/move/${r.id}`); }
      else if (a === 'pay') registerPaymentDialog(m);
    } catch (e) { /* toast already shown */ }
  });
}

function itemsTable(lines) {
  const d = lines.reduce((a, l) => a + l.debit, 0), c = lines.reduce((a, l) => a + l.credit, 0);
  return `<table class="list"><thead><tr><th>Account</th><th>Partner</th><th>Label</th><th>Analytic</th><th class="num">Debit</th><th class="num">Credit</th></tr></thead><tbody>
    ${lines.map(l => `<tr><td><a href="#/accounting/report/general_ledger?account_id=${l.account_id}">${esc(l.account_code)} ${esc(l.account_name)}</a></td><td>${esc(l.partner_name || '')}</td><td>${esc(l.name || '')}</td><td>${esc(l.analytic_name || '')}</td>
      <td class="num">${money(l.debit, { blankZero: 1 })}</td><td class="num">${money(l.credit, { blankZero: 1 })}</td></tr>`).join('')}</tbody>
    <tfoot><tr><td colspan="4"></td><td class="num">${money(d)}</td><td class="num">${money(c)}</td></tr></tfoot></table>`;
}

function registerPaymentDialog(m) {
  const jl = S.journals.filter(j => j.type === 'bank' || j.type === 'cash');
  const md = modal('Register Payment', `<div class="fgrid">
    <div class="frow"><label>Journal</label><select id="p-j">${opts(jl, (jl[0] || {}).id, { blank: false })}</select></div>
    <div class="frow"><label>Amount</label><input id="p-amt" type="number" step="any" value="${m.amount_residual}"></div>
    <div class="frow"><label>Payment Date</label><input id="p-date" type="date" value="${today()}"></div>
    <div class="frow"><label>Memo</label><input id="p-memo" value="${esc(m.name)}"></div></div>`,
    [{ label: 'Create Payment', cls: 'btn-primary', click: async el => {
      const r = await api.post(`moves/${m.id}/register_payment`, { journal_id: $('#p-j', el).value, amount: $('#p-amt', el).value, date: $('#p-date', el).value, memo: $('#p-memo', el).value });
      toast('Payment registered', 'ok'); renderMove(r);
    } }]);
  return md;
}

// ----------------------------------------------------------------- payments
async function paymentList(ptype, q) {
  accNav();
  const title = ptype === 'customer' ? 'Customer Payments' : 'Vendor Payments';
  view().innerHTML = cp([[title]], `<input type="search" id="f-q" placeholder="Search…"><select id="f-state" style="width:auto">${sopts([['', 'All statuses'], ['draft', 'Draft'], ['posted', 'Posted'], ['cancel', 'Cancelled']], q.state || '')}</select>
    <a class="btn btn-primary" href="#/accounting/payment/new?partner_type=${ptype}${ptype === 'supplier' ? '&payment_type=outbound' : ''}">New</a>`) + '<div class="content"><div class="table-wrap" id="tbl"></div></div>';
  const load = async () => {
    const rows = await api.get('payments?' + qs({ partner_type: ptype, q: $('#f-q').value, state: $('#f-state').value }));
    if (!rows.length) { $('#tbl').innerHTML = '<div class="empty"><div class="big">💳</div>No payments yet.</div>'; return; }
    $('#tbl').innerHTML = `<table class="list"><thead><tr><th>Number</th><th>Date</th><th>Partner</th><th>Journal</th><th>Type</th><th>Memo</th><th class="num">Amount</th><th class="num">Matched</th><th>Status</th></tr></thead><tbody>
      ${rows.map(r => `<tr class="click" data-id="${r.id}"><td><b>${esc(r.name || 'Draft')}</b></td><td>${fdate(r.date)}</td><td>${esc(r.partner_name || '')}</td><td>${esc(r.journal_name)}</td>
        <td>${r.payment_type === 'inbound' ? '⬇ Receive' : '⬆ Send'}</td><td>${esc(r.memo || '')}</td><td class="num">${money(r.amount)}</td><td class="num">${r.state === 'posted' ? money(r.amount_allocated) : ''}</td><td>${badge(r.state, STATE_L[r.state])}</td></tr>`).join('')}</tbody>
      <tfoot><tr><td colspan="6">${rows.length} payments</td><td class="num">${money(rows.filter(r => r.state === 'posted').reduce((a, r) => a + r.amount, 0))}</td><td colspan="2"></td></tr></tfoot></table>`;
    $$('#tbl tr.click').forEach(tr => tr.onclick = () => go(`#/accounting/payment/${tr.dataset.id}`));
  };
  let t; $('#f-q').oninput = () => { clearTimeout(t); t = setTimeout(load, 250); }; $('#f-state').onchange = load;
  await load();
}

async function paymentForm(id, q) {
  accNav();
  await loadRefs(['partners', 'journals']);
  let p;
  if (id === 'new') {
    const jl = S.journals.filter(j => j.type === 'bank' || j.type === 'cash');
    p = { state: 'draft', partner_type: q.partner_type || 'customer', payment_type: q.payment_type || (q.partner_type === 'supplier' ? 'outbound' : 'inbound'), date: today(), journal_id: q.journal_id || (jl[0] || {}).id, amount: 0, partner_id: q.partner_id || '' };
  } else p = await api.get('payments/' + id);
  renderPayment(p);
}

function renderPayment(p) {
  const draft = p.state === 'draft', dis = draft ? '' : 'disabled';
  const title = p.partner_type === 'customer' ? 'Customer Payments' : 'Vendor Payments';
  let actions = draft ? `<button class="btn btn-primary" data-a="post">Confirm</button><button class="btn" data-a="save">Save</button>${p.id ? '<button class="btn btn-danger" data-a="delete">Delete</button>' : ''}`
    : p.state === 'posted' ? `<button class="btn" data-a="draft">Reset to Draft</button><button class="btn" data-a="cancel">Cancel</button>${p.move_id ? `<a class="btn" href="#/accounting/move/${p.move_id}">Journal Entry</a>` : ''}`
      : `<button class="btn" data-a="draft">Reset to Draft</button><button class="btn btn-danger" data-a="delete">Delete</button>`;
  const jl = S.journals.filter(j => j.type === 'bank' || j.type === 'cash');
  view().innerHTML = cp([[title, `#/accounting/payments/${p.partner_type}`], [p.name || 'New']]) +
    `<div class="statusbar"><div class="actions">${actions}</div><div class="stages">${['draft', 'posted'].concat(p.state === 'cancel' ? ['cancel'] : []).map(s => `<span class="stage ${p.state === s ? 'on' : ''}">${STATE_L[s]}</span>`).join('')}</div></div>
    <div class="sheet"><div class="doc-type">Payment</div><h1 class="doc">${esc(p.name || 'Draft')}</h1>
    <div class="fgrid">
      <div class="frow"><label>Payment Type</label><select id="p-type" ${dis}>${sopts([['inbound', 'Receive Money'], ['outbound', 'Send Money']], p.payment_type)}</select></div>
      <div class="frow"><label>Amount</label><input id="p-amount" type="number" step="any" value="${esc(p.amount)}" ${dis}></div>
      <div class="frow"><label>Partner Type</label><select id="p-ptype" ${dis}>${sopts([['customer', 'Customer'], ['supplier', 'Vendor']], p.partner_type)}</select></div>
      <div class="frow"><label>Date</label><input id="p-date" type="date" value="${esc(p.date)}" ${dis}></div>
      <div class="frow"><label>Partner</label><select id="p-partner" ${dis}>${opts(S.partners, p.partner_id)}</select></div>
      <div class="frow"><label>Journal</label><select id="p-journal" ${dis}>${opts(jl, p.journal_id, { blank: false })}</select></div>
      <div class="frow full"><label>Memo</label><input id="p-memo" value="${esc(p.memo || '')}" ${dis}></div>
    </div>
    <div class="section-title">${draft ? 'Match with open documents' : 'Matched documents'}</div><div id="alloc"></div></div>`;

  async function renderAlloc() {
    const box = $('#alloc');
    if (!draft) {
      box.innerHTML = (p.allocations.length ? `<table class="list"><thead><tr><th>Document</th><th>Date</th><th class="num">Total</th><th class="num">Paid by this payment</th></tr></thead><tbody>
        ${p.allocations.map(a => `<tr class="click" onclick="location.hash='#/accounting/move/${a.move_id}'"><td>${esc(a.move_name)}</td><td>${fdate(a.move_date)}</td><td class="num">${money(a.amount_total)}</td><td class="num">${money(a.amount)}</td></tr>`).join('')}</tbody></table>` : '<p class="muted">Not matched with any document.</p>')
        + (p.amount_unallocated > 0.005 ? `<div class="alert alert-info" style="margin-top:10px">Outstanding (unmatched) amount: <b>${money(p.amount_unallocated)}</b>. It stays on the partner's ${p.partner_type === 'customer' ? 'receivable' : 'payable'} account as an advance.</div>` : '');
      return;
    }
    const pid = $('#p-partner').value;
    if (!pid) { box.innerHTML = '<p class="muted">Select a partner to see open invoices / bills.</p>'; return; }
    const docs = await api.get('payments/open_documents?' + qs({ partner_id: pid, partner_type: $('#p-ptype').value, payment_type: $('#p-type').value }));
    if (!docs.length) { box.innerHTML = '<p class="muted">No open documents for this partner. The payment will be recorded as an advance.</p>'; return; }
    box.innerHTML = `<p class="muted small">Tick documents to choose what this payment settles. Leave all unticked to match the oldest documents automatically.</p>
      <table class="list"><thead><tr><th></th><th>Document</th><th>Date</th><th>Due</th><th class="num">Amount Due</th><th class="num" style="width:150px">Apply</th></tr></thead><tbody>
      ${docs.map(d => `<tr><td><input type="checkbox" data-id="${d.id}"></td><td><a href="#/accounting/move/${d.id}">${esc(d.name)}</a></td><td>${fdate(d.date)}</td><td>${fdate(d.invoice_date_due)}</td><td class="num">${money(d.amount_residual)}</td>
        <td><input type="number" step="any" class="num" data-amt="${d.id}" value="${d.amount_residual}"></td></tr>`).join('')}</tbody></table>`;
    $$('input[type=checkbox]', box).forEach(cb => cb.onchange = () => {
      const sum = $$('input[type=checkbox]:checked', box).reduce((a, c) => a + num($(`[data-amt="${c.dataset.id}"]`, box).value), 0);
      if (!num($('#p-amount').value) || cb.checked) $('#p-amount').value = r2(sum);
    });
  }
  renderAlloc();
  if (draft) ['#p-partner', '#p-ptype', '#p-type'].forEach(s => $(s).onchange = renderAlloc);

  const payload = () => ({ payment_type: $('#p-type').value, partner_type: $('#p-ptype').value, partner_id: $('#p-partner').value || null, amount: $('#p-amount').value, date: $('#p-date').value, journal_id: $('#p-journal').value, memo: $('#p-memo').value });
  $$('.statusbar [data-a]').forEach(b => b.onclick = async () => {
    const a = b.dataset.a;
    try {
      if (a === 'save') { const r = p.id ? await api.put('payments/' + p.id, payload()) : await api.post('payments', payload()); toast('Saved', 'ok'); if (!p.id) go('#/accounting/payment/' + r.id); else renderPayment(r); }
      else if (a === 'post') {
        const r = p.id ? await api.put('payments/' + p.id, payload()) : await api.post('payments', payload());
        const alloc = $$('#alloc input[type=checkbox]:checked').map(c => ({ move_id: c.dataset.id, amount: $(`[data-amt="${c.dataset.id}"]`).value }));
        const done = await api.post(`payments/${r.id}/post`, alloc.length ? { allocations: alloc } : {});
        toast('Payment confirmed', 'ok'); if (!p.id) go('#/accounting/payment/' + r.id); else renderPayment(done);
      }
      else if (a === 'draft') renderPayment(await api.post(`payments/${p.id}/draft`));
      else if (a === 'cancel') { if (await confirmBox('Cancel this payment? Its journal entry will be removed.')) renderPayment(await api.post(`payments/${p.id}/cancel`)); }
      else if (a === 'delete') { if (await confirmBox('Delete this payment?')) { await api.del('payments/' + p.id); go(`#/accounting/payments/${p.partner_type}`); } }
    } catch (e) { }
  });
}

// ----------------------------------------------------------------- journal items
async function journalItems(q) {
  accNav();
  await loadRefs(['accounts', 'partners', 'analytic_accounts', 'journals']);
  view().innerHTML = cp([['Journal Items']], '<button class="btn" id="csv">Export</button>') + `<div class="content">
    <div class="filters">${dateF('date_from', q.date_from || '', 'From')}${dateF('date_to', q.date_to || '', 'To')}
      <div class="f"><label>Journal</label><select id="f-journal_id">${opts(S.journals, q.journal_id)}</select></div>
      <div class="f"><label>Account</label><select id="f-account_id">${accOpts(q.account_id, () => true)}</select></div>
      <div class="f"><label>Partner</label><select id="f-partner_id">${opts(S.partners, q.partner_id)}</select></div>
      <div class="f"><label>Analytic</label><select id="f-analytic_account_id">${opts(S.analytic_accounts, q.analytic_account_id)}</select></div></div>
    <div class="table-wrap" id="tbl"></div></div>`;
  const load = async () => {
    const f = readFilters();
    const rows = await api.get('reports/journal_items?' + qs(f));
    const d = rows.reduce((a, l) => a + l.debit, 0), c = rows.reduce((a, l) => a + l.credit, 0);
    $('#tbl').innerHTML = rows.length ? `<table class="list"><thead><tr><th>Date</th><th>Entry</th><th>Journal</th><th>Account</th><th>Partner</th><th>Label</th><th>Analytic</th><th class="num">Debit</th><th class="num">Credit</th></tr></thead><tbody>
      ${rows.map(l => `<tr class="click" data-id="${l.move_id}"><td>${fdate(l.date)}</td><td>${esc(l.move_name)}</td><td>${esc(l.journal_code)}</td><td>${esc(l.account_code)} ${esc(l.account_name)}</td><td>${esc(l.partner_name || '')}</td><td>${esc(l.name || '')}</td><td>${esc(l.analytic_name || '')}</td><td class="num">${money(l.debit, { blankZero: 1 })}</td><td class="num">${money(l.credit, { blankZero: 1 })}</td></tr>`).join('')}</tbody>
      <tfoot><tr><td colspan="7">${rows.length} items</td><td class="num">${money(d)}</td><td class="num">${money(c)}</td></tr></tfoot></table>` : '<div class="empty">No journal items match.</div>';
    $$('#tbl tr.click').forEach(tr => tr.onclick = () => go('#/accounting/move/' + tr.dataset.id));
  };
  $$('.filters input,.filters select').forEach(i => i.onchange = load);
  $('#csv').onclick = () => $('#tbl table') && tableToCSV('journal_items', $('#tbl table'));
  await load();
}
const dateF = (k, v, l) => `<div class="f"><label>${l}</label><input type="date" id="f-${k}" value="${esc(v)}"></div>`;
function readFilters() { const o = {}; $$('.filters [id^=f-]').forEach(i => { o[i.id.slice(2)] = i.value; }); return o; }

// ----------------------------------------------------------------- generic master data (config)
const ACCOUNT_TYPES = [['asset_receivable', 'Receivable'], ['asset_cash', 'Bank and Cash'], ['asset_current', 'Current Assets'], ['asset_prepayments', 'Prepayments'], ['asset_fixed', 'Fixed Assets'], ['asset_non_current', 'Non-current Assets'],
  ['liability_payable', 'Payable'], ['liability_credit_card', 'Credit Card'], ['liability_current', 'Current Liabilities'], ['liability_non_current', 'Non-current Liabilities'],
  ['equity', 'Equity'], ['income', 'Income'], ['income_other', 'Other Income'], ['expense', 'Expenses'], ['expense_direct_cost', 'Cost of Revenue'], ['expense_depreciation', 'Depreciation'], ['off_balance', 'Off-Balance Sheet']];
const JOURNAL_TYPES = [['sale', 'Sales'], ['purchase', 'Purchase'], ['bank', 'Bank'], ['cash', 'Cash'], ['general', 'Miscellaneous']];

const MODELS = {
  accounts: { title: 'Chart of Accounts', icon: '📚', fields: [{ k: 'code', l: 'Code', req: 1 }, { k: 'name', l: 'Account Name', req: 1 }, { k: 'type', l: 'Type', t: 'select', o: () => ACCOUNT_TYPES, req: 1 }, { k: 'reconcile', l: 'Allow Reconciliation', t: 'bool' }, { k: 'active', l: 'Active', t: 'bool', def: 1 }], cols: ['code', 'name', 'type', 'active'], group: r => nm(ACCOUNT_TYPES.map(([id, name]) => ({ id, name })), r.type) },
  journals: { title: 'Journals', icon: '📓', fields: [{ k: 'name', l: 'Journal Name', req: 1 }, { k: 'code', l: 'Short Code', req: 1 }, { k: 'type', l: 'Type', t: 'select', o: () => JOURNAL_TYPES, req: 1 }, { k: 'default_account_id', l: 'Default Account', t: 'm2o', m: 'accounts' }, { k: 'color', l: 'Color', t: 'color', def: '#714B67' }], cols: ['code', 'name', 'type', 'default_account_id'] },
  taxes: { title: 'Taxes', icon: '％', fields: [{ k: 'name', l: 'Tax Name', req: 1 }, { k: 'rate', l: 'Rate (%)', t: 'number', req: 1 }, { k: 'type_tax_use', l: 'Tax Type', t: 'select', o: () => [['sale', 'Sales'], ['purchase', 'Purchases']], req: 1 }, { k: 'account_id', l: 'Tax Account', t: 'm2o', m: 'accounts' }, { k: 'active', l: 'Active', t: 'bool', def: 1 }], cols: ['name', 'rate', 'type_tax_use', 'account_id', 'active'] },
  analytic_plans: { title: 'Analytic Plans', icon: '🗂️', fields: [{ k: 'name', l: 'Plan Name', req: 1 }, { k: 'color', l: 'Color', t: 'color', def: '#714B67' }], cols: ['name'] },
  analytic_accounts: { title: 'Analytic Accounts', icon: '🎯', fields: [{ k: 'name', l: 'Name', req: 1 }, { k: 'code', l: 'Reference' }, { k: 'plan_id', l: 'Plan', t: 'm2o', m: 'analytic_plans' }, { k: 'partner_id', l: 'Customer', t: 'm2o', m: 'partners' }, { k: 'budget', l: 'Budget', t: 'money' }, { k: 'active', l: 'Active', t: 'bool', def: 1 }], cols: ['code', 'name', 'plan_id', 'partner_id', 'budget'], extra: r => `<a class="btn btn-sm" href="#/accounting/report/analytic?only_id=${r.id}" onclick="event.stopPropagation()">Report</a>` },
  products: { title: 'Products & Services', icon: '📦', fields: [{ k: 'name', l: 'Name', req: 1 }, { k: 'code', l: 'Internal Reference' }, { k: 'sale_price', l: 'Sales Price', t: 'money' }, { k: 'cost', l: 'Cost', t: 'money' }, { k: 'income_account_id', l: 'Income Account', t: 'm2o', m: 'accounts' }, { k: 'expense_account_id', l: 'Expense Account', t: 'm2o', m: 'accounts' }, { k: 'sale_tax_id', l: 'Customer Tax', t: 'm2o', m: 'taxes', f: x => x.type_tax_use === 'sale' }, { k: 'purchase_tax_id', l: 'Vendor Tax', t: 'm2o', m: 'taxes', f: x => x.type_tax_use === 'purchase' }, { k: 'active', l: 'Active', t: 'bool', def: 1 }], cols: ['code', 'name', 'sale_price', 'cost', 'income_account_id', 'expense_account_id'] },
  partners: { title: 'Contacts', icon: '👤', fields: [{ k: 'name', l: 'Name', req: 1 }, { k: 'email', l: 'Email' }, { k: 'phone', l: 'Phone' }, { k: 'street', l: 'Street' }, { k: 'city', l: 'City' }, { k: 'country', l: 'Country' }, { k: 'vat', l: 'Tax ID' }, { k: 'is_customer', l: 'Is a Customer', t: 'bool', def: 1 }, { k: 'is_vendor', l: 'Is a Vendor', t: 'bool' }, { k: 'payment_term_days', l: 'Payment Terms (days)', t: 'number', def: 30 }, { k: 'notes', l: 'Notes', t: 'text' }], cols: ['name', 'email', 'phone', 'city'] },
};

function m2oLabel(model, id) {
  if (model === 'accounts') return accLabel(id);
  return nm(S[model] || [], id);
}
function cellValue(f, v) {
  if (f.t === 'bool') return v ? '✓' : '';
  if (f.t === 'select') return nm(f.o().map(([id, name]) => ({ id, name })), v);
  if (f.t === 'm2o') return esc(m2oLabel(f.m, v));
  if (f.t === 'money') return money(v);
  if (f.t === 'color') return `<span style="display:inline-block;width:14px;height:14px;border-radius:3px;background:${esc(v)}"></span>`;
  if (f.t === 'date') return fdate(v);
  return esc(v);
}
function fieldInput(f, v, id) {
  const val = v ?? f.def ?? '';
  const a = `id="${id}" data-k="${f.k}"`;
  switch (f.t) {
    case 'bool': return `<input type="checkbox" ${a} ${val ? 'checked' : ''}>`;
    case 'select': return `<select ${a}>${sopts(f.o(), val, !f.req)}</select>`;
    case 'm2o': return `<select ${a}>${f.m === 'accounts' ? accOpts(val) : opts(S[f.m] || [], val, { filter: f.f, label: f.m === 'analytic_accounts' ? x => (x.code ? `[${x.code}] ` : '') + x.name : undefined })}</select>`;
    case 'number': case 'money': return `<input type="number" step="any" ${a} value="${esc(val)}">`;
    case 'date': return `<input type="date" ${a} value="${esc(val)}">`;
    case 'text': return `<textarea ${a}>${esc(val)}</textarea>`;
    case 'color': return `<input type="color" ${a} value="${esc(val || '#714B67')}" style="height:34px;padding:2px">`;
    default: return `<input ${a} value="${esc(val)}">`;
  }
}
function readFields(root, fields) {
  const o = {};
  fields.forEach(f => {
    const el = $(`[data-k="${f.k}"]`, root); if (!el) return;
    o[f.k] = f.t === 'bool' ? (el.checked ? 1 : 0) : (f.t === 'number' || f.t === 'money') ? (el.value === '' ? null : num(el.value)) : el.value;
  });
  return o;
}

function openRecordForm(modelKey, rec, onSaved) {
  const M = MODELS[modelKey];
  rec = rec || {};
  const body = `<div class="fgrid">${M.fields.map((f, i) => `<div class="frow ${f.t === 'text' ? 'top' : ''}"><label for="mf-${i}">${esc(f.l)}${f.req ? ' *' : ''}</label>${fieldInput(f, rec[f.k], 'mf-' + i)}</div>`).join('')}</div>`;
  const btns = [{ label: 'Save', cls: 'btn-primary', click: async el => {
    const data = readFields(el, M.fields);
    const r = rec.id ? await api.put(`${modelKey}/${rec.id}`, data) : await api.post(modelKey, data);
    toast('Saved', 'ok'); await loadRefs([modelKey]); onSaved && onSaved(r);
  } }];
  if (rec.id) btns.push({ label: 'Delete', cls: 'btn-danger', click: async () => {
    if (!(await confirmBox('Delete this record?'))) return false;
    await api.del(`${modelKey}/${rec.id}`); toast('Deleted', 'ok'); await loadRefs([modelKey]); onSaved && onSaved(null);
  } });
  modal(rec.id ? `${M.title}: ${rec.name || rec.code || ''}` : `New – ${M.title}`, body, btns);
}

async function modelList(modelKey, q) {
  accNav();
  const M = MODELS[modelKey]; if (!M) throw new Error('Unknown model');
  await loadRefs();
  view().innerHTML = cp([[M.title]], `<input type="search" id="f-q" placeholder="Search…" value="${esc(q.q || '')}"><button class="btn" id="csv">Export</button><button class="btn btn-primary" id="new">New</button>`) + '<div class="content"><div class="table-wrap" id="tbl"></div></div>';
  const cols = M.cols.map(k => M.fields.find(f => f.k === k));
  const render = () => {
    const s = $('#f-q').value.toLowerCase();
    const rows = S[modelKey].filter(r => !s || JSON.stringify(r).toLowerCase().includes(s));
    if (!rows.length) { $('#tbl').innerHTML = `<div class="empty"><div class="big">${M.icon}</div>No records.</div>`; return; }
    let last = null, body = '';
    rows.forEach(r => {
      if (M.group) { const g = M.group(r); if (g !== last) { body += `<tr><td colspan="${cols.length + 1}" style="background:#f7f8fa;font-weight:600">${esc(g)}</td></tr>`; last = g; } }
      body += `<tr class="click" data-id="${r.id}">${cols.map(f => `<td class="${f.t === 'money' || f.t === 'number' ? 'num' : ''}">${cellValue(f, r[f.k])}</td>`).join('')}<td class="num">${M.extra ? M.extra(r) : ''}</td></tr>`;
    });
    $('#tbl').innerHTML = `<table class="list"><thead><tr>${cols.map(f => `<th class="${f.t === 'money' || f.t === 'number' ? 'num' : ''}">${esc(f.l)}</th>`).join('')}<th></th></tr></thead><tbody>${body}</tbody></table>`;
    $$('#tbl tr.click').forEach(tr => tr.onclick = () => openRecordForm(modelKey, byId(S[modelKey], tr.dataset.id), render));
  };
  $('#f-q').oninput = render;
  $('#new').onclick = () => openRecordForm(modelKey, null, render);
  $('#csv').onclick = () => $('#tbl table') && tableToCSV(modelKey, $('#tbl table'));
  render();
}

// ----------------------------------------------------------------- contacts
async function contacts(q) {
  setNav('Contacts', [{ label: 'Contacts', href: '#/contacts' }, { label: 'Customers', href: '#/contacts?filter=customer' }, { label: 'Vendors', href: '#/contacts?filter=vendor' }]);
  await loadRefs(['partners']);
  view().innerHTML = cp([['Contacts']], `<input type="search" id="f-q" placeholder="Search…"><select id="f-type" style="width:auto">${sopts([['', 'All'], ['customer', 'Customers'], ['vendor', 'Vendors']], q.filter || '')}</select><button class="btn btn-primary" id="new">New</button>`) + '<div class="content"><div class="kanban" id="kb"></div></div>';
  const render = () => {
    const s = $('#f-q').value.toLowerCase(), t = $('#f-type').value;
    const rows = S.partners.filter(p => (!s || JSON.stringify(p).toLowerCase().includes(s)) && (!t || (t === 'customer' ? p.is_customer : p.is_vendor)));
    $('#kb').innerHTML = rows.length ? rows.map(p => `<div class="kcard" data-id="${p.id}"><div class="avatar">${esc((p.name || '?')[0].toUpperCase())}</div><div><div class="t">${esc(p.name)}</div>
      <div class="s">${esc([p.city, p.country].filter(Boolean).join(', '))}</div><div class="s">${esc(p.email || '')}</div>
      <div style="margin-top:6px">${p.is_customer ? '<span class="badge b-posted">Customer</span> ' : ''}${p.is_vendor ? '<span class="badge b-partial">Vendor</span>' : ''}</div></div></div>`).join('') : '<div class="empty" style="grid-column:1/-1"><div class="big">👤</div>No contacts.</div>';
    $$('#kb .kcard').forEach(c => c.onclick = () => go('#/contacts/' + c.dataset.id));
  };
  $('#f-q').oninput = render; $('#f-type').onchange = render;
  $('#new').onclick = () => openRecordForm('partners', { is_customer: q.filter !== 'vendor' ? 1 : 0, is_vendor: q.filter === 'vendor' ? 1 : 0 }, r => r ? go('#/contacts/' + r.id) : render());
  render();
}

async function contactDetail(id) {
  setNav('Contacts', [{ label: 'Contacts', href: '#/contacts' }]);
  await loadRefs(['partners']);
  const p = byId(S.partners, id); if (!p) throw new Error('Contact not found');
  const [docs, ledger] = await Promise.all([api.get('moves?partner_id=' + id), api.get('reports/partner_ledger?partner_id=' + id)]);
  const lg = ledger.rows[0] || { receivable: 0, payable: 0 };
  const inv = docs.filter(d => d.move_type === 'out_invoice' && d.state === 'posted').reduce((a, d) => a + d.amount_untaxed, 0);
  const bills = docs.filter(d => d.move_type === 'in_invoice' && d.state === 'posted').reduce((a, d) => a + d.amount_untaxed, 0);
  view().innerHTML = cp([['Contacts', '#/contacts'], [p.name]], `<button class="btn" id="edit">Edit</button>
    ${p.is_customer ? `<a class="btn btn-primary" href="#/accounting/move/new?type=out_invoice&partner_id=${p.id}">New Invoice</a>` : ''}
    ${p.is_vendor ? `<a class="btn btn-primary" href="#/accounting/move/new?type=in_invoice&partner_id=${p.id}">New Bill</a>` : ''}`) +
    `<div class="sheet"><div style="display:flex;gap:16px;align-items:center;margin-bottom:16px"><div class="avatar" style="width:64px;height:64px;font-size:28px">${esc(p.name[0].toUpperCase())}</div>
      <div><h1 class="doc" style="margin:0">${esc(p.name)}</h1><div class="muted">${esc([p.street, p.city, p.country].filter(Boolean).join(', '))}</div></div></div>
    <div class="kpis"><div class="kpi"><div class="l">Invoiced (untaxed)</div><div class="v">${money(inv)}</div></div><div class="kpi"><div class="l">Receivable</div><div class="v">${money(lg.receivable)}</div></div>
      <div class="kpi"><div class="l">Billed (untaxed)</div><div class="v">${money(bills)}</div></div><div class="kpi"><div class="l">Payable</div><div class="v">${money(lg.payable)}</div></div></div>
    <div class="fgrid"><div class="frow"><label>Email</label><div>${esc(p.email || '')}</div></div><div class="frow"><label>Phone</label><div>${esc(p.phone || '')}</div></div>
      <div class="frow"><label>Tax ID</label><div>${esc(p.vat || '')}</div></div><div class="frow"><label>Payment Terms</label><div>${esc(p.payment_term_days ?? 30)} days</div></div>
      ${p.notes ? `<div class="frow full"><label>Notes</label><div>${esc(p.notes)}</div></div>` : ''}</div>
    <div class="section-title">Documents</div>
    ${docs.length ? `<table class="list"><thead><tr><th>Number</th><th>Type</th><th>Date</th><th class="num">Total</th><th class="num">Due</th><th>Status</th></tr></thead><tbody>
      ${docs.map(d => `<tr class="click" data-id="${d.id}"><td>${esc(d.name || 'Draft')}</td><td>${TYPE_L[d.move_type]}</td><td>${fdate(d.date)}</td><td class="num">${money(d.amount_total)}</td><td class="num">${d.state === 'posted' && d.move_type !== 'entry' ? money(d.amount_residual) : ''}</td><td>${moveBadges(d)}</td></tr>`).join('')}</tbody></table>` : '<p class="muted">No documents yet.</p>'}
    </div>`;
  $$('tr.click').forEach(tr => tr.onclick = () => go('#/accounting/move/' + tr.dataset.id));
  $('#edit').onclick = () => openRecordForm('partners', p, r => r ? contactDetail(id) : go('#/contacts'));
}

// ----------------------------------------------------------------- reports
const REPORT_DEF = {
  profit_loss: { title: 'Profit and Loss', filters: ['date_from', 'date_to', 'analytic_account_id', 'journal_id'] },
  balance_sheet: { title: 'Balance Sheet', filters: ['date_to'] },
  trial_balance: { title: 'Trial Balance', filters: ['date_from', 'date_to', 'journal_id', 'analytic_account_id'] },
  general_ledger: { title: 'General Ledger', filters: ['date_from', 'date_to', 'account_id', 'partner_id', 'analytic_account_id', 'journal_id'] },
  aged_receivable: { title: 'Aged Receivable', filters: ['date_to'] },
  aged_payable: { title: 'Aged Payable', filters: ['date_to'] },
  partner_ledger: { title: 'Partner Ledger', filters: ['date_from', 'date_to'] },
  analytic: { title: 'Analytic Report', filters: ['date_from', 'date_to'] },
  tax: { title: 'Tax Report', filters: ['date_from', 'date_to'] },
};

async function report(name, q) {
  accNav();
  const R = REPORT_DEF[name]; if (!R) throw new Error('Unknown report');
  await loadRefs(['accounts', 'partners', 'analytic_accounts', 'journals']);
  const defaults = { date_from: name === 'balance_sheet' ? '' : yearStart(), date_to: today() };
  const val = k => q[k] ?? defaults[k] ?? '';
  const F = {
    date_from: () => dateF('date_from', val('date_from'), 'From'), date_to: () => dateF('date_to', val('date_to'), name.startsWith('aged') || name === 'balance_sheet' ? 'As of' : 'To'),
    account_id: () => `<div class="f"><label>Account</label><select id="f-account_id">${accOpts(val('account_id'), () => true)}</select></div>`,
    partner_id: () => `<div class="f"><label>Partner</label><select id="f-partner_id">${opts(S.partners, val('partner_id'))}</select></div>`,
    analytic_account_id: () => `<div class="f"><label>Analytic</label><select id="f-analytic_account_id">${opts(S.analytic_accounts, val('analytic_account_id'))}</select></div>`,
    journal_id: () => `<div class="f"><label>Journal</label><select id="f-journal_id">${opts(S.journals, val('journal_id'))}</select></div>`,
  };
  const quick = name === 'balance_sheet' || name.startsWith('aged') ? '' : `<div class="f"><label>Period</label><select id="quick">${sopts([['', 'Custom'], ['month', 'This month'], ['quarter', 'This quarter'], ['year', 'This year'], ['last_year', 'Last year'], ['all', 'All time']], '')}</select></div>`;
  view().innerHTML = cp([['Reporting'], [R.title]], `<button class="btn" id="csv">Export CSV</button><button class="btn" onclick="window.print()">Print</button>`) +
    `<div class="content"><div class="filters">${quick}${R.filters.map(f => F[f]()).join('')}${q.only_id ? `<input type="hidden" id="f-only_id" value="${esc(q.only_id)}">` : ''}</div><div id="rep"></div></div>`;
  const load = async () => {
    const f = readFilters();
    const d = await api.get(`reports/${name}?` + qs(f));
    $('#rep').innerHTML = `<div class="rep-title">${esc(S.settings.company_name || '')} · ${R.title} · ${f.date_from ? fdate(f.date_from) + ' – ' : ''}${fdate(f.date_to || today())}</div>` + RENDER[name](d, f);
    $$('#rep [data-gl]').forEach(el => el.onclick = () => go(`#/accounting/report/general_ledger?${qs({ account_id: el.dataset.gl, date_from: name === 'balance_sheet' ? '' : f.date_from, date_to: f.date_to, analytic_account_id: f.analytic_account_id || '' })}`));
    $$('#rep [data-move]').forEach(el => el.onclick = () => go('#/accounting/move/' + el.dataset.move));
    $$('#rep [data-partner]').forEach(el => el.onclick = () => go('#/contacts/' + el.dataset.partner));
    $$('#rep [data-an]').forEach(el => el.onclick = () => go(`#/accounting/report/general_ledger?${qs({ analytic_account_id: el.dataset.an, date_from: f.date_from, date_to: f.date_to })}`));
    $$('#rep .gl-head').forEach(el => el.onclick = () => $$(`#rep tr[data-of="${el.dataset.acc}"]`).forEach(r => r.style.display = r.style.display === 'none' ? '' : 'none'));
  };
  $$('.filters input,.filters select').forEach(i => { if (i.id !== 'quick') i.onchange = load; });
  if ($('#quick')) $('#quick').onchange = () => {
    const v = $('#quick').value, d = new Date(), y = d.getFullYear(), mo = d.getMonth();
    const iso = x => new Date(x.getTime() - x.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    const set = (a, b) => { if ($('#f-date_from')) $('#f-date_from').value = a; $('#f-date_to').value = b; };
    if (v === 'month') set(iso(new Date(y, mo, 1)), iso(new Date(y, mo + 1, 0)));
    if (v === 'quarter') { const qs0 = Math.floor(mo / 3) * 3; set(iso(new Date(y, qs0, 1)), iso(new Date(y, qs0 + 3, 0))); }
    if (v === 'year') set(`${y}-01-01`, `${y}-12-31`);
    if (v === 'last_year') set(`${y - 1}-01-01`, `${y - 1}-12-31`);
    if (v === 'all') set('', today());
    load();
  };
  $('#csv').onclick = () => $$('#rep table').forEach(t => tableToCSV(name, t));
  await load();
}

const amt = v => `<span class="${num(v) < -0.004 ? 'neg' : ''}">${money(v)}</span>`;
const RENDER = {
  profit_loss(d) {
    let h = '<div class="rep"><table><thead><tr><th>Account</th><th class="num">Amount</th></tr></thead><tbody>';
    d.sections.forEach(s => {
      if (s.subtotal) { h += `<tr class="${s.grand ? 'grand' : 'sub'}"><td>${esc(s.name)}</td><td class="num">${amt(s.total)}</td></tr>`; return; }
      h += `<tr class="sec"><td>${esc(s.name)}</td><td class="num">${amt(s.total)}</td></tr>`;
      h += s.rows.map(r => `<tr class="acc click" data-gl="${r.id}" style="cursor:pointer"><td>${esc(r.code)} ${esc(r.name)}</td><td class="num">${amt(r.amount)}</td></tr>`).join('') || '<tr class="acc"><td class="muted">—</td><td></td></tr>';
    });
    return h + '</tbody></table></div>';
  },
  balance_sheet(d) {
    const block = (title, b) => `<tr class="grand"><td>${title}</td><td class="num">${amt(b.total)}</td></tr>` + b.sections.map(s => `<tr class="sec"><td>${esc(s.name)}</td><td class="num">${amt(s.total)}</td></tr>` +
      s.rows.map(r => `<tr class="acc" ${r.id ? `data-gl="${r.id}" style="cursor:pointer"` : ''}><td>${esc(r.code)} ${esc(r.name)}</td><td class="num">${amt(r.amount)}</td></tr>`).join('')).join('');
    return (d.balanced ? '' : '<div class="alert alert-warn">The balance sheet is not balanced. Check for unbalanced entries.</div>') +
      `<div class="rep"><table><thead><tr><th>Account</th><th class="num">Balance</th></tr></thead><tbody>${block('ASSETS', d.assets)}${block('LIABILITIES', d.liabilities)}${block('EQUITY', d.equity)}
      <tr class="sub"><td>LIABILITIES + EQUITY</td><td class="num">${amt(d.liabilities_equity)}</td></tr></tbody></table></div>`;
  },
  trial_balance(d) {
    return `<div class="rep"><table><thead><tr><th>Account</th><th class="num">Opening</th><th class="num">Debit</th><th class="num">Credit</th><th class="num">Ending Balance</th></tr></thead><tbody>
      ${d.rows.map(r => `<tr class="click" data-gl="${r.id}" style="cursor:pointer"><td>${esc(r.code)} ${esc(r.name)}</td><td class="num">${amt(r.opening)}</td><td class="num">${money(r.debit)}</td><td class="num">${money(r.credit)}</td><td class="num">${amt(r.ending)}</td></tr>`).join('')}
      <tr class="grand"><td>Total</td><td class="num">${amt(d.totals.opening)}</td><td class="num">${money(d.totals.debit)}</td><td class="num">${money(d.totals.credit)}</td><td class="num">${amt(d.totals.ending)}</td></tr></tbody></table></div>`;
  },
  general_ledger(d) {
    if (!d.accounts.length) return '<div class="rep"><div class="empty">No entries for these filters.</div></div>';
    let h = '<div class="rep"><table><thead><tr><th>Date</th><th>Entry</th><th>Partner</th><th>Label</th><th>Analytic</th><th class="num">Debit</th><th class="num">Credit</th><th class="num">Balance</th></tr></thead><tbody>';
    d.accounts.forEach(a => {
      h += `<tr class="gl-head" data-acc="${a.id}"><td colspan="5">▸ ${esc(a.code)} ${esc(a.name)}</td><td class="num">${money(a.debit)}</td><td class="num">${money(a.credit)}</td><td class="num">${amt(a.ending)}</td></tr>`;
      if (a.opening) h += `<tr data-of="${a.id}" class="muted"><td></td><td colspan="6">Opening balance</td><td class="num">${amt(a.opening)}</td></tr>`;
      h += a.lines.map(l => `<tr data-of="${a.id}" data-move="${l.move_id}" style="cursor:pointer"><td>${fdate(l.date)}</td><td>${esc(l.move_name)}</td><td>${esc(l.partner_name || '')}</td><td>${esc(l.name || l.ref || '')}</td><td>${esc(l.analytic_name || '')}</td>
        <td class="num">${money(l.debit, { blankZero: 1 })}</td><td class="num">${money(l.credit, { blankZero: 1 })}</td><td class="num">${amt(l.balance)}</td></tr>`).join('');
    });
    return h + '</tbody></table></div>';
  },
  aged_receivable(d) { return agedTable(d); },
  aged_payable(d) { return agedTable(d); },
  partner_ledger(d) {
    return `<div class="rep"><table><thead><tr><th>Partner</th><th class="num">Receivable</th><th class="num">Payable</th><th class="num">Net</th></tr></thead><tbody>
      ${d.rows.map(r => `<tr data-partner="${r.id}" style="cursor:pointer"><td>${esc(r.name)}</td><td class="num">${amt(r.receivable)}</td><td class="num">${amt(r.payable)}</td><td class="num">${amt(r.receivable - r.payable)}</td></tr>`).join('')}
      <tr class="grand"><td>Total</td><td class="num">${amt(d.rows.reduce((a, r) => a + r.receivable, 0))}</td><td class="num">${amt(d.rows.reduce((a, r) => a + r.payable, 0))}</td><td></td></tr></tbody></table></div>`;
  },
  analytic(d) {
    let plan = null, h = '<div class="rep"><table><thead><tr><th>Analytic Account</th><th>Customer</th><th class="num">Income</th><th class="num">Costs</th><th class="num">Margin</th><th class="num">Margin %</th><th class="num">Budget</th><th>Budget used</th></tr></thead><tbody>';
    d.rows.forEach(r => {
      if (r.plan_name !== plan) { plan = r.plan_name; h += `<tr class="sec"><td colspan="8">${esc(plan || 'No plan')}</td></tr>`; }
      const pct = r.budget_used;
      h += `<tr class="acc" data-an="${r.id}" style="cursor:pointer"><td>${r.code ? `[${esc(r.code)}] ` : ''}${esc(r.name)}</td><td>${esc(r.partner_name || '')}</td><td class="num">${money(r.income)}</td><td class="num">${money(r.expense)}</td><td class="num">${amt(r.net)}</td>
        <td class="num">${r.income ? Math.round(100 * r.net / r.income) + '%' : ''}</td><td class="num">${r.budget ? money(r.budget) : ''}</td>
        <td>${pct != null ? `<div style="display:flex;gap:6px;align-items:center"><div class="progress" style="flex:1"><div class="${pct > 100 ? 'over' : ''}" style="width:${Math.min(pct, 100)}%"></div></div><span class="small">${pct}%</span></div>` : ''}</td></tr>`;
    });
    return h + `<tr class="grand"><td colspan="2">Total</td><td class="num">${money(d.totals.income)}</td><td class="num">${money(d.totals.expense)}</td><td class="num">${amt(d.totals.net)}</td><td></td><td class="num">${money(d.totals.budget)}</td><td></td></tr></tbody></table></div>
      <p class="muted small">Income and costs come from posted journal items that carry an analytic account (set on invoice/bill lines or journal entries). Click a row to see its items.</p>`;
  },
  tax(d) {
    return `<div class="rep"><table><thead><tr><th>Tax</th><th>Type</th><th class="num">Base Amount</th><th class="num">Tax Amount</th></tr></thead><tbody>
      ${d.rows.map(r => `<tr><td>${esc(r.name)}</td><td>${r.type_tax_use === 'sale' ? 'Sales' : 'Purchases'}</td><td class="num">${money(r.base)}</td><td class="num">${money(r.tax)}</td></tr>`).join('')}
      <tr class="sub"><td colspan="3">Tax collected on sales</td><td class="num">${money(d.sales_tax)}</td></tr><tr class="sub"><td colspan="3">Tax paid on purchases (deductible)</td><td class="num">${money(-d.purchase_tax)}</td></tr>
      <tr class="grand"><td colspan="3">${d.net_due >= 0 ? 'Net tax payable' : 'Net tax refundable'}</td><td class="num">${money(d.net_due)}</td></tr></tbody></table></div>`;
  },
};
function agedTable(d) {
  const L = { current: 'Not due', '1-30': '1–30', '31-60': '31–60', '61-90': '61–90', '90+': 'Older' };
  if (!d.rows.length) return '<div class="rep"><div class="empty">Nothing outstanding. 🎉</div></div>';
  let h = `<div class="rep"><table><thead><tr><th>Partner / Document</th><th>Due</th>${d.buckets.map(b => `<th class="num">${L[b]}</th>`).join('')}<th class="num">Total</th></tr></thead><tbody>`;
  d.rows.forEach(p => {
    h += `<tr class="sec"><td data-partner="${p.partner_id}" style="cursor:pointer">${esc(p.partner_name)}</td><td></td>${d.buckets.map(b => `<td class="num">${money(p[b], { blankZero: 1 })}</td>`).join('')}<td class="num">${money(p.total)}</td></tr>`;
    h += p.docs.map(x => `<tr class="acc" data-move="${x.id}" style="cursor:pointer"><td>${esc(x.name)}</td><td>${fdate(x.due)}</td>${d.buckets.map(b => `<td class="num">${b === x.bucket ? money(x.amount) : ''}</td>`).join('')}<td class="num">${money(x.amount)}</td></tr>`).join('');
  });
  return h + `<tr class="grand"><td>Total</td><td></td>${d.buckets.map(b => `<td class="num">${money(d.totals[b])}</td>`).join('')}<td class="num">${money(d.totals.total)}</td></tr></tbody></table></div>`;
}

// ----------------------------------------------------------------- App Builder (studio)
const FTYPES = [['char', 'Text'], ['text', 'Long Text'], ['number', 'Number'], ['money', 'Monetary'], ['date', 'Date'], ['boolean', 'Checkbox'], ['selection', 'Selection'], ['partner', 'Contact (link)'], ['analytic', 'Analytic Account (link)'], ['account', 'GL Account (link)']];
const studioNav = () => setNav('App Builder', [{ label: 'My Apps', href: '#/studio' }]);

async function studio(q) {
  studioNav();
  await loadRefs(['apps']);
  const tpls = await api.get('app_templates');
  view().innerHTML = cp([['App Builder']], '<button class="btn btn-primary" id="new">Create a blank app</button>') + `<div class="content">
    <p class="muted">Build apps for your line of work. Each app has its own fields and records, and can link records to contacts, GL accounts and <b>analytic accounts</b>, so you see the revenue, costs and margin of each project, vehicle, property or site.</p>
    <div class="section-title">Your apps</div>
    ${S.apps.length ? `<div class="tpl-grid">${S.apps.map(a => `<div class="tpl"><div class="hd"><div class="ic" style="background:${esc(a.color)};color:#fff">${esc(a.icon || '📦')}</div>${esc(a.name)}</div>
      <div class="muted small">${esc(a.description || '')}</div><div style="display:flex;gap:6px;margin-top:auto"><a class="btn btn-primary btn-sm" href="#/app/${a.id}">Open</a><a class="btn btn-sm" href="#/studio/${a.id}">Edit fields</a></div></div>`).join('')}</div>` : '<p class="muted">No custom apps yet. Start from a template below or create a blank one.</p>'}
    <div class="section-title">Start from a template</div>
    <div class="tpl-grid">${tpls.map(t => `<div class="tpl"><div class="hd"><div class="ic" style="background:${esc(t.color)};color:#fff">${esc(t.icon)}</div>${esc(t.name)}</div>
      <div class="muted small">${esc(t.description)}</div><div class="small">${t.fields.map(esc).join(' · ')}</div>
      <div style="margin-top:auto"><button class="btn btn-sm" data-tpl="${t.key}">Install</button></div></div>`).join('')}</div></div>`;
  $$('[data-tpl]').forEach(b => b.onclick = async () => { const a = await api.post('apps/from_template', { template: b.dataset.tpl }); await loadRefs(['apps']); toast(`${a.name} installed`, 'ok'); go('#/app/' + a.id); });
  const newApp = () => {
    modal('New App', `<div class="fgrid"><div class="frow"><label>App Name *</label><input id="a-name" placeholder="e.g. Clinics, Workshops, Contracts"></div>
      <div class="frow"><label>Icon (emoji)</label><input id="a-icon" value="📦" maxlength="4"></div><div class="frow"><label>Color</label><input id="a-color" type="color" value="#3c6e9f" style="height:34px;padding:2px"></div>
      <div class="frow top"><label>Description</label><textarea id="a-desc"></textarea></div></div>`,
      [{ label: 'Create', cls: 'btn-primary', click: async el => {
        const a = await api.post('apps', { name: $('#a-name', el).value, icon: $('#a-icon', el).value, color: $('#a-color', el).value, description: $('#a-desc', el).value });
        await api.post('app_fields', { app_id: a.id, label: 'Name', name: 'name', ftype: 'char', required: 1, sequence: 10 });
        await loadRefs(['apps']); go('#/studio/' + a.id);
      } }]);
  };
  $('#new').onclick = newApp;
  if (q.new) newApp();
}

async function studioApp(id) {
  studioNav();
  const [app, fields] = await Promise.all([api.get('apps/' + id), api.get('app_fields?app_id=' + id)]);
  view().innerHTML = cp([['App Builder', '#/studio'], [app.name]], `<a class="btn" href="#/app/${id}">Open App</a><button class="btn btn-danger" id="del">Delete App</button>`) + `<div class="content">
    <div class="sheet" style="margin-top:0"><div class="fgrid">
      <div class="frow"><label>App Name</label><input id="a-name" value="${esc(app.name)}"></div><div class="frow"><label>Icon</label><input id="a-icon" value="${esc(app.icon || '')}" maxlength="4"></div>
      <div class="frow"><label>Color</label><input id="a-color" type="color" value="${esc(app.color || '#3c6e9f')}" style="height:34px;padding:2px"></div><div class="frow"><label>Description</label><input id="a-desc" value="${esc(app.description || '')}"></div></div>
      <button class="btn btn-primary" id="save-app">Save App</button>
      <div class="section-title">Fields</div>
      <div style="overflow-x:auto"><table class="list lines"><thead><tr><th>Label</th><th>Technical name</th><th>Type</th><th>Options (for Selection, comma-separated)</th><th>Required</th><th>Show in list</th><th style="width:80px">Order</th><th></th></tr></thead><tbody id="flds">
      ${fields.map(f => `<tr data-id="${f.id}"><td><input data-k="label" value="${esc(f.label)}"></td><td class="muted">${esc(f.name)}</td><td><select data-k="ftype">${sopts(FTYPES, f.ftype)}</select></td>
        <td><input data-k="options" value="${esc(f.options || '')}"></td><td><input type="checkbox" data-k="required" ${f.required ? 'checked' : ''}></td><td><input type="checkbox" data-k="in_list" ${f.in_list ? 'checked' : ''}></td>
        <td><input type="number" data-k="sequence" value="${esc(f.sequence)}"></td><td><button class="del">🗑</button></td></tr>`).join('')}
      <tr class="new"><td><input data-k="label" placeholder="New field label"></td><td></td><td><select data-k="ftype">${sopts(FTYPES, 'char')}</select></td><td><input data-k="options"></td><td><input type="checkbox" data-k="required"></td><td><input type="checkbox" data-k="in_list" checked></td>
        <td><input type="number" data-k="sequence" value="${(fields.length + 1) * 10}"></td><td><button class="btn btn-sm btn-primary" id="add">Add</button></td></tr></tbody></table></div>
      <p class="muted small">Changes to existing fields are saved automatically. Tip: add an <b>Analytic Account</b> field to see the accounting results (income, costs, margin) on every record.</p></div></div>`;
  const rowData = tr => Object.fromEntries($$('[data-k]', tr).map(i => [i.dataset.k, i.type === 'checkbox' ? (i.checked ? 1 : 0) : i.value]));
  $$('#flds tr[data-id]').forEach(tr => {
    $$('[data-k]', tr).forEach(i => i.onchange = async () => { await api.put('app_fields/' + tr.dataset.id, rowData(tr)); toast('Field saved', 'ok'); });
    $('.del', tr).onclick = async () => { if (await confirmBox('Delete this field? Existing values stay in the records but are hidden.')) { await api.del('app_fields/' + tr.dataset.id); studioApp(id); } };
  });
  $('#add').onclick = async () => { const d = rowData($('#flds tr.new')); if (!d.label) return toast('Enter a label', 'error'); await api.post('app_fields', { ...d, app_id: +id }); studioApp(id); };
  $('#save-app').onclick = async () => { await api.put('apps/' + id, { name: $('#a-name').value, icon: $('#a-icon').value, color: $('#a-color').value, description: $('#a-desc').value }); await loadRefs(['apps']); toast('Saved', 'ok'); };
  $('#del').onclick = async () => { if (await confirmBox(`Delete the app "${app.name}" and ALL its records?`)) { await api.del('apps/' + id); await loadRefs(['apps']); go('#/studio'); } };
}

// ----------------------------------------------------------------- custom apps runtime
function appField(f) {
  const map = { char: 'char', text: 'text', number: 'number', money: 'money', date: 'date', boolean: 'bool', selection: 'select', partner: 'm2o', analytic: 'm2o', account: 'm2o' };
  const m = { partner: 'partners', analytic: 'analytic_accounts', account: 'accounts' }[f.ftype];
  const choices = (f.options || '').split(',').map(s => s.trim()).filter(Boolean).map(s => [s, s]);
  return { k: f.name, l: f.label, t: map[f.ftype] || 'char', m, o: () => choices, req: f.required };
}
async function loadApp(id) {
  const [app, fields] = await Promise.all([api.get('apps/' + id), api.get('app_fields?app_id=' + id)]);
  const appNav = () => setNav(app.name, [{ label: app.name, href: `#/app/${id}` }, { label: 'Configure', href: `#/studio/${id}` }]);
  return { app, fields, F: fields.map(appField), appNav };
}

async function customList(id) {
  const { app, fields, F, appNav } = await loadApp(id); appNav();
  await loadRefs(['partners', 'analytic_accounts', 'accounts']);
  const recs = await api.get('app_records?app_id=' + id);
  const inList = F.filter((_, i) => fields[i].in_list);
  const useCols = inList.length ? inList : F.slice(0, 5);
  const hasAnalytic = F.find(f => f.m === 'analytic_accounts');
  let an = {};
  if (hasAnalytic) (await api.get('reports/analytic')).rows.forEach(r => { an[r.id] = r; });
  view().innerHTML = cp([[app.name]], `<input type="search" id="f-q" placeholder="Search…"><button class="btn" id="csv">Export</button><a class="btn btn-primary" href="#/app/${id}/new">New</a>`) + '<div class="content"><div class="table-wrap" id="tbl"></div></div>';
  const render = () => {
    const s = $('#f-q').value.toLowerCase();
    const rows = recs.filter(r => !s || Object.values(r.data).join(' ').toLowerCase().includes(s) || useCols.some(f => f.t === 'm2o' && String(m2oLabel(f.m, r.data[f.k])).toLowerCase().includes(s)));
    if (!rows.length) { $('#tbl').innerHTML = `<div class="empty"><div class="big">${esc(app.icon || '📦')}</div>No records yet.<br><br><a class="btn btn-primary" href="#/app/${id}/new">Create the first one</a></div>`; return; }
    $('#tbl').innerHTML = `<table class="list"><thead><tr>${useCols.map(f => `<th class="${f.t === 'money' || f.t === 'number' ? 'num' : ''}">${esc(f.l)}</th>`).join('')}${hasAnalytic ? '<th class="num">Income</th><th class="num">Costs</th><th class="num">Margin</th>' : ''}</tr></thead><tbody>
      ${rows.map(r => { const a = hasAnalytic && an[r.data[hasAnalytic.k]]; return `<tr class="click" data-id="${r.id}">${useCols.map(f => `<td class="${f.t === 'money' || f.t === 'number' ? 'num' : ''}">${cellValue(f, r.data[f.k])}</td>`).join('')}
        ${hasAnalytic ? `<td class="num">${a ? money(a.income) : ''}</td><td class="num">${a ? money(a.expense) : ''}</td><td class="num">${a ? amt(a.net) : ''}</td>` : ''}</tr>`; }).join('')}</tbody></table>`;
    $$('#tbl tr.click').forEach(tr => tr.onclick = () => go(`#/app/${id}/${tr.dataset.id}`));
  };
  $('#f-q').oninput = render;
  $('#csv').onclick = () => $('#tbl table') && tableToCSV(app.name, $('#tbl table'));
  render();
}

async function customRecord(id, rid) {
  const { app, F, appNav } = await loadApp(id); appNav();
  await loadRefs(['partners', 'analytic_accounts', 'accounts']);
  const rec = rid === 'new' ? { data: {} } : await api.get('app_records/' + rid);
  const title = rec.id ? (rec.data[F[0] && F[0].k] || `#${rec.id}`) : 'New';
  view().innerHTML = cp([[app.name, `#/app/${id}`], [String(title)]], `${rec.id ? '<button class="btn btn-danger" id="del">Delete</button>' : ''}<button class="btn btn-primary" id="save">Save</button>`) +
    `<div class="sheet"><div class="doc-type">${esc(app.name)}</div><h1 class="doc">${esc(title)}</h1>
    <div class="fgrid">${F.map((f, i) => `<div class="frow ${f.t === 'text' ? 'full top' : ''}"><label for="cf-${i}">${esc(f.l)}${f.req ? ' *' : ''}</label>${fieldInput(f, rec.data[f.k], 'cf-' + i)}</div>`).join('')}</div>
    <div id="acc-panel"></div></div>`;
  const anField = F.find(f => f.m === 'analytic_accounts');
  const panel = async () => {
    const box = $('#acc-panel'); if (!anField) return;
    const aid = $(`[data-k="${anField.k}"]`).value;
    if (!aid) {
      box.innerHTML = `<div class="section-title">Accounting</div><p class="muted">Link an analytic account to track this record's income and costs. <button class="btn btn-sm" id="mk-an">Create analytic account</button></p>`;
      $('#mk-an').onclick = async () => {
        const nameVal = $(`[data-k="${F[0].k}"]`).value || app.name;
        const pf = F.find(f => f.m === 'partners');
        const a = await api.post('analytic_accounts', { name: nameVal, partner_id: pf ? $(`[data-k="${pf.k}"]`).value : null });
        await loadRefs(['analytic_accounts']);
        $(`[data-k="${anField.k}"]`).outerHTML = fieldInput(anField, a.id, $(`[data-k="${anField.k}"]`).id);
        $(`[data-k="${anField.k}"]`).onchange = panel; toast('Analytic account created. Save the record to keep the link.', 'ok'); panel();
      };
      return;
    }
    const [r, items] = await Promise.all([api.get('reports/analytic?only_id=' + aid), api.get('reports/journal_items?analytic_account_id=' + aid)]);
    const a = r.rows[0] || { income: 0, expense: 0, net: 0 };
    box.innerHTML = `<div class="section-title">Accounting · ${esc(nm(S.analytic_accounts, aid))}</div>
      <div class="kpis"><div class="kpi"><div class="l">Income</div><div class="v">${money(a.income)}</div></div><div class="kpi"><div class="l">Costs</div><div class="v">${money(a.expense)}</div></div>
      <div class="kpi"><div class="l">Margin</div><div class="v" style="color:${a.net < 0 ? 'var(--danger)' : 'var(--success)'}">${money(a.net)}</div></div>${a.budget ? `<div class="kpi"><div class="l">Budget used</div><div class="v">${a.budget_used}%</div></div>` : ''}</div>
      <div style="display:flex;gap:8px;margin-bottom:10px"><a class="btn btn-sm" href="#/accounting/move/new?type=out_invoice">+ Invoice</a><a class="btn btn-sm" href="#/accounting/move/new?type=in_invoice">+ Bill</a><a class="btn btn-sm" href="#/accounting/report/general_ledger?analytic_account_id=${aid}&date_from=">Full ledger</a></div>
      ${items.length ? `<table class="list"><thead><tr><th>Date</th><th>Entry</th><th>Account</th><th>Partner</th><th>Label</th><th class="num">Debit</th><th class="num">Credit</th></tr></thead><tbody>
      ${items.slice(0, 50).map(l => `<tr class="click" onclick="location.hash='#/accounting/move/${l.move_id}'"><td>${fdate(l.date)}</td><td>${esc(l.move_name)}</td><td>${esc(l.account_code)} ${esc(l.account_name)}</td><td>${esc(l.partner_name || '')}</td><td>${esc(l.name || '')}</td><td class="num">${money(l.debit, { blankZero: 1 })}</td><td class="num">${money(l.credit, { blankZero: 1 })}</td></tr>`).join('')}</tbody></table>` : '<p class="muted">No journal items yet. Choose this analytic account on invoice, bill or journal entry lines.</p>'}`;
  };
  if (anField) { $(`[data-k="${anField.k}"]`).onchange = panel; panel(); }
  $('#save').onclick = async () => {
    const data = { ...rec.data, ...readFields($('.sheet'), F) };
    const r = rec.id ? await api.put('app_records/' + rec.id, { data }) : await api.post('app_records', { app_id: +id, data });
    toast('Saved', 'ok'); if (!rec.id) go(`#/app/${id}/${r.id}`); else customRecord(id, rec.id);
  };
  if ($('#del')) $('#del').onclick = async () => { if (await confirmBox('Delete this record?')) { await api.del('app_records/' + rec.id); go('#/app/' + id); } };
}

// ----------------------------------------------------------------- settings
async function settingsView() {
  setNav('Settings', [{ label: 'Settings', href: '#/settings' }]);
  await Promise.all([loadSettings(), loadRefs(['accounts'])]);
  const s = S.settings;
  view().innerHTML = cp([['Settings']], '<button class="btn btn-primary" id="save">Save</button>') + `<div class="sheet">
    <div class="section-title" style="margin-top:0">Company</div>
    <div class="fgrid"><div class="frow"><label>Company Name</label><input data-s="company_name" value="${esc(s.company_name || '')}"></div>
      <div class="frow"><label>Email</label><input data-s="company_email" value="${esc(s.company_email || '')}"></div>
      <div class="frow"><label>Address</label><input data-s="company_address" value="${esc(s.company_address || '')}"></div>
      <div class="frow"><label>Tax ID</label><input data-s="company_vat" value="${esc(s.company_vat || '')}"></div>
      <div class="frow"><label>Currency Symbol</label><input data-s="currency" value="${esc(s.currency || '')}" placeholder="$, €, SAR, AED…"></div></div>
    <div class="section-title">Accounting</div>
    <div class="fgrid"><div class="frow"><label>Default Receivable</label><select data-s="receivable_account_id">${accOpts(s.receivable_account_id, a => a.type === 'asset_receivable')}</select></div>
      <div class="frow"><label>Default Payable</label><select data-s="payable_account_id">${accOpts(s.payable_account_id, a => a.type === 'liability_payable')}</select></div>
      <div class="frow"><label>Lock Date</label><input type="date" data-s="lock_date" value="${esc(s.lock_date || '')}"></div>
      <div class="frow"><label></label><span class="muted small">No entry can be posted, reset or changed on or before the lock date.</span></div></div>
    <div class="section-title">Data</div>
    <p class="muted">Load a sample company (customers, vendors, projects, invoices, bills, payments, payroll) to explore the app. Only works while the database has no entries.</p>
    <button class="btn" id="demo">Load demo data</button>
    <p class="muted" style="margin-top:18px">Start from scratch: delete <b>all</b> data (invoices, contacts, apps…) and restore the default chart of accounts.</p>
    <button class="btn btn-danger" id="reset">Delete all data</button></div>`;
  $('#reset').onclick = () => modal('Delete all data', '<p>This permanently deletes everything. Type <b>DELETE</b> to confirm.</p><input id="rs-c">',
    [{ label: 'Delete everything', cls: 'btn-primary', click: async el => { await api.post('reset', { confirm: $('#rs-c', el).value }); await Promise.all([loadSettings(), loadRefs()]); toast('All data deleted', 'ok'); go('#/'); } }]);
  $('#save').onclick = async () => {
    const body = Object.fromEntries($$('[data-s]').map(i => [i.dataset.s, i.value]));
    await api.put('settings', body); await loadSettings(); toast('Settings saved', 'ok');
  };
  $('#demo').onclick = async () => { await api.post('demo'); await loadRefs(); toast('Demo data loaded', 'ok'); go('#/accounting/dashboard'); };
}

// ----------------------------------------------------------------- print
async function printMove(id) {
  setNav('Accounting', ACC_MENU);
  await loadRefs(['partners', 'taxes']);
  const m = await api.get('moves/' + id);
  const p = byId(S.partners, m.partner_id) || {};
  const s = S.settings;
  view().innerHTML = `<div class="no-print content" style="display:flex;gap:8px"><a class="btn" href="#/accounting/move/${id}">← Back</a><button class="btn btn-primary" onclick="window.print()">Print / Save as PDF</button></div>
  <div class="print-doc"><div class="hdr"><div><h2>${esc(s.company_name || '')}</h2><div class="muted">${esc(s.company_address || '')}<br>${esc(s.company_email || '')}${s.company_vat ? '<br>Tax ID: ' + esc(s.company_vat) : ''}</div></div>
    <div style="text-align:right"><b>${esc(p.name || '')}</b><div class="muted">${esc([p.street, p.city, p.country].filter(Boolean).join(', '))}${p.vat ? '<br>Tax ID: ' + esc(p.vat) : ''}</div></div></div>
    <h1>${TYPE_L[m.move_type]} ${esc(m.name || 'Draft')}</h1>
    <div style="display:flex;gap:40px;margin-top:12px"><div><div class="muted small">Date</div>${fdate(m.date)}</div><div><div class="muted small">Due Date</div>${fdate(m.invoice_date_due)}</div>${m.ref ? `<div><div class="muted small">Reference</div>${esc(m.ref)}</div>` : ''}</div>
    <table><thead><tr><th>Description</th><th class="num">Quantity</th><th class="num">Unit Price</th><th class="num">Disc.%</th><th>Tax</th><th class="num">Amount</th></tr></thead><tbody>
    ${m.invoice_lines.map(l => `<tr><td>${esc(l.name || '')}</td><td class="num">${esc(l.quantity)}</td><td class="num">${money(l.price_unit)}</td><td class="num">${l.discount ? esc(l.discount) : ''}</td><td>${esc(nm(S.taxes, l.tax_id))}</td><td class="num">${money(l.price_subtotal)}</td></tr>`).join('')}</tbody></table>
    <div class="totals"><table><tr><td>Untaxed Amount</td><td class="num">${money(m.amount_untaxed)}</td></tr><tr><td>Taxes</td><td class="num">${money(m.amount_tax)}</td></tr><tr class="grand"><td>Total</td><td class="num">${money(m.amount_total)}</td></tr>
    ${m.state === 'posted' ? `<tr><td>Amount Due</td><td class="num"><b>${money(m.amount_residual)}</b></td></tr>` : ''}</table></div>
    ${m.narration ? `<p style="margin-top:30px">${esc(m.narration)}</p>` : ''}
    <p class="muted small" style="margin-top:40px">Please use <b>${esc(m.name || '')}</b> as the payment reference.</p></div>`;
}

// ----------------------------------------------------------------- boot
(async function boot() {
  try { await Promise.all([loadSettings(), loadRefs()]); } catch (e) { view().innerHTML = '<div class="empty">Cannot reach the server.</div>'; return; }
  window.addEventListener('hashchange', route);
  route();
})();
