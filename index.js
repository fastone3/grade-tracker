/**
 * index.js — 成绩追踪 & 积分系统 核心逻辑（双孩子版）
 *
 * 架构说明：
 * - 双孩子数据隔离：localStorage key `grade_tracker_child{1|2}_v1`
 * - 三点同步铁律：任何积分操作必须同步 totalPoints + pointsLog + UI 刷新
 * - 年级差异化：1-3 年级不显示刷题模块，4-6 年级全功能
 */

/* ===== 孩子配置 ===== */
var CHILDREN_CONFIG_KEY = 'grade_tracker_children_config';
var currentChild = 1; // 1 或 2
var currentSubTab = 'record'; // 刷题子页面：record / history / trend
var currentDailySubTab = 'checkin'; // 日常子页面：checkin / dailyHistory

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
  return currentChild === 1 ? (cfg.grade1 || 5) : (cfg.grade2 || 2);
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
    var d = JSON.parse(localStorage.getItem(getStorageKey(currentChild))) || getDefaultData();
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

/* ===== 成就系统 ===== */
var ACHIEVEMENTS = [
  // ———— 低年级段（1-3年级，习惯养成） ————
  // 专注小芽 C1
  { id:'A01', name:'专注小芽', desc:'连续7天完成日常打卡', icon:'🌱', cap:'C1', color:'#22ffb3', tier:'common', grades:[1,2,3], group:'habit', conditionType:'consecutiveCheckinDays', conditionValue:7 },
  // 专注之星 C1
  { id:'A02', name:'专注之星', desc:'连续21天完成日常打卡', icon:'⭐', cap:'C1', color:'#22ffb3', tier:'rare', grades:[1,2,3], group:'habit', conditionType:'consecutiveCheckinDays', conditionValue:21 },
  // 专注大师 C1
  { id:'A03', name:'专注大师', desc:'连续60天完成日常打卡', icon:'👑', cap:'C1', color:'#00e8ff', tier:'legendary', grades:[1,2,3], group:'habit', conditionType:'consecutiveCheckinDays', conditionValue:60 },
  // 自律起航 C4
  { id:'A04', name:'自律起航', desc:'累计完成30次打卡', icon:'🚀', cap:'C4', color:'#fbbf24', tier:'common', grades:[1,2,3], group:'habit', conditionType:'totalCheckins', conditionValue:30 },
  // 自律达人 C4
  { id:'A05', name:'自律达人', desc:'累计完成100次打卡', icon:'⏰', cap:'C4', color:'#fbbf24', tier:'rare', grades:[1,2,3], group:'habit', conditionType:'totalCheckins', conditionValue:100 },
  // 周满勤 C4
  { id:'A06', name:'周满勤', desc:'本周7天全部完成打卡', icon:'📅', cap:'C4', color:'#00e8ff', tier:'rare', grades:[1,2,3], group:'habit', conditionType:'weekFullCheckin' },

  // ———— 高年级段（4-6年级，学习进阶） ————
  // 审题起手 C5
  { id:'B01', name:'审题起手', desc:'单科目连续3次获得前3名', icon:'🖊️', cap:'C5', color:'#fbbf24', tier:'common', grades:[4,5,6], group:'advance', conditionType:'subjectConsecutiveTop3', conditionValue:3 },
  // 审题高手 C5
  { id:'B02', name:'审题高手', desc:'单科目累计10次获得前3名', icon:'🏅', cap:'C5', color:'#fbbf24', tier:'rare', grades:[4,5,6], group:'advance', conditionType:'subjectCumulativeTop3', conditionValue:10 },
  // 全科小达人 C5
  { id:'B03', name:'全科小达人', desc:'所有科目各至少1次前3名', icon:'🎯', cap:'C5', color:'#00e8ff', tier:'rare', grades:[4,5,6], group:'advance', conditionType:'allSubjectTop3' },
  // 纠错启程 C7
  { id:'B04', name:'纠错启程', desc:'连续3次刷题获得前3名', icon:'🔄', cap:'C7', color:'#22ffb3', tier:'common', grades:[4,5,6], group:'advance', conditionType:'consecutiveTop3', conditionValue:3 },
  // 纠错达人 C7
  { id:'B05', name:'纠错达人', desc:'连续7次刷题获得前3名', icon:'💪', cap:'C7', color:'#22ffb3', tier:'rare', grades:[4,5,6], group:'advance', conditionType:'consecutiveTop3', conditionValue:7 },
  // 王者连击 C7
  { id:'B06', name:'王者连击', desc:'连续15次刷题获得前3名', icon:'🏆', cap:'C7', color:'#00e8ff', tier:'legendary', grades:[4,5,6], group:'advance', conditionType:'consecutiveTop3', conditionValue:15 },
  // 周度优秀 C7
  { id:'B07', name:'周度优秀', desc:'周结算获得「优秀」等级', icon:'🥇', cap:'C7', color:'#22ffb3', tier:'common', grades:[4,5,6], group:'advance', conditionType:'weeklyExcellent' },
  // 时间管理师 C8
  { id:'B08', name:'时间管理师', desc:'本周打卡≥5天且本周有刷题', icon:'⏳', cap:'C8', color:'#00e8ff', tier:'rare', grades:[4,5,6], group:'advance', conditionType:'weekTimeManager' },
  // 高效一周 C8
  { id:'B09', name:'高效一周', desc:'本周同时获得刷题积分和打卡积分', icon:'⚡', cap:'C8', color:'#fbbf24', tier:'common', grades:[4,5,6], group:'advance', conditionType:'weekEfficient' },

  // ———— 通用段（所有年级，荣誉殿堂） ————
  { id:'G01', name:'首次解锁', desc:'解锁任意1个成就', icon:'🔓', cap:'C1', color:'#00e8ff', tier:'common', grades:[1,2,3,4,5,6], group:'honor', conditionType:'totalUnlocked', conditionValue:1 },
  { id:'G02', name:'收集家', desc:'解锁5个成就', icon:'📦', cap:'C1', color:'#fbbf24', tier:'rare', grades:[1,2,3,4,5,6], group:'honor', conditionType:'totalUnlocked', conditionValue:5 },
  { id:'G03', name:'满贯', desc:'解锁当前年级段全部成就', icon:'👑', cap:'C1', color:'#00e8ff', tier:'legendary', grades:[1,2,3,4,5,6], group:'honor', conditionType:'allUnlocked' }
];

/**
 * 筛选当前孩子年级适用的成就列表
 * @returns {Array}
 */
function getApplicableAchievements() {
  var grade = getCurrentChildGrade();
  return ACHIEVEMENTS.filter(function(a){ return a.grades.indexOf(grade) !== -1; });
}

/**
 * 获取当前年级段显示的分组数组 [{group, label, items}]
 * group: 'habit' | 'advance' | 'honor'
 */
function getAchievementGroups() {
  var grade = getCurrentChildGrade();
  var all = getApplicableAchievements();
  var groups = [];
  var isLower = grade <= 3;
  if (isLower) {
    groups.push({ group:'habit', label:'🌟 习惯养成', items:all.filter(function(a){ return a.group === 'habit'; }) });
  } else {
    groups.push({ group:'advance', label:'📚 学习进阶', items:all.filter(function(a){ return a.group === 'advance'; }) });
  }
  groups.push({ group:'honor', label:'🏆 荣誉殿堂', items:all.filter(function(a){ return a.group === 'honor'; }) });
  return groups.filter(function(g){ return g.items.length > 0; });
}

/* === 成就进度查询（供 checkAchievements 和 render 使用） === */
/**
 * 计算某个成就的当前进度值（分子），用于进度条显示
 */
function getAchievementProgress(a) {
  var dailies = data.dailyTasks || {};
  var records = data.records || [];
  var unlocked = data.achievements ? data.achievements.unlocked : [];
  if (a.conditionType === 'consecutiveCheckinDays') {
    var dates = Object.keys(dailies).filter(function(d) { return dailies[d] && dailies[d].tasks; }).sort().reverse();
    var count = 0;
    for (var ci = 0; ci < dates.length; ci++) {
      var dd = dailies[dates[ci]];
      var hasDone = false;
      var tKeys = Object.keys(dd.tasks);
      for (var tj = 0; tj < tKeys.length; tj++) { if (dd.tasks[tKeys[tj]] && dd.tasks[tKeys[tj]].done) { hasDone = true; break; } }
      if (hasDone) { count++; if (ci > 0) { var d1 = new Date(dates[ci-1]+'T00:00:00'), d2 = new Date(dates[ci]+'T00:00:00'); if (Math.abs((d1-d2)/86400000-1)>0.1) break; } }
      else break;
    }
    return count;
  }
  if (a.conditionType === 'totalCheckins') {
    var sum = 0;
    Object.keys(dailies).forEach(function(dk) {
      var dd2 = dailies[dk];
      if (dd2 && dd2.tasks) Object.keys(dd2.tasks).forEach(function(tk) { if (dd2.tasks[tk] && dd2.tasks[tk].done) sum++; });
    });
    return sum;
  }
  if (a.conditionType === 'weekFullCheckin') { return isWeekFullCheckin() ? 7 : countWeekCheckins(dailies); }
  if (a.conditionType === 'subjectConsecutiveTop3' || a.conditionType === 'subjectCumulativeTop3') {
    return getSubjectBestProgress(a);
  }
  if (a.conditionType === 'allSubjectTop3') {
    var subjects = {}, sIds = [];
    records.forEach(function(r) { if (!subjects[r.subject]) { subjects[r.subject] = { hasTop3:false }; sIds.push(r.subject); } if (r.rank <= 3) subjects[r.subject].hasTop3 = true; });
    return sIds.filter(function(s) { return subjects[s].hasTop3; }).length;
  }
  if (a.conditionType === 'consecutiveTop3') return data.consecutiveTop3 || 0;
  if (a.conditionType === 'weeklyExcellent') return data.weeklySettlements && Object.keys(data.weeklySettlements).some(function(wk) { return data.weeklySettlements[wk].grade === '优秀'; }) ? 1 : 0;
  if (a.conditionType === 'weekTimeManager' || a.conditionType === 'weekEfficient') return checkWeekDualStatus(a) ? 1 : 0;
  if (a.conditionType === 'totalUnlocked') return unlocked.length;
  if (a.conditionType === 'allUnlocked') {
    var total = getApplicableAchievements().filter(function(x) { return x.id !== 'G01' && x.id !== 'G02' && x.id !== 'G03'; }).length;
    return unlocked.filter(function(uid) { return uid !== 'G01' && uid !== 'G02' && uid !== 'G03'; }).length;
  }
  return 0;
}

function getAchievementTotal(a) {
  if (a.conditionType === 'consecutiveCheckinDays' || a.conditionType === 'totalCheckins' || a.conditionType === 'subjectCumulativeTop3' || a.conditionType === 'consecutiveTop3' || a.conditionType === 'totalUnlocked' || a.conditionType === 'allUnlocked') return a.conditionValue || 1;
  if (a.conditionType === 'subjectConsecutiveTop3') return a.conditionValue || 3;
  if (a.conditionType === 'weekFullCheckin') return 7;
  if (a.conditionType === 'allSubjectTop3') { var s = {}; (data.records||[]).forEach(function(r){ s[r.subject]=true; }); return Math.max(Object.keys(s).length,1); }
  if (a.conditionType === 'weeklyExcellent' || a.conditionType === 'weekTimeManager' || a.conditionType === 'weekEfficient') return 1;
  return 1;
}

function isWeekFullCheckin() {
  var dailies = data.dailyTasks || {};
  var today = new Date();
  var day = today.getDay();
  var monOff = day === 0 ? -6 : 1 - day;
  var mon = new Date(today); mon.setDate(mon.getDate() + monOff);
  var full = true, doneCount = 0;
  for (var i = 0; i < 7; i++) {
    var d = new Date(mon); d.setDate(mon.getDate() + i);
    var ds = fmtLocalDate(d);
    if (d > today) break; // future date skip
    if (!dailies[ds] || !dailies[ds].tasks) { full = false; continue; }
    var hasDone = false;
    Object.keys(dailies[ds].tasks).forEach(function(tk) { if (dailies[ds].tasks[tk] && dailies[ds].tasks[tk].done) hasDone = true; });
    if (hasDone) doneCount++;
    else if (d <= today) full = false;
  }
  // 如果今天之前都完成就算全勤（允许今天未完成）
  var pastDone = doneCount;
  var todayDS = fmtLocalDate(today);
  if (dailies[todayDS]) {
    var tdHasDone = false;
    Object.keys(dailies[todayDS].tasks).forEach(function(tk) { if (dailies[todayDS].tasks[tk] && dailies[todayDS].tasks[tk].done) tdHasDone = true; });
    if (tdHasDone) pastDone++;
  }
  return pastDone >= 7 || (pastDone >= day && full);
}

function countWeekCheckins(dailies) {
  var today = new Date();
  var day = today.getDay();
  var monOff = day === 0 ? -6 : 1 - day;
  var mon = new Date(today); mon.setDate(mon.getDate() + monOff);
  var count = 0;
  for (var i = 0; i < 7; i++) {
    var d = new Date(mon); d.setDate(mon.getDate() + i);
    var ds = fmtLocalDate(d);
    if (d > today) break;
    if (dailies[ds] && dailies[ds].tasks) {
      var hasD = false;
      Object.keys(dailies[ds].tasks).forEach(function(tk) { if (dailies[ds].tasks[tk] && dailies[ds].tasks[tk].done) hasD = true; });
      if (hasD) count++;
    }
  }
  return count;
}

function getSubjectBestProgress(a) {
  var records = data.records || [];
  var bySub = {};
  records.forEach(function(r) {
    if (!bySub[r.subject]) bySub[r.subject] = [];
    bySub[r.subject].push(r);
  });
  var bestVal = 0;
  Object.keys(bySub).forEach(function(sub) {
    var subRecs = bySub[sub].sort(function(x,y) { return x.date.localeCompare(y.date); });
    if (a.conditionType === 'subjectConsecutiveTop3') {
      var streak = 0, maxS = 0;
      subRecs.forEach(function(rr) {
        if (rr.rank <= 3) { streak++; maxS = Math.max(maxS, streak); }
        else streak = 0;
      });
      bestVal = Math.max(bestVal, maxS);
    } else {
      bestVal = Math.max(bestVal, subRecs.filter(function(rr) { return rr.rank <= 3; }).length);
    }
  });
  return bestVal;
}

