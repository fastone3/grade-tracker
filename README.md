<div align="center">

# 成绩追踪 & 积分系统

面向两个孩子的学习积分管理工具 · 科幻深色 UI · 纯前端运行

[![GitHub Pages](https://img.shields.io/badge/GitHub%20Pages-%23333?style=flat-square&logo=github)](https://fastone3.github.io/grade-tracker/)
[![Netlify Preview](https://img.shields.io/badge/Netlify%20Preview-%2300C7B7?style=flat-square&logo=netlify)](https://unique-youtiao-229b1f.netlify.app/)
[![GitHub last commit](https://img.shields.io/github/last-commit/fastone3/grade-tracker?style=flat-square&color=blue)](https://github.com/fastone3/grade-tracker/commits/main)

</div>

> **一个面向家庭场景的积分激励系统** — 家长配置规则，孩子通过日常打卡、刷题考试积累积分。
> 覆盖 1~6 年级两个孩子的差异化教育需求。

## 在线体验

| 入口 | 地址 | 说明 |
|------|------|------|
| **GitHub Pages** | [fastone3.github.io/grade-tracker](https://fastone3.github.io/grade-tracker/) | 主站，代码推送后自动部署 |
| **Netlify 预览** | [unique-youtiao-229b1f.netlify.app](https://unique-youtiao-229b1f.netlify.app/) | 测试环境，最新功能抢先体验 |

数据完全存储在浏览器 localStorage 中，**无需注册、无需后端、即开即用**。

## 功能模块

| 模块 | 说明 |
|------|------|
| **总览** | 积分余额、录入次数、平均成绩、前3名统计、近期记录 |
| **刷题** | 成绩录入 + 历史记录（搜索/按科目筛选）+ 成绩/排名趋势图 |
| **日常** | 5项打卡任务（加减分）+ 就寝记录 + 附加任务 + 每日历史 |
| **进阶** | 周结算（5类积分，绿星/红星统计，周日手动结算/周一自动结算） |
| **积分** | 积分明细日志 + 手动增减 + 连续前3奖励 + 积分消费 |
| **设置** | 孩子名称/年级配置 + 积分规则可调 + 总积分管理员调整 |
| **同步** | 同步码生成/二维码 + 手动粘贴导入 + 文件导入/导出 |
| **成就** | 按年级差异化展示，18种成就徽章（习惯养成10 + 学习进阶5 + 荣誉殿堂3） |

### 教育设计

- **1-3 年级**：不显示刷题模块，仅日常打卡 + 习惯养成
- **4-6 年级**：能力为主（90%）+ 刷题为辅（10%），重点纠错复盘
- 所有积分规则映射到 8 项底层能力（C1~C8），禁止"为奖励而奖励"

## 技术栈

- **架构**：单页应用（`index.html` + `index.js` + `new_unified.css`），零构建工具
- **前端**：原生 HTML/CSS/JS，科幻深色 UI + 霓虹光效（青/红/绿/黄四色体系）
- **图表**：[Chart.js](https://www.chartjs.org/) CDN
- **二维码**：[QRCode.js](https://github.com/davidshimjs/qrcodejs) CDN
- **存储**：localStorage 双孩子隔离
- **部署**：GitHub Pages（GitHub Actions 自动部署）

## 快速开始

```bash
git clone https://github.com/fastone3/grade-tracker.git
cd grade-tracker/src

# 直接双击 index.html 打开，或：
python -m http.server 8080
# 浏览器打开 http://localhost:8080
```

无需 `npm install`，无需构建 — 纯静态文件，即开即用。

## 使用指南

<details>
<summary><b>日常打卡</b></summary>

1. 选择日期 → 点击"打卡 +5分"完成任务
2. 未完成项目可点击"扣分 -5分"
3. 就寝区选择上床时间
4. 附加任务输入说明和分值即可添加
</details>

<details>
<summary><b>成绩录入</b></summary>

1. 填写日期、科目、成绩、排名
2. 右侧实时预览本次获得积分
3. 录入后自动判断前3名奖励和连续奖励
4. 历史记录支持搜索和科目筛选
</details>

<details>
<summary><b>跨设备同步</b></summary>

1. 设置页 → 点击"生成同步码"
2. 复制同步码或扫描二维码
3. 另一部手机粘贴导入即可
</details>

## 项目结构

```
grade-tracker/
├── ci/                      # CI/CD 质量保障脚本
│   ├── check-cdn.sh         #   CDN 链接可达性检查
│   ├── check-commits.sh     #   Conventional Commits 格式检查
│   ├── check-jsdoc.sh       #   JSDoc 注释覆盖率检查
│   └── verify-live.js       #   部署后线上巡检
├── src/
│   ├── index.html            # 单页应用（HTML 骨架）
│   ├── index.js              # 核心逻辑（~120 KB）
│   ├── new_unified.css       # 科幻深色 UI 样式（霓虹光效体系）
│   ├── README.md             # 本文件
│   └── package.json          # ESLint / HTML-validate 配置
├── tests/                    # 单元测试 + 功能清单
│   ├── harness.js
│   ├── run-all.js
│   ├── unit-grade.js
│   ├── unit-points.js
│   ├── unit-data.js
│   ├── unit-achievements.js
│   └── functional-checklist.js
```

## Commit 规范

本项目使用 [Conventional Commits](https://www.conventionalcommits.org/)：

```
<type>: <中文描述>
```

| Type | 说明 | 示例 |
|------|------|------|
| `feat` | 新功能 | `feat: 新增成就系统` |
| `fix` | Bug 修复 | `fix: 删除记录未同步扣减积分` |
| `docs` | 文档变更 | `docs: 更新使用指南` |
| `style` | 样式/UI 调整 | `style: 优化移动端卡片间距` |
| `refactor` | 代码重构（不改功能） | `refactor: 提取积分计算为独立函数` |
| `chore` | 构建/工具/配置 | `chore: 更新 GitHub Actions 部署脚本` |

## 反馈与贡献

如果你发现了 Bug 或有功能建议，欢迎提交 [GitHub Issue](https://github.com/fastone3/grade-tracker/issues/new)。

## 许可

私人项目，仅供家庭使用。
