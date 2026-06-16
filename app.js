// ========== نظام الأشول الذكي V3.0 ==========
const PASSWORDS = {
    manager: '03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4', // 1234
    employee: '81fe8bfe87576c3ecb22426f8e57847382917acf19ad5a27b5ac3e9b1e6c1b10' // 0000
};

function sha256(str) {
    return crypto.subtle.digest('SHA-256', new TextEncoder().encode(str))
        .then(buf => Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join(''));
}

function generateId() { return Date.now().toString(36) + Math.random().toString(36).substr(2); }

// ========== قاعدة البيانات ==========
class Database {
    constructor() { this.db = null; }
    async init() {
        return new Promise((resolve, reject) => {
            const req = indexedDB.open('ashool_db_v3', 1);
            req.onupgradeneeded = (e) => {
                const db = e.target.result;
                ['products','transactions','consignments','debts','expenses','workers','worker_transactions'].forEach(store => {
                    if (!db.objectStoreNames.contains(store)) db.createObjectStore(store, { keyPath: 'id' });
                });
                if (db.objectStoreNames.contains('products')) {
                    const tx = e.target.transaction;
                    const store = tx.objectStore('products');
                    if (!store.indexNames.contains('name')) store.createIndex('name','name',{unique:false});
                }
            };
            req.onsuccess = (e) => { this.db = e.target.result; resolve(); };
            req.onerror = () => reject();
        });
    }
    add(store, data) { return new Promise((res) => {
        const tx = this.db.transaction(store, 'readwrite');
        tx.objectStore(store).add(data).onsuccess = () => res(data);
    })}
    getAll(store) { return new Promise((res) => {
        const tx = this.db.transaction(store);
        tx.objectStore(store).getAll().onsuccess = (e) => res(e.target.result);
    })}
    update(store, data) { return new Promise((res) => {
        const tx = this.db.transaction(store, 'readwrite');
        tx.objectStore(store).put(data).onsuccess = () => res(data);
    })}
    delete(store, id) { return new Promise((res) => {
        const tx = this.db.transaction(store, 'readwrite');
        tx.objectStore(store).delete(id).onsuccess = () => res();
    })}
    async clearAll() {
        const stores = ['products','transactions','consignments','debts','expenses','workers','worker_transactions'];
        for (const s of stores) {
            const all = await this.getAll(s);
            for (const item of all) await this.delete(s, item.id);
        }
    }
}

// ========== التطبيق الرئيسي ==========
class AshoolApp {
    constructor() {
        this.db = new Database();
        this.role = null;
    }

    async start() {
        await this.db.init();
        document.getElementById('login-form').onsubmit = (e) => this.login(e);
    }

    async login(e) {
        e.preventDefault();
        const role = document.getElementById('login-role').value;
        const password = document.getElementById('login-password').value;
        const hash = await sha256(password);
        if (hash === PASSWORDS[role]) {
            this.role = role;
            document.getElementById('login-screen').style.display = 'none';
            document.getElementById('splash-screen').style.display = 'flex';
            setTimeout(async () => {
                document.getElementById('splash-screen').style.display = 'none';
                document.getElementById('main-header').style.display = 'flex';
                document.getElementById('main-content').style.display = 'block';
                document.getElementById('user-role-display').textContent = role === 'manager' ? 'مدير' : 'موظف';
                this.buildMenu();
                this.createPages();
                this.setupNavigation();
                this.updateDashboard();
                this.loadAlerts();
            }, 1200);
        } else {
            document.getElementById('login-error').style.display = 'block';
        }
    }

    logout() {
        location.reload();
    }

