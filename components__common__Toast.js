import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import React from 'react';
import { useApp } from './context__AppContext.js?v=7.9.4.90-cashtop3-search-logo';
import { CheckCircle2, AlertCircle, AlertTriangle, Info, X } from 'lucide-react';
export const ToastContainer = () => {
    const { toasts, removeToast } = useApp();
    if (toasts.length === 0) return null;
    return (_jsx("div", { id: "toast-container", className: "oscar-toast-stack", children: toasts.map((toast) => {
        let icon = _jsx(Info, { className: "w-4 h-4 text-blue-500 shrink-0" });
        let tone = 'info';
        if (toast.type === 'success') { icon = _jsx(CheckCircle2, { className: "w-4 h-4 text-emerald-600 shrink-0" }); tone = 'success'; }
        else if (toast.type === 'error') { icon = _jsx(AlertCircle, { className: "w-4 h-4 text-rose-600 shrink-0" }); tone = 'error'; }
        else if (toast.type === 'warning') { icon = _jsx(AlertTriangle, { className: "w-4 h-4 text-amber-600 shrink-0" }); tone = 'warning'; }
        return (_jsxs("div", { className: `oscar-toast oscar-toast-${tone}`, children: [_jsxs("div", { className: "oscar-toast-message", children: [icon, _jsx("span", { children: toast.message })] }), _jsx("button", { type: "button", onClick: () => removeToast(toast.id), className: "oscar-toast-close", "aria-label": "إغلاق", children: _jsx(X, { className: "w-3.5 h-3.5" }) })] }, toast.id));
    }) }));
};
export const Toast = ToastContainer;