function checkWeekDualStatus(a) {
  var dailies = data.dailyTasks || {};
  var records = data.records || [];
  var today = new Date();
  var day = today.getDay();
  var monOff = day === 0 ? -6 : 1 - day;
  var mon = new Date(today); mon.setDate(mon.getDate() + monOff);
  var weekDates = [];
  for (var i = 0; i < 7; i++) { var d = new Date(mon); d.setDate(mon.getDate() + i); weekDates.push(fmtLocalDate(d)); }

  if (a.conditionType === 'weekTimeManager') {
    var checkinDays = 0;
    weekDates.forEach(function(ds) {
      if (dailies[ds] && dailies[ds].tasks) {
        var hasD = false;
        Object.keys(dailies[ds].tasks).forEach(function(tk) { if (dailies[ds].tasks[tk] && dailies[ds].tasks[tk].done) hasD = true; });
        if (hasD) checkinDays++;
      }
    });
    var practiceThisWeek = records.some(function(r) { return weekDates.indexOf(r.date) !== -1; });
    return checkinDays >= 5 && practiceThisWeek;
  }
  if (a.conditionType === 'weekEfficient') {
    var earnedQuiz = records.some(function(r) { return weekDates.indexOf(r.date) !== -1; });
    var earnedCheckin = false;
    weekDates.forEach(function(ds) {
      if (dailies[ds] && dailies[ds].tasks) {
        Object.keys(dailies[ds].tasks).forEach(function(tk) { if (dailies[ds].tasks[tk] && dailies[ds].tasks[tk].done && dailies[ds].tasks[tk].delta > 0) earnedCheckin = true; });
      }
    });
    return earnedQuiz && earnedCheckin;
  }
  return false;
}

/**
 * 检查并解锁成就，通过时弹出系统通知。调用时机：录入、打卡、进阶结算后
 * @param {boolean} silent - true 时静默检查，不弹通知
 * @returns {number} 本轮新解锁的成就数量
 */
function checkAchievements(silent) {
  var silentMode = silent || false;
  if (!data.achievements) data.achievements = { unlocked: [] };
  var newlyUnlocked = [];
  var unlocked = data.achievements.unlocked;

  getApplicableAchievements().forEach(function(a) {
    if (unlocked.indexOf(a.id) !== -1) return;
    var earned = false;
    var progress = getAchievementProgress(a);
    var total = getAchievementTotal(a);
    if (a.conditionType === 'consecutiveCheckinDays' || a.conditionType === 'totalCheckins' || a.conditionType === 'subjectCumulativeTop3' || a.conditionType === 'consecutiveTop3' || a.conditionType === 'totalUnlocked') {
      earned = progress >= (a.conditionValue || 1);
    }
    if (a.conditionType === 'subjectConsecutiveTop3') { earned = progress >= (a.conditionValue || 3); }
    if (a.conditionType === 'weekFullCheckin') { earned = isWeekFullCheckin(); }
    if (a.conditionType === 'allSubjectTop3') {
      var subMap = {};
      (data.records||[]).forEach(function(r) { subMap[r.subject] = (subMap[r.subject]||0) + 1; });
      var subCount = Object.keys(subMap).length;
      earned = subCount >= 2 && progress >= subCount;
    }
    if (a.conditionType === 'weeklyExcellent') {
      earned = data.weeklySettlements && Object.keys(data.weeklySettlements).some(function(wk) { return data.weeklySettlements[wk].grade === '优秀'; });
    }
    if (a.conditionType === 'weekTimeManager' || a.conditionType === 'weekEfficient') { earned = checkWeekDualStatus(a); }
    if (a.conditionType === 'allUnlocked') {
      var segmentTotal = getApplicableAchievements().filter(function(x) { return x.id !== 'G01' && x.id !== 'G02' && x.id !== 'G03'; }).length;
      earned = unlocked.filter(function(uid) { return uid !== 'G01' && uid !== 'G02' && uid !== 'G03'; }).length >= segmentTotal;
    }

    if (earned) {
      unlocked.push(a.id);
      newlyUnlocked.push(a);
    }
  });

  // 检查通用成就（G01/G02/G03 可能依赖新增解锁）
  if (newlyUnlocked.length > 0) {
    getApplicableAchievements().forEach(function(a) {
      if (a.id.indexOf('G0') !== 0) return;
      if (unlocked.indexOf(a.id) !== -1) return;
      var earned = false;
      if (a.conditionType === 'totalUnlocked') earned = unlocked.length >= (a.conditionValue || 1);
      if (a.conditionType === 'allUnlocked') {
        var segTotal = getApplicableAchievements().filter(function(x) { return x.id !== 'G01' && x.id !== 'G02' && x.id !== 'G03'; }).length;
        earned = unlocked.filter(function(uid) { return uid !== 'G01' && uid !== 'G02' && uid !== 'G03'; }).length >= segTotal;
      }
      if (earned) {
        unlocked.push(a.id);
        newlyUnlocked.push(a);
      }
    });
  }

  if (newlyUnlocked.length > 0) {
    saveData(data);
    if (!silentMode) {
      newlyUnlocked.forEach(function(a){
        showAlert('🎉 解锁成就：<strong>' + a.icon + ' ' + a.name + '</strong> — ' + a.desc + ' <span style="font-size:11px;opacity:0.7">(' + a.cap + ')</span>', 'success');
      });
    }
  }

  renderAchievementList();
  return newlyUnlocked.length;
}

/**
 * 渲染成就列表 UI（统计卡片 + 年级分组 + 进度条 + 稀有度样式）
 */
function renderAchievementList() {
  var container = document.getElementById('achievementList');
  if (!container) return;
  var unlocked = (data.achievements && data.achievements.unlocked) ? data.achievements.unlocked : [];
  var groups = getAchievementGroups();
  if (!groups.length) { container.innerHTML = '<div class="empty">暂无成就数据</div>'; return; }

  // 统计
  var rareCount = 0, legendaryCount = 0;
  var allApp = getApplicableAchievements();
  allApp.forEach(function(a) {
    if (unlocked.indexOf(a.id) === -1) return;
    if (a.tier === 'rare') rareCount++;
    if (a.tier === 'legendary') legendaryCount++;
  });

  var html = '<div class="ach-stats">' +
    '<div class="ach-stat-card"><span class="ach-stat-num">' + unlocked.length + '</span><span class="ach-stat-label">已解锁</span></div>' +
    '<div class="ach-stat-card"><span class="ach-stat-num">' + rareCount + '</span><span class="ach-stat-label">稀有成就</span></div>' +
    '<div class="ach-stat-card"><span class="ach-stat-num">' + legendaryCount + '</span><span class="ach-stat-label">传说成就</span></div>' +
  '</div>';

  var pct = allApp.length > 0 ? Math.round(unlocked.length / allApp.length * 100) : 0;
  html += '<div class="ach-overall-bar"><div class="ach-overall-progress" style="width:' + pct + '%"></div><span class="ach-overall-text">完成度 ' + pct + '% (' + unlocked.length + '/' + allApp.length + ')</span></div>';

  groups.forEach(function(g) {
    html += '<div class="ach-group"><div class="ach-group-title">' + g.label + ' <span class="ach-group-count">' + g.items.filter(function(a){return unlocked.indexOf(a.id)!==-1;}).length + '/' + g.items.length + '</span></div>';
    html += '<div class="ach-grid">';
    g.items.forEach(function(a) {
      var isUnlocked = unlocked.indexOf(a.id) !== -1;
      var progress = isUnlocked ? (a.conditionValue || 1) : getAchievementProgress(a);
      var total = getAchievementTotal(a);
      var pct2 = isUnlocked ? 100 : Math.min(100, Math.round(progress / total * 100));
      var tierClass = a.tier === 'legendary' ? 'ach-card-legendary' : (a.tier === 'rare' ? 'ach-card-rare' : 'ach-card-common');
      var bgColor = isUnlocked ? a.color : 'rgba(100,130,170,0.15)';
      html += '<div class="ach-card ' + tierClass + '" style="opacity:' + (isUnlocked ? '1' : '0.55') + '">';
      html += '<div class="ach-card-icon" style="color:' + (isUnlocked ? a.color : 'rgba(100,130,170,0.4)') + '">' + a.icon + '</div>';
      html += '<div class="ach-card-name">' + a.name + '</div>';
      html += '<div class="ach-card-cap" style="color:' + (isUnlocked ? a.color : 'rgba(100,130,170,0.5)') + '">' + a.cap + ' ' + a.desc + '</div>';
      if (isUnlocked) {
        html += '<div class="ach-card-unlocked">✓</div>';
      } else {
        html += '<div class="ach-card-bar"><div class="ach-card-bar-fill" style="width:' + pct2 + '%;background:' + a.color + '"></div></div>';
        html += '<div class="ach-card-pct">' + pct2 + '%</div>';
      }
      html += '</div>';
    });
    html += '</div></div>';
  });

  container.innerHTML = html;
}
/**
 * 持久化数据到 localStorage（当前孩子）
 * @param {object} d - 完整数据对象
 */
function saveData(d) { localStorage.setItem(getStorageKey(currentChild), JSON.stringify(d)); }

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

var chartScore = null, chartRank = null;
var data = loadData();
if (!data.dailyTasks) data.dailyTasks = {};

/* ===== 孩子切换 ===== */
/**
 * 切换当前显示的孩子（1 或 2），重新加载数据并刷新面板
 * @param {number} childIndex - 1 或 2
 */
function switchChild(childIndex) {
  currentChild = childIndex;
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
  var name = currentChild === 1 ? cfg.name1 : cfg.name2;
  var icon = currentChild === 1 ? '👦' : '👧';
  document.getElementById('compactTitle').textContent = icon + ' ' + name + ' · 成绩 & 积分';
}

/* ===== 保存孩子名称 ===== */
/**
 * 保存设置页的孩子名称和年级，刷新 UI 标签和刷题 tab 显隐
 */
function saveChildNames() {
  var name = document.getElementById('cfg-child-name').value.trim() || (currentChild === 1 ? '孩子1' : '孩子2');
  var grade = parseInt(document.getElementById('cfg-child-grade').value) || 5;
  var cfg = getChildrenConfig();
  if (currentChild === 1) { cfg.name1 = name; cfg.grade1 = grade; }
  else { cfg.name2 = name; cfg.grade2 = grade; }
  saveChildrenConfig(cfg);
  updateChildSwitcherLabels();
  showAlert('名称和年级已保存');
}

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
 * 切换刷题模块子面板（录入/历史/趋势），更新 UI 并渲染对应面板
 * @param {string} sub - 'record' | 'history' | 'trend'
 * @param {HTMLElement} el - 被点击的子标签元素
 */
