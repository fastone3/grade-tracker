/**
 * main.js — 入口层（依赖 core.js + achievements.js + modules.js，加载顺序第 4）
 *
 * 模块：GlobalState + Navigation + Init
 * 加载顺序：core.js → achievements.js → modules.js → main.js
 *
 * 注意：data / chartScore / chartRank 在此文件声明并赋值。
 * 其他文件中的函数引用这些全局变量时，由于所有文件在解析阶段已定义完毕，
 * 执行阶段的引用均可正常访问。
 */

/* ===== 全局状态 ===== */
AppState.chartScore = null;
AppState.chartRank = null;
var data = loadData();
if (!data.dailyTasks) data.dailyTasks = {};


/* ===== Tab 切换（桌面端） ===== */
/**
 * 桌面端顶部 Tab 切换，同步更新底部栏样式
 * @param {string} tab - tab ID（dashboard / practice / daily / advanced / points / achievements / settings）
 * @param {HTMLElement} el - 被点击的 tab 元素
 */
function switchTab(tab, el) {
  document.querySelectorAll('.tabs .tab').forEach(function(t){ t.classList.remove('active'); });
  document.querySelectorAll('.panel').forEach(function(p){ p.classList.remove('active'); });
  if (el) el.classList.add('active');
  var panel = document.getElementById('panel-' + tab);
  if (panel) panel.classList.add('active');
  // 同步底部栏
  document.querySelectorAll('.bottom-bar .btab').forEach(function(b){
    b.classList.toggle('active', b.dataset.tab === tab);
  });
  // 渲染
  renderTab(tab);
  // 同步刷题计分规则（从 data.rules 刷新到 DOM）
  if (data && data.rules) {
    var rb = document.getElementById('ruleBase2'); if(rb) rb.textContent = data.rules.base;
    var rt = document.getElementById('ruleTop3_2'); if(rt) rt.textContent = data.rules.top3;
    var rs = document.getElementById('ruleStreak2'); if(rs) rs.textContent = data.rules.streakBase;
  }
  window.scrollTo({top:0, behavior:'smooth'});
}

/* ===== Tab 切换（手机端） ===== */
/**
 * 手机端底部栏 Tab 切换，同步更新桌面端顶部 tab 样式和面板
 */
function switchTabMobile(tab, el) {
  document.querySelectorAll('.bottom-bar .btab').forEach(function(b){
    b.classList.remove('active');
    b.setAttribute('aria-selected', 'false');
  });
  if (el) { el.classList.add('active'); el.setAttribute('aria-selected', 'true'); }
  document.querySelectorAll('.tabs .tab').forEach(function(t){
    t.classList.toggle('active', t.dataset.tab === tab);
  });
  document.querySelectorAll('.panel').forEach(function(p){ p.classList.remove('active'); });
  var panel = document.getElementById('panel-' + tab);
  if (panel) panel.classList.add('active');
  renderTab(tab);
  // 同步刷题计分规则
  if (data && data.rules) {
    var rb = document.getElementById('ruleBase2'); if(rb) rb.textContent = data.rules.base;
    var rt = document.getElementById('ruleTop3_2'); if(rt) rt.textContent = data.rules.top3;
    var rs = document.getElementById('ruleStreak2'); if(rs) rs.textContent = data.rules.streakBase;
  }
  window.scrollTo({top:0, behavior:'smooth'});
}


/* ===== 根据当前活跃面板刷新 ===== */
/**
 * 根据 tab 名称渲染对应面板
 * @param {string} tab - tab ID
 */
function renderTab(tab) {
  if (tab === 'dashboard') renderDashboard();
  if (tab === 'practice')  { renderTab(AppState.currentSubTab); switchSubTabUI(AppState.currentSubTab); }
  if (tab === 'daily')     {
    switchDailySubTabUI(AppState.currentDailySubTab);
    if (AppState.currentDailySubTab === 'checkin') renderDaily();
    else if (AppState.currentDailySubTab === 'dailyHistory') renderDailyHistory();
    else if (AppState.currentDailySubTab === 'concentration') renderConcentration();
  }
  if (tab === 'advanced')  { renderAdvanced(); }
  if (tab === 'points')    renderPoints();
  if (tab === 'achievements') renderAchievementList();
  if (tab === 'settings')  renderSettings();
}

