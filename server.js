var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod) => function __require() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};

// app/server__notifications.cjs
var require_server_notifications = __commonJS({
  "app/server__notifications.cjs"(exports2, module2) {
    var fs2 = require("fs");
    var path2 = require("path");
    var crypto = require("crypto");
    module2.exports = function createNotifications({ dataDir, readBody: readBody2, sendJson: sendJson2 }) {
      let webPush;
      try {
        webPush = require("web-push");
      } catch {
      }
      const file = path2.join(dataDir, "web-push-private.json");
      let state = { channels: {}, keys: null };
      try {
        state = JSON.parse(fs2.readFileSync(file, "utf8"));
      } catch {
      }
      const persist = () => {
        const temp = file + ".tmp";
        fs2.writeFileSync(temp, JSON.stringify(state), { mode: 384 });
        fs2.renameSync(temp, file);
      };
      if (webPush) {
        if (!state.keys) {
          state.keys = webPush.generateVAPIDKeys();
          persist();
        }
        webPush.setVapidDetails(process.env.VAPID_SUBJECT || "https://www.cashtoop.com", state.keys.publicKey, state.keys.privateKey);
      }
      const endpointAllowed = (value) => {
        try {
          const u = new URL(value);
          return u.protocol === "https:" && !u.username && !u.password && !u.port && (["fcm.googleapis.com", "updates.push.services.mozilla.com", "web.push.apple.com", "wns.windows.com"].includes(u.hostname) || u.hostname.endsWith(".push.apple.com") || u.hostname.endsWith(".notify.windows.com"));
        } catch {
          return false;
        }
      };
      const digest = (v) => crypto.createHash("sha256").update(v).digest("hex");
      const preferences = (p) => ({ since: Math.min(Date.now(), Math.max(0, Number(p?.since) || Date.now())), enabled: !!p?.enabled, types: Object.fromEntries(Object.entries(p?.types || {}).filter(([k, v]) => /^[a-z_]{1,40}$/.test(k) && typeof v === "boolean")), reminderDays: [1, 3, 7, 30].includes(Number(p?.reminderDays)) ? Number(p.reminderDays) : 1, lastBackup: Math.min(Date.now(), Math.max(0, Number(p?.lastBackup) || Date.now())) });
      const rates = /* @__PURE__ */ new Map();
      function rate(key) {
        const now = Date.now(), r = rates.get(key) || { at: now, n: 0 };
        if (now - r.at > 6e4) {
          r.at = now;
          r.n = 0;
        }
        r.n++;
        rates.set(key, r);
        return r.n < 180;
      }
      async function deliver(channel, event, exclude) {
        let sent = 0;
        for (const [id, s] of Object.entries(channel.subscriptions)) {
          if (event.createdAt < Number(s.preferences.since || 0) || id === exclude || !s.preferences.enabled || s.preferences.types[event.type] === false) continue;
          try {
            await webPush.sendNotification(s.subscription, JSON.stringify({ ...event, tenant: channel.tenant }), { TTL: 86400, urgency: event.type === "backup" ? "normal" : "high", timeout: 1e4 });
            sent++;
          } catch (e) {
            if (e.statusCode === 404 || e.statusCode === 410) delete channel.subscriptions[id];
            else {
              channel.pending = channel.pending || {};
              channel.pending[digest(id + "|" + event.id)] = { deviceId: id, event, createdAt: Date.now() };
            }
          }
        }
        return sent;
      }
      let serial = Promise.resolve();
      const ordered = (fn) => {
        const job = serial.then(fn);
        serial = job.catch(() => {
        });
        return job;
      };
      const route = async (req, res, origin) => {
        if (req.method !== "POST") return sendJson2(res, 405, { error: "POST \u0641\u0642\u0637" }, origin);
        if (origin) {
          try {
            if (new URL(origin).host !== req.headers.host) return sendJson2(res, 403, { error: "\u0646\u0637\u0627\u0642 \u063A\u064A\u0631 \u0645\u0633\u0645\u0648\u062D" }, "");
          } catch {
            return sendJson2(res, 403, { error: "\u0646\u0637\u0627\u0642 \u063A\u064A\u0631 \u0635\u0627\u0644\u062D" }, "");
          }
        }
        const token = String(req.headers.authorization || "").replace(/^Bearer /, "");
        if (!/^[a-f0-9]{64}$/.test(token)) return sendJson2(res, 401, { error: "\u064A\u0644\u0632\u0645 \u062A\u0633\u062C\u064A\u0644 \u062F\u062E\u0648\u0644 \u0627\u0644\u0634\u0631\u0643\u0629" }, origin);
        const id = digest(token);
        if (!rate(id)) return sendJson2(res, 429, { error: "\u0645\u062D\u0627\u0648\u0644\u0627\u062A \u0643\u062B\u064A\u0631\u0629\u060C \u062D\u0627\u0648\u0644 \u0644\u0627\u062D\u0642\u0627\u064B" }, origin);
        if (!webPush) return sendJson2(res, 503, { error: "\u062B\u0628\u0651\u062A \u0627\u0639\u062A\u0645\u0627\u062F web-push \u0639\u0644\u0649 \u0627\u0644\u062E\u0627\u062F\u0645 \u0628\u0627\u0644\u0623\u0645\u0631 npm install \u062B\u0645 \u0623\u0639\u062F \u0627\u0644\u062A\u0634\u063A\u064A\u0644" }, origin);
        let b;
        try {
          b = await readBody2(req);
        } catch {
          return sendJson2(res, 400, { error: "\u0637\u0644\u0628 \u063A\u064A\u0631 \u0635\u0627\u0644\u062D" }, origin);
        }
        return ordered(async () => {
          try {
            if (b.action === "config") return sendJson2(res, 200, { publicKey: state.keys.publicKey }, origin);
            const ch = state.channels[id] || (state.channels[id] = { tenant: "", subscriptions: {}, seen: {} });
            if (b.action === "subscribe") {
              const sub = b.subscription;
              if (!endpointAllowed(sub?.endpoint) || !sub?.keys?.p256dh || !sub?.keys?.auth || String(sub.keys.p256dh).length > 200 || String(sub.keys.auth).length > 100 || !/^[\w-]{10,80}$/.test(b.deviceId || "")) return sendJson2(res, 400, { error: "\u0627\u0634\u062A\u0631\u0627\u0643 \u0625\u0634\u0639\u0627\u0631\u0627\u062A \u063A\u064A\u0631 \u0635\u0627\u0644\u062D" }, origin);
              if (!b.tenant || String(b.tenant).length > 200) return sendJson2(res, 400, { error: "\u0645\u0639\u0631\u0641 \u0627\u0644\u0634\u0631\u0643\u0629 \u0645\u0637\u0644\u0648\u0628" }, origin);
              if (ch.tenant && ch.tenant !== b.tenant) return sendJson2(res, 403, { error: "\u0627\u0644\u0634\u0631\u0643\u0629 \u063A\u064A\u0631 \u0645\u0637\u0627\u0628\u0642\u0629" }, origin);
              ch.tenant = b.tenant;
              const previous = ch.subscriptions[b.deviceId];
              for (const other of Object.values(state.channels)) for (const [key, s] of Object.entries(other.subscriptions)) if (s.subscription.endpoint === sub.endpoint) delete other.subscriptions[key];
              if (Object.keys(ch.subscriptions).length >= 100) return sendJson2(res, 409, { error: "\u062A\u0645 \u0628\u0644\u0648\u063A \u062D\u062F \u0627\u0644\u0623\u062C\u0647\u0632\u0629" }, origin);
              ch.subscriptions[b.deviceId] = { subscription: sub, preferences: { ...preferences(b.preferences), lastBackup: Math.max(preferences(b.preferences).lastBackup, previous?.preferences?.lastBackup || 0) }, remindedAt: previous?.remindedAt || 0 };
              persist();
              return sendJson2(res, 200, { ok: true }, origin);
            }
            if (b.action === "publish") {
              const e = b.event;
              if (!e || typeof e.id !== "string" || e.id.length > 500 || !/^[a-z_]{1,40}$/.test(e.type || "") || !Number.isFinite(e.createdAt) || e.createdAt < Date.now() - 864e5 * 2 || e.createdAt > Date.now() + 3e5) return sendJson2(res, 400, { error: "\u062D\u062F\u062B \u063A\u064A\u0631 \u0635\u0627\u0644\u062D" }, origin);
              if (ch.seen[e.id]) return sendJson2(res, 200, { ok: true, duplicate: true }, origin);
              if (ch.tenant && ch.tenant !== e.tenant) return sendJson2(res, 403, { error: "\u0627\u0644\u0634\u0631\u0643\u0629 \u063A\u064A\u0631 \u0645\u0637\u0627\u0628\u0642\u0629" }, origin);
              ch.tenant = String(e.tenant || "");
              const event = { id: e.id, type: e.type, createdAt: e.createdAt, recordId: String(e.recordId || "").slice(0, 200), storeName: String(e.storeName || "").replace(/[^a-z_]/g, "").slice(0, 40), title: String(e.title || "\u0643\u0627\u0634 \u062A\u0648\u0628 3").slice(0, 120), body: String(e.body || "").slice(0, 500), tab: String(e.tab || "dashboard").replace(/[^a-z_-]/g, "").slice(0, 40) };
              ch.seen[e.id] = Date.now();
              for (const [key, at] of Object.entries(ch.seen)) if (Date.now() - at > 1728e5) delete ch.seen[key];
              persist();
              const sent = await deliver(ch, event, b.deviceId);
              persist();
              return sendJson2(res, 200, { ok: true, sent }, origin);
            }
            if (b.action === "backup") {
              for (const s of Object.values(ch.subscriptions)) {
                s.preferences.lastBackup = Date.now();
                s.remindedAt = 0;
              }
              persist();
              return sendJson2(res, 200, { ok: true }, origin);
            }
            return sendJson2(res, 400, { error: "\u0639\u0645\u0644\u064A\u0629 \u063A\u064A\u0631 \u0645\u0639\u0631\u0648\u0641\u0629" }, origin);
          } catch {
            sendJson2(res, 500, { error: "\u062A\u0639\u0630\u0631 \u062D\u0641\u0638 \u0625\u0639\u062F\u0627\u062F\u0627\u062A \u0627\u0644\u0625\u0634\u0639\u0627\u0631\u0627\u062A" }, origin);
          }
        });
      };
      let ticking = false;
      const timer = setInterval(() => {
        if (!webPush || ticking) return;
        ticking = true;
        ordered(async () => {
          try {
            const now = Date.now();
            for (const ch of Object.values(state.channels)) {
              for (const [key, job] of Object.entries(ch.pending || {})) {
                const target = ch.subscriptions[job.deviceId];
                if (!target || job.event.createdAt < Number(target.preferences.since || 0) || !target.preferences.enabled || target.preferences.types[job.event.type] === false || now - job.createdAt > 864e5) {
                  delete ch.pending[key];
                  continue;
                }
                try {
                  await webPush.sendNotification(target.subscription, JSON.stringify({ ...job.event, tenant: ch.tenant }), { TTL: 86400, timeout: 1e4 });
                  delete ch.pending[key];
                } catch (e) {
                  if (e.statusCode === 410 || e.statusCode === 404) {
                    delete ch.subscriptions[job.deviceId];
                    delete ch.pending[key];
                  }
                }
              }
              for (const [id, s] of Object.entries(ch.subscriptions)) {
                const p = s.preferences;
                if (!p.enabled || p.types.backup === false || now - p.lastBackup < p.reminderDays * 864e5 || now - (s.remindedAt || 0) < 864e5) continue;
                try {
                  await webPush.sendNotification(s.subscription, JSON.stringify({ id: "backup:" + Math.floor(now / 864e5), type: "backup", createdAt: now, tenant: ch.tenant, title: "\u062D\u0627\u0646 \u0648\u0642\u062A \u0627\u0644\u0646\u0633\u062E \u0627\u0644\u0627\u062D\u062A\u064A\u0627\u0637\u064A", body: "\u0644\u0645 \u062A\u0633\u062C\u0644 \u0646\u0633\u062E\u0629 \u0627\u062D\u062A\u064A\u0627\u0637\u064A\u0629 \u062E\u0644\u0627\u0644 \u0627\u0644\u0645\u062F\u0629 \u0627\u0644\u0645\u062D\u062F\u062F\u0629. \u0627\u0641\u062A\u062D \u0627\u0644\u0625\u0639\u062F\u0627\u062F\u0627\u062A \u0644\u062D\u0641\u0638 \u0646\u0633\u062E\u0629 \u0645\u0646 \u0628\u064A\u0627\u0646\u0627\u062A\u0643.", tab: "settings" }), { TTL: 86400, timeout: 1e4 });
                  s.remindedAt = now;
                } catch (e) {
                  if (e.statusCode === 410 || e.statusCode === 404) delete ch.subscriptions[id];
                }
              }
            }
            persist();
            for (const [k, r] of rates) if (now - r.at > 6e4) rates.delete(k);
          } finally {
            ticking = false;
          }
        }).catch(() => {
          ticking = false;
        });
      }, 6e4);
      timer.unref();
      return { route, close: () => clearInterval(timer) };
    };
  }
});

