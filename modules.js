/**
 * modules.js — 功能模块层（依赖 core.js + achievements.js，加载顺序第 3）
 * 模块：ChildSwitcher + Daily + Dashboard + History + Trend + Points + Tools(getRankBadge)
 * 加载顺序：core.js → achievements.js → modules.js → grade.js → advanced.js → settings.js → main.js
 * 加载顺序：core.js → achievements.js → modules.js → main.js
 */

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

