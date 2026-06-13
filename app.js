const APP_VERSION='2.1.0';const DB_NAME='ashool_toyota_db';const DB_VERSION=3;
function generateId(){return Date.now().toString(36)+Math.random().toString(36).substr(2)}

class Database{
    constructor(){this.db=null}
    async init(){return new Promise((resolve,reject)=>{
        const request=indexedDB.open(DB_NAME,DB_VERSION);
        request.onupgradeneeded=(e)=>{
            const db=e.target.result;
            if(!db.objectStoreNames.contains('products')){const s=db.createObjectStore('products',{keyPath:'id'});s.createIndex('name','name',{unique:false})}
            if(!db.objectStoreNames.contains('transactions')){const s=db.createObjectStore('transactions',{keyPath:'id'});s.createIndex('date','date',{unique:false});s.createIndex('type','type',{unique:false})}
            if(!db.objectStoreNames.contains('consignments')){const s=db.createObjectStore('consignments',{keyPath:'id'});s.createIndex('technician','technicianName',{unique:false});s.createIndex('status','status',{unique:false})}
            if(!db.objectStoreNames.contains('debts')){const s=db.createObjectStore('debts',{keyPath:'id'});s.createIndex('entity','entityName',{unique:false});s.createIndex('type','debtType',{unique:false})}
            if(!db.objectStoreNames.contains('expenses')){const s=db.createObjectStore('expenses',{keyPath:'id'});s.createIndex('date','date',{unique:false})}
            if(!db.objectStoreNames.contains('workers')){const s=db.createObjectStore('workers',{keyPath:'id'});s.createIndex('name','name',{unique:false})}
        };
        request.onsuccess=(e)=>{this.db=e.target.result;resolve()};
        request.onerror=()=>reject()
    })}
    async add(store,data){return new Promise((resolve,reject)=>{const tx=this.db.transaction(store,'readwrite');const req=tx.objectStore(store).add(data);req.onsuccess=()=>resolve(data);req.onerror=()=>reject(req.error)})}
    async getAll(store){return new Promise((resolve,reject)=>{const tx=this.db.transaction(store,'readonly');const req=tx.objectStore(store).getAll();req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)})}
    async getByIndex(store,index,value){return new Promise((resolve,reject)=>{const tx=this.db.transaction(store,'readonly');const req=tx.objectStore(store).index(index).getAll(value);req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)})}
    async update(store,data){return new Promise((resolve,reject)=>{const tx=this.db.transaction(store,'readwrite');const req=tx.objectStore(store).put(data);req.onsuccess=()=>resolve(data);req.onerror=()=>reject(req.error)})}
    async delete(store,id){return new Promise((resolve,reject)=>{const tx=this.db.transaction(store,'readwrite');const req=tx.objectStore(store).delete(id);req.onsuccess=()=>resolve();req.onerror=()=>reject(req.error)})}
}

