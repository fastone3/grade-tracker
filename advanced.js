/**
 * advanced.js — 进阶页面模块（从 modules.js 拆分）
 *
 * 模块：周结算、星星状态、进阶挑战 5 类（作业/整理/练书法/计算/阅读）
 * 依赖：core.js + achievements.js（全局 data, saveData, showAlert, customConfirm, fmtLocalDate）
 * 加载顺序：第 4 位（modules.js 之后，main.js 之前）
 */
 /* ===== 进阶页面 ===== */
AppState.advWeekOffset = 0;

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
  var newOff = AppState.advWeekOffset + delta;
  if (newOff > 0) return;
  AppState.advWeekOffset = newOff;
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
  var weekDates = getWeekDates(today, AppState.advWeekOffset);
  var weekKey = weekDates[0];
  var isCurrentWeek = AppState.advWeekOffset === 0;
  var maxDate = isCurrentWeek ? today : weekDates[6];

  document.getElementById('advWeekTitle').textContent = isCurrentWeek ? '本周进阶挑战' : '历史周';
  document.getElementById('advWeekRange').textContent = weekDates[0] + ' ~ ' + weekDates[6];
  document.getElementById('advWeekPrev').style.visibility = 'visible';
  document.getElementById('advWeekNext').style.visibility = AppState.advWeekOffset >= 0 ? 'hidden' : 'visible';

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