    buildMenu() {
        const menu = document.getElementById('menu-items-container');
        menu.innerHTML = '';
        const items = [
            { page: 'dashboard', icon: '📊', label: 'لوحة التحكم', roles: ['manager','employee'] },
            { page: 'sales', icon: '💰', label: 'تسجيل مبيعات', roles: ['manager','employee'] },
            { page: 'debts', icon: '📋', label: 'الديون', roles: ['manager','employee'] },
            { page: 'consignments', icon: '🔧', label: 'عهد المهندسين', roles: ['manager','employee'] },
            { page: 'workers', icon: '👷', label: 'العمال', roles: ['manager','employee'] },
            { page: 'inventory', icon: '📦', label: 'المخزون', roles: ['manager'] },
            { page: 'expenses', icon: '💸', label: 'النفقات', roles: ['manager'] },
            { page: 'reports', icon: '📄', label: 'تقارير', roles: ['manager'] },
            { page: 'sync', icon: '🔄', label: 'مزامنة', roles: ['manager','employee'] }
        ];
        items.forEach(item => {
            if (item.roles.includes(this.role)) {
                const li = document.createElement('li');
                li.className = 'menu-item' + (item.page === 'dashboard' ? ' active' : '');
                li.dataset.page = item.page;
                li.innerHTML = `<span class="menu-icon">${item.icon}</span><span>${item.label}</span>`;
                menu.appendChild(li);
            }
        });
    }

    createPages() {
        const main = document.getElementById('main-content');
        main.innerHTML = `
            <div id="page-dashboard" class="page active"></div>
            <div id="page-sales" class="page"></div>
            <div id="page-debts" class="page"></div>
            <div id="page-consignments" class="page"></div>
            <div id="page-workers" class="page"></div>
            ${this.role==='manager' ? '<div id="page-inventory" class="page"></div><div id="page-expenses" class="page"></div><div id="page-reports" class="page"></div>' : ''}
            <div id="page-sync" class="page"></div>
        `;
        this.renderDashboard();
        this.renderSales();
        this.renderDebts();
        this.renderConsignments();
        this.renderWorkers();
        if (this.role === 'manager') {
            this.renderInventory();
            this.renderExpenses();
            this.renderReports();
        }
        this.renderSync();
        document.getElementById('logout-btn').onclick = () => this.logout();
    }

    setupNavigation() {
        document.getElementById('menu-toggle').onclick = () => {
            document.getElementById('side-menu').classList.add('open');
            this.createOverlay();
        };
        document.querySelectorAll('.menu-item').forEach(item => {
            item.onclick = () => {
                this.navigateTo(item.dataset.page);
                document.getElementById('side-menu').classList.remove('open');
                this.removeOverlay();
            };
        });
    }

    createOverlay() {
        if (!document.querySelector('.menu-overlay')) {
            const ov = document.createElement('div');
            ov.className = 'menu-overlay';
            ov.onclick = () => {
                document.getElementById('side-menu').classList.remove('open');
                this.removeOverlay();
            };
            document.body.appendChild(ov);
        }
    }
    removeOverlay() {
        const ov = document.querySelector('.menu-overlay');
        if (ov) ov.remove();
    }

    navigateTo(page) {
        document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
        document.querySelectorAll('.menu-item').forEach(m => m.classList.remove('active'));
        const pg = document.getElementById(`page-${page}`);
        if (pg) pg.classList.add('active');
        const mn = document.querySelector(`[data-page="${page}"]`);
        if (mn) mn.classList.add('active');

        if (page === 'dashboard') { this.updateDashboard(); this.loadAlerts(); }
        else if (page === 'sales') this.loadProductsList();
        else if (page === 'debts') this.loadDebts();
        else if (page === 'consignments') this.loadConsignments();
        else if (page === 'workers') this.loadWorkers();
        else if (page === 'inventory') this.loadInventory();
        else if (page === 'expenses') this.loadExpenses();
        else if (page === 'reports') this.generateReport();
        else if (page === 'sync') this.renderSync();
    }

    // ========== تحميل البيانات ==========
    async updateDashboard() {
        const tr = await this.db.getAll('transactions');
        const ex = await this.db.getAll('expenses');
        const wo = await this.db.getAll('workers');
        const today = new Date().toISOString().split('T')[0];
        const todayTr = tr.filter(t => t.date && t.date.startsWith(today));
        const todayEx = ex.filter(e => e.date && e.date.startsWith(today));
        const totalSales = todayTr.filter(t => t.type === 'direct').reduce((s,t) => s + (t.total||0), 0);
        const totalExpenses = todayEx.reduce((s,e) => s + e.amount, 0);
        const workersDebt = wo.reduce((s,w) => s + (w.balance||0), 0);
        document.getElementById('total-sales').textContent = totalSales.toLocaleString() + ' ر.ي';
        document.getElementById('total-expenses').textContent = totalExpenses.toLocaleString() + ' ر.ي';
        document.getElementById('total-workers').textContent = workersDebt.toLocaleString() + ' ر.ي';
    }