class DailyAccountingSystem{
    constructor(db){this.db=db}
    async generateEndOfDayReport(){
        const today=new Date().toISOString().split('T')[0];
        const tr=await this.db.getAll('transactions'),ex=await this.db.getAll('expenses'),de=await this.db.getAll('debts'),co=await this.db.getAll('consignments'),pr=await this.db.getAll('products'),wo=await this.db.getAll('workers');
        const todayTr=tr.filter(t=>t.date.startsWith(today)),todayEx=ex.filter(e=>e.date.startsWith(today));
        const sales=todayTr.filter(t=>t.type==='direct').map(t=>({time:new Date(t.date).toLocaleTimeString('ar-YE'),product:t.productName,quantity:t.quantity,total:t.total,payment:{cash:'💵 كاش',transfer:'🏦 حوالة',wallet:'📱 محفظة'}[t.paymentMethod]||t.paymentMethod}));
        const debtsGivenToday=todayTr.filter(t=>t.type==='debt'||t.type==='shop-debt').map(t=>({time:new Date(t.date).toLocaleTimeString('ar-YE'),entity:t.entityName,phone:t.entityPhone,product:t.productName,quantity:t.quantity,total:t.total}));
        const pendingGiven=de.filter(d=>d.debtType==='given'&&d.status==='pending').map(d=>({entity:d.entityName,phone:d.entityPhone,product:d.productName,amount:d.amount,date:new Date(d.date).toLocaleDateString('ar-YE'),daysAgo:Math.floor((new Date()-new Date(d.date))/86400000)}));
        const pendingTaken=de.filter(d=>d.debtType==='taken'&&d.status==='pending').map(d=>({entity:d.entityName,phone:d.entityPhone,product:d.productName,amount:d.amount,date:new Date(d.date).toLocaleDateString('ar-YE'),daysAgo:Math.floor((new Date()-new Date(d.date))/86400000)}));
        const expensesList=todayEx.map(e=>({time:new Date(e.date).toLocaleTimeString('ar-YE'),reason:e.reason,amount:e.amount,workerName:e.workerName||''}));
        const activeConsignments=co.filter(c=>c.status==='with_technician').map(c=>({technician:c.technicianName,phone:c.technicianPhone,product:c.productName,quantity:c.quantity,date:new Date(c.date).toLocaleDateString('ar-YE'),daysAgo:Math.floor((new Date()-new Date(c.date))/86400000)}));
        const inventory=pr.map(p=>({name:p.name,code:p.toyotaCode||'-',qty:p.quantity,price:p.sellPrice,value:p.quantity*p.sellPrice}));
        const totalCash=todayTr.filter(t=>t.paymentMethod==='cash'&&t.type==='direct').reduce((s,t)=>s+t.total,0);
        const totalTransfer=todayTr.filter(t=>t.paymentMethod==='transfer'&&t.type==='direct').reduce((s,t)=>s+t.total,0);
        const totalWallet=todayTr.filter(t=>t.paymentMethod==='wallet'&&t.type==='direct').reduce((s,t)=>s+t.total,0);
        const totalSales=totalCash+totalTransfer+totalWallet;
        const totalExpenses=todayEx.reduce((s,e)=>s+e.amount,0);
        const netProfit=totalSales-totalExpenses;
        const totalPendingGiven=pendingGiven.reduce((s,d)=>s+d.amount,0);
        const totalPendingTaken=pendingTaken.reduce((s,d)=>s+d.amount,0);
        const totalInventoryValue=inventory.reduce((s,p)=>s+p.value,0);
        const netPosition=(totalInventoryValue+totalPendingGiven)-totalPendingTaken;
        const totalWorkersDebt=wo.reduce((s,w)=>s+(w.balance||0),0);
        return{reportDate:new Date().toLocaleDateString('ar-YE',{weekday:'long',year:'numeric',month:'long',day:'numeric'}),reportTime:new Date().toLocaleTimeString('ar-YE'),summary:{totalSales,totalCash,totalTransfer,totalWallet,totalExpenses,netProfit,totalPendingGiven,totalPendingTaken,totalInventoryValue,netPosition,activeConsignmentsCount:activeConsignments.length,totalWorkersDebt},details:{sales,debtsGivenToday,allPendingDebtsGiven:pendingGiven,allPendingDebtsTaken:pendingTaken,expenses:expensesList,activeConsignments,inventory,workers:wo}};
    }
    async displayReport(){
        const r=await this.generateEndOfDayReport();
        document.getElementById('daily-report').innerHTML=`
        <div class="end-of-day-report">
            <div class="report-header"><h2>📄 التقرير الختامي اليومي</h2><p class="report-meta">${r.reportDate} | ${r.reportTime}</p><p class="report-entity">محلات طيب علي صالح الأشول</p></div>
            <div class="report-summary">
                <div class="summary-row highlight-green"><span>💰 إجمالي المبيعات</span><strong>${r.summary.totalSales.toLocaleString()} ر.ي</strong></div>
                <div class="summary-row sub-row"><span>💵 الكاش</span><span>${r.summary.totalCash.toLocaleString()} ر.ي</span></div>
                <div class="summary-row sub-row"><span>🏦 الحوالات</span><span>${r.summary.totalTransfer.toLocaleString()} ر.ي</span></div>
                <div class="summary-row sub-row"><span>📱 المحافظ</span><span>${r.summary.totalWallet.toLocaleString()} ر.ي</span></div>
                <div class="summary-row highlight-red"><span>💸 إجمالي النفقات</span><strong>${r.summary.totalExpenses.toLocaleString()} ر.ي</strong></div>
                <div class="summary-row highlight-blue"><span>📊 صافي الربح</span><strong>${r.summary.netProfit.toLocaleString()} ر.ي</strong></div>
                <div class="summary-row highlight-orange"><span>📤 ديون أعطيتها</span><strong>${r.summary.totalPendingGiven.toLocaleString()} ر.ي</strong></div>
                <div class="summary-row highlight-deep-orange"><span>📥 ديون عليّ</span><strong>${r.summary.totalPendingTaken.toLocaleString()} ر.ي</strong></div>
                <div class="summary-row highlight-purple"><span>📦 قيمة المخزون</span><strong>${r.summary.totalInventoryValue.toLocaleString()} ر.ي</strong></div>
                <div class="summary-row highlight-teal"><span>👷 سلف العمال</span><strong>${r.summary.totalWorkersDebt.toLocaleString()} ر.ي</strong></div>
                <div class="summary-row highlight-teal"><span>🏦 المركز المالي</span><strong>${r.summary.netPosition.toLocaleString()} ر.ي</strong></div>
            </div>
            <div class="report-section"><h3>👷 حسابات العمال</h3>${r.details.workers.length?`<table class="report-table"><tr><th>العامل</th><th>الهاتف</th><th>السلف المستحقة</th></tr>${r.details.workers.map(w=>`<tr><td>${w.name}</td><td>${w.phone||'-'}</td><td>${(w.balance||0).toLocaleString()} ر.ي</td></tr>`).join('')}</table>`:'<p>لا يوجد عمال مسجلين</p>'}</div>
            <div class="report-section"><h3>🧾 تفصيل المبيعات</h3>${r.details.sales.length?`<table class="report-table"><tr><th>الوقت</th><th>القطعة</th><th>الكمية</th><th>الإجمالي</th><th>الدفع</th></tr>${r.details.sales.map(s=>`<tr><td>${s.time}</td><td>${s.product}</td><td>${s.quantity}</td><td>${s.total.toLocaleString()} ر.ي</td><td>${s.payment}</td></tr>`).join('')}</table>`:'<p>لا توجد مبيعات اليوم</p>'}</div>
            <div class="report-section"><h3>💸 تفصيل النفقات</h3>${r.details.expenses.length?`<table class="report-table"><tr><th>الوقت</th><th>السبب</th><th>العامل</th><th>المبلغ</th></tr>${r.details.expenses.map(e=>`<tr><td>${e.time}</td><td>${e.reason}</td><td>${e.workerName||'-'}</td><td>${e.amount.toLocaleString()} ر.ي</td></tr>`).join('')}</table>`:'<p>لا توجد نفقات اليوم</p>'}</div>
            <div class="report-section"><h3>📋 الديون المعلقة</h3><h4>📤 أعطيتها</h4>${r.details.allPendingDebtsGiven.length?`<table class="report-table"><tr><th>الجهة</th><th>الهاتف</th><th>القطعة</th><th>المبلغ</th><th>منذ</th></tr>${r.details.allPendingDebtsGiven.map(d=>`<tr><td>${d.entity}</td><td>${d.phone}</td><td>${d.product}</td><td>${d.amount.toLocaleString()} ر.ي</td><td>${d.daysAgo} يوم</td></tr>`).join('')}</table>`:'<p>✅ لا توجد</p>'}<h4>📥 عليّ</h4>${r.details.allPendingDebtsTaken.length?`<table class="report-table"><tr><th>الجهة</th><th>الهاتف</th><th>القطعة</th><th>المبلغ</th><th>منذ</th></tr>${r.details.allPendingDebtsTaken.map(d=>`<tr><td>${d.entity}</td><td>${d.phone}</td><td>${d.product}</td><td>${d.amount.toLocaleString()} ر.ي</td><td>${d.daysAgo} يوم</td></tr>`).join('')}</table>`:'<p>✅ لا توجد</p>'}</div>
            <div class="report-section"><h3>🔧 العهد عند المهندسين</h3>${r.details.activeConsignments.length?`<table class="report-table"><tr><th>المهندس</th><th>الهاتف</th><th>القطعة</th><th>الكمية</th><th>منذ</th></tr>${r.details.activeConsignments.map(c=>`<tr><td>${c.technician}</td><td>${c.phone}</td><td>${c.product}</td><td>${c.quantity}</td><td>${c.daysAgo} يوم</td></tr>`).join('')}</table>`:'<p>✅ لا توجد عهد نشطة</p>'}</div>
            <div class="report-section"><h3>📦 ملخص المخزون</h3><table class="report-table"><tr><th>القطعة</th><th>الكود</th><th>الكمية</th><th>السعر</th><th>القيمة</th></tr>${r.details.inventory.map(p=>`<tr><td>${p.name}</td><td>${p.code}</td><td>${p.qty}</td><td>${p.price.toLocaleString()} ر.ي</td><td>${p.value.toLocaleString()} ر.ي</td></tr>`).join('')}</table></div>
            <div class="report-footer"><p>تم إنشاؤه بواسطة نظام الأشول الذكي V2.1</p><p>جميع الأرقام بالريال اليمني</p></div>
        </div>`;
    }
}

