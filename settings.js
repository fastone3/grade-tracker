/**
 * settings.js — 设置面板模块（从 modules.js 拆分）
 *
 * 模块：设置渲染、管理员积分调整、积分规则、同步码/二维码、JSON/CSV/HTML 导出、导入、清空数据
 * 依赖：core.js + achievements.js（全局 data, saveData, showAlert, customConfirm）
 * 加载顺序：第 7 位（main.js 之前，所有功能模块之后）
 */
 /* ===== 渲染：设置面板 ===== */
/**
 * 渲染设置面板：孩子名称/年级编辑、积分规则配置、数据管理入口
 */
function renderSettings() {
  var cfg = getChildrenConfig();
  var nameKey = AppState.currentChild === 1 ? 'name1' : 'name2';
  var gradeKey = AppState.currentChild === 1 ? 'grade1' : 'grade2';
  document.getElementById('cfg-child-name').value = cfg[nameKey];
  document.getElementById('cfg-child-grade').value = cfg[gradeKey] || 5;
  document.getElementById('cfg-total-pts').value = AppState.data.dailyPoints || 0;
  document.getElementById('cfg-curr-daily').textContent = '当前: ' + (AppState.data.dailyPoints || 0);
  document.getElementById('cfg-quiz-pts').value = AppState.data.advancedPoints || 0;
  document.getElementById('cfg-curr-adv').textContent = '当前: ' + (AppState.data.advancedPoints || 0);
  document.getElementById('cfg-base').value = AppState.data.rules.base;
  document.getElementById('cfg-top3').value = AppState.data.rules.top3;
  document.getElementById('cfg-streak-base').value = AppState.data.rules.streakBase;
}

/* ===== 管理员直接修改行为积分 ===== */
/**
 * 管理员直接设置行为积分（覆盖模式），记录变动日志
 */
function saveTotalPoints() {
  var newVal = parseInt(document.getElementById('cfg-total-pts').value);
  if (isNaN(newVal) || newVal < 0) { showAlert('请输入有效的积分值', 'error'); return; }
  var oldVal = AppState.data.dailyPoints || 0;
  var diff = newVal - oldVal;
  AppState.data.dailyPoints = newVal;
  AppState.data.totalPoints = AppState.data.dailyPoints + (AppState.data.advancedPoints || 0);
  AppState.data.pointsLog.push({ id:Date.now().toString(), time:new Date().toISOString(), type:'adjust', pool:'daily', delta:diff, balance:AppState.data.dailyPoints, desc:'管理员调整行为积分：'+oldVal+' → '+newVal });
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
  var oldVal = AppState.data.advancedPoints || 0;
  var diff = newVal - oldVal;
  AppState.data.advancedPoints = newVal;
  AppState.data.totalPoints = (AppState.data.dailyPoints || 0) + AppState.data.advancedPoints;
  AppState.data.pointsLog.push({ id:Date.now().toString(), time:new Date().toISOString(), type:'adjust', pool:'advanced', delta:diff, balance:AppState.data.advancedPoints, desc:'管理员调整刷题积分：'+oldVal+' → '+newVal });
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
  AppState.data.rules = { base:base, top3:top3, streakBase:streakBase };
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
    var json = JSON.stringify(AppState.data);
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
    var childName = AppState.currentChild === 1 ? cfg.name1 : cfg.name2;
    if (!(await customConfirm('导入将覆盖「' + childName + '」当前数据，确定继续？', '导入确认'))) return;
    data = d; AppState.data = d;
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
      data = d; AppState.data = d; saveData(data); renderDashboard(); showAlert('文件同步成功！');
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
  var childName = (AppState.currentChild === 1 ? cfg.name1 : cfg.name2).replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, '_');
  var blob = new Blob([JSON.stringify(AppState.data, null, 2)], {type:'application/json'});
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
  var childName = (AppState.currentChild === 1 ? cfg.name1 : cfg.name2).replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, '_');
  var records = AppState.data.records || [];
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
  var childName = (AppState.currentChild === 1 ? cfg.name1 : cfg.name2).replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, '_');
  var records = AppState.data.records || [];
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
      data = d; AppState.data = d; saveData(data); renderDashboard(); showAlert('数据导入成功！');
    } catch(err) { showAlert('导入失败：文件格式不正确', 'error'); }
  };
  reader.readAsText(file); e.target.value = '';
}

/* ===== 清空数据 ===== */
async function clearAllData() {
  var cfg = getChildrenConfig();
  var childName = AppState.currentChild === 1 ? cfg.name1 : cfg.name2;
  if (!(await customConfirm('确定清空「' + childName + '」的全部数据？此操作不可撤销！', '清空确认'))) return;
  if (!(await customConfirm('再次确认：将删除「' + childName + '」所有成绩记录和积分数据！', '二次确认'))) return;
  data = getDefaultData(); AppState.data = data;
  saveData(data);
  renderDashboard();
  showAlert('数据已清空');
}

/* ===== 手风琴切换 ===== */
/**
 * 切换设置面板的手风琴折叠/展开状态
 * @param {HTMLElement} header - 被点击的手风琴头部元素
 */
function toggleAccordion(header) {
  var item = header.parentElement;
  item.classList.toggle('open');
}

/* ===== 注册到 AppState 命名空间 ===== */
AppState.renderSettings = renderSettings;
AppState.saveTotalPoints = saveTotalPoints;
AppState.saveQuizPoints = saveQuizPoints;
AppState.saveRules = saveRules;
AppState.generateSyncCode = generateSyncCode;
AppState.copySyncCode = copySyncCode;
AppState.fallbackCopy = fallbackCopy;
AppState.showSyncQR = showSyncQR;
AppState.importSyncCode = importSyncCode;
AppState.importSyncFile = importSyncFile;
AppState.doImportSyncFile = doImportSyncFile;
AppState.exportJSON = exportJSON;
AppState.exportCSV = exportCSV;
AppState.exportReport = exportReport;
AppState.importData = importData;
AppState.doImport = doImport;
AppState.clearAllData = clearAllData;
AppState.toggleAccordion = toggleAccordion;
