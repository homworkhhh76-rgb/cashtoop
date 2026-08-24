










        function showToast(msg, type = 'success') {
            const container = document.getElementById('toast-container');
            const toast = document.createElement('div');
            toast.className = `toast ${type}`;
            toast.innerText = msg;
            container.appendChild(toast);
            setTimeout(() => toast.classList.add('show'), 10);
            setTimeout(() => { toast.classList.remove('show'); setTimeout(() => toast.remove(), 300); }, 3000);
        }

        function openModal(id) { document.getElementById(id).classList.add('active'); }
        function closeModal(id) { document.getElementById(id).classList.remove('active'); }

        let agentsData = [];
        let productsData = [];
        let agentMovementsData = []; 
        let transferCart = [];
        let fundsData = { accounts: [] };
        const AGENT_MULTI_PAYMENT_VALUE = '__MULTI_PAYMENT__';
        let agentMultiPayments = { pay: [], payRep: [] }; 

        function currentAgentBranchInfo() {
            const session = window.Cashtop?.getSession?.() || {};
            const branchId = session.dataBranchId || session.branchId || 'MAIN';
            const branches = JSON.parse(localStorage.getItem('cashtop_branches') || '[]');
            const branch = branches.find(b => String(b.id) === String(branchId)) || branches.find(b => b.isMain === true) || null;
            return { id: String(branchId || 'MAIN'), name: branch?.name || session.branchName || (String(branchId).toUpperCase() === 'MAIN' ? 'الفرع الرئيسي' : String(branchId)) };
        }

        function populateAgentBranchSelect(preferred = '') {
            const select = document.getElementById('aBranchSelect');
            if (!select) return;
            const current = currentAgentBranchInfo();
            const value = preferred || current.id;
            select.innerHTML = `<option value="${current.id}">${current.name}</option>`;
            select.value = current.id;
            select.disabled = true;
            select.title = 'يتم ربط المندوب تلقائياً بالفرع الذي تمت إضافته منه';
            if (value && String(value) !== String(current.id)) {
                select.innerHTML += `<option value="${value}">${value}</option>`;
                select.value = value;
            }
        }

        function agentCashierPermissions(existing = {}) {
            return {
                'pos.access': true, 'sales.create': true, 'sales.print': true, 'sales.image': true,
                'sales.discount': true, 'sales.credit': true, 'sales.hold': true, 'sales.clearCart': true,
                ...(existing || {})
            };
        }

        function initSystem() {
            agentsData = JSON.parse(localStorage.getItem('cashtop_sales_agents')) || [];
            agentsData.forEach(a => {
                if(!a.carStock) a.carStock = [];
                if(a.totalSales === undefined) a.totalSales = 0; 
                if(a.totalCollected === undefined) a.totalCollected = 0; 
                if(a.totalCommission === undefined) a.totalCommission = 0;
                if(a.allowAllInventory === undefined) a.allowAllInventory = false;
                if(a.cashierAccess === undefined) a.cashierAccess = true;
                if(a.active === undefined) a.active = true;
                if(!a.status) a.status = 'active';
                a.permissions = agentCashierPermissions(a.permissions);
            });

            productsData = JSON.parse(localStorage.getItem('cashtop_products')) || [];
            productsData.forEach(p => { if (!p.storeStocks) p.storeStocks = {}; });

            agentMovementsData = JSON.parse(localStorage.getItem('cashtop_agent_movements')) || [];
            
            const localFunds = localStorage.getItem('cashtop_funds_db') || localStorage.getItem('cashtop_funds_db_v4');
            fundsData = localFunds ? (JSON.parse(localFunds) || { accounts: [], accountLogs: [] }) : { accounts: [], accountLogs: [] };

            normalizeAgentAccountCurrencies();
            populateAgentCurrencySelects();
            populateVaultSelects();
            renderAgentsTable(); 
        }

        function agentCurrencyConfig() {
            return window.CashtopMulti?.getCurrencyConfig?.() || {
                enabled: false,
                baseCurrencyId: 'base',
                currencies: [{ id: 'base', name: 'العملة الأساسية', code: '', symbol: '₪', ratePer100Base: 100 }]
            };
        }

        function normalizeAgentAccountCurrencies() {
            const cfg = agentCurrencyConfig();
            if (!Array.isArray(fundsData.accounts)) fundsData.accounts = [];
            fundsData.accounts.forEach(account => {
                if (!account.currencyId) account.currencyId = cfg.baseCurrencyId;
            });
        }

        function populateAgentCurrencySelects() {
            const cfg = agentCurrencyConfig();
            ['pay', 'payRep'].forEach(prefix => {
                const select = document.getElementById(`${prefix}CurrencySelect`);
                const group = document.getElementById(`${prefix}CurrencyGroup`);
                if (!select || !group) return;
                group.style.display = cfg.enabled ? '' : 'none';
                select.innerHTML = cfg.currencies.map(currency =>
                    `<option value="${currency.id}">${currency.name}${currency.code ? ` (${currency.code})` : ''}</option>`
                ).join('');
                select.value = cfg.baseCurrencyId;
            });
        }

        function getAgentFlowCurrencyId(prefix) {
            const cfg = agentCurrencyConfig();
            if (!cfg.enabled) return cfg.baseCurrencyId;
            return document.getElementById(`${prefix}CurrencySelect`)?.value || cfg.baseCurrencyId;
        }

        function populateVaultSelects() {
            const cfg = agentCurrencyConfig();
            [['pay', 'payVaultSelect'], ['payRep', 'payRepVaultSelect']].forEach(([prefix, selectId]) => {
                const select = document.getElementById(selectId);
                if (!select) return;
                const previous = select.value || '';
                const rawAccounts = window.Cashtop?.activeFundAccounts
                    ? window.Cashtop.activeFundAccounts(fundsData)
                    : (fundsData.accounts || []).filter(account => account?.disabled !== true && account?.active !== false && String(account?.status || '').toLowerCase() !== 'inactive');
                const accounts = window.Cashtop?.sortFundAccountsForDropdown?.(rawAccounts) || rawAccounts;
                select.innerHTML = (accounts.length > 1 ? `<option value="${AGENT_MULTI_PAYMENT_VALUE}">دفع متعدد</option>` : '') + (accounts.length
                    ? accounts.map(account => {
                        const currency = window.CashtopMulti?.getCurrency?.(account.currencyId || cfg.baseCurrencyId, cfg);
                        const suffix = cfg.enabled ? ` - ${currency?.symbol || currency?.code || ''}` : '';
                        return `<option value="${account.id}">${account.name} [${account.type}]${suffix}</option>`;
                    }).join('')
                    : '<option value="">لا توجد طريقة دفع</option>');
                if (previous === AGENT_MULTI_PAYMENT_VALUE && agentMultiPayments[prefix]?.length) select.value = AGENT_MULTI_PAYMENT_VALUE;
                else if (accounts.some(a => String(a.id) === String(previous))) select.value = previous;
                else if (accounts[0]) select.value = String(accounts[0].id);
                window.CashtopMulti?.enhanceSiteSelect?.(select);
            });
        }

        function openAgentMultiPayment(prefix) {
            const amountInput = document.getElementById(prefix === 'payRep' ? 'payRepAmountInput' : 'payAmountInput');
            const amountNative = Math.max(0, Number(amountInput?.value || 0));
            if (!(amountNative > 0)) { showToast('أدخل مبلغ العملية أولاً ثم اختر دفع متعدد.', 'warning'); return false; }
            const currencyId = getAgentFlowCurrencyId(prefix);
            const accounts = (fundsData.accounts || []).filter(a => window.Cashtop?.isFundActive ? window.Cashtop.isFundActive(a) : (a?.disabled !== true && a?.active !== false && String(a?.status || '').toLowerCase() !== 'inactive'));
            return window.CashtopMulti?.openMultiPayment?.({
                title: prefix === 'payRep' ? 'دفع متعدد لعمولة المندوب' : 'تحصيل متعدد من المندوب',
                accounts, transactionCurrencyId: currencyId, direction: prefix === 'payRep' ? 'out' : 'in',
                requireExact: true, exactTransactionAmount: amountNative,
                initialSplits: agentMultiPayments[prefix] || [], defaultTransactionAmount: (agentMultiPayments[prefix] || []).length ? 0 : amountNative,
                onSave: splits => {
                    agentMultiPayments[prefix] = splits.map(item => ({ ...item }));
                    const select = document.getElementById(prefix === 'payRep' ? 'payRepVaultSelect' : 'payVaultSelect');
                    if (select) { select.value = AGENT_MULTI_PAYMENT_VALUE; window.CashtopMulti?.refreshEnhancedSelect?.(select); }
                }
            });
        }

        function handleAgentVaultChange(prefix) {
            const select = document.getElementById(prefix === 'payRep' ? 'payRepVaultSelect' : 'payVaultSelect');
            if (!select) return;
            if (select.value === AGENT_MULTI_PAYMENT_VALUE) {
                if (!openAgentMultiPayment(prefix)) { select.value = ''; agentMultiPayments[prefix] = []; window.CashtopMulti?.refreshEnhancedSelect?.(select); }
            } else agentMultiPayments[prefix] = [];
        }

        function refreshAgentFunds() {
            try {
                const raw = localStorage.getItem('cashtop_funds_db') || localStorage.getItem('cashtop_funds_db_v4') || '{}';
                const fresh = JSON.parse(raw);
                fundsData = fresh && typeof fresh === 'object' ? fresh : { accounts: [], accountLogs: [] };
                if (!Array.isArray(fundsData.accounts)) fundsData.accounts = [];
            } catch (_) { fundsData = { accounts: [], accountLogs: [] }; }
            normalizeAgentAccountCurrencies();
            populateVaultSelects();
        }
        window.addEventListener('cashtop:funds-changed', refreshAgentFunds);
        window.addEventListener('cashtop:remote-applied', event => { if (event.detail?.key === 'cashtop_funds_db') refreshAgentFunds(); });
        window.addEventListener('storage', event => { if (!event.key || String(event.key).includes('cashtop_funds_db')) refreshAgentFunds(); });

        function handleAgentCurrencyChange(prefix) {
            populateVaultSelects();
            if (prefix === 'payRep') {
                const id = document.getElementById('payRepAgentId')?.value;
                const agent = agentsData.find(x => String(x.id) === String(id));
                const currencyId = getAgentFlowCurrencyId('payRep');
                if (agent) {
                    const native = window.CashtopMulti?.fromBase?.(Number(agent.totalCommission || 0), currencyId) ?? Number(agent.totalCommission || 0);
                    document.getElementById('payRepAmountInput').value = native.toFixed(2);
                }
            }
        }

        // ==========================================
        // إدارة جدول المناديب والإحصائيات
        // ==========================================
        async function renderAgentsTable() {
            const tbody = document.getElementById('agentsTableBody');
            agentsData = JSON.parse(localStorage.getItem('cashtop_sales_agents')) || [];
            const searchVal = String(document.getElementById('searchAgentInput').value || '').trim();
            const sequence = renderAgentsTable._sequence = (renderAgentsTable._sequence || 0) + 1;
            const fallback = () => !searchVal ? agentsData : agentsData.filter(a =>
                String(a?.name || '').toLowerCase().includes(searchVal.toLowerCase()) || String(a?.address || '').toLowerCase().includes(searchVal.toLowerCase())
            );
            const filtered = searchVal && agentsData.length >= 800 && window.Cashtop?.runWorkerTask
                ? await window.Cashtop.runWorkerTask('filter-records', { records: agentsData, query: searchVal, fields: ['name','address'] }, fallback)
                : fallback();
            if (sequence !== renderAgentsTable._sequence) return;

            const totals = filtered.reduce((acc, a) => {
                const carValue = (Array.isArray(a?.carStock) ? a.carStock : []).reduce((sum, item) => sum + ((Number(item?.qty)||0) * (Number(item?.price)||0)), 0);
                acc.custody += carValue;
                acc.sales += Number(a?.totalSales) || 0;
                acc.commissions += Number(a?.totalCommission) || 0;
                return acc;
            }, { sales: 0, commissions: 0, custody: 0 });

            const createRow = a => {
                const carValue = (Array.isArray(a?.carStock) ? a.carStock : []).reduce((sum, item) => sum + ((Number(item?.qty)||0) * (Number(item?.price)||0)), 0);
                const debt = (parseFloat(a.totalSales) || 0) - (parseFloat(a.totalCollected) || 0);
                const commStr = a.commType === 'percent' ? `نسبة (${a.commValue}%)` : `ثابت (${a.commValue} ₪)`;
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td><strong>${a.name}</strong></td>
                    <td dir="ltr" style="color:#555;font-weight:600;">${a.phone || ''}</td>
                    <td>${a.address || ''}</td>
                    <td><span class="badge-commission">${commStr}</span></td>
                    <td style="font-weight:bold;color:#f39c12;">${carValue.toFixed(2)} ₪</td>
                    <td style="font-weight:bold;color:#3b82f6;">${(parseFloat(a.totalSales)||0).toFixed(2)} ₪</td>
                    <td style="font-weight:bold;color:#00a65a;">${(parseFloat(a.totalCollected)||0).toFixed(2)} ₪</td>
                    <td style="font-weight:bold;color:#dd4b39;">${debt.toFixed(2)} ₪</td>
                    <td style="font-weight:bold;color:#605ca8;">${(parseFloat(a.totalCommission)||0).toFixed(2)} ₪</td>
                    <td><div class="actions-wrapper" style="flex-wrap:nowrap;">
                        <button class="action-btn btn-view" title="سجل الحركات" onclick="openAgentHistoryModal('${a.id}')"><i class="fa-solid fa-list-check"></i></button>
                        <button class="action-btn btn-load-action" title="تحميل بضاعة" onclick="openStockLoadModal('${a.id}')"><i class="fa-solid fa-truck-arrow-right"></i></button>
                        <button class="action-btn btn-settle-action" title="تسوية" onclick="openSettleModal('${a.id}')"><i class="fa-solid fa-scale-balanced"></i></button>
                        <button class="action-btn btn-pay-action" title="توريد نقدية" onclick="openPayModal('${a.id}')"><i class="fa-solid fa-cash-register"></i></button>
                        <button class="action-btn btn-pay-rep-action" title="صرف دفعة" onclick="openPayRepModal('${a.id}')"><i class="fa-solid fa-money-bill-transfer"></i></button>
                        <button class="action-btn btn-edit-act" title="تعديل" onclick="openAgentModal('${a.id}')"><i class="fa-solid fa-pen-to-square"></i></button>
                        <button class="action-btn btn-delete-act" title="حذف" onclick="openDeleteAgentModal('${a.id}')"><i class="fa-solid fa-trash-can"></i></button>
                    </div></td>`;
                return tr;
            };
            if (window.Cashtop?.renderVirtualRows) window.Cashtop.renderVirtualRows(tbody, filtered, createRow, { chunkSize: 80, eagerLimit: 160, colspan: 10, emptyHtml: `<tr><td colspan="10" style="color:#999;padding:20px;">لا يوجد مناديب مطابقين للبحث.</td></tr>` });
            else { tbody.innerHTML=''; if (!filtered.length) tbody.innerHTML=`<tr><td colspan="10" style="color:#999;padding:20px;">لا يوجد مناديب مطابقين للبحث.</td></tr>`; else filtered.forEach(a=>tbody.appendChild(createRow(a))); }
            document.getElementById('statAgents').innerText = agentsData.length + ' مندوب';
            document.getElementById('statSales').innerText = totals.sales.toFixed(2) + ' ₪';
            document.getElementById('statCommissions').innerText = totals.commissions.toFixed(2) + ' ₪';
            document.getElementById('statCustody').innerText = totals.custody.toFixed(2) + ' ₪';
        }

        // ==========================================
        // الإضافة والتعديل والحذف
        // ==========================================
        function openAgentModal(id = null) {
            document.getElementById('agentForm').reset();
            populateAgentBranchSelect();
            document.getElementById('aCashierAccess').checked = true;
            if(id) {
                let a = agentsData.find(x => x.id === id);
                if(a) {
                    document.getElementById('editAgentId').value = a.id;
                    document.getElementById('aNameInput').value = a.name || '';
                    document.getElementById('aPhoneInput').value = a.phone || '';
                    document.getElementById('aAddressInput').value = a.address || '';
                    document.getElementById('aUsernameInput').value = a.username || '';
                    document.getElementById('aPasswordInput').value = a.password || '';
                    document.getElementById('aCommTypeSelect').value = a.commType || 'percent';
                    document.getElementById('aCommValueInput').value = a.commValue || 0;
                    document.getElementById('aCashierAccess').checked = a.cashierAccess !== false;
                    populateAgentBranchSelect(a.branchId || '');
                }
            } else {
                document.getElementById('editAgentId').value = '';
            }
            openModal('agentModal');
        }

        function saveAgent(e) {
            e.preventDefault();
            const id = document.getElementById('editAgentId').value;
            const name = document.getElementById('aNameInput').value.trim();
            const phone = document.getElementById('aPhoneInput').value.trim();
            const address = document.getElementById('aAddressInput').value.trim();
            const username = document.getElementById('aUsernameInput').value.trim();
            const password = document.getElementById('aPasswordInput').value;
            const type = document.getElementById('aCommTypeSelect').value;
            const val = parseFloat(document.getElementById('aCommValueInput').value) || 0;
            const branch = currentAgentBranchInfo();
            const cashierAccess = document.getElementById('aCashierAccess').checked;
            if (!username || !password) { showToast('اسم المستخدم وكلمة المرور مطلوبان لدخول المندوب.', 'error'); return; }
            const uname = username.toLowerCase();
            const duplicateAgent = agentsData.some(a => a.id !== id && String(a.username || '').trim().toLowerCase() === uname);
            const employees = JSON.parse(localStorage.getItem('cashtop_employees') || '[]');
            const duplicateEmployee = employees.some(emp => String(emp.username || '').trim().toLowerCase() === uname);
            const branches = JSON.parse(localStorage.getItem('cashtop_branches') || '[]');
            const duplicateBranchManager = branches.some(b => String(b.managerUsername || '').trim().toLowerCase() === uname);
            const companyAccess = JSON.parse(localStorage.getItem('cashtop_company_access') || '{}');
            const duplicateManager = String(companyAccess?.manager?.username || '').trim().toLowerCase() === uname;
            if (duplicateAgent || duplicateEmployee || duplicateBranchManager || duplicateManager) { showToast('اسم المستخدم مستخدم لحساب آخر. اختر اسماً مختلفاً.', 'error'); return; }

            if (id) {
                const a = agentsData.find(x => x.id === id);
                if(a) {
                    a.name = name; a.phone = phone; a.address = address;
                    a.username = username; a.password = password;
                    a.branchId = a.branchId || branch.id; a.branchRecordId = a.branchRecordId || branch.id; a.branchName = a.branchName || branch.name;
                    a.commType = type; a.commValue = val; a.cashierAccess = cashierAccess;
                    a.permissions = agentCashierPermissions(a.permissions);
                    a.active = a.active !== false; a.status = a.status || 'active';
                    a.authVersion = Date.now(); a.updatedAt = new Date().toISOString();
                }
                showToast('تم تحديث بيانات المندوب وصلاحية الكاشير بنجاح', 'success');
            } else {
                agentsData.push({
                    id: `AG_${Date.now()}`, name, phone, address, username, password,
                    branchId: branch.id, branchRecordId: branch.id, branchName: branch.name,
                    cashierAccess, active: true, status: 'active', allowAllInventory: false,
                    permissions: agentCashierPermissions(), commType: type, commValue: val,
                    carStock: [], totalSales: 0, totalCollected: 0, totalCommission: 0,
                    authVersion: Date.now(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
                });
                showToast('تم إضافة المندوب ويمكنه الدخول بحسابه إلى كاشير الفرع', 'success');
            }

            localStorage.setItem('cashtop_sales_agents', JSON.stringify(agentsData));
            window.dispatchEvent(new CustomEvent('cashtop:sync-now', { detail: { reason: 'sales-agent-saved' } }));
            closeModal('agentModal');
            renderAgentsTable();
        }

        function openDeleteAgentModal(id) {
            document.getElementById('deleteTargetAgentId').value = id;
            openModal('deleteAgentModal');
        }

        function confirmDeleteAgent() {
            let id = document.getElementById('deleteTargetAgentId').value;
            let a = agentsData.find(x => x.id === id);
            
            if (a.carStock.length > 0) {
                showToast("لا يمكن حذف المندوب لوجود عهدة بضاعة معه. قم بعمل تسوية أولاً.", "error");
                closeModal('deleteAgentModal');
                return;
            }

            agentsData = agentsData.filter(x => x.id !== id);
            localStorage.setItem('cashtop_sales_agents', JSON.stringify(agentsData));
            showToast('تم حذف المندوب نهائياً', 'success');
            closeModal('deleteAgentModal');
            renderAgentsTable(); 
        }

        // ==========================================
        // تحميل البضاعة (سحب من المخزن للسيارة)
        // ==========================================
        function openStockLoadModal(id) {
            let a = agentsData.find(x => x.id === id);
            if(!a) return;

            document.getElementById('stockAgentId').value = a.id;
            document.getElementById('stockAllowAllInventory').checked = a.allowAllInventory === true;
            transferCart = [];
            renderTransferCart();
            document.getElementById('stockSearchInput').value = '';
            openModal('stockModal');
        }

        function searchStockProducts() {
            const val = document.getElementById('stockSearchInput').value.trim().toLowerCase();
            const box = document.getElementById('stockSuggestions');
            if (val === '') { box.style.display = 'none'; return; }
            
            box.innerHTML = '';
            let matched = [];

            productsData.forEach(p => {
                if (p.name.toLowerCase().includes(val) || (p.barcode && p.barcode.toLowerCase().includes(val))) {
                    if (p.hasVariants && p.variants) {
                        let hasStock = p.variants.some(v => (parseFloat(v.qty)||0) > 0);
                        if(hasStock) matched.push({prod: p, isZero: false});
                    } else {
                        let qty = parseFloat(p.stockPieces) || 0;
                        if(qty > 0) matched.push({prod: p, qty: qty, isZero: false});
                    }
                }
            });

            if (matched.length > 0) {
                matched.forEach(match => {
                    const div = document.createElement('div');
                    div.className = 'suggestion-item';
                    
                    let p = match.prod;
                    if (p.hasVariants) {
                        div.innerHTML = `<span style="font-weight:bold; color:#333;">${p.name} <span class="badge-variant">متعدد المقاسات</span></span><br><span style="font-size:11px; color:#00a65a; font-weight:bold;">اختر لعرض المقاسات</span>`;
                        div.onmousedown = (e) => { e.preventDefault(); openTransferVariantModal(p.id); box.style.display = 'none'; };
                    } else {
                        div.innerHTML = `<span style="font-weight:bold; color:#333;">${p.name}</span><br><span style="font-size:11px; color:#00a65a; font-weight:bold;">متوفر بالمخزن: ${match.qty} ${p.pieceName || 'قطعة'}</span>`;
                        div.onmousedown = (e) => { e.preventDefault(); addProdToCartLoad(p, match.qty); box.style.display = 'none'; };
                    }
                    box.appendChild(div);
                });
                box.style.display = 'block';
            } else { 
                box.innerHTML = `<div style="padding: 10px; color:#999; text-align:center;">لا توجد مطابقة في المخزن</div>`;
                box.style.display = 'block'; 
            }
        }

        function agentItemUnitChain(item) {
            if (item?.isVariant) {
                return [{ id: 'piece', name: item.pieceName || 'قطعة', factorToPrevious: 1, factorToBase: 1, salePrice: Number(item.price || 0) }];
            }
            const chain = window.CashtopMulti?.normalizeProductChain?.(item) || [];
            return chain.length ? chain : [{ id: 'piece', name: item?.pieceName || 'قطعة', factorToPrevious: 1, factorToBase: 1, salePrice: Number(item?.price || 0) }];
        }

        function agentItemUnit(item, unitId) {
            const chain = agentItemUnitChain(item);
            return chain.find(level => String(level.id) === String(unitId))
                || chain.find((_, index) => (unitId === 'piece' && index === 0) || (unitId === 'unit' && index === chain.length - 1))
                || chain[0];
        }

        function agentItemUnitFactor(item, unitId) {
            return Math.max(0.000001, Number(agentItemUnit(item, unitId)?.factorToBase || 1));
        }

        function agentItemUnitName(item, unitId) {
            return agentItemUnit(item, unitId)?.name || item?.pieceName || 'قطعة';
        }

        function agentItemUnitPrice(item, unitId) {
            const unit = agentItemUnit(item, unitId);
            const chain = agentItemUnitChain(item);
            if (item?.unitPrices && Number.isFinite(Number(item.unitPrices[unit.id]))) return Math.max(0, Number(item.unitPrices[unit.id]));
            if (Number.isFinite(Number(unit.salePrice))) return Math.max(0, Number(unit.salePrice));
            const basePrice = Number(item?.pricePiece ?? item?.price ?? 0);
            return Math.max(0, basePrice * Number(unit.factorToBase || 1));
        }

        function addProdToCartLoad(prod, availQty) {
            const existing = transferCart.find(item => item.id === prod.id && !item.isVariant);
            if(!existing) {
                const unitChain = agentItemUnitChain(prod);
                const defaultUnit = unitChain[unitChain.length - 1] || unitChain[0];
                transferCart.push({
                    id: prod.id, name: prod.name, barcode: prod.barcode || `BC_${Date.now()}`, stockLimit: availQty,
                    piecesPerUnit: Number(defaultUnit?.factorToBase || 1), unitName: defaultUnit?.name || prod.unitName || 'وحدة', pieceName: unitChain[0]?.name || prod.pieceName || 'قطعة',
                    addType: unitChain.length > 1 ? 'unit' : 'piece', transferUnit: defaultUnit?.id || 'piece', transferQty: 1,
                    unitChain: JSON.parse(JSON.stringify(unitChain)), unitPrices: { ...(prod.unitPrices || {}) },
                    pricePiece: Number(prod.pricePiece ?? prod.price ?? 0), priceUnit: Number(prod.priceUnit || 0),
                    price: agentItemUnitPrice(prod, defaultUnit?.id || 'piece'), isVariant: false
                });
                renderTransferCart();
            } else { showToast("المنتج موجود بالقائمة", "warning"); }
        }

        function openTransferVariantModal(productId) {
            const prod = productsData.find(p => p.id === productId);
            if (!prod || !prod.variants) return;
            const tbody = document.getElementById('variantBody');
            tbody.innerHTML = '';

            prod.variants.forEach((v, vIndex) => {
                let availQty = parseFloat(v.qty) || 0;
                if (availQty > 0) {
                    tbody.innerHTML += `
                        <tr style="cursor:pointer;" onmouseover="this.style.background='#f0f8ff'" onmouseout="this.style.background='transparent'" onclick="addVariantToCartLoad('${prod.id}', ${vIndex}, ${availQty}); closeModal('variantModal');">
                            <td><span style="background:#f1f5f9; padding:2px 8px; border-radius:4px; font-weight:bold;">${v.size || '---'}</span></td>
                            <td>${v.color || '---'}</td>
                            <td style="color:#00a65a; font-weight:bold;">${availQty}</td>
                        </tr>
                    `;
                }
            });
            openModal('variantModal');
        }

        function addVariantToCartLoad(prodId, vIndex, availQty) {
            const prod = productsData.find(p => p.id === prodId);
            const variant = prod.variants[vIndex];
            
            const existing = transferCart.find(item => item.id === prod.id && item.isVariant && item.vIndex === vIndex);
            if(!existing) {
                transferCart.push({
                    id: prod.id, name: `${prod.name} (مقاس: ${variant.size} - لون: ${variant.color})`, barcode: variant.barcode || prod.barcode, stockLimit: availQty,
                    piecesPerUnit: 1, unitName: 'وحدة', pieceName: 'قطعة', addType: 'piece', transferUnit: 'piece', transferQty: 1, 
                    price: parseFloat(prod.pricePiece || 0), isVariant: true, vIndex: vIndex, vSize: variant.size, vColor: variant.color
                });
                renderTransferCart();
            } else { showToast("المقاس موجود بالقائمة", "warning"); }
        }

        function renderTransferCart() {
            const tbody = document.getElementById('stockCartBody');
            tbody.innerHTML = '';

            if(transferCart.length === 0) {
                tbody.innerHTML = `<tr><td colspan="4" style="color:#999; padding:15px; font-weight:bold;">الجدول فارغ. ابحث لإضافة المنتجات...</td></tr>`;
                return;
            }

            transferCart.forEach((item, index) => {
                const chain = agentItemUnitChain(item);
                const selectedUnit = agentItemUnit(item, item.transferUnit);
                const factor = Number(selectedUnit?.factorToBase || 1);
                const maxAllowed = Number(item.stockLimit || 0) / factor;
                const unitOptions = chain.map((unit, unitIndex) => {
                    const detail = unitIndex === 0 ? '' : ` (${Number(unit.factorToBase || 1)} ${chain[0].name})`;
                    return `<option value="${unit.id}" ${String(item.transferUnit) === String(unit.id) ? 'selected' : ''}>${unit.name}${detail}</option>`;
                }).join('');
                const unitAndQtyHtml = `
                    <div style="display:flex; flex-direction:row; gap:8px; align-items:center;">
                        <input type="number" step="any" class="form-control" value="${item.transferQty}" min="0.000001" max="${maxAllowed}" onchange="updateTransferQty(${index}, this.value)" style="width:90px; padding:4px; text-align:center; height:32px; font-weight:bold; border-radius:4px;" placeholder="الكمية">
                        <select class="form-control" style="padding:4px 8px; font-size:11px; height:32px; min-width:125px; border-radius:4px; border-color:#3b82f6;" onchange="updateTransferUnit(${index}, this.value)">
                            ${unitOptions}
                        </select>
                    </div>`;

                tbody.innerHTML += `
                    <tr>
                        <td style="font-weight:bold; font-size:13px; color:#222; text-align:right;">${item.name}</td>
                        <td style="vertical-align: middle;">${unitAndQtyHtml}</td>
                        <td style="color:#00a65a; font-weight:bold; font-size:14px; vertical-align: middle;">${item.stockLimit} ${chain[0]?.name || 'قطعة'}</td>
                        <td style="vertical-align: middle;"><button type="button" class="action-btn btn-delete-act" onclick="removeTransferItem(${index})"><i class="fa-solid fa-trash-can"></i></button></td>
                    </tr>`;
            });
        }

        function updateTransferUnit(index, val) {
            const item = transferCart[index];
            if (!item) return;
            item.transferUnit = val;
            item.transferQty = 1;
            item.price = agentItemUnitPrice(item, val);
            renderTransferCart();
        }
        function updateTransferQty(index, val) { transferCart[index].transferQty = Math.max(0, parseFloat(val) || 0); }
        function removeTransferItem(index) { transferCart.splice(index, 1); renderTransferCart(); }

        function restoreAgentCustodyItemToStock(item, pieces) {
            const dbProd = productsData.find(p => String(p.id) === String(item.id));
            if (!dbProd || !(pieces > 0)) return;
            if (item.isVariant) {
                const variant = dbProd.variants?.[item.vIndex] || dbProd.variants?.find(v => String(v.size || '') === String(item.vSize || item.variantSize || '') && String(v.color || '') === String(item.vColor || item.variantColor || ''));
                if (variant) variant.qty = Math.max(0, Number(variant.qty || 0)) + pieces;
            } else {
                dbProd.stockPieces = Math.max(0, Number(dbProd.stockPieces || 0)) + pieces;
            }
        }

        function processLoadAction(e) {
            e.preventDefault();
            const aId = document.getElementById('stockAgentId').value;
            const a = agentsData.find(x => String(x.id) === String(aId));
            if(!a) return;
            const allowAll = document.getElementById('stockAllowAllInventory').checked === true;

            // عند الانتقال لوضع كامل المخزون نعيد أي عهدة محملة إلى مخزون الفرع
            // حتى لا تبقى الكمية محجوزة مرتين.
            if (allowAll) {
                if (Array.isArray(a.carStock) && a.carStock.length) {
                    a.carStock.forEach(item => restoreAgentCustodyItemToStock(item, Number(item.qty || 0) * agentItemUnitFactor(item, item.transferUnit)));
                    agentMovementsData.push({
                        id: `MOV_${Date.now()}`, agentId: aId, date: new Date().toLocaleString('ar-EG'),
                        type: 'إتاحة جميع المخزون', details: 'تمت إعادة العهدة المحملة إلى مخزون الفرع وتفعيل البيع من كامل المخزون.', amount: 0
                    });
                    a.carStock = [];
                }
                a.allowAllInventory = true;
                a.authVersion = Date.now(); a.updatedAt = new Date().toISOString();
                localStorage.setItem('cashtop_agent_movements', JSON.stringify(agentMovementsData));
                localStorage.setItem('cashtop_sales_agents', JSON.stringify(agentsData));
                localStorage.setItem('cashtop_products', JSON.stringify(productsData));
                window.dispatchEvent(new CustomEvent('cashtop:sync-now', { detail: { reason: 'agent-all-inventory-enabled', agentId: aId } }));
                showToast('تم تفعيل إتاحة جميع مخزون الفرع للمندوب.', 'success');
                closeModal('stockModal'); renderAgentsTable();
                return;
            }

            const wasAll = a.allowAllInventory === true;
            a.allowAllInventory = false;
            a.authVersion = Date.now(); a.updatedAt = new Date().toISOString();
            if (transferCart.length === 0) {
                localStorage.setItem('cashtop_sales_agents', JSON.stringify(agentsData));
                if (wasAll) showToast('تم إيقاف إتاحة جميع المخزون. سيظهر للمندوب فقط ما يتم تحميله له.', 'success');
                else showToast('لم تتم إضافة بضاعة جديدة للعهدة.', 'warning');
                closeModal('stockModal'); renderAgentsTable();
                return;
            }

            let hasError = false;
            transferCart.forEach(item => {
                const piecesToMove = Number(item.transferQty || 0) * agentItemUnitFactor(item, item.transferUnit);
                if (piecesToMove <= 0 || piecesToMove > Number(item.stockLimit || 0) + 0.000001) {
                    showToast(`الكمية المطلوبة للصنف [${item.name}] تتجاوز المتوفر بالمخزن أو غير صحيحة!`, 'error');
                    hasError = true;
                }
            });
            if(hasError) return;

            let totalVal = 0;
            const detailsArr = [];
            transferCart.forEach(item => {
                const factor = agentItemUnitFactor(item, item.transferUnit);
                const piecesToMove = Number(item.transferQty || 0) * factor;
                item.price = agentItemUnitPrice(item, item.transferUnit);
                totalVal += Number(item.transferQty || 0) * Number(item.price || 0);
                const unitStr = agentItemUnitName(item, item.transferUnit);
                detailsArr.push(`${item.name} (${item.transferQty} ${unitStr})`);

                const dbProd = productsData.find(p => String(p.id) === String(item.id));
                if (!dbProd) return;
                if (item.isVariant) {
                    const variant = dbProd.variants?.[item.vIndex];
                    if (variant) variant.qty = Math.max(0, Number(variant.qty || 0) - piecesToMove);
                } else dbProd.stockPieces = Math.max(0, Number(dbProd.stockPieces || 0) - piecesToMove);

                const carItemCode = item.isVariant ? `${item.id}_${item.vSize}_${item.vColor}` : item.id;
                const existingInCar = a.carStock.find(c => c.cartId === carItemCode && String(c.transferUnit) === String(item.transferUnit));
                if(existingInCar) {
                    existingInCar.qty = Number(existingInCar.qty || 0) + Number(item.transferQty || 0);
                    existingInCar.price = agentItemUnitPrice(existingInCar, existingInCar.transferUnit);
                } else {
                    const newItemForCar = JSON.parse(JSON.stringify(item));
                    newItemForCar.cartId = carItemCode; newItemForCar.qty = Number(item.transferQty || 0); newItemForCar.transferFactor = factor;
                    a.carStock.push(newItemForCar);
                }
            });

            agentMovementsData.push({ id: `MOV_${Date.now()}`, agentId: aId, date: new Date().toLocaleString('ar-EG'), type: 'تحميل بضاعة', details: detailsArr.join('، '), amount: totalVal });
            localStorage.setItem('cashtop_agent_movements', JSON.stringify(agentMovementsData));
            localStorage.setItem('cashtop_sales_agents', JSON.stringify(agentsData));
            localStorage.setItem('cashtop_products', JSON.stringify(productsData));
            window.dispatchEvent(new CustomEvent('cashtop:sync-now', { detail: { reason: 'agent-stock-loaded', agentId: aId } }));
            showToast('تم تحميل البضاعة للمندوب وخصمها من مخزون الفرع بنجاح!', 'success');
            closeModal('stockModal'); renderAgentsTable();
        }

        // ==========================================
        // تسوية المرتجع (نهاية اليوم)
        // ==========================================
        // تسوية المرتجع (نهاية اليوم)
        // ==========================================
        let settleDataTemp = [];
        let currentSettleAgentId = null;

        function openSettleModal(id) {
            const a = agentsData.find(x => x.id === id);
            if(!a) return;
            if (a.allowAllInventory === true) {
                showToast('هذا المندوب يعمل بوضع إتاحة جميع المخزون ولا توجد عهدة سيارة لتسويتها.', 'warning');
                return;
            }
            currentSettleAgentId = a.id;
            document.getElementById('settleAgentName').innerText = a.name;
            settleDataTemp = JSON.parse(JSON.stringify(a.carStock || []));
            settleDataTemp.forEach(item => {
                item.returnedQty = 0;
                item.returnedUnit = item.transferUnit || agentItemUnitChain(item)[0]?.id || 'piece';
            });
            renderSettleTable();
            openModal('settleModal');
        }

        function renderSettleTable() {
            const tbody = document.getElementById('settleTableBody');
            tbody.innerHTML = '';
            if (settleDataTemp.length === 0) {
                tbody.innerHTML = `<tr><td colspan="4" style="color:#999; padding:20px;">السيارة فارغة، لا يوجد مرتجع لتسويته.</td></tr>`;
                return;
            }
            settleDataTemp.forEach((item, index) => {
                const chain = agentItemUnitChain(item);
                if(!Number.isFinite(Number(item.returnedQty))) item.returnedQty = 0;
                if(!item.returnedUnit) item.returnedUnit = item.transferUnit || chain[0].id;
                const originalFactor = agentItemUnitFactor(item, item.transferUnit);
                const originalPieces = Number(item.qty || 0) * originalFactor;
                const returnedPieces = Number(item.returnedQty || 0) * agentItemUnitFactor(item, item.returnedUnit);
                const remainingPieces = originalPieces - returnedPieces;
                const remainingDisplay = (remainingPieces / originalFactor).toFixed(3).replace(/\.?0+$/, '');
                const unitStr = agentItemUnitName(item, item.transferUnit);
                const returnOptions = chain.map(unit => `<option value="${unit.id}" ${String(item.returnedUnit) === String(unit.id) ? 'selected' : ''}>${unit.name}</option>`).join('');
                tbody.innerHTML += `
                    <tr>
                        <td style="text-align:right; font-weight:bold;">${item.name}</td>
                        <td style="font-weight:bold; color:#333; font-size:14px;">${item.qty} <span style="font-size:10px;">${unitStr}</span></td>
                        <td><div style="display:flex; align-items:center; justify-content:center; gap:8px;">
                            <input type="number" step="any" min="0" class="settle-input" value="${item.returnedQty}" oninput="updateSettleMath(${index}, this.value)" style="border-radius:4px;">
                            <select class="settle-unit-select" onchange="updateSettleReturnUnit(${index}, this.value)" style="border-radius:4px;border-left:1px solid #ccc;">${returnOptions}</select>
                        </div></td>
                        <td style="font-weight:bold; color:${remainingPieces < 0 ? '#dd4b39' : '#00a65a'};" id="rem_${index}">${remainingDisplay} <span style="font-size:10px;">${unitStr}</span></td>
                    </tr>`;
            });
        }

        function updateSettleMath(index, val) {
            const item = settleDataTemp[index];
            if (!item) return;
            item.returnedQty = Math.max(0, parseFloat(val) || 0);
            updateSettleRemaining(index);
        }
        function updateSettleReturnUnit(index, val) {
            const item = settleDataTemp[index];
            if (!item) return;
            item.returnedUnit = val;
            updateSettleRemaining(index);
        }
        function updateSettleRemaining(index) {
            const item = settleDataTemp[index];
            const originalFactor = agentItemUnitFactor(item, item.transferUnit);
            const originalPieces = Number(item.qty || 0) * originalFactor;
            const returnedPieces = Number(item.returnedQty || 0) * agentItemUnitFactor(item, item.returnedUnit);
            const remainingPieces = originalPieces - returnedPieces;
            const remTd = document.getElementById(`rem_${index}`);
            if (remTd) {
                remTd.innerHTML = `${(remainingPieces / originalFactor).toFixed(3).replace(/\.?0+$/, '')} <span style="font-size:10px;">${agentItemUnitName(item, item.transferUnit)}</span>`;
                remTd.style.color = remainingPieces < -1e-9 ? '#dd4b39' : '#00a65a';
            }
        }

        function processSettlement(e) {
            e.preventDefault();
            const a = agentsData.find(x => x.id === currentSettleAgentId);
            if (!a) return;
            for (const item of settleDataTemp) {
                const originalPieces = Number(item.qty || 0) * agentItemUnitFactor(item, item.transferUnit);
                const returnedPieces = Number(item.returnedQty || 0) * agentItemUnitFactor(item, item.returnedUnit);
                if (returnedPieces > originalPieces + 0.000001) {
                    showToast(`المرتجع للصنف [${item.name}] أكبر من الموجود بعهدة المندوب!`, 'error');
                    return;
                }
            }
            let returnedKinds = 0;
            let returnedValue = 0;
            const details = [];
            for (let i = settleDataTemp.length - 1; i >= 0; i--) {
                const item = settleDataTemp[i];
                const originalItemInCar = a.carStock[i];
                if (!originalItemInCar) continue;
                const originalPieces = Number(item.qty || 0) * agentItemUnitFactor(item, item.transferUnit);
                const returnedPieces = Number(item.returnedQty || 0) * agentItemUnitFactor(item, item.returnedUnit);
                if (returnedPieces > 0) {
                    restoreAgentCustodyItemToStock(item, returnedPieces);
                    returnedKinds += 1;
                    returnedValue += Number(item.returnedQty || 0) * agentItemUnitPrice(item, item.returnedUnit);
                    details.push(`${item.name}: ${item.returnedQty} ${agentItemUnitName(item, item.returnedUnit)}`);
                }
                const remainingPieces = originalPieces - returnedPieces;
                if (remainingPieces <= 0.000001) a.carStock.splice(i, 1);
                else originalItemInCar.qty = remainingPieces / agentItemUnitFactor(item, item.transferUnit);
            }
            if (!returnedKinds) { showToast('أدخل كمية مرتجع واحدة على الأقل.', 'warning'); return; }
            agentMovementsData.push({
                id: `MOV_${Date.now()}`, agentId: currentSettleAgentId, date: new Date().toLocaleString('ar-EG'),
                type: 'تسوية مرتجع', details: `إرجاع للمخزون: ${details.join('، ')}`, amount: returnedValue
            });
            a.updatedAt = new Date().toISOString();
            localStorage.setItem('cashtop_agent_movements', JSON.stringify(agentMovementsData));
            localStorage.setItem('cashtop_sales_agents', JSON.stringify(agentsData));
            localStorage.setItem('cashtop_products', JSON.stringify(productsData));
            window.dispatchEvent(new CustomEvent('cashtop:sync-now', { detail: { reason: 'agent-return-settlement', agentId: a.id } }));
            showToast('تمت إعادة المرتجع إلى المخزون وتحديث عهدة المندوب بنجاح.', 'success');
            closeModal('settleModal'); renderAgentsTable();
        }

        // ==========================================
        // توريد نقدية لخزينة المنشأة
        // ==========================================
        function openPayModal(id) {
            let a = agentsData.find(x => String(x.id) === String(id));
            if(!a) return;
            document.getElementById('payForm').reset();
            agentMultiPayments.pay = [];
            document.getElementById('payAgentId').value = a.id;
            document.getElementById('payAgentNameTitle').innerText = a.name;
            const cfg = agentCurrencyConfig();
            const currencySelect = document.getElementById('payCurrencySelect');
            if (currencySelect) currencySelect.value = cfg.baseCurrencyId;
            populateVaultSelects();
            openModal('payModal');
        }

        function processPayment(e) {
            e.preventDefault();
            const id = document.getElementById('payAgentId').value;
            const amountNative = parseFloat(document.getElementById('payAmountInput').value) || 0;
            const currencyId = getAgentFlowCurrencyId('pay');
            const amount = window.CashtopMulti?.toBase?.(amountNative, currencyId) ?? amountNative;
            const vaultId = document.getElementById('payVaultSelect').value;
            const a = agentsData.find(x => String(x.id) === String(id));
            const cfg = agentCurrencyConfig();
            const isMulti = vaultId === AGENT_MULTI_PAYMENT_VALUE;
            if (!a || !(amountNative > 0)) return;
            let payments = [];
            if (isMulti) {
                payments = agentMultiPayments.pay.map(item => ({ ...item }));
                const totalBase = payments.reduce((sum, item) => sum + Number(item.baseAmount || 0), 0);
                if (!payments.length || Math.abs(totalBase - amount) > 0.01) { showToast('توزيع الدفع المتعدد لا يساوي مبلغ التحصيل.', 'error'); return; }
            } else {
                const vault = fundsData.accounts.find(v => String(v.id) === String(vaultId));
                if (!vault) { showToast('اختر طريقة دفع صحيحة.', 'error'); return; }
                const settlement = window.CashtopMulti?.settleToAccount?.(amountNative, currencyId, vault) || { accountAmount: amountNative, accountCurrencyId: vault.currencyId || currencyId, baseAmount: amount };
                payments = [{ accountId: vault.id, accountName: vault.name, accountAmount: Number(settlement.accountAmount || 0), accountCurrencyId: settlement.accountCurrencyId, transactionAmount: amountNative, transactionCurrencyId: currencyId, baseAmount: amount }];
            }
            if (!Array.isArray(fundsData.accountLogs)) fundsData.accountLogs = [];
            const now = new Date();
            payments.forEach((payment, index) => {
                const vault = fundsData.accounts.find(v => String(v.id) === String(payment.accountId));
                if (!vault) throw new Error('إحدى طرق الدفع غير موجودة.');
                vault.balance = Number(vault.balance || 0) + Number(payment.accountAmount || 0);
                fundsData.accountLogs.push({ id:`LOG_AGENT_IN_${Date.now()}_${index}`, accountId:vault.id, date:now.toISOString().split('T')[0], type:'إيداع', amount:Number(payment.accountAmount||0), baseAmount:Number(payment.baseAmount||0), currencyId:payment.accountCurrencyId||vault.currencyId, transactionAmount:Number(payment.transactionAmount||0), transactionCurrencyId:currencyId, notes:`استلام نقدية مبيعات من المندوب: ${a.name}` });
            });
            localStorage.setItem('cashtop_funds_db', JSON.stringify(fundsData));
            a.totalCollected = (parseFloat(a.totalCollected) || 0) + amount;
            const movementId = `MOV_${Date.now()}_${Math.random().toString(36).slice(2,7)}`;
            let expenses = JSON.parse(localStorage.getItem('cashtop_expenses')) || [];
            expenses.push({ id:`INC_${Date.now()}_${Math.random().toString(36).slice(2,7)}`, date:now.toISOString(), type:'توريد مناديب', amount, amountNative, currencyId, accountId:isMulti?AGENT_MULTI_PAYMENT_VALUE:payments[0]?.accountId, accountName:isMulti?'دفع متعدد':payments[0]?.accountName, paymentMethod:isMulti?'دفع متعدد':payments[0]?.accountName, payments, notes:`استلام نقدية من المندوب: ${a.name} ${isMulti?'بتوزيع متعدد':`إلى ${payments[0]?.accountName||''}`}`, agentMovementId: movementId });
            localStorage.setItem('cashtop_expenses', JSON.stringify(expenses));
            agentMovementsData.push({ id:movementId, agentId:id, isoDate:now.toISOString(), createdAt:now.toISOString(), date:now.toLocaleString('ar-EG'), type:'توريد نقدية', details:isMulti?'دفعة مبيعات محصلة تم توريدها بطرق دفع متعددة':`دفعة مبيعات محصلة تم توريدها لـ: ${payments[0]?.accountName||''}`, amount, amountNative, currencyId, payments });
            localStorage.setItem('cashtop_agent_movements', JSON.stringify(agentMovementsData));
            localStorage.setItem('cashtop_sales_agents', JSON.stringify(agentsData));
            let invoicesDB = JSON.parse(localStorage.getItem('cashtop_invoices')) || [];
            let remainingPayment = amount;
            for (let i=0;i<invoicesDB.length;i++){let inv=invoicesDB[i];if(inv.customer===`مبيعات المندوب: ${a.name}`&&inv.debt>0&&remainingPayment>0){if(remainingPayment>=inv.debt){remainingPayment-=inv.debt;inv.paid+=inv.debt;inv.debt=0}else{inv.paid+=remainingPayment;inv.debt-=remainingPayment;remainingPayment=0}}}
            localStorage.setItem('cashtop_invoices', JSON.stringify(invoicesDB));
            const currency = window.CashtopMulti?.getCurrency?.(currencyId, cfg);
            showToast(`تم استلام ${amountNative.toFixed(2)} ${currency?.symbol || currency?.code || ''} ${isMulti?'بطرق دفع متعددة':`وتوريدها لـ ${payments[0]?.accountName||''}`}.`, 'success');
            agentMultiPayments.pay=[]; closeModal('payModal'); renderAgentsTable();
        }

        // ==========================================
        // تسديد عمولة للمندوب (صرف)
        // ==========================================
        function openPayRepModal(id) {
            let a = agentsData.find(x => String(x.id) === String(id));
            if(!a) return;
            document.getElementById('payRepForm').reset();
            agentMultiPayments.payRep = [];
            document.getElementById('payRepAgentId').value = a.id;
            document.getElementById('payRepAgentNameTitle').innerText = a.name;
            const cfg = agentCurrencyConfig();
            const currencySelect = document.getElementById('payRepCurrencySelect');
            if (currencySelect) currencySelect.value = cfg.baseCurrencyId;
            const native = window.CashtopMulti?.fromBase?.(Number(a.totalCommission || 0), cfg.baseCurrencyId) ?? Number(a.totalCommission || 0);
            document.getElementById('payRepAmountInput').value = native.toFixed(2);
            populateVaultSelects();
            openModal('payRepModal');
        }

        function processPayRep(e) {
            e.preventDefault();
            const id = document.getElementById('payRepAgentId').value;
            const amountNative = parseFloat(document.getElementById('payRepAmountInput').value) || 0;
            const currencyId = getAgentFlowCurrencyId('payRep');
            const amount = window.CashtopMulti?.toBase?.(amountNative, currencyId) ?? amountNative;
            const vaultId = document.getElementById('payRepVaultSelect').value;
            const a = agentsData.find(x => String(x.id) === String(id));
            const cfg = agentCurrencyConfig();
            const isMulti = vaultId === AGENT_MULTI_PAYMENT_VALUE;
            if (!a || !(amountNative > 0)) return;
            if (amount > Number(a.totalCommission || 0) + 0.000001) { showToast('قيمة الدفعة بعد التحويل أكبر من العمولة المستحقة للمندوب.', 'error'); return; }
            let payments=[];
            if (isMulti) {
                payments=agentMultiPayments.payRep.map(item=>({...item}));
                const totalBase=payments.reduce((sum,item)=>sum+Number(item.baseAmount||0),0);
                if(!payments.length||Math.abs(totalBase-amount)>0.01){showToast('توزيع الدفع المتعدد لا يساوي مبلغ العمولة.','error');return;}
            } else {
                const vault=fundsData.accounts.find(v=>String(v.id)===String(vaultId));
                if(!vault){showToast('اختر طريقة دفع صحيحة.','error');return;}
                const settlement=window.CashtopMulti?.settleToAccount?.(amountNative,currencyId,vault)||{accountAmount:amountNative,accountCurrencyId:vault.currencyId||currencyId,baseAmount:amount};
                payments=[{accountId:vault.id,accountName:vault.name,accountAmount:Number(settlement.accountAmount||0),accountCurrencyId:settlement.accountCurrencyId,transactionAmount:amountNative,transactionCurrencyId:currencyId,baseAmount:amount}];
            }
            const insufficient=payments.find(payment=>{const vault=fundsData.accounts.find(v=>String(v.id)===String(payment.accountId));return !vault||Number(vault.balance||0)+1e-9<Number(payment.accountAmount||0)});
            if(insufficient){showToast(`رصيد طريقة الدفع [${insufficient.accountName||'المحددة'}] غير كافٍ.`,'error');return;}
            if(!Array.isArray(fundsData.accountLogs))fundsData.accountLogs=[];
            const now=new Date();
            payments.forEach((payment,index)=>{const vault=fundsData.accounts.find(v=>String(v.id)===String(payment.accountId));vault.balance=Number(vault.balance||0)-Number(payment.accountAmount||0);fundsData.accountLogs.push({id:`LOG_AGENT_OUT_${Date.now()}_${index}`,accountId:vault.id,date:now.toISOString().split('T')[0],type:'سحب',amount:Number(payment.accountAmount||0),baseAmount:Number(payment.baseAmount||0),currencyId:payment.accountCurrencyId||vault.currencyId,transactionAmount:Number(payment.transactionAmount||0),transactionCurrencyId:currencyId,notes:`تسديد عمولة للمندوب: ${a.name}`})});
            localStorage.setItem('cashtop_funds_db',JSON.stringify(fundsData));
            a.totalCommission=Math.max(0,Number(a.totalCommission||0)-amount);
            const movementId = `MOV_${Date.now()}_${Math.random().toString(36).slice(2,7)}`;
            let expenses=JSON.parse(localStorage.getItem('cashtop_expenses'))||[];
            expenses.push({id:`EXP_${Date.now()}_${Math.random().toString(36).slice(2,7)}`,date:now.toISOString(),type:'تسديد عمولة مندوب',amount,amountNative,currencyId,accountId:isMulti?AGENT_MULTI_PAYMENT_VALUE:payments[0]?.accountId,accountName:isMulti?'دفع متعدد':payments[0]?.accountName,paymentMethod:isMulti?'دفع متعدد':payments[0]?.accountName,payments,notes:`تسديد عمولة للمندوب: ${a.name} ${isMulti?'بطرق دفع متعددة':`من ${payments[0]?.accountName||''}`}`,agentMovementId: movementId});
            localStorage.setItem('cashtop_expenses',JSON.stringify(expenses));
            agentMovementsData.push({id:movementId,agentId:id,isoDate:now.toISOString(),createdAt:now.toISOString(),date:now.toLocaleString('ar-EG'),type:'صرف دفعة / عمولة',details:isMulti?'تم صرف دفعة للمندوب بطرق دفع متعددة':`تم صرف دفعة للمندوب من ${payments[0]?.accountName||''}`,amount,amountNative,currencyId,payments});
            localStorage.setItem('cashtop_agent_movements',JSON.stringify(agentMovementsData));localStorage.setItem('cashtop_sales_agents',JSON.stringify(agentsData));
            const currency=window.CashtopMulti?.getCurrency?.(currencyId,cfg);showToast(`تم صرف ${amountNative.toFixed(2)} ${currency?.symbol||currency?.code||''} للمندوب بنجاح.`,'success');agentMultiPayments.payRep=[];closeModal('payRepModal');renderAgentsTable();
        }

        // ==========================================
        // سجل الحركات للمندوب (History)
        // ==========================================
        function openAgentHistoryModal(id) {
            let a = agentsData.find(x => x.id === id);
            if(!a) return;

            document.getElementById('historyAgentId').value = a.id;
            document.getElementById('historyAgentName').innerText = a.name;
            const tbody = document.getElementById('agentHistoryBody');
            tbody.innerHTML = '';

            let agentHistory = agentMovementsData.filter(m => m.agentId === id);

            agentHistory = agentHistory.slice().reverse();
            const makeAgentHistoryRow = mov => {
                let colorCode = '#333';
                if(mov.type.includes('تحميل')) colorCode = '#f39c12';
                if(mov.type.includes('إرجاع')) colorCode = '#d35400';
                if(mov.type.includes('تسوية')) colorCode = '#3b82f6';
                if(mov.type.includes('توريد')) colorCode = '#00a65a';
                if(mov.type.includes('صرف')) colorCode = '#8e44ad';
                const tr = document.createElement('tr');
                const deletable = !mov.deleted && (mov.type === 'توريد نقدية' || mov.type === 'صرف دفعة / عمولة');
                const actionHtml = deletable
                    ? `<button type="button" class="action-btn btn-delete-act" title="حذف الحركة وعكسها مالياً" onclick="deleteAgentMoneyMovement('${String(mov.id).replace(/'/g,"\\'")}')"><i class="fa-solid fa-trash-can"></i></button>`
                    : (mov.deleted ? '<span style="color:#94a3b8;font-size:11px;font-weight:800;">ملغاة</span>' : '<span style="color:#94a3b8;">—</span>');
                tr.innerHTML = `<td style="direction:ltr;">${mov.date}</td><td style="color:${colorCode}; font-weight:bold;">${mov.type}</td><td style="font-size:12px; line-height:1.6; text-align:right;">${mov.details}</td><td style="font-weight:bold;">${Number(mov.amount||0).toFixed(2)}</td><td>${actionHtml}</td>`;
                return tr;
            };
            if (window.Cashtop?.renderVirtualRows) {
                window.Cashtop.renderVirtualRows(tbody, agentHistory, makeAgentHistoryRow, {chunkSize:70,eagerLimit:140,windowThreshold:260,windowSize:160,rowHeight:52,colspan:5,emptyHtml:'<tr><td colspan="5" style="color:#999;padding:20px;text-align:center;">لا يوجد أي حركات مسجلة لهذا المندوب.</td></tr>'});
            } else if (!agentHistory.length) {
                tbody.innerHTML = `<tr><td colspan="5" style="color:#999; padding:20px; text-align:center;">لا يوجد أي حركات مسجلة لهذا المندوب.</td></tr>`;
            } else {
                agentHistory.slice(0,300).forEach(mov => tbody.appendChild(makeAgentHistoryRow(mov)));
            }

            openModal('agentHistoryModal');
        }


        async function deleteAgentMoneyMovement(movementId) {
            const movement = agentMovementsData.find(m => String(m.id) === String(movementId));
            if (!movement || movement.deleted) return;
            if (movement.type !== 'توريد نقدية' && movement.type !== 'صرف دفعة / عمولة') return;
            const agent = agentsData.find(a => String(a.id) === String(movement.agentId));
            if (!agent) return;
            if (!confirm(`سيتم حذف حركة «${movement.type}» بقيمة ${Number(movement.amount||0).toFixed(2)} وعكس أثرها المالي على الحساب/الصندوق. هل تريد المتابعة؟`)) return;
            try {
                // احضر أحدث نسخة من الصناديق أولًا حتى لا نعكس على نسخة قديمة.
                try {
                    const fresh = JSON.parse(localStorage.getItem('cashtop_funds_db') || localStorage.getItem('cashtop_funds_db_v4') || '{}');
                    if (fresh && typeof fresh === 'object') fundsData = fresh;
                } catch (_) {}
                if (!Array.isArray(fundsData.accounts)) fundsData.accounts = [];
                if (!Array.isArray(fundsData.accountLogs)) fundsData.accountLogs = [];

                // بعض الحركات القديمة قد لا تحتوي payments؛ استرجعها من قيدها المالي.
                let expenses = JSON.parse(localStorage.getItem('cashtop_expenses')) || [];
                let linkedExpense = expenses.find(x => String(x.agentMovementId || '') === String(movement.id));
                if (!linkedExpense) {
                    const expectedType = movement.type === 'توريد نقدية' ? 'توريد مناديب' : 'تسديد عمولة مندوب';
                    linkedExpense = expenses.find(x => x && x.type === expectedType && Number(x.amount || 0) === Number(movement.amount || 0) && String(x.notes || '').includes(agent.name));
                }
                const payments = Array.isArray(movement.payments) && movement.payments.length
                    ? movement.payments
                    : (Array.isArray(linkedExpense?.payments) ? linkedExpense.payments : []);
                if (!payments.length) throw new Error('لا توجد طريقة دفع محفوظة لهذه الحركة، لذلك لا يمكن تحديد الحساب الذي يجب عكسه.');

                const reversalType = movement.type === 'توريد نقدية' ? 'سحب عكسي' : 'إيداع عكسي';
                const sign = movement.type === 'توريد نقدية' ? -1 : 1;
                const reversalDate = new Date().toISOString().split('T')[0];

                payments.forEach((payment, index) => {
                    const vault = fundsData.accounts.find(v => String(v.id) === String(payment.accountId));
                    if (!vault) throw new Error(`الحساب المرتبط بالحركة غير موجود: ${payment.accountName || payment.accountId}`);
                    const accountAmount = Number(payment.accountAmount || payment.amount || 0);
                    if (!(accountAmount > 0)) return;
                    vault.balance = Number(vault.balance || 0) + sign * accountAmount;
                    fundsData.accountLogs.push({
                        id: `LOG_AGENT_REV_${movement.id}_${index}_${Date.now()}`,
                        sourceType: 'agentMovementReversal',
                        sourceId: movement.id,
                        accountId: vault.id,
                        date: reversalDate,
                        type: reversalType,
                        amount: accountAmount,
                        baseAmount: Number(payment.baseAmount || accountAmount),
                        currencyId: payment.accountCurrencyId || vault.currencyId || movement.currencyId,
                        transactionAmount: Number(payment.transactionAmount || accountAmount),
                        transactionCurrencyId: payment.transactionCurrencyId || movement.currencyId,
                        sourceMovementId: movement.id,
                        notes: `عكس حذف حركة مندوب: ${agent.name} — ${movement.type}`
                    });
                });

                if (linkedExpense) {
                    linkedExpense.deleted = true;
                    linkedExpense.deletedAt = new Date().toISOString();
                    linkedExpense.reversalOf = movement.id;
                    linkedExpense.reversalNote = 'تم حذف حركة المندوب وعكس أثرها المالي على الحساب المحدد';
                }
                localStorage.setItem('cashtop_expenses', JSON.stringify(expenses));

                if (movement.type === 'توريد نقدية') {
                    agent.totalCollected = Math.max(0, Number(agent.totalCollected || 0) - Number(movement.amount || 0));
                } else {
                    agent.totalCommission = Number(agent.totalCommission || 0) + Number(movement.amount || 0);
                }

                movement.deleted = true;
                movement.deletedAt = new Date().toISOString();
                movement.reversed = true;
                movement.originalAmount = Number(movement.amount || 0);
                movement.reversalNote = movement.type === 'توريد نقدية'
                    ? 'تم سحب مبلغ التوريد من الحساب/الصندوق الذي تم اختياره عند التوريد'
                    : 'تم إعادة مبلغ الصرف إلى الحساب/الصندوق الذي تم الدفع منه';

                // احفظ المفتاحين لأن بعض الصفحات القديمة تقرأ v4.
                const fundsJson = JSON.stringify(fundsData);
                localStorage.setItem('cashtop_funds_db', fundsJson);
                localStorage.setItem('cashtop_funds_db_v4', fundsJson);
                localStorage.setItem('cashtop_agent_movements', JSON.stringify(agentMovementsData));
                localStorage.setItem('cashtop_sales_agents', JSON.stringify(agentsData));

                window.dispatchEvent(new StorageEvent('storage', { key: 'cashtop_funds_db', newValue: fundsJson }));
                window.dispatchEvent(new CustomEvent('cashtop:sync-now', {
                    detail: { reason: 'delete-agent-money-movement', movementId: movement.id, agentId: agent.id, accountsChanged: true }
                }));
                showToast('تم حذف الحركة وعكس المبلغ في نفس الحساب/الصندوق ومزامنتها.', 'success');
                openAgentHistoryModal(agent.id);
                renderAgentsTable();
            } catch (err) {
                console.error(err);
                showToast(`تعذر حذف الحركة: ${err.message || err}`, 'error');
            }
        }

        function exportAgentHistoryExcel() {
            let id = document.getElementById('historyAgentId').value;
            let a = agentsData.find(x => x.id === id);
            let agentHistory = agentMovementsData.filter(m => m.agentId === id);

            if(agentHistory.length === 0) { showToast("لا توجد حركات للتصدير", "error"); return; }
            
            showToast("جاري التصدير لإكسل...", "success");
            let ws_data = [
                [`سجل حركات وعمليات المندوب: ${a.name}`],
                [],
                ["التاريخ والوقت", "نوع الحركة", "التفاصيل", "القيمة الإجمالية (₪)"]
            ];

            agentHistory.reverse().forEach(mov => {
                ws_data.push([mov.date, mov.type, mov.details, mov.amount.toFixed(2)]);
            });

            const ws = XLSX.utils.aoa_to_sheet(ws_data);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, "سجل_الحركات");
            XLSX.writeFile(wb, `سجل_حركات_المندوب_${Date.now()}.xlsx`);
        }

        async function exportAgentHistoryPDF() {
            const id = document.getElementById('historyAgentId').value;
            const a = agentsData.find(x => x.id === id);
            const agentHistory = agentMovementsData.filter(m => m.agentId === id).slice().reverse();
            if(!a || agentHistory.length === 0) { showToast("لا توجد حركات للتصدير!", "error"); return; }
            const rows = agentHistory.map((mov, i) => [i + 1, mov.date || '-', mov.type || '-', mov.details || '-', Number(mov.amount || 0).toFixed(2)]);
            try {
                await CashtopExport.exportDataTablePDF({
                    title: `سجل حركات وعمليات المندوب: ${a.name || '-'}`,
                    columns: ['#', 'التاريخ والوقت', 'نوع الحركة', 'التفاصيل', 'القيمة (₪)'],
                    rows, filename: `حركات_المندوب_${a.name || 'مندوب'}_${Date.now()}.pdf`, orientation: 'landscape'
                });
                showToast('تم تنزيل سجل حركات المندوب.', 'success');
            } catch (err) { console.error(err); showToast('تعذر إنشاء PDF سجل المندوب.', 'error'); }
        }

        // ==========================================
        // التصدير للاكسل والـ PDF لجدول المناديب الرئيسي
        // ==========================================
        function exportMainExcel() {
            if (agentsData.length === 0) { showToast("لا توجد بيانات للتصدير", "error"); return; }
            showToast("جاري تصدير سجل المناديب...", "success");

            let ws_data = [["تقرير مناديب المبيعات وعمولاتهم - كاش توب"], [], ["اسم المندوب", "رقم الجوال", "خط السير", "العمولة", "عهدة بضاعة (₪)", "المبيعات المسجلة (₪)", "نقدية موردة (₪)", "الذمة (₪)", "العمولة المستحقة (₪)"]];

            agentsData.forEach(a => {
                let carValue = 0;
                a.carStock.forEach(item => { carValue += (item.qty * item.price); });
                let debt = (parseFloat(a.totalSales) || 0) - (parseFloat(a.totalCollected) || 0);

                ws_data.push([
                    a.name, a.phone, a.address, 
                    (a.commType === 'percent' ? `نسبة ${a.commValue}%` : `ثابت ${a.commValue} ₪`),
                    carValue.toFixed(2), 
                    (parseFloat(a.totalSales)||0).toFixed(2), 
                    (parseFloat(a.totalCollected)||0).toFixed(2), 
                    debt.toFixed(2), 
                    a.totalCommission.toFixed(2)
                ]);
            });

            const ws = XLSX.utils.aoa_to_sheet(ws_data);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, "سجل_المناديب");
            XLSX.writeFile(wb, `سجل_المناديب_الخارجي_${Date.now()}.xlsx`);
        }

        async function exportMainPDF() {
            if (agentsData.length === 0) { showToast("لا توجد بيانات للتصدير", "error"); return; }
            const rows = agentsData.map((a, i) => {
                let carValue = 0;
                (a.carStock || []).forEach(item => { carValue += (Number(item.qty) || 0) * (Number(item.price) || 0); });
                const sales = parseFloat(a.totalSales) || 0;
                const collected = parseFloat(a.totalCollected) || 0;
                const debt = sales - collected;
                return [i + 1, a.name || '-', a.phone || '-', carValue.toFixed(2), sales.toFixed(2), collected.toFixed(2), debt.toFixed(2), Number(a.totalCommission || 0).toFixed(2)];
            });
            try {
                await CashtopExport.exportDataTablePDF({
                    title: 'التقرير الشامل لمناديب المبيعات',
                    columns: ['#', 'اسم المندوب', 'الجوال', 'عهدة البضاعة', 'المبيعات', 'النقدية الموردة', 'الذمة', 'العمولة المستحقة'],
                    rows,
                    filename: `تقرير_مناديب_كاش_توب_${Date.now()}.pdf`, orientation: 'landscape', fontSize: 7
                });
            } catch (err) { console.error(err); showToast('تعذر إنشاء PDF المناديب.', 'error'); }
        }

        window.onload = initSystem;
    
{"embedded":true,"page":"المناديب.html"}
