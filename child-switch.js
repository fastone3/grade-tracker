/**
 * child-switch.js — 孩子切换模块（依赖 core.js + achievements.js，加载顺序第 3）
 * 加载顺序：core.js → achievements.js → child-switch.js → daily.js → modules.js → grade.js → advanced.js → settings.js → main.js
 */

/* ===== 孩子切换 ===== */
/**
 * 切换当前显示的孩子（1 或 2），重新加载数据并刷新面板
 * @param {number} childIndex - 1 或 2
 */
function switchChild(childIndex) {
  AppState.currentChild = childIndex;
  AppState.data = loadData();

  var btn1 = document.getElementById('hsBtn1');
  var btn2 = document.getElementById('hsBtn2');
  var cfg = getChildrenConfig();

  btn1.className = 'hs-btn' + (childIndex === 1 ? ' active-child1' : '');
  btn2.className = 'hs-btn' + (childIndex === 2 ? ' active-child2' : '');

  var name = childIndex === 1 ? cfg.name1 : cfg.name2;
  var icon = childIndex === 1 ? '👦' : '👧';
  document.getElementById('compactTitle').textContent = icon + ' ' + name + ' · 成绩 & 积分';

  // 刷新当前面板
  refreshCurrentPanel();
  // 切换孩子后刷新刷题 tab 显隐
  updatePracticeVisibility();
  showAlert('已切换到 <strong>' + name + '</strong> 的数据', 'success');
}

/**
 * 更新顶部孩子切换按钮的标签文字（名称变化后调用）
 */
function updateChildSwitcherLabels() {
  var cfg = getChildrenConfig();
  var name = AppState.currentChild === 1 ? cfg.name1 : cfg.name2;
  var icon = AppState.currentChild === 1 ? '👦' : '👧';
  document.getElementById('compactTitle').textContent = icon + ' ' + name + ' · 成绩 & 积分';
}

/**
 * 根据当前孩子的年级自动显示或隐藏刷题模块
 * 1-3 年级隐藏，4-6 年级显示
 * 如果孩子无刷题权限且当前正显示刷题面板，自动跳转到总览
 */
function updatePracticeVisibility() {
  var visible = isPracticeVisible();
  var display = visible ? '' : 'none';

  // 控制桌面端刷题 tab
  var deskTab = document.querySelector('#desktopTabs .tab[data-tab="practice"]');
  if (deskTab) deskTab.style.display = display;

  // 控制底部导航刷题按钮
  var mobTab = document.querySelector('#bottomBar .btab[data-tab="practice"]');
  if (mobTab) mobTab.style.display = display;

  // 控制刷题面板
  var practicePanel = document.getElementById('panel-practice');
  if (practicePanel) practicePanel.style.display = display;

  // 如果当前正显示刷题面板但无权限，跳转到总览
  if (!visible && practicePanel && practicePanel.classList.contains('active')) {
    // 模拟切换到总览
    var dashBtn = document.querySelector('#desktopTabs .tab[data-tab="dashboard"]');
    if (dashBtn) switchTab('dashboard', dashBtn);
  }
}

/* ===== 保存孩子名称 ===== */
/**
 * 保存设置页的孩子名称和年级，刷新 UI 标签和刷题 tab 显隐
 */
function saveChildNames() {
  var name = document.getElementById('cfg-child-name').value.trim() || (AppState.currentChild === 1 ? '孩子1' : '孩子2');
  var grade = parseInt(document.getElementById('cfg-child-grade').value) || 5;
  var cfg = getChildrenConfig();
  if (AppState.currentChild === 1) { cfg.name1 = name; cfg.grade1 = grade; }
  else { cfg.name2 = name; cfg.grade2 = grade; }
  saveChildrenConfig(cfg);
  updateChildSwitcherLabels();
  updatePracticeVisibility();
  showAlert('名称和年级已保存');
}

/* ===== 注册到 AppState 命名空间 ===== */
AppState.switchChild = switchChild;
AppState.updateChildSwitcherLabels = updateChildSwitcherLabels;
AppState.updatePracticeVisibility = updatePracticeVisibility;
AppState.saveChildNames = saveChildNames;
