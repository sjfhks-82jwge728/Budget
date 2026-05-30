// ============================================================
// HH_FEATURES.JS — Household Budget Tracker UI v4
// ============================================================

const HHUI = (() => {

  let _plan       = null;
  let _tab        = 'bycheck';
  let _checkIdx   = 0;
  let _setupSub   = 'expenses';
  let _ccStrat    = 'avalanche';
  let _ccExtra    = 0;
  let _filterSpouse = 'all';

  function plan(force) { if (!_plan||force) _plan=HH.buildPlan(); return _plan; }
  function refresh()   { _plan=null; renderApp(); }

  function upcomingIdx() {
    const today=HH.fmtDate(new Date()), {checks}=plan();
    const i=checks.findIndex(c=>c.date>=today);
    return i>=0?i:Math.max(0,checks.length-1);
  }

  const CAT_ICON  = {'Insurance':'🛡','Housing':'🏠','Credit Card':'💳','Utilities':'⚡','Health':'🏥','Auto':'🚗','Other':'📋'};
  const CAT_COLOR = {'Insurance':'cat-ins','Housing':'cat-house','Credit Card':'cat-cc','Utilities':'cat-util','Health':'cat-health','Auto':'cat-auto','Other':'cat-other'};
  function catBadge(cat){ return `<span class="cat-badge ${CAT_COLOR[cat]||'cat-other'}">${CAT_ICON[cat]||'📋'} ${cat}</span>`; }
  function surplusClass(v)     { return v<0?'neg':v<400?'warn-text':'pos'; }
  function surplusCardClass(v) { return v<0?'card-neg':v<400?'card-warn':'card-pos'; }

  // ══════════════════════════════════════════════════════════
  // ROOT RENDER
  // ══════════════════════════════════════════════════════════
  function renderApp() {
    const root=document.getElementById('app');
    const tabs=[
      {id:'bycheck', icon:'💳',label:'By Check'},
      {id:'overview',icon:'📋',label:'Overview'},
      {id:'combined',icon:'🏠',label:'Household'},
      {id:'cc',      icon:'💰',label:'Cards'},
      {id:'streaks', icon:'🔥',label:'Streaks'},
      {id:'stats',   icon:'📊',label:'Stats'},
      {id:'setup',   icon:'⚙️',label:'Setup'},
    ];
    root.innerHTML=`
      <header class="hh-header">
        <div class="hh-header-inner">
          <div class="hh-logo">🏡 HomeFlow</div>
          <div class="hh-date">${new Date().toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}</div>
        </div>
      </header>
      <nav class="hh-nav" id="hhNav">
        ${tabs.map(t=>`<button class="hh-tab ${t.id===_tab?'active':''}" data-tab="${t.id}"><span class="hh-tab-icon">${t.icon}</span><span class="hh-tab-label">${t.label}</span></button>`).join('')}
      </nav>
      <main class="hh-content" id="hhContent">${renderTab(_tab)}</main>`;
    bindNav(); bindTab(_tab);
  }

  function renderTab(t){
    switch(t){
      case 'bycheck': return renderByCheck();
      case 'overview':return renderOverview();
      case 'combined':return renderCombined();
      case 'cc':      return renderCC();
      case 'streaks': return renderStreaks();
      case 'stats':   return renderStats();
      case 'setup':   return renderSetup();
      default:return '';
    }
  }
  function bindNav(){
    document.getElementById('hhNav').addEventListener('click',e=>{
      const btn=e.target.closest('.hh-tab'); if(!btn)return;
      _tab=btn.dataset.tab;
      if(_tab==='bycheck')_checkIdx=upcomingIdx();
      refresh();
      btn.scrollIntoView({behavior:'smooth',block:'nearest',inline:'center'});
    });
  }
  function bindTab(t){
    switch(t){
      case 'bycheck': bindByCheck();  break;
      case 'overview':bindOverview(); break;
      case 'combined':break;
      case 'cc':      bindCC();       break;
      case 'streaks': bindStreaks();  break;
      case 'setup':   bindSetup();    break;
    }
  }

  // ══════════════════════════════════════════════════════════
  // BY CHECK
  // ══════════════════════════════════════════════════════════
  function renderByCheck(){
    const {checks,cfg}=plan();
    if(!checks.length)return '<p class="empty">No checks.</p>';
    if(_checkIdx>=checks.length)_checkIdx=0;
    const c=checks[_checkIdx];
    const paidSet=new Set(c.paidExpenses);
    const paidAmt=c.expenses.filter(e=>paidSet.has(e.occId)).reduce((s,e)=>s+e.amount,0);
    const totalIn=c.grossIncome+c.rentalIncome;
    const sCls=surplusCardClass(c.surplus);
    const isActual=(c.grossIncome!==c.estimatedIncome);

    const groups={};
    for(const e of c.expenses){if(!groups[e.category])groups[e.category]=[];groups[e.category].push(e);}
    const catOrder=['Housing','Insurance','Credit Card','Auto','Utilities','Health','Other'];
    const sortedCats=[...catOrder.filter(k=>groups[k]),...Object.keys(groups).filter(k=>!catOrder.includes(k))];

    return `
      <div class="bc-wrap">
        <div class="spouse-filter">
          ${['all','s1','s2'].map(f=>{
            const sp=cfg.spouses.find(s=>s.id===f);
            const lbl=f==='all'?'All Checks':(sp?sp.name:f);
            return `<button class="sf-btn ${_filterSpouse===f?'active':''} ${f==='s1'?'sf-s1':f==='s2'?'sf-s2':''}" data-filter="${f}">${lbl}</button>`;
          }).join('')}
        </div>

        <div class="bc-nav">
          <button class="hh-nav-btn" id="prevC" ${_checkIdx===0?'disabled':''}>‹</button>
          <div class="bc-head">
            <div class="bc-date">${HH.fmtShort(c.date)}</div>
            <div class="bc-who"><span class="spouse-dot ${c.color}"></span>${c.spouseName}</div>
            <div class="bc-sub">Check ${_checkIdx+1} of ${checks.length}</div>
          </div>
          <button class="hh-nav-btn" id="nextC" ${_checkIdx>=checks.length-1?'disabled':''}>›</button>
        </div>

        <select id="jumpSel" class="hh-select small">
          ${checks.map((ch,i)=>`<option value="${i}" ${i===_checkIdx?'selected':''}>${HH.fmtShort(ch.date)} — ${ch.spouseName} (${ch.expenses.length} bills)</option>`).join('')}
        </select>

        ${!c.isS2?`
        <div class="actual-income-row">
          <div class="actual-income-label">
            <span>💵 Actual Income</span>
            ${isActual?`<span class="actual-badge">Actual: ${HH.fmtMoney(c.grossIncome)}</span>`:`<span class="est-badge">Est: ${HH.fmtMoney(c.estimatedIncome)}</span>`}
          </div>
          <div class="actual-income-inputs">
            <input type="number" id="actualIncomeAmt" class="hh-input" placeholder="${c.estimatedIncome}" value="${isActual?c.grossIncome:''}" min="0" step="0.01">
            <button class="hh-btn-sm" id="setActualIncome">Set</button>
            ${isActual?`<button class="hh-btn-sm ghost" id="clearActualIncome">Reset</button>`:''}
          </div>
        </div>`:''}

        <div class="rental-row">
          <div class="rental-label">
            <span>🏘 Rental Income</span>
            ${c.rentalIncome>0?`<span class="rental-badge">${HH.fmtMoney(c.rentalIncome)} logged</span>`:`<span class="rental-est">est. ${HH.fmtMoney(cfg.rentalEstimate)}</span>`}
          </div>
          <div class="rental-inputs">
            <input type="number" id="rentalAmt" class="hh-input" placeholder="${cfg.rentalEstimate}" min="0" step="1">
            <button class="hh-btn-sm" id="addRental">Add</button>
            <button class="hh-btn-sm ghost" id="setRental">Set</button>
          </div>
        </div>

        ${c.surplus<cfg.surplusWarning?`
          <div class="alert-box ${c.surplus<0?'alert-neg':'alert-warn'}">
            ${c.surplus<0?'🔴 Deficit':'⚠️ Low surplus'}: ${HH.fmtMoney(c.surplus)} — ${c.expenses.length} bills this check
          </div>`:''}

        <div class="bc-cards">
          <div class="bc-card card-green">
            <div class="bc-lbl">Income</div>
            <div class="bc-val">${HH.fmtMoney(totalIn)}</div>
            ${c.rentalIncome>0?`<div class="bc-sub">+${HH.fmtMoney(c.rentalIncome)} rental</div>`:''}
          </div>
          <div class="bc-card card-red">
            <div class="bc-lbl">Bills</div>
            <div class="bc-val">${HH.fmtMoney(c.totalExpenses)}</div>
            <div class="bc-sub">${c.expenses.length} items</div>
          </div>
          ${c.isS2?`
          <div class="bc-card card-amber">
            <div class="bc-lbl">Living</div>
            <div class="bc-val">${HH.fmtMoney(c.living+c.extraTotal)}</div>
            <div class="bc-sub">food·gas·out${c.extraTotal>0?'+extras':''}</div>
          </div>`:
          `<div class="bc-card card-dim"><div class="bc-lbl">Living</div><div class="bc-val dim">—</div><div class="bc-sub">on S2 checks</div></div>`}
          <div class="bc-card ${sCls}">
            <div class="bc-lbl">Left Over</div>
            <div class="bc-val">${HH.fmtMoney(c.surplus)}</div>
          </div>
        </div>

        <div class="paid-track">
          <div class="paid-track-lbl"><span>Bills Paid</span><span>${HH.fmtMoney(paidAmt)} / ${HH.fmtMoney(c.totalExpenses)}</span></div>
          <div class="paid-bar"><div class="paid-fill" style="width:${c.totalExpenses>0?Math.min(100,paidAmt/c.totalExpenses*100):0}%"></div></div>
        </div>

        <!-- Expenses by category -->
        ${c.expenses.length===0
          ?'<div class="empty">No bills this check 🎉</div>'
          :sortedCats.map(cat=>{
            const items=groups[cat]; if(!items?.length)return '';
            const groupTotal=items.reduce((s,e)=>s+e.amount,0);
            return `
              <div class="exp-group">
                <div class="exp-group-hdr">${catBadge(cat)}<span class="exp-group-total">${HH.fmtMoney(groupTotal)}</span></div>
                ${items.map(e=>{
                  const paid=paidSet.has(e.occId);
                  const splitLabel=e.isSplit?`<span class="split-badge">Split ${e.splitPart==='A'?'½A':'½B'} · other: ${HH.fmtMoney(e.siblingAmount)}</span>`:'';
                  const movedLabel=e.movedManually&&!e.isSplit?`<span class="moved-badge">Moved</span>`:'';
                  return `
                    <div class="exp-row ${paid?'exp-paid':''}">
                      <label class="exp-ck">
                        <input type="checkbox" class="exp-cb" data-check="${c.id}" data-occ="${e.occId}" ${paid?'checked':''}>
                      </label>
                      <div class="exp-info">
                        <div class="exp-name">${e.name} ${splitLabel} ${movedLabel}</div>
                        <div class="exp-meta">Due ${HH.fmtShort(e.dueDate)}</div>
                      </div>
                      <div class="exp-amt ${paid?'amt-paid':''}">${HH.fmtMoney(e.amount)}</div>
                      <div class="exp-actions">
                        ${e.canUndo?`<button class="undo-btn" data-undo="${e.undoOccId}" title="Undo move/split">↩</button>`:''}
                        <button class="move-btn" data-occ="${e.occId}" data-expamt="${e.isSplit?e.amount:(c.expenses.find(x=>x.occId===e.occId)||e).amount}" data-fullamt="${e.isSplit?(e.amount+(e.siblingAmount||0)):e.amount}" title="Move or split">↕</button>
                      </div>
                    </div>`;
                }).join('')}
              </div>`;
          }).join('')}

        <!-- Move / Split modal -->
        <div id="moveModal" class="hh-modal hidden">
          <div class="hh-modal-box">
            <div class="hh-modal-title" id="moveModalTitle">Move Bill</div>
            <div id="moveModalContent"></div>
            <button class="hh-btn ghost" id="closeMoveModal">Cancel</button>
          </div>
        </div>

        ${c.isS2?`
          <div class="sec-title">Living Expenses</div>
          <div class="living-grid">
            <div class="living-item"><span>🛒 Groceries</span><span>${HH.fmtMoney(cfg.living.groceries||0)}</span></div>
            <div class="living-item"><span>🍽 Eating Out</span><span>${HH.fmtMoney(cfg.living.eatingOut||0)}</span></div>
            <div class="living-item"><span>⛽ Gas</span><span>${HH.fmtMoney(cfg.living.gas||0)}</span></div>
            <div class="living-item"><span>🗂 Misc</span><span>${HH.fmtMoney(cfg.living.misc||0)}</span></div>
          </div>`:''}

        <div class="sec-title">Extra Expenses</div>
        <div class="extra-form">
          <input type="text"   id="exDesc" class="hh-input" placeholder="Description">
          <div class="extra-row">
            <input type="number" id="exAmt" class="hh-input" placeholder="Amount" min="0" step="0.01">
            <select id="exCat" class="hh-select">
              <option>Other</option><option>Food</option><option>Home</option>
              <option>Medical</option><option>Auto</option><option>Entertainment</option>
            </select>
          </div>
          <button class="hh-btn" id="addExtraBtn">+ Log</button>
        </div>
        ${c.extraItems.length>0?`
          <div class="extra-list">
            ${c.extraItems.map(item=>`
              <div class="extra-item">
                <div><div class="ei-desc">${item.desc}</div><div class="ei-cat">${item.category}</div></div>
                <div class="ei-right"><span class="neg">${HH.fmtMoney(item.amount)}</span>
                  <button class="del-btn" data-eid="${item.id}">✕</button></div>
              </div>`).join('')}
            <div class="extra-total"><span>Extra total</span><span class="neg">${HH.fmtMoney(c.extraTotal)}</span></div>
          </div>`:'<div class="empty-sm">No extras logged.</div>'}

        <div class="sec-title">Notes</div>
        <textarea id="checkNotes" class="hh-textarea">${c.notes}</textarea>
        <button class="hh-btn ghost" id="saveNotes">Save Notes</button>
      </div>`;
  }

  // ── Move / Split modal content builder ───────────────────────
  function buildMoveModalContent(occId, fullAmt, checks, currentCheckId) {
    const nearby=checks.slice(Math.max(0,_checkIdx-4),_checkIdx+6).filter(ch=>ch.id!==currentCheckId);
    return `
      <!-- TAB SWITCHER -->
      <div class="modal-tabs">
        <button class="modal-tab active" data-mtab="move">Move Entirely</button>
        <button class="modal-tab" data-mtab="split">Split Between 2 Checks</button>
      </div>

      <!-- MOVE PANEL -->
      <div id="mtab-move" class="modal-panel">
        <p class="modal-hint">Bill moves entirely to the selected check.</p>
        ${nearby.map(ch=>`
          <button class="hh-move-opt" data-occ="${occId}" data-cid="${ch.id}">
            ${HH.fmtShort(ch.date)} — ${ch.spouseName}
          </button>`).join('')}
      </div>

      <!-- SPLIT PANEL -->
      <div id="mtab-split" class="modal-panel hidden">
        <p class="modal-hint">Split ${HH.fmtMoney(fullAmt)} across two checks.</p>
        <label class="hh-label">Amount on this check (Check A)</label>
        <input type="number" id="splitAmtA" class="hh-input" value="${(fullAmt/2).toFixed(2)}" min="0.01" step="0.01" max="${fullAmt}">
        <div class="split-remainder">Remainder on Check B: <strong id="splitAmtB">${HH.fmtMoney(fullAmt/2)}</strong></div>
        <label class="hh-label">Check B (receives remainder)</label>
        <select id="splitCheckB" class="hh-select">
          ${nearby.map(ch=>`<option value="${ch.id}">${HH.fmtShort(ch.date)} — ${ch.spouseName}</option>`).join('')}
        </select>
        <button class="hh-btn" id="confirmSplitBtn" data-occ="${occId}" data-fullamt="${fullAmt}" data-checka="${currentCheckId}">Confirm Split</button>
      </div>`;
  }

  function bindByCheck(){
    const {checks,cfg}=plan();
    const c=checks[_checkIdx]; if(!c)return;

    document.querySelectorAll('.sf-btn').forEach(btn=>{
      btn.addEventListener('click',()=>{
        _filterSpouse=btn.dataset.filter;
        const filtered=checks.filter(ch=>_filterSpouse==='all'||ch.spouseId===_filterSpouse);
        if(filtered.length){
          const today=HH.fmtDate(new Date());
          const fi=filtered.findIndex(ch=>ch.date>=today);
          _checkIdx=checks.indexOf(fi>=0?filtered[fi]:filtered[0]);
        }
        refresh();
      });
    });

    document.getElementById('prevC')?.addEventListener('click',()=>{
      let i=_checkIdx-1;
      if(_filterSpouse!=='all')while(i>=0&&checks[i].spouseId!==_filterSpouse)i--;
      if(i>=0){_checkIdx=i;refresh();}
    });
    document.getElementById('nextC')?.addEventListener('click',()=>{
      let i=_checkIdx+1;
      if(_filterSpouse!=='all')while(i<checks.length&&checks[i].spouseId!==_filterSpouse)i++;
      if(i<checks.length){_checkIdx=i;refresh();}
    });
    document.getElementById('jumpSel')?.addEventListener('change',e=>{_checkIdx=parseInt(e.target.value);refresh();});

    // Actual income
    document.getElementById('setActualIncome')?.addEventListener('click',()=>{
      const v=parseFloat(document.getElementById('actualIncomeAmt').value);
      if(!isNaN(v)&&v>0){HH.setActualIncome(c.id,v);refresh();}
    });
    document.getElementById('clearActualIncome')?.addEventListener('click',()=>{HH.setActualIncome(c.id,null);refresh();});

    // Rental
    document.getElementById('addRental')?.addEventListener('click',()=>{
      const v=parseFloat(document.getElementById('rentalAmt').value);
      if(v>0){HH.addRental(c.id,v);refresh();}
    });
    document.getElementById('setRental')?.addEventListener('click',()=>{
      const v=parseFloat(document.getElementById('rentalAmt').value);
      if(!isNaN(v)&&v>=0){HH.setRental(c.id,v);refresh();}
    });

    // Paid checkboxes
    document.querySelectorAll('.exp-cb').forEach(cb=>{
      cb.addEventListener('change',()=>{HH.togglePaid(cb.dataset.check,cb.dataset.occ);refresh();});
    });

    // Undo buttons
    document.querySelectorAll('.undo-btn').forEach(btn=>{
      btn.addEventListener('click',()=>{HH.undoMove(btn.dataset.undo);refresh();});
    });

    // Move / Split modal
    document.querySelectorAll('.move-btn').forEach(btn=>{
      btn.addEventListener('click',()=>{
        const occId=btn.dataset.occ;
        const fullAmt=parseFloat(btn.dataset.fullamt)||parseFloat(btn.dataset.expamt)||0;
        const modal=document.getElementById('moveModal');
        document.getElementById('moveModalTitle').textContent='Move or Split: '+
          (c.expenses.find(e=>e.occId===occId)?.name||'Bill');
        document.getElementById('moveModalContent').innerHTML=
          buildMoveModalContent(occId,fullAmt,checks,c.id);
        modal.classList.remove('hidden');
        bindMoveModalEvents(occId,fullAmt,c.id,checks);
      });
    });
    document.getElementById('closeMoveModal')?.addEventListener('click',()=>
      document.getElementById('moveModal').classList.add('hidden'));

    // Extra items
    document.getElementById('addExtraBtn')?.addEventListener('click',()=>{
      const desc=document.getElementById('exDesc').value.trim();
      const amt=parseFloat(document.getElementById('exAmt').value);
      const cat=document.getElementById('exCat').value;
      if(!desc||!amt||amt<=0)return;
      HH.addExtraItem(c.id,{desc,amount:amt,category:cat});refresh();
    });
    document.querySelectorAll('.del-btn[data-eid]').forEach(btn=>{
      btn.addEventListener('click',()=>{HH.deleteExtraItem(c.id,parseInt(btn.dataset.eid));refresh();});
    });

    document.getElementById('saveNotes')?.addEventListener('click',()=>{
      HH.saveNotes(c.id,document.getElementById('checkNotes').value);showToast('Notes saved');
    });
  }

  function bindMoveModalEvents(occId,fullAmt,currentCheckId,checks){
    // Tab switching
    document.querySelectorAll('.modal-tab').forEach(tab=>{
      tab.addEventListener('click',()=>{
        document.querySelectorAll('.modal-tab').forEach(t=>t.classList.remove('active'));
        tab.classList.add('active');
        const target=tab.dataset.mtab;
        document.querySelectorAll('.modal-panel').forEach(p=>{
          p.classList.toggle('hidden',!p.id.endsWith(target));
        });
      });
    });

    // Move option buttons
    document.querySelectorAll('.hh-move-opt').forEach(ob=>{
      ob.addEventListener('click',()=>{
        HH.moveBill(ob.dataset.occ,ob.dataset.cid);
        document.getElementById('moveModal').classList.add('hidden');
        refresh();
      });
    });

    // Split: live remainder update
    document.getElementById('splitAmtA')?.addEventListener('input',e=>{
      const a=parseFloat(e.target.value)||0;
      const b=Math.max(0,Math.round((fullAmt-a)*100)/100);
      const el=document.getElementById('splitAmtB');
      if(el)el.textContent=HH.fmtMoney(b);
    });

    // Split: confirm
    document.getElementById('confirmSplitBtn')?.addEventListener('click',()=>{
      const amtA=parseFloat(document.getElementById('splitAmtA').value)||0;
      const checkBId=document.getElementById('splitCheckB').value;
      if(!checkBId||amtA<=0||amtA>=fullAmt){showToast('Enter a valid split amount');return;}
      HH.splitBill(occId,currentCheckId,amtA,checkBId,fullAmt);
      document.getElementById('moveModal').classList.add('hidden');
      refresh();
    });
  }

  // ══════════════════════════════════════════════════════════
  // OVERVIEW
  // ══════════════════════════════════════════════════════════
  function renderOverview(){
    const {checks}=plan(), today=HH.fmtDate(new Date());
    const byMonth={};
    checks.forEach(c=>{const mo=c.date.substring(0,7);if(!byMonth[mo])byMonth[mo]=[];byMonth[mo].push(c);});
    return `
      <div class="ov-wrap">
        <div class="sec-title">All Checks <span class="badge">${checks.length}</span></div>
        <div class="ov-table-wrap">
          <table class="ov-table">
            <thead><tr><th>Date</th><th>Who</th><th>Income</th><th>Bills</th><th>Rental</th><th>Left Over</th></tr></thead>
            <tbody>
              ${Object.entries(byMonth).map(([mo,mch])=>{
                const moS=mch.reduce((s,c)=>s+c.surplus,0);
                const moI=mch.reduce((s,c)=>s+c.grossIncome+c.rentalIncome,0);
                return `
                  <tr class="mo-row"><td colspan="2">${fmtMo(mo)}</td><td class="pos">${HH.fmtMoney(moI)}</td><td></td><td></td><td class="${moS>=0?'pos':'neg'}">${HH.fmtMoney(moS)}</td></tr>
                  ${mch.map(c=>`
                    <tr class="ov-row ${c.date===today?'today-row':''}" data-idx="${checks.indexOf(c)}">
                      <td>${HH.fmtShort(c.date)}</td>
                      <td><span class="spouse-dot-sm ${c.color}"></span>${c.spouseName.replace('Spouse ','S')}</td>
                      <td class="pos">${HH.fmtMoney(c.grossIncome)}</td>
                      <td class="neg">${HH.fmtMoney(c.totalExpenses)}<span class="dim-sm"> (${c.expenses.length})</span></td>
                      <td class="${c.rentalIncome>0?'pos':''}">${c.rentalIncome>0?HH.fmtMoney(c.rentalIncome):'—'}</td>
                      <td class="${surplusClass(c.surplus)}">${HH.fmtMoney(c.surplus)}</td>
                    </tr>`).join('')}`;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>`;
  }
  function bindOverview(){
    document.querySelectorAll('.ov-row').forEach(r=>{
      r.addEventListener('click',()=>{_checkIdx=parseInt(r.dataset.idx);_tab='bycheck';refresh();});
    });
  }
  function fmtMo(mo){const[y,m]=mo.split('-');return new Date(y,m-1,1).toLocaleDateString('en-US',{month:'long',year:'numeric'});}

  // ══════════════════════════════════════════════════════════
  // COMBINED HOUSEHOLD
  // ══════════════════════════════════════════════════════════
  function renderCombined(){
    const {checks,cfg}=plan();
    const stats=HH.monthlyStats(checks);
    const s1=cfg.spouses.find(s=>s.schedule==='biweekly');
    const s2=cfg.spouses.find(s=>s.schedule==='semimonthly');
    const catTotals={};
    cfg.expenses.filter(e=>e.active).forEach(e=>{if(!catTotals[e.category])catTotals[e.category]=[];catTotals[e.category].push(e);});
    const grandTotal=cfg.expenses.filter(e=>e.active).reduce((s,e)=>s+e.amount,0);
    return `
      <div class="comb-wrap">
        <div class="sec-title">Household Summary</div>
        <div class="spouse-cards">
          <div class="spouse-card amber">
            <div class="sc-name">${s1?.name||'Spouse 1'}</div>
            <div class="sc-amount">${HH.fmtMoney(s1?.amount||0)}</div>
            <div class="sc-freq">Every 2 weeks (est.)</div>
            <div class="sc-annual">≈ ${HH.fmtMoney((s1?.amount||0)*26)}/yr</div>
          </div>
          <div class="spouse-card rose">
            <div class="sc-name">${s2?.name||'Spouse 2'}</div>
            <div class="sc-amount">${HH.fmtMoney(s2?.amount||0)}</div>
            <div class="sc-freq">7th &amp; 21st monthly</div>
            <div class="sc-annual">≈ ${HH.fmtMoney((s2?.amount||0)*24)}/yr</div>
          </div>
        </div>
        <div class="rental-note">🏘 Rental income: <strong>${HH.fmtMoney(cfg.rentalEstimate)}/mo estimated</strong> — added manually per check</div>
        <div class="sec-title">Monthly Bills by Category</div>
        ${Object.entries(catTotals).sort((a,b)=>b[1].reduce((s,e)=>s+e.amount,0)-a[1].reduce((s,e)=>s+e.amount,0)).map(([cat,items])=>{
          const sum=items.reduce((s,e)=>s+e.amount,0),pct=Math.round((sum/grandTotal)*100);
          return `<div class="cat-row">
            <div class="cat-row-hdr">${catBadge(cat)}<div class="cat-row-bar-wrap"><div class="cat-row-bar" style="width:${pct}%"></div></div><span class="cat-row-amt">${HH.fmtMoney(sum)}</span></div>
            <div class="cat-items">${items.map(e=>`<span class="cat-item-pill">Day ${e.dueDay}: ${e.name} <strong>${HH.fmtMoney(e.amount)}</strong></span>`).join('')}</div>
          </div>`;
        }).join('')}
        <div class="sec-title">Monthly Breakdown</div>
        <div class="monthly-table-wrap">
          <table class="monthly-table">
            <thead><tr><th>Month</th><th>Income</th><th>Bills</th><th>Living</th><th>Surplus</th></tr></thead>
            <tbody>
              ${Object.entries(stats).slice(0,18).map(([mo,s])=>`
                <tr><td>${fmtMo(mo)}</td><td class="pos">${HH.fmtMoney(s.income)}</td><td class="neg">${HH.fmtMoney(s.expenses)}</td><td>${HH.fmtMoney(s.living)}</td><td class="${surplusClass(s.surplus)}">${HH.fmtMoney(s.surplus)}</td></tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>`;
  }

  // ══════════════════════════════════════════════════════════
  // CARDS / DEBT
  // ══════════════════════════════════════════════════════════
  function renderCC(){
    const {cfg}=plan();
    const ccExps=cfg.expenses.filter(e=>e.active&&e.balance!=null&&e.balance>0&&e.category==='Credit Card');
    const totalBal=ccExps.reduce((s,e)=>s+e.balance,0);
    const totalMin=ccExps.reduce((s,e)=>s+e.amount,0);
    const result=HH.calcPayoff(cfg.expenses,_ccStrat,_ccExtra);
    const step=Math.max(1,Math.floor(result.history.length/48));
    const pts=result.history.filter((_,i)=>i%step===0||i===result.history.length-1);
    const dfLabel=HH.parseDate(result.freeDate).toLocaleDateString('en-US',{month:'long',year:'numeric'});
    const sorted=[...ccExps];
    if(_ccStrat==='avalanche')sorted.sort((a,b)=>(b.apr||0)-(a.apr||0));
    else sorted.sort((a,b)=>a.balance-b.balance);
    return `
      <div class="cc-wrap">
        <div class="sec-title">Credit Cards</div>
        <div class="cc-cards">
          ${ccExps.map(e=>{const pct=Math.min(100,(e.balance/(totalBal||1))*100);return `
            <div class="cc-card">
              <div class="cc-card-top"><span class="cc-card-name">${e.name}</span><span class="cc-bal neg">${HH.fmtMoney(e.balance)}</span></div>
              <div class="cc-prog"><div class="cc-prog-fill" style="width:${pct}%"></div></div>
              <div class="cc-card-sub">Min: ${HH.fmtMoney(e.amount)}/mo${e.apr?` · ${e.apr}% APR`:''}</div>
            </div>`;}).join('')}
        </div>
        <div class="cc-totals"><span>Total: <strong class="neg">${HH.fmtMoney(totalBal)}</strong></span><span>Min/mo: <strong>${HH.fmtMoney(totalMin)}</strong></span></div>
        <div class="sec-title">Payoff Strategy</div>
        <div class="strat-toggle">
          <button class="strat-btn ${_ccStrat==='avalanche'?'active':''}" data-strat="avalanche"><span class="strat-icon">🏔</span><span class="strat-lbl">Avalanche</span><span class="strat-sub">Highest APR first</span></button>
          <button class="strat-btn ${_ccStrat==='snowball'?'active':''}" data-strat="snowball"><span class="strat-icon">⛄</span><span class="strat-lbl">Snowball</span><span class="strat-sub">Lowest balance first</span></button>
        </div>
        <div class="cc-extra-row">
          <label class="hh-label">Extra monthly payment (above minimums)</label>
          <div class="cc-extra-inputs"><input type="number" id="ccExtra" class="hh-input" value="${_ccExtra}" min="0" step="25" placeholder="$0"><button class="hh-btn-sm" id="ccCalc">Recalculate</button></div>
        </div>
        <div class="cc-result">
          <div class="cc-result-lbl">Debt-Free Date</div>
          <div class="cc-result-val">${dfLabel}</div>
          <div class="cc-result-sub">${result.months} months · ${_ccStrat}${_ccExtra>0?` · +${HH.fmtMoney(_ccExtra)}/mo extra`:''}</div>
        </div>
        <div class="sec-title">Balance Over Time</div>
        <div class="cc-chart">
          ${pts.map(p=>{const h=Math.max(2,(p.total/(totalBal||1))*100);const mo=HH.addMonths(new Date(),p.month).toLocaleDateString('en-US',{month:'short',year:'2-digit'});return `<div class="cc-bar-col" title="${mo}: ${HH.fmtMoney(p.total)}"><div class="cc-bar-fill" style="height:${h}%"></div></div>`;}).join('')}
        </div>
        <div class="cc-chart-lbl"><span>${HH.fmtMoney(totalBal)}</span><span style="margin-left:auto">${dfLabel}</span></div>
        <div class="sec-title">Payoff Order</div>
        <div class="cc-order">
          ${sorted.map((e,i)=>`<div class="cc-order-item"><div class="cc-order-num ${i===0?'first-num':''}">${i+1}</div><div class="cc-order-info"><div class="cc-order-name">${e.name}</div><div class="cc-order-meta">${HH.fmtMoney(e.balance)}${e.apr?` · ${e.apr}% APR`:''} · min ${HH.fmtMoney(e.amount)}/mo</div></div>${i===0?'<span class="first-badge">Pay first</span>':''}</div>`).join('')}
        </div>
        <div class="sec-title">Set APR</div>
        <div class="apr-list">
          ${ccExps.map(e=>`<div class="apr-row"><span class="apr-name">${e.name}</span><div class="apr-inp-wrap"><input type="number" class="hh-input apr-inp" data-id="${e.id}" value="${e.apr||0}" min="0" step="0.1" style="width:85px;margin:0"><span class="apr-pct">%</span></div></div>`).join('')}
          <button class="hh-btn ghost" id="saveAprBtn" style="margin-top:8px">Save APRs &amp; Recalculate</button>
        </div>
      </div>`;
  }
  function bindCC(){
    document.querySelectorAll('.strat-btn').forEach(btn=>{btn.addEventListener('click',()=>{_ccStrat=btn.dataset.strat;refresh();});});
    document.getElementById('ccCalc')?.addEventListener('click',()=>{_ccExtra=parseFloat(document.getElementById('ccExtra').value)||0;refresh();});
    document.getElementById('ccExtra')?.addEventListener('keydown',e=>{if(e.key==='Enter'){_ccExtra=parseFloat(e.target.value)||0;refresh();}});
    document.getElementById('saveAprBtn')?.addEventListener('click',()=>{
      const cfg=HH.getConfig();
      document.querySelectorAll('.apr-inp').forEach(inp=>{const exp=cfg.expenses.find(e=>e.id===inp.dataset.id);if(exp)exp.apr=parseFloat(inp.value)||0;});
      HH.saveConfig(cfg);showToast('APRs saved');refresh();
    });
  }

  // ══════════════════════════════════════════════════════════
  // STREAKS
  // ══════════════════════════════════════════════════════════
  function renderStreaks(){
    const ns=HH.getNoSpend(),s=HH.streakCount(ns),today=HH.fmtDate(new Date());
    const mos=[-1,0].map(m=>{const d=new Date();d.setDate(1);d.setMonth(d.getMonth()+m);return d;});
    return `
      <div class="str-wrap">
        <div class="str-hero"><div class="str-flame">🔥</div><div class="str-num">${s}</div><div class="str-lbl">Day Streak</div></div>
        <div class="str-tip">Tap a day to mark it no-spend</div>
        ${mos.map(mo=>renderCal(mo,ns,today)).join('')}
        <div class="str-stats">
          <div class="stat-pill"><span class="sp-l">Total No-Spend</span><span class="sp-v">${ns.size}</span></div>
          <div class="stat-pill"><span class="sp-l">This Month</span><span class="sp-v">${[...ns].filter(d=>d.startsWith(today.substring(0,7))).length}</span></div>
        </div>
      </div>`;
  }
  function renderCal(mo,ns,today){
    const y=mo.getFullYear(),m=mo.getMonth(),days=new Date(y,m+1,0).getDate(),dow=new Date(y,m,1).getDay();
    let cells='';
    for(let i=0;i<dow;i++)cells+='<div class="cal-c empty"></div>';
    for(let d=1;d<=days;d++){
      const ds=`${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      cells+=`<div class="cal-c ${ns.has(ds)?'ns':''} ${ds===today?'cal-today':''} ${ds>today?'future':''}" data-date="${ds}">${d}</div>`;
    }
    return `<div class="cal-mo"><div class="cal-mo-lbl">${mo.toLocaleDateString('en-US',{month:'long',year:'numeric'})}</div><div class="cal-dows">${['S','M','T','W','T','F','S'].map(d=>`<div class="cal-dow">${d}</div>`).join('')}</div><div class="cal-grid">${cells}</div></div>`;
  }
  function bindStreaks(){
    document.querySelectorAll('.cal-c[data-date]').forEach(c=>{
      if(c.classList.contains('future'))return;
      c.addEventListener('click',()=>{HH.toggleNoSpend(c.dataset.date);refresh();});
    });
  }

  // ══════════════════════════════════════════════════════════
  // STATS
  // ══════════════════════════════════════════════════════════
  function renderStats(){
    const {checks}=plan();
    const s=HH.computeStats(checks);
    const tI=checks.reduce((x,c)=>x+c.grossIncome+c.rentalIncome,0);
    const tE=checks.reduce((x,c)=>x+c.totalExpenses,0);
    const tL=checks.reduce((x,c)=>x+c.living+c.extraTotal,0);
    const tR=checks.reduce((x,c)=>x+c.rentalIncome,0);
    const byMonth={};
    checks.forEach(c=>{const mo=c.date.substring(0,7);byMonth[mo]=(byMonth[mo]||0)+c.surplus;});
    const mos=Object.entries(byMonth).slice(0,24);
    const maxA=Math.max(...mos.map(([,v])=>Math.abs(v)),1);
    return `
      <div class="stats-wrap">
        <div class="sec-title">Plan Summary</div>
        <div class="stats-grid">
          <div class="stat-card"><div class="sc-l">Total Income</div><div class="sc-v pos">${HH.fmtMoney(tI)}</div><div class="sc-s">${checks.length} checks</div></div>
          <div class="stat-card"><div class="sc-l">Total Bills</div><div class="sc-v neg">${HH.fmtMoney(tE)}</div></div>
          <div class="stat-card"><div class="sc-l">Rental Income</div><div class="sc-v pos">${HH.fmtMoney(tR)}</div></div>
          <div class="stat-card"><div class="sc-l">Total Living</div><div class="sc-v">${HH.fmtMoney(tL)}</div></div>
          <div class="stat-card ${s.net>=0?'sc-green':'sc-red'}"><div class="sc-l">Net Balance</div><div class="sc-v">${HH.fmtMoney(s.net)}</div></div>
          <div class="stat-card sc-red"><div class="sc-l">Deficit Checks</div><div class="sc-v">${s.negCount}/${checks.length}</div></div>
        </div>
        <div class="st-hl">
          <div class="hl-card best"><div class="hl-l">🏆 Best</div><div class="hl-d">${s.best?HH.fmtShort(s.best.date):'—'}</div><div class="hl-v pos">${s.best?HH.fmtMoney(s.best.surplus):'—'}</div></div>
          <div class="hl-card worst"><div class="hl-l">💔 Worst</div><div class="hl-d">${s.worst?HH.fmtShort(s.worst.date):'—'}</div><div class="hl-v neg">${s.worst?HH.fmtMoney(s.worst.surplus):'—'}</div></div>
        </div>
        <div class="sec-title">Monthly Surplus</div>
        <div class="mo-chart">
          ${mos.map(([mo,v])=>{const pct=Math.max(2,(Math.abs(v)/maxA)*100);return `<div class="mc-col"><div class="mc-bw"><div class="mc-b ${v>=0?'mc-pos':'mc-neg'}" style="height:${pct}%" title="${fmtMo(mo)}: ${HH.fmtMoney(v)}"></div></div><div class="mc-l">${mo.substring(5)}</div></div>`;}).join('')}
        </div>
      </div>`;
  }

  // ══════════════════════════════════════════════════════════
  // SETUP
  // ══════════════════════════════════════════════════════════
  function renderSetup(){
    const subs=[{id:'expenses',label:'📋 Bills'},{id:'living',label:'🛒 Living'},{id:'income',label:'💵 Income'},{id:'settings',label:'⚙️ Settings'}];
    return `<div class="su-wrap"><div class="su-nav">${subs.map(s=>`<button class="su-btn ${s.id===_setupSub?'active':''}" data-sub="${s.id}">${s.label}</button>`).join('')}</div><div id="suContent">${renderSetupSub(_setupSub)}</div></div>`;
  }
  function renderSetupSub(sub){
    const cfg=HH.getConfig();
    switch(sub){case 'expenses':return renderSetupExpenses(cfg);case 'living':return renderSetupLiving(cfg);case 'income':return renderSetupIncome(cfg);case 'settings':return renderSetupSettings(cfg);default:return '';}
  }
  function renderSetupExpenses(cfg){
    const bycat={};
    for(const e of cfg.expenses){if(!bycat[e.category])bycat[e.category]=[];bycat[e.category].push(e);}
    return `
      <div class="su-sec">
        <div class="sec-title">All Bills <span class="badge">${cfg.expenses.filter(e=>e.active).length} active</span></div>
        ${Object.entries(bycat).map(([cat,items])=>`
          <div class="su-group">
            <div class="su-group-hdr">${catBadge(cat)}</div>
            ${items.map(e=>`
              <div class="su-item">
                <div class="su-item-info">
                  <span class="su-name ${!e.active?'inactive':''}">${e.name}</span>
                  <span class="su-meta">${HH.fmtMoney(e.amount)}/mo · Day ${e.dueDay}${e.balance!=null?' · Bal: '+HH.fmtMoney(e.balance):''}</span>
                </div>
                <div class="su-actions">
                  <button class="icon-btn toggle-exp" data-id="${e.id}">${e.active?'✅':'⭕'}</button>
                  <button class="icon-btn edit-exp"   data-id="${e.id}">✏️</button>
                  <button class="icon-btn del-exp"    data-id="${e.id}">🗑</button>
                </div>
              </div>`).join('')}
          </div>`).join('')}
        <div class="sec-title">Add Expense</div>
        <div class="su-form">
          <input type="text"   id="nName" class="hh-input" placeholder="Bill name">
          <input type="number" id="nAmt"  class="hh-input" placeholder="Amount" min="0" step="0.01">
          <input type="number" id="nDay"  class="hh-input" placeholder="Due day (1–31)" min="1" max="31">
          <select id="nCat" class="hh-select">${Object.keys(CAT_ICON).map(c=>`<option>${c}</option>`).join('')}</select>
          <input type="number" id="nBal" class="hh-input" placeholder="Balance (CC/loans, optional)">
          <button class="hh-btn" id="addExpBtn">+ Add</button>
        </div>
      </div>`;
  }
  function renderSetupLiving(cfg){
    const total=(cfg.living.groceries||0)+(cfg.living.eatingOut||0)+(cfg.living.gas||0)+(cfg.living.misc||0);
    return `
      <div class="su-sec">
        <div class="sec-title">Living Expenses (Spouse 2 checks only)</div>
        <div class="living-note">Deducted from every Spouse 2 check.</div>
        <div class="su-form">
          <label class="hh-label">🛒 Groceries</label><input type="number" id="lvGroc" class="hh-input" value="${cfg.living.groceries||0}" min="0" step="1">
          <label class="hh-label">🍽 Eating Out</label><input type="number" id="lvEat"  class="hh-input" value="${cfg.living.eatingOut||0}" min="0" step="1">
          <label class="hh-label">⛽ Gas</label><input type="number" id="lvGas"  class="hh-input" value="${cfg.living.gas||0}" min="0" step="1">
          <label class="hh-label">🗂 Misc</label><input type="number" id="lvMisc" class="hh-input" value="${cfg.living.misc||0}" min="0" step="1">
          <div class="living-total">Total per S2 check: <strong>${HH.fmtMoney(total)}</strong></div>
          <button class="hh-btn" id="saveLiving">Save</button>
        </div>
        <div class="sec-title">Rental Income Estimate</div>
        <div class="su-form">
          <label class="hh-label">Typical rental amount ($)</label>
          <input type="number" id="rentalEst" class="hh-input" value="${cfg.rentalEstimate||1050}" min="0" step="1">
          <button class="hh-btn" id="saveRental">Save</button>
        </div>
      </div>`;
  }
  function renderSetupIncome(cfg){
    const s1=cfg.spouses.find(s=>s.schedule==='biweekly')||cfg.spouses[0];
    const s2=cfg.spouses.find(s=>s.schedule==='semimonthly')||cfg.spouses[1];
    return `
      <div class="su-sec">
        <div class="sec-title">Spouse 1 — Biweekly (variable)</div>
        <div class="living-note">Spouse 1's income varies. This is the estimate used as default. Enter the actual amount per check in the By Check tab.</div>
        <div class="su-form">
          <label class="hh-label">Name</label><input type="text"   id="s1Name" class="hh-input" value="${s1?.name||'Spouse 1'}">
          <label class="hh-label">Estimated amount per check</label><input type="number" id="s1Amt"  class="hh-input" value="${s1?.amount||1000}" step="0.01">
          <label class="hh-label">Next check date</label><input type="date" id="s1Next" class="hh-input" value="${s1?.nextDate||'2026-06-11'}">
          <button class="hh-btn" id="saveS1">Save Spouse 1</button>
        </div>
        <div class="sec-title">Spouse 2 — Semi-Monthly (7th &amp; 21st)</div>
        <div class="su-form">
          <label class="hh-label">Name</label><input type="text"   id="s2Name" class="hh-input" value="${s2?.name||'Spouse 2'}">
          <label class="hh-label">Amount per check</label><input type="number" id="s2Amt"  class="hh-input" value="${s2?.amount||1790}" step="0.01">
          <button class="hh-btn" id="saveS2">Save Spouse 2</button>
        </div>
      </div>`;
  }
  function renderSetupSettings(cfg){
    return `
      <div class="su-sec">
        <div class="sec-title">Settings</div>
        <div class="su-form">
          <label class="hh-label">Surplus warning threshold ($)</label><input type="number" id="swarn"   class="hh-input" value="${cfg.surplusWarning||200}" min="0">
          <label class="hh-label">Plan end date</label><input type="date" id="planEnd" class="hh-input" value="${cfg.planEndDate}">
          <button class="hh-btn" id="saveSett">Save</button>
        </div>
        <div class="sec-title" style="color:var(--red)">Danger Zone</div>
        <button class="hh-btn danger" id="resetBtn">🗑 Reset All Data</button>
      </div>`;
  }

  function bindSetup(){
    document.querySelectorAll('.su-btn').forEach(btn=>{
      btn.addEventListener('click',()=>{
        _setupSub=btn.dataset.sub;
        document.querySelectorAll('.su-btn').forEach(b=>b.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById('suContent').innerHTML=renderSetupSub(_setupSub);
        bindSetupSub(_setupSub);
      });
    });
    bindSetupSub(_setupSub);
  }
  function bindSetupSub(sub){
    if(sub==='expenses'){
      document.querySelectorAll('.toggle-exp').forEach(btn=>{btn.addEventListener('click',()=>{const c=HH.getConfig(),e=c.expenses.find(x=>x.id===btn.dataset.id);if(e){e.active=!e.active;HH.saveConfig(c);refresh();}});});
      document.querySelectorAll('.edit-exp').forEach(btn=>{btn.addEventListener('click',()=>{const c=HH.getConfig(),e=c.expenses.find(x=>x.id===btn.dataset.id);if(!e)return;const v=parseFloat(prompt(`New amount for "${e.name}":`,e.amount));if(!isNaN(v)&&v>=0){e.amount=v;HH.saveConfig(c);refresh();}});});
      document.querySelectorAll('.del-exp').forEach(btn=>{btn.addEventListener('click',()=>{const c=HH.getConfig(),e=c.expenses.find(x=>x.id===btn.dataset.id);if(!e||!confirm(`Delete "${e.name}"?`))return;c.expenses=c.expenses.filter(x=>x.id!==btn.dataset.id);HH.saveConfig(c);refresh();});});
      document.getElementById('addExpBtn')?.addEventListener('click',()=>{
        const c=HH.getConfig();
        const name=document.getElementById('nName').value.trim(),amt=parseFloat(document.getElementById('nAmt').value),day=parseInt(document.getElementById('nDay').value),cat=document.getElementById('nCat').value,bal=parseFloat(document.getElementById('nBal').value)||null;
        if(!name||isNaN(amt)||isNaN(day)){showToast('Fill name, amount, and due day');return;}
        c.expenses.push({id:'h'+Date.now(),dueDay:day,name,category:cat,amount:amt,balance:bal,apr:0,active:true});
        HH.saveConfig(c);refresh();
      });
    }
    if(sub==='living'){
      document.getElementById('saveLiving')?.addEventListener('click',()=>{const c=HH.getConfig();c.living={groceries:parseFloat(document.getElementById('lvGroc').value)||0,eatingOut:parseFloat(document.getElementById('lvEat').value)||0,gas:parseFloat(document.getElementById('lvGas').value)||0,misc:parseFloat(document.getElementById('lvMisc').value)||0};HH.saveConfig(c);showToast('Saved');refresh();});
      document.getElementById('saveRental')?.addEventListener('click',()=>{const c=HH.getConfig();c.rentalEstimate=parseFloat(document.getElementById('rentalEst').value)||0;HH.saveConfig(c);showToast('Rental estimate saved');refresh();});
    }
    if(sub==='income'){
      document.getElementById('saveS1')?.addEventListener('click',()=>{const c=HH.getConfig(),s1=c.spouses.find(s=>s.schedule==='biweekly');if(!s1)return;s1.name=document.getElementById('s1Name').value||s1.name;s1.amount=parseFloat(document.getElementById('s1Amt').value)||s1.amount;s1.nextDate=document.getElementById('s1Next').value||s1.nextDate;HH.saveConfig(c);showToast('Spouse 1 saved');refresh();});
      document.getElementById('saveS2')?.addEventListener('click',()=>{const c=HH.getConfig(),s2=c.spouses.find(s=>s.schedule==='semimonthly');if(!s2)return;s2.name=document.getElementById('s2Name').value||s2.name;s2.amount=parseFloat(document.getElementById('s2Amt').value)||s2.amount;HH.saveConfig(c);showToast('Spouse 2 saved');refresh();});
    }
    if(sub==='settings'){
      document.getElementById('saveSett')?.addEventListener('click',()=>{const c=HH.getConfig();c.surplusWarning=parseFloat(document.getElementById('swarn').value)||0;c.planEndDate=document.getElementById('planEnd').value||c.planEndDate;HH.saveConfig(c);showToast('Saved');refresh();});
      document.getElementById('resetBtn')?.addEventListener('click',()=>{if(confirm('Reset ALL household budget data?')){HH.resetAll();showToast('Reset');refresh();}});
    }
  }

  function showToast(msg){
    const el=document.createElement('div');el.className='hh-toast';el.textContent=msg;
    document.body.appendChild(el);
    setTimeout(()=>el.classList.add('show'),30);
    setTimeout(()=>{el.classList.remove('show');setTimeout(()=>el.remove(),300);},2200);
  }

  return { renderApp, refresh };
})();

document.addEventListener('DOMContentLoaded', ()=>HHUI.renderApp());
