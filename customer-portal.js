// app/customer-portal-codec.js
var enc = new TextEncoder();
var dec = new TextDecoder();
var PORTAL_SECRET = "OSCAR-CUSTOMER-PORTAL-2026-V1|READONLY|MZAUTH";
function unb64url(text) {
  let s = String(text || "").replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  const bin = atob(s), out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
async function key() {
  const digest = await crypto.subtle.digest("SHA-256", enc.encode(PORTAL_SECRET));
  return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}
async function streamTransform(bytes, type) {
  const C = type === "compress" ? globalThis.CompressionStream : globalThis.DecompressionStream;
  if (!C) return null;
  try {
    const stream = new Blob([bytes]).stream().pipeThrough(new C("deflate"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  } catch (_) {
    return null;
  }
}
async function decodeCustomerPortalAccess(code) {
  const rawCode = String(code || "").trim().replace(/^#/, "");
  if (!rawCode.startsWith("cp1.")) throw new Error("\u0631\u0627\u0628\u0637 \u0627\u0644\u0639\u0645\u064A\u0644 \u063A\u064A\u0631 \u0635\u0627\u0644\u062D.");
  const raw = unb64url(rawCode.slice(4));
  if (raw.length < 30) throw new Error("\u0631\u0627\u0628\u0637 \u0627\u0644\u0639\u0645\u064A\u0644 \u063A\u064A\u0631 \u0645\u0643\u062A\u0645\u0644.");
  const flag = raw[0], iv = raw.slice(1, 13), cipher = raw.slice(13);
  let bytes;
  try {
    bytes = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv }, await key(), cipher));
  } catch (_) {
    throw new Error("\u062A\u0639\u0630\u0631 \u0641\u062A\u062D \u0631\u0627\u0628\u0637 \u0627\u0644\u0639\u0645\u064A\u0644 \u0623\u0648 \u062A\u0645 \u062A\u0639\u062F\u064A\u0644 \u0627\u0644\u0631\u0627\u0628\u0637.");
  }
  if (flag === 1) {
    const inflated = await streamTransform(bytes, "decompress");
    if (!inflated) throw new Error("\u062A\u0639\u0630\u0631 \u0641\u0643 \u0628\u064A\u0627\u0646\u0627\u062A \u0631\u0627\u0628\u0637 \u0627\u0644\u0639\u0645\u064A\u0644.");
    bytes = inflated;
  }
  let payload;
  try {
    payload = JSON.parse(dec.decode(bytes));
  } catch (_) {
    throw new Error("\u0628\u064A\u0627\u0646\u0627\u062A \u0631\u0627\u0628\u0637 \u0627\u0644\u0639\u0645\u064A\u0644 \u063A\u064A\u0631 \u0635\u0627\u0644\u062D\u0629.");
  }
  if (payload?.v !== 1 || !payload.d || !payload.t || !payload.c || !payload.u || !payload.n) throw new Error("\u0628\u064A\u0627\u0646\u0627\u062A \u0631\u0627\u0628\u0637 \u0627\u0644\u0639\u0645\u064A\u0644 \u063A\u064A\u0631 \u0645\u0643\u062A\u0645\u0644\u0629.");
  return payload;
}

// app/trial__config.js
var TRIAL_DATABASE = Object.freeze({
  databaseURL: "libsql://tgggg-amanwaraa.aws-ap-northeast-1.turso.io",
  authToken: "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3OTA3NTI5MTUsImlkIjoiMDFhMGYxMzAtZTYwMS03NGExLThkOTktMDJkMWUwZjYxODQ4Iiwia2lkIjoiMGZxOHFxN2dNaDhyMGRXNEtuaWRuRzFrZDdUNFBrMXZkZDAxaGZNOVNtUSIsInJpZCI6IjQ0NWFmNzdiLTEwM2ItNGNkNC1hYTNmLWIxNTI3ZDUwZjcxYiJ9.gpLweb2Pwv6dpt7eYhVJOQpiOcf7eqszxDZSoD1N1RjDzrtPEIEJjh6xvveMOcrolHJMRRZ7_8TAGF8zthvQAg",
  table: "oscar_rtdb"
});
var TRIAL_LIMITS = Object.freeze({
  products: 10,
  salesInvoices: 50,
  warehouses: 1,
  employees: 0,
  customers: 20,
  categories: 5,
  purchaseInvoices: 10,
  days: 10
});

// app/customer-portal.js
var $ = (s) => document.querySelector(s);
var esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
var num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
var date = (v) => {
  try {
    return new Intl.DateTimeFormat("ar-EG-u-nu-latn", { dateStyle: "medium", timeStyle: "short" }).format(new Date(v));
  } catch (_) {
    return String(v || "-");
  }
};
var money = (v, currency) => `${num(v).toFixed(2)} ${currency || ""}`;
var unwrap = (v) => v && typeof v === "object" && Object.prototype.hasOwnProperty.call(v, "v") ? v.deleted ? null : v.v : v;
var alive = (v) => v && !v.deletedAt;
var state = null;
async function resolvePortalAccessCode() {
  const params = new URLSearchParams(location.search);
  const c = String(params.get("c") || "").toUpperCase(), u = String(params.get("u") || "").toUpperCase();
  if (/^[A-Z2-9]{5}$/.test(c) && /^[A-Z2-9]{5}$/.test(u)) {
    const path = `oscar/public/customer_short_links/${c}/${u}`;
    const direct = window.OscarActivation?.tursoDirect;
    if (direct) {
      try {
        const row = await direct.readExact(TRIAL_DATABASE, path);
        if (row?.accessCode) return row.accessCode;
      } catch (_) {
      }
    }
    try {
      const response = await fetch(`/api/customer-short-link?c=${encodeURIComponent(c)}&u=${encodeURIComponent(u)}`, { cache: "no-store" });
      const data = await response.json().catch(() => null);
      if (response.ok && data?.accessCode) return data.accessCode;
    } catch (_) {
    }
    throw new Error("\u062A\u0639\u0630\u0631 \u0641\u062A\u062D \u0627\u0644\u0631\u0627\u0628\u0637 \u0627\u0644\u0645\u062E\u062A\u0635\u0631. \u0623\u0639\u062F \u0625\u0646\u0634\u0627\u0621 \u0631\u0627\u0628\u0637 \u0627\u0644\u0639\u0645\u064A\u0644 \u0645\u0646 \u0627\u0644\u0628\u0631\u0646\u0627\u0645\u062C \u062B\u0645 \u0623\u0631\u0633\u0644\u0647 \u0645\u0631\u0629 \u0623\u062E\u0631\u0649.");
  }
  return location.hash;
}
function fail(message) {
  document.getElementById("app").innerHTML = `<div class="error"><div class="error-box"><b>\u062A\u0639\u0630\u0631 \u0641\u062A\u062D \u0635\u0641\u062D\u0629 \u0627\u0644\u0639\u0645\u064A\u0644</b><div style="font-size:11px;margin-top:8px">${esc(message || "\u0627\u0644\u0631\u0627\u0628\u0637 \u063A\u064A\u0631 \u0635\u0627\u0644\u062D \u0623\u0648 \u0627\u0646\u062A\u0647\u062A \u0635\u0644\u0627\u062D\u064A\u062A\u0647.")}</div></div></div>`;
}
function prefix(companyId, store) {
  return `oscar/companies/${encodeURIComponent(companyId)}/d/${encodeURIComponent(store)}/`;
}
function exact(companyId, store, key2) {
  return prefix(companyId, store) + encodeURIComponent(String(key2));
}
async function readData(access) {
  const direct = window.OscarActivation?.tursoDirect;
  if (!direct) throw new Error("\u0645\u062D\u0631\u0643 \u0627\u0644\u0627\u062A\u0635\u0627\u0644 \u063A\u064A\u0631 \u0645\u062A\u0627\u062D.");
  const db = { databaseURL: access.d, authToken: access.t, table: "oscar_rtdb" };
  const companyPath = `oscar/companies/${encodeURIComponent(access.c)}/access/company`;
  const [companyRaw, customerRaw, settingsRaw, invoiceRows, voucherRows] = await Promise.all([
    direct.readExact(db, companyPath),
    direct.readExact(db, exact(access.c, "customers", access.u)),
    direct.readExact(db, exact(access.c, "settings", "store_config")),
    direct.listPrefix(db, prefix(access.c, "invoices")),
    direct.listPrefix(db, prefix(access.c, "vouchers"))
  ]);
  const company = unwrap(companyRaw) || {};
  if (company.status && company.status !== "active") throw new Error("\u0647\u0630\u0647 \u0627\u0644\u062E\u062F\u0645\u0629 \u063A\u064A\u0631 \u0645\u062A\u0627\u062D\u0629 \u062D\u0627\u0644\u064A\u0627\u064B.");
  if (company.endAt && Date.now() >= new Date(company.endAt).getTime()) throw new Error("\u0647\u0630\u0647 \u0627\u0644\u062E\u062F\u0645\u0629 \u063A\u064A\u0631 \u0645\u062A\u0627\u062D\u0629 \u062D\u0627\u0644\u064A\u0627\u064B.");
  const customer = unwrap(customerRaw);
  if (!customer || customer.deletedAt) throw new Error("\u062D\u0633\u0627\u0628 \u0627\u0644\u0639\u0645\u064A\u0644 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F.");
  if (String(customer.portalNonce || "") !== String(access.n || "")) throw new Error("\u062A\u0645 \u0625\u0635\u062F\u0627\u0631 \u0631\u0627\u0628\u0637 \u0623\u062D\u062F\u062B \u0644\u0647\u0630\u0627 \u0627\u0644\u0639\u0645\u064A\u0644. \u0627\u0637\u0644\u0628 \u0631\u0627\u0628\u0637\u0627\u064B \u062C\u062F\u064A\u062F\u0627\u064B \u0645\u0646 \u0627\u0644\u0645\u062A\u062C\u0631.");
  const settings = unwrap(settingsRaw) || {};
  const invoices = invoiceRows.map((r) => unwrap(r.payload)).filter((x) => alive(x) && String(x.customerId || "") === String(customer.id)).sort((a, b) => new Date(b.date || b.createdAt || 0) - new Date(a.date || a.createdAt || 0));
  const vouchers = voucherRows.map((r) => unwrap(r.payload)).filter((x) => alive(x) && x.partyType === "customer" && String(x.partyId || "") === String(customer.id)).sort((a, b) => new Date(b.date || b.createdAt || 0) - new Date(a.date || a.createdAt || 0));
  return { access, company, customer, settings, invoices, vouchers, db };
}
function movementRows(s) {
  const rows = [];
  for (const x of s.invoices) rows.push({ kind: "invoice", date: x.date || x.createdAt, data: x });
  for (const x of s.vouchers) rows.push({ kind: "voucher", date: x.date || x.createdAt, data: x });
  return rows.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
}
function invoiceCard(inv, currency) {
  const isReturn = inv.type === "return";
  const items = (inv.items || []).map((it) => `<div class="item"><div><div class="item-name">${esc(it.productName || "\u0635\u0646\u0641")}</div><div class="item-meta">${esc(it.unitName || "-")} \u2022 ${esc(it.quantity)} \xD7 ${money(it.unitPrice, currency)}</div></div><div class="item-total">${money(it.total, currency)}</div></div>`).join("");
  return `<div class="card"><button class="invoice-toggle" type="button"><div class="row"><div><span class="badge ${isReturn ? "return" : "sale"}">${isReturn ? "\u0645\u0631\u062A\u062C\u0639" : "\u0641\u0627\u062A\u0648\u0631\u0629 \u0628\u064A\u0639"}</span><div class="strong" style="margin-top:6px">#${esc(inv.invoiceNumber || "-")}</div><div class="muted">${date(inv.date || inv.createdAt)}</div></div><div style="text-align:left"><div class="amount ${isReturn ? "green" : ""}">${money(inv.grandTotal, currency)}</div><div class="muted">\u0645\u062F\u0641\u0648\u0639 ${money(inv.paidAmount, currency)}</div>${num(inv.remainingAmount) > 0 ? `<div class="muted red">\u0628\u0627\u0642\u064A ${money(inv.remainingAmount, currency)}</div>` : ""}</div></div></button><div class="details">${items || '<div class="muted">\u0644\u0627 \u062A\u0648\u062C\u062F \u0623\u0635\u0646\u0627\u0641 \u0645\u0633\u062C\u0644\u0629.</div>'}${inv.notes ? `<div class="notes"><b>\u0645\u0644\u0627\u062D\u0638\u0627\u062A:</b> ${esc(inv.notes)}</div>` : ""}</div></div>`;
}
function voucherCard(v, currency) {
  const receipt = v.type === "receipt";
  return `<div class="card"><div class="row"><div><span class="badge ${receipt ? "receipt" : "payment"}">${receipt ? "\u062F\u0641\u0639\u0629 / \u0633\u0646\u062F \u0642\u0628\u0636" : "\u0635\u0631\u0641 / \u0633\u062D\u0628"}</span><div class="strong" style="margin-top:6px">\u0633\u0646\u062F #${esc(v.voucherNumber || "-")}</div><div class="muted">${date(v.date || v.createdAt)}</div></div><div style="text-align:left"><div class="amount ${receipt ? "green" : "red"}">${receipt ? "+" : "-"} ${money(v.amount, currency)}</div>${v.notes ? `<div class="muted">${esc(v.notes)}</div>` : ""}</div></div></div>`;
}
function movementCard(m, currency) {
  return m.kind === "invoice" ? invoiceCard(m.data, currency) : voucherCard(m.data, currency);
}
function render(s) {
  const currency = s.settings.currencySymbol || "\u20AA", bal = num(s.customer.balance), totalInvoices = s.invoices.reduce((a, x) => a + num(x.grandTotal), 0), totalPaid = s.invoices.reduce((a, x) => a + num(x.paidAmount), 0) + s.vouchers.filter((v) => v.type === "receipt").reduce((a, x) => a + num(x.amount), 0);
  const logo = s.settings.logoSourceUrl || s.settings.logoUrl || "./brand-logo.png", store = s.settings.storeName || s.company.companyName || "\u0627\u0644\u0645\u062A\u062C\u0631";
  const paymentParams = new URLSearchParams();
  paymentParams.set("store", store);
  const incomingParams = new URLSearchParams(location.search);
  const shortC = incomingParams.get("c"), shortU = incomingParams.get("u");
  if (shortC && shortU) {
    paymentParams.set("c", shortC);
    paymentParams.set("u", shortU);
  }
  const paymentHref = `./\u0645\u0639\u062A\u0645\u062F.html?${paymentParams.toString()}${shortC && shortU ? "" : location.hash}`;
  const movements = movementRows(s);
  document.title = `${s.customer.name} - ${store}`;
  document.getElementById("app").innerHTML = `<div class="top"><div class="brand"><img class="logo" src="${esc(logo)}" onerror="this.onerror=null;this.src='./brand-logo.png'"><div><h1>${esc(store)}</h1><p>${esc(s.settings.subtitle || "\u0628\u0648\u0627\u0628\u0629 \u0627\u0644\u0639\u0645\u064A\u0644")}</p></div><button class="refresh" id="refreshBtn"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11a8 8 0 1 0-2.34 5.66"/><path d="M20 4v7h-7"/></svg><span>\u062A\u062D\u062F\u064A\u062B</span></button></div><div class="customer"><div class="hello">\u0645\u0631\u062D\u0628\u0627\u064B \u0628\u0643</div><div class="customer-name">${esc(s.customer.name)}</div>${s.customer.phone ? `<div class="hello">${esc(s.customer.phone)}</div>` : ""}</div></div><div class="content"><div class="balance-card"><div class="balance-label">\u0627\u0644\u0631\u0635\u064A\u062F \u0627\u0644\u062D\u0627\u0644\u064A</div><div class="balance ${bal > 0 ? "debt" : bal < 0 ? "credit" : "zero"}">${money(Math.abs(bal), currency)}</div><div class="balance-note">${bal > 0 ? "\u0645\u0628\u0644\u063A \u0645\u0633\u062A\u062D\u0642 \u0644\u0644\u0645\u062A\u062C\u0631" : bal < 0 ? "\u0631\u0635\u064A\u062F \u062F\u0627\u0626\u0646 \u0644\u0643 \u0644\u062F\u0649 \u0627\u0644\u0645\u062A\u062C\u0631" : "\u0627\u0644\u062D\u0633\u0627\u0628 \u062E\u0627\u0644\u0635 \u062D\u0627\u0644\u064A\u0627\u064B"}</div><div class="balance-actions"><a class="pay-btn" id="payBtn" href="${esc(paymentHref)}"><span class="pay-icon">\u20AA</span><span class="pay-copy">\u0633\u062F\u0627\u062F \u0627\u0644\u062F\u064A\u0646<small>\u0625\u0631\u0633\u0627\u0644 \u062F\u0641\u0639\u0629 \u0648\u0625\u064A\u0635\u0627\u0644</small></span></a></div></div><div class="stats"><div class="stat"><b>${s.invoices.length}</b><span>\u0627\u0644\u0641\u0648\u0627\u062A\u064A\u0631</span></div><div class="stat"><b>${s.vouchers.length}</b><span>\u0627\u0644\u062F\u0641\u0639\u0627\u062A \u0648\u0627\u0644\u0633\u0646\u062F\u0627\u062A</span></div><div class="stat"><b>${money(totalInvoices, currency)}</b><span>\u0625\u062C\u0645\u0627\u0644\u064A \u0627\u0644\u0641\u0648\u0627\u062A\u064A\u0631</span></div></div><div class="tabs"><button class="tab active" data-tab="moves">\u0627\u0644\u062D\u0631\u0643\u0627\u062A</button><button class="tab" data-tab="invoices">\u0627\u0644\u0641\u0648\u0627\u062A\u064A\u0631</button><button class="tab" data-tab="payments">\u0627\u0644\u062F\u0641\u0639\u0627\u062A</button></div><section class="section active" data-section="moves"><div class="section-title">\u062D\u0631\u0643\u0629 \u0627\u0644\u062D\u0633\u0627\u0628</div><div class="list">${movements.length ? movements.map((x) => movementCard(x, currency)).join("") : '<div class="empty">\u0644\u0627 \u062A\u0648\u062C\u062F \u062D\u0631\u0643\u0627\u062A \u0645\u0633\u062C\u0644\u0629 \u062D\u062A\u0649 \u0627\u0644\u0622\u0646.</div>'}</div></section><section class="section" data-section="invoices"><div class="section-title">\u0627\u0644\u0641\u0648\u0627\u062A\u064A\u0631 \u0628\u0627\u0644\u062A\u0641\u0635\u064A\u0644</div><div class="list">${s.invoices.length ? s.invoices.map((x) => invoiceCard(x, currency)).join("") : '<div class="empty">\u0644\u0627 \u062A\u0648\u062C\u062F \u0641\u0648\u0627\u062A\u064A\u0631 \u0645\u0633\u062C\u0644\u0629.</div>'}</div></section><section class="section" data-section="payments"><div class="section-title">\u0627\u0644\u062F\u0641\u0639\u0627\u062A \u0648\u0627\u0644\u0633\u062D\u0628</div><div class="list">${s.vouchers.length ? s.vouchers.map((x) => voucherCard(x, currency)).join("") : '<div class="empty">\u0644\u0627 \u062A\u0648\u062C\u062F \u062F\u0641\u0639\u0627\u062A \u0623\u0648 \u0633\u0646\u062F\u0627\u062A \u0645\u0633\u062C\u0644\u0629.</div>'}</div></section><div class="last-update">\u0622\u062E\u0631 \u062A\u062D\u062F\u064A\u062B: ${date(/* @__PURE__ */ new Date())}</div><div class="footer">\u0628\u064A\u0627\u0646\u0627\u062A \u0644\u0644\u0639\u0631\u0636 \u0641\u0642\u0637 \u2022 \u064A\u062A\u0645 \u062A\u062D\u062F\u064A\u062B\u0647\u0627 \u0645\u0628\u0627\u0634\u0631\u0629 \u0645\u0646 \u0646\u0638\u0627\u0645 ${esc(store)}</div></div>`;
  document.querySelectorAll(".tab").forEach((b) => b.onclick = () => {
    document.querySelectorAll(".tab").forEach((x) => x.classList.toggle("active", x === b));
    document.querySelectorAll(".section").forEach((x) => x.classList.toggle("active", x.dataset.section === b.dataset.tab));
  });
  document.querySelectorAll(".invoice-toggle").forEach((b) => b.onclick = () => b.nextElementSibling?.classList.toggle("open"));
  $("#refreshBtn").onclick = async () => {
    const b = $("#refreshBtn");
    b.disabled = true;
    b.classList.add("refreshing");
    try {
      state = await readData(state.access);
      render(state);
    } catch (e) {
      fail(e.message);
    } finally {
      if (b.isConnected) {
        b.disabled = false;
        b.classList.remove("refreshing");
      }
    }
  };
}
async function boot() {
  try {
    const access = await decodeCustomerPortalAccess(await resolvePortalAccessCode());
    state = await readData(access);
    render(state);
  } catch (e) {
    console.error(e);
    fail(e?.message || e);
  }
}
boot();