function switchSubTab(sub, el) {
  currentSubTab = sub;
  // 更新子标签样式
  document.querySelectorAll('#practiceSubTabs .sub-tab').forEach(function(t){ t.classList.remove('active'); });
  if (el) el.classList.add('active');
  // 切换子面板
  document.querySelectorAll('#panel-practice .sub-panel').forEach(function(p){ p.classList.remove('active'); });
  var panel = document.getElementById('sub-' + sub);
  if (panel) panel.classList.add('active');
  // 渲染对应子面板
  if (sub === 'history') renderHistory();
  if (sub === 'trend')   renderTrend();
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

/* ===== 进阶页面 ===== */
var advWeekOffset = 0;

/**
 * 获取指定基准日期偏移 N 周后的周一~周日日期列表
 * @param {string} baseDate - YYYY-MM-DD 基准日期
 * @param {number} offset - 周偏移量（0=本周，-1=上周）
 * @returns {string[]} 7 个日期字符串
 */
function getWeekDates(baseDate, offset) {
  var d = new Date(baseDate + 'T00:00:00');
  d.setDate(d.getDate() + (offset || 0) * 7);
  var day = d.getDay();
  var mondayOff = day === 0 ? -6 : 1 - day;
  var monday = new Date(d);
  monday.setDate(monday.getDate() + mondayOff);
  var dates = [];
  for (var i = 0; i < 7; i++) {
    var dd = new Date(monday);
    dd.setDate(monday.getDate() + i);
    dates.push(fmtLocalDate(dd));
  }
  return dates;
}

/**
 * 判断指定日期某组任务的星星状态（绿/红/灰），用于进阶周结算
 * @param {string} dateStr - YYYY-MM-DD
 * @param {number[]} taskIds - 任务 ID 数组
 * @returns {'green'|'red'|'none'} 有加分→绿，有扣分→红，无记录→灰
 */
function getDayMultiStarStatus(dateStr, taskIds) {
  if (!data.dailyTasks || !data.dailyTasks[dateStr]) return 'none';
  var dd = data.dailyTasks[dateStr];
  var hasGreen = false, hasRed = false;
  taskIds.forEach(function(tid) {
    var t = dd.tasks[tid];
    if (t && t.done) {
      if (t.delta > 0) hasGreen = true;
      if (t.delta < 0) hasRed = true;
    }
  });
  if (hasRed) return 'red';
  if (hasGreen) return 'green';
  return 'none';
}

/**
 * 构建一周星星 HTML（7列：周一~周日）
 * @param {string[]} dates - 7 个日期字符串
 * @param {function(string): string} getStatusFn - 返回 'green'|'red'|'none'
 * @param {string} maxDate - 截止日期，未来日期显示灰星
 * @returns {string} HTML 字符串
 */
function buildStarHTML(dates, getStatusFn, maxDate) {
  var wk = ['一','二','三','四','五','六','日'];
  var html = '<div class="star-row">';
  dates.forEach(function(date, i) {
    var isFuture = date > maxDate;
    var status = isFuture ? 'none' : getStatusFn(date);
    var icon = status === 'none' ? '☆' : '★';
    var cls = status === 'green' ? 'star-green' : status === 'red' ? 'star-red' : 'star-gray';
    html += '<div class="star-col"><span class="star ' + cls + '">' + icon + '</span><span class="star-label">周' + wk[i] + '</span></div>';
  });
  html += '</div>';
  return html;
}

/**
 * 统计一周星星数量
 * @param {string[]} dates
 * @param {function(string): string} getStatusFn
 * @param {string} maxDate
 * @returns {{ green:number, red:number, gray:number }}
 */
function countStars(dates, getStatusFn, maxDate) {
  var green = 0, red = 0;
  dates.forEach(function(date) {
    if (date <= maxDate) {
      var s = getStatusFn(date);
      if (s === 'green') green++;
      if (s === 'red') red++;
    }
  });
  return { green: green, red: red, gray: 7 - green - red };
}

/**
 * 切换进阶页面周偏移（上一周/下一周）
 * @param {number} delta - 偏移量（-1 上一周，+1 下一周）
 */
function changeAdvWeek(delta) {
  var today = fmtLocalDate(new Date());
  var newOff = advWeekOffset + delta;
  if (newOff > 0) return;
  advWeekOffset = newOff;
  renderAdvanced();
}

/**
 * 计算一周的五类进阶结算（作业/整理/练书法/计算/阅读）
 * @param {string[]} weekDates - 7 个日期
 * @param {string} maxDate - 结算截止日期（本周取 today，历史周取周日）
 * @returns {object} 含 cat1~cat5 各项统计 + total 总分
 */
function calcSettlement(weekDates, maxDate) {
  // Cat1: 作业 task [1], 7绿→+10, >3红→-5
  var cat1s = countStars(weekDates, function(d) { return getDayMultiStarStatus(d, [1]); }, maxDate);
  var cat1Pts = 0, cat1Detail = [];
  if (cat1s.green >= 7) { cat1Pts += 10; cat1Detail.push('7颗绿星+10分'); }
  if (cat1s.red > 3) { cat1Pts -= 5; cat1Detail.push('超过3颗红星-5分'); }
  if (cat1Pts === 0) cat1Detail.push('未达标');

  // Cat2: 整理 task [3], 7绿→+10, >3红→-5
  var cat2s = countStars(weekDates, function(d) { return getDayMultiStarStatus(d, [3]); }, maxDate);
  var cat2Pts = 0, cat2Detail = [];
  if (cat2s.green >= 7) { cat2Pts += 10; cat2Detail.push('7颗绿星+10分'); }
  if (cat2s.red > 3) { cat2Pts -= 5; cat2Detail.push('超过3颗红星-5分'); }
  if (cat2Pts === 0) cat2Detail.push('未达标');

  // Cat3: 练书法 task [4], ≥2绿→+5, ≥2红→-5
  var cat3s = countStars(weekDates, function(d) { return getDayMultiStarStatus(d, [4]); }, maxDate);
  var cat3Pts = 0, cat3Detail = [];
  if (cat3s.green >= 2) { cat3Pts += 5; cat3Detail.push('2颗绿星+5分'); }
  if (cat3s.red >= 2) { cat3Pts -= 5; cat3Detail.push('2颗红星-5分'); }
  if (cat3Pts === 0) cat3Detail.push('未达标');

  // Cat4: 计算 task [2], 5绿→+3, 6绿→+5, 7绿→+10
  var cat4s = countStars(weekDates, function(d) { return getDayMultiStarStatus(d, [2]); }, maxDate);
  var cat4Pts = 0, cat4Detail = [];
  if (cat4s.green >= 7) { cat4Pts = 10; cat4Detail.push('7颗绿星+10分'); }
  else if (cat4s.green >= 6) { cat4Pts = 5; cat4Detail.push('6颗绿星+5分'); }
  else if (cat4s.green >= 5) { cat4Pts = 3; cat4Detail.push('5颗绿星+3分'); }
  else { cat4Detail.push('未达标'); }

  // Cat5: 阅读 task [5], 5绿→+3, 6绿→+5, 7绿→+10
  var cat5s = countStars(weekDates, function(d) { return getDayMultiStarStatus(d, [5]); }, maxDate);
  var cat5Pts = 0, cat5Detail = [];
  if (cat5s.green >= 7) { cat5Pts = 10; cat5Detail.push('7颗绿星+10分'); }
  else if (cat5s.green >= 6) { cat5Pts = 5; cat5Detail.push('6颗绿星+5分'); }
  else if (cat5s.green >= 5) { cat5Pts = 3; cat5Detail.push('5颗绿星+3分'); }
  else { cat5Detail.push('未达标'); }

  return {
    cat1: { green: cat1s.green, red: cat1s.red, gray: cat1s.gray, pts: cat1Pts, detail: cat1Detail },
    cat2: { green: cat2s.green, red: cat2s.red, gray: cat2s.gray, pts: cat2Pts, detail: cat2Detail },
    cat3: { green: cat3s.green, red: cat3s.red, gray: cat3s.gray, pts: cat3Pts, detail: cat3Detail },
    cat4: { green: cat4s.green, red: cat4s.red, gray: cat4s.gray, pts: cat4Pts, detail: cat4Detail },
    cat5: { green: cat5s.green, red: cat5s.red, gray: cat5s.gray, pts: cat5Pts, detail: cat5Detail },
    total: cat1Pts + cat2Pts + cat3Pts + cat4Pts + cat5Pts
  };
}

/**
 * 渲染进阶页面（5类周挑战 + 星星 + 结算区域 + 历史）
 */
function renderAdvanced() {
  if (!data.weeklySettlements) data.weeklySettlements = {};
  var today = fmtLocalDate(new Date());
  var weekDates = getWeekDates(today, advWeekOffset);
  var weekKey = weekDates[0];
  var isCurrentWeek = advWeekOffset === 0;
  var maxDate = isCurrentWeek ? today : weekDates[6];

  document.getElementById('advWeekTitle').textContent = isCurrentWeek ? '本周进阶挑战' : '历史周';
  document.getElementById('advWeekRange').textContent = weekDates[0] + ' ~ ' + weekDates[6];
  document.getElementById('advWeekPrev').style.visibility = 'visible';
  document.getElementById('advWeekNext').style.visibility = advWeekOffset >= 0 ? 'hidden' : 'visible';

  // 渲染星星
  document.getElementById('advCat1Stars').innerHTML = buildStarHTML(weekDates, function(d) { return getDayMultiStarStatus(d, [1]); }, maxDate);
  document.getElementById('advCat2Stars').innerHTML = buildStarHTML(weekDates, function(d) { return getDayMultiStarStatus(d, [3]); }, maxDate);
  document.getElementById('advCat3Stars').innerHTML = buildStarHTML(weekDates, function(d) { return getDayMultiStarStatus(d, [4]); }, maxDate);
  document.getElementById('advCat4Stars').innerHTML = buildStarHTML(weekDates, function(d) { return getDayMultiStarStatus(d, [2]); }, maxDate);
  document.getElementById('advCat5Stars').innerHTML = buildStarHTML(weekDates, function(d) { return getDayMultiStarStatus(d, [5]); }, maxDate);

  var st = calcSettlement(weekDates, maxDate);

  // 摘要
  function summaryHTML(c, extra) {
    return '<span style="color:var(--js-green)">绿星 ' + c.green + '</span>　<span style="color:var(--js-red)">红星 ' + c.red + '</span>　<span style="color:var(--js-text-secondary)">灰星 ' + c.gray + '</span>' + (extra || '');
  }
  document.getElementById('advCat1Summary').innerHTML = summaryHTML(st.cat1);
  document.getElementById('advCat2Summary').innerHTML = summaryHTML(st.cat2);
  document.getElementById('advCat3Summary').innerHTML = summaryHTML(st.cat3, '<span style="font-size:12px;color:var(--js-text-secondary);margin-left:6px">（已完成 ' + st.cat3.green + '/2 次）</span>');
  document.getElementById('advCat4Summary').innerHTML = summaryHTML(st.cat4);
  document.getElementById('advCat5Summary').innerHTML = summaryHTML(st.cat5);

  // 手风琴摘要行（折叠时可见）
  function accSummaryHTML(c) {
    return '<span style="color:var(--js-green)">' + c.green + '绿</span> <span style="color:var(--js-red)">' + c.red + '红</span> <span style="color:var(--js-text-secondary)">' + c.gray + '灰</span>';
  }
  var acc1 = document.getElementById('advCat1AccSum');
  var acc2 = document.getElementById('advCat2AccSum');
  var acc3 = document.getElementById('advCat3AccSum');
  var acc4 = document.getElementById('advCat4AccSum');
  var acc5 = document.getElementById('advCat5AccSum');
  if (acc1) acc1.innerHTML = accSummaryHTML(st.cat1);
  if (acc2) acc2.innerHTML = accSummaryHTML(st.cat2);
  if (acc3) acc3.innerHTML = accSummaryHTML(st.cat3);
  if (acc4) acc4.innerHTML = accSummaryHTML(st.cat4);
  if (acc5) acc5.innerHTML = accSummaryHTML(st.cat5);

  // 结算区域
  var settled = data.weeklySettlements[weekKey];
  var todayDow = new Date(today + 'T00:00:00').getDay();
  var isSunday = todayDow === 0;
  var area = document.getElementById('advSettleArea');

  if (settled) {
    var info = settled.details || {};
    area.innerHTML = '<div class="settled-box"><div style="font-size:14px;font-weight:500;color:var(--js-green);margin-bottom:6px">✅ 本周已结算</div>' +
      '<div style="font-size:13px;color:var(--js-text-secondary);line-height:1.8">' +
      '📝 作业：<strong style="color:' + (info.cat1Pts >= 0 ? 'var(--js-green)' : 'var(--js-red)') + '">' + (info.cat1Pts >= 0 ? '+' : '') + (info.cat1Pts || 0) + '分</strong><br>' +
      '🎒 整理：<strong style="color:' + (info.cat2Pts >= 0 ? 'var(--js-green)' : 'var(--js-red)') + '">' + (info.cat2Pts >= 0 ? '+' : '') + (info.cat2Pts || 0) + '分</strong><br>' +
      '✍️ 练书法：<strong style="color:' + (info.cat3Pts >= 0 ? 'var(--js-green)' : 'var(--js-red)') + '">' + (info.cat3Pts >= 0 ? '+' : '') + (info.cat3Pts || 0) + '分</strong><br>' +
      '🧮 计算：<strong style="color:' + (info.cat4Pts >= 0 ? 'var(--js-green)' : 'var(--js-red)') + '">' + (info.cat4Pts >= 0 ? '+' : '') + (info.cat4Pts || 0) + '分</strong><br>' +
      '📖 阅读：<strong style="color:' + (info.cat5Pts >= 0 ? 'var(--js-green)' : 'var(--js-red)') + '">' + (info.cat5Pts >= 0 ? '+' : '') + (info.cat5Pts || 0) + '分</strong><br>' +
      '<div style="margin-top:4px;font-size:14px;font-weight:500;color:' + (settled.totalPts >= 0 ? 'var(--js-green)' : 'var(--js-red)') + '">合计：' + (settled.totalPts >= 0 ? '+' : '') + settled.totalPts + '分</div>' +
      '</div>' + (settled.auto ? '<div style="font-size:11px;color:var(--js-yellow);margin-top:6px">（自动结算）</div>' : '') +
      '</div>';
  } else if (isCurrentWeek) {
    var previewPts = st.total;
    area.innerHTML =
      '<div style="text-align:center;margin-bottom:10px;font-size:13px;color:var(--js-text-secondary)">预计可获得：<strong style="color:' + (previewPts >= 0 ? 'var(--js-green)' : 'var(--js-red)') + '">' + (previewPts >= 0 ? '+' : '') + previewPts + ' 分</strong></div>' +
      '<button class="settle-btn ' + (isSunday ? 'active' : 'disabled') + '" onclick="doSettleWeek()" ' + (isSunday ? '' : 'disabled') + '>' +
      (isSunday ? '🎁 一键结算本周刷题积分' : '⏳ 请在周日进行结算') + '</button>' +
      (isSunday ? '' : '<div style="text-align:center;margin-top:6px;font-size:11px;color:var(--js-text-secondary)">周日自动激活结算按钮，或下周一登录时自动结算</div>');
  } else {
    area.innerHTML = '<div style="text-align:center;color:var(--js-text-secondary);font-size:13px">该周未结算</div>';
  }

  // 结算历史
  renderSettleHistory();
}

/**
 * 周日手动结算当前周刷题积分（仅周日可执行）
 */
async function doSettleWeek() {
  var today = fmtLocalDate(new Date());
  var todayDow = new Date(today + 'T00:00:00').getDay();
  if (todayDow !== 0) return;

  var weekDates = getWeekDates(today, 0);
  var weekKey = weekDates[0];
  if (!data.weeklySettlements) data.weeklySettlements = {};
  if (data.weeklySettlements[weekKey]) { showAlert('本周已结算！', 'error'); return; }

  var st = calcSettlement(weekDates, today);
  var total = st.total;

  if (total === 0) {
    if (!(await customConfirm('本周刷题积分为0，确认结算吗？', '结算确认'))) return;
  }

  data.advancedPoints = (data.advancedPoints || 0) + total;
  data.totalPoints = (data.dailyPoints || 0) + (data.advancedPoints || 0);

  var logDesc = '进阶结算（' + weekDates[0] + '~' + weekDates[6] + '）：';
  var parts = [];
  if (st.cat1.pts !== 0) parts.push('作业' + (st.cat1.pts > 0 ? '+' : '') + st.cat1.pts);
  if (st.cat2.pts !== 0) parts.push('整理' + (st.cat2.pts > 0 ? '+' : '') + st.cat2.pts);
  if (st.cat3.pts !== 0) parts.push('练书法' + (st.cat3.pts > 0 ? '+' : '') + st.cat3.pts);
  if (st.cat4.pts !== 0) parts.push('计算' + (st.cat4.pts > 0 ? '+' : '') + st.cat4.pts);
  if (st.cat5.pts !== 0) parts.push('阅读' + (st.cat5.pts > 0 ? '+' : '') + st.cat5.pts);
  logDesc += parts.length ? parts.join('，') : '无达标奖励';

  data.pointsLog.push({
    id: Date.now().toString() + 'w',
    time: new Date().toISOString(),
    type: total >= 0 ? 'earn' : 'spend',
    delta: total,
    balance: data.advancedPoints,
    pool: 'advanced',
    desc: logDesc,
    _weeklySettle: weekKey
  });

  data.weeklySettlements[weekKey] = {
    time: new Date().toLocaleString('zh-CN'),
    totalPts: total,
    auto: false,
    details: {
      cat1Pts: st.cat1.pts, cat2Pts: st.cat2.pts, cat3Pts: st.cat3.pts, cat4Pts: st.cat4.pts, cat5Pts: st.cat5.pts,
      cat1Green: st.cat1.green, cat1Red: st.cat1.red,
      cat2Green: st.cat2.green, cat2Red: st.cat2.red,
      cat3Green: st.cat3.green, cat3Red: st.cat3.red,
      cat4Green: st.cat4.green, cat4Red: st.cat4.red,
      cat5Green: st.cat5.green, cat5Red: st.cat5.red
    }
  };
  saveData(data);
  showAlert('本周进阶结算完成！' + (total !== 0 ? '<strong>' + (total > 0 ? '+' : '') + total + ' 分</strong>' : ''));
  renderAdvanced();
}

/**
 * 周一登录时自动检查上周是否已结算，未结算则自动结算（静默执行）
 */
function checkAutoSettle() {
  if (!data.weeklySettlements) data.weeklySettlements = {};
  var today = fmtLocalDate(new Date());
  var todayDow = new Date(today + 'T00:00:00').getDay();
  if (todayDow !== 1) return;

  var lastWeekDates = getWeekDates(today, -1);
  var lastWeekKey = lastWeekDates[0];
  if (data.weeklySettlements[lastWeekKey]) return;

  var st = calcSettlement(lastWeekDates, lastWeekDates[6]);
  var total = st.total;
  data.advancedPoints = (data.advancedPoints || 0) + total;
  data.totalPoints = (data.dailyPoints || 0) + (data.advancedPoints || 0);

  var logDesc = '进阶自动结算（' + lastWeekDates[0] + '~' + lastWeekDates[6] + '）：';
  var parts = [];
  if (st.cat1.pts !== 0) parts.push('作业' + (st.cat1.pts > 0 ? '+' : '') + st.cat1.pts);
  if (st.cat2.pts !== 0) parts.push('整理' + (st.cat2.pts > 0 ? '+' : '') + st.cat2.pts);
  if (st.cat3.pts !== 0) parts.push('练书法' + (st.cat3.pts > 0 ? '+' : '') + st.cat3.pts);
  if (st.cat4.pts !== 0) parts.push('计算' + (st.cat4.pts > 0 ? '+' : '') + st.cat4.pts);
  if (st.cat5.pts !== 0) parts.push('阅读' + (st.cat5.pts > 0 ? '+' : '') + st.cat5.pts);
  logDesc += parts.length ? parts.join('，') : '无达标奖励';

  data.pointsLog.push({
    id: Date.now().toString() + 'w',
    time: new Date().toISOString(),
    type: total >= 0 ? 'earn' : 'spend',
    delta: total,
    balance: data.advancedPoints,
    pool: 'advanced',
    desc: logDesc,
    _weeklySettle: lastWeekKey
  });

  data.weeklySettlements[lastWeekKey] = {
    time: new Date().toLocaleString('zh-CN'),
    totalPts: total,
    auto: true,
    details: {
      cat1Pts: st.cat1.pts, cat2Pts: st.cat2.pts, cat3Pts: st.cat3.pts, cat4Pts: st.cat4.pts, cat5Pts: st.cat5.pts,
      cat1Green: st.cat1.green, cat1Red: st.cat1.red,
      cat2Green: st.cat2.green, cat2Red: st.cat2.red,
      cat3Green: st.cat3.green, cat3Red: st.cat3.red,
      cat4Green: st.cat4.green, cat4Red: st.cat4.red,
      cat5Green: st.cat5.green, cat5Red: st.cat5.red
    }
  };
  saveData(data);
  if (total !== 0) {
    showAlert('上周进阶自动结算完成：' + (total > 0 ? '+' : '') + total + ' 分');
  }
}

/**
 * 渲染进阶结算历史表格（按周倒序）
 */
function renderSettleHistory() {
  if (!data.weeklySettlements) data.weeklySettlements = {};
  var keys = Object.keys(data.weeklySettlements).sort(function(a, b) { return b.localeCompare(a); });
  var div = document.getElementById('advSettleHistory');
  var empty = document.getElementById('advSettleHistoryEmpty');
  if (!keys.length) { div.innerHTML = ''; empty.classList.remove('hidden'); return; }
  empty.classList.add('hidden');
  var html = '<table style="width:100%;font-size:12px"><thead><tr><th>周次</th><th>作业</th><th>整理</th><th>练书法</th><th>计算</th><th>阅读</th><th>合计</th></tr></thead><tbody>';
  keys.forEach(function(key) {
    var s = data.weeklySettlements[key];
    var d = new Date(key + 'T00:00:00');
    d.setDate(d.getDate() + 6);
    var end = fmtLocalDate(d);
    var info = s.details || {};
    function ptCell(v) {
      if (!v) v = 0;
      return '<span style="color:' + (v >= 0 ? 'var(--js-green)' : 'var(--js-red)') + '">' + (v >= 0 ? '+' : '') + v + '</span>';
    }
    html += '<tr><td>' + key.slice(5) + '~' + end.slice(5) + (s.auto ? '<br><span style="color:var(--js-yellow);font-size:10px">自动</span>' : '') + '</td>' +
      '<td>' + ptCell(info.cat1Pts) + '</td><td>' + ptCell(info.cat2Pts) + '</td><td>' + ptCell(info.cat3Pts) + '</td><td>' + ptCell(info.cat4Pts) + '</td><td>' + ptCell(info.cat5Pts) + '</td>' +
      '<td><strong>' + ptCell(s.totalPts) + '</strong></td></tr>';
  });
  div.innerHTML = html + '</tbody></table>';
}

/* ===== Tab 切换（桌面端） ===== */
/**
 * 切换主 Tab（总览/刷题/日常/进阶/积分/设置）
 * @param {string} tab - 目标 tab ID
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

/* ===== 工具 ===== */
/**
 * 生成排名徽章 HTML（金牌/银牌/铜牌/普通）
 * @param {number} rank - 排名
 * @returns {string} HTML 字符串
 */
function getRankBadge(rank) {
  if (rank === 1) return '<span class="badge badge-gold">第1名</span>';
  if (rank === 2) return '<span class="badge badge-gray">第2名</span>';
  if (rank === 3) return '<span class="badge badge-yellow">第3名</span>';
  return '<span class="badge badge-gray">第' + rank + '名</span>';
}

/**
 * 计算录入成绩可获得的积分（基础+前3奖励+连续奖励预览）
 * @param {number} rank - 排名
 * @returns {{ pts:number, detail:string[] }} 积分和明细
 */
function calcPoints(rank) {
  var rules = data.rules;
  var pts = rules.base;
  var detail = ['录入基础 +' + rules.base];
  if (rank <= 3) {
    pts += rules.top3;
    detail.push('前3名奖励 +' + rules.top3);
    var streak = data.consecutiveTop3 + 1;
    if (streak >= 3) {
      var extra = rules.streakBase * (streak - 2);
      pts += extra;
      detail.push('连续' + streak + '次前3名奖励 +' + extra);
    }
  }
  return { pts: pts, detail: detail };
}

/**
 * 排名输入框实时预览预期积分（绑定 input 事件）
 */
function updatePointsPreview() {
  var rank = parseInt(document.getElementById('inp-rank').value);
  var preview = document.getElementById('pointsPreview');
  if (!rank || rank < 1) { preview.classList.add('hidden'); return; }
  var res = calcPoints(rank);
  preview.classList.remove('hidden');
  preview.innerHTML = '本次将获得 <strong>' + res.pts + ' 积分</strong>：' + res.detail.join('，');
}

document.getElementById('inp-rank').addEventListener('input', updatePointsPreview);

/* ===== 录入成绩 ===== */
/**
 * 录入一条成绩记录，自动计算积分（基础+前3奖励+连续奖励），遵循三点同步铁律
 */
function addRecord() {
  var date = document.getElementById('inp-date').value;
  var subject = document.getElementById('inp-subject').value.trim();
  var score = parseFloat(document.getElementById('inp-score').value);
  var rank = parseInt(document.getElementById('inp-rank').value);
  var total = null;
  var note = document.getElementById('inp-note').value.trim();
  if (!date || !subject || isNaN(score) || isNaN(rank)) {
    showAlert('请填写完整的日期、科目、成绩和排名', 'error'); return;
  }
  if (rank < 1) { showAlert('排名必须大于0', 'error'); return; }

  var earnedPts = data.rules.base;
  var logDetails = ['录入基础 +' + data.rules.base];
  if (rank <= 3) {
    earnedPts += data.rules.top3;
    logDetails.push('前3名奖励 +' + data.rules.top3);
    data.consecutiveTop3 = (data.consecutiveTop3 || 0) + 1;
    if (data.consecutiveTop3 >= 3) {
      var extra = data.rules.streakBase * (data.consecutiveTop3 - 2);
      earnedPts += extra;
      logDetails.push('连续' + data.consecutiveTop3 + '次前3名额外 +' + extra);
    }
  } else {
    data.consecutiveTop3 = 0;
  }

  var id = Date.now().toString();
  data.records.push({
    id:id, date:date, subject:subject, score:score,
    rank:rank, total:total, note:note, earnedPts:earnedPts,
    createdAt:new Date().toISOString()
  });
  data.advancedPoints = (data.advancedPoints || 0) + earnedPts;
  data.totalPoints = (data.dailyPoints || 0) + data.advancedPoints;
  data.pointsLog.push({
    id:id+'p', time:new Date().toISOString(), type:'earn', pool:'advanced',
    delta:earnedPts, balance:data.advancedPoints,
    desc:'录入成绩：'+subject+'（排名第'+rank+'名）— '+logDetails.join('，')
  });
  saveData(data);
  checkAchievements();
  showAlert('录入成功！获得 <strong>'+earnedPts+' 刷题积分</strong>，当前刷题积分：<strong>'+data.advancedPoints+'</strong>');
  ['inp-subject','inp-score','inp-rank','inp-note'].forEach(function(id){
    document.getElementById(id).value = '';
  });
  document.getElementById('inp-date').value = '';
  document.getElementById('pointsPreview').classList.add('hidden');
  renderDashboard();
  renderPracticeStats();
}

/**
 * 渲染刷题页面录入面板顶部统计：录入次数、平均成绩、前3名次数、连续前3
 */
function renderPracticeStats() {
  var el = document.getElementById('practiceStats');
  if (!el) return;
  var records = data.records;
  var total = records.length;
  var avg = total ? Math.round(records.reduce(function(s,r){return s+r.score;},0)/total*10)/10 : '--';
  var top3 = records.filter(function(r){return r.rank<=3;}).length;
  var streak = data.consecutiveTop3 || 0;
  el.innerHTML =
    '<div class="metrics" style="margin-bottom:0">'+
      '<div class="metric"><div class="metric-label">录入次数</div><div class="metric-value" style="color:#00e8ff">'+total+'</div></div>'+
      '<div class="metric"><div class="metric-label">平均成绩</div><div class="metric-value" style="color:#22ffb3">'+avg+'</div></div>'+
      '<div class="metric"><div class="metric-label">前3名次数</div><div class="metric-value" style="color:#fbbf24">'+top3+'</div></div>'+
      '<div class="metric"><div class="metric-label">连续前3</div><div class="metric-value" style="color:#22ffb3">'+streak+' 次</div></div>'+
    '</div>';
}

/**
 * 删除一条成绩记录，同步扣减积分（三点同步：totalPoints + pointsLog + UI刷新）
 * @param {string} id - 记录 ID
 */
async function deleteRecord(id) {
  var record = data.records.find(function(r){ return r.id === id; });
  if (!record) { showAlert("记录不存在", "error"); return; }
  var pts = record.earnedPts || 0;
  if (!(await customConfirm("确定删除「" + record.subject + "」记录？将扣减 " + pts + " 积分。", "删除确认"))) return;
  data.records = data.records.filter(function(r){ return r.id !== id; });
  if (pts > 0) {
    data.advancedPoints = Math.max(0, (data.advancedPoints || 0) - pts);
    data.totalPoints = (data.dailyPoints || 0) + data.advancedPoints;
    data.pointsLog.push({
      id: Date.now().toString() + "_del",
      time: new Date().toISOString(),
      type: "delete", pool:'advanced',
      delta: -pts,
      balance: data.advancedPoints,
      desc: "删除记录「" + record.subject + "」，扣减刷题积分"
    });
  }
  saveData(data);
  renderHistory();
  renderDashboard();
  renderPracticeStats();
  showAlert("已删除「" + record.subject + "」，扣减 " + pts + " 积分");
}

/* ===== 日常任务子标签切换 ===== */
/**
 * 切换日常模块子面板（打卡/历史），更新 UI 并渲染对应面板
 * @param {string} sub - 'checkin' | 'dailyHistory'
 * @param {HTMLElement} el - 被点击的子标签元素
 */
function switchDailySubTab(sub, el) {
  currentDailySubTab = sub;
  document.querySelectorAll('#dailySubTabs .sub-tab').forEach(function(t){ t.classList.remove('active'); });
  if (el) el.classList.add('active');
  document.querySelectorAll('#panel-daily .sub-panel').forEach(function(p){ p.classList.remove('active'); });
  var panelId = sub === 'dailyHistory' ? 'sub-daily-history' : 'sub-daily-' + sub;
  var panel = document.getElementById(panelId);
  if (panel) panel.classList.add('active');
  if (sub === 'checkin') renderDaily();
  if (sub === 'dailyHistory') renderDailyHistory();
  window.scrollTo({top:0, behavior:'smooth'});
}

/* ===== 日常任务定义 ===== */
var DAILY_TASKS = [
  {
    id: 1,
    name: '按时完成课内作业、不拖拉',
    icon: '📝',
    plusPts: 5,
    minusTrigger: '写作业分心、发呆、磨蹭',
    minusPts: -5,
    desc: '作业专心完成，无拖延行为'
  },
  {
    id: 2,
    name: '计算检查全对',
    icon: '🧮',
    plusPts: 5,
    minusTrigger: '',
    minusPts: 0,
    desc: '数学/计算题细心检查，全部正确'
  },
  {
    id: 3,
    name: '自主整理书包、书桌、玩具',
    icon: '🎒',
    plusPts: 5,
    minusTrigger: '乱扔物品、不整理',
    minusPts: -5,
    desc: '主动整理学习环境，物品归位'
  },
  {
    id: 4,
    name: '练书法（每周2次）',
    icon: '✍️',
    plusPts: 5,
    minusTrigger: '没完成练字',
    minusPts: -5,
    desc: '按计划完成书法练习'
  },
  {
    id: 5,
    name: '20分钟课外阅读',
    icon: '📖',
    plusPts: 5,
    minusTrigger: '',
    minusPts: 0,
    desc: '认真阅读并有所收获'
  }
];

var BEDTIME_RULES = [
  { key: 'chat', label: '要聊天', time: '9:10上床', pts: 5, icon: '💬' },
  { key: 'quiet', label: '不要聊天', time: '9:30上床', pts: 5, icon: '🤫' },
  { key: 'late', label: '特殊情况', time: '11:00上床', pts: 5, icon: '🌙' }
];

/* ===== 获取/初始化某日数据 ===== */
/**
 * 获取指定日期的日常任务数据，不存在则初始化空结构
 * @param {string} date - YYYY-MM-DD 格式
 * @returns {{ tasks:object, bedtime:object|null, extras:Array }}
 */
function getDayData(date) {
  if (!data.dailyTasks) data.dailyTasks = {};
  if (!data.dailyTasks[date]) {
    data.dailyTasks[date] = {
      tasks: {}, // { taskId: { done: bool, delta: int, ts: string } }
      bedtime: null, // { key: string, pts: int, ts: string }
      extras: [] // [{ desc: string, pts: int, ts: string }]
    };
  }
  return data.dailyTasks[date];
}

/* ===== 任务打卡（加分） ===== */
/**
 * 日常任务打卡/取消。加分时调用 addDailyPointsLog，取消时撤回积分并移除日志。
 * 遵循三点同步铁律。
 * @param {number} taskId - DAILY_TASKS 中的任务 ID
 */
function taskCheck(taskId) {
  var date = document.getElementById('daily-date').value;
  if (!date) { showAlert('请先选择日期', 'error'); return; }
  var dayData = getDayData(date);
  var task = DAILY_TASKS.find(function(t){ return t.id === taskId; });
  if (!task) return;

  var alreadyDone = dayData.tasks[taskId] && dayData.tasks[taskId].done;
  if (alreadyDone) {
    // 取消打卡
    var prevDelta = dayData.tasks[taskId].delta;
    if (prevDelta > 0) {
      data.dailyPoints = (data.dailyPoints || 0) - prevDelta;
      data.totalPoints = data.dailyPoints + (data.advancedPoints || 0);
      removeLastDailyLog(date, 'task_' + taskId);
      dayData.tasks[taskId] = { done: false, delta: 0, ts: null };
      showAlert(task.name + ' 打卡已取消（-' + prevDelta + '分）');
    } else if (prevDelta < 0) {
      data.dailyPoints = (data.dailyPoints || 0) - prevDelta;
      data.totalPoints = data.dailyPoints + (data.advancedPoints || 0);
      removeLastDailyLog(date, 'task_' + taskId);
      dayData.tasks[taskId] = { done: false, delta: 0, ts: null };
      showAlert(task.name + ' 扣分已取消（+' + Math.abs(prevDelta) + '分）');
    }
  } else {
    // 打卡加分
    data.dailyPoints = (data.dailyPoints || 0) + task.plusPts;
    data.totalPoints = data.dailyPoints + (data.advancedPoints || 0);
    dayData.tasks[taskId] = { done: true, delta: task.plusPts, ts: new Date().toISOString() };
    addDailyPointsLog(date, 'earn', task.plusPts, task.icon + ' ' + task.name, 'task_' + taskId);
    showAlert(task.icon + ' ' + task.name + ' 已完成！<strong>+' + task.plusPts + '分</strong>');
  }
  saveData(data);
  renderDaily();
  checkAchievements();
}

/* ===== 任务扣分 ===== */
/**
 * 日常任务扣分（仅含 minusTrigger 的任务支持）。若已加分则撤回后再扣；已扣分不允许重复扣。
 * @param {number} taskId - DAILY_TASKS 的任务 ID
 */
function taskDeduct(taskId) {
  var date = document.getElementById('daily-date').value;
  if (!date) { showAlert('请先选择日期', 'error'); return; }
  var dayData = getDayData(date);
  var task = DAILY_TASKS.find(function(t){ return t.id === taskId; });
  if (!task || !task.minusTrigger) { showAlert('该项目不支持扣分', 'error'); return; }

  var wasDone = dayData.tasks[taskId] && dayData.tasks[taskId].done;
  if (wasDone && dayData.tasks[taskId].delta > 0) {
    data.dailyPoints = (data.dailyPoints || 0) - dayData.tasks[taskId].delta;
    data.totalPoints = data.dailyPoints + (data.advancedPoints || 0);
    removeLastDailyLog(date, 'task_' + taskId);
  }
  if (wasDone && dayData.tasks[taskId].delta < 0) {
    showAlert(task.name + ' 今日已扣分，不能重复扣！', 'error');
    return;
  }

  data.dailyPoints = (data.dailyPoints || 0) + task.minusPts;
  data.totalPoints = data.dailyPoints + (data.advancedPoints || 0);
  dayData.tasks[taskId] = { done: true, delta: task.minusPts, ts: new Date().toISOString() };
  addDailyPointsLog(date, 'spend', task.minusPts, task.icon + ' ' + task.minusTrigger, 'task_' + taskId);
  showAlert(task.icon + ' ' + task.minusTrigger + '！<strong>' + task.minusPts + '分</strong>');
  saveData(data);
  renderDaily();
}

/* ===== 就寝打卡 ===== */
/**
 * 就寝打卡（三选一：聊天/安静/特殊情况），再次点击可取消。切换规则时先撤回旧记录再加新记录。
 * @param {string} key - BEDTIME_RULES 中的 key ('chat'/'quiet'/'late')
 */
function bedtimeCheck(key) {
  var date = document.getElementById('daily-date').value;
  if (!date) { showAlert('请先选择日期', 'error'); return; }
  var dayData = getDayData(date);
  var rule = BEDTIME_RULES.find(function(r){ return r.key === key; });
  if (!rule) return;

  if (dayData.bedtime && dayData.bedtime.key === key) {
    // 取消
    data.dailyPoints = (data.dailyPoints || 0) - rule.pts;
    removeLastDailyLog(date, 'bedtime');
    dayData.bedtime = null;
    data.totalPoints = (data.dailyPoints || 0) + (data.advancedPoints || 0);
    showAlert('就寝打卡已取消（-' + rule.pts + '分）');
  } else {
    // 之前有其他就寝记录，先撤回
    if (dayData.bedtime) {
      var prev = BEDTIME_RULES.find(function(r){ return r.key === dayData.bedtime.key; });
      if (prev) {
        data.dailyPoints = (data.dailyPoints || 0) - prev.pts;
        removeLastDailyLog(date, 'bedtime');
      }
    }
    data.dailyPoints = (data.dailyPoints || 0) + rule.pts;
    data.totalPoints = (data.dailyPoints || 0) + (data.advancedPoints || 0);
    dayData.bedtime = { key: key, pts: rule.pts, ts: new Date().toISOString() };
    addDailyPointsLog(date, 'earn', rule.pts, rule.icon + ' ' + rule.label + '（' + rule.time + '）', 'bedtime');
    showAlert(rule.icon + ' ' + rule.label + '（' + rule.time + '）已记录！<strong>+' + rule.pts + '分</strong>');
  }
  saveData(data);
  renderDaily();
}

/* ===== 附加任务 ===== */
/**
 * 添加一条附加加分记录（自定义描述+分值），遵循三点同步铁律
 */
function addExtraTask() {
  var date = document.getElementById('daily-date').value;
  if (!date) { showAlert('请先选择日期', 'error'); return; }
  var desc = document.getElementById('extra-task-desc').value.trim();
  var pts = parseInt(document.getElementById('extra-task-pts').value);
  if (!desc || !pts || pts < 1) { showAlert('请填写加分说明和分值', 'error'); return; }

  var dayData = getDayData(date);
  var id = Date.now().toString();
  data.dailyPoints = (data.dailyPoints || 0) + pts;
  data.totalPoints = (data.dailyPoints || 0) + (data.advancedPoints || 0);
  dayData.extras.push({ id: id, desc: desc, pts: pts, ts: new Date().toISOString() });
  addDailyPointsLog(date, 'earn', pts, '附加：' + desc, 'extra_' + id);
  saveData(data);
  document.getElementById('extra-task-desc').value = '';
  document.getElementById('extra-task-pts').value = '';
  showAlert('附加记录已添加！<strong>+' + pts + '分</strong>');
  renderDaily();
}

/* ===== 删除附加记录 ===== */
/**
 * 删除一条附加记录并撤回对应积分
 * @param {string} date - YYYY-MM-DD
 * @param {string} extraId - 附加记录 ID
 */
function removeExtraTask(date, extraId) {
  var dayData = getDayData(date);
  var extra = dayData.extras.find(function(e){ return e.id === extraId; });
  if (!extra) return;
  data.dailyPoints = (data.dailyPoints || 0) - extra.pts;
  data.totalPoints = (data.dailyPoints || 0) + (data.advancedPoints || 0);
  removeLastDailyLog(date, 'extra_' + extraId);
  dayData.extras = dayData.extras.filter(function(e){ return e.id !== extraId; });
  saveData(data);
  showAlert('附加记录已删除（-' + extra.pts + '分）');
  renderDaily();
}

/* ===== 添加行为积分日志 ===== */
/**
 * 向积分日志追加一条日常任务相关记录
 * @param {string} date - 日期 YYYY-MM-DD
 * @param {string} type - 'earn' | 'spend'
 * @param {number} delta - 积分变动
 * @param {string} desc - 描述
 * @param {string} category - 类别标签（task_1 / bedtime / extra_xxx）
 */
function addDailyPointsLog(date, type, delta, desc, category) {
  data.pointsLog.push({
    id: Date.now().toString() + 'd',
    time: new Date().toISOString(),
    type: type,
    delta: delta,
    balance: data.dailyPoints,
    desc: '[' + date + '] ' + desc,
    pool: 'daily',
    _dailyCat: category || 'task'
  });
}

/* ===== 移除行为积分日志（取消操作时） ===== */
/**
 * 移除当天该类别的最后一条积分日志，用于取消打卡时撤回积分记录
 * @param {string} date - YYYY-MM-DD
 * @param {string} category - 类别标签，与 addDailyPointsLog 对应
 */
function removeLastDailyLog(date, category) {
  // 找到当天该类别最新的日志并移除
  for (var i = data.pointsLog.length - 1; i >= 0; i--) {
    var log = data.pointsLog[i];
    if (log.desc && log.desc.indexOf('[' + date + ']') === 0 && log._dailyCat === category) {
      data.pointsLog.splice(i, 1);
      return;
    }
  }
  // 兜底：移除当天最后一条
  for (var j = data.pointsLog.length - 1; j >= 0; j--) {
    if (data.pointsLog[j].desc && data.pointsLog[j].desc.indexOf('[' + date + ']') === 0) {
      data.pointsLog.splice(j, 1);
      return;
    }
  }
}

/* ===== 计算某日行为积分 ===== */
/**
 * 计算指定日期的行为积分汇总（赚取/扣除/附加）
 * @param {string} date - YYYY-MM-DD
 * @returns {{ earned:number, spent:number, extras:number, total:number }}
 */
function calcDayPoints(date) {
  if (!data.dailyTasks || !data.dailyTasks[date]) return { earned: 0, spent: 0, extras: 0 };
  var dd = data.dailyTasks[date];
  var earned = 0, spent = 0;
  Object.keys(dd.tasks).forEach(function(k){
    var d = dd.tasks[k];
    if (d && d.delta) {
      if (d.delta > 0) earned += d.delta;
      else spent += Math.abs(d.delta);
    }
  });
  if (dd.bedtime) earned += dd.bedtime.pts;
  var extras = (dd.extras || []).reduce(function(s, e){ return s + e.pts; }, 0);
  return { earned: earned, spent: spent, extras: extras, total: earned - spent + extras };
}

/* ===== 渲染：日常打卡 ===== */
/**
 * 渲染日常打卡面板（任务列表、就寝打卡、附加任务、当日积分统计）
 */
function renderDaily() {
  var date = document.getElementById('daily-date').value;
  if (!date) {
    var today = fmtLocalDate(new Date());
    document.getElementById('daily-date').value = today;
    date = today;
  }

  // 显示日期摘要（星期）
  var d = new Date(date + 'T00:00:00');
  var weekdays = ['周日','周一','周二','周三','周四','周五','周六'];
  var weekStr = weekdays[d.getDay()];
  var isToday = date === fmtLocalDate(new Date());
  document.getElementById('dailyDateSummary').innerHTML =
    '<strong>' + (isToday ? '📅 今日' : '') + date + '</strong>　' + weekStr;

  var dayData = getDayData(date);
  var ptsInfo = calcDayPoints(date);

  // 积分统计
  var earned = 0, spent = 0;
  Object.keys(dayData.tasks).forEach(function(k){
    var t = dayData.tasks[k];
    if (t.delta > 0) earned += t.delta;
    else if (t.delta < 0) spent += Math.abs(t.delta);
  });
  if (dayData.bedtime) earned += dayData.bedtime.pts;
  var extras = (dayData.extras || []).reduce(function(s, e){ return s + e.pts; }, 0);

  document.getElementById('dailyMetrics').innerHTML =
    '<div class="metric"><div class="metric-label">当日获得</div><div class="metric-value green">+' + (earned + extras) + '</div></div>' +
    '<div class="metric"><div class="metric-label">当日扣分</div><div class="metric-value" style="color:var(--js-red)">' + spent + '</div></div>' +
    '<div class="metric"><div class="metric-label">当日净得</div><div class="metric-value ' + (earned + extras - spent > 0 ? 'gold' : '') + '">' + (earned + extras - spent > 0 ? '+' : '') + (earned + extras - spent) + '</div></div>' +
    '<div class="metric"><div class="metric-label">行为积分余额</div><div class="metric-value gold">' + (data.dailyPoints || 0) + '</div></div>';

  // 任务卡片
  var taskList = document.getElementById('dailyTaskList');
  var html = '';
  DAILY_TASKS.forEach(function(task){
    var state = dayData.tasks[task.id];
    var done = state && state.done;
    var delta = state ? state.delta : 0;
    var canMinus = task.minusPts < 0;

    // 状态颜色
    var cardBg = done ? (delta > 0 ? 'var(--task-done-bg)' : 'var(--task-fail-bg)') : 'var(--task-todo-bg)';
    var cardBorder = done ? (delta > 0 ? 'var(--task-done-border)' : 'var(--task-fail-border)') : 'var(--task-todo-border)';
    var stateLabel = done ? (delta > 0 ? '<span class="badge badge-green">+'+delta+'分</span>' : '<span class="badge badge-red">'+delta+'分</span>') : '<span class="badge badge-gray">未打卡</span>';
    var checkBtnClass = done && delta > 0 ? 'btn btn-primary' : 'btn';
    var minusBtnClass = done && delta < 0 ? 'btn btn-danger' : 'btn';
    var checkDisabled = done && delta > 0 ? 'style="opacity:0.5"' : '';
    var minusDisabled = (done && delta < 0) || !canMinus ? 'style="opacity:0.35;cursor:not-allowed"' : '';

    var taskStateClass = done ? (delta > 0 ? ' task-done' : ' task-fail') : '';
    html += '<div class="card' + taskStateClass + '" style="margin-top:8px;background:'+cardBg+';border:1px solid '+cardBorder+'">' +
      '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px;flex-wrap:wrap;gap:6px">' +
        '<div>' +
          '<span style="font-size:16px;margin-right:6px">'+task.icon+'</span>' +
          '<strong style="font-size:14px">'+task.name+'</strong>' +
          '<div style="font-size:11px;color:var(--js-text-secondary);margin-top:2px">'+task.desc+'</div>' +
          (canMinus ? '<div style="font-size:11px;color:var(--js-red);margin-top:2px">扣分条件：'+task.minusTrigger+'</div>' : '') +
          '<div style="font-size:11px;color:var(--js-cyan);margin-top:2px">加分 +'+task.plusPts+'分</div>' +
        '</div>' +
        '<div style="text-align:right">'+stateLabel+'</div>' +
      '</div>' +
      '<div style="display:flex;gap:6px;flex-wrap:wrap">' +
        '<button class="'+checkBtnClass+'" '+checkDisabled+' onclick="taskCheck('+task.id+')" style="flex:1;min-width:80px;font-size:13px;padding:7px">' +
          (done && delta > 0 ? '✅ 已完成' : '✅ 打卡 +'+task.plusPts+'分') +
        '</button>';
    if (canMinus) {
      html += '<button class="'+minusBtnClass+'" '+minusDisabled+' onclick="taskDeduct('+task.id+')" style="flex:1;min-width:80px;font-size:13px;padding:7px">' +
        (done && delta < 0 ? '❌ 已扣分' : '❌ 扣分 '+task.minusPts+'分') +
      '</button>';
    }
    html += '</div></div>';
  });
  taskList.innerHTML = html;

  // 未打卡提示
  var uncheckedCount = 0;
  var uncheckedNames = [];
  DAILY_TASKS.forEach(function(task) {
    var state = dayData.tasks[task.id];
    if (!state || !state.done) {
      uncheckedCount++;
      uncheckedNames.push(task.icon + ' ' + task.name);
    }
  });
  var reminderDiv = document.getElementById('dailyCheckinReminder');
  if (uncheckedCount > 0) {
    reminderDiv.classList.remove('hidden');
    reminderDiv.innerHTML = '<div class="text-sm" style="color:var(--js-yellow);line-height:1.6">' +
      '⚠️ <strong>还有 ' + uncheckedCount + ' 项未打卡</strong>，记得完成所有项目哦！<br>' +
      '<span class="text-xs text-secondary">' + uncheckedNames.join('　|　') + '</span></div>';
  } else {
    reminderDiv.classList.add('hidden');
  }

  // 就寝打卡状态
  var bedtimeStatus = document.getElementById('bedtimeStatus');
  if (dayData.bedtime) {
    var br = BEDTIME_RULES.find(function(r){ return r.key === dayData.bedtime.key; });
    bedtimeStatus.innerHTML = '已记录：' + (br ? br.icon + ' ' + br.label + '（' + br.time + '）' : dayData.bedtime.key) +
      '　<button class="btn" style="padding:2px 8px;font-size:11px;margin-left:8px" onclick="bedtimeCancel()">取消</button>';
  } else {
    bedtimeStatus.innerHTML = '今日还未记录就寝时间，请点击下方按钮打卡';
  }

  // 更新就寝按钮状态
  BEDTIME_RULES.forEach(function(r){
    var btn = document.getElementById('btn-bed-' + r.key);
    if (btn) {
      var active = dayData.bedtime && dayData.bedtime.key === r.key;
      btn.style.fontWeight = active ? '600' : '400';
      btn.style.boxShadow = active ? '0 0 0 2px ' + (r.key === 'chat' ? 'var(--js-cyan)' : r.key === 'quiet' ? 'var(--js-green)' : 'var(--js-yellow)') : 'none';
    }
  });

  // 附加记录列表
  var extrasDiv = document.getElementById('extraTaskList');
  if (dayData.extras && dayData.extras.length > 0) {
    var exHtml = '<table style="width:100%;font-size:12px"><thead><tr><th>说明</th><th>分值</th><th>操作</th></tr></thead><tbody>';
    dayData.extras.forEach(function(e){
      exHtml += '<tr><td>' + e.desc + '</td><td style="color:var(--js-green)"><strong>+' + e.pts + '</strong></td><td><button class="btn btn-danger" style="padding:2px 8px;font-size:11px" onclick="removeExtraTask(\'' + date + '\',\'' + e.id + '\')">删除</button></td></tr>';
    });
    extrasDiv.innerHTML = exHtml + '</tbody></table>';
  } else {
    extrasDiv.innerHTML = '';
  }
}

/* ===== 取消就寝 ===== */
/**
 * 取消当天的就寝打卡记录，撤回对应积分并删除日志
 */
function bedtimeCancel() {
  var date = document.getElementById('daily-date').value;
  if (!date) return;
  var dayData = getDayData(date);
  if (!dayData.bedtime) return;
  var prev = BEDTIME_RULES.find(function(r){ return r.key === dayData.bedtime.key; });
  if (prev) {
    data.dailyPoints = (data.dailyPoints || 0) - prev.pts;
    data.totalPoints = (data.dailyPoints || 0) + (data.advancedPoints || 0);
  }
  removeLastDailyLog(date, 'bedtime');
  dayData.bedtime = null;
  saveData(data);
  showAlert('就寝打卡已取消');
  renderDaily();
}

/* ===== 渲染：日常历史 ===== */
/**
 * 渲染日常打卡历史记录，桌面端表格 + 移动端卡片，显示日期-任务-积分明细
 */
function renderDailyHistory() {
  if (!data.dailyTasks) data.dailyTasks = {};
  var dates = Object.keys(data.dailyTasks).sort(function(a,b){ return b.localeCompare(a); });
  var tbody = document.getElementById('dailyHistoryTable');
  var mobCards = document.getElementById('dailyHistoryMobCards');
  if (!dates.length) {
    tbody.innerHTML = '';
    if (mobCards) mobCards.innerHTML = '';
    document.getElementById('dailyHistoryEmpty').classList.remove('hidden');
    return;
  }
  document.getElementById('dailyHistoryEmpty').classList.add('hidden');
  var html = '';
  var mobHtml = '';
  dates.forEach(function(date){
    var dd = data.dailyTasks[date];
    var earned = 0, spent = 0;
    var taskCount = 0;
    Object.keys(dd.tasks).forEach(function(k){
      var t = dd.tasks[k];
      if (t && t.done) {
        taskCount++;
        if (t.delta > 0) earned += t.delta;
        else spent += Math.abs(t.delta);
      }
    });
    var bedtime = dd.bedtime ? 1 : 0;
    if (dd.bedtime) earned += dd.bedtime.pts;
    var extras = (dd.extras || []).reduce(function(s, e){ return s + e.pts; }, 0);
    var net = earned + extras - spent;
    var d = new Date(date + 'T00:00:00');
    var weekdays = ['周日','周一','周二','周三','周四','周五','周六'];
    var weekStr = weekdays[d.getDay()];
    html += '<tr>' +
      '<td style="white-space:nowrap"><strong>' + date + '</strong><br><span style="font-size:11px;color:var(--js-text-secondary)">' + weekStr + '</span></td>' +
      '<td>' + taskCount + '/5' + (bedtime ? '+寝' : '') + '</td>' +
      '<td style="color:var(--js-red)">' + (spent > 0 ? '-' + spent : '0') + '</td>' +
      '<td style="color:var(--js-green)">' + (extras > 0 ? '+' + extras : '0') + '</td>' +
      '<td><span class="pts-change ' + (net >= 0 ? 'plus' : 'minus') + ' font-mono" style="font-size:14px">' + (net >= 0 ? '+' : '') + net + '</span></td>' +
    '</tr>';
    mobHtml += '<div class="mob-card"><div class="mob-card-field"><span class="field-label">日期</span><span class="field-value"><strong>' + date + '</strong> ' + weekStr + '</span></div><div class="mob-card-field"><span class="field-label">完成</span><span class="field-value">' + taskCount + '/5' + (bedtime ? '+寝' : '') + '</span></div><div class="mob-card-field"><span class="field-label">扣分</span><span class="field-value" style="color:var(--js-red)">' + (spent > 0 ? '-' + spent : '0') + '</span></div><div class="mob-card-field"><span class="field-label">附加</span><span class="field-value" style="color:var(--js-green)">' + (extras > 0 ? '+' + extras : '0') + '</span></div><div class="mob-card-field"><span class="field-label">小计</span><span class="field-value pts-change ' + (net >= 0 ? 'plus' : 'minus') + ' font-mono">' + (net >= 0 ? '+' : '') + net + '</span></div></div>';
  });
  tbody.innerHTML = html;
  if (mobCards) mobCards.innerHTML = mobHtml;
}

/* ===== 渲染：总览 ===== */
/**
 * 渲染总览面板：显示当前孩子信息、积分汇总、成就列表、年级保护逻辑
 */
function renderDashboard() {
  var cfg = getChildrenConfig();
  var name = currentChild === 1 ? cfg.name1 : cfg.name2;
  var icon = currentChild === 1 ? '👦' : '👧';
  document.getElementById('compactTitle').textContent = icon + ' ' + name + ' · 成绩 & 积分';

  var records = data.records;

  var grade = getCurrentChildGrade();
  var dailyPts = data.dailyPoints || 0;
  var advPts = data.advancedPoints || 0;
  var showDualPool = grade >= 4;

  // 积分池汇总：4项指标（手机端2×2布局）
  var earnedDaily  = data.pointsLog.filter(function(l){return l.delta>0 && (l.pool||'daily')==='daily';}).reduce(function(s,l){return s+l.delta;},0);
  var earnedAdv    = data.pointsLog.filter(function(l){return l.delta>0 && l.pool==='advanced';}).reduce(function(s,l){return s+l.delta;},0);
  document.getElementById('dashMetrics').innerHTML =
    '<div class="metric"><div class="metric-label">行为积分池</div><div class="metric-value" style="color:#00e8ff">'+dailyPts+'</div></div>'+
    '<div class="metric"><div class="metric-label">行为累计获得</div><div class="metric-value green">'+earnedDaily+'</div></div>'+
    (showDualPool ? '<div class="metric"><div class="metric-label">刷题积分池</div><div class="metric-value" style="color:#fbbf24">'+advPts+'</div></div>' : '')+
    (showDualPool ? '<div class="metric"><div class="metric-label">刷题累计获得</div><div class="metric-value green">'+earnedAdv+'</div></div>' : '');

  var logs = (data.pointsLog || []).slice().sort(function(a,b){return b.time.localeCompare(a.time);});

  // ———— Pool A：行为积分池 ————
  var poolALogs = logs.filter(function(l){return (l.pool||'daily')==='daily';}).slice(0,5);
  var poolADiv = document.getElementById('poolAView');
  if (!poolALogs.length) {
    poolADiv.innerHTML = '<div class="empty">暂无行为积分动态</div>';
  } else {
    var htmlA = '<table style="width:100%;font-size:12px"><thead><tr><th>时间</th><th>变动</th><th>说明</th></tr></thead><tbody>';
    poolALogs.forEach(function(l){
      var d = new Date(l.time);
      htmlA += '<tr><td style="font-size:11px;color:var(--js-text-secondary)">'+d.toLocaleDateString('zh-CN')+'</td>'+
        '<td><span class="pts-change '+(l.delta>0?'plus':'minus')+'">'+(l.delta>0?'+':'')+l.delta+'</span></td>'+
        '<td style="font-size:12px;color:var(--js-text-secondary);max-width:140px;overflow:hidden;text-overflow:ellipsis">'+(l.desc||'--')+'</td></tr>';
    });
    poolADiv.innerHTML = htmlA + '</tbody></table>';
  }

  // ———— Pool B：刷题积分池 ————
  var poolBDiv = document.getElementById('poolBView');
  var htmlB = '';

  // 近期成绩
  var recent = records.slice().sort(function(a,b){return b.createdAt.localeCompare(a.createdAt);}).slice(0,5);
  if (recent.length) {
    htmlB += '<div class="text-xs" style="margin-bottom:6px;color:var(--js-text-secondary)">近期成绩</div>';
    htmlB += '<table style="width:100%;font-size:12px"><thead><tr><th>日期</th><th>科目</th><th>成绩</th><th>排名</th></tr></thead><tbody>';
    recent.forEach(function(r){
      htmlB += '<tr><td>'+r.date+'</td><td>'+r.subject+'</td><td><strong>'+r.score+'</strong></td><td>'+getRankBadge(r.rank)+'</td></tr>';
    });
    htmlB += '</tbody></table>';
  } else {
    htmlB += '<div class="empty">暂无成绩记录</div>';
  }
  // 积分规则（移至刷题页面录入面板）

  poolBDiv.innerHTML = htmlB;

  // ———— 近期积分动态（全部，badge 区分） ————
  var recentLogs = logs.slice(0,6);
  var rpDiv = document.getElementById('recentPoints');
  if (!recentLogs.length) { rpDiv.innerHTML = '<div class="empty">暂无积分记录</div>'; }
  else {
    var html2 = '<table><thead><tr><th>时间</th><th>变动</th><th>来源</th><th>余额</th></tr></thead><tbody>';
    recentLogs.forEach(function(l){
      var d = new Date(l.time);
      var srcBadge = (l.pool||'daily')==='advanced'?'<span class="badge badge-gold">刷题</span>':'<span class="badge badge-blue">行为</span>';
      html2 += '<tr><td style="font-size:12px;color:var(--js-text-secondary)">' + d.toLocaleDateString('zh-CN') + '</td><td><span class="pts-change '+(l.delta>0?'plus':'minus')+'">'+(l.delta>0?'+':'')+l.delta+'</span></td><td>'+srcBadge+'</td><td>'+l.balance+'</td></tr>';
    });
    rpDiv.innerHTML = html2 + '</tbody></table>';
  }

  // 规则已在 switchTab() 中同步更新

  renderAchievementList();
}

/**
 * 渲染成绩历史表格（含搜索过滤、科目筛选、分页），移动端卡片视图
 */
function renderHistory() {
  var search = (document.getElementById('searchInput').value || '').toLowerCase();
  var filterSub = document.getElementById('filterSubject').value;
  var subjects = [];
  data.records.forEach(function(r){ if (subjects.indexOf(r.subject)===-1) subjects.push(r.subject); });
  var sel = document.getElementById('filterSubject');
  sel.innerHTML = '<option value="">全部科目</option>' + subjects.map(function(s){
    return '<option value="'+s+'" '+(s===filterSub?'selected':'')+'>'+s+'</option>';
  }).join('');

  var filtered = data.records.slice().sort(function(a,b){return b.date.localeCompare(a.date);});
  if (search) filtered = filtered.filter(function(r){
    return r.subject.toLowerCase().indexOf(search)!==-1 || (r.note||'').toLowerCase().indexOf(search)!==-1;
  });
  if (filterSub) filtered = filtered.filter(function(r){return r.subject===filterSub;});

  var tbody = document.getElementById('historyTable');
  var mobCards = document.getElementById('historyMobCards');
  if (!filtered.length) { tbody.innerHTML=''; if(mobCards) mobCards.innerHTML=''; document.getElementById('historyEmpty').classList.remove('hidden'); return; }
  document.getElementById('historyEmpty').classList.add('hidden');
  var html = '';
  var mobHtml = '';
  filtered.forEach(function(r){
    html += '<tr><td>'+r.date+'</td><td>'+r.subject+'</td><td><strong>'+r.score+'</strong></td><td>'+getRankBadge(r.rank)+'</td><td><span class="pts-change plus font-mono">+'+r.earnedPts+'</span></td><td><button class="btn" style="padding:4px 10px;font-size:12px" onclick="deleteRecord(\''+r.id+'\')">删除</button></td></tr>';
    mobHtml += '<div class="mob-card"><div class="mob-card-field"><span class="field-label">日期</span><span class="field-value">'+r.date+'</span></div><div class="mob-card-field"><span class="field-label">科目</span><span class="field-value">'+r.subject+'</span></div><div class="mob-card-field"><span class="field-label">成绩</span><span class="field-value font-mono">'+r.score+'</span></div><div class="mob-card-field"><span class="field-label">排名</span><span class="field-value">'+getRankBadge(r.rank)+'</span></div><div class="mob-card-field"><span class="field-label">积分</span><span class="field-value pts-change plus font-mono">+'+r.earnedPts+'</span></div><div class="mob-card-actions"><button class="btn" style="padding:4px 10px;font-size:12px" onclick="deleteRecord(\''+r.id+'\')">删除</button></div></div>';
  });
  tbody.innerHTML = html;
  if (mobCards) mobCards.innerHTML = mobHtml;
}

/* ===== 渲染：趋势图 ===== */
/**
 * 渲染成绩趋势折线图（Chart.js），支持科目过滤、最近 N 条记录显示
 */
function renderTrend() {
  var sub = document.getElementById('trendSubject').value;
  var subjects = [];
  data.records.forEach(function(r){ if (subjects.indexOf(r.subject)===-1) subjects.push(r.subject); });
  var sel = document.getElementById('trendSubject');
  sel.innerHTML = '<option value="">全部科目</option>' + subjects.map(function(s){
    return '<option value="'+s+'" '+(s===sub?'selected':'')+'>'+s+'</option>';
  }).join('');

  var filtered = data.records.slice().sort(function(a,b){return a.date.localeCompare(b.date);});
  if (sub) filtered = filtered.filter(function(r){return r.subject===sub;});

  var labels = filtered.map(function(r){return r.date+'\n'+r.subject;});
  var scores = filtered.map(function(r){return r.score;});
  var ranks  = filtered.map(function(r){return r.rank;});

  if (chartScore) chartScore.destroy();
  if (chartRank) chartRank.destroy();

  chartScore = new Chart(document.getElementById('scoreChart'), {
    type:'line',
    data:{ labels:labels, datasets:[{ label:'成绩', data:scores,
      borderColor:'#00e8ff', backgroundColor:'rgba(0,232,255,0.08)',
      borderWidth:2, pointRadius:4, pointHoverRadius:7, pointBackgroundColor:'#00e8ff',
      pointBorderColor:'rgba(0,232,255,0.4)', pointHoverBackgroundColor:'#00e8ff',
      fill:true, tension:0.3 }] },
    options:{ responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}},
      scales:{ x:{ticks:{font:{size:10},maxRotation:45,autoSkip:false,color:'rgba(160,180,210,0.6)'},
        grid:{color:'rgba(0,232,255,0.05)'}},
        y:{beginAtZero:false,ticks:{color:'rgba(160,180,210,0.6)'},
        grid:{color:'rgba(0,232,255,0.05)'}} }}
  });
  chartRank = new Chart(document.getElementById('rankChart'), {
    type:'line',
    data:{ labels:labels, datasets:[{ label:'排名', data:ranks,
      borderColor:'#fbbf24', backgroundColor:'rgba(251,191,36,0.08)',
      borderWidth:2, pointRadius:4, pointHoverRadius:7, pointBackgroundColor:'#fbbf24',
      pointBorderColor:'rgba(251,191,36,0.4)', pointHoverBackgroundColor:'#fbbf24',
      fill:true, tension:0.3 }] },
    options:{ responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}},
      scales:{ x:{ticks:{font:{size:10},maxRotation:45,autoSkip:false,color:'rgba(160,180,210,0.6)'},
        grid:{color:'rgba(0,232,255,0.05)'}},
        y:{reverse:true, ticks:{stepSize:1,color:'rgba(160,180,210,0.6)'}, title:{display:true,
        text:'排名（越小越好）',color:'rgba(160,180,210,0.6)'},
        grid:{color:'rgba(0,232,255,0.05)'}} }}
  });
}

