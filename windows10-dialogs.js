/* Window controls for existing Cash Top dialogs. Form state and dismissal stay with the app. */
(() => {
  'use strict';

  // Android browsers commonly use a 980 CSS-pixel viewport in Desktop Site mode.
  const desktopMedia = window.matchMedia('(min-width: 960px)');
  const browserInfo = window.navigator;
  const userAgent = browserInfo?.userAgent || '';
  const desktopSiteOnTouch = (browserInfo?.maxTouchPoints || 0) > 0 &&
    /Windows NT|Macintosh|X11|CrOS/i.test(userAgent) &&
    !/Android|Mobile|iPhone|iPod/i.test(userAgent);
  const isDesktop = () => desktopMedia.matches || desktopSiteOnTouch;
  const registered = new WeakMap();
  const windows = new Map();
  const subscribers = new Set();
  const corners = ['nw', 'ne', 'sw', 'se'];
  let windowOrder = 0;
  let openPages = '';

  function publishOpenPages() {
    const next = [...new Set([...windows.values()].map(win => win.page).filter(Boolean))].sort().join(',');
    if (next === openPages) return;
    openPages = next;
    for (const listener of subscribers) listener();
  }

  function viewportBounds() {
    const root = document.documentElement;
    return {width:root.clientWidth, height:Math.min(root.clientHeight, window.visualViewport?.height || Infinity)};
  }

  function raise(win) {
    win.overlay.style.setProperty('--ct-win-stack', String(1600 + ++windowOrder));
  }

  function placeGrips(win, x, y, width, height) {
    for (const grip of win.grips) {
      const corner = grip.dataset.corner;
      place(grip, (corner.endsWith('e') ? x + width : x) - 10, (corner.startsWith('s') ? y + height : y) - 10, 20, 20);
      grip.hidden = win.state !== 'normal';
    }
  }
  const panelSelectors = [
    '.ct-modal-layer:not(.barcode-camera-overlay) > :is(div, section, form)',
    '.ct-login-code > section', '.ct-payment-dialog', '.ct-record-filter-dialog',
    '.ct-financial-close-dialog', '.customer-detail-panel', '.customer-editor-modal-panel', '.ct-statement-modal',
    '.oscar-employee-modal-panel', '.expense-entry-modal', '.expense-types-modal-panel',
    '.dist-modal', '.price-group-modal-panel', '.product-editor-modal-panel',
    '.waiter-order-dialog', '.waiter-confirm-dialog', '.oscar-ai-panel',
    '.modal-root > .modal', '.modal-back > .modal', '#full-cart-modal-box', '#modal-sync-box',
    'dialog[open]',
    ':is(.oscar-bounded-modal, .fixed.inset-0[class*="bg-black/"], .fixed.inset-0[class*="bg-slate-950/"]):not(.barcode-camera-overlay) > :is(div, section, form)[class*="rounded-"]:not(.mobile-sidebar-panel)'
  ].join(',');
  const paths = {
    minimize: 'M1 7.5h10',
    maximize: 'M1.5 1.5h9v9h-9z',
    restore: 'M4 3V1.5h6.5V8H9M1.5 4h7v6.5h-7z',
    close: 'm2 2 8 8m0-8-8 8'
  };

  const resizeObserver = new ResizeObserver(scheduleLayout);
  let animationFrame = 0;
  let refreshFrame = 0;

  function scheduleLayout() {
    if (animationFrame) return;
    animationFrame = requestAnimationFrame(() => {
      animationFrame = 0;
      for (const win of windows.values()) layout(win);
    });
  }

  function headingOf(panel) {
    return panel.querySelector('.oscar-employee-modal-panel > div:first-child .font-black') ||
      panel.querySelector('h1,h2,h3,h4,header strong,.modal-head strong');
  }

  function syncHeading(win) {
    const heading = headingOf(win.panel);
    if (win.heading !== heading) {
      win.heading?.classList.remove('ct-win-drag-title');
      heading?.classList.add('ct-win-drag-title');
      win.heading = heading;
    }
    const title = heading?.textContent.trim() || win.panel.getAttribute('aria-label') || document.title;
    if (win.controls.getAttribute('aria-label') !== title) win.controls.setAttribute('aria-label', title);
  }

  function syncCloseButtons(win) {
    const candidates = [...win.panel.querySelectorAll('button')].filter(button => {
      if (button.closest('.ct-win-caption-controls')) return false;
      const text = button.textContent.trim();
      const label = button.getAttribute('aria-label') || button.title;
      if (/^[×✕✖]$/.test(text)) return true;
      if (text) return false;
      if (/^(?:[إا]غلاق|close)(?:\s|$)/i.test(label)) return true;
      return !!button.querySelector('svg.lucide-x') &&
        !!(win.panel.firstElementChild?.contains(button) || button.closest('header,.modal-head,.qr-modal'));
    });
    for (const button of win.legacyCloseButtons) {
      if (!candidates.includes(button)) button.classList.remove('ct-win-legacy-close');
    }
    for (const button of candidates) button.classList.add('ct-win-legacy-close');
    win.legacyCloseButtons = candidates;
  }

  function findClose(panel) {
    const buttons = [...panel.querySelectorAll('button:not([disabled])')].filter(
      button => !button.closest('.ct-win-caption-controls') && !button.closest('[hidden]')
    );
    return buttons.find(button => /^(?:[إا]غلاق|close|×|✕|✖)(?:\s|$)/i.test(
      (button.getAttribute('aria-label') || button.title || button.textContent).trim()
    )) || buttons.find(button => button.matches('[data-close]') || button.querySelector('svg.lucide-x')) ||
      buttons.find(button => /^(?:[إا]لغاء(?: الأمر)?|cancel)$/i.test(button.textContent.trim()));
  }

  function captionButton(action, label) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `ct-win-caption-${action}`;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 12 12');
    svg.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS(svg.namespaceURI, 'path');
    svg.append(path);
    button.append(svg);
    updateButton(button, label, action);
    return button;
  }

  function updateButton(button, label, icon) {
    const english = {
      'تصغير': 'Minimize', 'تكبير': 'Maximize', 'استعادة': 'Restore', 'إغلاق': 'Close'
    };
    const text = document.documentElement.lang === 'en' ? english[label] : label;
    button.title = text;
    button.setAttribute('aria-label', text);
    button.querySelector('path').setAttribute('d', paths[icon]);
  }

  function place(element, left, top, width, height) {
    element.style.setProperty('--ct-win-left', `${Math.round(left)}px`);
    element.style.setProperty('--ct-win-top', `${Math.round(top)}px`);
    element.style.setProperty('--ct-win-width', `${Math.round(width)}px`);
    if (height !== undefined) element.style.setProperty('--ct-win-height', `${Math.round(height)}px`);
  }

  function layout(win) {
    const {panel, controls, state, position} = win;
    const bounds = viewportBounds();
    const edge = 6;
    const controlsWidth = 96;
    const controlsHeight = 32;
    const native = panel instanceof HTMLDialogElement;
    const insetTop = native ? 0 : controlsHeight;
    if (state !== 'normal') for (const grip of win.grips) grip.hidden = true;
    if (state === 'minimized') {
      const left = edge;
      const top = bounds.height - controlsHeight - edge;
      place(controls, left, top, controlsWidth);
      if (native) place(panel, left, top, controlsWidth, controlsHeight);
      return;
    }
    let {left, top, width, height} = panel.getBoundingClientRect();
    if (state === 'maximized') {
      left = edge;
      top = edge + insetTop;
      width = bounds.width - 2 * edge;
      height = bounds.height - 2 * edge - insetTop;
      place(panel, left, top, width, height);
    } else if (position) {
      width = Math.min(position.width, bounds.width - 2 * edge);
      height = Math.min(position.height, bounds.height - 2 * edge - insetTop);
      left = Math.max(edge, Math.min(position.x, bounds.width - width - edge));
      top = Math.max(edge + insetTop, Math.min(position.y, bounds.height - height - edge));
      place(panel, left, top, width, height);
    } else if (!native) {
      const initialTop = top - (win.offset || 0);
      win.offset = Math.max(0, edge + insetTop - initialTop);
      panel.style.setProperty('--ct-win-offset', `${win.offset}px`);
      top = initialTop + win.offset;
    }
    place(controls, left, top - insetTop, width);
    if (state === 'normal') placeGrips(win, left, top - insetTop, width, height + insetTop);
  }

  function setState(win, state) {
    win.state = state;
    win.panel.dataset.ctWinState = state;
    win.controls.dataset.ctWinState = state;
    win.overlay.classList.toggle('ct-win-overlay-minimized', state === 'minimized');
    raise(win);
    updateButton(win.size, state === 'normal' ? 'تكبير' : 'استعادة', state === 'normal' ? 'maximize' : 'restore');
    layout(win);
  }

  function addWindow(panel, overlay) {
    if ([...windows.keys()].some(other => other !== panel && other.contains(panel))) return;
    const native = panel instanceof HTMLDialogElement;
    const dismiss = () => {
      const custom = registered.get(overlay)?.dismiss;
      if (custom?.()) return;
      // Restore visibility before the app checks whether a dismiss button is usable.
      const existing = panel.querySelector('.ct-win-legacy-close:not([disabled])') || findClose(panel);
      if (existing) existing.click();
      else if (native) panel.close();
    };
    if (!native && !registered.has(overlay) && !findClose(panel)) return;

    const controls = document.createElement('aside');
    controls.className = 'ct-win-caption-controls no-print';
    controls.setAttribute('role', 'group');
    const minimize = captionButton('minimize', 'تصغير');
    const size = captionButton('maximize', 'تكبير');
    const close = captionButton('close', 'إغلاق');
    controls.append(minimize, size, close);
    if (native) panel.prepend(controls);
    else overlay.append(controls);
    panel.classList.add('ct-win-window');
    if (native) panel.classList.add('ct-win-native');
    const page = registered.get(overlay)?.page || overlay.closest('[data-ct-page]')?.dataset.ctPage ||
      document.querySelector('[data-ct-page][data-ct-active]')?.dataset.ctPage;
    overlay.classList.add('ct-win-modeless');
    if (overlay.getAttribute('aria-modal') === 'true') overlay.setAttribute('aria-modal', 'false');
    const grips = corners.map(corner => {
      const grip = document.createElement('span');
      grip.className = 'ct-win-resize-grip no-print';
      grip.dataset.corner = corner;
      grip.setAttribute('aria-hidden', 'true');
      overlay.append(grip);
      return grip;
    });
    const focusWindow = () => raise(win);
    const win = {panel, overlay, controls, size, grips, page, focusWindow, state:'normal', position:null, previous:'normal'};
    win.legacyCloseButtons = [];
    syncHeading(win);
    syncCloseButtons(win);
    windows.set(panel, win);
    publishOpenPages();
    resizeObserver.observe(panel);
    panel.addEventListener('pointerdown', focusWindow, true);
    controls.addEventListener('pointerdown', focusWindow, true);
    for (const grip of grips) enableResize(win, grip);
    minimize.addEventListener('click', () => {
      if (win.state === 'minimized') setState(win, win.previous);
      else {
        win.previous = win.state;
        setState(win, 'minimized');
      }
    });
    const toggleSize = () => setState(win, win.state === 'minimized' ? win.previous :
      win.state === 'normal' ? 'maximized' : 'normal');
    size.addEventListener('click', toggleSize);
    close.addEventListener('click', () => {
      if (win.state === 'minimized') setState(win, win.previous);
      dismiss();
    });
    win.removeDragHandlers = enableDrag(win, toggleSize);
    setState(win, 'normal');
  }

  function enableDrag(win, toggleSize) {
    const {panel, controls} = win;
    let drag = null;
    const blocked = 'button,input,select,textarea,a,[contenteditable="true"],.ct-win-resize-grip';
    const down = event => {
      if (event.button !== 0 || win.state !== 'normal' || event.target.closest(blocked)) return;
      const rect = panel.getBoundingClientRect();
      const fromCaption = controls.contains(event.target);
      const head = win.heading?.closest('header,.modal-head,.ct-nonstock-titlebar,.ct-br-modal-head,.voucher-editor-panel > div:first-child,.ct-win-modal-head');
      const onHeader = !!head?.contains(event.target);
      const nearTop = event.clientY >= rect.top && event.clientY <= rect.top + 48;
      // Drag from every empty part of the white Windows caption strip or the panel heading.
      if (!fromCaption && !onHeader && !nearTop && !win.heading?.contains(event.target)) return;
      event.preventDefault();
      const capture=event.currentTarget;
      drag = {id:event.pointerId, originX:event.clientX, originY:event.clientY,
        x:rect.left, y:rect.top, width:rect.width, height:rect.height};
      capture.setPointerCapture?.(event.pointerId);
    };
    const move = event => {
      if (!drag || drag.id !== event.pointerId) return;
      const dx = event.clientX - drag.originX,dy = event.clientY - drag.originY;
      if (Math.hypot(dx,dy)<3 && !panel.classList.contains('ct-win-positioned')) return;
      panel.classList.add('ct-win-positioned');
      win.position = {x:drag.x+dx,y:drag.y+dy,width:drag.width,height:drag.height};
      scheduleLayout();
    };
    const stop = () => {drag=null};
    const doubleClick = event => {
      if (controls.contains(event.target) && !event.target.closest('button') || win.heading?.contains(event.target)) toggleSize();
    };
    const handlers={pointerdown:down,pointermove:move,lostpointercapture:stop,dblclick:doubleClick};
    for (const element of [panel,controls]) for (const [name,handler] of Object.entries(handlers))element.addEventListener(name,handler);
    return () => {for (const element of [panel,controls])for(const [name,handler]of Object.entries(handlers))element.removeEventListener(name,handler)};
  }

  function enableResize(win, grip) {
    let start = null;
    grip.addEventListener('pointerdown', event => {
      if (event.button !== 0 || win.state !== 'normal') return;
      event.preventDefault();
      raise(win);
      const rect = win.panel.getBoundingClientRect();
      start = {id:event.pointerId, x:event.clientX, y:event.clientY, rect};
      grip.setPointerCapture(event.pointerId);
    });
    grip.addEventListener('pointermove', event => {
      if (!start || start.id !== event.pointerId) return;
      const bounds = viewportBounds();
      const {left, top, width, height} = start.rect;
      const right = left + width, bottom = top + height;
      const minWidth = Math.min(220, width);
      const minHeight = Math.min(125, height);
      const dx = event.clientX - start.x;
      const dy = event.clientY - start.y;
      const corner = grip.dataset.corner;
      const clamp = (value, min, max) => Math.max(min, Math.min(value, max));
      const x = corner.endsWith('w') ? clamp(left + dx, 6, right - minWidth) : left;
      const y = corner.startsWith('n') ? clamp(top + dy, 6, bottom - minHeight) : top;
      const endX = corner.endsWith('e') ? clamp(right + dx, x + minWidth, bounds.width - 6) : right;
      const endY = corner.startsWith('s') ? clamp(bottom + dy, y + minHeight, bounds.height - 6) : bottom;
      win.position = {x, y, width:endX - x, height:endY - y};
      win.panel.classList.add('ct-win-positioned');
      scheduleLayout();
    });
    grip.addEventListener('lostpointercapture', () => { start = null; });
  }

  function refresh() {
    for (const [panel, win] of windows) {
      const isOpen = panel instanceof HTMLDialogElement ? panel.open : !!panel.getClientRects().length;
      if (isDesktop() && panel.isConnected && isOpen) {
        syncHeading(win);
        syncCloseButtons(win);
        continue;
      }
      resizeObserver.unobserve(panel);
      panel.removeEventListener('pointerdown', win.focusWindow, true);
      win.overlay.classList.remove('ct-win-overlay-minimized', 'ct-win-modeless');
      win.removeDragHandlers();
      win.heading?.classList.remove('ct-win-drag-title');
      for (const button of win.legacyCloseButtons) button.classList.remove('ct-win-legacy-close');
      win.controls.remove();
      for (const grip of win.grips) grip.remove();
      panel.classList.remove('ct-win-window', 'ct-win-positioned', 'ct-win-native');
      delete panel.dataset.ctWinState;
      windows.delete(panel);
    }
    if (isDesktop()) document.querySelectorAll(panelSelectors).forEach(panel => {
      if (windows.has(panel) || !panel.getClientRects().length) return;
      const overlay = panel instanceof HTMLDialogElement ? panel : panel.closest('.ct-modal-layer') || panel.parentElement;
      if (!overlay || (registered.has(overlay) && panel !== overlay.firstElementChild)) return;
      if (getComputedStyle(panel).visibility === 'hidden') return;
      addWindow(panel, overlay);
    });
    publishOpenPages();
    scheduleLayout();
  }

  window.CashTopWin10 = {
    isDesktop,
    subscribeDesktop(listener) {
      desktopMedia.addEventListener('change', listener);
      return () => desktopMedia.removeEventListener('change', listener);
    },
    getOpenPages: () => openPages,
    subscribe(listener) {
      subscribers.add(listener);
      return () => subscribers.delete(listener);
    },
    registerDialog(overlay, dismiss, page) {
      if (!overlay) return;
      registered.set(overlay, {dismiss, page});
      const existing = [...windows.values()].find(win => win.overlay === overlay);
      if (existing && page) existing.page = page;
      refresh();
    }
  };
  function scheduleRefresh() {
    if (!refreshFrame) refreshFrame = requestAnimationFrame(() => {
      refreshFrame = 0;
      refresh();
    });
  }

  const windowContainerSelectors = '.ct-modal-layer,.modal-root,.modal-back,.fixed.inset-0,.oscar-bounded-modal,dialog';
  function changesWindows(record) {
    const target = record.target;
    if (record.type === 'attributes') {
      return record.attributeName === 'open' || target.matches(windowContainerSelectors) ||
        (record.attributeName === 'hidden' && target.matches(panelSelectors));
    }
    if(target.closest?.('.ct-win-caption-controls'))return false;
    if(target.closest?.('.ct-win-window')&&target.closest('header,.modal-head,.ct-win-drag-title'))return true;
    return [...record.addedNodes, ...record.removedNodes].some(node =>
      node.nodeType === Node.ELEMENT_NODE && (node.matches(panelSelectors) ||
        node.matches(windowContainerSelectors) || !!node.querySelector(panelSelectors) ||
        !!target.closest?.('.ct-win-window') && (node.matches('header,.modal-head,[data-close],button[aria-label*="إغلاق"]') ||
          !!node.querySelector('header,.modal-head,[data-close],button[aria-label*="إغلاق"]'))));;
  }

  new MutationObserver(records => {
    if (isDesktop() && records.some(changesWindows)) scheduleRefresh();
  }).observe(document.body, {
    subtree:true, childList:true, attributes:true, attributeFilter:['open', 'hidden', 'class']
  });
  function applyWindowMode() {
    document.documentElement.classList.toggle('ct-win-desktop', isDesktop());
    refresh();
  }
  desktopMedia.addEventListener('change', applyWindowMode);
  window.addEventListener('resize', scheduleRefresh);
  window.visualViewport?.addEventListener('resize', scheduleLayout);
  applyWindowMode();
})();
