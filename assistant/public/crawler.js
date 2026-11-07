/**
 * 把 App 爬成一張圖（recursive get）→ assistant/public/data/sitemap.json
 *
 * 用法：在瀏覽器開 http://localhost:5180/assistant/（同源才能讀 iframe 的 DOM），
 * 在 console 貼上這整個檔案，然後：
 *   await __crawl.scan('/');  await __crawl.scan('/citizen-report'); ...   // 一頁一頁爬
 *   __crawl.dump()                                                         // 複製 JSON 存成 sitemap.json
 * 每頁：列出看得到的可互動元素（連結、按鈕、下拉選項、label、欄位）、穩定選擇器，
 * 按鈕會真的點一下看跳去哪（leads_to），同頁展開的東西記成 requires_click。
 */
window.__crawl = {
  pages: JSON.parse(sessionStorage.getItem('tp_crawl') || '{}'),
  save() { sessionStorage.setItem('tp_crawl', JSON.stringify(this.pages)); },
  sleep(ms) { return new Promise((r) => setTimeout(r, ms)); },
  async load(url) {
    const f = document.createElement('iframe');
    f.style.cssText = 'position:fixed;left:0;top:0;width:412px;height:900px;opacity:0.01;pointer-events:none';
    f.src = location.origin + url;
    document.body.appendChild(f);
    await new Promise((res) => { f.onload = res; setTimeout(res, 4000); });
    await this.sleep(2200);
    return f;
  },
  sel(el) {
    if (el.id) return '#' + CSS.escape(el.id);
    const parts = [];
    let e = el;
    for (let i = 0; i < 4 && e && e.tagName !== 'BODY'; i++) {
      let s = e.tagName.toLowerCase();
      if (e.id) { parts.unshift('#' + CSS.escape(e.id)); break; }
      const p = e.parentElement;
      if (p) { const same = [...p.children].filter((c) => c.tagName === e.tagName); if (same.length > 1) s += `:nth-of-type(${same.indexOf(e) + 1})`; }
      parts.unshift(s);
      e = p;
    }
    return parts.join('>');
  },
  vis(el) {
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    let p = el.parentElement;
    while (p && p.tagName !== 'BODY') {
      const cs = getComputedStyle(p);
      if (/hidden|clip/.test(cs.overflow + cs.overflowY)) { const pr = p.getBoundingClientRect(); if (pr.height < 2) return false; }
      p = p.parentElement;
    }
    return true;
  },
  list(d) {
    const out = [];
    const seen = new Set();
    const push = (el, label, kind, extra) => {
      label = (label || '').replace(/\s+/g, ' ').trim().slice(0, 40);
      if (!label || seen.has(el) || !this.vis(el)) return;
      seen.add(el);
      out.push({ label, kind, css: this.sel(el), ...extra });
    };
    for (const a of d.querySelectorAll('a[href]')) push(a, a.textContent || a.getAttribute('aria-label'), 'link', { leads_to: a.getAttribute('href') });
    for (const b of d.querySelectorAll('button,[role=button],[role=tab],.tab-label')) push(b, b.textContent || b.getAttribute('aria-label'), 'button', {});
    for (const s of d.querySelectorAll('select')) for (const o of s.options) { if (o.value === '') continue; out.push({ label: o.text.trim().slice(0, 40), kind: 'option', css: this.sel(s), value: o.value }); }
    for (const l of d.querySelectorAll('label')) push(l, l.textContent, 'label', {});
    for (const i of d.querySelectorAll('input:not([type=radio]):not([type=checkbox]):not([type=hidden]),textarea')) {
      const lab = i.id ? (d.querySelector(`label[for="${i.id}"]`) || {}).textContent : '';
      push(i, lab || i.getAttribute('placeholder') || i.getAttribute('aria-label') || '', 'field', { placeholder: i.getAttribute('placeholder') || '' });
    }
    return out;
  },
  async scan(url, budgetMs = 34000) {
    const t0 = Date.now();
    let f = await this.load(url);
    const d = f.contentDocument;
    const page = this.pages[url] || { title: d.title, elements: this.list(d), done: 0 };
    if (!page.elements.length) page.elements = this.list(d);
    this.pages[url] = page;
    const key = (e) => e.kind + '|' + e.css + '|' + e.label + '|' + (e.value || '');
    for (let i = page.done; i < page.elements.length; i++) {
      const e = page.elements[i];
      if (e.kind !== 'button' || e.requires_click) { page.done = i + 1; continue; }
      if (Date.now() - t0 > budgetMs) { this.save(); f.remove(); return { url, partial: true, done: i, total: page.elements.length }; }
      const el = f.contentDocument.querySelector(e.css);
      const before = f.contentWindow.location.pathname + f.contentWindow.location.search;
      if (el) {
        const known = new Set(page.elements.map(key));
        el.click();
        await this.sleep(900);
        const after = f.contentWindow.location.pathname + f.contentWindow.location.search;
        if (after !== before) { e.leads_to = after; f.remove(); f = await this.load(url); }
        else {
          e.effect = 'same_page';
          const revealed = this.list(f.contentDocument).filter((x) => !known.has(key(x)));
          if (revealed.length) { e.reveals = revealed.length; for (const r of revealed) { r.requires_click = e.css; r.requires_label = e.label; page.elements.push(r); } f.remove(); f = await this.load(url); }
        }
      }
      page.done = i + 1;
    }
    this.save(); f.remove();
    return { url, partial: false, total: page.elements.length, links: page.elements.filter((x) => x.leads_to).length, revealed: page.elements.filter((x) => x.requires_click).length };
  },
  next() {
    const seen = new Set(Object.keys(this.pages));
    for (const p of Object.values(this.pages)) for (const e of p.elements) if (e.leads_to && e.leads_to.startsWith('/') && !seen.has(e.leads_to) && !/\/(form|detail|result|payment|record|history|search-detail|book-detail|notice-detail|ticket-detail|coupon-detail|hotspot|buy-ticket|item-detail|exchange)\/[^/]+/.test(e.leads_to)) return e.leads_to;
    return null;
  },
  dump() { const P = JSON.parse(JSON.stringify(this.pages)); for (const p of Object.values(P)) delete p.done; return JSON.stringify({ version: 1, crawled_at: new Date().toISOString(), pages: P }); }
};
