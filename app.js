(() => {
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmtBytes = (n) => {
    n = Number(n) || 0;
    if (!n) return '待发布';
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
    return (n / 1024 / 1024).toFixed(1) + ' MB';
  };
  async function getJson(url, fallback) {
    try { const r = await fetch(url, {cache:'no-store'}); if (r.ok) return await r.json(); } catch {}
    return fallback;
  }
  async function boot() {
    const [plugin, versions, patches, site] = await Promise.all([
      getJson('data/pet-extension/plugin.json', {name:'小鸦的桌宠扩展插件',version:'1.0.0',summary:'',features:[],downloads:{}}),
      getJson('data/pet-extension/versions.json', {current:'1.0.0',items:[]}),
      getJson('data/pet-extension/patches.json', {items:[]}),
      getJson('data/site.json', {})
    ]);
    $('#pluginName').textContent = plugin.name || '小鸦的桌宠扩展插件';
    $('#pluginVersion').textContent = plugin.version || versions.current || '1.0.0';
    $('#pluginSummary').textContent = plugin.summary || '';
    $('#pluginState').textContent = (plugin.channel === 'beta' ? '测试通道' : '可下载');
    const grid = $('#featureGrid');
    grid.innerHTML = (plugin.features || []).map((f, i) => '<div class="feature"><b>' + String(i + 1).padStart(2,'0') + ' / FEATURE</b>' + esc(f) + '</div>').join('');
    if (plugin.downloads?.lite) $('#downloadLite').href = plugin.downloads.lite;
    if (plugin.downloads?.full) $('#downloadFull').href = plugin.downloads.full; else $('#downloadFull').style.display = 'none';
    $('#pluginMeta').innerHTML = [
      '版本：' + esc(plugin.version || versions.current),
      '更新：' + esc(plugin.updatedAt || ''),
      '许可：' + esc(plugin.license || ''),
      '运行：' + esc((plugin.requires || []).join(' / '))
    ].map((x) => '<span>' + x + '</span>').join('');

    const tl = $('#versionTimeline');
    tl.innerHTML = (versions.items || []).map((v) => {
      const dl = v.download?.lite ? '<a class="jelly ghost" style="padding:7px 12px;font-size:11px;margin-top:10px" href="' + esc(v.download.lite) + '">下载 v' + esc(v.version) + '</a>' : '';
      return '<div class="v-item reveal"><div class="v-card"><div class="v-head"><h3>v' + esc(v.version) + ' · ' + esc(v.title || '更新') + '</h3><span class="v-date">' + esc(v.date || '') + '</span><span class="v-type">' + esc(v.type || 'release') + '</span></div>'
        + '<p>' + esc(v.summary || '') + '</p>'
        + ((v.changes || []).length ? '<ul class="v-changes">' + v.changes.map((c) => '<li>' + esc(c) + '</li>').join('') + '</ul>' : '')
        + dl + '</div></div>';
    }).join('') || '<div class="glass">还没有版本记录。</div>';

    const list = $('#patchList');
    list.innerHTML = (patches.items || []).map((p) => '<div class="patch-row reveal"><span class="patch-id">v' + esc(p.version) + '</span><div class="patch-main"><strong>' + esc(p.title || '补丁') + '</strong><span>' + esc(p.notes || '') + ' · ' + esc(p.date || '') + '</span></div><span class="patch-size">' + fmtBytes(p.sizeBytes) + '</span><a class="patch-dl" href="' + esc(p.download || '#') + '">下载补丁</a></div>').join('') || '<div class="glass">暂无补丁。</div>';
    document.title = (site.name || '小鸦的制品') + ' · ' + (site.subtitle || '鸦巢');
    observeReveal();
  }

  // 柔和星野
  const canvas = document.getElementById('stars');
  if (canvas) {
    const ctx = canvas.getContext('2d');
    let stars = [], w = 0, h = 0;
    function resize() {
      w = canvas.width = innerWidth * devicePixelRatio;
      h = canvas.height = innerHeight * devicePixelRatio;
      canvas.style.width = innerWidth + 'px'; canvas.style.height = innerHeight + 'px';
      const n = Math.min(180, Math.round(innerWidth * innerHeight / 9000));
      stars = Array.from({length:n}, () => ({x:Math.random()*w,y:Math.random()*h,r:Math.random()*1.5+.2,a:Math.random()*.6+.15,v:Math.random()*.15+.02}));
    }
    function draw() {
      ctx.clearRect(0,0,w,h);
      for (const s of stars) {
        s.y += s.v; if (s.y > h) { s.y = 0; s.x = Math.random()*w; }
        ctx.beginPath(); ctx.arc(s.x,s.y,s.r,0,Math.PI*2);
        ctx.fillStyle = 'rgba(190,240,255,' + s.a + ')'; ctx.fill();
      }
      requestAnimationFrame(draw);
    }
    addEventListener('resize', resize); resize(); draw();
  }

  function observeReveal() {
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
    }, {threshold:.12});
    document.querySelectorAll('.reveal').forEach((e) => io.observe(e));
  }

  // 果冻倾斜
  document.querySelectorAll('.jelly-card,.feature,.v-card,.patch-row').forEach((card) => {
    card.addEventListener('pointermove', (e) => {
      if (matchMedia('(pointer: coarse)').matches) return;
      const r = card.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - .5;
      const y = (e.clientY - r.top) / r.height - .5;
      card.style.transform = 'perspective(900px) rotateX(' + (-y * 2.2) + 'deg) rotateY(' + (x * 2.2) + 'deg) translateY(-2px)';
    });
    card.addEventListener('pointerleave', () => { card.style.transform = ''; });
  });

  boot();
})();