/**
 * 刷新当前激活的面板（孩子切换后调用）
 */
function openSettings() {
  document.querySelectorAll('.tabs .tab').forEach(function(t){ t.classList.remove('active'); });
  document.querySelectorAll('.panel').forEach(function(p){ p.classList.remove('active'); });
  document.querySelectorAll('.bottom-bar .btab').forEach(function(b){ b.classList.remove('active'); });
  var panel = document.getElementById('panel-settings');
  if (panel) panel.classList.add('active');
  renderSettings();
  window.scrollTo({top:0, behavior:'smooth'});
}

function refreshCurrentPanel() {
  var activePanel = document.querySelector('.panel.active');
  if (!activePanel) return;
  var panelId = activePanel.id;
  if (panelId === 'panel-dashboard') renderDashboard();
  else if (panelId === 'panel-practice') { renderTab(AppState.currentSubTab); }
  else if (panelId === 'panel-daily') {
    if (AppState.currentDailySubTab === 'checkin') renderDaily();
    else if (AppState.currentDailySubTab === 'dailyHistory') renderDailyHistory();
    else if (AppState.currentDailySubTab === 'concentration') renderConcentration();
  }
  else if (panelId === 'panel-points') renderPoints();
  else if (panelId === 'panel-advanced') renderAdvanced();
  else if (panelId === 'panel-achievements') renderAchievementList();
  else if (panelId === 'panel-settings') renderSettings();
  updateUndoBtnState();
}

/**
 * 仅更新日常子标签 UI 样式（不触发渲染，用于孩子切换后保持子面板状态）
 * @param {string} sub - 'checkin' | 'dailyHistory' | 'concentration'
 */
function switchDailySubTabUI(sub) {
  document.querySelectorAll('#dailySubTabs .sub-tab').forEach(function(t){
    t.classList.toggle('active', t.dataset.sub === sub);
  });
  document.querySelectorAll('#panel-daily .sub-panel').forEach(function(p){ p.classList.remove('active'); });
  var panelId = sub === 'dailyHistory' ? 'sub-daily-history' : 'sub-daily-' + sub;
  var panel = document.getElementById(panelId);
  if (panel) panel.classList.add('active');
}

/**
 * 仅更新刷题子标签 UI 样式（不触发渲染）
 * @param {string} sub - 'record' | 'history' | 'trend' | 'correction'
 */
function switchSubTabUI(sub) {
  document.querySelectorAll('#practiceSubTabs .sub-tab').forEach(function(t){
    t.classList.toggle('active', t.dataset.sub === sub);
  });
  document.querySelectorAll('#panel-practice .sub-panel').forEach(function(p){ p.classList.remove('active'); });
  var panel = document.getElementById('sub-' + sub);
  if (panel) panel.classList.add('active');
  if (sub === 'record') {
    renderPracticeStats();
    // 年级 >= 4 时显示错题数输入行
    var wrongRow = document.getElementById('wrongCountRow');
    if (wrongRow) wrongRow.style.display = getCurrentChildGrade() >= 4 ? 'flex' : 'none';
  }
}


/* ===== 事件绑定（替代模板内联 onclick） ===== */
/**
 * 将所有原本通过 inline onclick 绑定的事件迁移到 addEventListener
 * 页面初始化时调用一次
 */
