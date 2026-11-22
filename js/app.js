// ===== Data & storage =====
const BANK = window.UP_PGT_2026.map(q => ({ ...q, id: "uppgt26-" + q.n }));
const TOPICS = [...new Set(BANK.map(q => q.t))];
const LETTERS = ["A", "B", "C", "D"];

const EXAMS = [
  { id: "uppgt26", title: "UP PGT 2026 हिंदी (10 मई, शिफ्ट 2)", desc: "पूर्ण प्रश्न-पत्र — 125 प्रश्न", mins: 120, pick: () => BANK },
  { id: "mock30", title: "त्वरित मॉक टेस्ट", desc: "प्रश्न-बैंक से 30 यादृच्छिक प्रश्न", mins: 30, pick: () => shuffle(BANK).slice(0, 30) },
  ...TOPICS.map(t => ({ id: "topic:" + t, title: t + " — अभ्यास", desc: "विषयवार प्रश्न", topic: t, mins: 0, pick: () => BANK.filter(q => q.t === t) })),
];

// ===== Server API =====
let user = null;                                   // {username, name, created, results}
const me = () => user;
async function api(url, method = "GET", body) {
  const r = await fetch(url, { method, headers: { "content-type": "application/json" }, credentials: "same-origin", body: body && JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || "सर्वर से संपर्क नहीं हो पाया");
  return j;
}

function shuffle(a) { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.random() * (i + 1) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; }
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const $ = id => document.getElementById(id);
const app = $("app");
const fmtDate = t => new Date(t).toLocaleString("hi-IN", { dateStyle: "medium", timeStyle: "short" });
const pct = (a, b) => b ? Math.round(a * 100 / b) : 0;

// ===== Router =====
let session = null, timerId = null;
function go(view, arg) {
  if (session && view !== "exam" && !confirm("परीक्षा चल रही है। क्या आप बीच में छोड़ना चाहते हैं?")) return;
  if (view !== "exam") { session = null; clearInterval(timerId); }
  if (!user && view !== "login") view = "login";
  $("nav").style.display = user ? "" : "none";
  ({ login, home, exams, prep, profile, exam: renderExam, result })[view](arg);
  window.scrollTo(0, 0);
}

// ===== Login / profile select =====
let authMode = "login";
function login() {
  const reg = authMode === "register";
  app.innerHTML = `<div class="card" style="max-width:440px;margin:30px auto">
    <h2>${reg ? "नया खाता बनाएँ" : "स्वागत है 🙏"}</h2>
    <p class="mute">${reg ? "यूज़रनेम और पासवर्ड बनाएँ। इन्हीं से आप कभी भी, किसी भी फ़ोन/कंप्यूटर से लॉगिन करके अपनी प्रगति देख सकेंगे।" : "अपने यूज़रनेम और पासवर्ड से लॉगिन करें।"}</p>
    <form id="authForm">
      ${reg ? `<label class="mute">आपका नाम</label><input id="fName" maxlength="40" placeholder="जैसे: Ram Singh" autocomplete="name">` : ""}
      <label class="mute">यूज़रनेम (अंग्रेज़ी में)</label><input id="fUser" maxlength="30" autocapitalize="none" autocomplete="username" placeholder="जैसे: ramsingh">
      <label class="mute">पासवर्ड</label><input id="fPass" type="password" autocomplete="${reg ? "new-password" : "current-password"}" placeholder="कम से कम 6 अक्षर">
      <p id="authErr" style="color:var(--bad);font-weight:600;min-height:1em;margin:8px 0"></p>
      <button class="btn" style="width:100%">${reg ? "खाता बनाएँ" : "लॉगिन करें"}</button>
    </form>
    <p class="mute" style="text-align:center;margin-top:16px">${reg ? "पहले से खाता है?" : "नए हैं?"}
      <a href="#" onclick="authMode='${reg ? "login" : "register"}';login();return false">${reg ? "लॉगिन करें" : "नया खाता बनाएँ"}</a></p>
  </div>`;
  $("authForm").addEventListener("submit", doAuth);
  (reg ? $("fName") : $("fUser")).focus();
}
async function doAuth(e) {
  e.preventDefault();
  const reg = authMode === "register";
  const body = { username: $("fUser").value.trim(), password: $("fPass").value, name: reg ? $("fName").value.trim() : undefined };
  if (!body.username || !body.password) return ($("authErr").textContent = "यूज़रनेम और पासवर्ड दोनों भरें");
  try { user = await api(reg ? "/api/register" : "/api/login", "POST", body); go("home"); }
  catch (err) { $("authErr").textContent = err.message; }
}

// ===== Stats helpers =====
function topicStats(results) {
  const s = {};
  for (const r of results) for (const d of r.details) {
    s[d.t] ??= { c: 0, n: 0 }; s[d.t].n++; if (d.ok) s[d.t].c++;
  }
  return s;
}
function wrongIds(results) {
  const last = {};
  for (const r of results) for (const d of r.details) last[d.id] = d.ok;   // latest attempt wins
  return Object.keys(last).filter(id => !last[id]);
}

// ===== Home =====
function home() {
  const u = me(), R = u.results;
  const best = R.length ? Math.max(...R.map(r => r.pct)) : 0;
  const avg = R.length ? Math.round(R.reduce((a, r) => a + r.pct, 0) / R.length) : 0;
  const ts = topicStats(R);
  const weak = Object.entries(ts).filter(([, v]) => v.n >= 3).sort((a, b) => a[1].c / a[1].n - b[1].c / b[1].n).slice(0, 3);
  const wrong = wrongIds(R).length;
  app.innerHTML = `
  <div class="card"><h2>नमस्ते, ${esc(u.name)} जी</h2><p class="mute">आज की तैयारी जारी रखें।</p>
    <div class="grid">
      <div><div class="stat">${R.length}</div><div class="mute">दी गई परीक्षाएँ</div></div>
      <div><div class="stat">${avg}%</div><div class="mute">औसत अंक</div></div>
      <div><div class="stat">${best}%</div><div class="mute">सर्वश्रेष्ठ</div></div>
      <div><div class="stat">${BANK.length}</div><div class="mute">प्रश्न-बैंक</div></div>
    </div></div>
  <div class="grid">
    <div class="card"><h3>📝 पूर्ण प्रश्न-पत्र</h3><p class="mute">UP PGT 2026 हिंदी — 125 प्रश्न, 120 मिनट</p><button class="btn" onclick="startExam('uppgt26')">परीक्षा शुरू करें</button></div>
    <div class="card"><h3>⚡ त्वरित मॉक</h3><p class="mute">30 यादृच्छिक प्रश्न, 30 मिनट</p><button class="btn" onclick="startExam('mock30')">शुरू करें</button></div>
    <div class="card"><h3>🔁 गलतियाँ दोहराएँ</h3><p class="mute">${wrong} प्रश्न जो पिछली बार गलत हुए</p><button class="btn sec" ${wrong ? "" : "disabled"} onclick="startExam('wrong')">अभ्यास करें</button></div>
  </div>
  ${weak.length ? `<div class="card"><h3>🎯 कमज़ोर विषय</h3>${weak.map(([t, v]) => `<p>${t} — ${pct(v.c, v.n)}% <button class="btn sec" style="padding:4px 12px;margin-left:8px" onclick="go('prep','${t}')">नोट्स पढ़ें</button></p>`).join("")}</div>` : ""}`;
}

// ===== Exams list =====
function exams() {
  const R = me().results;
  const card = e => {
    const tries = R.filter(r => r.examId === e.id);
    const best = tries.length ? Math.max(...tries.map(r => r.pct)) + "%" : "—";
    const n = e.id === "mock30" ? 30 : e.pick().length;
    return `<div class="card"><h3>${esc(e.title)}</h3><p class="mute">${e.desc} · ${n} प्रश्न · ${e.mins ? e.mins + " मिनट" : "समय सीमा नहीं (तुरंत उत्तर दिखेगा)"}</p>
      <p class="mute">प्रयास: ${tries.length} · सर्वश्रेष्ठ: ${best}</p><button class="btn" onclick="startExam('${e.id}')">शुरू करें</button></div>`;
  };
  app.innerHTML = `<h2>पूर्ण परीक्षाएँ</h2><div class="grid">${EXAMS.slice(0, 2).map(card).join("")}</div>
    <h2>विषयवार अभ्यास</h2><div class="grid">${EXAMS.slice(2).map(card).join("")}</div>`;
}

// ===== Exam engine =====
function startExam(id) {
  let e = EXAMS.find(x => x.id === id);
  if (id === "wrong") {
    const ids = new Set(wrongIds(me().results));
    e = { id: "wrong", title: "गलतियाँ दोहराएँ", mins: 0, practice: true, pick: () => BANK.filter(q => ids.has(q.id)) };
  }
  const qs = e.pick();
  if (!qs.length) return alert("कोई प्रश्न नहीं");
  session = { exam: e, qs, ans: Array(qs.length).fill(null), mark: Array(qs.length).fill(false), i: 0,
              practice: e.practice || !e.mins, start: Date.now(), end: e.mins ? Date.now() + e.mins * 60000 : null };
  if (session.end) { clearInterval(timerId); timerId = setInterval(tick, 1000); }
  go("exam");
}
function tick() {
  if (!session) return clearInterval(timerId);
  const left = Math.max(0, session.end - Date.now());
  const el = $("timer");
  if (el) { const m = Math.floor(left / 60000), s = Math.floor(left / 1000) % 60; el.textContent = `${m}:${String(s).padStart(2, "0")}`; el.classList.toggle("low", left < 300000); }
  if (!left) { alert("समय समाप्त! परीक्षा जमा की जा रही है।"); submit(true); }
}
function renderExam() {
  const S = session, q = S.qs[S.i], a = S.ans[S.i];
  const shown = S.practice && a !== null;
  const done = S.ans.filter(x => x !== null).length;
  app.innerHTML = `
  <div class="card exam-head"><div><b>${esc(S.exam.title)}</b><div class="mute">उत्तरित: ${done}/${S.qs.length}</div></div>
    ${S.end ? `<div class="timer" id="timer">--:--</div>` : `<span class="tag">अभ्यास मोड</span>`}</div>
  <div class="layout">
    <div class="card">
      <div><span class="tag">प्रश्न ${S.i + 1}/${S.qs.length}</span><span class="tag">${q.t}</span><span class="mute">मूल प्र.सं. ${q.n}</span></div>
      <div class="qtext">${esc(q.q)}</div>
      ${q.o.map((o, k) => {
        let c = a === k ? "sel" : "";
        if (shown) c = k === q.a ? "right" : (a === k ? "wrong" : "");
        return `<button class="opt ${c}" ${shown ? "disabled" : ""} onclick="pick(${k})"><b>(${LETTERS[k]})</b>${esc(o)}</button>`;
      }).join("")}
      ${shown ? `<p style="font-weight:600;color:${a === q.a ? "var(--ok)" : "var(--bad)"}">${a === q.a ? "✔ सही उत्तर!" : "✘ गलत। सही उत्तर: (" + LETTERS[q.a] + ") " + esc(q.o[q.a])}</p>` : ""}
      <div class="row">
        <button class="btn ghost" ${S.i ? "" : "disabled"} onclick="nav(-1)">← पिछला</button>
        ${S.practice ? "" : `<button class="btn ghost" onclick="clearAns()">उत्तर हटाएँ</button><button class="btn ghost" onclick="toggleMark()">${S.mark[S.i] ? "समीक्षा हटाएँ" : "समीक्षा हेतु चिह्नित"}</button>`}
        <button class="btn" ${S.i < S.qs.length - 1 ? "" : "disabled"} onclick="nav(1)">अगला →</button>
      </div>
    </div>
    <div class="card"><h3>प्रश्न सूची</h3>
      <div class="palette">${S.qs.map((_, k) => `<button class="${S.ans[k] !== null ? "ans" : ""} ${S.mark[k] ? "mk" : ""} ${k === S.i ? "cur" : ""}" onclick="jump(${k})">${k + 1}</button>`).join("")}</div>
      <p class="mute legend"><span style="background:var(--ok)"></span>उत्तरित<span style="background:var(--rev)"></span>समीक्षा</p>
      <button class="btn" style="width:100%" onclick="submit()">परीक्षा जमा करें</button>
    </div>
  </div>`;
  if (S.end) tick();
}
function pick(k) { if (session.practice && session.ans[session.i] !== null) return; session.ans[session.i] = k; renderExam(); }
function clearAns() { session.ans[session.i] = null; renderExam(); }
function toggleMark() { session.mark[session.i] = !session.mark[session.i]; renderExam(); }
function nav(d) { session.i += d; renderExam(); }
function jump(k) { session.i = k; renderExam(); }
function submit(force) {
  const S = session;
  const un = S.ans.filter(x => x === null).length;
  if (!force && !confirm(`${un ? un + " प्रश्न अनुत्तरित हैं। " : ""}क्या आप परीक्षा जमा करना चाहते हैं?`)) return;
  clearInterval(timerId);
  const details = S.qs.map((q, k) => ({ id: q.id, n: q.n, t: q.t, ans: S.ans[k], ok: S.ans[k] === q.a }));
  const correct = details.filter(d => d.ok).length, attempted = details.filter(d => d.ans !== null).length;
  const r = { at: Date.now(), examId: S.exam.id, title: S.exam.title, total: S.qs.length, correct, attempted,
              wrong: attempted - correct, pct: pct(correct, S.qs.length), secs: Math.round((Date.now() - S.start) / 1000), details };
  me().results.push(r);
  session = null;
  go("result", me().results.length - 1);
  saveResult(r);
}
async function saveResult(r, tries = 0) {
  try { await api("/api/results", "POST", r); }
  catch (e) {
    if (tries < 3) return setTimeout(() => saveResult(r, tries + 1), 3000);
    alert("परिणाम सर्वर पर सहेजा नहीं जा सका: " + e.message + "\nइंटरनेट जाँचें।");
  }
}

// ===== Result =====
function result(idx) {
  const r = me().results[idx];
  const ts = topicStats([r]);
  const byId = Object.fromEntries(BANK.map(q => [q.id, q]));
  const grade = r.pct >= 75 ? "उत्कृष्ट 🌟" : r.pct >= 60 ? "अच्छा 👍" : r.pct >= 40 ? "सुधार की आवश्यकता" : "और अभ्यास करें";
  const mm = Math.floor(r.secs / 60), ss = r.secs % 60;
  app.innerHTML = `
  <div class="card"><h2>परिणाम — ${esc(r.title)}</h2><p class="mute">${fmtDate(r.at)} · समय: ${mm} मि ${ss} से</p>
    <div class="grid">
      <div><div class="stat">${r.correct}/${r.total}</div><div class="mute">अंक</div></div>
      <div><div class="stat">${r.pct}%</div><div class="mute">${grade}</div></div>
      <div><div class="stat" style="color:var(--ok)">${r.correct}</div><div class="mute">सही</div></div>
      <div><div class="stat" style="color:var(--bad)">${r.wrong}</div><div class="mute">गलत</div></div>
      <div><div class="stat" style="color:var(--mute)">${r.total - r.attempted}</div><div class="mute">अनुत्तरित</div></div>
    </div>
    <div class="row"><button class="btn" onclick="startExam('${r.examId}')">फिर से दें</button>
      ${r.wrong + r.total - r.attempted ? `<button class="btn sec" onclick="startExam('wrong')">गलतियाँ दोहराएँ</button>` : ""}
      <button class="btn ghost" onclick="go('profile')">सभी परिणाम</button></div>
  </div>
  <div class="card"><h3>विषयवार प्रदर्शन</h3><table><tr><th>विषय</th><th>सही/कुल</th><th style="width:40%"></th></tr>
    ${Object.entries(ts).map(([t, v]) => `<tr><td>${t}</td><td>${v.c}/${v.n}</td><td><div class="bar"><i style="width:${pct(v.c, v.n)}%"></i></div></td></tr>`).join("")}</table></div>
  <div class="card"><h3>उत्तर समीक्षा</h3>
    <label class="mute"><input type="checkbox" id="onlyWrong" style="width:auto" onchange="document.querySelectorAll('.rv.ok').forEach(e=>e.hidden=this.checked)"> केवल गलत/अनुत्तरित दिखाएँ</label>
    ${r.details.map((d, k) => { const q = byId[d.id]; if (!q) return ""; return `
      <details class="rv ${d.ok ? "ok" : ""}"><summary>${d.ok ? "✔" : d.ans === null ? "○" : "✘"} ${k + 1}. ${esc(q.q.slice(0, 90))}${q.q.length > 90 ? "…" : ""}</summary>
        <p class="qtext" style="font-size:17px">${esc(q.q)}</p>
        ${q.o.map((o, j) => `<div class="opt ${j === q.a ? "right" : j === d.ans ? "wrong" : ""}"><b>(${LETTERS[j]})</b>${esc(o)}</div>`).join("")}
        <p class="mute">आपका उत्तर: ${d.ans === null ? "अनुत्तरित" : LETTERS[d.ans]} · सही: ${LETTERS[q.a]} · विषय: ${q.t}</p>
      </details>`; }).join("")}
  </div>`;
}

// ===== Preparation module =====
function prep(topic) {
  const N = window.PREP_NOTES;
  const ts = topicStats(me().results);
  app.innerHTML = `<h2>📚 तैयारी मॉड्यूल</h2>
    <p class="mute">हर विषय के मुख्य बिंदु पढ़ें, फिर उसी विषय का अभ्यास करें। अभ्यास मोड में हर उत्तर के बाद सही उत्तर तुरंत दिखता है।</p>
    ${Object.keys(N).map(t => { const v = ts[t]; const cnt = BANK.filter(q => q.t === t).length; return `
    <div class="card" id="t-${t}"><div class="exam-head"><h3>${t}</h3><span class="mute">${cnt} प्रश्न · ${v ? "आपका स्कोर " + pct(v.c, v.n) + "%" : "अभी अभ्यास नहीं किया"}</span></div>
      ${N[t].map(([h, b]) => `<details ${topic === t ? "open" : ""}><summary>${h}</summary><p>${b}</p></details>`).join("")}
      ${cnt ? `<div class="row"><button class="btn sec" onclick="startExam('topic:${t}')">इस विषय का अभ्यास करें</button></div>` : ""}
    </div>`; }).join("")}
    <div class="card"><h3>परीक्षा रणनीति</h3><ul>
      <li>UP PGT हिंदी में 125 प्रश्न, 2 घंटे — प्रति प्रश्न लगभग 55 सेकंड।</li>
      <li>पहले व्याकरण व काव्यशास्त्र के प्रश्न हल करें — ये कम समय में होते हैं।</li>
      <li>सुमेलित (match) प्रश्नों में पहले सबसे निश्चित जोड़ी पहचानें, फिर विकल्प हटाएँ।</li>
      <li>'नहीं है' वाले प्रश्नों में शब्द को रेखांकित करके पढ़ें।</li>
      <li>हर मॉक टेस्ट के बाद "गलतियाँ दोहराएँ" अवश्य करें।</li></ul></div>`;
  if (topic) setTimeout(() => $("t-" + topic)?.scrollIntoView({ behavior: "smooth" }), 50);
}

// ===== Profile =====
function profile() {
  const u = me(), R = u.results;
  const ts = topicStats(R);
  app.innerHTML = `
  <div class="card"><div class="exam-head"><div><h2>👤 ${esc(u.name)}</h2><p class="mute">यूज़रनेम: ${esc(u.username)} · सदस्य: ${fmtDate(u.created)} · कुल परीक्षाएँ: ${R.length}</p></div>
    <div class="row"><button class="btn ghost" onclick="logout()">लॉगआउट</button><button class="btn ghost" onclick="resetMe()">इतिहास मिटाएँ</button></div></div></div>
  <details class="card"><summary>पासवर्ड बदलें</summary>
    <input id="pwCur" type="password" placeholder="वर्तमान पासवर्ड" style="margin-top:10px"><input id="pwNew" type="password" placeholder="नया पासवर्ड (कम से कम 6 अक्षर)" style="margin-top:8px">
    <div class="row"><button class="btn" onclick="changePw()">बदलें</button><span id="pwMsg" class="mute"></span></div></details>
  <div class="card"><h3>दी गई परीक्षाएँ व परिणाम</h3>
    ${R.length ? `<table><tr><th>दिनांक</th><th>परीक्षा</th><th>अंक</th><th>%</th><th></th></tr>
    ${R.map((r, i) => [r, i]).reverse().map(([r, i]) => `<tr><td>${fmtDate(r.at)}</td><td>${esc(r.title)}</td><td>${r.correct}/${r.total}</td><td>${r.pct}%</td><td><button class="btn sec" style="padding:4px 10px" onclick="go('result',${i})">देखें</button></td></tr>`).join("")}</table>`
      : `<p class="mute">अभी तक कोई परीक्षा नहीं दी। <a href="#" onclick="go('exams');return false">परीक्षा शुरू करें</a></p>`}
  </div>
  ${R.length ? `<div class="card"><h3>कुल विषयवार प्रदर्शन</h3><table>
    ${Object.entries(ts).sort((a, b) => a[1].c / a[1].n - b[1].c / b[1].n).map(([t, v]) => `<tr><td>${t}</td><td>${v.c}/${v.n} (${pct(v.c, v.n)}%)</td><td style="width:40%"><div class="bar"><i style="width:${pct(v.c, v.n)}%"></i></div></td></tr>`).join("")}</table></div>` : ""}`;
}
async function logout() { try { await api("/api/logout", "POST"); } catch {} user = null; authMode = "login"; go("login"); }
async function resetMe() {
  if (!confirm("क्या आप अपना पूरा परीक्षा इतिहास मिटाना चाहते हैं? यह वापस नहीं होगा।")) return;
  try { await api("/api/results", "DELETE"); me().results = []; profile(); } catch (e) { alert(e.message); }
}
async function changePw() {
  try { await api("/api/password", "POST", { current: $("pwCur").value, next: $("pwNew").value }); $("pwMsg").textContent = "पासवर्ड बदल दिया ✓"; $("pwCur").value = $("pwNew").value = ""; }
  catch (e) { $("pwMsg").textContent = e.message; }
}

api("/api/me").then(u => { user = u; go("home"); }).catch(() => go("login"));
