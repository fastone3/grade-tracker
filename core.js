/**
 * core.js — 成绩追踪 & 积分系统 核心层（无依赖，加载顺序第 1）
 *
 * 模块：Config + DataAccess + Chart.js 默认主题 + UiUtils + ModalUtils
 * 加载顺序：core.js → achievements.js → modules.js → main.js
 */

/* ===== 孩子配置 ===== */
var CHILDREN_CONFIG_KEY = 'grade_tracker_children_config';
var AppState = {};
AppState.currentChild = 1; // 1 或 2
AppState.currentSubTab = 'record'; // 刷题子页面：record / history / trend / correction
AppState.currentDailySubTab = 'checkin'; // 日常子页面：checkin / dailyHistory / concentration

/**
 * 读取孩子配置（名称 + 年级）
 * @returns {{ name1:string, name2:string, grade1:number, grade2:number }} 配置对象
 */
function getChildrenConfig() {
  try { return JSON.parse(localStorage.getItem(CHILDREN_CONFIG_KEY)) || { name1:'饶梓铭', name2:'饶思微', grade1:5, grade2:2 }; }
  catch(e) { return { name1:'饶梓铭', name2:'饶思微', grade1:5, grade2:2 }; }
}

/**
 * 获取当前激活孩子的年级
 * @returns {number} 1~6 年级
 */
function getCurrentChildGrade() {
  var cfg = getChildrenConfig();
  return AppState.currentChild === 1 ? (cfg.grade1 || 5) : (cfg.grade2 || 2);
}

/**
 * 保存孩子配置到 localStorage
 * @param {{ name1:string, name2:string, grade1:number, grade2:number }} cfg
 */
function saveChildrenConfig(cfg) { localStorage.setItem(CHILDREN_CONFIG_KEY, JSON.stringify(cfg)); }

/**
 * 生成指定孩子的 localStorage 存储键
 * @param {number} childIndex - 1 或 2
 * @returns {string} 如 "grade_tracker_child1_v1"
 */
function getStorageKey(childIndex) {
  return 'grade_tracker_child' + childIndex + '_v1';
}

/* ===== 数据存取 ===== */

/**
 * 从 localStorage 加载当前孩子的数据，失败则返回默认数据
 * @returns {object} 完整数据对象（records/pointsLog/totalPoints/dailyTasks/…）
 */
function loadData() {
  try {
    var d = JSON.parse(localStorage.getItem(getStorageKey(AppState.currentChild))) || getDefaultData();
    return migrateData(d);
  }
  catch(e) { return getDefaultData(); }
}

/**
 * 旧数据 → 双积分模型迁移（一次性迁移，检测 dailyPoints 存在则跳过）
 * @param {object} data - 原始数据对象
 * @returns {object} 迁移后的数据对象
 */
function migrateData(data) {
  data.pointsLog = data.pointsLog || [];
  // 有积分但无日志历史 → 生成种子记录，确保总览面板有数据显示
  if (data.pointsLog.length === 0 && (data.dailyPoints > 0 || data.advancedPoints > 0)) {
    var ts = '2026-03-01T00:00:00';
    if (data.dailyPoints > 0) data.pointsLog.push({ id:'seed-daily', time:ts, type:'earn', pool:'daily', delta:data.dailyPoints, balance:data.dailyPoints, desc:'初始行为积分（系统导入）' });
    if (data.advancedPoints > 0) data.pointsLog.push({ id:'seed-adv', time:ts, type:'earn', pool:'advanced', delta:data.advancedPoints, balance:data.advancedPoints, desc:'初始刷题积分（系统导入）' });
  }
  if (data.dailyPoints !== undefined && data.advancedPoints !== undefined) return data;
  var dailyPts = 0, advancedPts = 0;
  if (data.pointsLog && data.pointsLog.length > 0) {
    data.pointsLog.forEach(function(log) {
      var pool = inferPool(log);
      log.pool = pool;
      if (pool === 'daily') dailyPts += log.delta;
      else advancedPts += log.delta;
      log.balance = pool === 'daily' ? dailyPts : advancedPts;
    });
  } else {
    dailyPts = data.totalPoints || 0;
    advancedPts = data.quizPoints || 0;
    // 旧格式无日志 → 生成种子记录
    if (dailyPts > 0) data.pointsLog.push({ id:'seed-daily-old', time:'2026-01-01T00:00:00', type:'earn', pool:'daily', delta:dailyPts, balance:dailyPts, desc:'初始行为积分（旧数据迁移）' });
    if (advancedPts > 0) data.pointsLog.push({ id:'seed-adv-old', time:'2026-01-01T00:00:00', type:'earn', pool:'advanced', delta:advancedPts, balance:advancedPts, desc:'初始刷题积分（旧数据迁移）' });
  }
  data.dailyPoints = Math.max(0, dailyPts);
  data.advancedPoints = Math.max(0, advancedPts);
  data.totalPoints = data.dailyPoints + data.advancedPoints;
  delete data.quizPoints;
  return data;
}
function inferPool(log) {
  if (log.source === 'quiz') return 'advanced';
  if (log.source === 'general') return 'daily';
  if (log.category === '刷题' || log.category === '结算') return 'advanced';
  if (log.category === '打卡' || log.category === '就寝' || log.category === '附加') return 'daily';
  if (log.desc) {
    if (log.desc.indexOf('刷题') !== -1 || log.desc.indexOf('进阶') !== -1 || log.desc.indexOf('排名') !== -1) return 'advanced';
  }
  return 'daily';
}