/* ===== 渲染：积分中心 ===== */
/**
 * 渲染积分中心面板：手动增减积分、连续前3名状态、积分变动日志列表
 * 积分池汇总指标已移至总览面板
 */
function renderPoints() {
  // 连续前3名状态 → 紧凑信息条
  var streak = data.consecutiveTop3 || 0;
  var barHtml = '';
  if (streak >= 3) {
    var nextExtra = data.rules.streakBase * (streak - 1);
    barHtml = '<div class="streak-box" style="margin-bottom:0;display:flex;align-items:center;gap:10px"><span style="color:var(--js-yellow);font-weight:600">连续前3名🔥</span><span style="font-size:13px;color:var(--js-text)">已连 <strong>'+streak+'</strong> 次</span><span style="font-size:12px;color:var(--js-yellow);margin-left:auto">下次额外 <strong>+'+nextExtra+'</strong></span></div>';
  } else if (streak > 0) {
    barHtml = '<div class="streak-box" style="margin-bottom:0;display:flex;align-items:center;gap:8px;padding:10px 14px"><span style="font-size:13px;color:var(--js-text)">连续前3 <strong>'+streak+'</strong> 次</span><span style="font-size:12px;color:var(--js-text-secondary);margin-left:auto">再 '+(3-streak)+' 次激活奖励</span></div>';
  }
  var barEl = document.getElementById('streakBar');
  if (barEl) barEl.innerHTML = barHtml;

  var logs = data.pointsLog.slice().sort(function(a,b){return b.time.localeCompare(a.time);});
  var tbody = document.getElementById('pointsLog');
  var mobCards = document.getElementById('pointsLogMobCards');
  if (!logs.length) { tbody.innerHTML=''; if(mobCards) mobCards.innerHTML=''; document.getElementById('pointsLogEmpty').classList.remove('hidden'); return; }
  document.getElementById('pointsLogEmpty').classList.add('hidden');
  var html = '';
  var mobHtml = '';
  logs.forEach(function(l){
    var d = new Date(l.time);
    var typeHtml = l.type==='earn'?'<span class="badge badge-green">获得</span>':l.type==='spend'?'<span class="badge badge-red">消费</span>':'<span class="badge badge-blue">调整</span>';
    var sourceHtml = (l.pool||'daily')==='advanced'?'<span class="badge badge-gold">刷题积分</span>':'<span class="badge badge-blue">行为积分</span>';
    html += '<tr><td style="font-size:11px;white-space:nowrap">'+d.toLocaleString('zh-CN')+'</td><td>'+typeHtml+'</td><td>'+sourceHtml+'</td><td><span class="pts-change '+(l.delta>0?'plus':'minus')+' font-mono">'+(l.delta>0?'+':'')+l.delta+'</span></td><td><strong class="font-mono">'+l.balance+'</strong></td><td style="font-size:12px;color:var(--js-text-secondary);max-width:120px;overflow:hidden;text-overflow:ellipsis">'+(l.desc||'--')+'</td></tr>';
    mobHtml += '<div class="mob-card"><div class="mob-card-field"><span class="field-label">时间</span><span class="field-value" style="font-size:11px">'+d.toLocaleString('zh-CN')+'</span></div><div class="mob-card-field"><span class="field-label">类型</span><span class="field-value">'+typeHtml+'</span></div><div class="mob-card-field"><span class="field-label">来源</span><span class="field-value">'+sourceHtml+'</span></div><div class="mob-card-field"><span class="field-label">变动</span><span class="field-value pts-change '+(l.delta>0?'plus':'minus')+' font-mono">'+(l.delta>0?'+':'')+l.delta+'</span></div><div class="mob-card-field"><span class="field-label">余额</span><span class="field-value font-mono">'+l.balance+'</span></div><div class="mob-card-field" style="flex:1 1 100%"><span class="field-label">说明</span><span class="field-value" style="font-size:12px;color:var(--js-text-secondary)">'+(l.desc||'--')+'</span></div></div>';
  });
  tbody.innerHTML = html;
  if (mobCards) mobCards.innerHTML = mobHtml;
}