    async loadAlerts() {
        const debts = await this.db.getAll('debts');
        const cons = await this.db.getAll('consignments');
        const alerts = [];
        debts.filter(d => d.status === 'pending').forEach(d => {
            const days = Math.floor((new Date() - new Date(d.date)) / 86400000);
            if (days >= 2) alerts.push(`دين ${d.debtType==='given'?'لك':'عليك'} بقيمة ${d.amount} عند ${d.entityName} منذ ${days} يوم`);
        });
        cons.filter(c => c.status === 'with_technician').forEach(c => {
            const days = Math.floor((new Date() - new Date(c.date)) / 86400000);
            if (days >= 3) alerts.push(`القطعة ${c.productName} عند ${c.technicianName} منذ ${days} يوم`);
        });
        const alertsDiv = document.getElementById('alerts-list');
        if (alertsDiv) {
            alertsDiv.innerHTML = alerts.length ? alerts.map(a => `<div class="alert-item">⚠️ ${a}</div>`).join('') : '<p>✅ لا توجد تنبيهات</p>';
        }
    }

    // ========== الصفحات ==========
    renderDashboard() {
        const page = document.getElementById('page-dashboard');
        page.innerHTML = `
            <div class="page-header"><h2>📊 لوحة تحكم اليوم</h2><p>${new Date().toLocaleDateString('ar-YE',{weekday:'long',year:'numeric',month:'long',day:'numeric'})}</p></div>
            <div class="dashboard-cards">
                <div class="card card-sales"><div class="card-icon">💰</div><div class="card-info"><h3>المبيعات</h3><p id="total-sales">0</p></div></div>
                <div class="card card-expenses"><div class="card-icon">💸</div><div class="card-info"><h3>النفقات</h3><p id="total-expenses">0</p></div></div>
                <div class="card card-workers"><div class="card-icon">👷</div><div class="card-info"><h3>سلف العمال</h3><p id="total-workers">0</p></div></div>
            </div>
            <div class="alerts-section"><h3>⚠️ التنبيهات</h3><div id="alerts-list"></div></div>`;
    }

    renderSales() {
        const page = document.getElementById('page-sales');
        page.innerHTML = `
            <div class="page-header"><h2>💰 تسجيل مبيعات</h2></div>
            <form id="sale-form" class="main-form">
                <div class="form-group"><label>القطعة</label><input type="text" id="sale-product" list="products-list" placeholder="اسم القطعة" required><datalist id="products-list"></datalist></div>
                <div class="form-row"><div class="form-group"><label>الكمية</label><input type="number" id="sale-qty" value="1" min="1" required></div><div class="form-group"><label>السعر</label><input type="number" id="sale-price" step="0.01" required></div></div>
                <div class="form-group"><label>طريقة الدفع</label><select id="sale-payment" required><option value="cash">كاش</option><option value="transfer">حوالة</option><option value="wallet">محفظة</option></select></div>
                <div class="form-group"><label>نوع البيع</label><select id="sale-type" required><option value="direct">بيع مباشر</option><option value="debt">دين للزبون</option><option value="shop-debt">دين لمحل</option><option value="consignment">صرف لمهندس</option></select></div>
                <div id="debt-fields" style="display:none;"><input type="text" id="debt-name" placeholder="اسم"><input type="tel" id="debt-phone" placeholder="رقم الهاتف"></div>
                <div id="consignment-fields" style="display:none;"><input type="text" id="cons-name" placeholder="اسم المهندس"><input type="tel" id="cons-phone" placeholder="رقم الهاتف"></div>
                <button type="submit" class="btn-primary">تسجيل</button>
            </form>
            <div id="recent-sales" class="data-list"></div>`;
        document.getElementById('sale-type').onchange = (e) => {
            const v = e.target.value;
            document.getElementById('debt-fields').style.display = (v==='debt'||v==='shop-debt')?'block':'none';
            document.getElementById('consignment-fields').style.display = v==='consignment'?'block':'none';
        };
        document.getElementById('sale-form').onsubmit = (e) => this.recordSale(e);
    }

