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
  data = loadData();

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
  showAlert('名称和年级已保存');
}