/* ===== 积分页：增加/消费切换 ===== */
function switchPtsAction(type) {
  var addForm = document.getElementById('ptsFormAdd');
  var spendForm = document.getElementById('ptsFormSpend');
  var addBtn = document.getElementById('ptsToggleAdd');
  var spendBtn = document.getElementById('ptsToggleSpend');
  if (type === 'add') {
    addForm.classList.remove('hidden');
    spendForm.classList.add('hidden');
    addBtn.classList.add('active');
    spendBtn.classList.remove('active');
  } else {
    addForm.classList.add('hidden');
    spendForm.classList.remove('hidden');
    addBtn.classList.remove('active');
    spendBtn.classList.add('active');
  }
}

/* ===== 手动增加积分 ===== */
/**
 * 管理员手动增加积分（含备注），记录到 pointsLog
 */
function addPoints() {
  var amount = parseInt(document.getElementById('addAmount').value);
  var note = document.getElementById('addNote').value.trim();
  if (!amount || amount < 1) { showAlert('请输入有效的积分数量', 'error'); return; }
  var pool = document.querySelector('input[name="addPool"]:checked');
  var isAdv = pool && pool.value === 'advanced';
  var srcKey = isAdv ? 'advancedPoints' : 'dailyPoints';
  var srcLabel = isAdv ? '刷题积分' : '行为积分';
  data[srcKey] = (data[srcKey] || 0) + amount;
  data.totalPoints = (data.dailyPoints || 0) + (data.advancedPoints || 0);
  data.pointsLog.push({ id:Date.now().toString(), time:new Date().toISOString(), type:'earn', pool: isAdv ? 'advanced' : 'daily', delta:amount, balance:data[srcKey], desc:note||('手动增加'+srcLabel) });
  saveData(data);
  document.getElementById('addAmount').value = '';
  document.getElementById('addNote').value = '';
  showAlert('成功增加 <strong>'+amount+' '+srcLabel+'</strong>，当前余额：<strong>'+data[srcKey]+'</strong>');
  renderPoints();
}