    async recordSale(e) {
        e.preventDefault();
        const product = document.getElementById('sale-product').value;
        const qty = parseInt(document.getElementById('sale-qty').value);
        const price = parseFloat(document.getElementById('sale-price').value);
        const payment = document.getElementById('sale-payment').value;
        const type = document.getElementById('sale-type').value;
        const total = qty * price;
        const trans = {
            id: generateId(),
            date: new Date().toISOString(),
            productName: product,
            quantity: qty,
            unitPrice: price,
            total,
            paymentMethod: payment,
            type,
            status: type === 'direct' ? 'completed' : 'pending'
        };
        if (type === 'debt' || type === 'shop-debt') {
            trans.entityName = document.getElementById('debt-name').value;
            trans.entityPhone = document.getElementById('debt-phone').value;
            await this.db.add('debts', {
                id: generateId(),
                transactionId: trans.id,
                entityName: trans.entityName,
                entityPhone: trans.entityPhone,
                debtType: 'given',
                amount: total,
                date: trans.date,
                productName: product,
                status: 'pending'
            });
        }
        if (type === 'consignment') {
            trans.entityName = document.getElementById('cons-name').value;
            trans.entityPhone = document.getElementById('cons-phone').value;
            await this.db.add('consignments', {
                id: generateId(),
                transactionId: trans.id,
                technicianName: trans.entityName,
                technicianPhone: trans.entityPhone,
                productName: product,
                quantity: qty,
                date: trans.date,
                status: 'with_technician'
            });
        }
        await this.db.add('transactions', trans);
        document.getElementById('sale-form').reset();
        document.getElementById('sale-qty').value = 1;
        alert('✅ تم التسجيل');
        this.updateDashboard();
    }

    renderDebts() {
        document.getElementById('page-debts').innerHTML = `
            <div class="page-header"><h2>📋 الديون</h2></div>
            <div class="tabs"><button class="tab active" data-tab="given">ديون أعطيتها</button><button class="tab" data-tab="taken">ديون عليّ</button></div>
            <div id="debts-given-list" class="data-list"></div>
            <div id="debts-taken-list" class="data-list" style="display:none;"></div>`;
        document.querySelectorAll('.tab').forEach(tab => {
            tab.onclick = () => {
                document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                document.getElementById('debts-given-list').style.display = tab.dataset.tab === 'given' ? 'block' : 'none';
                document.getElementById('debts-taken-list').style.display = tab.dataset.tab === 'taken' ? 'block' : 'none';
                this.loadDebts();
            };
        });
    }

    async loadDebts() {
        const debts = await this.db.getAll('debts');
        const givenList = document.getElementById('debts-given-list');
        const takenList = document.getElementById('debts-taken-list');
        if (givenList) givenList.innerHTML = debts.filter(d => d.debtType === 'given' && d.status !== 'paid').map(d => `
            <div class="data-item">
                <span>${d.entityName} - ${d.productName} (${d.amount} ر.ي)</span>
                <button class="btn-secondary" onclick="app.settleDebt('${d.id}')">سُدّد</button>
            </div>`).join('') || '<p>لا توجد ديون نشطة</p>';
        if (takenList) takenList.innerHTML = debts.filter(d => d.debtType === 'taken' && d.status !== 'paid').map(d => `
            <div class="data-item">
                <span>${d.entityName} - ${d.productName} (${d.amount} ر.ي)</span>
                <button class="btn-secondary" onclick="app.settleDebt('${d.id}')">سُدّد</button>
            </div>`).join('') || '<p>لا توجد ديون نشطة</p>';
    }

    async settleDebt(id) {
        const debts = await this.db.getAll('debts');
        const debt = debts.find(d => d.id === id);
        if (debt) {
            debt.status = 'paid';
            await this.db.update('debts', debt);
            this.loadDebts();
            alert('تم تسوية الدين');
        }
    }

