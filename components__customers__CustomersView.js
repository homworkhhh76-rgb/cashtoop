import {t} from './services__i18n.js?v=7.9.4.136-localization';
import {StatementTable} from './components__customers__StatementTable.js?v=7.9.4.136-localization';
import { ModalLayer } from './components__common__ModalLayer.js?v=7.9.4.136-localization';
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useApp } from './context__AppContext.js?v=7.9.4.136-localization';
import { Pagination, usePagination } from './components__common__Pagination.js?v=7.9.4.136-localization';
import { SearchableDropdown } from './components__common__Dropdown.js?v=7.9.4.136-localization';
import { exportToCSV, printReceiptElement } from './utils__export.js?v=7.9.4.136-localization';
import { downloadElementAsPDF } from './utils__pdfExport.js?v=7.9.4.136-localization';
import { downloadElementAsImage } from './utils__imageExport.js?v=7.9.4.136-localization';
import { downloadProfessionalCustomerStatementPDF, downloadProfessionalCustomerStatementImage, downloadProfessionalCustomerStatementExcel, downloadProfessionalTablePDF, downloadProfessionalTableImage } from './utils__professionalExport.js?v=7.9.4.136-localization';
import { createQrSvgDataUrl } from './utils__qrcode.js?v=7.9.4.136-localization';
import { createCustomerPortalLinks } from './services__customerPortalLinks.js?v=7.9.4.136-localization';
import { MessageActionButtons } from './components__common__MessageActionButtons.js?v=7.9.4.136-localization';
import { Plus, Search, FileText, DollarSign, Download, Printer, Trash2, X, Edit, Image as ImageIcon, FileSpreadsheet, Link2, QrCode, Copy, MoreVertical, Eye, Phone, MapPin } from 'lucide-react';
const normalizeOpeningBalanceInput = (value) => {
    let raw = String(value ?? '')
        .replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
        .replace(/[۰-۹]/g, d => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
        .replace(/[٫،,]/g, '.')
        .replace(/[^0-9.]/g, '');
    const dot = raw.indexOf('.');
    if (dot >= 0) raw = raw.slice(0, dot + 1) + raw.slice(dot + 1).replace(/\./g, '');
    return raw;
};

const portalEnc = new TextEncoder();
const PORTAL_SECRET = 'OSCAR-CUSTOMER-PORTAL-2026-V1|READONLY|MZAUTH';
const portalB64url = (bytes) => {
    let out = '';
    const step = 0x8000;
    for (let i = 0; i < bytes.length; i += step)
        out += String.fromCharCode(...bytes.subarray(i, i + step));
    return btoa(out).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
};
const portalKey = async () => {
    const digest = await crypto.subtle.digest('SHA-256', portalEnc.encode(PORTAL_SECRET));
    return crypto.subtle.importKey('raw', digest, { name: 'AES-GCM' }, false, ['encrypt']);
};
const portalCompress = async (bytes) => {
    if (!globalThis.CompressionStream)
        return null;
    try {
        const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate'));
        return new Uint8Array(await new Response(stream).arrayBuffer());
    }
    catch (_) {
        return null;
    }
};
const encodeCustomerPortalAccess = async (payload) => {
    if (!globalThis.crypto?.subtle)
        throw new Error('هذا المتصفح لا يدعم تشفير رابط العميل.');
    const compact = { v: 1, d: String(payload?.d || ''), t: String(payload?.t || ''), c: String(payload?.c || ''), u: String(payload?.u || ''), n: String(payload?.n || '') };
    if (!compact.d || !compact.t || !compact.c || !compact.u || !compact.n)
        throw new Error('بيانات رابط العميل غير مكتملة.');
    const plain = portalEnc.encode(JSON.stringify(compact));
    const compressed = await portalCompress(plain);
    const useCompressed = !!(compressed && compressed.length + 8 < plain.length);
    const body = useCompressed ? compressed : plain;
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await portalKey(), body));
    const packed = new Uint8Array(1 + iv.length + cipher.length);
    packed[0] = useCompressed ? 1 : 0;
    packed.set(iv, 1);
    packed.set(cipher, 13);
    return 'cp1.' + portalB64url(packed);
};
export const CustomersView = () => {
    const { customers, invoices, vouchers, accounts, settings, saveCustomer, softDeleteCustomer, recordCustomerPayment, showToast, ensureFullHistoryStores, } = useApp();
    const [search, setSearch] = useState('');
    const [filterDebt, setFilterDebt] = useState(false);
    const customersTableRef = useRef(null);
    const statementModalRef = useRef(null);
    // Selected customer for Statement of Account (كشف حساب)
    const [statementCustomer, setStatementCustomer] = useState(null);
    const [portalModal, setPortalModal] = useState(null);
    const [portalLoadingId, setPortalLoadingId] = useState('');
    // Customer Editor Modal
    const [editingCustomer, setEditingCustomer] = useState(null);
    const [selectedCustomerDetail, setSelectedCustomerDetail] = useState(null);
    const [customerActionMenu, setCustomerActionMenu] = useState(null);
    useEffect(() => {
        if (!customerActionMenu) return;
        const close = (e) => {
            if (e.target?.closest?.('.customer-actions-menu') || e.target?.closest?.('.customer-row-more')) return;
            e.preventDefault?.();
            e.stopPropagation?.();
            e.stopImmediatePropagation?.();
            setCustomerActionMenu(null);
        };
        const esc = (e) => { if (e.key === 'Escape') setCustomerActionMenu(null); };
        const onScroll = () => setCustomerActionMenu(null);
        const dismiss=()=>setCustomerActionMenu(null);
        document.addEventListener('cash-top:close-action-menus',dismiss);
        document.addEventListener('pointerdown', close, true);
        document.addEventListener('keydown', esc);
        document.addEventListener('scroll', onScroll, true);
        return () => {
            document.removeEventListener('cash-top:close-action-menus',dismiss);
            document.removeEventListener('pointerdown', close, true);
            document.removeEventListener('keydown', esc);
            document.removeEventListener('scroll', onScroll, true);
        };
    }, [customerActionMenu]);
    // Collect Payment Modal (سند قبض دين)
    const [paymentCustomer, setPaymentCustomer] = useState(null);
    const [paymentAmount, setPaymentAmount] = useState(0);
    const [paymentAccountId, setPaymentAccountId] = useState(accounts.find(a=>a.isDefault)?.id || accounts[0]?.id || '');
    const [paymentNotes, setPaymentNotes] = useState('');
    const activeCustomers = customers.filter((c) => !c.deletedAt);
    const filteredCustomers = activeCustomers.filter((c) => {
        if (filterDebt && c.balance <= 0)
            return false;
        if (search.trim()) {
            const q = search.toLowerCase().trim();
            return (c.name.toLowerCase().includes(q) ||
                (c.phone && c.phone.includes(q)));
        }
        return true;
    });
    const customersPager = usePagination(filteredCustomers, 50, `${search}|${filterDebt}`);
    const totalDebt = activeCustomers.reduce((sum, c) => sum + (c.balance > 0 ? c.balance : 0), 0);
    const handleOpenAdd = () => {
        setEditingCustomer({
            id: 'cust-' + Date.now(),
            name: '',
            phone: '',
            address: '',
            notes: '',
            creditLimit: 0,
            balance: 0,
            openingBalanceAmount: '',
            openingBalanceSide: 'ours',
            createdAt: new Date().toISOString(),
        });
    };
    useEffect(() => {
        const eventName = 'cash-top:quick-add-customer';
        const open = () => {
            if (window.__cashTopPendingQuickAction === eventName) window.__cashTopPendingQuickAction = '';
            handleOpenAdd();
        };
        window.addEventListener(eventName, open);
        if (window.__cashTopPendingQuickAction === eventName) requestAnimationFrame(open);
        return () => window.removeEventListener(eventName, open);
    }, []);
    const handleSaveCustomer = async (e) => {
        e.preventDefault();
        if (!editingCustomer || !editingCustomer.name.trim())
            return;
        await saveCustomer(editingCustomer);
        setEditingCustomer(null);
    };
    const handleConfirmPayment = async (e) => {
        e.preventDefault();
        if (!paymentCustomer || paymentAmount <= 0) {
            showToast('يرجى إدخال مبلغ دفع صالح', 'warning');
            return;
        }
        await recordCustomerPayment({
            customerId: paymentCustomer.id,
            amount: paymentAmount,
            accountId: paymentAccountId,
            notes: paymentNotes,
        });
        setPaymentCustomer(null);
        setPaymentAmount(0);
        setPaymentNotes('');
    };
    const [statementReady,setStatementReady]=useState(null);
    const [statementError,setStatementError]=useState('');
    useEffect(() => {
        if (!statementCustomer || typeof ensureFullHistoryStores !== 'function') return;
        let alive=true;setStatementReady(null);setStatementError('');
        ensureFullHistoryStores(['invoices','vouchers']).then(()=>{if(alive)setStatementReady(statementCustomer.id)}).catch(err=>{if(alive)setStatementError(err.message||'تعذر تحميل الكشف')});
        return()=>{alive=false};
    }, [statementCustomer?.id, ensureFullHistoryStores]);
    // Current fiscal-year statement only. Older transactions remain available from the fiscal archive.
    const financialYears = Array.isArray(settings.financialYears) ? settings.financialYears : [];
    const activeFinancialYearId = settings.activeFinancialYearId || financialYears.find((y) => y?.status === 'open')?.id || 'fy-initial';
    const legacyFinancialYearId = financialYears[0]?.id || activeFinancialYearId;
    const inActiveFinancialYear = (row) => String(row?.financialYearId || legacyFinancialYearId) === String(activeFinancialYearId);
    const currentYearInvoices = invoices.filter(inActiveFinancialYear);
    const currentYearVouchers = vouchers.filter(inActiveFinancialYear);
    const customerInvoices = statementCustomer
        ? currentYearInvoices.filter((i) => i.customerId === statementCustomer.id)
        : [];
    const customerStatementPager = usePagination(customerInvoices, 50, `${statementCustomer?.id || 'none'}|${activeFinancialYearId}`);
    const getCustomersExportData = () => ({
        headers: ['اسم العميل','الهاتف','العنوان / الملاحظات','الرصيد الحالي'],
        rows: filteredCustomers.map(c => [c.name, c.phone || '-', c.address || c.notes || '-', Number(c.balance || 0)])
    });
    const handleCustomersPDF = async () => { const {headers,rows}=getCustomersExportData(); await downloadProfessionalTablePDF({title:'كشف العملاء والديون',headers,rows,settings,orientation:'landscape',filename:`كشف_العملاء_${new Date().toISOString().slice(0,10)}.pdf`}); showToast('تم تصدير كشف العملاء كاملاً كـ PDF','success'); };
    const handleCustomersImage = async () => { const {headers,rows}=getCustomersExportData(); await downloadProfessionalTableImage({title:'كشف العملاء والديون',headers,rows,settings,orientation:'landscape',filename:`كشف_العملاء_${new Date().toISOString().slice(0,10)}.png`}); showToast('تم تصدير كشف العملاء كاملاً كصورة','success'); };
    const handleExportCSV = () => {
        const headers = ['اسم العميل', 'رقم الهاتف', 'العنوان', 'سقف الدين', 'الرصيد الحالي (المطلوب)'];
        const rows = filteredCustomers.map((c) => [
            c.name,
            c.phone || '',
            c.address || '',
            c.creditLimit || 0,
            c.balance,
        ]);
        exportToCSV('سجل_ديون_العملاء', headers, rows);
    };
    const makePortalNonce = () => {
        const bytes = crypto.getRandomValues(new Uint8Array(10));
        let raw = '';
        bytes.forEach(b => raw += String.fromCharCode(b));
        return btoa(raw).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
    };
    const copyText = async (value) => {
        try {
            await navigator.clipboard.writeText(value);
            return true;
        }
        catch (_) {
            const ta = document.createElement('textarea');
            ta.value = value;
            ta.style.position = 'fixed';
            ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.focus();
            ta.select();
            const ok = document.execCommand('copy');
            ta.remove();
            return ok;
        }
    };
    const handleOpenCustomerPortal = async (cust) => {
        if (portalLoadingId) return;
        setPortalLoadingId(cust.id);
        try {
            const links = await createCustomerPortalLinks(cust, { saveCustomer });
            const qrDataUrl = createQrSvgDataUrl(links.portalUrl, { size: 340, margin: 4, level: 'L' });
            setPortalModal({ customer: links.customer, url: links.portalUrl, paymentUrl: links.paymentUrl, qrDataUrl, short: links.isShort, companyCode: links.companyCode, customerCode: links.customerCode });
        }
        catch (err) {
            showToast(err?.message || 'تعذر إنشاء رابط العميل', 'error');
        }
        finally {
            setPortalLoadingId('');
        }
    };
    const handleCopyPortalLink = async () => {
        if (portalModal?.url) window.open(portalModal.url, '_blank', 'noopener,noreferrer');
    };
    return (_jsxs("div", { id: "customers-screen", className: "p-4 sm:p-6 space-y-4 max-w-7xl mx-auto text-right select-none", children: [_jsxs("div", { className: "flex flex-col sm:flex-row sm:items-center justify-between gap-4", children: [_jsxs("div", { children: [_jsx("h2", { className: "text-xl font-black text-slate-900 dark:text-white", children: "\u0627\u0644\u0639\u0645\u0644\u0627\u0621 \u0648\u0627\u0644\u062f\u064a\u0648\u0646 \u0648\u0633\u0646\u062f\u0627\u062a \u0627\u0644\u0642\u0628\u0636" }), _jsxs("p", { className: "text-xs text-slate-500 mt-0.5", children: ["\u0625\u062c\u0645\u0627\u0644\u064a \u0627\u0644\u062f\u064a\u0648\u0646 \u0627\u0644\u0645\u0633\u062c\u0644\u0629 \u0639\u0644\u0649 \u0627\u0644\u0632\u0628\u0627\u0626\u0646:", ' ', _jsxs("strong", { className: "text-rose-600 font-mono text-sm", children: [totalDebt.toFixed(2), " ", settings.currencySymbol] })] })] }), _jsxs("div", { className: "flex items-center gap-2 flex-wrap", children: [_jsxs("button", { onClick: handleCustomersPDF, className: "flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 text-xs font-bold hover:bg-slate-50 transition shadow-xs", title: "\u062a\u0646\u0632\u064a\u0644 \u0643\u0640 PDF", children: [_jsx(Download, { className: "w-4 h-4 text-rose-600" }), _jsx("span", { children: "PDF" })] }), _jsxs("button", { onClick: handleCustomersImage, className: "flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 text-xs font-bold hover:bg-slate-50 transition shadow-xs", title: "\u062a\u0646\u0632\u064a\u0644 \u0643\u0635\u0648\u0631\u0629", children: [_jsx(ImageIcon, { className: "w-4 h-4 text-blue-600" }), _jsx("span", { children: t("صورة") })] }), _jsxs("button", { onClick: handleExportCSV, className: "flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 text-xs font-bold hover:bg-slate-50 shadow-xs", children: [_jsx(FileSpreadsheet, { className: "w-4 h-4 text-violet-600" }), _jsx("span", { children: "Excel" })] }), _jsxs("button", { onClick: handleOpenAdd, className: "flex items-center gap-1.5 px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-xs font-bold transition shadow-xs", children: [_jsx(Plus, { className: "w-4 h-4" }), _jsx("span", { children: "\u0625\u0636\u0627\u0641\u0629 \u0639\u0645\u064a\u0644 \u062c\u062f\u064a\u062f" })] })] })] }), _jsxs("div", { className: "p-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-wrap items-center justify-between gap-3", children: [_jsxs("div", { className: "flex-1 min-w-[220px] relative", children: [_jsx(Search, { className: "absolute right-3 top-2.5 w-4 h-4 text-slate-400" }), _jsx("input", { type: "text", value: search, onChange: (e) => setSearch(e.target.value), placeholder: "\u0628\u062d\u062b \u0628\u0627\u0633\u0645 \u0627\u0644\u0639\u0645\u064a\u0644 \u0623\u0648 \u0631\u0642\u0645 \u0627\u0644\u0647\u0627\u062a\u0641...", className: "w-full pr-9 pl-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800" })] }), _jsx("button", { onClick: () => setFilterDebt(!filterDebt), className: `px-3 py-1.5 rounded-lg text-xs font-bold transition ${filterDebt
                            ? 'bg-rose-600 text-white'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'}`, children: filterDebt ? 'عرض كافة العملاء' : 'العملاء المدينون فقط' })] }), _jsx("div", { id: "customers-table-card", ref: customersTableRef, className: "rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden", children: _jsx("div", { className: "overflow-x-auto max-w-full slim-scrollbar", children: filteredCustomers.length === 0 ? (_jsx("div", { className: "p-12 text-center text-xs text-slate-400", children: "\u0644\u0627 \u064a\u0648\u062c\u062f \u0639\u0645\u0644\u0627\u0621 \u0645\u0637\u0627\u0628\u0642\u0648\u0646 \u0644\u0644\u0628\u062d\u062b" })) : (_jsxs("table", { className: "w-full text-xs text-right whitespace-nowrap min-w-[700px]", children: [_jsx("thead", { children: _jsxs("tr", { className: "border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 text-slate-500 font-semibold", children: [_jsx("th", { className: "p-3", children: t("اسم العميل") }), _jsx("th", { className: "p-3", children: t("رقم الهاتف") }), _jsx("th", { className: "p-3", children: "\u0627\u0644\u0639\u0646\u0648\u0627\u0646 / \u0645\u0644\u0627\u062d\u0638\u0627\u062a" }), _jsx("th", { className: "p-3 text-left", children: "\u0627\u0644\u0631\u0635\u064a\u062f \u0627\u0644\u062d\u0627\u0644\u064a (\u0627\u0644\u062f\u064a\u0646)" }), _jsx("th", { className: "p-3 text-center", children: t("إجراءات") })] }) }), _jsx("tbody", { className: "divide-y divide-slate-100 dark:divide-slate-800", children: customersPager.pageItems.map((cust) => (_jsxs("tr", { onClick: () => setSelectedCustomerDetail(cust), className: "hover:bg-slate-50/50", children: [_jsx("td", { className: "p-3 font-bold text-slate-900 dark:text-white", children: cust.name }), _jsx("td", { className: "p-3 font-mono text-slate-500", children: cust.phone || '-' }), _jsx("td", { className: "p-3 text-slate-400 truncate max-w-[200px]", children: cust.address || cust.notes || '-' }), _jsx("td", { className: "p-3 text-left font-mono font-bold", children: cust.balance > 0 ? (_jsxs("span", { className: "text-rose-600", children: [t("لنا "), cust.balance.toFixed(2), " ", settings.currencySymbol] })) : cust.balance < 0 ? (_jsxs("span", { className: "text-violet-600", children: [t("علينا "), Math.abs(cust.balance).toFixed(2), " ", settings.currencySymbol] })) : (_jsx("span", { className: "text-slate-400", children: "\u062e\u0627\u0644\u0635 (0.00)" })) }), _jsx("td", { onClick: (e) => e.stopPropagation(), className: "p-3 text-center", children: _jsx("button", { type: "button", className: "customer-row-more p-1.5 rounded-lg text-violet-700 hover:bg-violet-50", title: "إجراءات العميل", onClick: (e) => { const r = e.currentTarget.getBoundingClientRect(); setCustomerActionMenu({ customer: cust, top: Math.min(window.innerHeight - 280, r.bottom + 6), left: Math.max(8, Math.min(window.innerWidth - 220, r.left - 176)) }); }, children: _jsx(MoreVertical, { className: "w-5 h-5" }) }) })] }, cust.id))) })] })) }) }), _jsx(Pagination, { pager: customersPager }), customerActionMenu && typeof document !== 'undefined' ? createPortal(_jsxs("div", { className: "cash-action-menu customer-actions-menu", style: { position: "fixed", top: `${customerActionMenu.top}px`, left: `${customerActionMenu.left}px`, zIndex: 2147483300 }, children: [_jsxs("button", { type: "button", onClick: () => { setSelectedCustomerDetail(customerActionMenu.customer); setCustomerActionMenu(null); }, children: [_jsx(Eye, { className: "w-4 h-4" }), _jsx("span", { children: t("عرض البيانات") })] }), customerActionMenu.customer.balance > 0 ? _jsxs("button", { type: "button", onClick: () => { const c=customerActionMenu.customer; setCustomerActionMenu(null); setPaymentCustomer(c); setPaymentAmount(c.balance); }, children: [_jsx(DollarSign, { className: "w-4 h-4" }), _jsx("span", { children: "قبض دين" })] }) : null, _jsxs("div", { className: "customer-action-messages", children: [_jsx("span", { children: t("رسائل") }), _jsx(MessageActionButtons, { customer: customerActionMenu.customer, kind: "customer" })] }), _jsxs("button", { type: "button", onClick: () => { const c=customerActionMenu.customer; setCustomerActionMenu(null); handleOpenCustomerPortal(c); }, children: [_jsx(QrCode, { className: "w-4 h-4" }), _jsx("span", { children: "رابط و QR" })] }), _jsxs("button", { type: "button", onClick: () => { const c=customerActionMenu.customer; setCustomerActionMenu(null); setStatementCustomer(c); }, children: [_jsx(FileText, { className: "w-4 h-4" }), _jsx("span", { children: t("كشف الحساب") })] }), _jsxs("button", { type: "button", onClick: () => { const c=customerActionMenu.customer; setCustomerActionMenu(null); setEditingCustomer(c); }, children: [_jsx(Edit, { className: "w-4 h-4" }), _jsx("span", { children: t("تعديل") })] }), _jsxs("button", { type: "button", className: "danger", onClick: () => { const id=customerActionMenu.customer.id; setCustomerActionMenu(null); softDeleteCustomer(id); }, children: [_jsx(Trash2, { className: "w-4 h-4" }), _jsx("span", { children: t("حذف") })] })] }), document.body) : null, selectedCustomerDetail && (_jsx(ModalLayer, { className: "customer-detail-overlay fixed inset-0 flex items-center justify-center bg-black/50 p-4", children: _jsxs("section", { className: "customer-detail-panel w-full max-w-lg rounded-2xl bg-white shadow-2xl overflow-hidden", children: [_jsxs("header", { className: "native-modal-topbar", children: [_jsx("span", { className: "native-modal-spacer" }), _jsx("h3", { children: t("بيانات العميل") }), _jsx("button", { type: "button", className: "native-modal-close", onClick: () => setSelectedCustomerDetail(null), title: t("إغلاق"), children: _jsx(X, { className: "w-5 h-5" }) })] }), _jsxs("div", { className: "customer-detail-body", children: [_jsxs("div", { className: "customer-detail-name", children: [_jsx("strong", { children: selectedCustomerDetail.name }), _jsx("small", { children: selectedCustomerDetail.balance > 0 ? `لنا ${Number(selectedCustomerDetail.balance).toFixed(2)} ${settings.currencySymbol}` : selectedCustomerDetail.balance < 0 ? `علينا ${Math.abs(Number(selectedCustomerDetail.balance)).toFixed(2)} ${settings.currencySymbol}` : "الرصيد خالص" })] }), React.createElement('div',{className:'ct-customer-summary'},React.createElement('div',null,React.createElement('span',null,t("الرصيد الحالي")),React.createElement('strong',null,`${Math.abs(Number(selectedCustomerDetail.balance)||0).toFixed(2)} ${settings.currencySymbol}`)),React.createElement('div',null,React.createElement('span',null,t("حد الائتمان")),React.createElement('strong',null,`${Number(selectedCustomerDetail.creditLimit||0).toFixed(2)} ${settings.currencySymbol}`)),React.createElement('div',null,React.createElement('span',null,t("قائمة الأسعار")),React.createElement('strong',null,selectedCustomerDetail.priceList==='wholesale'?t("جملة"):t("قطاعي")))), _jsxs("div", { className: "customer-detail-list", children: [_jsxs("div", { children: [_jsx(Phone, { className: "w-4 h-4" }), _jsx("span", { children: selectedCustomerDetail.phone || t("لا يوجد رقم هاتف") })] }), _jsxs("div", { children: [_jsx(MapPin, { className: "w-4 h-4" }), _jsx("span", { children: selectedCustomerDetail.address || t("لا يوجد عنوان") })] }), _jsxs("div", { children: [_jsx(FileText, { className: "w-4 h-4" }), _jsx("span", { children: selectedCustomerDetail.notes || t("لا توجد ملاحظات") })] })] })] })] }) })), portalModal && (_jsx(ModalLayer, { className: "fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/45 backdrop-blur-sm p-4 animate-in fade-in", onMouseDown: (e) => { if (e.target === e.currentTarget) setPortalModal(null); }, children: _jsxs("div", { className: "w-full max-w-sm rounded-3xl bg-white dark:bg-slate-900 shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden text-right", children: [_jsxs("div", { className: "flex items-center justify-between gap-3 px-4 py-3 border-b border-slate-100 dark:border-slate-800", children: [_jsxs("div", { className: "min-w-0", children: [_jsx("h3", { className: "text-sm font-black text-slate-900 dark:text-white truncate", children: ["رابط العميل: ", portalModal.customer?.name || ''] }), _jsx("p", { className: "text-[10px] text-slate-500 mt-0.5", children: "امسح QR أو افتح صفحة الحساب مباشرة" })] }), _jsx("button", { type: "button", onClick: () => setPortalModal(null), className: "p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800", title: t("إغلاق"), children: _jsx(X, { className: "w-4 h-4" }) })] }), _jsxs("div", { className: "p-5 flex flex-col items-center gap-4", children: [_jsx("div", { className: "w-full max-w-[310px] aspect-square rounded-2xl bg-white border border-slate-200 shadow-sm p-3 flex items-center justify-center", children: _jsx("img", { src: portalModal.qrDataUrl, alt: `QR ${portalModal.customer?.name || ''}`, className: "w-full h-full object-contain", draggable: false }) }), _jsxs("div", { className: "w-full rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 px-3 py-2", children: [_jsx("div", { className: "text-[10px] font-bold text-slate-500 mb-1", children: "رابط العميل" }), _jsx("div", { dir: "ltr", className: "text-[10px] font-mono text-slate-600 dark:text-slate-300 truncate select-text", title: portalModal.url, children: portalModal.url })] }), _jsxs("button", { type: "button", onClick: handleCopyPortalLink, className: "w-full flex items-center justify-center gap-2 px-5 py-3.5 rounded-2xl bg-violet-600 hover:bg-violet-700 text-white text-sm font-black shadow-lg active:scale-[.98] transition", style: { background: "linear-gradient(135deg,#10b981 0%,#7C3AED 55%,#6D28D9 100%)", color: "#ffffff", minHeight: "50px", boxShadow: "0 10px 24px rgba(5,150,105,.28)" }, children: [_jsx(Copy, { className: "w-5 h-5" }), _jsx("span", { children: "فتح صفحة العميل" })] })] })] }) })), statementCustomer && (_jsx(ModalLayer, { className: "fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 animate-in fade-in", children: _jsxs("div", { id: "customer-statement-modal", ref: statementModalRef, className: "ct-statement-modal w-full max-w-2xl rounded-2xl bg-white dark:bg-slate-900 shadow-2xl p-5 space-y-4 border text-right max-h-[85vh] flex flex-col", children: [_jsxs("div", { className: "flex justify-between items-center border-b pb-3", children: [_jsxs("div", { children: [_jsxs("h3", { className: "text-sm font-bold text-slate-900 dark:text-white", children: ["\u0643\u0634\u0641 \u062d\u0633\u0627\u0628 \u0627\u0644\u0639\u0645\u064a\u0644: ", statementCustomer.name] }), _jsxs("span", { className: `${statementCustomer.balance < 0 ? 'text-violet-600' : statementCustomer.balance > 0 ? 'text-rose-600' : 'text-slate-500'} text-xs font-bold`, children: [statementCustomer.balance > 0 ? "لنا عند العميل: " : statementCustomer.balance < 0 ? "علينا للعميل: " : t("الرصيد: "), Math.abs(statementCustomer.balance).toFixed(2), " ", settings.currencySymbol] })] }), _jsx("button", { onClick: () => setStatementCustomer(null), className: "p-1", children: _jsx(X, { className: "w-4 h-4" }) })] }), statementReady===statementCustomer.id?_jsx(StatementTable,{customer:statementCustomer,invoices:currentYearInvoices,vouchers:currentYearVouchers}):_jsx('p',{role:'status',children:statementError||'جارٍ تحميل كشف الحساب...'}), _jsxs("div", { className: "flex justify-between items-center gap-2 pt-2 border-t flex-wrap", children: [_jsxs("div", { className: "flex items-center gap-1.5", children: [_jsxs("button", { type: "button", disabled: statementReady!==statementCustomer.id, onClick: async () => { try {
                                                const ok=await downloadProfessionalCustomerStatementPDF(statementCustomer, currentYearInvoices, currentYearVouchers, settings, `كشف_حساب_${statementCustomer.name}_${new Date().toISOString().slice(0, 10)}.pdf`);
                                                if(ok===false)throw new Error('تعذر إنشاء ملف الكشف');showToast('تم تصدير كشف الحساب كـ PDF بنجاح', 'success'); } catch(error){showToast(error.message||'تعذر التصدير','error')} 
                                            }, className: "flex items-center gap-1 px-3 py-1.5 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 text-slate-700 dark:text-slate-200 text-xs font-semibold rounded-lg", title: "\u062a\u0646\u0632\u064a\u0644 \u0643\u0640 PDF", children: [_jsx(Download, { className: "w-3.5 h-3.5 text-rose-600" }), _jsx("span", { children: "PDF" })] }), _jsxs("button", { type: "button", disabled: statementReady!==statementCustomer.id, onClick: async () => { try {
                                                const ok=await downloadProfessionalCustomerStatementImage(statementCustomer, currentYearInvoices, currentYearVouchers, settings, `كشف_حساب_${statementCustomer.name}_${new Date().toISOString().slice(0, 10)}.png`);
                                                if(ok===false)throw new Error('تعذر إنشاء ملف الكشف');showToast('تم تصدير كشف الحساب كصورة بنجاح', 'success'); } catch(error){showToast(error.message||'تعذر التصدير','error')} 
                                            }, className: "flex items-center gap-1 px-3 py-1.5 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 text-slate-700 dark:text-slate-200 text-xs font-semibold rounded-lg", title: "\u062a\u0646\u0632\u064a\u0644 \u0643\u0635\u0648\u0631\u0629", children: [_jsx(ImageIcon, { className: "w-3.5 h-3.5 text-blue-600" }), _jsx("span", { children: t("صورة") })] }), _jsxs("button", { type: "button", disabled: statementReady!==statementCustomer.id, onClick: async () => { try { const ok=await downloadProfessionalCustomerStatementExcel(statementCustomer, currentYearInvoices, currentYearVouchers, settings, `كشف_حساب_${statementCustomer.name}_${new Date().toISOString().slice(0,10)}.xlsx`); if(ok===false)throw new Error('تعذر إنشاء ملف الكشف');showToast('تم تصدير كشف الحساب كـ Excel بنجاح', 'success'); } catch(error){showToast(error.message||'تعذر التصدير','error')}  }, className: "flex items-center gap-1 px-3 py-1.5 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 text-slate-700 dark:text-slate-200 text-xs font-semibold rounded-lg", children: [_jsx(FileSpreadsheet, { className: "w-3.5 h-3.5 text-violet-600" }), _jsx("span", { children: "Excel" })] }), _jsxs("button", { onClick: () => printReceiptElement('كشف حساب ' + statementCustomer.name), className: "flex items-center gap-1 px-3 py-1.5 bg-violet-600 text-white text-xs font-bold rounded-lg hover:bg-violet-700", children: [_jsx(Printer, { className: "w-3.5 h-3.5" }), _jsx("span", { children: t("طباعة") })] })] }), _jsx("button", { onClick: () => setStatementCustomer(null), className: "px-4 py-1.5 bg-slate-200 dark:bg-slate-700 text-xs font-bold rounded-lg hover:bg-slate-300", children: t("إغلاق") })] })] }) })), paymentCustomer && (_jsx(ModalLayer, { className: "fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 animate-in fade-in", children: _jsxs("form", { onSubmit: handleConfirmPayment, className: "w-full max-w-sm rounded-2xl bg-white dark:bg-slate-900 shadow-2xl p-5 space-y-4 border text-right", children: [_jsxs("h3", { className: "text-sm font-bold text-slate-900 dark:text-white", children: ["\u0633\u0646\u062f \u0642\u0628\u0636 \u062f\u064a\u0646 \u0645\u0646: ", paymentCustomer.name] }), _jsxs("div", { children: [_jsx("label", { className: "text-xs font-semibold block mb-1", children: "\u0627\u0644\u0645\u0628\u0644\u063a \u0627\u0644\u0645\u0642\u0628\u0648\u0636:" }), _jsx("input", { type: "number", step: "any", min: "0.01", max: paymentCustomer.balance, required: true, value: paymentAmount, onChange: (e) => setPaymentAmount(parseFloat(e.target.value) || 0), className: "w-full px-3 py-2 text-sm font-mono font-bold border rounded-lg bg-white dark:bg-slate-800" }), _jsxs("span", { className: "text-[11px] text-slate-400 mt-0.5 block", children: ["\u0627\u0644\u062f\u064a\u0646 \u0627\u0644\u0643\u0644\u064a \u0627\u0644\u0645\u0633\u062a\u062d\u0642: ", paymentCustomer.balance.toFixed(2), " ", settings.currencySymbol] })] }), _jsxs("div", { children: [_jsx(SearchableDropdown, { label: "\u062a\u0648\u0631\u064a\u062f \u0627\u0644\u0645\u0628\u0644\u063a \u0625\u0644\u0649 \u0627\u0644\u062d\u0633\u0627\u0628:", id: "customer-payment-account", options: accounts.map((acc) => ({ id: acc.id, label: acc.name })), selectedId: paymentAccountId, onSelect: setPaymentAccountId, placeholder: "\u0627\u0628\u062d\u062b \u0639\u0646 \u0627\u0644\u062d\u0633\u0627\u0628..." })] }), _jsxs("div", { children: [_jsx("label", { className: "text-xs font-semibold block mb-1", children: "\u0645\u0644\u0627\u062d\u0638\u0627\u062a \u0627\u0644\u0633\u0646\u062f:" }), _jsx("input", { type: "text", placeholder: "\u062f\u0641\u0639\u0629 \u0645\u0646 \u0627\u0644\u062d\u0633\u0627\u0628...", value: paymentNotes, onChange: (e) => setPaymentNotes(e.target.value), className: "w-full px-3 py-1.5 text-xs border rounded-lg" })] }), _jsxs("div", { className: "flex justify-between pt-2 border-t", children: [_jsx("button", { type: "button", onClick: () => setPaymentCustomer(null), className: "px-3 py-1.5 text-xs text-slate-500", children: t("إلغاء") }), _jsx("button", { type: "submit", className: "px-5 py-2 bg-violet-600 hover:bg-violet-700 text-white text-xs font-bold rounded-xl shadow-md", children: "\u062a\u0623\u0643\u064a\u062f \u0627\u0644\u0642\u0628\u0636 \u0648\u0625\u064a\u062f\u0627\u0639 \u0627\u0644\u0635\u0646\u062f\u0648\u0642" })] })] }) })), editingCustomer && typeof document !== 'undefined' ? createPortal(_jsx(ModalLayer, { className: "customer-editor-modal-overlay fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 animate-in fade-in", children: _jsxs("form", { onSubmit: handleSaveCustomer, className: "customer-editor-modal-panel w-full max-w-md max-h-[90dvh] overflow-y-auto rounded-2xl bg-white dark:bg-slate-900 shadow-2xl p-5 space-y-4 border text-right", children: [_jsxs("div", { className: "customer-editor-topbar", children: [_jsx("h3", { className: "text-sm font-black text-slate-900 dark:text-white", children: customers.some((c) => c.id === editingCustomer.id) ? t("تعديل العميل") : t("إضافة عميل") })] }), _jsxs("div", { children: [_jsx("label", { className: "text-xs font-semibold block mb-1", children: t("اسم العميل *") }), _jsx("input", { type: "text", required: true, value: editingCustomer.name, onChange: (e) => setEditingCustomer({ ...editingCustomer, name: e.target.value }), className: "w-full px-3 py-2 text-xs border rounded-lg" })] }), _jsxs("div", { children: [_jsx("label", { className: "text-xs font-semibold block mb-1", children: t("رقم الهاتف") }), _jsx("input", { type: "text", value: editingCustomer.phone || '', onChange: (e) => setEditingCustomer({ ...editingCustomer, phone: e.target.value }), className: "w-full px-3 py-2 text-xs border rounded-lg font-mono" })] }), _jsxs("div", { children: [_jsx("label", { className: "text-xs font-semibold block mb-1", children: t("العنوان أو مكان الإقامة") }), _jsx("input", { type: "text", value: editingCustomer.address || '', onChange: (e) => setEditingCustomer({ ...editingCustomer, address: e.target.value }), className: "w-full px-3 py-2 text-xs border rounded-lg" })] }), _jsxs("div", { className: "rounded-xl border border-violet-100 dark:border-violet-900/60 bg-violet-50/40 dark:bg-violet-950/20 p-3 space-y-2", children: [_jsxs("div", { className: "flex items-center justify-between gap-2", children: [_jsx("label", { className: "text-xs font-bold text-slate-800 dark:text-slate-100", children: t("الرصيد الافتتاحي") }), _jsx("span", { className: "text-[10px] text-slate-400", children: t("اختياري") })] }), _jsxs("div", { className: "grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2", children: [_jsxs("div", { className: "relative", children: [_jsx("input", { type: "text", inputMode: "decimal", value: editingCustomer.openingBalanceAmount ?? '', onChange: (e) => setEditingCustomer({ ...editingCustomer, openingBalanceAmount: normalizeOpeningBalanceInput(e.target.value) }), className: "w-full px-3 py-2 pl-14 text-sm font-mono font-bold border rounded-lg bg-white dark:bg-slate-800", placeholder: "0.00" }), _jsx("span", { className: "absolute left-3 top-2.5 text-[11px] text-slate-400 font-bold", children: settings.currencySymbol })] }), _jsxs("div", { className: "grid grid-cols-2 gap-1 p-1 rounded-lg bg-white dark:bg-slate-800 border", children: [_jsx("button", { type: "button", onClick: () => setEditingCustomer({ ...editingCustomer, openingBalanceSide: 'ours' }), className: `px-4 py-1.5 rounded-md text-xs font-black transition ${(editingCustomer.openingBalanceSide || 'ours') === 'ours' ? 'bg-violet-600 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-700'}`, children: t("لنا") }), _jsx("button", { type: "button", onClick: () => setEditingCustomer({ ...editingCustomer, openingBalanceSide: 'theirs' }), className: `px-4 py-1.5 rounded-md text-xs font-black transition ${editingCustomer.openingBalanceSide === 'theirs' ? 'bg-rose-600 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-700'}`, children: t("علينا") })] })] }), _jsx("p", { className: "text-[10px] leading-5 text-slate-500", children: editingCustomer.openingBalanceSide === 'theirs' ? "\u0639\u0644\u064a\u0646\u0627 \u0645\u0628\u0644\u063a \u0644\u0647\u0630\u0627 \u0627\u0644\u0639\u0645\u064a\u0644 \u0642\u0628\u0644 \u0628\u062f\u0621 \u0627\u0644\u0639\u0645\u0644 \u0639\u0644\u0649 \u0627\u0644\u0646\u0638\u0627\u0645." : "\u0644\u0646\u0627 \u0645\u0628\u0644\u063a \u0639\u0646\u062f \u0647\u0630\u0627 \u0627\u0644\u0639\u0645\u064a\u0644 \u0642\u0628\u0644 \u0628\u062f\u0621 \u0627\u0644\u0639\u0645\u0644 \u0639\u0644\u0649 \u0627\u0644\u0646\u0638\u0627\u0645." })] }), _jsxs("div", { className: "flex justify-end gap-2 pt-2 border-t", children: [_jsx("button", { type: "button", onClick: () => setEditingCustomer(null), className: "px-3 py-1.5 text-xs text-slate-500", children: t("إلغاء") }), _jsx("button", { type: "submit", className: "px-4 py-2 bg-violet-600 text-white text-xs font-bold rounded-lg", children: t("حفظ العميل") })] })] }) }), document.body) : null] }));
};