/**
 * 返回新孩子的默认数据结构
 * @returns {object} 带初始值的空数据对象
 */
function getDefaultData() {
  return { records:[], pointsLog:[], dailyPoints:0, advancedPoints:0, totalPoints:0, rules:{base:20,top3:30,streakBase:10}, consecutiveTop3:0, dailyTasks:{}, weeklySettlements:{}, achievements:{unlocked:[]} };
}

/**
 * 持久化数据到 localStorage（当前孩子）
 * @param {object} d - 完整数据对象
 */
function saveData(d) { localStorage.setItem(getStorageKey(AppState.currentChild), JSON.stringify(d)); }

/* ===== Chart.js 深色主题全局配置 ===== */
Chart.defaults.color = 'rgba(160,180,210,0.82)';
Chart.defaults.borderColor = 'rgba(0,232,255,0.08)';
Chart.defaults.font.family = "system-ui,-apple-system,'PingFang SC','Microsoft YaHei',sans-serif";
Chart.defaults.font.size = 11;
Chart.defaults.plugins.tooltip.backgroundColor = 'rgba(10,18,40,0.95)';
Chart.defaults.plugins.tooltip.borderColor = 'rgba(0,232,255,0.25)';
Chart.defaults.plugins.tooltip.borderWidth = 1;
Chart.defaults.plugins.tooltip.titleColor = '#00e8ff';
Chart.defaults.plugins.tooltip.bodyColor = '#dff0ff';
Chart.defaults.plugins.tooltip.padding = 10;
Chart.defaults.plugins.tooltip.cornerRadius = 6;

/* ===== 提示框 ===== */
/**
 * 显示一个自动消失的提示（3.5秒）
 * @param {string} msg - HTML 消息内容
 * @param {string} [type='success'] - 类型：success / error
 */
function showAlert(msg, type) {
  type = type || 'success';
  var box = document.getElementById('alertBox');
  box.className = 'alert alert-' + type;
  box.innerHTML = msg;
  box.classList.remove('hidden');
  setTimeout(function() { box.classList.add('hidden'); }, 3500);
}

/* ===== 刷题子标签切换 ===== */
/**
 * 切换刷题模块子面板（录入/历史/趋势/订正），更新 UI 并渲染对应面板
 * @param {string} sub - 'record' | 'history' | 'trend' | 'correction'
 * @param {HTMLElement} el - 被点击的子标签元素
 */
function switchSubTab(sub, el) {
  AppState.currentSubTab = sub;
  // 更新子标签样式
  document.querySelectorAll('#practiceSubTabs .sub-tab').forEach(function(t){ t.classList.remove('active'); });
  if (el) el.classList.add('active');
  // 切换子面板
  document.querySelectorAll('#panel-practice .sub-panel').forEach(function(p){ p.classList.remove('active'); });
  var panel = document.getElementById('sub-' + sub);
  if (panel) panel.classList.add('active');
  // 渲染对应子面板
  if (sub === 'history')    renderHistory();
  if (sub === 'trend')      renderTrend();
  if (sub === 'correction') renderCorrection();
  window.scrollTo({top:0, behavior:'smooth'});
}

/* ===== 日期工具 ===== */
/**
 * 将 Date 对象格式化为本地日期字符串 YYYY-MM-DD
 * @param {Date} d
 * @returns {string}
 */
function fmtLocalDate(d) {
  var y = d.getFullYear();
  var m = String(d.getMonth() + 1).padStart(2, '0');
  var day = String(d.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + day;
}

/* ===== 主题化确认对话框 ===== */
AppState.modalResolver = null;
/**
 * 显示科幻风格确认对话框（Promise 化），用于确认删除等危险操作
 * @param {string} message - 提示内容（支持 HTML）
 * @param {string} [title] - 弹窗标题，默认"确认操作"
 * @returns {Promise<boolean>} resolve(true/false) 取决于用户点击确认/取消
 */
function customConfirm(message, title) {
  return new Promise(function(resolve) {
    AppState.modalResolver = resolve;
    document.getElementById('confirmTitle').textContent = title || '确认操作';
    document.getElementById('confirmBody').innerHTML = message;
    document.getElementById('confirmModal').classList.add('show');
    document.getElementById('confirmOk').focus();
  });
}
/**
 * 确认对话框回调：关闭弹窗并 resolve Promise
 * @param {boolean} result - true=确认 / false=取消
 */
function modalResolve(result) {
  document.getElementById('confirmModal').classList.remove('show');
  if (AppState.modalResolver) { AppState.modalResolver(result); AppState.modalResolver = null; }
}