    renderConsignments() {
        document.getElementById('page-consignments').innerHTML = `
            <div class="page-header"><h2>🔧 عهد المهندسين</h2></div>
            <div id="consignments-list" class="data-list"></div>`;
    }

    async loadConsignments() {
        const cons = await this.db.getAll('consignments');
        const list = document.getElementById('consignments-list');
        list.innerHTML = cons.filter(c => c.status === 'with_technician').map(c => `
            <div class="data-item">
                <span>${c.productName} (${c.quantity}) - ${c.technicianName} 📱${c.technicianPhone}</span>
                <button class="btn-secondary" onclick="app.returnConsignment('${c.id}')">أُرجعت</button>
            </div>`).join('') || '<p>لا توجد عهد نشطة</p>';
    }

    async returnConsignment(id) {
        const cons = await this.db.getAll('consignments');
        const c = cons.find(x => x.id === id);
        if (c) {
            c.status = 'returned';
            await this.db.update('consignments', c);
            this.loadConsignments();
            alert('تم إرجاع العهدة');
        }
    }

    renderWorkers() {
        document.getElementById('page-workers').innerHTML = `
            <div class="page-header"><h2>👷 العمال</h2></div>
            ${this.role==='manager' ? '<button id="add-worker-btn" class="btn-secondary">+ إضافة عامل</button>' : ''}
            <div id="workers-list" class="data-list"></div>
            ${this.role==='manager' ? '<div id="worker-form-container" style="display:none;"></div>' : ''}`;
        if (this.role === 'manager') {
            document.getElementById('add-worker-btn').onclick = () => {
                document.getElementById('worker-form-container').style.display = 'block';
                document.getElementById('worker-form-container').innerHTML = `
                    <form id="worker-form" class="main-form">
                        <input type="text" id="worker-name" placeholder="اسم العامل" required>
                        <input type="tel" id="worker-phone" placeholder="رقم الهاتف">
                        <input type="number" id="worker-salary" placeholder="الراتب الشهري (اختياري)">
                        <button type="submit" class="btn-primary">حفظ</button>
                    </form>`;
                document.getElementById('worker-form').onsubmit = async (e) => {
                    e.preventDefault();
                    const name = document.getElementById('worker-name').value;
                    const phone = document.getElementById('worker-phone').value;
                    const salary = parseFloat(document.getElementById('worker-salary').value) || 0;
                    await this.db.add('workers', { id: generateId(), name, phone, salary, balance: 0 });
                    document.getElementById('worker-form-container').style.display = 'none';
                    this.loadWorkers();
                };
            };
        }
    }

    async loadWorkers() {
        const workers = await this.db.getAll('workers');
        const workerTrans = await this.db.getAll('worker_transactions');
        const today = new Date().toISOString().split('T')[0];
        const list = document.getElementById('workers-list');
        list.innerHTML = workers.map(w => {
            const todayDraws = workerTrans.filter(t => t.workerId === w.id && t.date && t.date.startsWith(today));
            const totalToday = todayDraws.reduce((s,t) => s + t.amount, 0);
            const totalAll = workerTrans.filter(t => t.workerId === w.id).reduce((s,t) => s + t.amount, 0);
            const remaining = (w.salary||0) - totalAll;
            return `
            <div class="data-item">
                <div>
                    <strong>${w.name}</strong> 📱${w.phone||''}<br>
                    <small>مسحوبات اليوم: ${totalToday} ر.ي | الإجمالي: ${totalAll} ر.ي</small><br>
                    <small>الراتب: ${w.salary||0} | الباقي: ${remaining >= 0 ? 'له ' + remaining : 'عليه ' + Math.abs(remaining)} ر.ي</small>
                </div>
                ${this.role==='manager' ? `<button class="btn-secondary" onclick="app.payWorker('${w.id}')">سحب</button>` : ''}
            </div>`;
        }).join('') || '<p>لا يوجد عمال</p>';
    }

