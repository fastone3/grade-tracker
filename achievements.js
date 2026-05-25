/**
 * achievements.js — 成就系统（依赖 core.js，加载顺序第 2）
 *
 * 模块：ACHIEVEMENTS 常量 + 成就进度查询 + 成就解锁检测 + 成就列表渲染
 * 加载顺序：core.js → achievements.js → modules.js → main.js
 */

/* ===== 成就系统 ===== */
AppState.ACHIEVEMENTS = [
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
  return AppState.ACHIEVEMENTS.filter(function(a){ return a.grades.indexOf(grade) !== -1; });
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
  var dailies = AppState.data.dailyTasks || {};
  var records = AppState.data.records || [];
  var unlocked = AppState.data.achievements ? AppState.data.achievements.unlocked : [];
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
  if (a.conditionType === 'consecutiveTop3') return AppState.data.consecutiveTop3 || 0;
  if (a.conditionType === 'weeklyExcellent') return AppState.data.weeklySettlements && Object.keys(AppState.data.weeklySettlements).some(function(wk) { return AppState.data.weeklySettlements[wk].grade === '优秀'; }) ? 1 : 0;
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
  if (a.conditionType === 'allSubjectTop3') { var s = {}; (AppState.data.records||[]).forEach(function(r){ s[r.subject]=true; }); return Math.max(Object.keys(s).length,1); }
  if (a.conditionType === 'weeklyExcellent' || a.conditionType === 'weekTimeManager' || a.conditionType === 'weekEfficient') return 1;
  return 1;
}

function isWeekFullCheckin() {
  var dailies = AppState.data.dailyTasks || {};
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
  var records = AppState.data.records || [];
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
  var dailies = AppState.data.dailyTasks || {};
  var records = AppState.data.records || [];
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
  if (!AppState.data.achievements) AppState.data.achievements = { unlocked: [] };
  var newlyUnlocked = [];
  var unlocked = AppState.data.achievements.unlocked;

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
      (AppState.data.records||[]).forEach(function(r) { subMap[r.subject] = (subMap[r.subject]||0) + 1; });
      var subCount = Object.keys(subMap).length;
      earned = subCount >= 2 && progress >= subCount;
    }
    if (a.conditionType === 'weeklyExcellent') {
      earned = AppState.data.weeklySettlements && Object.keys(AppState.data.weeklySettlements).some(function(wk) { return AppState.data.weeklySettlements[wk].grade === '优秀'; });
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
  var unlocked = (AppState.data.achievements && AppState.data.achievements.unlocked) ? AppState.data.achievements.unlocked : [];
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
