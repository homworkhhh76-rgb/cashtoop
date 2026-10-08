import {t} from './services__i18n.js?v=7.9.4.139-ledger-print';
import { ModalLayer } from './components__common__ModalLayer.js?v=7.9.4.139-ledger-print';
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import React, { useState } from 'react';
import { useApp } from './context__AppContext.js?v=7.9.4.139-ledger-print';
import { Pagination, usePagination } from './components__common__Pagination.js?v=7.9.4.139-ledger-print';
import { Plus, Trash2, Edit } from 'lucide-react';
export const CategoriesView = () => {
    const { categories, products, saveCategory, deleteCategory, showToast } = useApp();
    const [editingCategory, setEditingCategory] = useState(null);
    const [name, setName] = useState('');
    const [color, setColor] = useState('#10b981');
    const presetColors = [
        '#10b981', '#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b',
        '#ef4444', '#06b6d4', '#14b8a6', '#64748b', '#6366f1'
    ];
    const handleOpenAdd = () => {
        setEditingCategory({
            id: 'cat-' + Date.now(),
            name: '',
            color: presetColors[Math.floor(Math.random() * presetColors.length)],
            sortOrder: categories.length + 1,
        });
        setName('');
        setColor('#10b981');
    };
    const handleOpenEdit = (cat) => {
        setEditingCategory(cat);
        setName(cat.name);
        setColor(cat.color || '#10b981');
    };
    const handleSave = async (e) => {
        e.preventDefault();
        if (!name.trim() || !editingCategory)
            return;
        await saveCategory({
            ...editingCategory,
            name: name.trim(),
            color,
        });
        setEditingCategory(null);
    };
    const categoriesPager = usePagination(categories || [], 50, 'categories');
    return (_jsxs("div", { id: "categories-screen", className: "p-4 sm:p-6 space-y-4 max-w-5xl mx-auto text-right select-none", children: [_jsxs("div", { className: "flex flex-col sm:flex-row sm:items-center justify-between gap-4", children: [_jsxs("div", { children: [_jsx("h2", { className: "text-xl font-black text-slate-900 dark:text-white", children: "\u062a\u0635\u0646\u064a\u0641\u0627\u062a \u0627\u0644\u0623\u0635\u0646\u0627\u0641" }), _jsx("p", { className: "text-xs text-slate-500 mt-0.5", children: "\u062a\u0635\u0646\u064a\u0641 \u0627\u0644\u0645\u0646\u062a\u062c\u0627\u062a \u0648\u062a\u0631\u062a\u064a\u0628\u0647\u0627 \u0645\u0639 \u062a\u062e\u0635\u064a\u0635 \u0627\u0644\u0623\u0644\u0648\u0627\u0646 \u0644\u0633\u0631\u0639\u0629 \u0627\u0644\u0648\u0635\u0648\u0644 \u0641\u064a \u0627\u0644\u0643\u0627\u0634\u064a\u0631" })] }), _jsxs("button", { onClick: handleOpenAdd, className: "flex items-center gap-1.5 px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-xs font-bold transition shadow-xs self-start sm:self-auto", children: [_jsx(Plus, { className: "w-4 h-4" }), _jsx("span", { children: "\u0625\u0636\u0627\u0641\u0629 \u062a\u0635\u0646\u064a\u0641 \u062c\u062f\u064a\u062f" })] })] }), _jsx("div", { className: "grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3", children: categoriesPager.pageItems.map((cat) => {
                    const count = products.filter((p) => p.categoryId === cat.id && !p.deletedAt).length;
                    return (_jsxs("div", { className: "p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs flex items-center justify-between", children: [_jsxs("div", { className: "flex items-center gap-3", children: [_jsx("span", { className: "w-4 h-4 rounded-full shadow-xs", style: { backgroundColor: cat.color || '#10b981' } }), _jsxs("div", { children: [_jsx("h4", { className: "text-sm font-bold text-slate-900 dark:text-white", children: cat.name }), _jsxs("span", { className: "text-xs text-slate-400", children: [count, " \u0635\u0646\u0641 \u0645\u0633\u062c\u0644"] })] })] }), _jsxs("div", { className: "flex items-center gap-1", children: [_jsx("button", { onClick: () => handleOpenEdit(cat), className: "p-1.5 rounded-lg text-slate-400 hover:text-violet-600 hover:bg-slate-100 dark:hover:bg-slate-800", children: _jsx(Edit, { className: "w-4 h-4" }) }), _jsx("button", { onClick: () => deleteCategory(cat.id), className: "p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-slate-100 dark:hover:bg-slate-800", children: _jsx(Trash2, { className: "w-4 h-4" }) })] })] }, cat.id));
                }) }), _jsx(Pagination, { pager: categoriesPager }), editingCategory && (_jsx(ModalLayer, { className: "fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4", children: _jsxs("form", { onSubmit: handleSave, className: "w-full max-w-sm bg-white dark:bg-slate-900 rounded-2xl shadow-xl p-5 space-y-4 border", children: [_jsx("h3", { className: "text-sm font-bold", children: "\u0628\u064a\u0627\u0646\u0627\u062a \u0627\u0644\u062a\u0635\u0646\u064a\u0641" }), _jsxs("div", { children: [_jsx("label", { className: "text-xs font-semibold block mb-1", children: "\u0627\u0633\u0645 \u0627\u0644\u062a\u0635\u0646\u064a\u0641:" }), _jsx("input", { type: "text", required: true, value: name, onChange: (e) => setName(e.target.value), placeholder: "\u0645\u062b\u0627\u0644: \u0645\u0634\u0631\u0648\u0628\u0627\u062a \u0648\u0639\u0635\u0627\u0626\u0631", className: "w-full px-3 py-2 text-xs border rounded-lg bg-slate-50 dark:bg-slate-800" })] }), _jsxs("div", { children: [_jsx("label", { className: "text-xs font-semibold block mb-2", children: "\u0644\u0648\u0646 \u0627\u0644\u062a\u0635\u0646\u064a\u0641:" }), _jsx("div", { className: "flex flex-wrap gap-2", children: presetColors.map((c) => (_jsx("button", { type: "button", onClick: () => setColor(c), className: `w-7 h-7 rounded-full transition-transform ${color === c ? 'scale-125 ring-2 ring-violet-500' : ''}`, style: { backgroundColor: c } }, c))) })] }), _jsxs("div", { className: "flex justify-end gap-2 pt-2 border-t", children: [_jsx("button", { type: "button", onClick: () => setEditingCategory(null), className: "px-3 py-1.5 text-xs text-slate-500", children: t("إلغاء") }), _jsx("button", { type: "submit", className: "px-4 py-1.5 bg-violet-600 text-white text-xs font-bold rounded-lg", children: "\u062d\u0641\u0638 \u0627\u0644\u062a\u0635\u0646\u064a\u0641" })] })] }) }))] }));
};