    async payWorker(id) {
        const amount = parseFloat(prompt('مبلغ السحب:'));
        if (!amount || amount <= 0) return;
        const reason = prompt('سبب السحب:') || '';
        await this.db.add('worker_transactions', {
            id: generateId(),
            workerId: id,
            amount,
            reason,
            date: new Date().toISOString()
        });
        const workers = await this.db.getAll('workers');
        const w = workers.find(w => w.id === id);
        if (w) {
            w.balance = (w.balance||0) + amount;
            await this.db.update('workers', w);
        }
        this.loadWorkers();
    }

    renderInventory() {
        document.getElementById('page-inventory').innerHTML = `
            <div class="page-header"><h2>📦 المخزون</h2><button id="add-product-btn" class="btn-secondary">+ قطعة</button></div>
            <div id="inventory-list" class="data-list"></div>`;
        document.getElementById('add-product-btn').onclick = () => {
            const name = prompt('اسم القطعة:');
            if (!name) return;
            const code = prompt('كود تويوتا:') || '';
            const qty = parseInt(prompt('الكمية:'));
            const price = parseFloat(prompt('السعر:'));
            if (isNaN(qty) || isNaN(price)) return;
            this.db.add('products', { id: generateId(), name, toyotaCode: code, quantity: qty, sellPrice: price, dateAdded: new Date().toISOString() });
            this.loadInventory();
        };
    }

    async loadInventory() {
        const products = await this.db.getAll('products');
        const list = document.getElementById('inventory-list');
        list.innerHTML = products.map(p => `
            <div class="data-item">
                <span>${p.name} (${p.quantity})</span>
                <span>${p.sellPrice} ر.ي</span>
            </div>`).join('') || '<p>لا توجد قطع</p>';
    }

    renderExpenses() {
        document.getElementById('page-expenses').innerHTML = `
            <div class="page-header"><h2>💸 النفقات</h2><button id="add-expense-btn" class="btn-secondary">+ نفقة</button></div>
            <form id="expense-form" class="main-form" style="display:none;">
                <input type="text" id="expense-reason" placeholder="السبب" required>
                <input type="number" id="expense-amount" placeholder="المبلغ" required>
                <select id="expense-worker"><option value="">بدون عامل</option></select>
                <button type="submit" class="btn-primary">تسجيل</button>
            </form>
            <div id="expenses-list" class="data-list"></div>`;
        document.getElementById('add-expense-btn').onclick = async () => {
            document.getElementById('expense-form').style.display = 'block';
            const sel = document.getElementById('expense-worker');
            const workers = await this.db.getAll('workers');
            sel.innerHTML = '<option value="">بدون عامل</option>' + workers.map(w => `<option value="${w.id}">${w.name}</option>`).join('');
        };
        document.getElementById('expense-form').onsubmit = async (e) => {
            e.preventDefault();
            const reason = document.getElementById('expense-reason').value;
            const amount = parseFloat(document.getElementById('expense-amount').value);
            const workerId = document.getElementById('expense-worker').value;
            const expense = { id: generateId(), date: new Date().toISOString(), reason, amount, workerId: workerId || null };
            await this.db.add('expenses', expense);
            if (workerId) {
                await this.db.add('worker_transactions', {
                    id: generateId(),
                    workerId,
                    amount,
                    reason,
                    date: expense.date
                });
                const workers = await this.db.getAll('workers');
                const w = workers.find(w => w.id === workerId);
                if (w) {
                    w.balance = (w.balance||0) + amount;
                    await this.db.update('workers', w);
                }
            }
            document.getElementById('expense-form').reset();
            document.getElementById('expense-form').style.display = 'none';
            this.loadExpenses();
        };
    }

    async loadExpenses() {
        const expenses = await this.db.getAll('expenses');
        const list = document.getElementById('expenses-list');
        list.innerHTML = expenses.map(e => `
            <div class="data-item">
                <span>${e.reason} (${e.amount} ر.ي)</span>
                <small>${new Date(e.date).toLocaleDateString('ar-YE')}</small>
            </div>`).join('') || '<p>لا توجد نفقات</p>';
    }

