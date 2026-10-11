import {t} from './services__i18n.js?v=7.9.4.154-distribution-menu';
import { ModalLayer } from './components__common__ModalLayer.js?v=7.9.4.154-distribution-menu';
import React, { useEffect, useRef, useState } from 'react';
import { useApp } from './context__AppContext.js?v=7.9.4.154-distribution-menu';
import { printElementOnly, warmExportLibraries } from './utils__export.js?v=7.9.4.154-distribution-menu';
import { downloadProfessionalInvoicePDF, downloadProfessionalInvoiceImage, downloadProfessionalInvoiceExcel, warmProfessionalExportLibraries } from './utils__professionalExport.js?v=7.9.4.154-distribution-menu';
import { renderInvoiceCanvas } from './utils__canvasRenderer.js?v=7.9.4.154-distribution-menu';
import { smartPrinter } from './services__printer.js?v=7.9.4.154-distribution-menu';
import { getBrandLogoDataUrl, getBrandLogoDisplayUrl, DEFAULT_LOGO_DATA_URL } from './brand__logo.js?v=7.9.4.154-distribution-menu';
import { createCustomerPortalLinks } from './services__customerPortalLinks.js?v=7.9.4.154-distribution-menu';
import { createQrSvgDataUrl } from './utils__qrcode.js?v=7.9.4.154-distribution-menu';
import { Printer, X, Download, Image as ImageIcon, FileSpreadsheet, Bluetooth } from 'lucide-react';

const h = React.createElement;

function money(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n.toFixed(2) : '0.00';
}