class AshoolSystem{
    constructor(){
        this.db=new Database();this.accounting=new DailyAccountingSystem(this.db);this.currentPage='dashboard';this.init();
    }
    async init(){
        await this.db.init();this.setupNav();this.setupForms();this.setupFAB();this.updateDashboard();this.loadAlerts();this.updateOnlineStatus();
        setTimeout(()=>{document.getElementById('splash-screen').style.opacity='0';setTimeout(()=>{document.getElementById('splash-screen').style.display='none'},500)},1500);
        document.getElementById('today-date').textContent=new Date().toLocaleDateString('ar-YE',{weekday:'long',year:'numeric',month:'long',day:'numeric'});
    }
    setupNav(){
        document.getElementById('menu-toggle').onclick=()=>{document.getElementById('side-menu').classList.add('open');this.createOverlay()};
        document.querySelectorAll('.menu-item').forEach(item=>{item.onclick=()=>{this.navigateTo(item.dataset.page);document.getElementById('side-menu').classList.remove('open');this.removeOverlay()}});
        document.querySelectorAll('.tab').forEach(tab=>{tab.onclick=()=>{document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));tab.classList.add('active');if(tab.dataset.tab==='debts-given'){document.getElementById('debts-given-list').style.display='block';document.getElementById('debts-taken-list').style.display='none'}else{document.getElementById('debts-given-list').style.display='none';document.getElementById('debts-taken-list').style.display='block'}}});
    }
    createOverlay(){if(!document.querySelector('.menu-overlay')){const d=document.createElement('div');d.className='menu-overlay';d.onclick=()=>{document.getElementById('side-menu').classList.remove('open');this.removeOverlay()};document.body.appendChild(d)}}
    removeOverlay(){const o=document.querySelector('.menu-overlay');if(o)o.remove()}
    navigateTo(page){
        document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));document.querySelectorAll('.menu-item').forEach(m=>m.classList.remove('active'));
        const pg=document.getElementById(`page-${page}`);if(pg)pg.classList.add('active');
        const mn=document.querySelector(`[data-page="${page}"]`);if(mn)mn.classList.add('active');
        this.currentPage=page;
        if(page==='dashboard'){this.updateDashboard();this.loadAlerts()}
        else if(page==='inventory')this.loadInventory();
        else if(page==='sales'){this.loadProductsList();this.loadRecentSales()}
        else if(page==='workers')this.loadWorkers();
        else if(page==='consignments')this.loadConsignments();
        else if(page==='customers')this.loadCustomers();
        else if(page==='debts')this.loadDebts();
        else if(page==='expenses')this.loadExpenses();
        else if(page==='reports')this.accounting.displayReport();
    }
    setupForms(){
        document.getElementById('sale-form').onsubmit=async(e)=>{e.preventDefault();await this.recordSale()};
        document.getElementById('sale-type').onchange=(e)=>{const v=e.target.value;document.getElementById('debt-details').style.display=(v==='debt'||v==='shop-debt')?'block':'none';document.getElementById('consignment-details').style.display=v==='consignment'?'block':'none'};
        document.getElementById('add-expense-btn').onclick=()=>{document.getElementById('expense-form').style.display='block';this.populateWorkerSelect()};
        document.getElementById('expense-form').onsubmit=async(e)=>{e.preventDefault();await this.recordExpense()};
        document.getElementById('add-product-btn').onclick=()=>this.showAddProductForm();
        document.getElementById('add-worker-btn').onclick=()=>{document.getElementById('worker-form').style.display='block'};
        document.getElementById('worker-form').onsubmit=async(e)=>{e.preventDefault();await this.addWorker()};
        document.getElementById('export-report-btn').onclick=()=>this.exportReport();
    }
    setupFAB(){document.getElementById('fab-add').onclick=()=>this.navigateTo('sales')}
    async populateWorkerSelect(){
        const sel=document.getElementById('expense-worker');
        sel.innerHTML='<option value="">-- بدون عامل --</option>';
        const workers=await this.db.getAll('workers');
        workers.forEach(w=>{const opt=document.createElement('option');opt.value=w.id;opt.textContent=w.name;sel.appendChild(opt)});
    }
    async addWorker(){
        const name=document.getElementById('worker-name').value.trim();
        const phone=document.getElementById('worker-phone').value.trim();
        if(!name)return;
        await this.db.add('workers',{id:generateId(),name,phone,balance:0});
        document.getElementById('worker-form').reset();
        document.getElementById('worker-form').style.display='none';
        this.loadWorkers();
    }
    async recordExpense(){
        const reason=document.getElementById('expense-reason').value;
        const amount=parseFloat(document.getElementById('expense-amount').value);
        const workerId=document.getElementById('expense-worker').value;
        const expense={id:generateId(),date:new Date().toISOString(),reason,amount,workerId:workerId||null,workerName:''};
        if(workerId){
            const workers=await this.db.getAll('workers');
            const w=workers.find(w=>w.id===workerId);
            if(w){
                expense.workerName=w.name;
                w.balance=(w.balance||0)+amount;
                await this.db.update('workers',w);
            }
        }
        await this.db.add('expenses',expense);
        document.getElementById('expense-form').reset();
        document.getElementById('expense-form').style.display='none';
        this.loadExpenses();this.updateDashboard();
    }
    async updateDashboard(){
        const tr=await this.db.getAll('transactions'),ex=await this.db.getAll('expenses'),co=await this.db.getAll('consignments'),de=await this.db.getAll('debts'),wo=await this.db.getAll('workers');
        const today=new Date().toISOString().split('T')[0];
        const todayTr=tr.filter(t=>t.date.startsWith(today)),todayEx=ex.filter(e=>e.date.startsWith(today));
        const totalSales=todayTr.filter(t=>t.type==='direct').reduce((s,t)=>s+t.total,0);
        document.getElementById('total-sales').textContent=totalSales.toLocaleString()+' ر.ي';
        document.getElementById('total-cash').textContent=todayTr.filter(t=>t.paymentMethod==='cash'&&t.type==='direct').reduce((s,t)=>s+t.total,0).toLocaleString()+' ر.ي';
        document.getElementById('total-transfer').textContent=todayTr.filter(t=>t.paymentMethod==='transfer'&&t.type==='direct').reduce((s,t)=>s+t.total,0).toLocaleString()+' ر.ي';
        document.getElementById('total-wallet').textContent=todayTr.filter(t=>t.paymentMethod==='wallet'&&t.type==='direct').reduce((s,t)=>s+t.total,0).toLocaleString()+' ر.ي';
        document.getElementById('total-expenses').textContent=todayEx.reduce((s,e)=>s+e.amount,0).toLocaleString()+' ر.ي';
        document.getElementById('total-debt-given').textContent=de.filter(d=>d.debtType==='given'&&d.status==='pending').reduce((s,d)=>s+d.amount,0).toLocaleString()+' ر.ي';
        document.getElementById('total-debt-taken').textContent=de.filter(d=>d.debtType==='taken'&&d.status==='pending').reduce((s,d)=>s+d.amount,0).toLocaleString()+' ر.ي';
        document.getElementById('total-consignment').textContent=co.filter(c=>c.status==='with_technician').length+' قطعة';
        document.getElementById('total-workers-debt').textContent=wo.reduce((s,w)=>s+(w.balance||0),0).toLocaleString()+' ر.ي';
    }
    async loadAlerts(){
        const co=await this.db.getAll('consignments'),de=await this.db.getAll('debts'),list=document.getElementById('alerts-list');list.innerHTML='';
        const threeDaysAgo=new Date();threeDaysAgo.setDate(threeDaysAgo.getDate()-3);
        co.filter(c=>c.status==='with_technician'&&new Date(c.date)<threeDaysAgo).forEach(c=>{const days=Math.floor((new Date()-new Date(c.date))/86400000);const d=document.createElement('div');d.className='alert-item';d.innerHTML=`<span class="alert-icon">🔧</span><span class="alert-text"><strong>${c.productName}</strong> (${c.quantity}) عند ${c.technicianName} منذ ${days} يوم<br><small>📱 ${c.technicianPhone}</small></span><button class="alert-action" onclick="app.resolveConsignment('${c.id}')">حُلّت</button>`;list.appendChild(d)});
        de.filter(d=>d.status==='pending').forEach(d=>{const days=Math.floor((new Date()-new Date(d.date))/86400000);if(days>=2){const div=document.createElement('div');div.className='alert-item';div.innerHTML=`<span class="alert-icon">📋</span><span class="alert-text">دين ${d.debtType==='given'?'لك':'عليك'} <strong>${d.amount.toLocaleString()} ر.ي</strong> ${d.debtType==='given'?'عند':'لـ'} ${d.entityName}<br><small>📱 ${d.entityPhone} | منذ ${days} يوم</small></span><button class="alert-action" onclick="app.resolveDebt('${d.id}')">سُدّد</button>`;list.appendChild(div)}});
        if(!list.children.length)list.innerHTML='<p style="text-align:center;color:#757575;">✅ لا توجد تنبيهات</p>';
    }
    async resolveConsignment(id){const c=(await this.db.getAll('consignments')).find(c=>c.id===id);if(c){c.status='resolved';await this.db.update('consignments',c);this.loadAlerts();this.updateDashboard();alert('✅ تم تحديث العهدة')}}
    async resolveDebt(id){const d=(await this.db.getAll('debts')).find(d=>d.id===id);if(d){d.status='resolved';await this.db.update('debts',d);this.loadAlerts();this.updateDashboard();alert('✅ تم تسوية الدين')}}
    async loadInventory(){const prods=await this.db.getAll('products'),list=document.getElementById('inventory-list');list.innerHTML='';prods.forEach(p=>{const d=document.createElement('div');d.className='data-item';d.innerHTML=`<div class="item-info"><h4>${p.name}</h4><p>كود: ${p.toyotaCode||'-'} | الكمية: ${p.quantity}</p></div><div class="item-value">${p.sellPrice?.toLocaleString()||0} ر.ي</div>`;list.appendChild(d)});if(!prods.length)list.innerHTML='<p style="text-align:center;padding:20px;">لا توجد قطع</p>'}
    async loadWorkers(){
        const workers=await this.db.getAll('workers'),list=document.getElementById('workers-list');list.innerHTML='';
        workers.forEach(w=>{
            const d=document.createElement('div');d.className='data-item';
            d.innerHTML=`<div class="item-info"><h4>${w.name}</h4><p>📱 ${w.phone||'لا يوجد'} | السلف: ${(w.balance||0).toLocaleString()} ر.ي</p></div>
            <div><button class="btn-secondary" onclick="app.payWorker('${w.id}')">سدد</button></div>`;
            list.appendChild(d);
        });
        if(!workers.length)list.innerHTML='<p style="text-align:center;padding:20px;">لا يوجد عمال</p>';
    }
    async payWorker(id){
        const workers=await this.db.getAll('workers');const w=workers.find(w=>w.id===id);
        if(!w)return;
        const amount=parseFloat(prompt(`كم سدد العامل ${w.name}؟`));
        if(!amount||amount<=0)return;
        w.balance=Math.max(0,(w.balance||0)-amount);
        await this.db.update('workers',w);
        this.loadWorkers();this.updateDashboard();
        alert(`تم تسديد ${amount.toLocaleString()} ر.ي من ${w.name}`);
    }
    async loadProductsList(){const prods=await this.db.getAll('products'),dl=document.getElementById('products-list');dl.innerHTML='';prods.forEach(p=>{const o=document.createElement('option');o.value=p.name;dl.appendChild(o)})}
    async loadRecentSales(){const tr=await this.db.getAll('transactions'),list=document.getElementById('recent-sales-list');list.innerHTML='';tr.sort((a,b)=>new Date(b.date)-new Date(a.date)).slice(0,10).forEach(t=>{const d=document.createElement('div');d.className='data-item';const lb={direct:'✅ بيع مباشر',debt:'📋 دين','shop-debt':'🏪 دين محل',consignment:'🔧 عهدة'}[t.type]||t.type;d.innerHTML=`<div class="item-info"><h4>${t.productName} (${t.quantity}x)</h4><p>${lb} | ${t.paymentMethod} | ${new Date(t.date).toLocaleTimeString('ar-YE')}</p></div><div class="item-value">${t.total.toLocaleString()} ر.ي</div>`;list.appendChild(d)});if(!tr.length)list.innerHTML='<p style="text-align:center;padding:20px;">لا توجد عمليات</p>'}
    async loadConsignments(){const co=await this.db.getAll('consignments'),list=document.getElementById('consignments-list');list.innerHTML='';co.forEach(c=>{const d=document.createElement('div');d.className='data-item';d.innerHTML=`<div class="item-info"><h4>${c.productName} (${c.quantity}x)</h4><p>المهندس: ${c.technicianName} | 📱 ${c.technicianPhone}</p><p>${c.status==='with_technician'?'🔧 عند المهندس':'✅ تمت'} | ${new Date(c.date).toLocaleDateString('ar-YE')}</p></div>`;list.appendChild(d)})}
    async loadCustomers(){const tr=await this.db.getAll('transactions'),list=document.getElementById('customers-list');list.innerHTML='';const grouped={};tr.filter(t=>t.type==='debt'&&t.entityName).forEach(t=>{if(!grouped[t.entityPhone])grouped[t.entityPhone]={name:t.entityName,phone:t.entityPhone,total:0};grouped[t.entityPhone].total+=t.total});Object.values(grouped).forEach(c=>{const d=document.createElement('div');d.className='data-item';d.innerHTML=`<div class="item-info"><h4>${c.name}</h4><p>📱 ${c.phone}</p></div><div class="item-value warning">${c.total.toLocaleString()} ر.ي</div>`;list.appendChild(d)})}
    async loadDebts(){const de=await this.db.getAll('debts'),gl=document.getElementById('debts-given-list'),tl=document.getElementById('debts-taken-list');gl.innerHTML='';tl.innerHTML='';de.filter(d=>d.debtType==='given').forEach(d=>{const div=document.createElement('div');div.className='data-item';div.innerHTML=`<div class="item-info"><h4>${d.entityName} - ${d.productName}</h4><p>📱 ${d.entityPhone} | ${new Date(d.date).toLocaleDateString('ar-YE')}</p></div><div class="item-value warning">${d.amount.toLocaleString()} ر.ي</div>`;gl.appendChild(div)});de.filter(d=>d.debtType==='taken').forEach(d=>{const div=document.createElement('div');div.className='data-item';div.innerHTML=`<div class="item-info"><h4>${d.entityName} - ${d.productName}</h4><p>📱 ${d.entityPhone} | ${new Date(d.date).toLocaleDateString('ar-YE')}</p></div><div class="item-value negative">${d.amount.toLocaleString()} ر.ي</div>`;tl.appendChild(div)})}
    async loadExpenses(){const ex=await this.db.getAll('expenses'),list=document.getElementById('expenses-list');list.innerHTML='';ex.sort((a,b)=>new Date(b.date)-new Date(a.date)).forEach(e=>{const d=document.createElement('div');d.className='data-item';d.innerHTML=`<div class="item-info"><h4>${e.reason} ${e.workerName?'- '+e.workerName:''}</h4><p>${new Date(e.date).toLocaleDateString('ar-YE')}</p></div><div class="item-value negative">${e.amount.toLocaleString()} ر.ي</div>`;list.appendChild(d)})}
    showAddProductForm(){
        const name=prompt('اسم القطعة:');if(!name)return;const code=prompt('كود تويوتا (اختياري):');const qty=parseInt(prompt('الكمية:'));if(!qty||qty<0)return;const price=parseFloat(prompt('سعر البيع:'));if(!price)return;
        this.db.add('products',{id:generateId(),name,toyotaCode:code||'',quantity:qty,sellPrice:price,dateAdded:new Date().toISOString()});this.loadInventory();this.loadProductsList();alert('✅ تمت الإضافة');
    }
    async recordSale(){
        const name=document.getElementById('sale-product').value,qty=parseInt(document.getElementById('sale-quantity').value),price=parseFloat(document.getElementById('sale-price').value),pay=document.getElementById('sale-payment').value,type=document.getElementById('sale-type').value,total=qty*price;
        const prods=await this.db.getByIndex('products','name',name);if(!prods.length){alert('⚠️ القطعة غير موجودة');return}const p=prods[0];if(p.quantity<qty){alert(`⚠️ الكمية غير كافية! المتوفر: ${p.quantity}`);return}
        const t={id:generateId(),date:new Date().toISOString(),type,productId:p.id,productName:name,quantity:qty,unitPrice:price,total,paymentMethod:pay,entityName:'',entityPhone:'',status:type==='direct'?'completed':'pending'};
        if(type==='debt'||type==='shop-debt'){t.entityName=document.getElementById('debt-entity-name').value;t.entityPhone=document.getElementById('debt-entity-phone').value;await this.db.add('debts',{id:generateId(),transactionId:t.id,entityName:t.entityName,entityPhone:t.entityPhone,debtType:'given',amount:total,date:t.date,productName:name,status:'pending'})}
        if(type==='consignment'){t.entityName=document.getElementById('consignment-tech-name').value;t.entityPhone=document.getElementById('consignment-tech-phone').value;await this.db.add('consignments',{id:generateId(),transactionId:t.id,technicianName:t.entityName,technicianPhone:t.entityPhone,productName:name,quantity:qty,date:t.date,status:'with_technician'})}
        p.quantity-=qty;await this.db.update('products',p);await this.db.add('transactions',t);
        document.getElementById('sale-form').reset();document.getElementById('sale-quantity').value='1';document.getElementById('debt-details').style.display='none';document.getElementById('consignment-details').style.display='none';
        alert(`✅ تمت العملية! الإجمالي: ${total.toLocaleString()} ر.ي`);this.loadRecentSales();this.updateDashboard();
    }
    exportReport(){const c=document.getElementById('daily-report').innerText;const b=new Blob([c],{type:'text/plain'});const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download=`تقرير_${new Date().toISOString().split('T')[0]}.txt`;a.click();alert('✅ تم التصدير')}
    updateOnlineStatus(){
        const dot=document.getElementById('online-status');
        const up=()=>{if(navigator.onLine){dot.className='status-dot online';dot.title='متصل'}else{dot.className='status-dot offline';dot.title='غير متصل'}};
        window.addEventListener('online',up);window.addEventListener('offline',up);up();
    }
}

let app;
document.addEventListener('DOMContentLoaded',()=>{app=new AshoolSystem()});
if('serviceWorker'in navigator)navigator.serviceWorker.register('sw.js');