/* ===== 积分消费 ===== */
/**
 * 管理员手动扣除积分（含备注），记录到 pointsLog，遵循余额不足保护
 */
function spendPoints() {
  var amount = parseInt(document.getElementById('spendAmount').value);
  var note = document.getElementById('spendNote').value.trim();
  if (!amount || amount < 1) { showAlert('请输入有效的消费积分数量', 'error'); return; }
  var pool = document.querySelector('input[name="spendPool"]:checked');
  var isAdv = pool && pool.value === 'advanced';
  var srcKey = isAdv ? 'advancedPoints' : 'dailyPoints';
  var srcLabel = isAdv ? '刷题积分' : '行为积分';
  if (amount > (data[srcKey] || 0)) { showAlert(srcLabel+'余额不足！', 'error'); return; }
  data[srcKey] -= amount;
  data.totalPoints = (data.dailyPoints || 0) + (data.advancedPoints || 0);
  data.pointsLog.push({ id:Date.now().toString(), time:new Date().toISOString(), type:'spend', pool: isAdv ? 'advanced' : 'daily', delta:-amount, balance:data[srcKey], desc:note||('手动消费（'+srcLabel+'）') });
  saveData(data);
  document.getElementById('spendAmount').value = '';
  document.getElementById('spendNote').value = '';
  showAlert('消费成功！扣除 <strong>'+amount+' '+srcLabel+'</strong>，剩余：<strong>'+data[srcKey]+'</strong>');
  renderPoints();
}

