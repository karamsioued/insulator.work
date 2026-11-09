/* Live cloud sync (Supabase).
   Every device keeps a local copy (works offline) and pushes/pulls changes to one shared table, live.
   Data is only readable by devices linked with the workshop password (Row Level Security: authenticated only).
   Turned on by config.js — without it the app stays local-only exactly as before. */
window.cloud = (() => {
  const CFG = window.INS_CLOUD || {};
  if (!CFG.url || !CFG.key || !window.supabase || new URLSearchParams(location.search).has('demo')) return null; // presentation link stays offline
  const ARR = { job: 'jobs', task: 'tasks', worker: 'workers', user: 'users', film: 'films' };
  const SYNC_KEY = 'ins_synced_v1';
  const sb = window.supabase.createClient(CFG.url, CFG.key, { auth: { persistSession: true, autoRefreshToken: true, storageKey: 'ins_sb_auth' } });
  let linked = false, ready = false, pushing = false, again = false, timer = null, deferred = false, status = 'off';

  // stable JSON (Postgres jsonb reorders keys, so compare with sorted keys) + small hash to remember what the server has
  const canon = v => v === null || typeof v !== 'object' ? JSON.stringify(v) : Array.isArray(v) ? '[' + v.map(canon).join(',') + ']' : '{' + Object.keys(v).filter(k => v[k] !== undefined).sort().map(k => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}';
  const hash = s => { let h = 5381; for (let i = 0; i < s.length; i++) h = (h * 33 ^ s.charCodeAt(i)) >>> 0; return h.toString(36) + s.length.toString(36); };
  const meta = s => ({ settings: s.settings, rosterV: s.rosterV, demo: !!s.demo, v: s.v || 1, mig: s.mig || {} });
  function records(s) { // key → {kind,id,data,pos}
    const m = new Map();
    for (const k in ARR) (s[ARR[k]] || []).forEach((r, i) => m.set(k + ':' + r.id, { kind: k, id: r.id, data: r, pos: i }));
    m.set('meta:main', { kind: 'meta', id: 'main', data: meta(s), pos: 0 });
    return m;
  }
  let everSynced = localStorage.getItem(SYNC_KEY) !== null; // a brand-new device takes the shared data as it is
  let synced = new Map(); try { synced = new Map(Object.entries(JSON.parse(localStorage.getItem(SYNC_KEY)) || {})); } catch { }
  const saveSynced = () => { everSynced = true; try { localStorage.setItem(SYNC_KEY, JSON.stringify(Object.fromEntries(synced))); } catch { } };
  const saveLocal = () => { try { localStorage.setItem(STORE_KEY, JSON.stringify(S)); } catch { } };

  function setStatus(s) { status = s; const el = document.getElementById('sync-dot'); if (!el) return; el.className = 'sync-dot ' + s; el.title = { ok: LANG === 'ar' ? 'متصل — البيانات محدّثة' : 'Online — up to date', busy: LANG === 'ar' ? 'جارٍ المزامنة…' : 'Syncing…', off: LANG === 'ar' ? 'غير متصل — يُحفظ على الجهاز ويُرفع عند عودة الاتصال' : 'Offline — saved on this device, uploads when back online' }[s]; el.textContent = { ok: LANG === 'ar' ? 'متصل' : 'Live', busy: '…', off: LANG === 'ar' ? 'غير متصل' : 'Offline' }[s]; }

  // what this device changed and the server hasn't got yet
  function pending() {
    const now = records(S), ups = [], dels = [];
    now.forEach((r, key) => { if (synced.get(key) !== hash(canon(r.data))) ups.push(r); });
    synced.forEach((_, key) => { if (!now.has(key)) dels.push(key); });
    return { ups, dels };
  }
  async function push() {
    if (!ready) return;
    if (pushing) { again = true; return; }
    pushing = true;
    try {
      const { ups, dels } = pending();
      if (ups.length || dels.length) setStatus('busy');
      for (let i = 0; i < ups.length; i += 400) {
        const chunk = ups.slice(i, i + 400);
        const { error } = await sb.from('records').upsert(chunk.map(r => ({ kind: r.kind, id: r.id, data: r.data, pos: r.pos, updated_at: new Date().toISOString() })));
        if (error) throw error;
        chunk.forEach(r => synced.set(r.kind + ':' + r.id, hash(canon(r.data))));
      }
      const byKind = {}; dels.forEach(key => { const i = key.indexOf(':'); (byKind[key.slice(0, i)] = byKind[key.slice(0, i)] || []).push(key.slice(i + 1)); });
      for (const kind in byKind) for (let i = 0; i < byKind[kind].length; i += 200) {
        const ids = byKind[kind].slice(i, i + 200);
        const { error } = await sb.from('records').delete().eq('kind', kind).in('id', ids);
        if (error) throw error;
        ids.forEach(id => synced.delete(kind + ':' + id));
      }
      saveSynced(); setStatus('ok');
    } catch (e) { console.warn('sync push failed', e); setStatus('off'); clearTimeout(timer); timer = setTimeout(push, 8000); }
    pushing = false;
    if (again) { again = false; push(); }
  }
  function queue() { if (!ready) return; clearTimeout(timer); timer = setTimeout(push, 250); }

  // rebuild S from server rows, then lay this device's unsent changes on top
  function build(rows) {
    const { ups, dels } = everSynced ? pending() : { ups: [], dels: [] };
    const s = { v: 1, jobs: [], tasks: [], workers: [], users: [], films: [], settings: S.settings, rosterV: S.rosterV, demo: false };
    const pos = {};
    rows.forEach(r => { if (r.kind === 'meta') Object.assign(s, r.data); else if (ARR[r.kind]) { s[ARR[r.kind]].push(r.data); pos[r.kind + ':' + r.id] = r.pos; } });
    for (const k in ARR) s[ARR[k]].sort((a, b) => (pos[k + ':' + a.id] || 0) - (pos[k + ':' + b.id] || 0));
    synced = new Map(rows.map(r => [r.kind + ':' + r.id, hash(canon(r.data))]));
    ups.forEach(r => { if (r.kind === 'meta') Object.assign(s, r.data); else { const a = s[ARR[r.kind]], i = a.findIndex(x => x.id === r.id); if (i >= 0) a[i] = r.data; else a.push(r.data); } });
    dels.forEach(key => { const i = key.indexOf(':'), k = key.slice(0, i), id = key.slice(i + 1); if (ARR[k]) s[ARR[k]] = s[ARR[k]].filter(x => x.id !== id); });
    if (!s.users.length) s.users = S.users; // never lock everyone out
    S = s; everSynced = true; saveLocal(); saveSynced();
  }
  async function pull() {
    setStatus('busy');
    const rows = []; let from = 0;
    for (; ;) {
      const { data, error } = await sb.from('records').select('kind,id,data,pos').range(from, from + 999);
      if (error) throw error;
      rows.push(...data); if (data.length < 1000) break; from += 1000;
    }
    if (!rows.length) { synced = new Map(); await push(); return false; } // empty cloud: this device's data becomes the shared copy
    const before = hash(canon(S)); build(rows); await push(); setStatus('ok');
    return hash(canon(S)) !== before; // redraw only when something actually changed
  }

  // a change made on another device
  function onChange(p) {
    const row = p.eventType === 'DELETE' ? p.old : p.new; if (!row || !row.kind) return;
    const key = row.kind + ':' + row.id;
    if (p.eventType === 'DELETE') {
      if (!synced.has(key)) return;
      synced.delete(key); if (ARR[row.kind]) S[ARR[row.kind]] = S[ARR[row.kind]].filter(x => x.id !== row.id);
    } else {
      const h = hash(canon(row.data)); if (synced.get(key) === h) return; // our own echo
      synced.set(key, h);
      if (row.kind === 'meta') Object.assign(S, row.data);
      else if (ARR[row.kind]) { const a = S[ARR[row.kind]], i = a.findIndex(x => x.id === row.id); if (i >= 0) a[i] = row.data; else a.push(row.data); }
    }
    clearTimeout(liveT); liveT = setTimeout(() => { saveLocal(); saveSynced(); redraw(); }, 150); // a car with 15 parts arrives as 16 rows: draw once
  }
  let liveT = null;
  // don't yank the screen while someone is typing or has a form open
  const busyUI = () => !!document.querySelector('.sheet') || (typeof route === 'function' && route().name === 'new') || /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || '');
  function redraw() { if (busyUI()) { deferred = true; return; } deferred = false; if (typeof refresh === 'function' && me()) refresh(); else render(); }
  setInterval(() => { if (deferred && !busyUI()) redraw(); }, 1500);

  async function connect() {
    linked = true; ready = true;
    try { await pull(); } catch (e) { console.warn('sync pull failed', e); setStatus('off'); }
    render();
    sb.channel('records-live').on('postgres_changes', { event: '*', schema: 'public', table: 'records' }, onChange)
      .subscribe(st => { if (st === 'SUBSCRIBED') setStatus('ok'); else if (st === 'CHANNEL_ERROR' || st === 'TIMED_OUT' || st === 'CLOSED') setStatus('off'); });
    // phones sleep and drop the live connection: catch up when the app comes back
    const catchUp = () => { if (document.visibilityState === 'visible') pull().then(ch => ch && redraw()).catch(() => setStatus('off')); };
    document.addEventListener('visibilitychange', catchUp);
    window.addEventListener('online', catchUp);
    setInterval(() => { if (document.visibilityState === 'visible') pull().then(ch => ch && redraw()).catch(() => setStatus('off')); }, 60000);
  }
  async function start() {
    const { data } = await sb.auth.getSession();
    if (data && data.session) { linked = true; render(); connect(); } // show the local copy at once, then update
    else render();
  }
  async function link(password) {
    const { error } = await sb.auth.signInWithPassword({ email: CFG.email, password });
    if (error) return false;
    await connect(); return true;
  }
  async function unlink() { await sb.auth.signOut(); linked = false; ready = false; render(); }

  function renderLink() {
    const ar = LANG === 'ar';
    root().innerHTML = `<button class="btn sm lang-btn" data-act="lang">${ar ? 'English' : 'العربية'}</button>
    <div class="login"><div class="login-box solo"><img class="login-logo" src="logo.png" alt="Insulator">
      <form class="login-panel card" data-form="cloud-link" style="text-align:center">
        <h2 style="margin:0 0 6px">${ar ? 'ربط هذا الجهاز بالورشة' : 'Link this device to the workshop'}</h2>
        <p class="muted" style="margin:0 0 14px;font-size:13px">${ar ? 'مرة واحدة فقط لكل جهاز. اطلب كلمة سر الورشة من المالك.' : 'Only once per device. Ask the owner for the workshop password.'}</p>
        <input class="inp" type="password" name="pw" autocomplete="current-password" placeholder="${ar ? 'كلمة سر الورشة' : 'Workshop password'}" required dir="ltr" style="text-align:center">
        <button class="btn y lg" style="width:100%;margin-top:12px">${ar ? 'ربط الجهاز' : 'Link device'}</button>
      </form></div></div>`;
  }
  return { start, queue, link, unlink, renderLink, get linked() { return linked; }, get status() { return status; } };
})();
