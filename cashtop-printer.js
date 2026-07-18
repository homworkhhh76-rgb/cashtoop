'use strict';

(function () {
  const PRINTER_KEY = 'cashtop_printer_settings';
  const SETTINGS_KEY = 'cashtop_settings';
  const DEFAULTS = {
    printType: 'thermal-80',
    printCopies: 1,
    showLogo: true,
    showBarcode: true,
    showFooterText: true,
    autoPrint: true,
    bluetoothEnabled: false,
    bluetoothTransport: '',
    bluetoothDeviceId: '',
    bluetoothDeviceName: '',
    serialBaudRate: 9600
  };

  const BLE_CANDIDATES = [
    { service: '0000ffe0-0000-1000-8000-00805f9b34fb', characteristic: '0000ffe1-0000-1000-8000-00805f9b34fb' },
    { service: '6e400001-b5a3-f393-e0a9-e50e24dcca9e', characteristic: '6e400002-b5a3-f393-e0a9-e50e24dcca9e' },
    { service: '0000ff00-0000-1000-8000-00805f9b34fb', characteristic: '0000ff02-0000-1000-8000-00805f9b34fb' },
    { service: '0000ae30-0000-1000-8000-00805f9b34fb', characteristic: '0000ae01-0000-1000-8000-00805f9b34fb' },
    { service: '000018f0-0000-1000-8000-00805f9b34fb', characteristic: '00002af1-0000-1000-8000-00805f9b34fb' }
  ];
  const BLE_SERVICES = [...new Set(BLE_CANDIDATES.map(item => item.service))];

  let bleDevice = null;
  let bleCharacteristic = null;
  let serialPort = null;
  let libraryPromise = null;

  function safeJson(raw, fallback = {}) {
    try { return JSON.parse(raw || '') || fallback; } catch (_) { return fallback; }
  }

  function getPrinterSettings() {
    return { ...DEFAULTS, ...safeJson(localStorage.getItem(PRINTER_KEY), {}) };
  }

  function getSystemSettings() {
    return safeJson(localStorage.getItem(SETTINGS_KEY), {});
  }

  function savePrinterPatch(patch) {
    const next = { ...getPrinterSettings(), ...(patch || {}) };
    localStorage.setItem(PRINTER_KEY, JSON.stringify(next));
    return next;
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[char]);
  }

  function number(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }

  function money(value) {
    return number(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function currencyLabel(settings) {
    const currency = settings.currency || 'شيكل';
    return ({ شيكل: '₪', دولار: '$', دينار: 'JD', ريال: 'SR' })[currency] || currency;
  }

  function invoiceNumber(invoice) {
    return String(invoice?.id || invoice?.invoiceNo || invoice?.number || Date.now()).replace(/^INV_/, '');
  }

  function itemUnit(item) {
    if (item?.selectedUnit === 'unit') return item.unitName || 'وحدة';
    return item?.pieceName || 'حبة';
  }

  function receiptCss(type) {
    const is58 = type === 'thermal-58';
    const isA4 = type === 'paper-a4';
    const width = is58 ? '58mm' : isA4 ? '190mm' : '80mm';
    const padding = is58 ? '2.5mm 3mm' : isA4 ? '10mm 12mm' : '3mm 4mm';
    return `
      *{box-sizing:border-box;font-family:'Cairo',Arial,Tahoma,sans-serif}
      html,body{margin:0;padding:0;background:#fff;color:#000}
      .ct-print-receipt{
        background:#fff;color:#000;width:${width};max-width:${width};padding:${padding};
        direction:rtl;margin:0 auto;position:relative;font-size:${isA4 ? '14px' : is58 ? '11px' : '13px'};
        -webkit-print-color-adjust:exact;print-color-adjust:exact
      }
      .ct-print-receipt .receipt-header{text-align:center;margin-bottom:10px}
      .ct-print-receipt .receipt-logo{max-width:90px;max-height:90px;object-fit:contain;filter:grayscale(100%) contrast(200%);margin:0 auto 5px;display:block}
      .ct-print-receipt .store-name{font-size:22px;font-weight:900;margin:0}
      .ct-print-receipt .branch-name{font-size:14px;margin:5px 0;font-weight:600}
      .ct-print-receipt .invoice-title{font-size:18px;font-weight:800;margin:10px 0}
      .ct-print-receipt .dashed-line{border-top:1.5px dashed #000;margin:10px 0;width:100%}
      .ct-print-receipt .info-grid{
        display:grid;grid-template-columns:auto 1fr auto 1fr;gap:6px 10px;
        font-size:12.5px;font-weight:600;margin-bottom:5px;align-items:center
      }
      .ct-print-receipt .info-label{font-weight:400;color:#333}
      .ct-print-receipt .info-value{font-weight:700;text-align:right;min-width:0;overflow-wrap:anywhere}
      .ct-print-receipt .receipt-table{
        width:100%;border-collapse:collapse;margin-bottom:5px;font-weight:700;
        font-size:12.5px;table-layout:fixed
      }
      .ct-print-receipt .receipt-table th{padding:6px 0}
      .ct-print-receipt .receipt-table td{padding:4px 0;font-weight:600;overflow-wrap:anywhere}
      .ct-print-receipt .receipt-table th,.ct-print-receipt .receipt-table td{text-align:center}
      .ct-print-receipt .receipt-table th:first-child,.ct-print-receipt .receipt-table td:first-child{text-align:right}
      .ct-print-receipt .receipt-table th:last-child,.ct-print-receipt .receipt-table td:last-child{text-align:left}
      .ct-print-receipt .totals-horizontal-box{
        display:flex;justify-content:space-between;border:2px solid #000;border-radius:8px;
        padding:8px 5px;margin:15px 0;background:#fff
      }
      .ct-print-receipt .total-col{
        flex:1;display:flex;flex-direction:column;align-items:center;border-left:1px dashed #777;min-width:0
      }
      .ct-print-receipt .total-col:last-child{border-left:none}
      .ct-print-receipt .total-label{font-size:12px;font-weight:700;margin-bottom:4px;color:#222}
      .ct-print-receipt .total-val{font-size:14px;font-weight:900;overflow-wrap:anywhere;text-align:center}
      .ct-print-receipt .receipt-footer{text-align:center;margin-top:10px;font-weight:600}
      .ct-print-receipt .items-count{padding-bottom:5px;font-size:14px;font-weight:700}
      .ct-print-receipt .terms{font-size:11px;margin-top:5px;line-height:1.5;font-weight:600}
      .ct-print-receipt .barcode-container{text-align:center;margin-top:10px}
      .ct-print-receipt .barcode-container svg{max-width:100%;height:35px}
      .ct-print-receipt .barcode-fallback{font-family:monospace;font-size:12px;letter-spacing:2px;font-weight:700}
      ${is58 ? `
        .ct-print-receipt .receipt-logo{max-width:70px;max-height:70px}
        .ct-print-receipt .store-name{font-size:17px}
        .ct-print-receipt .branch-name{font-size:10px}
        .ct-print-receipt .invoice-title{font-size:14px;margin:7px 0}
        .ct-print-receipt .info-grid{gap:4px 5px;font-size:8.5px}
        .ct-print-receipt .receipt-table{font-size:8px}
        .ct-print-receipt .receipt-table th{padding:5px 1px}
        .ct-print-receipt .receipt-table td{padding:4px 1px}
        .ct-print-receipt .totals-horizontal-box{padding:6px 2px;margin:12px 0}
        .ct-print-receipt .total-label{font-size:8px}
        .ct-print-receipt .total-val{font-size:9px}
        .ct-print-receipt .items-count{font-size:9px}
        .ct-print-receipt .terms{font-size:7.5px}
        .ct-print-receipt .barcode-container svg{height:28px}
      ` : ''}
      ${isA4 ? `
        .ct-print-receipt .receipt-logo{max-width:110px;max-height:110px}
        .ct-print-receipt .store-name{font-size:26px}
        .ct-print-receipt .branch-name{font-size:15px}
        .ct-print-receipt .invoice-title{font-size:20px}
        .ct-print-receipt .info-grid{font-size:13px}
        .ct-print-receipt .receipt-table{font-size:12.5px}
      ` : ''}
    `;
  }

  function buildReceiptMarkup(invoice, options = {}) {
    const printer = { ...getPrinterSettings(), ...(options.printer || {}) };
    const settings = { ...getSystemSettings(), ...(options.settings || {}) };
    const type = ['thermal-58', 'thermal-80', 'paper-a4'].includes(printer.printType) ? printer.printType : 'thermal-80';
    const items = Array.isArray(invoice?.items) ? invoice.items : [];
    const subtotal = Number.isFinite(Number(invoice?.subtotal)) ? number(invoice.subtotal) : items.reduce((sum, item) => sum + number(item.qty) * number(item.price), 0);
    const total = number(invoice?.total ?? subtotal);
    const paid = number(invoice?.paid);
    const remaining = Math.max(0, number(invoice?.debt ?? (total - paid)));
    const currency = currencyLabel(settings);
    const date = new Date(invoice?.date || Date.now());
    const dateText = Number.isFinite(date.getTime()) ? date.toLocaleDateString('en-GB') : '-';
    const timeText = Number.isFinite(date.getTime()) ? date.toLocaleTimeString('en-GB', { hour12: false }) : '-';
    const logo = printer.showLogo !== false && settings.logo
      ? `<img class="receipt-logo" src="${escapeHtml(settings.logo)}" alt="الشعار">`
      : '';
    const rows = items.map(item => {
      const qty = number(item.qty);
      const price = number(item.price);
      return `<tr><td style="width:35%">${escapeHtml(item.name || 'صنف')}</td><td style="width:15%">${escapeHtml(itemUnit(item))}</td><td style="width:15%">${escapeHtml(Number(qty.toFixed(6)))}</td><td style="width:17%">${money(price)}</td><td style="width:18%">${money(qty * price)}</td></tr>`;
    }).join('') || '<tr><td colspan="5">لا توجد أصناف</td></tr>';
    const barcode = printer.showBarcode !== false
      ? `<div class="barcode-container"><svg class="ct-invoice-barcode" data-code="${escapeHtml(invoiceNumber(invoice))}"></svg></div>`
      : '';
    const footer = printer.showFooterText !== false
      ? '<div class="terms">البضاعة المباعة لا ترد ولا تستبدل إلا حسب الشروط والأحكام. شكراً لزيارتكم!</div>'
      : '';
    return {
      type,
      css: receiptCss(type),
      html: `<div class="ct-print-receipt ${type}">
        <div class="receipt-header">${logo}<p class="store-name">${escapeHtml(settings.companyName || 'كاش توب')}</p><p class="branch-name">${escapeHtml(invoice?.branchName || settings.branchName || 'الفرع الرئيسي')}</p><p class="invoice-title">فاتورة بيع ضريبية</p></div>
        <div class="dashed-line"></div>
        <div class="info-grid">
          <span class="info-label">رقم العملية:</span><span class="info-value">${escapeHtml(invoiceNumber(invoice))}</span><span class="info-label">التاريخ:</span><span class="info-value">${escapeHtml(dateText)}</span>
          <span class="info-label">الكاشير:</span><span class="info-value">${escapeHtml(invoice?.user || 'المدير')}</span><span class="info-label">الوقت:</span><span class="info-value">${escapeHtml(timeText)}</span>
          <span class="info-label">العميل:</span><span class="info-value">${escapeHtml(invoice?.customer || 'عميل نقدي')}</span><span class="info-label">الجوال:</span><span class="info-value">${escapeHtml(invoice?.phone || '-')}</span>
          <span class="info-label">الدفع:</span><span class="info-value">${escapeHtml(invoice?.paymentMethod || 'نقداً')}</span><span></span><span></span>
        </div>
        <div class="dashed-line"></div>
        <table class="receipt-table"><thead><tr><th>الصنف</th><th>الوحدة</th><th>الكمية</th><th>السعر</th><th>الإجمالي</th></tr></thead><tbody>${rows}</tbody></table>
        <div class="dashed-line"></div>
        <div class="totals-horizontal-box">
          <div class="total-col"><span class="total-label">الإجمالي</span><span class="total-val">${money(subtotal)} ${escapeHtml(currency)}</span></div>
          <div class="total-col"><span class="total-label">الصافي</span><span class="total-val">${money(total)} ${escapeHtml(currency)}</span></div>
          <div class="total-col"><span class="total-label">المدفوع</span><span class="total-val">${money(paid)} ${escapeHtml(currency)}</span></div>
          <div class="total-col"><span class="total-label">المتبقي</span><span class="total-val">${money(remaining)} ${escapeHtml(currency)}</span></div>
        </div>
        <div class="receipt-footer"><div class="items-count">عدد الاصناف المباعة <span>${items.length}</span></div><div class="dashed-line"></div>${footer}${barcode}</div>
      </div>`
    };
  }

  function loadScriptOnce(src, test) {
    if (test()) return Promise.resolve(true);
    return new Promise((resolve, reject) => {
      const existing = [...document.scripts].find(script => script.src === src);
      if (existing) {
        existing.addEventListener('load', () => resolve(test()), { once: true });
        existing.addEventListener('error', reject, { once: true });
        return;
      }
      const script = document.createElement('script');
      script.src = src;
      script.async = true;
      script.onload = () => resolve(test());
      script.onerror = () => reject(new Error(`تعذر تحميل مكتبة الطباعة: ${src}`));
      document.head.appendChild(script);
    });
  }

  function ensureLibraries() {
    if (!libraryPromise) {
      libraryPromise = Promise.all([
        loadScriptOnce('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js', () => typeof window.html2canvas === 'function'),
        loadScriptOnce('https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js', () => typeof window.JsBarcode === 'function')
      ]).catch(error => {
        libraryPromise = null;
        throw error;
      });
    }
    return libraryPromise;
  }

  async function createReceiptElement(invoice, options = {}) {
    await ensureLibraries();
    const built = buildReceiptMarkup(invoice, options);
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;left:-100000px;top:0;z-index:-1;background:#fff;pointer-events:none;';
    const style = document.createElement('style');
    style.textContent = built.css;
    host.appendChild(style);
    const wrap = document.createElement('div');
    wrap.innerHTML = built.html;
    host.appendChild(wrap);
    document.body.appendChild(host);
    const receipt = host.querySelector('.ct-print-receipt');
    const barcode = receipt?.querySelector('.ct-invoice-barcode');
    if (barcode && typeof window.JsBarcode === 'function') {
      try {
        window.JsBarcode(barcode, barcode.dataset.code || invoiceNumber(invoice), {
          format: 'CODE128', width: built.type === 'thermal-58' ? 1.15 : 1.5, height: built.type === 'thermal-58' ? 26 : 34,
          displayValue: true, margin: 0, fontSize: built.type === 'thermal-58' ? 8 : 10
        });
      } catch (_) { barcode.closest('.barcode-container')?.remove(); }
    }
    try { await document.fonts?.ready; } catch (_) {}
    await Promise.all([...receipt.querySelectorAll('img')].map(img => img.complete ? Promise.resolve() : new Promise(resolve => {
      img.onload = resolve; img.onerror = resolve; setTimeout(resolve, 2500);
    })));
    return { host, receipt, type: built.type };
  }

  function dotsForType(type) {
    if (type === 'thermal-58') return 384;
    if (type === 'thermal-80') return 576;
    return 1240;
  }

  async function renderInvoiceCanvas(invoice, options = {}) {
    const created = await createReceiptElement(invoice, options);
    try {
      const source = await window.html2canvas(created.receipt, { scale: 3, backgroundColor: '#ffffff', useCORS: true, logging: false });
      const targetWidth = dotsForType(created.type);
      const targetHeight = Math.max(1, Math.round(source.height * targetWidth / source.width));
      const canvas = document.createElement('canvas');
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, targetWidth, targetHeight);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(source, 0, 0, targetWidth, targetHeight);
      return { canvas, type: created.type };
    } finally {
      created.host.remove();
    }
  }

  function concatUint8Arrays(parts) {
    const length = parts.reduce((sum, part) => sum + part.length, 0);
    const result = new Uint8Array(length);
    let offset = 0;
    for (const part of parts) { result.set(part, offset); offset += part.length; }
    return result;
  }

  function canvasToEscPosRaster(canvas) {
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const width = canvas.width;
    const height = canvas.height;
    const bytesPerRow = Math.ceil(width / 8);
    const bandHeight = 256;
    const parts = [new Uint8Array([0x1b, 0x40, 0x1b, 0x61, 0x00])];
    for (let startY = 0; startY < height; startY += bandHeight) {
      const currentHeight = Math.min(bandHeight, height - startY);
      const raster = new Uint8Array(bytesPerRow * currentHeight);
      for (let y = 0; y < currentHeight; y += 1) {
        const sourceY = startY + y;
        for (let x = 0; x < width; x += 1) {
          const i = (sourceY * width + x) * 4;
          const luminance = (image.data[i] * 0.299) + (image.data[i + 1] * 0.587) + (image.data[i + 2] * 0.114);
          if (image.data[i + 3] > 80 && luminance < 190) raster[y * bytesPerRow + (x >> 3)] |= (0x80 >> (x & 7));
        }
      }
      const xL = bytesPerRow & 0xff; const xH = (bytesPerRow >> 8) & 0xff;
      const yL = currentHeight & 0xff; const yH = (currentHeight >> 8) & 0xff;
      parts.push(new Uint8Array([0x1d, 0x76, 0x30, 0x00, xL, xH, yL, yH]));
      parts.push(raster);
    }
    parts.push(new Uint8Array([0x1b, 0x64, 0x04, 0x1d, 0x56, 0x41, 0x10]));
    return concatUint8Arrays(parts);
  }

  async function findWritableBleCharacteristic(server) {
    for (const candidate of BLE_CANDIDATES) {
      try {
        const service = await server.getPrimaryService(candidate.service);
        const characteristic = await service.getCharacteristic(candidate.characteristic);
        if (characteristic?.properties?.write || characteristic?.properties?.writeWithoutResponse) return characteristic;
      } catch (_) {}
    }
    try {
      const services = await server.getPrimaryServices();
      for (const service of services) {
        try {
          const characteristics = await service.getCharacteristics();
          const writable = characteristics.find(item => item.properties?.writeWithoutResponse || item.properties?.write);
          if (writable) return writable;
        } catch (_) {}
      }
    } catch (_) {}
    throw new Error('تم الاتصال بالطابعة، لكن قناة الإرسال الخاصة بها غير مدعومة عبر Web Bluetooth.');
  }

  async function connectSelectedDevice(device) {
    if (!device) throw new Error('لم يتم اختيار طابعة Bluetooth.');
    if (!device.gatt) throw new Error('هذه الطابعة لا تدعم اتصال BLE المتاح للمتصفح.');
    const server = device.gatt.connected ? device.gatt : await device.gatt.connect();
    const characteristic = await findWritableBleCharacteristic(server);
    bleDevice = device;
    bleCharacteristic = characteristic;
    savePrinterPatch({
      bluetoothTransport: 'ble',
      bluetoothDeviceId: device.id || '',
      bluetoothDeviceName: device.name || 'Bluetooth Printer'
    });
    device.addEventListener?.('gattserverdisconnected', () => { bleCharacteristic = null; });
    return { id: device.id || '', name: device.name || 'Bluetooth Printer', connected: true, transport: 'ble' };
  }

  async function connectSerialBluetooth(options = {}) {
    if (!navigator.serial) throw new Error('Web Serial غير متاح في هذا المتصفح.');
    const printer = getPrinterSettings();
    if (serialPort?.writable) return { id: 'serial', name: printer.bluetoothDeviceName || 'Bluetooth/Serial Printer', connected: true, transport: 'serial' };

    let port = null;
    if (typeof navigator.serial.getPorts === 'function') {
      try {
        const ports = await navigator.serial.getPorts();
        if (ports.length) port = ports[0];
      } catch (_) {}
    }
    if (!port && options.prompt !== false) port = await navigator.serial.requestPort();
    if (!port) throw new Error('طابعة Bluetooth/Serial المحفوظة غير متاحة. أعد ربطها من إعدادات الطابعة.');

    if (!port.writable) await port.open({ baudRate: Number(printer.serialBaudRate) || 9600 });
    serialPort = port;
    const info = typeof port.getInfo === 'function' ? port.getInfo() : {};
    const label = info.usbVendorId ? `Bluetooth/Serial ${info.usbVendorId}:${info.usbProductId || ''}` : 'Bluetooth/Serial Printer';
    savePrinterPatch({ bluetoothTransport: 'serial', bluetoothDeviceName: label });
    return { id: 'serial', name: label, connected: true, transport: 'serial' };
  }

  async function connectBluetooth(options = {}) {
    const printer = getPrinterSettings();
    if (printer.bluetoothTransport === 'serial' && navigator.serial) {
      try { return await connectSerialBluetooth(options); } catch (error) { if (options.prompt === false) throw error; }
    }
    if (bleDevice?.gatt?.connected && bleCharacteristic) return { id: bleDevice.id || '', name: bleDevice.name || '', connected: true, transport: 'ble' };

    let bleError = null;
    if (navigator.bluetooth) {
      if (typeof navigator.bluetooth.getDevices === 'function' && printer.bluetoothDeviceId) {
        try {
          const devices = await navigator.bluetooth.getDevices();
          const remembered = devices.find(device => String(device.id) === String(printer.bluetoothDeviceId));
          if (remembered) return await connectSelectedDevice(remembered);
        } catch (_) {}
      }
      if (options.prompt !== false) {
        try {
          const device = await navigator.bluetooth.requestDevice({ acceptAllDevices: true, optionalServices: BLE_SERVICES });
          return await connectSelectedDevice(device);
        } catch (error) { bleError = error; }
      }
    }

    // كثير من الطابعات الحرارية القديمة تعمل Bluetooth Classic كمنفذ COM على Windows.
    // Web Bluetooth لا يراها، لذلك نستخدم Web Serial كمسار مباشر احتياطي عند توفره.
    if (navigator.serial) {
      try { return await connectSerialBluetooth(options); } catch (serialError) {
        if (!bleError) bleError = serialError;
      }
    }

    if (bleError) throw bleError;
    if (options.prompt === false) throw new Error('طابعة Bluetooth المحفوظة غير متاحة حالياً. أعد ربطها من إعدادات الطابعة.');
    throw new Error('الاتصال المباشر بـ Bluetooth غير متاح في هذا المتصفح أو الجهاز. استخدم Chrome/Edge المتوافق أو طباعة النظام.');
  }

  async function disconnectBluetooth() {
    try { if (bleDevice?.gatt?.connected) bleDevice.gatt.disconnect(); } catch (_) {}
    try { if (serialPort?.readable || serialPort?.writable) await serialPort.close(); } catch (_) {}
    bleCharacteristic = null;
    bleDevice = null;
    serialPort = null;
    return true;
  }

  async function writeBleChunk(characteristic, chunk) {
    if (characteristic.properties?.writeWithoutResponse && characteristic.writeValueWithoutResponse) return characteristic.writeValueWithoutResponse(chunk);
    if (characteristic.writeValueWithResponse) return characteristic.writeValueWithResponse(chunk);
    if (characteristic.writeValue) return characteristic.writeValue(chunk);
    throw new Error('خاصية Bluetooth لا تسمح بإرسال بيانات الطباعة.');
  }

  function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

  async function printUsb(invoice, options = {}) {
    const printer = { ...getPrinterSettings(), ...(options.printer || {}) };
    if (printer.printType === 'paper-a4') throw new Error('الطباعة الحرارية USB المباشرة مخصصة لمقاسات 58/80 ملم.');
    if (!navigator.usb) throw new Error('WebUSB غير متاح في هذا المتصفح أو يحتاج تشغيل التطبيق عبر HTTPS/localhost.');

    const { canvas } = await renderInvoiceCanvas(invoice, { ...options, printer });
    const data = canvasToEscPosRaster(canvas);
    const copies = Math.min(10, Math.max(1, parseInt(printer.printCopies, 10) || 1));

    const device = options.device || await navigator.usb.requestDevice({ filters: [] });
    await device.open();
    if (!device.configuration) await device.selectConfiguration(1);

    let interfaceNumber = null;
    let endpointNumber = null;
    let alternateSetting = null;
    for (const iface of device.configuration.interfaces) {
      for (const alternate of iface.alternates) {
        const outEndpoint = alternate.endpoints.find(ep => ep.direction === 'out');
        if (outEndpoint) {
          interfaceNumber = iface.interfaceNumber;
          endpointNumber = outEndpoint.endpointNumber;
          alternateSetting = alternate.alternateSetting;
          break;
        }
      }
      if (interfaceNumber !== null) break;
    }
    if (interfaceNumber === null || endpointNumber === null) {
      throw new Error('تم اختيار جهاز USB لكن لم يتم العثور على منفذ إرسال للطابعة.');
    }

    await device.claimInterface(interfaceNumber);
    if (alternateSetting !== null) {
      try { await device.selectAlternateInterface(interfaceNumber, alternateSetting); } catch (_) {}
    }

    for (let copy = 0; copy < copies; copy += 1) {
      for (let offset = 0; offset < data.length; offset += 16384) {
        const result = await device.transferOut(endpointNumber, data.slice(offset, Math.min(offset + 16384, data.length)));
        if (result?.status && result.status !== 'ok') throw new Error('فشل إرسال بيانات الطباعة عبر USB.');
      }
    }
    return { ok: true, mode: 'usb', copies };
  }

  async function printSerial(invoice, options = {}) {
    const printer = { ...getPrinterSettings(), ...(options.printer || {}) };
    if (printer.printType === 'paper-a4') throw new Error('الطباعة الحرارية المباشرة مخصصة لمقاسات 58/80 ملم.');
    const connection = serialPort?.writable
      ? { transport: 'serial' }
      : await connectSerialBluetooth({ prompt: options.prompt !== false });
    if (connection.transport !== 'serial' || !serialPort?.writable) throw new Error('تعذر فتح منفذ طابعة Bluetooth/Serial.');
    const { canvas } = await renderInvoiceCanvas(invoice, { ...options, printer });
    const data = canvasToEscPosRaster(canvas);
    const copies = Math.min(10, Math.max(1, parseInt(printer.printCopies, 10) || 1));
    const writer = serialPort.writable.getWriter();
    try {
      for (let copy = 0; copy < copies; copy += 1) {
        for (let offset = 0; offset < data.length; offset += 8192) {
          await writer.write(data.slice(offset, Math.min(offset + 8192, data.length)));
        }
      }
    } finally {
      writer.releaseLock();
    }
    return { ok: true, mode: 'bluetooth-serial', copies };
  }

  async function printBluetooth(invoice, options = {}) {
    const printer = { ...getPrinterSettings(), ...(options.printer || {}) };
    if (printer.printType === 'paper-a4') throw new Error('طباعة Bluetooth المباشرة مخصصة للمقاسات الحرارية.');
    const connection = await connectBluetooth({ prompt: options.prompt !== false });
    if (connection.transport === 'serial') return printSerial(invoice, { ...options, printer, prompt: false });
    const characteristic = bleCharacteristic;
    if (!characteristic) throw new Error('تعذر فتح قناة الطباعة عبر Bluetooth.');
    const { canvas } = await renderInvoiceCanvas(invoice, { ...options, printer });
    const data = canvasToEscPosRaster(canvas);
    const copies = Math.min(10, Math.max(1, parseInt(printer.printCopies, 10) || 1));
    for (let copy = 0; copy < copies; copy += 1) {
      for (let offset = 0; offset < data.length; offset += 100) {
        await writeBleChunk(characteristic, data.slice(offset, Math.min(offset + 100, data.length)));
        await sleep(10);
      }
    }
    return { ok: true, mode: 'bluetooth', copies };
  }

  async function tryNativePrintBridge(invoice, options = {}) {
    const printer = { ...getPrinterSettings(), ...(options.printer || {}) };
    if (printer.printType === 'paper-a4') return false;
    const hasBridge = Boolean(
      (window.AndroidThermalPrinter && typeof window.AndroidThermalPrinter.printBase64 === 'function') ||
      (window.Android && typeof window.Android.printBase64 === 'function') ||
      window.webkit?.messageHandlers?.thermalPrinter ||
      (window.chrome?.webview && typeof window.chrome.webview.postMessage === 'function')
    );
    if (!hasBridge) return false;
    const { canvas, type } = await renderInvoiceCanvas(invoice, { ...options, printer });
    const payload = { type: 'thermal-print', invoiceNo: invoiceNumber(invoice), widthDots: dotsForType(type), imageDataUrl: canvas.toDataURL('image/png') };
    if (window.AndroidThermalPrinter && typeof window.AndroidThermalPrinter.printBase64 === 'function') { window.AndroidThermalPrinter.printBase64(payload.imageDataUrl, String(payload.widthDots)); return true; }
    if (window.Android && typeof window.Android.printBase64 === 'function') { window.Android.printBase64(payload.imageDataUrl, String(payload.widthDots)); return true; }
    if (window.webkit?.messageHandlers?.thermalPrinter) { window.webkit.messageHandlers.thermalPrinter.postMessage(payload); return true; }
    if (window.chrome?.webview && typeof window.chrome.webview.postMessage === 'function') { window.chrome.webview.postMessage(payload); return true; }
    return false;
  }

  async function waitForFrameReady(frame) {
    const doc = frame.contentDocument;
    try { await doc.fonts?.ready; } catch (_) {}
    const images = [...doc.images];
    await Promise.all(images.map(img => {
      if (img.complete && img.naturalWidth > 0) return Promise.resolve();
      if (typeof img.decode === 'function') return img.decode().catch(() => {});
      return new Promise(resolve => {
        img.addEventListener('load', resolve, { once: true });
        img.addEventListener('error', resolve, { once: true });
        setTimeout(resolve, 2500);
      });
    }));
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    await sleep(120);
  }

  function createPrintFrame() {
    let frame = document.getElementById('ctUniversalPrintFrame');
    if (!frame) {
      frame = document.createElement('iframe');
      frame.id = 'ctUniversalPrintFrame';
      frame.setAttribute('title', 'معاينة طباعة الفاتورة');
      frame.setAttribute('aria-hidden', 'true');
      frame.style.cssText = 'position:fixed;left:-100000px;top:0;width:1px;height:1px;border:0;pointer-events:none;z-index:-2147483647;background:#fff;';
      document.body.appendChild(frame);
    }
    return frame;
  }

  async function renderBarcodeInDocument(doc, type, code) {
    const barcodes = [...doc.querySelectorAll('.ct-invoice-barcode')];
    if (!barcodes.length) return;
    try {
      await ensureLibraries();
      for (const barcode of barcodes) {
        window.JsBarcode(barcode, code, {
          format: 'CODE128',
          width: type === 'thermal-58' ? 1.15 : 1.5,
          height: type === 'thermal-58' ? 26 : 34,
          displayValue: true,
          margin: 0,
          fontSize: type === 'thermal-58' ? 8 : 10
        });
      }
    } catch (error) {
      console.warn('[CASH TOP] barcode library unavailable for system print:', error);
      for (const barcode of barcodes) {
        const fallback = doc.createElement('div');
        fallback.className = 'barcode-fallback';
        fallback.textContent = code;
        barcode.replaceWith(fallback);
      }
    }
  }

  function printPageCss(type, thermalHeightMm, copies) {
    const isA4 = type === 'paper-a4';
    if (isA4) {
      return `
        @page{size:A4 portrait;margin:10mm}
        html,body{margin:0!important;padding:0!important;background:#fff!important}
        body{direction:rtl}
        .ct-print-copy{width:190mm;min-height:277mm;margin:0 auto;display:flex;align-items:flex-start;justify-content:center;page-break-after:always;break-after:page}
        .ct-print-copy:last-child{page-break-after:auto;break-after:auto}
        .ct-print-receipt{box-shadow:none!important}
      `;
    }
    const sizeMm = type === 'thermal-58' ? 58 : 80;
    const heightMm = Math.max(20, Math.ceil(Number(thermalHeightMm) || 20));
    return `
      @page{size:${sizeMm}mm ${heightMm}mm;margin:0}
      html,body{width:${sizeMm}mm!important;margin:0!important;padding:0!important;background:#fff!important;overflow:visible!important}
      body{direction:rtl}
      .ct-print-copy{display:block;width:${sizeMm}mm;margin:0;padding:0;page-break-after:always;break-after:page}
      .ct-print-copy:last-child{page-break-after:auto;break-after:auto}
      .ct-print-receipt{width:${sizeMm}mm!important;max-width:${sizeMm}mm!important;margin:0!important;box-shadow:none!important}
    `;
  }

  async function systemPrint(invoice, options = {}) {
    const printer = { ...getPrinterSettings(), ...(options.printer || {}) };
    const built = buildReceiptMarkup(invoice, { ...options, printer });
    const type = built.type;
    const copies = Math.min(10, Math.max(1, parseInt(printer.printCopies, 10) || 1));
    const frame = createPrintFrame();
    const doc = frame.contentDocument || frame.contentWindow.document;
    const copyHtml = Array.from({ length: copies }, () => `<section class="ct-print-copy">${built.html}</section>`).join('');

    doc.open();
    doc.write(`<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>فاتورة ${escapeHtml(invoiceNumber(invoice))}</title><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;900&display=swap"><style>${built.css}</style><style id="ctPagePrintStyle"></style></head><body>${copyHtml}</body></html>`);
    doc.close();

    await renderBarcodeInDocument(doc, type, invoiceNumber(invoice));
    await waitForFrameReady(frame);

    let thermalHeightMm = 0;
    if (type !== 'paper-a4') {
      const receipt = doc.querySelector('.ct-print-receipt');
      const pxHeight = Math.max(receipt?.scrollHeight || 0, receipt?.getBoundingClientRect?.().height || 0);
      thermalHeightMm = Math.max(20, Math.ceil(pxHeight * 25.4 / 96) + 2);
    }
    let pageStyle = doc.getElementById('ctPagePrintStyle');
    if (!pageStyle) {
      pageStyle = doc.createElement('style');
      pageStyle.id = 'ctPagePrintStyle';
      doc.head.appendChild(pageStyle);
    }
    pageStyle.textContent = printPageCss(type, thermalHeightMm, copies);

    await waitForFrameReady(frame);
    const printWindow = frame.contentWindow;
    printWindow.focus();
    printWindow.print();
    return { ok: true, mode: 'system', copies };
  }

  async function printInvoice(invoice, options = {}) {
    const printer = { ...getPrinterSettings(), ...(options.printer || {}) };
    if (printer.printType === 'paper-a4') return systemPrint(invoice, { ...options, printer });

    try {
      if (await tryNativePrintBridge(invoice, { ...options, printer })) return { ok: true, mode: 'native' };
    } catch (error) { console.warn('[CASH TOP] native printer bridge:', error); }

    if (printer.bluetoothEnabled === true) {
      try {
        return await printBluetooth(invoice, { ...options, printer, prompt: true });
      } catch (error) {
        console.warn('[CASH TOP] Bluetooth printer unavailable:', error);
        if (options.bluetoothFallback === false) throw error;
      }
    }
    return systemPrint(invoice, { ...options, printer });
  }

  window.CashtopPrinter = {
    DEFAULTS,
    getSettings: getPrinterSettings,
    saveSettings: savePrinterPatch,
    buildReceiptMarkup,
    renderInvoiceCanvas,
    printInvoice,
    systemPrint,
    printBluetooth,
    printSerial,
    printUsb,
    connectBluetooth,
    connectSerialBluetooth,
    disconnectBluetooth,
    getBluetoothState: () => ({
      connected: Boolean((bleDevice?.gatt?.connected && bleCharacteristic) || serialPort?.writable),
      transport: bleDevice?.gatt?.connected && bleCharacteristic ? 'ble' : (serialPort?.writable ? 'serial' : getPrinterSettings().bluetoothTransport || ''),
      id: bleDevice?.id || getPrinterSettings().bluetoothDeviceId || '',
      name: bleDevice?.name || getPrinterSettings().bluetoothDeviceName || ''
    })
  };
})();