/* ===== 渲染：设置面板 ===== */
/**
 * 渲染设置面板：孩子名称/年级编辑、积分规则配置、数据管理入口
 */
function renderSettings() {
  var cfg = getChildrenConfig();
  var nameKey = currentChild === 1 ? 'name1' : 'name2';
  var gradeKey = currentChild === 1 ? 'grade1' : 'grade2';
  document.getElementById('cfg-child-name').value = cfg[nameKey];
  document.getElementById('cfg-child-grade').value = cfg[gradeKey] || 5;
  document.getElementById('cfg-total-pts').value = data.dailyPoints || 0;
  document.getElementById('cfg-curr-daily').textContent = '当前: ' + (data.dailyPoints || 0);
  document.getElementById('cfg-quiz-pts').value = data.advancedPoints || 0;
  document.getElementById('cfg-curr-adv').textContent = '当前: ' + (data.advancedPoints || 0);
  document.getElementById('cfg-base').value = data.rules.base;
  document.getElementById('cfg-top3').value = data.rules.top3;
  document.getElementById('cfg-streak-base').value = data.rules.streakBase;
}

/* ===== 管理员直接修改行为积分 ===== */
/**
 * 管理员直接设置行为积分（覆盖模式），记录变动日志
 */
function saveTotalPoints() {
  var newVal = parseInt(document.getElementById('cfg-total-pts').value);
  if (isNaN(newVal) || newVal < 0) { showAlert('请输入有效的积分值', 'error'); return; }
  var oldVal = data.dailyPoints || 0;
  var diff = newVal - oldVal;
  data.dailyPoints = newVal;
  data.totalPoints = data.dailyPoints + (data.advancedPoints || 0);
  data.pointsLog.push({ id:Date.now().toString(), time:new Date().toISOString(), type:'adjust', pool:'daily', delta:diff, balance:data.dailyPoints, desc:'管理员调整行为积分：'+oldVal+' → '+newVal });
  saveData(data);
  showAlert('行为积分已调整为 <strong>'+newVal+'</strong>');
  renderSettings();
}
/**
 * 管理员直接设置刷题积分（覆盖模式），记录变动日志
 */
function saveQuizPoints() {
  var newVal = parseInt(document.getElementById('cfg-quiz-pts').value);
  if (isNaN(newVal) || newVal < 0) { showAlert('请输入有效的积分值', 'error'); return; }
  var oldVal = data.advancedPoints || 0;
  var diff = newVal - oldVal;
  data.advancedPoints = newVal;
  data.totalPoints = (data.dailyPoints || 0) + data.advancedPoints;
  data.pointsLog.push({ id:Date.now().toString(), time:new Date().toISOString(), type:'adjust', pool:'advanced', delta:diff, balance:data.advancedPoints, desc:'管理员调整刷题积分：'+oldVal+' → '+newVal });
  saveData(data);
  showAlert('刷题积分已调整为 <strong>'+newVal+'</strong>');
  renderSettings();
}

/* ===== 保存积分规则 ===== */
/**
 * 保存积分规则配置（基础分/前3奖励/连续加成），立即刷新预览
 */
function saveRules() {
  var base = parseInt(document.getElementById('cfg-base').value);
  var top3 = parseInt(document.getElementById('cfg-top3').value);
  var streakBase = parseInt(document.getElementById('cfg-streak-base').value);
  if (isNaN(base)||isNaN(top3)||isNaN(streakBase)) { showAlert('请填写完整的规则参数', 'error'); return; }
  data.rules = { base:base, top3:top3, streakBase:streakBase };
  saveData(data);
  showAlert('积分规则已保存！');
}

