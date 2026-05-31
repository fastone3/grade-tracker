/**
 * daily.js — 日常打卡模块（依赖 core.js + achievements.js + child-switch.js，加载顺序第 4）
 * 模块：任务定义 + 打卡/扣分 + 就寝 + 附加 + 日志 + 历史
 * 加载顺序：core.js → achievements.js → child-switch.js → daily.js → modules.js → grade.js → advanced.js → settings.js → main.js
 */

/* ===== 操作锁 + 防抖成就检查（防止快速点击卡死） ===== */
AppState._processingTask = false;
var _achDebounceTimer = null;
/**
 * 防抖版成就检查：连续操作时只执行最后一次操作结束后 300ms
 */
function _debouncedCheckAchievements() {
  if (_achDebounceTimer) clearTimeout(_achDebounceTimer);
  _achDebounceTimer = setTimeout(function() {
    _achDebounceTimer = null;
    checkAchievements();
  }, 300);
}

/* ===== 日常任务子标签切换 ===== */
/**
 * 切换日常模块子面板（打卡/历史/专注力），更新 UI 并渲染对应面板
 * @param {string} sub - 'checkin' | 'dailyHistory' | 'concentration' | 'reading'
 * @param {HTMLElement} el - 被点击的子标签元素
 */
function switchDailySubTab(sub, el) {
  AppState.currentDailySubTab = sub;
  document.querySelectorAll('#dailySubTabs .sub-tab').forEach(function(t){ t.classList.remove('active'); });
  if (el) el.classList.add('active');
  document.querySelectorAll('#panel-daily .sub-panel').forEach(function(p){ p.classList.remove('active'); });
  var panelId = sub === 'dailyHistory' ? 'sub-daily-history' : 'sub-daily-' + sub;
  var panel = document.getElementById(panelId);
  if (panel) panel.classList.add('active');
  if (sub === 'checkin') renderDaily();
  if (sub === 'dailyHistory') renderDailyHistory();
  if (sub === 'concentration') renderConcentration();
  if (sub === 'reading') renderReading();
  window.scrollTo({top:0, behavior:'smooth'});
}

/* ===== 专注力统计 chart 引用 ===== */
AppState.concentrationChart = null;

