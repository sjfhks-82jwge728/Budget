// ============================================================
// HH_CORE.JS — Household Budget Tracker Core Engine v4
// Changes from v3:
//   - Plan starts on first check date (June 7), not first-of-month
//   - Bills due before first check are skipped (assumed paid)
//   - Split payment support: one bill split across two checks
//   - Move history with undo (per occId stack)
// ============================================================

const HH = (() => {

  const CONFIG_VERSION = 4;  // bump forces stale localStorage reset

  const DEFAULT_CONFIG = {
    version: CONFIG_VERSION,
    spouses: [
      { id:'s1', name:'Spouse 1', schedule:'biweekly',    amount:1000.00, nextDate:'2026-06-11', color:'amber' },
      { id:'s2', name:'Spouse 2', schedule:'semimonthly', amount:1790.00, days:[7,21],           color:'rose'  },
    ],
    living: { groceries:250, eatingOut:100, gas:50, misc:0 },
    rentalEstimate: 1050,
    planEndDate: '2027-12-31',
    surplusWarning: 200,
    expenses: [
      { id:'h01', dueDay:1,  name:'Car Insurance',               category:'Insurance',   amount:132.00,  balance:null,  apr:0, active:true },
      { id:'h02', dueDay:1,  name:'Mortgage',                    category:'Housing',     amount:2174.45, balance:null,  apr:0, active:true },
      { id:'h03', dueDay:1,  name:"Children's Insurance",        category:'Insurance',   amount:50.00,   balance:null,  apr:0, active:true },
      { id:'h04', dueDay:1,  name:'Car Insurance (2)',           category:'Insurance',   amount:228.00,  balance:null,  apr:0, active:true },
      { id:'h05', dueDay:1,  name:'Rental Insurance',            category:'Insurance',   amount:140.00,  balance:null,  apr:0, active:true },
      { id:'h06', dueDay:7,  name:'Credit Card (Capital One A)', category:'Credit Card', amount:240.00,  balance:6800,  apr:0, active:true },
      { id:'h07', dueDay:10, name:'Ideateck Internet',           category:'Utilities',   amount:92.95,   balance:null,  apr:0, active:true },
      { id:'h08', dueDay:14, name:'Credit Card (Chase)',         category:'Credit Card', amount:150.00,  balance:3000,  apr:0, active:true },
      { id:'h09', dueDay:15, name:'Water',                       category:'Utilities',   amount:200.00,  balance:null,  apr:0, active:true },
      { id:'h10', dueDay:16, name:'YMCA',                        category:'Health',      amount:59.50,   balance:null,  apr:0, active:true },
      { id:'h11', dueDay:20, name:'Phone',                       category:'Utilities',   amount:120.00,  balance:null,  apr:0, active:true },
      { id:'h12', dueDay:21, name:'Electric',                    category:'Utilities',   amount:20.00,   balance:null,  apr:0, active:true },
      { id:'h13', dueDay:22, name:'Braces',                      category:'Health',      amount:127.00,  balance:null,  apr:0, active:true },
      { id:'h14', dueDay:22, name:'Car Loan A',                  category:'Auto',        amount:180.00,  balance:null,  apr:0, active:true },
      { id:'h15', dueDay:22, name:'Solar',                       category:'Utilities',   amount:309.49,  balance:null,  apr:0, active:true },
      { id:'h16', dueDay:27, name:'Credit Card (Capital One B)', category:'Credit Card', amount:185.00,  balance:5100,  apr:0, active:true },
      { id:'h17', dueDay:28, name:'Car Loan B',                  category:'Auto',        amount:375.00,  balance:null,  apr:0, active:true },
      { id:'h18', dueDay:30, name:'Kansas Gas',                  category:'Utilities',   amount:40.00,   balance:null,  apr:0, active:true },
    ],
  };

  const KEYS = {
    config:   'hh_config',
    checks:   'hh_checks',
    noSpend:  'hh_nospend',
    moves:    'hh_moves',    // { occId: [{ type:'move'|'split', ...data }] }  — stack per occId
  };

  // ── Storage ───────────────────────────────────────────────────
  function load(key, fallback) {
    if (fallback === undefined) fallback = null;
    try { const r = localStorage.getItem(key); return r !== null ? JSON.parse(r) : fallback; }
    catch(e) { return fallback; }
  }
  function save(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch(e) {}
  }

  // ── Config with version guard ─────────────────────────────────
  function getConfig() {
    const stored = load(KEYS.config);
    if (!stored || (stored.version || 0) < CONFIG_VERSION) {
      const fresh = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
      save(KEYS.config, fresh);
      return fresh;
    }
    const out = JSON.parse(JSON.stringify(stored));
    if (!out.expenses)              out.expenses        = DEFAULT_CONFIG.expenses;
    if (!out.spouses)               out.spouses         = DEFAULT_CONFIG.spouses;
    if (!out.living)                out.living          = DEFAULT_CONFIG.living;
    if (out.surplusWarning == null) out.surplusWarning  = DEFAULT_CONFIG.surplusWarning;
    if (!out.planEndDate)           out.planEndDate     = DEFAULT_CONFIG.planEndDate;
    if (out.rentalEstimate == null) out.rentalEstimate  = DEFAULT_CONFIG.rentalEstimate;
    return out;
  }
  function saveConfig(cfg) { cfg.version = CONFIG_VERSION; save(KEYS.config, cfg); }

  // ── Date helpers ──────────────────────────────────────────────
  function parseDate(s) {
    const [y,m,d] = s.split('-').map(Number);
    return new Date(y, m-1, d);
  }
  function fmtDate(d) {
    return d.getFullYear() + '-' +
      String(d.getMonth()+1).padStart(2,'0') + '-' +
      String(d.getDate()).padStart(2,'0');
  }
  function fmtShort(s) {
    return parseDate(s).toLocaleDateString('en-US', { month:'short', day:'numeric', year:'2-digit' });
  }
  function fmtMoney(n) {
    return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits:2, maximumFractionDigits:2 });
  }
  function addDays(d,n)   { const r=new Date(d); r.setDate(r.getDate()+n); return r; }
  function addMonths(d,n) { const r=new Date(d); r.setMonth(r.getMonth()+n); return r; }

  // ── Generate all paycheck dates ───────────────────────────────
  function generateAllChecks(cfg) {
    const end = parseDate(cfg.planEndDate);
    const all = [];

    for (const sp of cfg.spouses) {
      if (sp.schedule === 'biweekly') {
        let cur = parseDate(sp.nextDate);
        while (cur <= end) {
          all.push({ date:fmtDate(cur), spouseId:sp.id, spouseName:sp.name, amount:sp.amount, color:sp.color });
          cur = addDays(cur, 14);
        }
      } else if (sp.schedule === 'semimonthly') {
        const s1ref = cfg.spouses.find(s => s.schedule === 'biweekly');
        const ref   = s1ref ? parseDate(s1ref.nextDate) : new Date();
        let mo = new Date(ref.getFullYear(), ref.getMonth(), 1);
        while (mo <= end) {
          for (const day of (sp.days || [7,21])) {
            const d = new Date(mo.getFullYear(), mo.getMonth(), day);
            if (d <= end)
              all.push({ date:fmtDate(d), spouseId:sp.id, spouseName:sp.name, amount:sp.amount, color:sp.color });
          }
          mo = addMonths(mo, 1);
        }
      }
    }

    all.sort((a,b) => {
      const dc = a.date.localeCompare(b.date);
      if (dc !== 0) return dc;
      if (a.spouseId==='s2' && b.spouseId!=='s2') return -1;
      if (b.spouseId==='s2' && a.spouseId!=='s2') return  1;
      return a.spouseId.localeCompare(b.spouseId);
    });

    return all;
  }

  // ══════════════════════════════════════════════════════════════
  // MOVE / SPLIT DATA STRUCTURE
  //
  // moves store (KEYS.moves): { [occId]: MoveEntry[] }
  // Each entry is the latest action — array is a stack for undo.
  //
  // MoveEntry (type='move'):
  //   { type:'move', targetCheckId }
  //   Bill appears only on targetCheckId, removed from default.
  //
  // MoveEntry (type='split'):
  //   { type:'split', checkA: checkId, amtA: number,
  //                   checkB: checkId, amtB: number }
  //   Bill appears on BOTH checks with split amounts.
  //   amtA + amtB = original amount (user sets amtA, amtB = remainder).
  // ══════════════════════════════════════════════════════════════

  function getMoves() { return load(KEYS.moves, {}); }
  function saveMoves(m) { save(KEYS.moves, m); }

  // Get the current (top of stack) action for an occId, or null
  function currentMove(moves, occId) {
    const stack = moves[occId];
    return (stack && stack.length) ? stack[stack.length - 1] : null;
  }

  // Push a new action onto the stack (enables undo)
  function pushMove(occId, entry) {
    const m = getMoves();
    if (!m[occId]) m[occId] = [];
    m[occId].push(entry);
    saveMoves(m);
  }

  // Undo: pop the stack. If empty, bill returns to default assignment.
  function undoMove(occId) {
    const m = getMoves();
    if (m[occId] && m[occId].length > 0) {
      m[occId].pop();
      if (m[occId].length === 0) delete m[occId];
    }
    saveMoves(m);
  }

  function moveBill(occId, targetCheckId) {
    pushMove(occId, { type:'move', targetCheckId });
  }

  // Split a bill: amtA goes to checkA, remainder to checkB
  function splitBill(occId, checkAId, amtA, checkBId, totalAmount) {
    const amtB = Math.round((totalAmount - amtA) * 100) / 100;
    pushMove(occId, { type:'split', checkA:checkAId, amtA, checkB:checkBId, amtB });
  }

  // ══════════════════════════════════════════════════════════════
  // EXPENSE ASSIGNMENT — CLOSEST CHECK
  //
  // planStart = the date of the very first check (June 7).
  // Any bill occurrence whose due date is before planStart is
  // SKIPPED (assumed already paid).
  // Remaining occurrences go to the check with minimum
  // |checkDate − dueDate|.  Tie-break: earlier check wins.
  //
  // Split bills create TWO entries in the assignment map:
  //   occId          → { checkId: checkA, amount: amtA, isSplit:true, splitPart:'A', siblingCheckId: checkB }
  //   occId + '_B'   → { checkId: checkB, amount: amtB, isSplit:true, splitPart:'B', siblingCheckId: checkA }
  //
  // Returns: { [occId]: assignmentEntry }
  // ══════════════════════════════════════════════════════════════
  function buildAssignmentMap(cfg, allChecks) {
    const moves     = getMoves();
    const checkList = allChecks.map(c => ({ id:'check_'+c.date+'_'+c.spouseId, date:c.date }));
    const lastDate  = allChecks.length ? parseDate(allChecks[allChecks.length-1].date) : new Date();
    const planStart = allChecks.length ? parseDate(allChecks[0].date) : new Date();

    const assignment = {};  // occId → { checkId, amount, isSplit, splitPart, siblingCheckId }

    for (const exp of cfg.expenses) {
      if (!exp.active) continue;

      // Scan from planStart month on dueDay
      let scanDate = new Date(planStart.getFullYear(), planStart.getMonth(), exp.dueDay);

      for (let iter = 0; iter < 42; iter++) {
        const dueDate    = new Date(scanDate);
        const dueDateStr = fmtDate(dueDate);

        if (dueDate > lastDate) break;

        // Skip occurrences before plan start (already paid)
        if (dueDate < planStart) {
          scanDate = addMonths(scanDate, 1);
          continue;
        }

        const occId = exp.id + '_' + dueDateStr;
        const mv    = currentMove(moves, occId);

        if (mv && mv.type === 'move') {
          // Moved entirely to another check
          assignment[occId] = { checkId: mv.targetCheckId, amount: exp.amount,
                                 isSplit: false, splitPart: null, siblingCheckId: null,
                                 movedManually: true };

        } else if (mv && mv.type === 'split') {
          // Part A
          assignment[occId] = { checkId: mv.checkA, amount: mv.amtA,
                                 isSplit: true, splitPart: 'A', siblingCheckId: mv.checkB,
                                 siblingAmount: mv.amtB, movedManually: true };
          // Part B (synthetic key)
          assignment[occId + '_B'] = { checkId: mv.checkB, amount: mv.amtB,
                                        isSplit: true, splitPart: 'B', siblingCheckId: mv.checkA,
                                        siblingAmount: mv.amtA, movedManually: true,
                                        // reference back to parent for display
                                        parentOccId: occId, expId: exp.id,
                                        expName: exp.name, expCategory: exp.category,
                                        expDueDate: dueDateStr };
        } else {
          // Default: closest check
          let bestId = null, bestDiff = Infinity;
          for (const ck of checkList) {
            const diff = Math.abs(parseDate(ck.date) - dueDate);
            if (diff < bestDiff) { bestDiff = diff; bestId = ck.id; }
          }
          if (bestId) assignment[occId] = { checkId: bestId, amount: exp.amount,
                                              isSplit: false, splitPart: null, siblingCheckId: null,
                                              movedManually: false };
        }

        scanDate = addMonths(scanDate, 1);
      }
    }

    return assignment;
  }

  // Build lookup: checkId → [occId, ...]
  function buildCheckLookup(assignmentMap) {
    const lookup = {};
    for (const [occId, entry] of Object.entries(assignmentMap)) {
      const cid = entry.checkId;
      if (!lookup[cid]) lookup[cid] = [];
      lookup[cid].push(occId);
    }
    return lookup;
  }

  // Get expenses for a check, resolving split amounts
  function getExpensesForCheck(checkId, assignmentMap, checkLookup, cfg) {
    const occIds = checkLookup[checkId] || [];
    const result = [];

    for (const occId of occIds) {
      const entry = assignmentMap[occId];
      if (!entry) continue;

      let exp, dueDateStr;

      if (entry.splitPart === 'B') {
        // Synthetic split-B entry — look up parent expense
        exp = cfg.expenses.find(e => e.id === entry.expId);
        dueDateStr = entry.expDueDate;
      } else {
        // Normal or split-A
        exp = cfg.expenses.find(e => {
          const prefix = e.id + '_';
          return occId.startsWith(prefix) && occId.length > prefix.length;
        });
        dueDateStr = exp ? occId.slice(exp.id.length + 1) : null;
      }

      if (!exp || !exp.active || !dueDateStr) continue;

      result.push({
        ...exp,
        occId,
        dueDate:         dueDateStr,
        amount:          entry.amount,         // may be split amount
        isSplit:         entry.isSplit || false,
        splitPart:       entry.splitPart || null,
        siblingCheckId:  entry.siblingCheckId || null,
        siblingAmount:   entry.siblingAmount || null,
        movedManually:   entry.movedManually || false,
        canUndo:         !!(getMoves()[entry.splitPart==='B' ? entry.parentOccId : occId]?.length),
        undoOccId:       entry.splitPart === 'B' ? entry.parentOccId : occId,
      });
    }

    result.sort((a,b) => a.dueDate.localeCompare(b.dueDate) || a.name.localeCompare(b.name));
    return result;
  }

  // ── Build full plan ───────────────────────────────────────────
  function buildPlan() {
    const cfg         = getConfig();
    const rawChecks   = generateAllChecks(cfg);
    const checkData   = load(KEYS.checks, {});
    const s2Id        = (cfg.spouses.find(s => s.schedule === 'semimonthly') || {}).id || 's2';
    const livingTotal = (cfg.living.groceries||0)+(cfg.living.eatingOut||0)+
                        (cfg.living.gas||0)+(cfg.living.misc||0);

    const assignmentMap = buildAssignmentMap(cfg, rawChecks);
    const checkLookup   = buildCheckLookup(assignmentMap);

    const checks = rawChecks.map(rc => {
      const id           = 'check_'+rc.date+'_'+rc.spouseId;
      const stored       = checkData[id] || {};
      const isS2         = rc.spouseId === s2Id;
      const expenses     = getExpensesForCheck(id, assignmentMap, checkLookup, cfg);
      const rentalIncome = stored.rentalIncome || 0;
      const actualIncome = (stored.actualIncome != null) ? stored.actualIncome : rc.amount;
      const extraItems   = stored.extraItems || [];
      const extraTotal   = extraItems.reduce((s,i) => s+i.amount, 0);
      const totalExp     = expenses.reduce((s,e) => s+e.amount, 0);
      const living       = isS2 ? livingTotal : 0;
      const surplus      = actualIncome + rentalIncome - totalExp - living - extraTotal;

      return {
        id, date:rc.date, spouseId:rc.spouseId, spouseName:rc.spouseName, color:rc.color,
        estimatedIncome:rc.amount, grossIncome:actualIncome, rentalIncome, isS2,
        expenses, totalExpenses:totalExp, living, extraItems, extraTotal, surplus,
        paidExpenses: stored.paidExpenses || [],
        notes:        stored.notes || '',
      };
    });

    return { cfg, checks };
  }

  // ── CC payoff ──────────────────────────────────────────────────
  function calcPayoff(expenses, strategy, extraMonthly) {
    let debts = expenses
      .filter(e => e.active && e.balance!=null && e.balance>0 && e.category==='Credit Card')
      .map(e => ({ id:e.id, name:e.name, balance:e.balance, minPay:e.amount,
                   apr:e.apr||0, rate:(e.apr||0)/100/12 }));
    if (strategy==='avalanche') debts.sort((a,b)=>b.apr-a.apr);
    else                        debts.sort((a,b)=>a.balance-b.balance);
    const history=[]; let month=0;
    while(debts.some(d=>d.balance>0.01)&&month<360){
      month++; let extra=extraMonthly;
      for(const d of debts){ if(d.balance<=0)continue; d.balance+=d.balance*d.rate; d.balance=Math.max(0,d.balance-Math.min(d.minPay,d.balance)); }
      for(const d of debts){ if(d.balance<=0||extra<=0)continue; const pay=Math.min(extra,d.balance); d.balance=Math.max(0,d.balance-pay); extra-=pay; }
      history.push({month,total:debts.reduce((s,d)=>s+d.balance,0),debts:debts.map(d=>({name:d.name,balance:+d.balance.toFixed(2)}))});
    }
    return { months:month, freeDate:fmtDate(addMonths(new Date(),month)), history };
  }

  // ── Monthly stats ─────────────────────────────────────────────
  function monthlyStats(checks) {
    const m={};
    for(const c of checks){
      const mo=c.date.substring(0,7);
      if(!m[mo]) m[mo]={income:0,expenses:0,living:0,surplus:0,rental:0};
      m[mo].income+=c.grossIncome+c.rentalIncome; m[mo].expenses+=c.totalExpenses;
      m[mo].living+=c.living+c.extraTotal; m[mo].surplus+=c.surplus; m[mo].rental+=c.rentalIncome;
    }
    return m;
  }

  // ── Check data persistence ────────────────────────────────────
  function _getAll()      { return load(KEYS.checks, {}); }
  function _saveAll(d)    { save(KEYS.checks, d); }
  function _ensure(d, id) {
    if (!d[id]) d[id]={paidExpenses:[],rentalIncome:0,actualIncome:null,extraItems:[],notes:''};
    return d;
  }

  function togglePaid(checkId, occId) {
    const d=_ensure(_getAll(),checkId), arr=d[checkId].paidExpenses, i=arr.indexOf(occId);
    i>=0?arr.splice(i,1):arr.push(occId); _saveAll(d);
  }
  function setActualIncome(checkId, amount) {
    const d=_ensure(_getAll(),checkId);
    d[checkId].actualIncome=(amount===null||amount==='')?null:Number(amount); _saveAll(d);
  }
  function setRental(checkId, amount)  { const d=_ensure(_getAll(),checkId); d[checkId].rentalIncome=Number(amount); _saveAll(d); }
  function addRental(checkId, amount)  { const d=_ensure(_getAll(),checkId); d[checkId].rentalIncome=(d[checkId].rentalIncome||0)+Number(amount); _saveAll(d); }
  function saveNotes(checkId, notes)   { const d=_ensure(_getAll(),checkId); d[checkId].notes=notes; _saveAll(d); }
  function addExtraItem(checkId, item) {
    const d=_ensure(_getAll(),checkId);
    if(!d[checkId].extraItems)d[checkId].extraItems=[];
    d[checkId].extraItems.push({id:Date.now(),...item}); _saveAll(d);
  }
  function deleteExtraItem(checkId, itemId) {
    const d=_ensure(_getAll(),checkId);
    d[checkId].extraItems=(d[checkId].extraItems||[]).filter(i=>i.id!==itemId); _saveAll(d);
  }

  // ── No-spend streak ───────────────────────────────────────────
  function getNoSpend()       { return new Set(load(KEYS.noSpend,[])); }
  function toggleNoSpend(ds)  { const s=getNoSpend(); s.has(ds)?s.delete(ds):s.add(ds); save(KEYS.noSpend,[...s]); }
  function streakCount(ns)    { let n=0,d=new Date(); while(ns.has(fmtDate(d))){n++;d=addDays(d,-1);} return n; }

  // ── Stats ─────────────────────────────────────────────────────
  function computeStats(checks) {
    if(!checks.length) return {best:null,worst:null,net:0,avg:0,negCount:0};
    const best=checks.reduce((a,b)=>b.surplus>a.surplus?b:a,checks[0]);
    const worst=checks.reduce((a,b)=>b.surplus<a.surplus?b:a,checks[0]);
    const net=checks.reduce((s,c)=>s+c.surplus,0);
    return {best,worst,net,avg:net/checks.length,negCount:checks.filter(c=>c.surplus<0).length};
  }

  function resetAll() { Object.values(KEYS).forEach(k=>localStorage.removeItem(k)); }

  return {
    KEYS, DEFAULT_CONFIG, CONFIG_VERSION,
    load, save, getConfig, saveConfig,
    parseDate, fmtDate, fmtShort, fmtMoney, addDays, addMonths,
    buildPlan, calcPayoff, monthlyStats,
    getMoves, moveBill, splitBill, undoMove,
    togglePaid, setActualIncome, setRental, addRental,
    saveNotes, addExtraItem, deleteExtraItem,
    getNoSpend, toggleNoSpend, streakCount,
    computeStats, resetAll,
  };
})();
