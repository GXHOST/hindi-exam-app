// Hindi exam app — zero-dependency Node server (Node 18+).
// Users, password hashes, sessions and results: PostgreSQL (DATABASE_URL) or DATA_DIR/exam-db.json.
const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = process.env.PORT || 8080;
const DATA = path.join(process.env.DATA_DIR || path.join(__dirname, "data"), "exam-db.json");
const PUBLIC = path.join(__dirname, "public");
const SESSION_DAYS = 60;

// Storage: PostgreSQL when DATABASE_URL is set (survives redeploys), otherwise a local JSON file.
const DB_URL = process.env.DATABASE_URL;
const pool = DB_URL ? new (require("pg").Pool)({ connectionString: DB_URL, ssl: /sslmode=require/.test(DB_URL) ? { rejectUnauthorized: false } : false }) : null;
let db = { users: {}, sessions: {} };
async function load() {
  if (pool) {
    await pool.query("CREATE TABLE IF NOT EXISTS exam_store (id text PRIMARY KEY, data jsonb NOT NULL)");
    const r = await pool.query("SELECT data FROM exam_store WHERE id='main'");
    if (r.rows[0]) db = r.rows[0].data;
  } else {
    try { db = JSON.parse(fs.readFileSync(DATA, "utf8")); } catch {}
  }
}
let saveTimer = null, saving = Promise.resolve();
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const json = JSON.stringify(db);
    saving = saving.then(async () => {
      if (pool) await pool.query("INSERT INTO exam_store (id, data) VALUES ('main', $1) ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data", [json]);
      else {
        fs.mkdirSync(path.dirname(DATA), { recursive: true });
        fs.writeFileSync(DATA + ".tmp", json, { mode: 0o600 });
        fs.renameSync(DATA + ".tmp", DATA);
      }
    }).catch(e => console.error("save failed:", e.message));
  }, 50);
}

const hashPw = (pw, salt = crypto.randomBytes(16).toString("hex")) => salt + ":" + crypto.scryptSync(pw, salt, 64).toString("hex");
function verifyPw(pw, stored) {
  const [salt, h] = stored.split(":");
  const a = Buffer.from(h, "hex"), b = crypto.scryptSync(pw, salt, 64);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
const sha = s => crypto.createHash("sha256").update(s).digest("hex");

function newSession(username) {
  const token = crypto.randomBytes(32).toString("hex");
  db.sessions[sha(token)] = { u: username, exp: Date.now() + SESSION_DAYS * 864e5 };
  save();
  return `exam_sid=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_DAYS * 86400}`;
}
function currentUser(req) {
  const m = /(?:^|;\s*)exam_sid=([0-9a-f]+)/.exec(req.headers.cookie || "");
  if (!m) return null;
  const s = db.sessions[sha(m[1])];
  if (!s || s.exp < Date.now()) return null;
  return { key: sha(m[1]), user: db.users[s.u] };
}

const attempts = new Map();
function limited(ip) { const a = attempts.get(ip); return a && a.until > Date.now(); }
function failed(ip) { const n = (attempts.get(ip)?.n || 0) + 1; attempts.set(ip, { n, until: n >= 5 ? Date.now() + 60000 : 0 }); }

function send(res, code, body, headers = {}) {
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8", "X-Content-Type-Options": "nosniff", "Cache-Control": "no-store", ...headers });
  res.end(JSON.stringify(body));
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", c => { data += c; if (data.length > 2e6) req.destroy(); });
    req.on("end", () => { try { resolve(data ? JSON.parse(data) : {}); } catch (e) { reject(e); } });
  });
}
const publicUser = u => ({ username: u.username, name: u.name, created: u.created, results: u.results });

const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8" };

load().then(() => http.createServer(async (req, res) => {
  const p = new URL(req.url, "http://x").pathname;
  const ip = req.headers["x-forwarded-for"]?.split(",")[0] || req.socket.remoteAddress;
  try {
    if (p === "/api/register" && req.method === "POST") {
      const { username, password, name } = await readBody(req);
      const u = String(username || "").trim().toLowerCase();
      if (!/^[a-z0-9_.]{3,30}$/.test(u)) return send(res, 400, { error: "यूज़रनेम 3-30 अक्षर का हो (a-z, 0-9, _ .)" });
      if (!password || String(password).length < 6) return send(res, 400, { error: "पासवर्ड कम से कम 6 अक्षर का हो" });
      if (db.users[u]) return send(res, 409, { error: "यह यूज़रनेम पहले से है, कोई दूसरा चुनें" });
      db.users[u] = { username: u, name: String(name || u).trim().slice(0, 40) || u, pw: hashPw(String(password)), created: Date.now(), results: [] };
      return send(res, 200, publicUser(db.users[u]), { "Set-Cookie": newSession(u) });
    }
    if (p === "/api/login" && req.method === "POST") {
      if (limited(ip)) return send(res, 429, { error: "बहुत अधिक प्रयास। 1 मिनट बाद कोशिश करें।" });
      const { username, password } = await readBody(req);
      const u = db.users[String(username || "").trim().toLowerCase()];
      if (u && password && verifyPw(String(password), u.pw)) { attempts.delete(ip); return send(res, 200, publicUser(u), { "Set-Cookie": newSession(u.username) }); }
      failed(ip);
      return send(res, 401, { error: "यूज़रनेम या पासवर्ड गलत है" });
    }
    if (p === "/api/health") {
      return send(res, 200, { ok: true, storage: pool ? "postgres" : "file" });
    }
    if (p.startsWith("/api/")) {
      const s = currentUser(req);
      if (!s || !s.user) return send(res, 401, { error: "कृपया लॉगिन करें" });
      const u = s.user;
      if (p === "/api/me" && req.method === "GET") return send(res, 200, publicUser(u));
      if (p === "/api/logout" && req.method === "POST") { delete db.sessions[s.key]; save(); return send(res, 200, { ok: true }, { "Set-Cookie": "exam_sid=; Path=/; Max-Age=0" }); }
      if (p === "/api/results" && req.method === "POST") {
        const r = await readBody(req);
        if (!r || !Array.isArray(r.details)) return send(res, 400, { error: "invalid" });
        u.results.push(r); save();
        return send(res, 200, { ok: true, index: u.results.length - 1 });
      }
      if (p === "/api/results" && req.method === "DELETE") { u.results = []; save(); return send(res, 200, { ok: true }); }
      if (p === "/api/password" && req.method === "POST") {
        const { current, next } = await readBody(req);
        if (!verifyPw(String(current || ""), u.pw)) return send(res, 400, { error: "वर्तमान पासवर्ड गलत है" });
        if (!next || String(next).length < 6) return send(res, 400, { error: "नया पासवर्ड कम से कम 6 अक्षर का हो" });
        u.pw = hashPw(String(next)); save();
        return send(res, 200, { ok: true });
      }
      return send(res, 404, { error: "Not found" });
    }
    const file = path.join(PUBLIC, p === "/" ? "index.html" : path.normalize(p).replace(/^(\.\.[/\\])+/, ""));
    if (!file.startsWith(PUBLIC) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end("Not found"); }
    res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-cache" });
    fs.createReadStream(file).pipe(res);
  } catch (e) {
    send(res, 500, { error: e.message });
  }
}).listen(PORT, "0.0.0.0", () => console.log("Hindi exam app on http://localhost:" + PORT))).catch(e => { console.error("startup failed:", e.message); process.exit(1); });