/* ===== 跨设备同步：生成同步码 ===== */
/**
 * 将当前数据序列化为 Base64 同步码（含 CRC 校验），用于跨设备传输
 * @returns {string} Base64 编码的同步码
 */
function generateSyncCode() {
  try {
    var json = JSON.stringify(data);
    var encoded = btoa(unescape(encodeURIComponent(json)));
    document.getElementById('syncCodeText').value = encoded;
    document.getElementById('syncCodeArea').classList.remove('hidden');
    document.getElementById('syncQRBox').classList.add('hidden');
    showAlert('同步码已生成，请复制到另一部手机');
  } catch(e) { showAlert('生成同步码失败：'+e.message, 'error'); }
}

/* ===== 复制同步码到剪贴板 ===== */
/**
 * 复制同步码到系统剪贴板（优先 navigator.clipboard，回退到 fallbackCopy）
 */
function copySyncCode() {
  var text = document.getElementById('syncCodeText').value;
  if (!text) { showAlert('请先生成同步码', 'error'); return; }
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(function(){ showAlert('同步码已复制到剪贴板'); }).catch(function(){ fallbackCopy(text); });
  } else { fallbackCopy(text); }
}
/**
 * 回退复制方案：创建隐藏 textarea 实现剪贴板复制（兼容旧浏览器）
 * @param {string} text - 待复制文本
 */
function fallbackCopy(text) {
  var ta = document.createElement('textarea');
  ta.value = text; ta.style.position = 'fixed'; ta.style.left = '-9999px';
  document.body.appendChild(ta); ta.select();
  try { document.execCommand('copy'); showAlert('同步码已复制到剪贴板'); }
  catch(e) { showAlert('复制失败，请手动长按选中文本复制', 'error'); }
  document.body.removeChild(ta);
}

/* ===== 生成同步二维码 ===== */
/**
 * 生成同步二维码弹窗（使用 QRCode.js），显示 Base64 同步码
 */
function showSyncQR() {
  var text = document.getElementById('syncCodeText').value;
  if (!text) { showAlert('请先生成同步码', 'error'); return; }
  var qrBox = document.getElementById('syncQRBox');
  qrBox.classList.remove('hidden');
  var qrDiv = document.getElementById('syncQRCode');
  qrDiv.innerHTML = '';
  try {
    new QRCode(qrDiv, { text:text, width:200, height:200, colorDark:'#2c2c2a', colorLight:'#ffffff', correctLevel:QRCode.CorrectLevel.M });
  } catch(e) { qrDiv.innerHTML='<p style="color:var(--js-red);font-size:12px">生成二维码失败，请复制同步码</p>'; }
}

/* ===== 导入同步码 ===== */
async function importSyncCode() {
  var text = document.getElementById('importSyncCodeText').value.trim();
  if (!text) { showAlert('请粘贴同步码', 'error'); return; }
  try {
    var json = decodeURIComponent(escape(atob(text)));
    var d = JSON.parse(json);
    if (!d.records) throw new Error('格式错误');
    var cfg = getChildrenConfig();
    var childName = currentChild === 1 ? cfg.name1 : cfg.name2;
    if (!(await customConfirm('导入将覆盖「' + childName + '」当前数据，确定继续？', '导入确认'))) return;
    data = d;
    saveData(data);
    renderDashboard();
    showAlert('同步数据导入成功！');
    document.getElementById('importSyncCodeText').value = '';
  } catch(e) { showAlert('同步码无效或已损坏，请检查后重试', 'error'); }
}

/**
 * 触发文件选择对话框，用于导入同步文件
 */
function importSyncFile() { document.getElementById('syncFileInput').click(); }
/**
 * 处理同步文件导入（JSON 解析 + 数据覆盖），含错误提示
 * @param {Event} e - 文件输入元素的 change 事件
 */
function doImportSyncFile(e) {
  var file = e.target.files[0]; if (!file) return;
  var reader = new FileReader();
  reader.onload = async function(ev) {
    try {
      var d = JSON.parse(ev.target.result);
      if (!d.records) throw new Error('格式错误');
      if (!(await customConfirm('导入将覆盖当前数据，确定继续？', '导入确认'))) return;
      data = d; saveData(data); renderDashboard(); showAlert('文件同步成功！');
    } catch(err) { showAlert('文件格式不正确', 'error'); }
  };
  reader.readAsText(file); e.target.value = '';
}

/* ===== 导出数据 ===== */
/**
 * JSON 导出 — 完整数据备份，可被 importData 重新导入
 */
function exportJSON() {
  var cfg = getChildrenConfig();
  var childName = (currentChild === 1 ? cfg.name1 : cfg.name2).replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, '_');
  var blob = new Blob([JSON.stringify(data, null, 2)], {type:'application/json'});
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url; a.download = 'grade_tracker_' + childName + '_' + new Date().toISOString().slice(0,10) + '.json';
  a.click(); URL.revokeObjectURL(url);
}

/**
 * CSV 导出 — 成绩明细，UTF-8 BOM 确保 Excel/WPS 中文不乱码
 */
function exportCSV() {
  var cfg = getChildrenConfig();
  var childName = (currentChild === 1 ? cfg.name1 : cfg.name2).replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, '_');
  var records = data.records || [];
  if (records.length === 0) { alert('暂无成绩记录可导出'); return; }

  // UTF-8 BOM + 表头（中文列名）
  var csv = '\uFEFF';
  csv += '日期,科目,成绩,排名,满分,积分,备注\r\n';

  for (var i = 0; i < records.length; i++) {
    var r = records[i];
    var note = (r.note || '').replace(/"/g, '""');
    csv +=
      (r.date || '') + ',' +
      (r.subject || '') + ',' +
      (r.score != null ? r.score : '') + ',' +
      (r.rank != null ? r.rank : '') + ',' +
      (r.total != null ? r.total : '') + ',' +
      (r.earnedPts != null ? r.earnedPts : '') + ',' +
      '"' + note + '"\r\n';
  }

  var blob = new Blob([csv], {type:'text/csv;charset=utf-8'});
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url; a.download = 'grade_tracker_' + childName + '_records_' + new Date().toISOString().slice(0,10) + '.csv';
  a.click(); URL.revokeObjectURL(url);
}

/**
 * 成绩报告 HTML 导出 — 自包含 HTML，含统计摘要 + 成绩表格 + Chart.js 趋势图
 */
function exportReport() {
  var cfg = getChildrenConfig();
  var childName = (currentChild === 1 ? cfg.name1 : cfg.name2).replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, '_');
  var records = data.records || [];
  if (records.length === 0) { alert('暂无成绩记录可生成报告'); return; }

  // 计算统计摘要
  var subjectMap = {};
  for (var i = 0; i < records.length; i++) {
    var r = records[i];
    var sub = r.subject || '未分类';
    if (!subjectMap[sub]) subjectMap[sub] = { count:0, sum:0, max:-Infinity, min:Infinity, scores:[], ranks:[] };
    subjectMap[sub].count++;
    if (r.score != null) {
      subjectMap[sub].sum += r.score;
      subjectMap[sub].scores.push({ date:r.date, val:r.score });
      if (r.score > subjectMap[sub].max) subjectMap[sub].max = r.score;
      if (r.score < subjectMap[sub].min) subjectMap[sub].min = r.score;
    }
    if (r.rank != null) {
      subjectMap[sub].ranks.push({ date:r.date, val:r.rank });
    }
  }

  // 最近 50 条倒序
  var recent = records.slice(-50).reverse();
  // 各科目行 — 找出有分数数据的科目用于 Chart.js 折线
  var chartSubjects = [];
  for (var s in subjectMap) {
    if (subjectMap[s].scores.length >= 2) chartSubjects.push(s);
  }
  // 最多画 3 个科目
  if (chartSubjects.length > 3) chartSubjects = chartSubjects.slice(0,3);

  // 科目统计表行
  var subRows = '';
  for (var s in subjectMap) {
    var sm = subjectMap[s];
    var avg = sm.count > 0 ? (sm.sum / sm.count).toFixed(1) : '-';
    var maxV = sm.max === -Infinity ? '-' : sm.max;
    var minV = sm.min === Infinity ? '-' : sm.min;
    subRows += '<tr><td>' + s + '</td><td>' + sm.count + '</td><td>' + avg + '</td><td>' + maxV + '</td><td>' + minV + '</td></tr>';
  }

  // 成绩表格行
  var tableRows = '';
  for (var j = 0; j < recent.length; j++) {
    var rr = recent[j];
    tableRows += '<tr><td>' + (rr.date||'') + '</td><td>' + (rr.subject||'') + '</td><td>' + (rr.score!=null?rr.score:'') + '</td><td>' + (rr.rank!=null?rr.rank:'') + '</td><td>' + (rr.total!=null?rr.total:'') + '</td><td>' + (rr.earnedPts!=null?rr.earnedPts:'') + '</td><td>' + (rr.note||'') + '</td></tr>';
  }

  // Chart.js 数据 — 每条线一个 dataset
  var chartDatasets = [
    { label:'分数', data:recent.map(function(rr){ return rr.score!=null ? rr.score : null; }), borderColor:'#0cf', backgroundColor:'rgba(0,204,255,0.08)', fill:false, tension:0.3, spanGaps:true, pointRadius:3 },
    { label:'排名', data:recent.map(function(rr){ return rr.rank!=null ? rr.rank : null; }), borderColor:'#ff6b6b', backgroundColor:'rgba(255,107,107,0.08)', fill:false, tension:0.3, spanGaps:true, pointRadius:3, yAxisID:'y1' }
  ];

  var html = '<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + childName + ' 成绩报告</title>';
  html += '<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.7/dist/chart.umd.min.js"><\/script>';
  html += '<style>body{font-family:"Microsoft YaHei","PingFang SC",sans-serif;max-width:900px;margin:0 auto;padding:20px;color:#333;background:#fff}h1{font-size:22px;color:#1a1a2e;border-bottom:2px solid #0cf;padding-bottom:8px}.summary{font-size:13px;color:#666;margin-bottom:20px}table{width:100%;border-collapse:collapse;font-size:13px;margin:12px 0}th,td{padding:6px 10px;text-align:left;border:1px solid #ddd}th{background:#f5f7fa;font-weight:600;color:#444}tr:nth-child(even){background:#fafbfc}.section-title{font-size:16px;font-weight:600;color:#1a1a2e;margin:24px 0 8px}.chart-wrap{width:100%;height:300px;margin:16px 0}</style></head><body>';
  html += '<h1>' + childName + ' 成绩报告</h1>';
  html += '<div class="summary">导出时间：' + new Date().toLocaleString('zh-CN') + ' &nbsp;·&nbsp; 总记录数：' + records.length + ' &nbsp;·&nbsp; 科目数：' + Object.keys(subjectMap).length + '</div>';

  // 科目统计表
  html += '<div class="section-title">各科目统计</div>';
  html += '<table><thead><tr><th>科目</th><th>记录数</th><th>平均分</th><th>最高分</th><th>最低分</th></tr></thead><tbody>' + subRows + '</tbody></table>';

  // 成绩表格
  html += '<div class="section-title">最近成绩明细（最近 ' + recent.length + ' 条）</div>';
  html += '<table><thead><tr><th>日期</th><th>科目</th><th>成绩</th><th>排名</th><th>满分</th><th>积分</th><th>备注</th></tr></thead><tbody>' + tableRows + '</tbody></table>';

  // 趋势图
  var chartLabels = JSON.stringify(recent.map(function(rr){ return rr.date||''; }));
  var chartDataStr = JSON.stringify(chartDatasets);
  html += '<div class="section-title">成绩趋势</div><div class="chart-wrap"><canvas id="scoreChart"></canvas></div>';
  html += '<script>';
  html += 'new Chart(document.getElementById("scoreChart"),{type:"line",data:{labels:' + chartLabels + ',datasets:' + chartDataStr + '},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{labels:{color:"#555"}},title:{display:false}},scales:{x:{ticks:{color:"#666",maxTicksLimit:10}},y:{beginAtZero:true,title:{display:true,text:"分数"}},y1:{position:"right",reverse:true,title:{display:true,text:"排名"},grid:{drawOnChartArea:false}}}}})';
  html += '<\/script>';
  html += '</body></html>';

  var blob = new Blob([html], {type:'text/html;charset=utf-8'});
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url; a.download = 'grade_tracker_' + childName + '_report_' + new Date().toISOString().slice(0,10) + '.html';
  a.click(); URL.revokeObjectURL(url);
}

/* ===== 通用导入 ===== */
/**
 * 触发文件选择对话框，用于导入 JSON 备份
 */
function importData() { document.getElementById('importFile').click(); }
/**
 * 处理 JSON 备份文件导入（解析 + 覆盖 + 刷新 UI）
 * @param {Event} e - 文件输入元素的 change 事件
 */
function doImport(e) {
  var file = e.target.files[0]; if (!file) return;
  var reader = new FileReader();
  reader.onload = function(ev) {
    try {
      var d = JSON.parse(ev.target.result);
      if (!d.records) throw new Error('格式错误');
      data = d; saveData(data); renderDashboard(); showAlert('数据导入成功！');
    } catch(err) { showAlert('导入失败：文件格式不正确', 'error'); }
  };
  reader.readAsText(file); e.target.value = '';
}

/* ===== 清空数据 ===== */
async function clearAllData() {
  var cfg = getChildrenConfig();
  var childName = currentChild === 1 ? cfg.name1 : cfg.name2;
  if (!(await customConfirm('确定清空「' + childName + '」的全部数据？此操作不可撤销！', '清空确认'))) return;
  if (!(await customConfirm('再次确认：将删除「' + childName + '」所有成绩记录和积分数据！', '二次确认'))) return;
  data = getDefaultData();
  saveData(data);
  renderDashboard();
  showAlert('数据已清空');
}

/* ===== 主题化确认对话框 ===== */
var _modalResolver = null;
/**
 * 显示科幻风格确认对话框（Promise 化），用于确认删除等危险操作
 * @param {string} message - 提示内容（支持 HTML）
 * @param {string} [title] - 弹窗标题，默认"确认操作"
 * @returns {Promise<boolean>} resolve(true/false) 取决于用户点击确认/取消
 */
function customConfirm(message, title) {
  return new Promise(function(resolve) {
    _modalResolver = resolve;
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
  if (_modalResolver) { _modalResolver(result); _modalResolver = null; }
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

/* ===== 手风琴切换 ===== */
/**
 * 切换设置面板的手风琴折叠/展开状态
 * @param {HTMLElement} header - 被点击的手风琴头部元素
 */
function toggleAccordion(header) {
  var item = header.parentElement;
  item.classList.toggle('open');
}