/* ===== 日常任务定义 ===== */
AppState.DAILY_TASKS = [
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

AppState.BEDTIME_RULES = [
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
  if (!AppState.data.dailyTasks) AppState.data.dailyTasks = {};
  if (!AppState.data.dailyTasks[date]) {
    AppState.data.dailyTasks[date] = {
      tasks: {}, // { taskId: { done: bool, delta: int, ts: string } }
      bedtime: null, // { key: string, pts: int, ts: string }
      extras: [] // [{ desc: string, pts: int, ts: string }]
    };
  }
  return AppState.data.dailyTasks[date];
}

/* ===== 任务打卡（加分） ===== */
/**
 * 日常任务打卡/取消。加分时调用 addDailyPointsLog，取消时撤回积分并移除日志。
 * 遵循三点同步铁律。
 * @param {number} taskId - DAILY_TASKS 中的任务 ID
 */
function taskCheck(taskId) {
  if (AppState._processingTask) return;
  AppState._processingTask = true;
  var date = document.getElementById('daily-date').value;
  if (!date) { AppState._processingTask = false; showAlert('请先选择日期', 'error'); return; }
  var dayData = getDayData(date);
  var task = AppState.DAILY_TASKS.find(function(t){ return t.id === taskId; });
  if (!task) { AppState._processingTask = false; return; }

  var alreadyDone = dayData.tasks[taskId] && dayData.tasks[taskId].done;
  if (alreadyDone) {
    // 取消打卡
    var prevDelta = dayData.tasks[taskId].delta;
    if (prevDelta > 0) {
      AppState.data.dailyPoints = (AppState.data.dailyPoints || 0) - prevDelta;
      AppState.data.totalPoints = AppState.data.dailyPoints + (AppState.data.advancedPoints || 0);
      removeLastDailyLog(date, 'task_' + taskId);
      dayData.tasks[taskId] = { done: false, delta: 0, ts: null };
      showAlert(task.name + ' 打卡已取消（-' + prevDelta + '分）');
    } else if (prevDelta < 0) {
      AppState.data.dailyPoints = (AppState.data.dailyPoints || 0) - prevDelta;
      AppState.data.totalPoints = AppState.data.dailyPoints + (AppState.data.advancedPoints || 0);
      removeLastDailyLog(date, 'task_' + taskId);
      dayData.tasks[taskId] = { done: false, delta: 0, ts: null };
      showAlert(task.name + ' 扣分已取消（+' + Math.abs(prevDelta) + '分）');
    }
  } else {
    // 打卡加分
    AppState.data.dailyPoints = (AppState.data.dailyPoints || 0) + task.plusPts;
    AppState.data.totalPoints = AppState.data.dailyPoints + (AppState.data.advancedPoints || 0);
    dayData.tasks[taskId] = { done: true, delta: task.plusPts, ts: new Date().toISOString() };
    addDailyPointsLog(date, 'earn', task.plusPts, task.icon + ' ' + task.name, 'task_' + taskId);
    showAlert(task.icon + ' ' + task.name + ' 已完成！<strong>+' + task.plusPts + '分</strong>');
  }
  saveData(data);
  updateTaskCard(taskId);
  _debouncedCheckAchievements();
  AppState._processingTask = false;
}

/* ===== 任务扣分 ===== */
/**
 * 日常任务扣分（仅含 minusTrigger 的任务支持）。若已加分则撤回后再扣；已扣分不允许重复扣。
 * @param {number} taskId - DAILY_TASKS 的任务 ID
 */
function taskDeduct(taskId) {
  if (AppState._processingTask) return;
  AppState._processingTask = true;
  var date = document.getElementById('daily-date').value;
  if (!date) { AppState._processingTask = false; showAlert('请先选择日期', 'error'); return; }
  var dayData = getDayData(date);
  var task = AppState.DAILY_TASKS.find(function(t){ return t.id === taskId; });
  if (!task || !task.minusTrigger) { AppState._processingTask = false; showAlert('该项目不支持扣分', 'error'); return; }

  var wasDone = dayData.tasks[taskId] && dayData.tasks[taskId].done;
  if (wasDone && dayData.tasks[taskId].delta > 0) {
    AppState.data.dailyPoints = (AppState.data.dailyPoints || 0) - dayData.tasks[taskId].delta;
    AppState.data.totalPoints = AppState.data.dailyPoints + (AppState.data.advancedPoints || 0);
    removeLastDailyLog(date, 'task_' + taskId);
  }
  if (wasDone && dayData.tasks[taskId].delta < 0) {
    AppState._processingTask = false;
    showAlert(task.name + ' 今日已扣分，不能重复扣！', 'error');
    return;
  }

  AppState.data.dailyPoints = (AppState.data.dailyPoints || 0) + task.minusPts;
  AppState.data.totalPoints = AppState.data.dailyPoints + (AppState.data.advancedPoints || 0);
  dayData.tasks[taskId] = { done: true, delta: task.minusPts, ts: new Date().toISOString() };
  addDailyPointsLog(date, 'spend', task.minusPts, task.icon + ' ' + task.minusTrigger, 'task_' + taskId);
  showAlert(task.icon + ' ' + task.minusTrigger + '！<strong>' + task.minusPts + '分</strong>');
  saveData(data);
  updateTaskCard(taskId);
  AppState._processingTask = false;
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
  var rule = AppState.BEDTIME_RULES.find(function(r){ return r.key === key; });
  if (!rule) return;

  if (dayData.bedtime && dayData.bedtime.key === key) {
    // 取消
    AppState.data.dailyPoints = (AppState.data.dailyPoints || 0) - rule.pts;
    removeLastDailyLog(date, 'bedtime');
    dayData.bedtime = null;
    AppState.data.totalPoints = (AppState.data.dailyPoints || 0) + (AppState.data.advancedPoints || 0);
    showAlert('就寝打卡已取消（-' + rule.pts + '分）');
  } else {
    // 之前有其他就寝记录，先撤回
    if (dayData.bedtime) {
      var prev = AppState.BEDTIME_RULES.find(function(r){ return r.key === dayData.bedtime.key; });
      if (prev) {
        AppState.data.dailyPoints = (AppState.data.dailyPoints || 0) - prev.pts;
        removeLastDailyLog(date, 'bedtime');
      }
    }
    AppState.data.dailyPoints = (AppState.data.dailyPoints || 0) + rule.pts;
    AppState.data.totalPoints = (AppState.data.dailyPoints || 0) + (AppState.data.advancedPoints || 0);
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
  AppState.data.dailyPoints = (AppState.data.dailyPoints || 0) + pts;
  AppState.data.totalPoints = (AppState.data.dailyPoints || 0) + (AppState.data.advancedPoints || 0);
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
  AppState.data.dailyPoints = (AppState.data.dailyPoints || 0) - extra.pts;
  AppState.data.totalPoints = (AppState.data.dailyPoints || 0) + (AppState.data.advancedPoints || 0);
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
  AppState.data.pointsLog.push({
    id: Date.now().toString() + 'd',
    time: new Date().toISOString(),
    type: type,
    delta: delta,
    balance: AppState.data.dailyPoints,
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
  for (var i = AppState.data.pointsLog.length - 1; i >= 0; i--) {
    var log = AppState.data.pointsLog[i];
    if (log.desc && log.desc.indexOf('[' + date + ']') === 0 && log._dailyCat === category) {
      AppState.data.pointsLog.splice(i, 1);
      return;
    }
  }
  // 兜底：移除当天最后一条
  for (var j = AppState.data.pointsLog.length - 1; j >= 0; j--) {
    if (AppState.data.pointsLog[j].desc && AppState.data.pointsLog[j].desc.indexOf('[' + date + ']') === 0) {
      AppState.data.pointsLog.splice(j, 1);
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
  if (!AppState.data.dailyTasks || !AppState.data.dailyTasks[date]) return { earned: 0, spent: 0, extras: 0 };
  var dd = AppState.data.dailyTasks[date];
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

/* ===== 单张任务卡片 HTML（全量+增量复用） ===== */
/**
 * 生成单张日常任务卡片的 HTML 字符串，不含外层包裹 div
 * @param {object} task - DAILY_TASKS 中的任务对象
 * @param {object} dayData - 当日数据
 * @returns {string}
 */
function renderTaskCardHTML(task, dayData) {
  var state = dayData.tasks[task.id];
  var done = state && state.done;
  var delta = state ? state.delta : 0;
  var canMinus = task.minusPts < 0;

  var cardBg = done ? (delta > 0 ? 'var(--task-done-bg)' : 'var(--task-fail-bg)') : 'var(--task-todo-bg)';
  var cardBorder = done ? (delta > 0 ? 'var(--task-done-border)' : 'var(--task-fail-border)') : 'var(--task-todo-border)';
  var stateLabel = done ? (delta > 0 ? '<span class="badge badge-green">+'+delta+'分</span>' : '<span class="badge badge-red">'+delta+'分</span>') : '<span class="badge badge-gray">未打卡</span>';
  var checkBtnClass = done && delta > 0 ? 'btn btn-primary' : 'btn';
  var minusBtnClass = done && delta < 0 ? 'btn btn-danger' : 'btn';
  var checkDisabled = done && delta > 0 ? 'style="opacity:0.5"' : '';
  var minusDisabled = (done && delta < 0) || !canMinus ? 'style="opacity:0.35;cursor:not-allowed"' : '';
  var taskStateClass = done ? (delta > 0 ? ' task-done' : ' task-fail') : '';

  var html = '<div class="card' + taskStateClass + '" style="margin-top:8px;background:'+cardBg+';border:1px solid '+cardBorder+'">' +
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
  return html;
}

/**
 * 打卡后增量更新：仅更新一张任务卡片 DOM + 指标统计 + 提醒 + 就寝状态
 * @param {number} taskId - 已打卡的任务 ID
 */
function updateTaskCard(taskId) {
  var date = document.getElementById('daily-date').value;
  if (!date) return;
  var dayData = getDayData(date);
  var task = AppState.DAILY_TASKS.find(function(t){ return t.id === taskId; });
  if (!task) return;

  // 替换单张卡片 DOM（outerHTML 替换包含 id 的外层 div）
  var wrapper = document.getElementById('task-card-' + taskId);
  if (wrapper) {
    wrapper.outerHTML = '<div id="task-card-' + taskId + '">' + renderTaskCardHTML(task, dayData) + '</div>';
  }

  // 更新积分统计
  var ptsInfo = calcDayPoints(date);
  document.getElementById('dailyMetrics').innerHTML =
    '<div class="metric"><div class="metric-label">当日获得</div><div class="metric-value green">+' + (ptsInfo.earned + ptsInfo.extras) + '</div></div>' +
    '<div class="metric"><div class="metric-label">当日扣分</div><div class="metric-value" style="color:var(--js-red)">' + Math.abs(ptsInfo.spent) + '</div></div>' +
    '<div class="metric"><div class="metric-label">当日净得</div><div class="metric-value ' + (ptsInfo.total > 0 ? 'gold' : '') + '">' + (ptsInfo.total > 0 ? '+' : '') + ptsInfo.total + '</div></div>' +
    '<div class="metric"><div class="metric-label">行为积分余额</div><div class="metric-value gold">' + (AppState.data.dailyPoints || 0) + '</div></div>';

  // 更新未打卡提醒
  var uncheckedCount = 0;
  var uncheckedNames = [];
  AppState.DAILY_TASKS.forEach(function(task) {
    var st = dayData.tasks[task.id];
    if (!st || !st.done) {
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

  // 更新就寝状态（状态可能没变但简单更新保同步）
  var bedtimeStatus = document.getElementById('bedtimeStatus');
  if (dayData.bedtime) {
    var br = AppState.BEDTIME_RULES.find(function(r){ return r.key === dayData.bedtime.key; });
    bedtimeStatus.innerHTML = '已记录：' + (br ? br.icon + ' ' + br.label + '（' + br.time + '）' : dayData.bedtime.key) +
      '　<button class="btn" style="padding:2px 8px;font-size:11px;margin-left:8px" onclick="bedtimeCancel()">取消</button>';
  } else {
    bedtimeStatus.innerHTML = '今日还未记录就寝时间，请点击下方按钮打卡';
  }
  AppState.BEDTIME_RULES.forEach(function(r){
    var btn = document.getElementById('btn-bed-' + r.key);
    if (btn) {
      var active = dayData.bedtime && dayData.bedtime.key === r.key;
      btn.style.fontWeight = active ? '600' : '400';
      btn.style.boxShadow = active ? '0 0 0 2px ' + (r.key === 'chat' ? 'var(--js-cyan)' : r.key === 'quiet' ? 'var(--js-green)' : 'var(--js-yellow)') : 'none';
    }
  });
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
    '<div class="metric"><div class="metric-label">行为积分余额</div><div class="metric-value gold">' + (AppState.data.dailyPoints || 0) + '</div></div>';

  // 任务卡片（用 function 生成单张卡片 HTML，供全量/增量复用）
  var taskList = document.getElementById('dailyTaskList');
  var html = '';
  AppState.DAILY_TASKS.forEach(function(task){
    html += '<div id="task-card-' + task.id + '">' + renderTaskCardHTML(task, dayData) + '</div>';
  });
  taskList.innerHTML = html;

  // 未打卡提示
  var uncheckedCount = 0;
  var uncheckedNames = [];
  AppState.DAILY_TASKS.forEach(function(task) {
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
    var br = AppState.BEDTIME_RULES.find(function(r){ return r.key === dayData.bedtime.key; });
    bedtimeStatus.innerHTML = '已记录：' + (br ? br.icon + ' ' + br.label + '（' + br.time + '）' : dayData.bedtime.key) +
      '　<button class="btn" style="padding:2px 8px;font-size:11px;margin-left:8px" onclick="bedtimeCancel()">取消</button>';
  } else {
    bedtimeStatus.innerHTML = '今日还未记录就寝时间，请点击下方按钮打卡';
  }

  // 更新就寝按钮状态
  AppState.BEDTIME_RULES.forEach(function(r){
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
  var prev = AppState.BEDTIME_RULES.find(function(r){ return r.key === dayData.bedtime.key; });
  if (prev) {
    AppState.data.dailyPoints = (AppState.data.dailyPoints || 0) - prev.pts;
    AppState.data.totalPoints = (AppState.data.dailyPoints || 0) + (AppState.data.advancedPoints || 0);
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
  if (!AppState.data.dailyTasks) AppState.data.dailyTasks = {};
  var dates = Object.keys(AppState.data.dailyTasks).sort(function(a,b){ return b.localeCompare(a); });
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
    var dd = AppState.data.dailyTasks[date];
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

/* ===== 计算单日专注力指数 ===== */
/**
 * 基于日常打卡数据计算单日专注力指数（0-100）
 * 公式：任务完成率×50 + 就寝打卡×25 + 无扣分奖励×25
 * - 任务完成率 = 正向完成任务数 / 5
 * - 就寝打卡 = 有就寝记录则得25分
 * - 无扣分 = 当日无扣分记录则得25分
 * @param {string} date - YYYY-MM-DD
 * @returns {{ score:number, tasksDone:number, bedtime:boolean, hasDeduction:boolean, maxPossible:number }}
 */
function calcConcentrationIndex(date) {
  if (!AppState.data.dailyTasks || !AppState.data.dailyTasks[date]) {
    return { score: 0, tasksDone: 0, bedtime: false, hasDeduction: false, maxPossible: 100 };
  }
  var dd = AppState.data.dailyTasks[date];
  var tasksDone = 0, hasDeduction = false;
  Object.keys(dd.tasks).forEach(function(k){
    var t = dd.tasks[k];
    if (t && t.done) {
      if (t.delta > 0) tasksDone++;
      else if (t.delta < 0) hasDeduction = true;
    }
  });
  var bedtime = !!(dd.bedtime && dd.bedtime.key);
  var taskScore = (tasksDone / 5) * 50;
  var bedtimeScore = bedtime ? 25 : 0;
  var deductionScore = hasDeduction ? 0 : 25;
  var score = Math.round(taskScore + bedtimeScore + deductionScore);
  return { score: score, tasksDone: tasksDone, bedtime: bedtime, hasDeduction: hasDeduction, maxPossible: 100 };
}

/* ===== 计算专注力统计数据 ===== */
/**
 * 计算专注力相关统计数据：周/月指数、连续打卡天数、完成率
 * @returns {{ weekAvg:number, monthAvg:number, streakDays:number, weekCompletion:number, weekDays:number }}
 */
function calcConcentrationStats() {
  if (!AppState.data.dailyTasks) AppState.data.dailyTasks = {};
  var dates = Object.keys(AppState.data.dailyTasks).sort();
  if (!dates.length) return { weekAvg: 0, monthAvg: 0, streakDays: 0, weekCompletion: 0, weekDays: 0 };

  var now = new Date();
  var today = fmtLocalDate(now);

  // 计算本周一和本月1号
  var dayOfWeek = now.getDay(); // 0=Sun
  var mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  var monday = new Date(now);
  monday.setDate(now.getDate() + mondayOffset);
  var weekStart = fmtLocalDate(monday);
  var monthStart = fmtLocalDate(new Date(now.getFullYear(), now.getMonth(), 1));

  var weekScores = [], monthScores = [];
  var weekTotalTasks = 0, weekDoneTasks = 0;

  dates.forEach(function(date){
    var idx = calcConcentrationIndex(date);
    if (date >= weekStart && date <= today) {
      weekScores.push(idx.score);
      weekTotalTasks += 5;
      weekDoneTasks += idx.tasksDone;
    }
    if (date >= monthStart && date <= today) {
      monthScores.push(idx.score);
    }
  });

  var weekAvg = weekScores.length > 0 ? Math.round(weekScores.reduce(function(a,b){return a+b;},0) / weekScores.length) : 0;
  var monthAvg = monthScores.length > 0 ? Math.round(monthScores.reduce(function(a,b){return a+b;},0) / monthScores.length) : 0;
  var weekCompletion = weekTotalTasks > 0 ? Math.round(weekDoneTasks / weekTotalTasks * 100) : 0;

  // 连续专注天数：从昨天往前数的正向完成天数（正向完成 = 所有5项完成+就寝+无扣分）
  var streakDays = 0;
  for (var i = dates.length - 1; i >= 0; i--) {
    if (dates[i] >= today) continue; // 跳过今天
    var dIdx = calcConcentrationIndex(dates[i]);
    // 全部正向完成：5项全完成 + 就寝 + 无扣分
    if (dIdx.tasksDone === 5 && dIdx.bedtime && !dIdx.hasDeduction) {
      streakDays++;
    } else {
      break;
    }
  }

  return { weekAvg: weekAvg, monthAvg: monthAvg, streakDays: streakDays, weekCompletion: weekCompletion, weekDays: weekScores.length };
}

/* ===== 渲染专注力统计视图 ===== */
/**
 * 渲染专注力统计面板：指标卡片 + 趋势图 + 每日明细表
 * 专注力指数基于 C1 稳定专注力能力设计，适用于所有年级
 */
function renderConcentration() {
  if (!AppState.data.dailyTasks) AppState.data.dailyTasks = {};

  var stats = calcConcentrationStats();
  var dates = Object.keys(AppState.data.dailyTasks).sort();

  // 指标卡片：4项
  document.getElementById('concentrationMetrics').innerHTML =
    '<div class="metric"><div class="metric-label">本周专注力</div><div class="metric-value blue">' + stats.weekAvg + '<span style="font-size:14px;opacity:0.6">/100</span></div></div>' +
    '<div class="metric"><div class="metric-label">本月专注力</div><div class="metric-value gold">' + stats.monthAvg + '<span style="font-size:14px;opacity:0.6">/100</span></div></div>' +
    '<div class="metric"><div class="metric-label">连续专注天数</div><div class="metric-value green">' + stats.streakDays + '<span style="font-size:14px;opacity:0.6">天</span></div></div>' +
    '<div class="metric"><div class="metric-label">本周完成率</div><div class="metric-value" style="color:var(--js-cyan)">' + stats.weekCompletion + '<span style="font-size:14px;opacity:0.6">%</span></div></div>';

  // 每日明细表（按日期降序，显示近30天）
  var tbody = document.getElementById('concentrationTable');
  var mobCards = document.getElementById('concentrationMobCards');
  if (!dates.length) {
    tbody.innerHTML = '';
    if (mobCards) mobCards.innerHTML = '';
    document.getElementById('concentrationEmpty').classList.remove('hidden');
    renderConcentrationChart([]);
    return;
  }
  document.getElementById('concentrationEmpty').classList.add('hidden');

  var reversed = dates.slice().sort(function(a,b){ return b.localeCompare(a); });
  var html = '', mobHtml = '';
  var chartData = []; // 用于图表的数据（按日期升序）

  reversed.forEach(function(date){
    var d = new Date(date + 'T00:00:00');
    var weekdays = ['周日','周一','周二','周三','周四','周五','周六'];
    var weekStr = weekdays[d.getDay()];
    var idx = calcConcentrationIndex(date);
    var taskStr = idx.tasksDone + '/5';
    var bedStr = idx.bedtime ? '✅' : '❌';
    var dedStr = idx.hasDeduction ? '<span style="color:var(--js-red)">⚠️</span>' : '✅';
    var scoreClass = idx.score >= 80 ? 'green' : (idx.score >= 60 ? 'gold' : 'red');
    html += '<tr>' +
      '<td style="white-space:nowrap"><strong>' + date + '</strong><br><span style="font-size:11px;color:var(--js-text-secondary)">' + weekStr + '</span></td>' +
      '<td><span style="font-size:11px;color:var(--js-text-secondary)">' + weekStr + '</span></td>' +
      '<td><strong>' + taskStr + '</strong></td>' +
      '<td>' + bedStr + '</td>' +
      '<td>' + dedStr + '</td>' +
      '<td><span class="pts-change ' + scoreClass + ' font-mono" style="font-size:14px">' + idx.score + '</span></td>' +
    '</tr>';
    mobHtml += '<div class="mob-card"><div class="mob-card-field"><span class="field-label">日期</span><span class="field-value"><strong>' + date + '</strong> ' + weekStr + '</span></div><div class="mob-card-field"><span class="field-label">完成</span><span class="field-value">' + taskStr + '</span></div><div class="mob-card-field"><span class="field-label">就寝</span><span class="field-value">' + bedStr + '</span></div><div class="mob-card-field"><span class="field-label">扣分</span><span class="field-value">' + dedStr + '</span></div><div class="mob-card-field"><span class="field-label">指数</span><span class="field-value pts-change ' + scoreClass + ' font-mono">' + idx.score + '</span></div></div>';
  });
  tbody.innerHTML = html;
  if (mobCards) mobCards.innerHTML = mobHtml;

  // 近30天趋势图（日期升序）
  var last30Dates = dates.filter(function(d){
    var now = fmtLocalDate(new Date());
    return d <= now && d >= fmtLocalDate(new Date(Date.now() - 30 * 86400000));
  }).sort();
  renderConcentrationChart(last30Dates);
}

/* ===== 渲染专注力趋势折线图 ===== */
/**
 * 渲染近30天专注力指数趋势折线图
 * @param {string[]} dateList - 日期数组（已排序）
 */
function renderConcentrationChart(dateList) {
  if (AppState.concentrationChart) AppState.concentrationChart.destroy();

  if (!dateList || !dateList.length) {
    AppState.concentrationChart = null;
    return;
  }

  var labels = [];
  var scores = [];
  dateList.forEach(function(date){
    var d = new Date(date + 'T00:00:00');
    var weekdays = ['周日','周一','周二','周三','周四','周五','周六'];
    var weekStr = weekdays[d.getDay()];
    labels.push(date + '\n' + weekStr);
    var idx = calcConcentrationIndex(date);
    scores.push(idx.score);
  });

  AppState.concentrationChart = new Chart(document.getElementById('concentrationChart'), {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        label: '专注力指数',
        data: scores,
        borderColor: '#00e8ff',
        backgroundColor: 'rgba(0,232,255,0.08)',
        borderWidth: 2,
        pointRadius: 4,
        pointHoverRadius: 7,
        pointBackgroundColor: function(ctx){
          var v = ctx.dataset.data[ctx.dataIndex];
          return v >= 80 ? '#22ffb3' : (v >= 60 ? '#fbbf24' : '#ff3860');
        },
        pointBorderColor: 'rgba(0,232,255,0.4)',
        pointHoverBackgroundColor: '#00e8ff',
        fill: true,
        tension: 0.3
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: function(ctx){ return '专注力指数: ' + ctx.parsed.y + '/100'; }
          }
        }
      },
      scales: {
        x: {
          ticks: { font: { size: 10 }, maxRotation: 45, autoSkip: false, color: 'rgba(160,180,210,0.6)' },
          grid: { color: 'rgba(0,232,255,0.05)' }
        },
        y: {
          min: 0,
          max: 100,
          ticks: { color: 'rgba(160,180,210,0.6)' },
          grid: { color: 'rgba(0,232,255,0.05)' },
          title: { display: true, text: '专注力指数', color: 'rgba(160,180,210,0.6)' }
        }
      }
    }
  });
}

/* ===== 阅读打卡 ===== */

/**
 * 获取某日阅读打卡数据（不存在则返回 null）
 * @param {string} date - YYYY-MM-DD
 * @returns {{ duration:number, note:string, ts:string }|null}
 */
function getReadingData(date) {
  if (!AppState.data.dailyTasks || !AppState.data.dailyTasks[date]) return null;
  return AppState.data.dailyTasks[date].reading || null;
}

/**
 * 阅读打卡/更新。给定日期记录阅读时长和内容。
 * 若已有记录则更新，无则新建。
 */
function readingCheckin() {
  var date = document.getElementById('daily-date').value;
  if (!date) { showAlert('请先选择日期', 'error'); return; }
  var duration = parseInt(document.getElementById('readingDuration').value);
  var note = document.getElementById('readingNote').value.trim();
  if (!duration || duration < 1) { showAlert('请填写有效的阅读时长（分钟）', 'error'); return; }

  var dayData = getDayData(date);
  var prevReading = dayData.reading;
  dayData.reading = { duration: duration, note: note, ts: new Date().toISOString() };
  saveData(data);
  checkAchievements();
  showAlert('📖 阅读打卡成功！阅读 ' + duration + ' 分钟' + (note ? '（' + note + '）' : ''));
  renderReading();
}

/**
 * 取消阅读打卡（删除当日阅读记录）
 */
function readingCancel() {
  var date = document.getElementById('daily-date').value;
  if (!date) return;
  var dayData = getDayData(date);
  if (!dayData.reading) return;
  delete dayData.reading;
  saveData(data);
  showAlert('阅读打卡已取消');
  renderReading();
}

/* ===== 计算阅读统计数据 ===== */

/**
 * 计算阅读相关统计数据：本周累计/日均/本月累计
 * @returns {{ weekTotal:number, weekAvg:number, weekDays:number, monthTotal:number, monthDays:number, monthAvg:number, todayDuration:number }}
 */
function calcReadingStats() {
  if (!AppState.data.dailyTasks) AppState.data.dailyTasks = {};
  var dates = Object.keys(AppState.data.dailyTasks).sort();
  if (!dates.length) return { weekTotal: 0, weekAvg: 0, weekDays: 0, monthTotal: 0, monthDays: 0, monthAvg: 0, todayDuration: 0 };

  var now = new Date();
  var today = fmtLocalDate(now);

  // 本周一和本月1号
  var dayOfWeek = now.getDay();
  var mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  var monday = new Date(now);
  monday.setDate(now.getDate() + mondayOffset);
  var weekStart = fmtLocalDate(monday);
  var monthStart = fmtLocalDate(new Date(now.getFullYear(), now.getMonth(), 1));

  var weekTotal = 0, weekDays = 0;
  var monthTotal = 0, monthDays = 0;
  var todayDuration = 0;

  dates.forEach(function(date){
    var reading = getReadingData(date);
    if (!reading) return;
    if (date === today) todayDuration = reading.duration;
    if (date >= weekStart && date <= today) {
      weekTotal += reading.duration;
      weekDays++;
    }
    if (date >= monthStart && date <= today) {
      monthTotal += reading.duration;
      monthDays++;
    }
  });

  var weekAvg = weekDays > 0 ? Math.round(weekTotal / weekDays) : 0;
  var monthAvg = monthDays > 0 ? Math.round(monthTotal / monthDays) : 0;

  return { weekTotal: weekTotal, weekAvg: weekAvg, weekDays: weekDays, monthTotal: monthTotal, monthDays: monthDays, monthAvg: monthAvg, todayDuration: todayDuration };
}

/* ===== 渲染阅读打卡面板 ===== */

/**
 * 渲染阅读打卡面板：今日打卡表单状态 + 统计指标 + 本周明细
 */
function renderReading() {
  var date = document.getElementById('daily-date').value;
  if (!date) {
    var today = fmtLocalDate(new Date());
    document.getElementById('daily-date').value = today;
    date = today;
  }

  var reading = getReadingData(date);

  // 表单状态
  var durInput = document.getElementById('readingDuration');
  var noteInput = document.getElementById('readingNote');
  var checkinBtn = document.getElementById('btnReadingCheckin');
  var cancelBtn = document.getElementById('btnReadingCancel');
  var statusDiv = document.getElementById('readingStatus');

  if (reading) {
    durInput.value = reading.duration;
    noteInput.value = reading.note || '';
    durInput.disabled = true;
    noteInput.disabled = true;
    checkinBtn.style.display = 'none';
    cancelBtn.style.display = '';
    statusDiv.innerHTML = '✅ 今日已打卡 &nbsp;|&nbsp; 阅读 <strong>' + reading.duration + '</strong> 分钟' +
      (reading.note ? '（' + reading.note + '）' : '');
  } else {
    durInput.value = '';
    noteInput.value = '';
    durInput.disabled = false;
    noteInput.disabled = false;
    checkinBtn.style.display = '';
    cancelBtn.style.display = 'none';
    statusDiv.innerHTML = '今日还未阅读打卡，请填写阅读时长后点击打卡';
  }

  // 统计指标 + 连续打卡天数
  var stats = calcReadingStats();
  var streakDays = calcConsecutiveReadingDays();
  document.getElementById('readingMetrics').innerHTML =
    '<div class="metric"><div class="metric-label">本周累计</div><div class="metric-value blue">' + stats.weekTotal + '<span style="font-size:14px;opacity:0.6">分钟</span></div></div>' +
    '<div class="metric"><div class="metric-label">本周日均</div><div class="metric-value green">' + stats.weekAvg + '<span style="font-size:14px;opacity:0.6">分钟</span></div></div>' +
    '<div class="metric"><div class="metric-label">本周天数</div><div class="metric-value gold">' + stats.weekDays + '<span style="font-size:14px;opacity:0.6">天</span></div></div>' +
    '<div class="metric"><div class="metric-label">连续打卡</div><div class="metric-value" style="color:var(--js-cyan)">' + streakDays + '<span style="font-size:14px;opacity:0.6">天</span></div></div>';

  // 本周明细表
  var now = new Date();
  var dayOfWeek = now.getDay();
  var mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  var monday = new Date(now);
  monday.setDate(now.getDate() + mondayOffset);
  var weekStart = fmtLocalDate(monday);
  var today = fmtLocalDate(now);

  var weekDates = Object.keys(AppState.data.dailyTasks || {}).filter(function(d){
    return d >= weekStart && d <= today;
  }).sort(function(a,b){ return b.localeCompare(a); });

  var tbody = document.getElementById('readingTable');
  var mobCards = document.getElementById('readingMobCards');
  var emptyDiv = document.getElementById('readingEmpty');

  var html = '', mobHtml = '';
  var hasData = false;

  weekDates.forEach(function(date){
    var rd = getReadingData(date);
    if (!rd) return;
    hasData = true;
    var d = new Date(date + 'T00:00:00');
    var weekdays = ['周日','周一','周二','周三','周四','周五','周六'];
    var weekStr = weekdays[d.getDay()];
    var noteStr = rd.note || '--';
    html += '<tr><td><strong>' + date + '</strong><br><span style="font-size:11px;color:var(--js-text-secondary)">' + weekStr + '</span></td>' +
      '<td><span class="pts-change plus font-mono">' + rd.duration + '<span style="font-size:11px;opacity:0.6">分钟</span></span></td>' +
      '<td style="font-size:12px;color:var(--js-text-secondary)">' + noteStr + '</td></tr>';
    mobHtml += '<div class="mob-card"><div class="mob-card-field"><span class="field-label">日期</span><span class="field-value"><strong>' + date + '</strong> ' + weekStr + '</span></div><div class="mob-card-field"><span class="field-label">时长</span><span class="field-value pts-change plus font-mono">' + rd.duration + '分钟</span></div><div class="mob-card-field"><span class="field-label">内容</span><span class="field-value" style="font-size:12px;color:var(--js-text-secondary)">' + noteStr + '</span></div></div>';
  });

  if (hasData) {
    tbody.innerHTML = html;
    if (mobCards) mobCards.innerHTML = mobHtml;
    emptyDiv.classList.add('hidden');
  } else {
    tbody.innerHTML = '';
    if (mobCards) mobCards.innerHTML = '';
    emptyDiv.classList.remove('hidden');
  }

  renderReadingChart(); // 渲染近30天趋势图
}

/**
 * 连续阅读打卡天数（从昨天往前数，今天是当天不纳入连续判断）
 * @returns {number}
 */
function calcConsecutiveReadingDays() {
  if (!AppState.data.dailyTasks) return 0;
  var dates = Object.keys(AppState.data.dailyTasks).sort();
  if (!dates.length) return 0;

  var today = fmtLocalDate(new Date());
  // 从昨天开始往前计连续
  var count = 0;
  // 检查今天是否有阅读
  var todayReading = getReadingData(today);
  // 从昨天开始往前数
  for (var ci = dates.length - 1; ci >= 0; ci--) {
    var date = dates[ci];
    if (date === today) continue; // 跳过今天
    if (date >= today) continue; // 跳过未来日期
    var rd = getReadingData(date);
    if (!rd) break;
    // 检查日期连续性
    if (count > 0) {
      var prevDate = dates[ci + 1];
      if (prevDate === today) {
        // 昨天是今天的前一天
        var expected = new Date(today);
        expected.setDate(expected.getDate() - 1);
        var expectedStr = fmtLocalDate(expected);
        if (date !== expectedStr) break;
      } else {
        var d1 = new Date(date + 'T00:00:00');
        var d2 = new Date(prevDate + 'T00:00:00');
        if (Math.abs((d2 - d1) / 86400000 - 1) > 0.1) break;
      }
    }
    count++;
  }

  return count;
}

/* ===== 阅读趋势图 ===== */

/**
 * 渲染阅读时长趋势图（最近30天折线图）
 */
function renderReadingChart() {
  if (AppState.readingChart) AppState.readingChart.destroy();

  if (!AppState.data.dailyTasks) { AppState.readingChart = null; return; }

  var dates = Object.keys(AppState.data.dailyTasks).sort();
  if (!dates.length) { AppState.readingChart = null; return; }

  var now = new Date();
  var last30Dates = [];
  for (var ri = 29; ri >= 0; ri--) {
    var d = new Date(now);
    d.setDate(now.getDate() - ri);
    last30Dates.push(fmtLocalDate(d));
  }

  var labels = [];
  var durations = [];
  var hasData = false;
  last30Dates.forEach(function(date){
    var d = new Date(date + 'T00:00:00');
    var weekdays = ['周日','周一','周二','周三','周四','周五','周六'];
    var weekStr = weekdays[d.getDay()];
    var rd = getReadingData(date);
    var dur = rd ? rd.duration : 0;
    if (dur > 0) hasData = true;
    labels.push(date.substr(5) + '\n' + weekStr);
    durations.push(dur);
  });

  if (!hasData) {
    AppState.readingChart = null;
    return;
  }

  AppState.readingChart = new Chart(document.getElementById('readingChart'), {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        label: '阅读时长（分钟）',
        data: durations,
        borderColor: '#fbbf24',
        backgroundColor: 'rgba(251,191,36,0.08)',
        borderWidth: 2,
        pointRadius: function(ctx){
          var v = ctx.dataset.data[ctx.dataIndex];
          return v > 0 ? 4 : 0;
        },
        pointHoverRadius: 7,
        pointBackgroundColor: function(ctx){
          var v = ctx.dataset.data[ctx.dataIndex];
          if (v === 0) return 'transparent';
          return v >= 30 ? '#22ffb3' : (v >= 15 ? '#fbbf24' : '#ff3860');
        },
        pointBorderColor: 'rgba(251,191,36,0.3)',
        fill: true,
        tension: 0.3
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: function(ctx){
              var v = ctx.parsed.y;
              return v > 0 ? '阅读时长: ' + v + ' 分钟' : '无记录';
            }
          }
        }
      },
      scales: {
        x: {
          ticks: { font: { size: 10 }, maxRotation: 45, autoSkip: true, autoSkipPadding: 3, color: 'rgba(160,180,210,0.6)' },
          grid: { color: 'rgba(251,191,36,0.05)' }
        },
        y: {
          beginAtZero: true,
          ticks: { color: 'rgba(160,180,210,0.6)' },
          grid: { color: 'rgba(251,191,36,0.05)' },
          title: { display: true, text: '分钟', color: 'rgba(160,180,210,0.6)' }
        }
      }
    }
  });
}

/* ===== 注册到 AppState 命名空间 ===== */
AppState.switchDailySubTab = switchDailySubTab;
AppState.getDayData = getDayData;
AppState.taskCheck = taskCheck;
AppState.taskDeduct = taskDeduct;
AppState.bedtimeCheck = bedtimeCheck;
AppState.addExtraTask = addExtraTask;
AppState.removeExtraTask = removeExtraTask;
AppState.addDailyPointsLog = addDailyPointsLog;
AppState.removeLastDailyLog = removeLastDailyLog;
AppState.calcDayPoints = calcDayPoints;
AppState.renderDaily = renderDaily;
AppState.bedtimeCancel = bedtimeCancel;
AppState.renderDailyHistory = renderDailyHistory;
AppState.calcConcentrationIndex = calcConcentrationIndex;
AppState.calcConcentrationStats = calcConcentrationStats;
AppState.renderConcentration = renderConcentration;
AppState.renderConcentrationChart = renderConcentrationChart;
AppState.getReadingData = getReadingData;
AppState.readingCheckin = readingCheckin;
AppState.readingCancel = readingCancel;
AppState.calcReadingStats = calcReadingStats;
AppState.renderReading = renderReading;
AppState.calcConsecutiveReadingDays = calcConsecutiveReadingDays;
AppState.renderReadingChart = renderReadingChart;
