(() => {
  'use strict';

  const CFG = window.VAULT_CONFIG || {};
  const VAULT_ID = CFG.vaultId || 'four&4th';
  const sb = window.supabase.createClient(CFG.url, CFG.anonKey, {
    auth: { persistSession: true, autoRefreshToken: true }
  });

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmtTime = (iso) => {
    try {
      const d = new Date(iso);
      return d.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
    } catch { return ''; }
  };

  const state = {
    mode: 'password',
    unlocked: false,
    lines: [],
    revisions: [],
    annotations: [],
    lineById: new Map(),
    filterSpeaker: 'all',
    search: '',
    channel: null,
    dialogLine: null,
    dialogLang: '',
    member: localStorage.getItem('vaultMember') || ''
  };

  const gate = $('#gate');
  const app = $('#app');
  const gateForm = $('#gateForm');
  const gateCode = $('#gateCode');
  const gateLabel = $('#gateLabel');
  const gateError = $('#gateError');
  const unlockBtn = $('#unlockBtn');
  const lineList = $('#lineList');
  const memberInput = $('#memberName');

  memberInput.value = state.member;

  function setGateError(msg) {
    gateError.textContent = msg || '';
  }

  function setMode(mode) {
    state.mode = mode;
    $$('.mode').forEach(b => {
      const on = b.dataset.mode === mode;
      b.classList.toggle('on', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    const isKey = mode === 'api_key';
    gateLabel.textContent = isKey ? '宝库 API Key' : '宝库密码';
    gateCode.type = isKey ? 'text' : 'password';
    gateCode.inputMode = isKey ? 'text' : 'numeric';
    gateCode.placeholder = isKey ? 'xyv_four4th_...' : '输入 6 位密码';
    gateCode.value = '';
    setGateError('');
  }

  async function ensureAnonymousSession() {
    const got = await sb.auth.getSession();
    if (got?.data?.session) return true;
    const { error } = await sb.auth.signInAnonymously();
    if (error) {
      const msg = /anonymous/i.test(error.message || '')
        ? '宝库的匿名登录尚未开启，请联系管理员。'
        : '无法建立访客身份：' + error.message;
      setGateError(msg);
      return false;
    }
    return true;
  }

  async function hasAccess() {
    const { data, error } = await sb.from('vaults').select('id,title').eq('id', VAULT_ID).maybeSingle();
    if (error) return false;
    return !!data;
  }

  function showGate() {
    state.unlocked = false;
    gate.hidden = false;
    app.hidden = true;
  }

  async function showApp() {
    state.unlocked = true;
    gate.hidden = true;
    app.hidden = false;
    await loadAll();
    subscribe();
  }

  async function boot() {
    if (!CFG.url || !CFG.anonKey) {
      setGateError('vault/config.js 还没配置 Supabase。');
      return;
    }
    if (!(await ensureAnonymousSession())) return;
    if (await hasAccess()) {
      await showApp();
    } else {
      showGate();
    }
  }

  gateForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const code = gateCode.value.trim();
    if (!code) return;
    unlockBtn.disabled = true;
    setGateError('');
    try {
      if (!(await ensureAnonymousSession())) return;
      const { data, error } = await sb.rpc('unlock_vault', {
        p_vault_id: VAULT_ID,
        p_code: code,
        p_kind: state.mode
      });
      if (error) throw error;
      if (!data?.ok) {
        setGateError(data?.error === 'bad_code' ? '密码或 API Key 不对。' : '这个宝箱暂时打不开。');
        return;
      }
      await showApp();
    } catch (err) {
      setGateError('解锁失败：' + (err.message || err));
    } finally {
      unlockBtn.disabled = false;
    }
  });

  $$('.mode').forEach(b => b.addEventListener('click', () => setMode(b.dataset.mode)));
  $('#eyeBtn').addEventListener('click', () => {
    gateCode.type = gateCode.type === 'password' ? 'text' : 'password';
  });

  memberInput.addEventListener('input', () => {
    state.member = memberInput.value.trim();
    localStorage.setItem('vaultMember', state.member);
  });

  $('#lockBtn').addEventListener('click', async () => {
    try { await sb.auth.signOut(); } catch {}
    state.unlocked = false;
    if (state.channel) { try { sb.removeChannel(state.channel); } catch {} state.channel = null; }
    state.lines = []; state.revisions = []; state.annotations = []; state.lineById.clear();
    showGate();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  async function loadAll() {
    const { data: lines, error: e1 } = await sb.from('vault_lines')
      .select('id,line_no,chapter,speaker,speaker_name,en,zh')
      .eq('vault_id', VAULT_ID)
      .order('line_no', { ascending: true });
    if (e1) { lineList.innerHTML = '<div class="empty">读取台本失败：' + esc(e1.message) + '</div>'; return; }
    state.lines = lines || [];
    state.lineById = new Map(state.lines.map(l => [l.id, l]));
    const ids = state.lines.map(l => l.id);
    state.revisions = [];
    state.annotations = [];
    if (ids.length) {
      const [r1, r2] = await Promise.all([
        sb.from('line_revisions').select('*').in('line_id', ids).order('created_at', { ascending: true }),
        sb.from('line_annotations').select('*').in('line_id', ids).order('created_at', { ascending: true })
      ]);
      state.revisions = r1.data || [];
      state.annotations = r2.data || [];
    }
    const title = $('#vaultTitle');
    if (title && state.lines.length) title.textContent = 'A Guide to Chinese Culture and Etiquette';
    renderAll();
  }

  function revisionsFor(id) {
    return state.revisions.filter(r => r.line_id === id);
  }
  function annotationsFor(id) {
    return state.annotations.filter(a => a.line_id === id);
  }
  function lineColor(id) {
    const anns = annotationsFor(id);
    const hasRed = anns.some(a => a.color === 'red');
    const hasPurple = anns.some(a => a.color === 'purple');
    return { hasRed, hasPurple };
  }

  function matches(line) {
    if (state.filterSpeaker !== 'all' && line.speaker !== state.filterSpeaker) return false;
    const q = state.search.trim().toLowerCase();
    if (!q) return true;
    return [line.en, line.zh, line.chapter, line.speaker_name, line.speaker]
      .some(v => String(v || '').toLowerCase().includes(q));
  }

  function renderAll() {
    const visible = state.lines.filter(matches);
    if (!state.lines.length) {
      lineList.innerHTML = '<div class="empty">台本还没有内容。请确认数据库种子已执行。</div>';
      return;
    }
    if (!visible.length) {
      lineList.innerHTML = '<div class="empty">没有匹配的句子。</div>';
      return;
    }
    lineList.innerHTML = visible.map(renderLine).join('');
  }

  function renderLine(line) {
    const revs = revisionsFor(line.id);
    const anns = annotationsFor(line.id);
    const colors = lineColor(line.id);
    const classes = ['line', 'sp-' + (line.speaker || 'all').toLowerCase()];
    if (colors.hasRed) classes.push('hl-red');
    if (colors.hasPurple) classes.push('hl-purple');
    const revHtml = revs.length
      ? '<div class="rev-box">' + revs.map(r => `
        <div class="rev">
          <div class="rev-head"><span class="rev-lang">${r.lang === 'en' ? 'EN' : '中'}</span><span class="rev-author">${esc(r.author || '匿名')}</span><span>${fmtTime(r.created_at)}</span>${r.note ? `<span class="rev-note">${esc(r.note)}</span>` : ''}</div>
          <div class="rev-text">${esc(r.text)}</div>
        </div>`).join('') + '</div>'
      : '<div class="rev-box"><div class="rev-empty">还没有修订；原文保持不变。</div></div>';
    const annHtml = anns.length
      ? '<div class="ann-box">' + anns.map(a => `<div class="ann ${a.color}"><b>${esc(a.author || '匿名')}</b><span>${esc(a.note)}</span></div>`).join('') + '</div>'
      : '';
    return `<article class="${classes.join(' ')}" data-id="${line.id}" data-line="${line.line_no}">
      <div class="line-meta">
        <span class="line-no">#${String(line.line_no).padStart(2, '0')}</span>
        <span class="badge">${esc(line.speaker || '·')}</span>
        <span class="name">${esc(line.speaker_name || '')}</span>
      </div>
      <div class="line-body">
        <div class="chapter">${esc(line.chapter || '')}</div>
        <p class="say">${esc(line.en)}</p>
        <p class="zh">${esc(line.zh)}</p>
        <div class="line-actions">
          <button class="act" data-act="rev" data-lang="en" data-id="${line.id}">英文修订</button>
          <button class="act" data-act="rev" data-lang="zh" data-id="${line.id}">中文修订</button>
          <button class="act purple" data-act="ann" data-id="${line.id}" data-color="purple">紫色批注</button>
          <button class="act red" data-act="ann" data-id="${line.id}" data-color="red">红色批注</button>
        </div>
        ${revHtml}
        ${annHtml}
      </div>
    </article>`;
  }

  function author() {
    const name = (memberInput.value || '').trim();
    return name || '匿名';
  }

  function openRev(lineId, lang) {
    const line = state.lineById.get(lineId);
    if (!line) return;
    state.dialogLine = lineId;
    state.dialogLang = lang;
    $('#revTitle').textContent = lang === 'en' ? '英文修订' : '中文修订';
    $('#revSub').textContent = '原文保留不动；你的版本会作为独立修订显示在下方。';
    $('#revText').value = '';
    $('#revText').placeholder = lang === 'en' ? line.en : line.zh;
    $('#revNote').value = '';
    $('#revDialog').showModal();
    setTimeout(() => $('#revText').focus(), 30);
  }

  function openAnn(lineId, color) {
    const line = state.lineById.get(lineId);
    if (!line) return;
    state.dialogLine = lineId;
    $('#annSub').textContent = '给这一行加备注，并用红/紫荧光标出来。';
    $('#annText').value = '';
    $$('#annColors input').forEach(r => { r.checked = r.value === (color || 'purple'); });
    $('#annDialog').showModal();
    setTimeout(() => $('#annText').focus(), 30);
  }

  lineList.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const id = btn.dataset.id;
    if (btn.dataset.act === 'rev') openRev(id, btn.dataset.lang);
    if (btn.dataset.act === 'ann') openAnn(id, btn.dataset.color);
  });

  $('#revForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (e.submitter?.value === 'cancel') { $('#revDialog').close(); return; }
    const text = $('#revText').value.trim();
    if (!text) return;
    const btn = e.submitter;
    if (btn) btn.disabled = true;
    const { error } = await sb.from('line_revisions').insert({
      line_id: state.dialogLine,
      lang: state.dialogLang,
      text,
      note: $('#revNote').value.trim(),
      author: author()
    });
    if (btn) btn.disabled = false;
    if (error) { alert('修订提交失败：' + error.message); return; }
    $('#revDialog').close();
    await loadAll();
  });

  $('#annForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (e.submitter?.value === 'cancel') { $('#annDialog').close(); return; }
    const note = $('#annText').value.trim();
    if (!note) return;
    const color = ($('#annColors input:checked') || {}).value || 'purple';
    const btn = e.submitter;
    if (btn) btn.disabled = true;
    const { error } = await sb.from('line_annotations').insert({
      line_id: state.dialogLine,
      note,
      color,
      author: author()
    });
    if (btn) btn.disabled = false;
    if (error) { alert('批注提交失败：' + error.message); return; }
    $('#annDialog').close();
    await loadAll();
  });

  $$('.filter').forEach(b => b.addEventListener('click', () => {
    state.filterSpeaker = b.dataset.speaker;
    $$('.filter').forEach(x => x.classList.toggle('on', x === b));
    renderAll();
  }));

  $('#searchInput').addEventListener('input', (e) => {
    state.search = e.target.value;
    renderAll();
  });

  function subscribe() {
    if (state.channel) { try { sb.removeChannel(state.channel); } catch {} }
    const channel = sb.channel('vault-four4th-live')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'line_revisions' }, async (payload) => {
        if (!state.lineById.has(payload.new.line_id)) return;
        state.revisions.push(payload.new);
        renderAll();
        setSync('有人提交了修订 · 实时');
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'line_annotations' }, async (payload) => {
        if (!state.lineById.has(payload.new.line_id)) return;
        state.annotations.push(payload.new);
        renderAll();
        setSync('有人添加了批注 · 实时');
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'line_revisions' }, async () => {
        await loadAll();
        setSync('修订状态已更新 · 实时');
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') setSync('已连接 · 实时');
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') setSync('实时连接中断，刷新可恢复');
      });
    state.channel = channel;
  }

  function setSync(text) {
    const el = $('#syncState');
    if (el) el.textContent = text;
  }

  // 关闭 dialog 的取消按钮
  $$('.dialog .ghost').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      btn.closest('dialog')?.close();
    });
  });

  boot().catch(err => {
    setGateError('初始化失败：' + (err.message || err));
  });
})();