export const ThermalReceiptModal = () => {
    const { showThermalModal, setShowThermalModal, settings, showToast, customers, saveCustomer } = useApp();
    const [paperWidth, setPaperWidth] = useState(settings.printerWidth || '80mm');
    const receiptContainerRef = useRef(null);
    const [isExporting, setIsExporting] = useState(false);
    const [printerState, setPrinterState] = useState(() => smartPrinter.getState());
    const [customerPortalUrl, setCustomerPortalUrl] = useState('');
    const [customerQrDataUrl, setCustomerQrDataUrl] = useState('');
    const portalLinkRef = useRef('');
    const logoSrc = getBrandLogoDisplayUrl(settings);

    useEffect(() => smartPrinter.subscribe(setPrinterState), []);
    useEffect(() => { smartPrinter.autoReconnect().catch(() => {}); }, []);

    useEffect(() => {
        if (!showThermalModal) return;
        warmExportLibraries();
        warmProfessionalExportLibraries();
    }, [showThermalModal]);

    useEffect(() => {
        if (showThermalModal) setPaperWidth(settings.printerWidth || '80mm');
    }, [showThermalModal, settings.printerWidth]);


    const ensureCustomerPortalLink = async () => {
        const inv = showThermalModal;
        if (!inv || !inv.customerId || inv.customerId === 'cust-walkin') return '';
        if (portalLinkRef.current) return portalLinkRef.current;
        const customer = (customers || []).find(c => String(c.id) === String(inv.customerId));
        if (!customer) return '';
        try {
            const links = await createCustomerPortalLinks(customer, { saveCustomer });
            const url = links?.portalUrl || links?.longPortalUrl || '';
            if (url) {
                portalLinkRef.current = url;
                setCustomerPortalUrl(url);
                setCustomerQrDataUrl(createQrSvgDataUrl(url, { size: 260, margin: 2, level: 'L' }));
            }
            return url;
        } catch (err) {
            console.warn('Customer portal QR unavailable:', err);
            return '';
        }
    };

    useEffect(() => {
        portalLinkRef.current = '';
        setCustomerPortalUrl('');
        setCustomerQrDataUrl('');
        if (!showThermalModal || !showThermalModal.customerId || showThermalModal.customerId === 'cust-walkin') return;
        let cancelled = false;
        (async () => {
            const url = await ensureCustomerPortalLink();
            if (cancelled || !url) return;
        })();
        return () => { cancelled = true; };
    }, [showThermalModal?.invoiceNumber, showThermalModal?.customerId, customers?.length]);

    if (!showThermalModal) return null;
    const invoice = showThermalModal;
    const isReturn = invoice.type === 'return';

    const handlePrint = async () => {
        const source = receiptContainerRef.current;
        if (!source) return;
        await ensureCustomerPortalLink();
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        await printElementOnly(source, paperWidth, `فاتورة ${invoice.invoiceNumber}`);
    };

    const handleBluetoothPrint = async () => {
        if (isExporting) return;
        setIsExporting(true);
        try {
            await ensureCustomerPortalLink();
            await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
            let state = smartPrinter.getState();
            // Safari/iPhone and browsers without Web Bluetooth must use the OS print path.
            if (!state.bluetoothSupported && !state.serialSupported && !state.systemMode) {
                state = await smartPrinter.enableSystemPrint();
            }
            if (state.systemMode) {
                const ok = await printElementOnly(receiptContainerRef.current, paperWidth, `فاتورة ${invoice.invoiceNumber}`);
                if (!ok) throw new Error('تعذر فتح نافذة طباعة النظام.');
                showToast(state.isIOS ? 'تم فتح طباعة iPhone / AirPrint' : 'تم فتح نافذة طباعة النظام', 'success');
                return;
            }
            if (!state.connected) {
                try {
                    state = await smartPrinter.connectBluetooth();
                } catch (connectErr) {
                    if (connectErr?.name === 'NotFoundError') return;
                    throw connectErr;
                }
                if (state.systemMode) {
                    const ok = await printElementOnly(receiptContainerRef.current, paperWidth, `فاتورة ${invoice.invoiceNumber}`);
                    if (!ok) throw new Error('تعذر فتح نافذة طباعة النظام.');
                    showToast(state.isIOS ? 'تم فتح طباعة iPhone / AirPrint' : 'تم فتح نافذة طباعة النظام', 'success');
                    return;
                }
            }
            const portalUrl = await ensureCustomerPortalLink();
            const canvas = await renderInvoiceCanvas(invoice, { ...settings, printerWidth: paperWidth, customerPortalUrl: portalUrl }, { paperWidth });
            await smartPrinter.printCanvas(canvas, { paperWidth: paperWidth === '58mm' ? '58mm' : '80mm' });
            state = smartPrinter.getState();
            showToast(`تم إرسال الفاتورة إلى ${state.name || state.preferredName || 'الطابعة'}`, 'success');
        } catch (err) {
            if (err?.code === 'SYSTEM_PRINT_REQUIRED' || err?.message === 'SYSTEM_PRINT_REQUIRED') {
                await printElementOnly(receiptContainerRef.current, paperWidth, `فاتورة ${invoice.invoiceNumber}`);
                showToast('تم فتح نافذة طباعة النظام', 'success');
            } else {
                showToast(err?.message || 'فشل إرسال الفاتورة إلى الطابعة', 'error');
            }
        } finally {
            setIsExporting(false);
        }
    };

    const withExporting = async (action) => {
        if (isExporting) return;
        setIsExporting(true);
        try {
            await action();
        } finally {
            setIsExporting(false);
        }
    };

    const handleDownloadImage = () => withExporting(async () => {
        const portalUrl = await ensureCustomerPortalLink();
        return downloadProfessionalInvoiceImage(invoice, { ...settings, printerWidth: paperWidth, customerPortalUrl: portalUrl }, `فاتورة-${invoice.invoiceNumber}.png`);
    });
    const handleDownloadPDF = () => withExporting(async () => {
        const portalUrl = await ensureCustomerPortalLink();
        return downloadProfessionalInvoicePDF(invoice, { ...settings, printerWidth: paperWidth, customerPortalUrl: portalUrl }, `فاتورة-${invoice.invoiceNumber}.pdf`);
    });
    const handleDownloadExcel = () => withExporting(() => downloadProfessionalInvoiceExcel(invoice, settings, `فاتورة-${invoice.invoiceNumber}.xlsx`));

    const paperButton = (key, label) => h('button', {
        onClick: () => setPaperWidth(key),
        className: `px-2.5 py-1 rounded-md text-xs font-bold transition ${paperWidth === key ? 'bg-violet-600 text-white shadow-xs' : 'text-slate-700 dark:text-slate-300 hover:text-slate-900'}`
    }, label);

    const exportButton = (id, onClick, Icon, text, iconClass, title) => h('button', {
        id,
        onClick,
        disabled: isExporting,
        className: 'flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 text-slate-700 dark:text-slate-200 text-xs font-bold transition disabled:opacity-50',
        title,
    }, h(Icon, { className: `w-3.5 h-3.5 ${iconClass}` }), h('span', { className: 'inline' }, t(text)));

    const itemRows = (invoice.items || []).map((item, idx) => h('tr', { key: item.id || idx, className: 'receipt-item-row' },
        h('td', { className:'receipt-cell receipt-index-cell' },idx+1),
        h('td', { className: 'receipt-cell receipt-product-cell' }, item.productName),
        h('td', { className: 'receipt-cell receipt-unit-cell' }, item.unitName || '-'),
        h('td', { className: 'receipt-cell receipt-number-cell' }, item.quantity),
        h('td', { className: 'receipt-cell receipt-number-cell' }, money(item.unitPrice)),
        h('td', { className: 'receipt-cell receipt-number-cell receipt-total-cell' }, money(item.total))
    ));

    const totalRow = (label, value, cls = '') => h('div', { className: `receipt-total-row ${cls}` },
        h('span', { className: 'receipt-total-label' }, label),
        h('span', { className: 'receipt-total-value' }, `${money(value)} ${settings.currencySymbol}`)
    );
    const paymentCell = (label, value, cls = '') => h('div', { className: `receipt-payment-cell ${cls}` },
        h('span', { className: 'receipt-payment-label' }, `${label}:`),
        h('span', { className: 'receipt-payment-value' }, `${money(value)} ${settings.currencySymbol}`)
    );

    return h(ModalLayer, {
        id: 'modal-receipt-backdrop',
        className: 'fixed inset-x-0 oscar-bounded-modal z-[80] flex items-stretch sm:items-center justify-center bg-black/70 p-1.5 sm:p-3 overflow-hidden animate-in fade-in'
    }, h('div', {
        id: 'modal-receipt-box',
        className: 'w-full max-w-5xl rounded-xl sm:rounded-2xl bg-white dark:bg-slate-900 shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col h-full max-h-full sm:h-auto'
    },
        h('div', { className: 'no-print flex flex-wrap items-center justify-between p-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 gap-2 select-none' },
            h('div', { className: 'flex items-center gap-1.5 bg-slate-200/70 dark:bg-slate-800 p-1 rounded-lg' },
                paperButton('80mm', '80 ملم حراري'),
                paperButton('58mm', '58 ملم'),
                paperButton('a4', 'A4')
            ),
            h('div', { className: 'flex items-center gap-1.5 flex-wrap justify-end' },
                exportButton('btn-download-receipt-excel', handleDownloadExcel, FileSpreadsheet, 'Excel', 'text-violet-600', 'تنزيل الفاتورة كملف Excel احترافي'),
                exportButton('btn-download-receipt-pdf', handleDownloadPDF, Download, 'PDF', 'text-rose-600', 'تنزيل الفاتورة كملف PDF احترافي'),
                exportButton('btn-download-receipt-image', handleDownloadImage, ImageIcon, 'صورة', 'text-blue-600', 'تنزيل الفاتورة كصورة'),
                h('button', { id: 'btn-bluetooth-print', onClick: handleBluetoothPrint, disabled: isExporting, className: `flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-white text-xs font-bold shadow-xs transition disabled:opacity-50 ${printerState.ready ? 'bg-violet-600 hover:bg-violet-700' : 'bg-blue-600 hover:bg-blue-700'}`, title: printerState.connected ? `متصل: ${printerState.name || 'طابعة'}` : printerState.systemMode ? 'طباعة عبر نظام الجهاز' : 'اختيار الطابعة والطباعة' },
                    h(Bluetooth, { className: 'w-4 h-4' }), h('span', null, printerState.connected ? 'طباعة Bluetooth' : printerState.systemMode ? (printerState.isIOS ? 'طباعة iPhone' : 'طباعة النظام') : (printerState.bluetoothSupported ? 'ربط وطباعة Bluetooth' : (printerState.isIOS ? 'طباعة iPhone' : 'طباعة النظام')))
                ),
                h('button', { id: 'btn-trigger-print', onClick: handlePrint, className: 'flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-xs font-bold shadow-xs transition' },
                    h(Printer, { className: 'w-4 h-4' }), h('span', null, 'طباعة الفاتورة فقط')
                )
            )
        ),
        h('div', { className: 'receipt-preview-scroll flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-2 sm:p-4 bg-slate-100 dark:bg-slate-950/80 flex items-start justify-center custom-scrollbar overscroll-contain' },
            h('div', {
                ref: receiptContainerRef,
                id: 'printable-receipt',
                'data-paper': paperWidth,
                className: `receipt-paper bg-white text-black shadow-sm border border-slate-200 text-right select-none transition-all mx-auto ${paperWidth === '80mm' ? 'receipt-paper-80' : paperWidth === '58mm' ? 'receipt-paper-58' : 'receipt-paper-a4'}`,
                style: { fontFamily: "Tahoma, Arial, system-ui, -apple-system, sans-serif" }
            },
                h('div', { className: 'receipt-brand-header' },
                    logoSrc ? h('img', {
                        src: logoSrc,
                        alt: settings.storeName,
                        className: 'receipt-brand-logo',
                        onError: (e) => { e.currentTarget.onerror = null; e.currentTarget.src = DEFAULT_LOGO_DATA_URL; }
                    }) : null,
                    h('h2', { className: 'receipt-store-name' }, settings.storeName),
                    null,
                    settings.receiptShowStoreInfo !== false ? h('div', { className: 'receipt-store-info-grid' },
                        settings.address ? h('span', { className: 'receipt-store-info' }, settings.address) : null,
                        settings.phone ? h('span', { className: 'receipt-store-info' }, `هاتف: ${settings.phone}`) : null,
                        settings.taxNumber ? h('span', { className: 'receipt-store-info' }, `الرقم الضريبي: ${settings.taxNumber}`) : null
                    ) : null
                ),
                h('div', { className: 'receipt-meta' },
                    h('div', { className: 'receipt-meta-row receipt-meta-strong' }, h('span', null, isReturn ? 'فاتورة مرتجع مبيعات' : 'فاتورة مبيعات'), h('span', { className: 'font-mono' }, `#${invoice.invoiceNumber}`)),
                    h('div', { className: 'receipt-meta-row' }, h('span', null, t("التاريخ:")), h('span', null, `${new Date(invoice.date).toLocaleDateString('ar-EG')} - ${new Date(invoice.date).toLocaleTimeString('ar-EG')}`)),
                    h('div', { className: 'receipt-meta-row' }, h('span', null, t("الكاشير:")), h('span', null, invoice.cashierName || '-')),
                    invoice.customerName && invoice.customerId !== 'cust-walkin' ? h('div', { className: 'receipt-meta-row receipt-meta-strong' }, h('span', null, t("العميل:")), h('span', null, invoice.customerName)) : null
                ),
                h('div', { className: 'receipt-items-wrap' },
                    h('table', { className: 'receipt-items-table' },
                        h('colgroup', null,
                            h('col', { className:'receipt-col-index' }),h('col', { className: 'receipt-col-product' }),
                            h('col', { className: 'receipt-col-unit' }),
                            h('col', { className: 'receipt-col-qty' }),
                            h('col', { className: 'receipt-col-price' }),
                            h('col', { className: 'receipt-col-total' })
                        ),
                        h('thead', null, h('tr', null,h('th',null,'#'),
                            h('th', null, t("الصنف")),
                            h('th', null, t("الوحدة")),
                            h('th', { className: 'receipt-qty-heading' }, t("الكمية")),
                            h('th', null, t("السعر")),
                            h('th', null, t("الإجمالي"))
                        )),
                        h('tbody', null, itemRows)
                    )
                ),
                h('div', { className: 'receipt-summary-divider', 'aria-hidden': 'true' }),
                (Number(invoice.discountTotal) > 0 || Number(invoice.taxTotal) > 0 || Number(invoice.additionalCharges) > 0) ? h('div', { className: 'receipt-adjustments' },
                    Number(invoice.discountTotal) > 0 ? totalRow('إجمالي الخصم:', -Number(invoice.discountTotal), 'receipt-total-discount') : null,
                    Number(invoice.taxTotal) > 0 ? totalRow(`ضريبة القيمة المضافة (${settings.taxRate}%):`, invoice.taxTotal) : null,
                    Number(invoice.additionalCharges)>0 ? totalRow('كلفة إضافية / شحن:',invoice.additionalCharges) : null
                ) : null,
                h('div', { className: 'receipt-payment-grid' },
                    h('div', { className: 'receipt-payment-column receipt-payment-right' },
                        paymentCell('المجموع', invoice.subtotal, 'receipt-payment-strong'),
                        paymentCell('المبلغ المطلوب', invoice.grandTotal, 'receipt-payment-strong')
                    ),
                    h('div', { className: 'receipt-payment-column receipt-payment-left' },
                        paymentCell('المدفوع', invoice.paidAmount),
                        paymentCell('المتبقي', Number(invoice.remainingAmount || 0), 'receipt-payment-debt')
                    )
                ),
                Number(invoice.changeAmount) > 0 ? h('div', { className: 'receipt-adjustments' }, totalRow('الفكة للزبون:', invoice.changeAmount, 'receipt-total-change')) : null,
                h('div', { className: 'receipt-footer' },
                    settings.receiptShowBarcode !== false && customerQrDataUrl ? h('div', { className: 'receipt-customer-qr' }, h('img', { src: customerQrDataUrl, alt: 'QR صفحة العميل والسداد' }), h('strong', null, 'امسح لفتح صفحة العميل والسداد')) : null,
                    h('p', null, settings.receiptFooterMessage || ''),
                    h('div', { className: 'receipt-system-mark' }, 'برنامج كاش توب المحاسبي جوال 0597603119')
                )
            )
        ),
        h('div',{className:'no-print ct-receipt-footer'},h('button',{type:'button',onClick:()=>setShowThermalModal(null)},t("إغلاق العرض")))
    ));
};
