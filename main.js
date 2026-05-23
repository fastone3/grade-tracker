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
var chartScore = null, chartRank = null;
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
  if (tab === 'practice')  { renderTab(currentSubTab); switchSubTabUI(currentSubTab); }
  if (tab === 'daily')     { switchDailySubTabUI(currentDailySubTab); renderDaily(); }
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
  else if (panelId === 'panel-practice') { renderTab(currentSubTab); }
  else if (panelId === 'panel-daily') renderDaily();
  else if (panelId === 'panel-points') renderPoints();
  else if (panelId === 'panel-advanced') renderAdvanced();
  else if (panelId === 'panel-achievements') renderAchievementList();
  else if (panelId === 'panel-settings') renderSettings();
}

/**
 * 仅更新日常子标签 UI 样式（不触发渲染，用于孩子切换后保持子面板状态）
 * @param {string} sub - 'checkin' | 'dailyHistory'
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
 * @param {string} sub - 'record' | 'history' | 'trend'
 */
function switchSubTabUI(sub) {
  document.querySelectorAll('#practiceSubTabs .sub-tab').forEach(function(t){
    t.classList.toggle('active', t.dataset.sub === sub);
  });
  document.querySelectorAll('#panel-practice .sub-panel').forEach(function(p){ p.classList.remove('active'); });
  var panel = document.getElementById('sub-' + sub);
  if (panel) panel.classList.add('active');
  if (sub === 'record') renderPracticeStats();
}


/* ===== 初始化 ===== */
var today = new Date().toISOString().slice(0,10);
document.getElementById('inp-date').value = today;
// 初始化日常日期
var dailyDateInput = document.getElementById('daily-date');
if (dailyDateInput) dailyDateInput.value = today;
updateChildSwitcherLabels();
checkAutoSettle();
renderDashboard();
