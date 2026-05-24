/**
 * grade.js — 成绩录入模块（从 modules.js 拆分）
 *
 * 模块：成绩录入、积分计算预览、录入/删除记录、成绩统计
 * 依赖：core.js + achievements.js（全局 data, saveData, showAlert, customConfirm, renderDashboard 等）
 * 加载顺序：第 4 位（modules.js 之后，main.js 之前）
 */
 
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

  pushUndoSnapshot(data);
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
  var record = {
    id:id, date:date, subject:subject, score:score,
    rank:rank, total:total, note:note, earnedPts:earnedPts,
    createdAt:new Date().toISOString()
  };
  // 错题数
  var wrongCount = parseInt(document.getElementById('inp-wrongCount').value);
  if (wrongCount > 0) {
    record.wrongAnswers = { total: wrongCount, corrected: 0 };
  }
  data.records.push(record);
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
  ['inp-subject','inp-score','inp-rank','inp-note','inp-wrongCount'].forEach(function(id){
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
  pushUndoSnapshot(data);
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
  renderCorrection();
  showAlert("已删除「" + record.subject + "」，扣减 " + pts + " 积分");
}

/**
 * 点击订正一项错题（递增 corrected 计数），完成全部订正时触发成就检查
 * @param {string} id - 记录 ID
 */
function toggleWrongCorrected(id) {
  var record = data.records.find(function(r){ return r.id === id; });
  if (!record || !record.wrongAnswers) return;
  if (record.wrongAnswers.corrected >= record.wrongAnswers.total) return;
  pushUndoSnapshot(data);
  record.wrongAnswers.corrected++;
  saveData(data);
  if (record.wrongAnswers.corrected >= record.wrongAnswers.total) {
    checkAchievements();
    showAlert('✅ 「' + record.subject + '」错题已全部订正！');
  } else {
    showAlert('已订正 1 项（' + record.wrongAnswers.corrected + '/' + record.wrongAnswers.total + '）');
  }
  renderCorrection();
  renderHistory();
}