function bindEventHandlers() {
  /* ---- Header ---- */
  var hs1 = document.getElementById('hsBtn1');
  if (hs1) hs1.addEventListener('click', function(){ switchChild(1); });
  var hs2 = document.getElementById('hsBtn2');
  if (hs2) hs2.addEventListener('click', function(){ switchChild(2); });
  var gear = document.getElementById('settingsGear');
  if (gear) gear.addEventListener('click', function(){ openSettings(); });

  /* ---- Desktop Tabs ---- */
  document.querySelectorAll('#desktopTabs .tab').forEach(function(tab){
    var t = tab.dataset.tab;
    tab.addEventListener('click', function(){ switchTab(t, tab); });
  });

  /* ---- Bottom Bar (Mobile Tabs) ---- */
  document.querySelectorAll('#bottomBar .btab').forEach(function(btab){
    var t = btab.dataset.tab;
    btab.addEventListener('click', function(){ switchTabMobile(t, btab); });
  });

  /* ---- 刷题子标签 ---- */
  document.querySelectorAll('#practiceSubTabs .sub-tab').forEach(function(st){
    var sub = st.dataset.sub;
    st.addEventListener('click', function(){ switchSubTab(sub, st); });
  });

  /* ---- 日常子标签 ---- */
  document.querySelectorAll('#dailySubTabs .sub-tab').forEach(function(dst){
    var sub = dst.dataset.sub;
    dst.addEventListener('click', function(){ switchDailySubTab(sub, dst); });
  });

  /* ---- 日常日期变更 ---- */
  var dd = document.getElementById('daily-date');
  if (dd) dd.addEventListener('change', function(){ renderDaily(); });

  /* ---- Search / Filter ---- */
  var si = document.getElementById('searchInput');
  if (si) si.addEventListener('input', function(){ renderHistory(); });
  var fs = document.getElementById('filterSubject');
  if (fs) fs.addEventListener('change', function(){ renderHistory(); });

  /* ---- Trend Subject ---- */
  var ts = document.getElementById('trendSubject');
  if (ts) ts.addEventListener('change', function(){ renderTrend(); });

  /* ---- 就寝按钮 ---- */
  var bedChat = document.getElementById('btn-bed-chat');
  if (bedChat) bedChat.addEventListener('click', function(){ bedtimeCheck('chat'); });
  var bedQuiet = document.getElementById('btn-bed-quiet');
  if (bedQuiet) bedQuiet.addEventListener('click', function(){ bedtimeCheck('quiet'); });
  var bedLate = document.getElementById('btn-bed-late');
  if (bedLate) bedLate.addEventListener('click', function(){ bedtimeCheck('late'); });

  /* ---- 附加记录 ---- */
  var addExtra = document.getElementById('btn-addExtraTask');
  if (addExtra) addExtra.addEventListener('click', function(){ addExtraTask(); });

  /* ---- 刷题录入 ---- */
  var addRec = document.getElementById('btn-addRecord');
  if (addRec) addRec.addEventListener('click', function(){ addRecord(); });

  /* ---- 进阶周切换 ---- */
  var advPrev = document.getElementById('advWeekPrev');
  if (advPrev) advPrev.addEventListener('click', function(){ changeAdvWeek(-1); });
  var advNext = document.getElementById('advWeekNext');
  if (advNext) advNext.addEventListener('click', function(){ changeAdvWeek(1); });

  /* ---- Accordion（进阶页） ---- */
  document.querySelectorAll('.accordion-header').forEach(function(ah){
    ah.addEventListener('click', function(){ toggleAccordion(ah); });
  });

  /* ---- 积分切换 ---- */
  var ptsAdd = document.getElementById('ptsToggleAdd');
  if (ptsAdd) ptsAdd.addEventListener('click', function(){ switchPtsAction('add'); });
  var ptsSpend = document.getElementById('ptsToggleSpend');
  if (ptsSpend) ptsSpend.addEventListener('click', function(){ switchPtsAction('spend'); });

  /* ---- 积分操作 ---- */
  var btnAdd = document.getElementById('btn-addPoints');
  if (btnAdd) btnAdd.addEventListener('click', function(){ addPoints(); });
  var btnSpend = document.getElementById('btn-spendPoints');
  if (btnSpend) btnSpend.addEventListener('click', function(){ spendPoints(); });

  /* ---- 设置 - 孩子配置 ---- */
  var scn = document.getElementById('btn-saveChildNames');
  if (scn) scn.addEventListener('click', function(){ saveChildNames(); });

  /* ---- 设置 - 积分规则 ---- */
  var sr = document.getElementById('btn-saveRules');
  if (sr) sr.addEventListener('click', function(){ saveRules(); });

  /* ---- 设置 - 积分余额调整 ---- */
  var stp = document.getElementById('btn-saveTotalPoints');
  if (stp) stp.addEventListener('click', function(){ saveTotalPoints(); });
  var sqp = document.getElementById('btn-saveQuizPoints');
  if (sqp) sqp.addEventListener('click', function(){ saveQuizPoints(); });

  /* ---- 设置 - 同步 ---- */
  var gsc = document.getElementById('btn-generateSyncCode');
  if (gsc) gsc.addEventListener('click', function(){ generateSyncCode(); });
  var isf = document.getElementById('btn-importSyncFile');
  if (isf) isf.addEventListener('click', function(){ importSyncFile(); });
  var sfi = document.getElementById('syncFileInput');
  if (sfi) sfi.addEventListener('change', function(e){ doImportSyncFile(e); });
  var csc = document.getElementById('btn-copySyncCode');
  if (csc) csc.addEventListener('click', function(){ copySyncCode(); });
  var sqr = document.getElementById('btnShowQR');
  if (sqr) sqr.addEventListener('click', function(){ showSyncQR(); });
  var isc = document.getElementById('btn-importSyncCode');
  if (isc) isc.addEventListener('click', function(){ importSyncCode(); });

  /* ---- 设置 - 数据管理 ---- */
  var ej = document.getElementById('btn-exportJSON');
  if (ej) ej.addEventListener('click', function(){ exportJSON(); });
  var ec = document.getElementById('btn-exportCSV');
  if (ec) ec.addEventListener('click', function(){ exportCSV(); });
  var er = document.getElementById('btn-exportReport');
  if (er) er.addEventListener('click', function(){ exportReport(); });
  var id = document.getElementById('btn-importData');
  if (id) id.addEventListener('click', function(){ importData(); });
  var cda = document.getElementById('btn-clearAllData');
  if (cda) cda.addEventListener('click', function(){ clearAllData(); });

  /* ---- 文件导入 ---- */
  var impF = document.getElementById('importFile');
  if (impF) impF.addEventListener('change', function(e){ doImport(e); });

  /* ---- Modal ---- */
  var mc = document.getElementById('confirmCancel');
  if (mc) mc.addEventListener('click', function(){ modalResolve(false); });
  var mo = document.getElementById('confirmOk');
  if (mo) mo.addEventListener('click', function(){ modalResolve(true); });

  /* ---- 撤销操作 ---- */
  var btnUndo = document.getElementById('btnUndo');
  if (btnUndo) btnUndo.addEventListener('click', function(){ undoLastOperation(); });
}

/**
 * 更新撤销按钮的启用/禁用状态
 */
function updateUndoBtnState() {
  var btn = document.getElementById('btnUndo');
  if (!btn) return;
  var hasUndo = data && data.undoStack && data.undoStack.length > 0;
  btn.disabled = !hasUndo;
  btn.title = hasUndo ? '撤销上一步操作' : '无操作可撤销';
}


/* ===== 初始化 ===== */
AppState.today = new Date().toISOString().slice(0,10);
document.getElementById('inp-date').value = AppState.today;
// 初始化日常日期
AppState.dailyDateInput = document.getElementById('daily-date');
if (AppState.dailyDateInput) AppState.dailyDateInput.value = AppState.today;
updateChildSwitcherLabels();
// 初始化时根据年级显隐藏刷题模块
updatePracticeVisibility();
checkAutoSettle();
checkUndoToast();
renderDashboard();
// 绑定事件（替代所有 inline onclick）
bindEventHandlers();
updateUndoBtnState();