// app/server.js
var http = require("http");
var fs = require("fs");
var path = require("path");
var os = require("os");
var PORT = Number(process.env.PORT || 8787);
var ROOT = __dirname;
var OPENROUTER_API_KEY = String(process.env.OPENROUTER_API_KEY || "").trim();
var OPENROUTER_MODEL = String(process.env.OPENROUTER_MODEL || "google/gemini-2.5-flash:free").trim();
var ALLOWED_ORIGIN = String(process.env.OSCAR_ALLOWED_ORIGIN || "").trim();
var TELEGRAM_BOT_TOKEN = String(process.env.TELEGRAM_BOT_TOKEN || "8893463288:AAHn77qegDsR3Yu1LYGicM0Dfh1Fznw4agg").trim();
var TELEGRAM_CHAT_IDS = String(process.env.TELEGRAM_CHAT_IDS || process.env.TELEGRAM_CHAT_ID || "").trim();
var PRODUCT_IMAGE_BOT_TOKEN = String(process.env.PRODUCT_IMAGE_BOT_TOKEN || TELEGRAM_BOT_TOKEN).trim();
var PRODUCT_IMAGE_CHAT_ID = String(process.env.PRODUCT_IMAGE_CHAT_ID || "6764610810").trim();
var productImagePathCache = /* @__PURE__ */ new Map();
var TELEGRAM_DATA_DIR = String(process.env.OSCAR_DATA_DIR || path.join(os.homedir(), ".oscar-accounting")).trim();
try {
  fs.mkdirSync(TELEGRAM_DATA_DIR, { recursive: true });
} catch (_) {
}
var TELEGRAM_STATE_FILE = path.join(TELEGRAM_DATA_DIR, "telegram-state.json");
var TELEGRAM_USERS_FILE = path.join(TELEGRAM_DATA_DIR, "telegram-users.json");
var PORTAL_SHORTLINKS_FILE = path.join(TELEGRAM_DATA_DIR, "customer-short-links.json");
var telegramUsersSyncBusy = false;
var telegramState = { config: { token: "", chatIds: "", dailyReportEnabled: false, dailyBackupEnabled: true }, snapshot: {}, lastDailyReportSentAt: 0, lastDailyBackupSentAt: 0 };
try {
  const saved = JSON.parse(fs.readFileSync(TELEGRAM_STATE_FILE, "utf8"));
  if (saved && typeof saved === "object") telegramState = { ...telegramState, ...saved, config: { ...telegramState.config, ...saved.config || {} }, snapshot: { ...saved.snapshot || {} } };
} catch (_) {
}
var persistTelegramState = () => {
  try {
    fs.writeFileSync(TELEGRAM_STATE_FILE, JSON.stringify(telegramState));
  } catch (err) {
    console.warn("Telegram state persistence unavailable:", err?.message || err);
  }
};
var parseChatIds = (v) => String(v || "").split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean);
var telegramConfig = () => ({ token: String(TELEGRAM_BOT_TOKEN || "").trim(), chatIds: parseChatIds(telegramState.config?.chatIds || "") });
var telegramReady = () => {
  const c = telegramConfig();
  return !!(c.token && c.chatIds.length);
};
var normalizeTelegramUsername = (value) => String(value || "").trim().replace(/^@+/, "").toLowerCase();
var readTelegramUsersState = () => {
  try {
    const parsed = JSON.parse(fs.readFileSync(TELEGRAM_USERS_FILE, "utf8"));
    return parsed && typeof parsed === "object" ? parsed : { offset: 0, users: {} };
  } catch {
    return { offset: 0, users: {} };
  }
};
var writeTelegramUsersState = (state) => {
  try {
    fs.writeFileSync(TELEGRAM_USERS_FILE, JSON.stringify(state, null, 2), "utf8");
    return true;
  } catch (e) {
    console.error("Telegram users state write error:", e);
    return false;
  }
};
async function telegramRawCall(method, payload = {}) {
  const token = telegramConfig().token;
  if (!token) throw new Error("Telegram Bot Token \u063A\u064A\u0631 \u0645\u0636\u0628\u0648\u0637");
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload || {}) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.ok === false) throw new Error(data?.description || `Telegram HTTP ${response.status}`);
  return data;
}
function rememberTelegramUser(state, update) {
  const msg = update?.message || update?.edited_message || update?.callback_query?.message;
  const chat = msg?.chat || {}, from = update?.callback_query?.from || msg?.from || {};
  const username = String(chat?.username || from?.username || "").trim(), key = normalizeTelegramUsername(username);
  const chatId = chat?.id || (chat?.type === "private" ? from?.id : null);
  if (!key || !chatId) return false;
  const previous = state.users?.[key] || {};
  state.users = state.users || {};
  state.users[key] = { ...previous, chatId: String(chatId), username: `@${username}`, firstName: String(chat?.first_name || from?.first_name || previous.firstName || "").trim(), lastName: String(chat?.last_name || from?.last_name || previous.lastName || "").trim(), type: String(chat?.type || previous.type || "private"), lastSeenAt: (/* @__PURE__ */ new Date()).toISOString() };
  return true;
}
async function refreshTelegramUsers({ maxBatches = 5 } = {}) {
  if (telegramUsersSyncBusy || !telegramConfig().token) return readTelegramUsersState();
  telegramUsersSyncBusy = true;
  try {
    const state = readTelegramUsersState();
    state.users = state.users || {};
    let offset = Number(state.offset || 0), changed = false;
    for (let batch = 0; batch < Math.max(1, maxBatches); batch++) {
      const data = await telegramRawCall("getUpdates", { offset, limit: 100, timeout: 0, allowed_updates: ["message", "edited_message", "callback_query"] });
      const updates = Array.isArray(data?.result) ? data.result : [];
      if (!updates.length) break;
      for (const update of updates) {
        if (rememberTelegramUser(state, update)) changed = true;
        const id = Number(update?.update_id);
        if (Number.isFinite(id)) offset = Math.max(offset, id + 1);
      }
      if (updates.length < 100) break;
    }
    if (offset !== Number(state.offset || 0)) {
      state.offset = offset;
      changed = true;
    }
    state.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
    if (changed || !fs.existsSync(TELEGRAM_USERS_FILE)) writeTelegramUsersState(state);
    return state;
  } finally {
    telegramUsersSyncBusy = false;
  }
}
async function handleTelegramResolve(req, res, origin) {
  let body;
  try {
    body = await readBody(req, 256 * 1024);
  } catch (e) {
    return sendJson(res, 400, { ok: false, error: e.message }, origin);
  }
  const key = normalizeTelegramUsername(body?.username);
  if (!/^[a-z0-9_]{5,32}$/i.test(key)) return sendJson(res, 400, { ok: false, error: "\u0627\u0643\u062A\u0628 \u064A\u0648\u0632\u0631 Telegram \u0635\u062D\u064A\u062D \u0645\u062B\u0644 @username" }, origin);
  let state = readTelegramUsersState(), row = state.users?.[key], syncError = "";
  if (!row?.chatId) {
    try {
      state = await refreshTelegramUsers({ maxBatches: 8 });
      row = state.users?.[key];
    } catch (e) {
      syncError = String(e?.message || e);
      console.error("Telegram user sync error:", syncError);
    }
  }
  if (!row?.chatId) {
    const suffix = /webhook|conflict|409/i.test(syncError) ? " \u0627\u0644\u0628\u0648\u062A \u0645\u0631\u0628\u0648\u0637 \u0628\u0640 Webhook \u0622\u062E\u0631\u061B \u0627\u0633\u062A\u062E\u062F\u0645 \u0631\u0627\u0628\u0637 Start \u0627\u0644\u062C\u062F\u064A\u062F \u0645\u0646 \u0627\u0644\u0628\u0631\u0646\u0627\u0645\u062C \u0644\u064A\u062A\u0645 \u062A\u062D\u062F\u064A\u062B \u0627\u0644\u0631\u0628\u0637." : " \u0627\u0641\u062A\u062D \u0627\u0644\u0628\u0648\u062A \u0645\u0646 \u0631\u0627\u0628\u0637 \u0627\u0644\u0631\u0628\u0637 \u0627\u0644\u062C\u062F\u064A\u062F \u0648\u0627\u0636\u063A\u0637 Start \u062B\u0645 \u0627\u0631\u062C\u0639 \u0644\u0644\u0628\u0631\u0646\u0627\u0645\u062C.";
    return sendJson(res, 404, { ok: false, error: `\u0644\u0645 \u064A\u062A\u0645 \u0627\u0644\u0639\u062B\u0648\u0631 \u0639\u0644\u0649 @${key}.${suffix}`, telegram_error: syncError || null }, origin);
  }
  return sendJson(res, 200, { ok: true, result: { chatId: row.chatId, username: row.username || `@${key}`, name: [row.firstName, row.lastName].filter(Boolean).join(" ").trim() } }, origin);
}
async function handleTelegramUsers(req, res, origin) {
  try {
    await refreshTelegramUsers({ maxBatches: 5 });
  } catch (e) {
    console.error("Telegram users refresh error:", e?.message || e);
  }
  const state = readTelegramUsersState();
  const users = Object.values(state.users || {}).map((row) => ({ chatId: String(row.chatId || ""), username: row.username || "", name: [row.firstName, row.lastName].filter(Boolean).join(" ").trim(), type: row.type || "private", lastSeenAt: row.lastSeenAt || null })).filter((row) => row.chatId).sort((a, b) => String(b.lastSeenAt || "").localeCompare(String(a.lastSeenAt || "")));
  return sendJson(res, 200, { ok: true, users, updatedAt: state.updatedAt || null }, origin);
}
async function handleTelegramProxy(req, res, origin) {
  let body;
  try {
    body = await readBody(req, 8 * 1024 * 1024);
  } catch (e) {
    return sendJson(res, 400, { ok: false, error: e.message }, origin);
  }
  const method = String(body?.method || "").trim(), allowed = /* @__PURE__ */ new Set(["sendMessage", "sendPhoto", "sendDocument", "getMe"]);
  if (!allowed.has(method)) return sendJson(res, 400, { ok: false, error: "Telegram method is not allowed" }, origin);
  try {
    const payload = body?.payload || {};
    if (method === "sendPhoto" || method === "sendDocument") {
      const isPhoto = method === "sendPhoto";
      const raw = String(isPhoto ? payload.photoDataUrl : payload.fileDataUrl || ""), match = raw.match(/^data:([^;,]+)?(;base64)?,(.*)$/s);
      if (!match) return sendJson(res, 400, { ok: false, error: isPhoto ? "\u0635\u0648\u0631\u0629 Telegram \u063A\u064A\u0631 \u0635\u0627\u0644\u062D\u0629" : "\u0645\u0644\u0641 Telegram \u063A\u064A\u0631 \u0635\u0627\u0644\u062D" }, origin);
      const mime = match[1] || (isPhoto ? "image/png" : "application/octet-stream"), bodyData = match[3] || "", buffer = match[2] ? Buffer.from(bodyData, "base64") : Buffer.from(decodeURIComponent(bodyData), "utf8");
      const form = new FormData();
      form.append("chat_id", String(payload.chat_id || ""));
      if (payload.caption) form.append("caption", String(payload.caption).slice(0, 1024));
      if (payload.disable_notification) form.append("disable_notification", "true");
      const field = isPhoto ? "photo" : "document";
      form.append(field, new Blob([buffer], { type: mime }), String(payload.filename || (isPhoto ? "oscar.png" : "oscar-file.bin")));
      const token = telegramConfig().token;
      const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, { method: "POST", body: form });
      const data2 = await response.json().catch(() => ({}));
      if (!response.ok || data2?.ok === false) throw new Error(data2?.description || `Telegram HTTP ${response.status}`);
      return sendJson(res, 200, data2, origin);
    }
    const data = await telegramRawCall(method, payload);
    return sendJson(res, 200, data, origin);
  } catch (e) {
    return sendJson(res, 502, { ok: false, error: String(e?.message || e) }, origin);
  }
}
async function telegramApi(method, { chatId, text, base64, filename, mime = "application/octet-stream", caption = "" } = {}) {
  const cfg = telegramConfig();
  if (!cfg.token) throw new Error("Telegram Bot Token \u063A\u064A\u0631 \u0645\u0636\u0628\u0648\u0637");
  const url = `https://api.telegram.org/bot${cfg.token}/${method}`;
  let response;
  if (method === "sendMessage") {
    response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chat_id: chatId, text: String(text || "").slice(0, 4e3) }) });
  } else {
    const field = method === "sendPhoto" ? "photo" : "document";
    const form = new FormData();
    form.append("chat_id", chatId);
    if (caption) form.append("caption", String(caption).slice(0, 900));
    const bytes = Buffer.from(String(base64 || ""), "base64");
    if (!bytes.length) throw new Error(`\u0645\u0644\u0641 ${filename || field} \u0641\u0627\u0631\u063A`);
    form.append(field, new Blob([bytes], { type: mime }), filename || `oscar.${method === "sendPhoto" ? "jpg" : "bin"}`);
    response = await fetch(url, { method: "POST", body: form });
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.ok === false) throw new Error(data?.description || `Telegram HTTP ${response.status}`);
  return data;
}
function splitTelegramServerText(text, max = 3900) {
  const lines = String(text || "").split("\n"), parts = [];
  let current = "";
  for (const rawLine of lines) {
    const line = String(rawLine || "");
    if (line.length > max) {
      if (current) {
        parts.push(current);
        current = "";
      }
      for (let i = 0; i < line.length; i += max) parts.push(line.slice(i, i + max));
      continue;
    }
    const next = current ? `${current}
${line}` : line;
    if (next.length > max) {
      if (current) parts.push(current);
      current = line;
    } else current = next;
  }
  if (current) parts.push(current);
  return parts.filter(Boolean);
}
async function telegramBroadcast(kind, payload = {}) {
  const cfg = telegramConfig();
  if (!cfg.chatIds.length) throw new Error("\u0644\u0645 \u064A\u062A\u0645 \u062A\u062D\u062F\u064A\u062F Chat ID \u0644\u0644\u0645\u0633\u062A\u0644\u0645\u064A\u0646");
  const out = [];
  for (const chatId of cfg.chatIds) {
    if (kind === "sendMessage") {
      for (const part of splitTelegramServerText(payload.text)) out.push(await telegramApi(kind, { ...payload, text: part, chatId }));
    } else out.push(await telegramApi(kind, { ...payload, chatId }));
  }
  return out;
}
async function sendStoredDailyReport() {
  const snap = telegramState.snapshot || {};
  if (!telegramReady()) throw new Error("\u0625\u0639\u062F\u0627\u062F\u0627\u062A Telegram \u063A\u064A\u0631 \u0645\u0643\u062A\u0645\u0644\u0629");
  if (!snap.reportText && !snap.dailyPdfBase64) throw new Error("\u0644\u0627 \u062A\u0648\u062C\u062F \u0646\u0633\u062E\u0629 \u062D\u062F\u064A\u062B\u0629 \u0645\u0646 \u0627\u0644\u062A\u0642\u0631\u064A\u0631 \u0627\u0644\u064A\u0648\u0645\u064A");
  if (snap.reportText) await telegramBroadcast("sendMessage", { text: snap.reportText });
  if (snap.dailyImageBase64) await telegramBroadcast("sendPhoto", { base64: snap.dailyImageBase64, filename: snap.dailyImageName || "daily-report.jpg", mime: "image/jpeg", caption: `\u0635\u0648\u0631\u0629 \u0627\u0644\u062A\u0642\u0631\u064A\u0631 \u2014 ${snap.storeName || "\u0643\u0627\u0634 \u062A\u0648\u0628 3"}` });
  if (snap.dailyPdfBase64) await telegramBroadcast("sendDocument", { base64: snap.dailyPdfBase64, filename: snap.dailyPdfName || "daily-report.pdf", mime: "application/pdf", caption: `PDF \u0627\u0644\u062A\u0642\u0631\u064A\u0631 \u0627\u0644\u064A\u0648\u0645\u064A \u2014 ${snap.storeName || "\u0643\u0627\u0634 \u062A\u0648\u0628 3"}` });
}
async function sendStoredCustomerReport() {
  const snap = telegramState.snapshot || {};
  if (!telegramReady()) throw new Error("\u0625\u0639\u062F\u0627\u062F\u0627\u062A Telegram \u063A\u064A\u0631 \u0645\u0643\u062A\u0645\u0644\u0629");
  if (!snap.customerPdfBase64) throw new Error("\u0644\u0627 \u064A\u0648\u062C\u062F \u062A\u0642\u0631\u064A\u0631 \u0639\u0645\u0644\u0627\u0621 \u0645\u0631\u0641\u0648\u0639 \u0628\u0639\u062F");
  await telegramBroadcast("sendDocument", { base64: snap.customerPdfBase64, filename: snap.customerPdfName || "customers-debts.pdf", mime: "application/pdf", caption: `\u062A\u0642\u0631\u064A\u0631 \u0627\u0644\u0639\u0645\u0644\u0627\u0621 \u0648\u0627\u0644\u062F\u064A\u0648\u0646 \u2014 ${snap.storeName || "\u0643\u0627\u0634 \u062A\u0648\u0628 3"}` });
}
async function sendStoredAllReports() {
  const snap = telegramState.snapshot || {};
  if (!telegramReady()) throw new Error("\u0625\u0639\u062F\u0627\u062F\u0627\u062A Telegram \u063A\u064A\u0631 \u0645\u0643\u062A\u0645\u0644\u0629");
  if (snap.allReportsText || snap.reportText) await telegramBroadcast("sendMessage", { text: snap.allReportsText || snap.reportText });
  if (snap.allReportsImageBase64) await telegramBroadcast("sendPhoto", { base64: snap.allReportsImageBase64, filename: snap.allReportsImageName || "reports-summary.jpg", mime: "image/jpeg", caption: `\u0645\u0644\u062E\u0635 \u0627\u0644\u062A\u0642\u0627\u0631\u064A\u0631 \u2014 ${snap.storeName || "\u0643\u0627\u0634 \u062A\u0648\u0628 3"}` });
  if (snap.allReportsPdfBase64) await telegramBroadcast("sendDocument", { base64: snap.allReportsPdfBase64, filename: snap.allReportsPdfName || "all-reports.pdf", mime: "application/pdf", caption: `\u062C\u0645\u064A\u0639 \u0627\u0644\u062A\u0642\u0627\u0631\u064A\u0631 \u2014 ${snap.storeName || "\u0643\u0627\u0634 \u062A\u0648\u0628 3"}` });
  else if (snap.dailyPdfBase64) await telegramBroadcast("sendDocument", { base64: snap.dailyPdfBase64, filename: snap.dailyPdfName || "daily-report.pdf", mime: "application/pdf", caption: "\u0627\u0644\u062A\u0642\u0631\u064A\u0631 \u0627\u0644\u064A\u0648\u0645\u064A" });
  if (snap.customerPdfBase64) await telegramBroadcast("sendDocument", { base64: snap.customerPdfBase64, filename: snap.customerPdfName || "customers-debts.pdf", mime: "application/pdf", caption: "\u062A\u0642\u0631\u064A\u0631 \u0627\u0644\u0639\u0645\u0644\u0627\u0621 \u0648\u0627\u0644\u062F\u064A\u0648\u0646" });
}
async function sendStoredBackup() {
  const snap = telegramState.snapshot || {};
  if (!telegramReady()) throw new Error("\u0625\u0639\u062F\u0627\u062F\u0627\u062A Telegram \u063A\u064A\u0631 \u0645\u0643\u062A\u0645\u0644\u0629");
  if (!snap.backupBase64) throw new Error("\u0644\u0627 \u062A\u0648\u062C\u062F \u0646\u0633\u062E\u0629 \u0627\u062D\u062A\u064A\u0627\u0637\u064A\u0629 \u0645\u0631\u0641\u0648\u0639\u0629");
  await telegramBroadcast("sendDocument", { base64: snap.backupBase64, filename: snap.backupName || "CashTop3_Backup.json", mime: "application/json", caption: `\u0646\u0633\u062E\u0629 \u0627\u062D\u062A\u064A\u0627\u0637\u064A\u0629 \u2014 ${snap.storeName || "\u0643\u0627\u0634 \u062A\u0648\u0628 3"}` });
}
async function handleTelegram(req, res, origin) {
  let body;
  try {
    body = await readBody(req, 90 * 1024 * 1024);
  } catch (e) {
    return sendJson(res, 400, { ok: false, error: e.message }, origin);
  }
  try {
    const action = String(body.action || "");
    if (action === "status") return sendJson(res, 200, { ok: true, configured: telegramReady(), dailyReportEnabled: !!telegramState.config.dailyReportEnabled, dailyBackupEnabled: !!telegramState.config.dailyBackupEnabled, lastDailyReportSentAt: telegramState.lastDailyReportSentAt || 0, lastDailyBackupSentAt: telegramState.lastDailyBackupSentAt || 0, hasSnapshot: !!telegramState.snapshot?.dailyPdfBase64 }, origin);
    if (action === "save_config") {
      const c = body.config || {}, prevR = !!telegramState.config.dailyReportEnabled, prevB = !!telegramState.config.dailyBackupEnabled;
      telegramState.config = { ...telegramState.config, token: String(TELEGRAM_BOT_TOKEN || "").trim(), chatIds: String(c.chatIds ?? "").trim(), dailyReportEnabled: !!c.dailyReportEnabled, dailyBackupEnabled: !!c.dailyBackupEnabled };
      const now = Date.now();
      if (!prevR && telegramState.config.dailyReportEnabled) telegramState.lastDailyReportSentAt = now;
      persistTelegramState();
      return sendJson(res, 200, { ok: true, configured: telegramReady() }, origin);
    }
    if (action === "snapshot") {
      telegramState.snapshot = { ...telegramState.snapshot, ...body.snapshot || {}, updatedAt: Date.now() };
      persistTelegramState();
      return sendJson(res, 200, { ok: true }, origin);
    }
    if (action === "upload_customer_report") {
      telegramState.snapshot = { ...telegramState.snapshot, customerPdfBase64: String(body.pdfBase64 || ""), customerPdfName: String(body.pdfName || "customers-debts.pdf"), updatedAt: Date.now() };
      persistTelegramState();
      return sendJson(res, 200, { ok: true }, origin);
    }
    if (action === "upload_all_reports") {
      telegramState.snapshot = { ...telegramState.snapshot, allReportsPdfBase64: String(body.pdfBase64 || ""), allReportsPdfName: String(body.pdfName || "all-reports.pdf"), allReportsImageBase64: String(body.imageBase64 || ""), allReportsImageName: String(body.imageName || "reports-summary.jpg"), allReportsText: String(body.text || ""), updatedAt: Date.now() };
      persistTelegramState();
      return sendJson(res, 200, { ok: true }, origin);
    }
    if (action === "upload_backup") {
      telegramState.snapshot = { ...telegramState.snapshot, backupBase64: String(body.backupBase64 || ""), backupName: String(body.backupName || "CashTop3_Backup.json"), updatedAt: Date.now() };
      persistTelegramState();
      return sendJson(res, 200, { ok: true }, origin);
    }
    if (action === "mark_backup_sent") {
      telegramState.lastDailyBackupSentAt = Math.max(Number(body.sentAt || 0) || 0, Date.now() - 1e3);
      persistTelegramState();
      return sendJson(res, 200, { ok: true, lastDailyBackupSentAt: telegramState.lastDailyBackupSentAt }, origin);
    }
    if (action === "send_daily_now") {
      await sendStoredDailyReport();
      telegramState.lastDailyReportSentAt = Date.now();
      persistTelegramState();
      return sendJson(res, 200, { ok: true }, origin);
    }
    if (action === "send_customer_report") {
      await sendStoredCustomerReport();
      return sendJson(res, 200, { ok: true }, origin);
    }
    if (action === "send_all_reports") {
      await sendStoredAllReports();
      return sendJson(res, 200, { ok: true }, origin);
    }
    if (action === "send_backup") {
      await sendStoredBackup();
      telegramState.lastDailyBackupSentAt = Date.now();
      persistTelegramState();
      return sendJson(res, 200, { ok: true }, origin);
    }
    return sendJson(res, 400, { ok: false, error: "\u0623\u0645\u0631 Telegram \u063A\u064A\u0631 \u0645\u0639\u0631\u0648\u0641" }, origin);
  } catch (e) {
    console.error("Telegram error:", e);
    return sendJson(res, 502, { ok: false, error: String(e?.message || e) }, origin);
  }
}
async function checkTelegramSchedules() {
  if (!telegramReady()) return;
  const now = Date.now(), day = 24 * 60 * 60 * 1e3;
  try {
    if (telegramState.config.dailyReportEnabled && telegramState.snapshot?.dailyPdfBase64 && now - numSafe(telegramState.lastDailyReportSentAt) >= day) {
      await sendStoredDailyReport();
      telegramState.lastDailyReportSentAt = now;
      persistTelegramState();
    }
  } catch (e) {
    console.error("Scheduled daily report failed:", e?.message || e);
  }
  try {
    if (telegramState.config.dailyBackupEnabled && telegramState.snapshot?.backupBase64 && now - numSafe(telegramState.lastDailyBackupSentAt) >= day) {
      await sendStoredBackup();
      telegramState.lastDailyBackupSentAt = now;
      persistTelegramState();
    }
  } catch (e) {
    console.error("Scheduled backup failed:", e?.message || e);
  }
}
function numSafe(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function readPortalShortLinks() {
  try {
    const parsed = JSON.parse(fs.readFileSync(PORTAL_SHORTLINKS_FILE, "utf8"));
    return parsed && typeof parsed === "object" ? parsed : { links: {} };
  } catch {
    return { links: {} };
  }
}
function writePortalShortLinks(state) {
  try {
    fs.writeFileSync(PORTAL_SHORTLINKS_FILE, JSON.stringify(state, null, 2), "utf8");
    return true;
  } catch (e) {
    console.error("Portal short-link write error:", e);
    return false;
  }
}
function portalShortKey(companyCode, customerCode) {
  return `${String(companyCode || "").toUpperCase()}:${String(customerCode || "").toUpperCase()}`;
}
async function handleCustomerShortLink(req, res, origin) {
  const url = new URL(req.url, "http://localhost");
  if (req.method === "GET") {
    const c = String(url.searchParams.get("c") || "").toUpperCase(), u = String(url.searchParams.get("u") || "").toUpperCase();
    if (!/^[A-Z2-9]{5}$/.test(c) || !/^[A-Z2-9]{5}$/.test(u)) return sendJson(res, 400, { ok: false, error: "\u0643\u0648\u062F \u0627\u0644\u0631\u0627\u0628\u0637 \u063A\u064A\u0631 \u0635\u0627\u0644\u062D" }, origin);
    const state = readPortalShortLinks(), row = state.links?.[portalShortKey(c, u)];
    if (!row?.accessCode) return sendJson(res, 404, { ok: false, error: "\u0627\u0644\u0631\u0627\u0628\u0637 \u0627\u0644\u0645\u062E\u062A\u0635\u0631 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F" }, origin);
    return sendJson(res, 200, { ok: true, accessCode: row.accessCode, companyCode: c, customerCode: u }, origin);
  }
  if (req.method === "POST") {
    let body;
    try {
      body = await readBody(req, 256 * 1024);
    } catch (e) {
      return sendJson(res, 400, { ok: false, error: e.message }, origin);
    }
    const c = String(body?.companyCode || "").toUpperCase(), u = String(body?.customerCode || "").toUpperCase(), accessCode = String(body?.accessCode || "").trim();
    if (!/^[A-Z2-9]{5}$/.test(c) || !/^[A-Z2-9]{5}$/.test(u) || !accessCode.startsWith("cp1.")) return sendJson(res, 400, { ok: false, error: "\u0628\u064A\u0627\u0646\u0627\u062A \u0627\u0644\u0631\u0627\u0628\u0637 \u0627\u0644\u0645\u062E\u062A\u0635\u0631 \u063A\u064A\u0631 \u0635\u0627\u0644\u062D\u0629" }, origin);
    const state = readPortalShortLinks();
    state.links = state.links || {};
    state.links[portalShortKey(c, u)] = { accessCode, companyId: String(body?.companyId || ""), customerId: String(body?.customerId || ""), updatedAt: (/* @__PURE__ */ new Date()).toISOString() };
    const keys = Object.keys(state.links);
    if (keys.length > 12e3) {
      keys.sort((a, b) => String(state.links[a]?.updatedAt || "").localeCompare(String(state.links[b]?.updatedAt || ""))).slice(0, keys.length - 1e4).forEach((k) => delete state.links[k]);
    }
    if (!writePortalShortLinks(state)) return sendJson(res, 500, { ok: false, error: "\u062A\u0639\u0630\u0631 \u062D\u0641\u0638 \u0627\u0644\u0631\u0627\u0628\u0637 \u0627\u0644\u0645\u062E\u062A\u0635\u0631" }, origin);
    return sendJson(res, 200, { ok: true }, origin);
  }
  return sendJson(res, 405, { ok: false, error: "GET/POST \u0641\u0642\u0637" }, origin);
}
var MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon"
};
var sendJson = (res, status, data, origin = "") => {
  const headers = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" };
  if (ALLOWED_ORIGIN && origin === ALLOWED_ORIGIN) headers["Access-Control-Allow-Origin"] = origin;
  res.writeHead(status, headers);
  res.end(JSON.stringify(data));
};
var readBody = (req, max = 28 * 1024 * 1024) => new Promise((resolve, reject) => {
  let size = 0, chunks = [];
  req.on("data", (chunk) => {
    size += chunk.length;
    if (size > max) {
      reject(new Error("\u0627\u0644\u0637\u0644\u0628 \u0643\u0628\u064A\u0631 \u062C\u062F\u0627\u064B"));
      req.destroy();
      return;
    }
    chunks.push(chunk);
  });
  req.on("end", () => {
    try {
      resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"));
    } catch {
      reject(new Error("JSON \u063A\u064A\u0631 \u0635\u0627\u0644\u062D"));
    }
  });
  req.on("error", reject);
});
function productImageTelegramUrl(method) {
  if (!PRODUCT_IMAGE_BOT_TOKEN) throw new Error("PRODUCT_IMAGE_BOT_TOKEN \u063A\u064A\u0631 \u0645\u0636\u0628\u0648\u0637 \u0639\u0644\u0649 \u0627\u0644\u062E\u0627\u062F\u0645");
  return `https://api.telegram.org/bot${PRODUCT_IMAGE_BOT_TOKEN}/${method}`;
}
async function productImageTelegramCall(method, payload = {}) {
  const response = await fetch(productImageTelegramUrl(method), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload || {}) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.ok === false) throw new Error(data?.description || `Telegram HTTP ${response.status}`);
  return data;
}
async function uploadProductImageBuffer(buffer, mime, filename) {
  if (!PRODUCT_IMAGE_CHAT_ID) throw new Error("PRODUCT_IMAGE_CHAT_ID \u063A\u064A\u0631 \u0645\u0636\u0628\u0648\u0637 \u0639\u0644\u0649 \u0627\u0644\u062E\u0627\u062F\u0645");
  const form = new FormData();
  form.append("chat_id", PRODUCT_IMAGE_CHAT_ID);
  form.append("disable_notification", "true");
  form.append("photo", new Blob([buffer], { type: mime }), filename || "product.jpg");
  const response = await fetch(productImageTelegramUrl("sendPhoto"), { method: "POST", body: form });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.ok === false) throw new Error(data?.description || `Telegram HTTP ${response.status}`);
  const photos = Array.isArray(data?.result?.photo) ? data.result.photo : [];
  const best = photos[photos.length - 1] || {};
  if (!best?.file_id) throw new Error("Telegram \u0644\u0645 \u064A\u0631\u062C\u0639 file_id \u0644\u0644\u0635\u0648\u0631\u0629.");
  return { fileId: String(best.file_id), fileUniqueId: String(best.file_unique_id || ""), mimeType: String(mime || "image/jpeg"), fileName: String(filename || "product.jpg") };
}
async function resolveProductImagePath(fileId, { force = false } = {}) {
  const id = String(fileId || "").trim();
  if (!id) throw new Error("file_id \u0645\u0637\u0644\u0648\u0628");
  const cached = productImagePathCache.get(id);
  if (!force && cached && cached.expiresAt > Date.now()) return cached.filePath;
  const data = await productImageTelegramCall("getFile", { file_id: id });
  const filePath = String(data?.result?.file_path || "").trim();
  if (!filePath) throw new Error("\u062A\u0639\u0630\u0631 \u0627\u0644\u062D\u0635\u0648\u0644 \u0639\u0644\u0649 \u0645\u0633\u0627\u0631 \u0627\u0644\u0635\u0648\u0631\u0629 \u0645\u0646 Telegram.");
  productImagePathCache.set(id, { filePath, expiresAt: Date.now() + 45 * 60 * 1e3 });
  return filePath;
}
async function fetchProductImageFile(fileId, { force = false } = {}) {
  const filePath = await resolveProductImagePath(fileId, { force });
  const url = `https://api.telegram.org/file/bot${PRODUCT_IMAGE_BOT_TOKEN}/${filePath}`;
  const response = await fetch(url, { cache: "no-store" });
  if (response.ok) return response;
  if (!force) {
    productImagePathCache.delete(String(fileId || ""));
    return fetchProductImageFile(fileId, { force: true });
  }
  throw new Error(`Telegram file HTTP ${response.status}`);
}
async function handleProductImageUpload(req, res, origin) {
  let body;
  try {
    body = await readBody(req, 12 * 1024 * 1024);
  } catch (e) {
    return sendJson(res, 400, { ok: false, error: e.message }, origin);
  }
  const raw = String(body?.dataUrl || ""), match = raw.match(/^data:(image\/(?:png|jpe?g|webp));base64,(.+)$/s);
  if (!match) return sendJson(res, 400, { ok: false, error: "\u0635\u0648\u0631\u0629 \u063A\u064A\u0631 \u0635\u0627\u0644\u062D\u0629. \u0627\u0633\u062A\u062E\u062F\u0645 PNG \u0623\u0648 JPG \u0623\u0648 WEBP." }, origin);
  let buffer;
  try {
    buffer = Buffer.from(match[2], "base64");
  } catch (_) {
    buffer = null;
  }
  if (!buffer?.length) return sendJson(res, 400, { ok: false, error: "\u0628\u064A\u0627\u0646\u0627\u062A \u0627\u0644\u0635\u0648\u0631\u0629 \u0641\u0627\u0631\u063A\u0629." }, origin);
  if (buffer.length > 8 * 1024 * 1024) return sendJson(res, 413, { ok: false, error: "\u062D\u062C\u0645 \u0627\u0644\u0635\u0648\u0631\u0629 \u0623\u0643\u0628\u0631 \u0645\u0646 \u0627\u0644\u062D\u062F \u0627\u0644\u0645\u0633\u0645\u0648\u062D." }, origin);
  const fallbackExt = match[1].includes("png") ? "png" : match[1].includes("webp") ? "webp" : "jpg";
  const safeName = String(body?.filename || `product.${fallbackExt}`).replace(/[\\/:*?"<>|]+/g, "-").slice(0, 120) || `product.${fallbackExt}`;
  try {
    const saved = await uploadProductImageBuffer(buffer, match[1], safeName);
    return sendJson(res, 200, { ok: true, ...saved, url: `/api/oscar-product-image?file_id=${encodeURIComponent(saved.fileId)}` }, origin);
  } catch (e) {
    return sendJson(res, 502, { ok: false, error: String(e?.message || e) }, origin);
  }
}
async function handleProductImageGet(req, res, origin) {
  let fileId = "";
  try {
    fileId = new URL(req.url, "http://localhost").searchParams.get("file_id") || "";
  } catch (_) {
  }
  if (!fileId) {
    res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
    return res.end("file_id required");
  }
  try {
    const upstream = await fetchProductImageFile(fileId);
    const type = upstream.headers.get("content-type") || "image/webp";
    const length = upstream.headers.get("content-length");
    const headers = { "Content-Type": type, "Cache-Control": "private, max-age=300, stale-while-revalidate=3600", "X-Content-Type-Options": "nosniff" };
    if (length) headers["Content-Length"] = length;
    if (ALLOWED_ORIGIN && origin === ALLOWED_ORIGIN) headers["Access-Control-Allow-Origin"] = origin;
    res.writeHead(200, headers);
    if (req.method === "HEAD") return res.end();
    const ab = await upstream.arrayBuffer();
    return res.end(Buffer.from(ab));
  } catch (e) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" });
    return res.end("Product image unavailable");
  }
}
var stripFence = (text = "") => String(text).trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
var parseJsonLoose = (text = "") => {
  const clean = stripFence(text);
  try {
    return JSON.parse(clean);
  } catch {
  }
  const first = clean.indexOf("{"), last = clean.lastIndexOf("}");
  if (first >= 0 && last > first) {
    try {
      return JSON.parse(clean.slice(first, last + 1));
    } catch {
    }
  }
  return null;
};
async function callOpenRouter(messages, { temperature = 0.15, max_tokens = 2200 } = {}) {
  if (!OPENROUTER_API_KEY) throw new Error("OPENROUTER_API_KEY \u063A\u064A\u0631 \u0645\u0636\u0628\u0648\u0637 \u0639\u0644\u0649 \u0627\u0644\u062E\u0627\u062F\u0645");
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
      "X-Title": "Cash Top 3 POS AI"
    },
    body: JSON.stringify({ model: OPENROUTER_MODEL, messages, temperature, max_tokens })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error?.message || data?.message || `OpenRouter HTTP ${response.status}`);
  const content = data?.choices?.[0]?.message?.content;
  if (Array.isArray(content)) return content.map((x) => x?.text || "").join("\n");
  return String(content || "");
}
var assistantSystem = `\u0623\u0646\u062A "\u0645\u0633\u0627\u0639\u062F \u0643\u0627\u0634 \u062A\u0648\u0628 AI" \u062F\u0627\u062E\u0644 \u0646\u0638\u0627\u0645 \u0645\u062D\u0627\u0633\u0628\u0629 \u0648\u0646\u0642\u0627\u0637 \u0628\u064A\u0639 \u0639\u0631\u0628\u064A RTL.
\u062A\u062C\u064A\u0628 \u0641\u0642\u0637 \u0628\u0646\u0627\u0621\u064B \u0639\u0644\u0649 \u0628\u064A\u0627\u0646\u0627\u062A \u0627\u0644\u0646\u0638\u0627\u0645 \u0627\u0644\u0645\u0631\u0633\u0644\u0629 \u0641\u064A context\u060C \u0648\u0644\u0627 \u062A\u062E\u062A\u0631\u0639 \u0623\u0631\u0642\u0627\u0645\u0627\u064B \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F\u0629.
\u0627\u0641\u0647\u0645 \u0627\u0644\u0639\u0631\u0628\u064A\u0629 \u0627\u0644\u0639\u0627\u0645\u064A\u0629 \u0648\u0627\u0644\u0641\u0635\u062D\u0649. \u0627\u0644\u0639\u0645\u0644\u0629 \u0645\u0648\u062C\u0648\u062F\u0629 \u0641\u064A context.currency.
\u064A\u0645\u0643\u0646\u0643: \u062A\u062D\u0644\u064A\u0644 \u0627\u0644\u0645\u0628\u064A\u0639\u0627\u062A\u060C \u0627\u0644\u0645\u0634\u062A\u0631\u064A\u0627\u062A\u060C \u0627\u0644\u0645\u062E\u0632\u0648\u0646\u060C \u0627\u0644\u0623\u0635\u0646\u0627\u0641 \u0627\u0644\u0646\u0627\u0642\u0635\u0629\u060C \u0627\u0644\u062F\u064A\u0648\u0646\u060C \u0627\u0644\u0645\u0648\u0631\u062F\u064A\u0646\u060C \u0627\u0644\u0645\u0635\u0631\u0648\u0641\u0627\u062A\u060C \u0623\u062F\u0627\u0621 \u0627\u0644\u0645\u0637\u0639\u0645\u060C \u0643\u0634\u0641 \u0627\u0644\u0645\u0624\u0634\u0631\u0627\u062A \u063A\u064A\u0631 \u0627\u0644\u0645\u0639\u062A\u0627\u062F\u0629\u060C \u0648\u0627\u0642\u062A\u0631\u0627\u062D \u0643\u0645\u064A\u0627\u062A \u0634\u0631\u0627\u0621 \u0628\u0634\u0643\u0644 \u062A\u0642\u0631\u064A\u0628\u064A \u0645\u0639 \u062A\u0648\u0636\u064A\u062D \u0623\u0646\u0647\u0627 \u0627\u0642\u062A\u0631\u0627\u062D\u0627\u062A.
\u0625\u0630\u0627 \u0637\u0644\u0628 \u0627\u0644\u0645\u0633\u062A\u062E\u062F\u0645 \u062A\u0633\u062C\u064A\u0644 \u0645\u0635\u0631\u0648\u0641 \u0628\u0635\u064A\u063A\u0629 \u0637\u0628\u064A\u0639\u064A\u0629\u060C \u0627\u0633\u062A\u062E\u0631\u062C \u0627\u0644\u0645\u0628\u0644\u063A \u0648\u0627\u0644\u0628\u0646\u062F \u0648\u0627\u0644\u0645\u0644\u0627\u062D\u0638\u0627\u062A \u0641\u0642\u0637 \u0648\u0644\u0627 \u062A\u062D\u0641\u0638\u0647 \u0645\u0628\u0627\u0634\u0631\u0629. \u0623\u0631\u062C\u0639 action \u0645\u0646 \u0646\u0648\u0639 expense_draft \u062D\u062A\u0649 \u064A\u0631\u0627\u062C\u0639 \u0627\u0644\u0645\u0633\u062A\u062E\u062F\u0645 \u0642\u0628\u0644 \u0627\u0644\u062D\u0641\u0638.
\u0625\u0630\u0627 \u0637\u0644\u0628 \u0641\u062A\u062D \u0634\u0627\u0634\u0629\u060C \u0627\u0633\u062A\u062E\u062F\u0645 action \u0645\u0646 \u0646\u0648\u0639 navigate. \u0627\u0644\u0634\u0627\u0634\u0627\u062A \u0627\u0644\u0645\u0633\u0645\u0648\u062D\u0629: pos,sales,purchases,products,inventory,customers,suppliers,accounts,expenses,reports,restaurant_tables,restaurant_waiter,restaurant_kitchen.
\u0625\u0630\u0627 \u0637\u0644\u0628 \u062A\u0639\u0628\u0626\u0629 \u0641\u0627\u062A\u0648\u0631\u0629 \u0645\u0634\u062A\u0631\u064A\u0627\u062A \u0645\u0646 \u0635\u0648\u0631\u0629\u060C \u0648\u062C\u0651\u0647\u0647 \u0625\u0644\u0649 \u0634\u0627\u0634\u0629 \u0627\u0644\u0645\u0634\u062A\u0631\u064A\u0627\u062A \u0648\u0627\u0633\u062A\u062E\u062F\u0645 action type purchase.
\u0644\u0627 \u062A\u062F\u0651\u0639\u064A \u0623\u0646 \u062A\u0642\u0631\u064A\u0631 PDF/Excel \u062A\u0645 \u062A\u0646\u0632\u064A\u0644\u0647 \u0625\u0630\u0627 \u0644\u0645 \u064A\u062D\u062F\u062B. \u064A\u0645\u0643\u0646\u0643 \u062A\u0644\u062E\u064A\u0635 \u0627\u0644\u0628\u064A\u0627\u0646\u0627\u062A \u0623\u0648 \u062A\u0648\u062C\u064A\u0647\u0647 \u0625\u0644\u0649 \u0634\u0627\u0634\u0629 \u0627\u0644\u062A\u0642\u0627\u0631\u064A\u0631.
\u0623\u0631\u062C\u0639 JSON \u0641\u0642\u0637 \u0628\u0627\u0644\u0634\u0643\u0644:
{"answer":"\u0646\u0635 \u0639\u0631\u0628\u064A \u0648\u0627\u0636\u062D \u0648\u0645\u062E\u062A\u0635\u0631","action":null}
\u0623\u0648 action:
{"answer":"...","action":{"type":"navigate","tab":"reports","label":"\u0641\u062A\u062D \u0627\u0644\u062A\u0642\u0627\u0631\u064A\u0631"}}
\u0623\u0648:
{"answer":"\u0631\u0627\u062C\u0639\u062A \u0627\u0644\u0645\u0635\u0631\u0648\u0641...","action":{"type":"expense_draft","label":"\u0645\u0631\u0627\u062C\u0639\u0629 \u0627\u0644\u0645\u0635\u0631\u0648\u0641 \u0642\u0628\u0644 \u0627\u0644\u062D\u0641\u0638","data":{"amount":250,"category":"\u0623\u062C\u0648\u0631 \u0648\u0631\u0648\u0627\u062A\u0628 \u0639\u0645\u0627\u0644","notes":"\u0623\u062C\u0631\u0629 \u0639\u0645\u0627\u0644"}}}
\u0628\u0646\u0648\u062F \u0627\u0644\u0645\u0635\u0631\u0648\u0641 \u0627\u0644\u0645\u0641\u0636\u0644\u0629: \u0646\u062B\u0631\u064A\u0627\u062A \u0648\u0636\u064A\u0627\u0641\u0629\u060C \u0643\u0647\u0631\u0628\u0627\u0621 \u0648\u0645\u064A\u0627\u0647\u060C \u0625\u064A\u062C\u0627\u0631 \u0627\u0644\u0645\u062D\u0644\u060C \u0623\u062C\u0648\u0631 \u0648\u0631\u0648\u0627\u062A\u0628 \u0639\u0645\u0627\u0644\u060C \u0635\u064A\u0627\u0646\u0629 \u0648\u0646\u0638\u0627\u0641\u0629\u060C \u0628\u0636\u0627\u0626\u0639 \u062A\u0627\u0644\u0641\u0629 \u0648\u0645\u0646\u062A\u0647\u064A\u0629\u060C \u0623\u0643\u064A\u0627\u0633 \u0648\u062A\u063A\u0644\u064A\u0641 \u0648\u0637\u0628\u0627\u0639\u0629\u060C \u0646\u0642\u0644 \u0648\u0634\u062D\u0646\u060C \u0623\u062E\u0631\u0649.`;
var scanSystem = `\u0623\u0646\u062A \u0645\u062D\u0631\u0643 \u0642\u0631\u0627\u0621\u0629 \u0641\u0648\u0627\u062A\u064A\u0631 \u0645\u0634\u062A\u0631\u064A\u0627\u062A \u0639\u0631\u0628\u064A/\u0625\u0646\u062C\u0644\u064A\u0632\u064A \u062F\u0642\u064A\u0642 \u062F\u0627\u062E\u0644 \u0646\u0638\u0627\u0645 \u0645\u062D\u0627\u0633\u0628\u0629.
\u0627\u0642\u0631\u0623 \u0627\u0644\u0635\u0648\u0631 \u0643\u0645\u0627 \u0647\u064A. \u0644\u0627 \u062A\u062E\u062A\u0631\u0639 \u0635\u0646\u0641\u0627\u064B \u0623\u0648 \u0631\u0642\u0645\u0627\u064B \u063A\u064A\u0631 \u0648\u0627\u0636\u062D. \u0625\u0630\u0627 \u0643\u0627\u0646 \u0627\u0644\u0631\u0642\u0645 \u063A\u064A\u0631 \u0645\u0624\u0643\u062F \u0636\u0639 confidence \u0645\u0646\u062E\u0641\u0636\u0627\u064B \u0623\u0648 null \u0644\u0644\u0642\u064A\u0645\u0629.
\u0627\u0633\u062A\u062E\u0631\u062C \u0627\u0644\u0645\u0648\u0631\u062F \u0648\u0631\u0642\u0645 \u0627\u0644\u0641\u0627\u062A\u0648\u0631\u0629 \u0648\u0627\u0644\u062A\u0627\u0631\u064A\u062E \u0648\u0627\u0644\u0639\u0645\u0644\u0629 \u0648\u0627\u0644\u062E\u0635\u0645 \u0648\u0627\u0644\u0645\u062F\u0641\u0648\u0639 \u0625\u0646 \u0638\u0647\u0631\u060C \u0648\u0643\u0644 \u0628\u0646\u0648\u062F \u0627\u0644\u0641\u0627\u062A\u0648\u0631\u0629.
\u0627\u0641\u0647\u0645 \u0627\u0644\u0648\u062D\u062F\u0627\u062A \u0627\u0644\u0645\u062A\u0643\u0627\u0641\u0626\u0629 \u0644\u063A\u0648\u064A\u0627\u064B: \u062D\u0628\u0629/\u0642\u0637\u0639\u0629/pcs\u060C \u0643\u0631\u062A\u0648\u0646\u0629/\u0643\u0631\u062A\u0648\u0646/carton/box\u060C \u0628\u0627\u0643\u064A\u062A/pack\u060C \u0645\u0634\u0637\u0627\u062D/\u0637\u0628\u0644\u064A\u0629/pallet\u060C \u0643\u064A\u0644\u0648/kg\u060C \u063A\u0631\u0627\u0645/g\u060C \u0644\u062A\u0631/l\u060C \u0645\u0644/ml\u060C \u062F\u0632\u064A\u0646\u0629/dozen\u060C \u0643\u064A\u0633/bag.
\u0633\u0639\u0631 \u0627\u0644\u0648\u062D\u062F\u0629 \u0647\u0648 \u0627\u0644\u0633\u0639\u0631 \u0627\u0644\u0645\u0642\u0627\u0628\u0644 \u0644\u0648\u062D\u062F\u0629 \u0627\u0644\u0633\u0637\u0631 \u0641\u064A \u0627\u0644\u0635\u0648\u0631\u0629\u060C \u0648\u0627\u0644\u0643\u0645\u064A\u0629 \u0647\u064A \u0639\u062F\u062F \u062A\u0644\u0643 \u0627\u0644\u0648\u062D\u062F\u0629.
\u0642\u062F \u062A\u0643\u0648\u0646 \u0627\u0644\u0641\u0627\u062A\u0648\u0631\u0629 \u0639\u062F\u0629 \u0635\u0648\u0631\u061B \u0627\u062C\u0645\u0639\u0647\u0627 \u0645\u0639\u0627\u064B \u0648\u062A\u062C\u0646\u0628 \u062A\u0643\u0631\u0627\u0631 \u0627\u0644\u0628\u0646\u0648\u062F \u0625\u0630\u0627 \u0643\u0627\u0646\u062A \u0627\u0644\u0635\u0648\u0631 \u0645\u062A\u062F\u0627\u062E\u0644\u0629.
\u0623\u0631\u062C\u0639 JSON \u0641\u0642\u0637\u060C \u0628\u0644\u0627 Markdown\u060C \u0628\u0627\u0644\u0634\u0643\u0644 \u0627\u0644\u062A\u0627\u0644\u064A:
{
 "supplier":{"name":"","phone":"","taxNumber":""},
 "invoiceNumber":"", "date":"YYYY-MM-DD \u0623\u0648 null", "currency":"", "subtotal":0, "discount":0, "grandTotal":0, "paidAmount":null,
 "items":[{"name":"","barcode":"","unit":"","quantity":1,"unitPrice":0,"total":0,"confidence":0.0}],
 "confidence":0.0,
 "warnings":["..."]
}
\u0625\u0630\u0627 \u0644\u0645 \u064A\u0638\u0647\u0631 \u062D\u0642\u0644 \u0627\u062A\u0631\u0643\u0647 \u0641\u0627\u0631\u063A\u0627\u064B \u0623\u0648 null. \u0644\u0627 \u062A\u0633\u062A\u0646\u062A\u062C \u0623\u0633\u0639\u0627\u0631\u0627\u064B \u063A\u064A\u0631 \u0638\u0627\u0647\u0631\u0629 \u0625\u0644\u0627 \u0625\u0630\u0627 \u0643\u0627\u0646 total \u0648quantity \u0648\u0627\u0636\u062D\u064A\u0646 \u0648\u064A\u0645\u0643\u0646 \u062D\u0633\u0627\u0628 unitPrice \u0631\u064A\u0627\u0636\u064A\u0627\u064B\u061B \u0648\u0627\u0644\u0639\u0643\u0633 \u0635\u062D\u064A\u062D.`;
async function handleAI(req, res, origin) {
  if (!OPENROUTER_API_KEY) return sendJson(res, 503, { error: "\u062E\u0627\u062F\u0645 Cash Top AI \u062C\u0627\u0647\u0632 \u0644\u0643\u0646 \u0645\u0641\u062A\u0627\u062D OpenRouter \u063A\u064A\u0631 \u0645\u0636\u0628\u0648\u0637. \u0627\u0636\u0628\u0637 OPENROUTER_API_KEY \u062B\u0645 \u0623\u0639\u062F \u062A\u0634\u063A\u064A\u0644 \u0627\u0644\u062E\u0627\u062F\u0645." }, origin);
  let body;
  try {
    body = await readBody(req);
  } catch (e) {
    return sendJson(res, 400, { error: e.message }, origin);
  }
  try {
    if (body.task === "health") return sendJson(res, 200, { ok: true, model: OPENROUTER_MODEL }, origin);
    if (body.task === "purchase_invoice_scan") {
      const images = Array.isArray(body.images) ? body.images.filter((x) => typeof x === "string" && x.startsWith("data:image/")).slice(0, 6) : [];
      if (!images.length) return sendJson(res, 400, { error: "\u0644\u0645 \u062A\u0635\u0644 \u0635\u0648\u0631\u0629 \u0641\u0627\u062A\u0648\u0631\u0629 \u0635\u0627\u0644\u062D\u0629" }, origin);
      const catalog = body.catalog || {};
      const supplierNames = (catalog.suppliers || []).slice(0, 250).map((x) => x?.name).filter(Boolean);
      const productList = (catalog.products || []).slice(0, 600).map((p) => ({ name: p?.name, sku: p?.sku, units: (p?.units || []).map((u) => u?.name).filter(Boolean) }));
      const text = `\u0627\u0642\u0631\u0623 \u0641\u0627\u062A\u0648\u0631\u0629 \u0627\u0644\u0645\u0634\u062A\u0631\u064A\u0627\u062A \u0645\u0646 \u0627\u0644\u0635\u0648\u0631. \u0647\u0630\u0647 \u0623\u0633\u0645\u0627\u0621 \u0645\u0646 \u0627\u0644\u0646\u0638\u0627\u0645 \u0644\u0644\u0645\u0633\u0627\u0639\u062F\u0629 \u0639\u0644\u0649 \u0627\u0644\u062A\u0639\u0631\u0641 \u0648\u0627\u0644\u0645\u0637\u0627\u0628\u0642\u0629 \u0641\u0642\u0637\u060C \u0648\u0644\u0627 \u062A\u062C\u0628\u0631 \u0627\u0644\u062A\u0637\u0627\u0628\u0642 \u0625\u0630\u0627 \u0627\u0644\u0635\u0648\u0631\u0629 \u0645\u062E\u062A\u0644\u0641\u0629.
\u0627\u0644\u0645\u0648\u0631\u062F\u0648\u0646 \u0627\u0644\u0645\u0648\u062C\u0648\u062F\u0648\u0646: ${JSON.stringify(supplierNames)}
\u0627\u0644\u0623\u0635\u0646\u0627\u0641 \u0648\u0627\u0644\u0648\u062D\u062F\u0627\u062A \u0627\u0644\u0645\u0648\u062C\u0648\u062F\u0629: ${JSON.stringify(productList)}`;
      const content = [{ type: "text", text }, ...images.map((url) => ({ type: "image_url", image_url: { url } }))];
      const raw = await callOpenRouter([{ role: "system", content: scanSystem }, { role: "user", content }], { temperature: 0.05, max_tokens: 4e3 });
      const parsed = parseJsonLoose(raw);
      if (!parsed) throw new Error("\u062A\u0639\u0630\u0631 \u062A\u0641\u0633\u064A\u0631 \u0646\u062A\u064A\u062C\u0629 \u0642\u0631\u0627\u0621\u0629 \u0627\u0644\u0641\u0627\u062A\u0648\u0631\u0629. \u062D\u0627\u0648\u0644 \u0628\u0635\u0648\u0631\u0629 \u0623\u0648\u0636\u062D.");
      return sendJson(res, 200, { result: parsed, model: OPENROUTER_MODEL }, origin);
    }
    if (body.task === "assistant_chat") {
      const context = body.context || {};
      const history = (Array.isArray(body.history) ? body.history : []).slice(-10).map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", content: String(m.content || "").slice(0, 3e3) }));
      const message = String(body.message || "").slice(0, 4e3);
      const contextText = JSON.stringify(context).slice(0, 18e4);
      const messages = [{ role: "system", content: assistantSystem }, { role: "system", content: `\u0628\u064A\u0627\u0646\u0627\u062A \u0627\u0644\u0646\u0638\u0627\u0645 \u0627\u0644\u062D\u0627\u0644\u064A\u0629 (JSON):
${contextText}` }, ...history, { role: "user", content: message }];
      const raw = await callOpenRouter(messages, { temperature: 0.18, max_tokens: 1800 });
      const parsed = parseJsonLoose(raw);
      if (parsed?.answer) return sendJson(res, 200, { answer: String(parsed.answer), action: parsed.action || null, model: OPENROUTER_MODEL }, origin);
      return sendJson(res, 200, { answer: raw || "\u0644\u0645 \u064A\u0635\u0644 \u0631\u062F.", action: null, model: OPENROUTER_MODEL }, origin);
    }
    return sendJson(res, 400, { error: "\u0645\u0647\u0645\u0629 AI \u063A\u064A\u0631 \u0645\u0639\u0631\u0648\u0641\u0629" }, origin);
  } catch (e) {
    console.error("Cash Top AI error:", e);
    return sendJson(res, 502, { error: String(e?.message || e) }, origin);
  }
}
var notificationService = require_server_notifications()({ dataDir: TELEGRAM_DATA_DIR, readBody, sendJson });
var server = http.createServer(async (req, res) => {
  const origin = String(req.headers.origin || "");
  if (req.url.split("?")[0] === "/api/notifications") return notificationService.route(req, res, origin);
  if (req.method === "OPTIONS" && (req.url.startsWith("/api/oscar-ai") || req.url.startsWith("/api/oscar-telegram") || req.url.startsWith("/api/telegram") || req.url.startsWith("/api/oscar-product-image") || req.url.startsWith("/api/customer-short-link"))) {
    const headers = { "Access-Control-Allow-Methods": "GET, POST, HEAD, OPTIONS", "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Max-Age": "86400" };
    if (ALLOWED_ORIGIN && origin === ALLOWED_ORIGIN) headers["Access-Control-Allow-Origin"] = origin;
    res.writeHead(204, headers);
    return res.end();
  }
  if (req.url.startsWith("/api/customer-short-link")) {
    return handleCustomerShortLink(req, res, origin);
  }
  if (req.url.startsWith("/api/oscar-product-image")) {
    if (req.method === "POST") return handleProductImageUpload(req, res, origin);
    if (req.method === "GET" || req.method === "HEAD") return handleProductImageGet(req, res, origin);
    return sendJson(res, 405, { ok: false, error: "GET/POST \u0641\u0642\u0637" }, origin);
  }
  if (req.url.startsWith("/api/oscar-ai")) {
    if (req.method !== "POST") return sendJson(res, 405, { error: "POST \u0641\u0642\u0637" }, origin);
    return handleAI(req, res, origin);
  }
  if (req.url.startsWith("/api/oscar-telegram")) {
    if (req.method !== "POST") return sendJson(res, 405, { ok: false, error: "POST \u0641\u0642\u0637" }, origin);
    return handleTelegram(req, res, origin);
  }
  if (req.url.startsWith("/api/telegram/resolve")) {
    if (req.method !== "POST") return sendJson(res, 405, { ok: false, error: "POST \u0641\u0642\u0637" }, origin);
    return handleTelegramResolve(req, res, origin);
  }
  if (req.url.startsWith("/api/telegram/users")) {
    if (req.method !== "POST") return sendJson(res, 405, { ok: false, error: "POST \u0641\u0642\u0637" }, origin);
    return handleTelegramUsers(req, res, origin);
  }
  if (req.url.startsWith("/api/telegram")) {
    if (req.method !== "POST") return sendJson(res, 405, { ok: false, error: "POST \u0641\u0642\u0637" }, origin);
    return handleTelegramProxy(req, res, origin);
  }
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405);
    return res.end("Method Not Allowed");
  }
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
  } catch {
    pathname = "/";
  }
  if (pathname === "/") pathname = "/index.html";
  const filePath = path.resolve(ROOT, "." + pathname);
  if (!filePath.startsWith(ROOT) || path.basename(filePath).startsWith(".")) {
    res.writeHead(403);
    return res.end("Forbidden");
  }
  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      return res.end("Not found");
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream", "Cache-Control": ext === ".html" ? "no-cache" : "public, max-age=300" });
    if (req.method === "HEAD") return res.end();
    fs.createReadStream(filePath).pipe(res);
  });
});
server.listen(PORT, () => {
  console.log(`Cash Top 3 + AI + Telegram: http://localhost:${PORT}`);
  setTimeout(() => checkTelegramSchedules().catch(() => {
  }), 5e3);
  const timer = setInterval(() => checkTelegramSchedules().catch(() => {
  }), 6e4);
  timer.unref?.();
});
