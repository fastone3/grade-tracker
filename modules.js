/**
 * modules.js — 功能模块层（依赖 core.js + achievements.js + child-switch.js + daily.js，加载顺序第 5）
 * 模块：Tool(getRankBadge) + Dashboard + History + Trend + Points
 * 加载顺序：core.js → achievements.js → child-switch.js → daily.js → modules.js → grade.js → advanced.js → settings.js → main.js
 */

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