    renderReports() {
        document.getElementById('page-reports').innerHTML = `
            <div class="page-header"><h2>📄 تقارير</h2></div>
            <button id="daily-report-btn" class="btn-primary">تقرير يومي</button>
            <button id="monthly-pdf-btn" class="btn-primary" style="margin-top:10px;">تقرير شهري PDF</button>
            <div id="report-output" style="margin-top:20px;"></div>`;
        document.getElementById('daily-report-btn').onclick = () => this.generateDailyReport();
        document.getElementById('monthly-pdf-btn').onclick = () => this.generateMonthlyPDF();
    }

    async generateDailyReport() {
        // عرض سريع داخل الصفحة
        const out = document.getElementById('report-output');
        const today = new Date().toISOString().split('T')[0];
        const tr = await this.db.getAll('transactions');
        const todayTr = tr.filter(t => t.date && t.date.startsWith(today));
        const sales = todayTr.filter(t => t.type==='direct').reduce((s,t) => s+t.total,0);
        const expenses = await this.db.getAll('expenses');
        const todayEx = expenses.filter(e => e.date && e.date.startsWith(today));
        const totalEx = todayEx.reduce((s,e) => s+e.amount,0);
        out.innerHTML = `<div class="end-of-day-report"><h3>تقرير يوم ${today}</h3><p>المبيعات: ${sales} ر.ي</p><p>النفقات: ${totalEx} ر.ي</p><p>الصافي: ${sales - totalEx} ر.ي</p></div>`;
    }

    async generateMonthlyPDF() {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        const today = new Date();
        const month = today.getMonth();
        const year = today.getFullYear();
        doc.setFont('helvetica', 'bold');
        doc.text(`تقرير شهر ${month+1}/${year} - نظام الأشول الذكي`, 10, 20);
        doc.save(`تقرير_${year}_${month+1}.pdf`);
        alert('تم حفظ التقرير في Downloads');
    }

    renderSync() {
        document.getElementById('page-sync').innerHTML = `
            <div class="page-header"><h2>🔄 مزامنة</h2></div>
            ${this.role==='employee' ? '<button id="export-json-btn" class="btn-primary">تصدير ملف JSON</button>' : ''}
            ${this.role==='manager' ? '<input type="file" id="import-file" accept=".json" style="margin:10px 0;"><button id="import-json-btn" class="btn-primary">استيراد ودمج</button>' : ''}
            <div id="sync-status"></div>`;
        if (this.role === 'employee') {
            document.getElementById('export-json-btn').onclick = async () => {
                const data = {
                    products: await this.db.getAll('products'),
                    transactions: await this.db.getAll('transactions'),
                    debts: await this.db.getAll('debts'),
                    consignments: await this.db.getAll('consignments'),
                    expenses: await this.db.getAll('expenses'),
                    workers: await this.db.getAll('workers'),
                    worker_transactions: await this.db.getAll('worker_transactions')
                };
                const blob = new Blob([JSON.stringify(data)], {type:'application/json'});
                const a = document.createElement('a');
                a.href = URL.createObjectURL(blob);
                a.download = `sync_${new Date().toISOString().slice(0,10)}.json`;
                a.click();
                document.getElementById('sync-status').textContent = 'تم التصدير. أرسل الملف للمدير.';
            };
        }
        if (this.role === 'manager') {
            document.getElementById('import-json-btn').onclick = async () => {
                const fileInput = document.getElementById('import-file');
                const file = fileInput.files[0];
                if (!file) return;
                const text = await file.text();
                const data = JSON.parse(text);
                for (const store of ['products','transactions','debts','consignments','expenses','workers','worker_transactions']) {
                    if (data[store]) {
                        for (const item of data[store]) {
                            const existing = await this.db.getAll(store);
                            if (!existing.find(x => x.id === item.id)) {
                                await this.db.add(store, item);
                            }
                        }
                    }
                }
                document.getElementById('sync-status').textContent = 'تم الدمج بنجاح!';
                this.updateDashboard();
            };
        }
    }

    async loadProductsList() {
        const products = await this.db.getAll('products');
        const datalist = document.getElementById('products-list');
        if (datalist) datalist.innerHTML = products.map(p => `<option value="${p.name}">`).join('');
    }
}

const app = new AshoolApp();
app.start();