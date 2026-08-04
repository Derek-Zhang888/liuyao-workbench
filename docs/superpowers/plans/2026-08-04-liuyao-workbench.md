# 六爻工作台（测试版）实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 交付可实际上手体验的六爻工作台测试版（React 网页版）：9 种起卦排盘、占断输入、卦例库+回收站、md 导入导出、统计与错题本、暗色专业风、桌面/手机响应式。

**Architecture:** React 18 + Vite + Tailwind 前端；排盘引擎为纯函数模块（64 卦静态表 + 干支历法 + 起卦算法 + 盘面生成）；IndexedDB 三表存储（卦例/标签/设置）；md 三层格式（front matter + 起卦参数 + 正文）实现可逆导入导出。

**Tech Stack:** React 18、Vite 5、Tailwind CSS 3、Vitest、IndexedDB（idb-keyval 或原生封装）、React Router（HashRouter，便于 Tauri 打包）。

## Global Constraints

- 界面：暗色专业风（深底 + 金/朱红强调）；五行配色 青#22D3EE 赤#F87171 黄#FACC15 白#E5E7EB 黑#9CA3AF（字色）
- 中文文案；配置驱动（起卦方式/tag/配色在 config/ 下）
- 测试：Vitest 单元测试覆盖 engine/ 与 md/ 模块；UI 组件人工验证（npm run dev + 浏览器 F12 模拟手机）
- 所有数据模块不得依赖 DOM（纯函数，可测）
- 提交频率：每任务一提交，消息前缀 feat:/test:/docs:

---
### Task 1: 项目脚手架 + 暗色主题 + 路由框架

**Files:**
- Create: `package.json`、`vite.config.js`、`tailwind.config.js`、`postcss.config.js`、`index.html`、`src/main.jsx`、`src/App.jsx`、`src/styles/theme.css`、`src/index.css`、`.gitignore`

**Interfaces:**
- Produces: `App.jsx` 渲染 HashRouter 路由：`/`(排盘)、`/lib`(卦例库)、`/stats`(统计)、`/help/:type`(辅助页)、`/settings`(设置)；`theme.css` 导出 CSS 变量 `--bg`、`--panel`、`--gold`、`--red`、`--text`、`--muted` 及五行色 `--wuxing-mu` `--wuxing-huo` `--wuxing-tu` `--wuxing-jin` `--wuxing-shui`

- [ ] **Step 1: 初始化 npm 项目**

```bash
cd /d/liuyao-workbench && npm create vite@latest . -- --template react 2>/dev/null || true
npm install react-router-dom && npm install -D vitest @testing-library/react jsdom
```

- [ ] **Step 2: 写入配置与入口文件**

`vite.config.js` 加 `test: { environment: 'jsdom' }`；`tailwind.config.js` 的 darkMode 用 class，content 指向 `./index.html` 与 `./src/**/*.{js,jsx}`；`index.html` 标题「六爻工作台」；`main.jsx` 挂载 `App.jsx`。

- [ ] **Step 3: 写 theme.css 暗色主题 + 五行色变量**

```css
:root {
  --bg: #0f1115; --panel: #161a22; --border: #232936;
  --gold: #d4af37; --red: #c0392b; --text: #e5e7eb; --muted: #8b93a7;
  --wuxing-mu: #22d3ee; --wuxing-huo: #f87171; --wuxing-tu: #facc15;
  --wuxing-jin: #e5e7eb; --wuxing-shui: #9ca3af;
}
```

- [ ] **Step 4: App.jsx 布局 + 路由 + 导航（顶部导航含 5 个辅助按钮入口 + 设置）**

顶部栏：排盘 / 卦例库 / 统计 三个 Tab + 辅助按钮（卦辞爻辞、纳音、十二长生、生克冲合、取象）+ 设置图标。桌面版左侧导航、手机版顶部 Tab（本任务先做顶部栏统一版，响应式在 Task 14 精调）。

- [ ] **Step 5: 验证**

Run: `npm run dev`，浏览器打开 http://localhost:5173 确认暗色主题 + 导航渲染无报错。

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: 项目脚手架 + 暗色主题 + 路由框架"
```

---
### Task 2: 64 卦静态表 guaTable.js（从 APK 提取）

**Files:**
- Create: `src/engine/guaTable.js`、`scripts/extract_gua.py`（一次性提取脚本，可留仓库）
- Test: `src/engine/guaTable.test.js`

**Interfaces:**
- Produces:
```js
// 每卦对象：宫、名、爻画(1阳2阴, 从初爻到上爻)、世位(0-5)、应位、六亲地支(下→上, 6项, 如"父戌土")、伏神(6项, 空串=无)、游魂/归魂 bool
export const GUA_64 = [ { gong:'乾', name:'乾为天', lines:'111111', shi:5, ying:2,
  liuqin:['父戌土','兄申金','官午火','父辰土','财寅木','孙子水'],
  fushen:['','','','','',''], youhun:false, guihun:false }, ... 64 条 ];
export function findGua(lines) { return GUA_64.find(g => g.lines === lines); }
```

- [ ] **Step 1: 写提取脚本（数据源 b4.java 已反编译在 D:\apk_analysis\jadx_out\sources\b\b\a\a\c2\b4.java）**

`scripts/extract_gua.py`：正则解析 `new r("乾", "乾为天", "111111", 5, 2, "父 戌土", ...)` 行，去掉空格，输出 `guaTable.js` 数组。注意 r() 构造：第 1-3 参数为宫/名/爻画，4-5 为世/应，6-11 六亲，12-15 伏神（-1 与空串→空），16-17 游魂/归魂（1→true）。

- [ ] **Step 2: 运行脚本生成 guaTable.js**

Run: `python scripts/extract_gua.py`，确认生成 64 条、无缺失。

- [ ] **Step 3: 写测试（抽查 4 卦）**

```js
import { findGua, GUA_64 } from './guaTable';
test('64卦齐全', () => expect(GUA_64.length).toBe(64));
test('乾为天', () => { const g = findGua('111111');
  expect(g.name).toBe('乾为天'); expect(g.shi).toBe(5); expect(g.ying).toBe(2);
  expect(g.liuqin[0]).toBe('父戌土'); });
test('天风姤伏神', () => { const g = findGua('211111');
  expect(g.fushen[0]).toBe('财寅木'); });
test('找不到返回undefined', () => expect(findGua('111112')).toBeUndefined());
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run src/engine/guaTable.test.js`。若数据与 b4.java 有出入，回查源文件修正。

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: 64卦静态表（从APK提取）"
```

---
### Task 3: 干支历法模块 ganzhi.js

**Files:**
- Create: `src/engine/ganzhi.js`、`src/data/lunarData.js`（农历数据表）
- Test: `src/engine/ganzhi.test.js`

**Interfaces:**
- Produces:
```js
export function toLunar(date) // {year, month, day, isLeap, ganzhiYear, ganzhiMonth, ganzhiDay, ganzhiHour, xunkong:[地支1,地支2], yuejian:'寅'...}
export const GAN=['甲','乙','丙','丁','戊','己','庚','辛','壬','癸'];
export const ZHI=['子','丑','寅','卯','辰','巳','午','未','申','酉','戌','亥'];
export const WUXING_ZHI={子:'水',丑:'土',寅:'木',卯:'木',辰:'土',巳:'火',午:'火',未:'土',申:'金',酉:'金',戌:'土',亥:'水'};
export const WUXING_GAN={甲:'木',乙:'木',丙:'火',丁:'火',戊:'土',己:'土',庚:'金',辛:'金',壬:'水',癸:'水'};
```

- [ ] **Step 1: 写农历数据表**

`lunarData.js` 用公开农历转换数据（1900-2100 年 lunarInfo 数组，16 位 int 每项，网上公开资料），格式为 `[yearOffset, ...]` 标准实现。

- [ ] **Step 2: 写干支计算（failing tests 先行）**

```js
// toLunar 算法：lunarInfo 查闰月与每月大小 → 农历年月日；
// 年干支=(年-4)%60；月干支=五虎遁(年干)；日干支=儒略日差 mod 60；
// 时干支=五鼠遁(日干)；旬空=(日干支%60 所在旬的空支)；
// 月建=农历月对应地支（正月=寅，固定）。
test('已知日期干支', () => { const r = toLunar(new Date(2026,7,4)); // 2026-08-04
  expect(r.ganzhiYear).toBe('丙午'); expect(r.ganzhiMonth).toMatch(/午|未|申|酉/); ... });
test('旬空计算', () => { const r = toLunar(new Date(2026,7,4));
  expect(Array.isArray(r.xunkong)).toBe(true); });
```

- [ ] **Step 3: 实现 ganzhi.js**（算法如上注释；日干支用已知锚点：2000-01-07 为甲子日 推算，减 60 取余）

- [ ] **Step 4: 跑测试 + 与线上日历核对 3 个日期（如 2026-08-04、2026-01-01、2024-02-10）**

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: 干支历法模块（农历/干支/旬空/月建）"
```

---
### Task 4: 9 种起卦算法 qigua.js

**Files:**
- Create: `src/engine/qigua.js`
- Test: `src/engine/qigua.test.js`

**Interfaces:**
- Produces:
```js
// 统一输出 { lines:'211111'(本卦爻画,初→上), dong:[0,2](动爻索引) }
export function qiguaFromQian(lines);            // 爻名卦：直接给 6 爻画（1阳2阴3老阳4老阴）
export function qiguaFromCoin(randomFn);          // 钱币卦：3枚×6次，3=老阴(6) 7=少阳 8=少阴 9=老阳
export function qiguaFromGuaName(lines);          // 卦名卦
export function qiguaFromNumber(n1,n2,n3,method); // 数字卦 method=1|2
export function qiguaFromBaoshu(digits);          // 报数卦 2-8位
export function qiguaFromTime(date);              // 时间卦
export function qiguaFromRandom(randomFn);        // 电脑卦
export function qiguaFromMinuteSecond(ms,ss);     // 分秒卦
export function qiguaFromShike(date);             // 时刻卦
export const QIGUA_METHODS = [ {id:'qian',name:'钱币卦',...}, ...9项配置 ];
```

- [ ] **Step 1: 写 9 个算法的 failing tests**

```js
// 数字卦算法1：1÷8上卦 余1=乾； (2+3)÷8=5余5=巽； (1+2+3)÷6=6余0→6爻动
test('数字卦算法1', () => { const r = qiguaFromNumber(1,2,3,1);
  expect(r.lines.slice(3)).toBe('111'); expect(r.dong).toEqual([5]); });
// 数字卦算法2：1÷8余1乾，2÷8余2兑，3÷6余3
test('数字卦算法2', () => { const r = qiguaFromNumber(1,2,3,2);
  expect(r.lines).toBe('111211'); expect(r.dong).toEqual([2]); });
// 报数卦 1234：1上乾，2下兑，3、4爻动 → 本卦 111211
test('报数卦', () => { const r = qiguaFromBaoshu('1234');
  expect(r.lines).toBe('111211'); expect(r.dong.sort()).toEqual([2,3]); });
// 卦数映射: 1乾 2兑 3离 4震 5巽 6坎 7艮 8坤 → 爻画
// 钱币卦：randomFn 返回3 → 老阳(9)→阳爻动
test('钱币卦老阳动', () => { const r = qiguaFromCoin(() => 3);
  expect(r.lines).toBe('111111'); expect(r.dong).toEqual([0,1,2,3,4,5]); });
// 分秒卦：分钟数之和÷8上卦, 秒数之和÷8下卦, 四数和÷6动爻
test('分秒卦', () => { const r = qiguaFromMinuteSecond(23,45); // 2+3=5巽 4+5=9余1乾
  expect(r.lines).toBe('111211'); });
```

- [ ] **Step 2: 实现 qigua.js**（数字/报数/分秒/时刻共用"卦数→爻画"映射；老阴老阳→动爻；变爻=1↔2 翻转）

- [ ] **Step 3: 跑测试全绿 + Commit**

---
### Task 5: 盘面生成器 paipan.js

**Files:**
- Create: `src/engine/paipan.js`
- Test: `src/engine/paipan.test.js`

**Interfaces:**
- Produces:
```js
export function paipan({method, params, date}) {
  // 返回 {
  //   ben:{name,gong,liuqin,shi,ying,youhun,guihun}, bian:{name,...}|null,
  //   yao:[6]{liuqin:'父',zhi:'戌',wuxing:'土',line:1,dong:bool,shi:bool,ying:bool,fushen:''|{liuqin,zhi,wuxing}},
  //   liushen:['青龙','朱雀','勾陈','螣蛇','白虎','玄武'], // 初→上，按日干起
  //   yearGZ, monthGZ, dayGZ, hourGZ, xunkong, yuejian, guashen, shashen
  // }
}
export const WUXING_COLOR = { 木:'var(--wuxing-mu)', 火:'var(--wuxing-huo)', 土:'var(--wuxing-tu)', 金:'var(--wuxing-jin)', 水:'var(--wuxing-shui)' };
```

- [ ] **Step 1: 写 failing tests**

```js
// 六神起法：甲乙日起青龙(初爻)，丙丁日起朱雀，戊日起勾陈，己日起螣蛇，庚辛日起白虎，壬癸日起玄武
test('六神起法甲日', () => { const r = paipan({method:'qian', params:{lines:'111111'}, date:new Date(2026,7,4)});
  expect(r.yao.length).toBe(6); expect(r.liushen[0]).toBe('青龙'); });
// 动爻→变卦：乾为天六爻全动 → 变坤为地
test('六爻全动变坤', () => { const r = paipan({method:'qian', params:{lines:'111111', dong:[0,1,2,3,4,5]}, date:new Date(2026,7,4)});
  expect(r.bian.name).toBe('坤为地'); });
// 世应标记
test('世应标记', () => { const r = paipan({method:'qian', params:{lines:'111111', dong:[]}, date:new Date(2026,7,4)});
  expect(r.yao[5].shi).toBe(true); expect(r.yao[2].ying).toBe(true); });
// 伏神（天风姤初爻伏财寅木）
test('伏神', () => { const r = paipan({method:'qian', params:{lines:'211111', dong:[]}, date:new Date(2026,7,4)});
  expect(r.yao[0].fushen.liuqin).toBe('财'); });
```

- [ ] **Step 2: 实现 paipan.js**

要点：本卦查表；动爻翻转得变卦查表（无动爻则 bian=null）；六神按日干起于初爻；旺衰按"月建五行 vs 爻五行"生克简表（测试版：旺/相/休/囚/死 简化，后续可精修）；伏神取本宫卦同爻位六亲。

- [ ] **Step 3: 跑测试全绿 + Commit**

---
### Task 6: IndexedDB 封装（三表）

**Files:**
- Create: `src/db/index.js`、`src/db/guashiRepo.js`、`src/db/tagsRepo.js`、`src/db/settingsRepo.js`
- Test: `src/db/guashiRepo.test.js`（jsdom + fake-indexeddb）

**Interfaces:**
- Produces:
```js
// index.js: openDB() → Promise<IDBDatabase>，库名 liuyao_workbench，版本1
//   stores: guashi(keyPath id), tags(keyPath id), settings(keyPath key)
// guashiRepo:
export async function addGuashi(g); export async function updateGuashi(g);
export async function getGuashi(id); export async function listGuashi({status, tag, keyword, deleted});
export async function softDelete(id, days);   // 置 deleted=true + delAt=Date.now()
export async function restoreGuashi(id);
export async function purgeGuashi(id);        // 彻底删
export async function purgeExpired();         // 删除超期(delAt+days<now)
// tagsRepo: listTags() addTag({name,color}) 
// settingsRepo: getSetting(key) setSetting(key,value)
```

- [ ] **Step 1: 安装 fake-indexeddb 并写测试**

`npm install -D fake-indexeddb`；测试覆盖 add/list/softDelete/restore/purgeExpired（保留 1 天、delAt 传 2 天前 → 被清）。

- [ ] **Step 2: 实现 db 三模块**（原生 IndexedDB 封装，Promisify；softDelete 从 settings 读 recycleDays）

- [ ] **Step 3: 跑测试全绿 + Commit**

---
### Task 7: md 导出模块 exportMd.js

**Files:**
- Create: `src/md/exportMd.js`
- Test: `src/md/exportMd.test.js`

**Interfaces:**
- Produces: `export function guashiToMd(g) → string`（三层格式）

- [ ] **Step 1: 写 failing test（验证输出格式）**

```js
test('导出格式', () => { const md = guashiToMd({title:'占测出行',date:'2026-08-04',tags:['出行'],status:'未反馈',
  jixiong:'吉',jixiongOk:'',yingqiOk:'',fangweiOk:'',method:'qian',params:'211111|2026-08-04 14:30',
  duanyu:'出行顺利',yingqi:'明日',beizhu:'',fankui:''});
  expect(md).toContain('---\ntitle: 占测出行'); expect(md).toContain('起卦参数: 钱币卦|211111|2026-08-04 14:30');
  expect(md).toContain('## 断语'); expect(md).toContain('## 反馈'); });
```

- [ ] **Step 2: 实现 exportMd.js**（front matter 字段：title/date/tags/status/吉凶/吉凶对错/应期对错/方位对错/起卦参数；正文：盘面表格(从 paipan 渲染：卦名/六亲/世应/六神/五行)、断语/应期/备注/反馈 各节；方法名映射表 methodName）

- [ ] **Step 3: 跑测试 + Commit**

---
### Task 8: md 导入模块 importMd.js

**Files:**
- Create: `src/md/importMd.js`
- Test: `src/md/importMd.test.js`

**Interfaces:**
- Produces: `export function mdToGuashi(mdText) → {ok:true, guashi} | {ok:false, error:'缺少起卦参数'}`

- [ ] **Step 1: 写 failing tests**

```js
test('完整导入', () => { const md = guashiToMd({...完整对象...});
  const r = mdToGuashi(md); expect(r.ok).toBe(true); expect(r.guashi.title).toBe('占测出行'); });
test('缺起卦参数拒绝', () => { const r = mdToGuashi('---\ntitle: x\ndate: 2026-08-04\n---\n\n# x');
  expect(r.ok).toBe(false); });
test('正文缺节容错', () => { const md = '---\ntitle: a\ndate: 2026-08-04\ntags: [占病]\nstatus: 未反馈\n吉凶: \n吉凶对错: \n应期对错: \n方位对错: \n起卦参数: 数字卦|123|2026-08-04\n---\n\n# a\n\n## 断语\n测试'; 
  const r = mdToGuashi(md); expect(r.ok).toBe(true); expect(r.guashi.duanyu).toBe('测试'); });
```

- [ ] **Step 2: 实现 importMd.js**（yaml 头解析用轻量手写解析器（仅需键值+tags 数组），不引入依赖；起卦参数格式 `方法名|输入值|时间`，解析后存 params；正文按 `## 节名` 提取到对应字段）

- [ ] **Step 3: 跑测试 + Commit**

---
### Task 9: 排盘页 UI

**Files:**
- Create: `src/pages/PaipanPage.jsx`、`src/components/QiguaSelector.jsx`、`src/components/PanView.jsx`、`src/components/DuanInput.jsx`、`src/components/TagEditor.jsx`

**Interfaces:**
- Consumes: `qigua.js` 的 `QIGUA_METHODS` + 9 个 qigua 函数；`paipan.js` 的 `paipan` + `WUXING_COLOR`；`guashiRepo`；`exportMd`
- Produces: PaipanPage 完整可用：选择起卦方式 → 输入参数/交互 → 排盘显示 → 填写占断 → 保存；点击卦名跳 `/help/guaci`，点击爻位跳 `/help/yaoci?line=N`

- [ ] **Step 1: QiguaSelector**：9 种方式 Tab/下拉 + 各自输入区（钱币：交互摇/直接输入六爻 Spinner；爻名：6 个 Spinner（少阳/少阴/老阳/老阴）；数字：3 数字 + 算法单选；报数：2-8 位数字；时间：日期选择；分秒：时分秒输入；时刻：日期；电脑/卦名：按钮/选择）

- [ ] **Step 2: PanView**：暗色盘面组件——月日行（年建/月建/日建/旬空）、本卦|变卦名行、6 爻行（六神/六亲+旺衰/爻画/世应/箭头/变卦六亲），地支按五行配色；每爻 onClick 传爻位给爻辞页

- [ ] **Step 3: DuanInput**：断语/应期/备注/反馈文本框 + 吉凶勾选(吉/凶) + 已反馈/未反馈勾选（默认未反馈）→ 勾已反馈展开 吉凶对错(必填)/应期对错/方位对错 三组勾选（对/错/留空）

- [ ] **Step 4: TagEditor**：预置 tag 多选 + 自定义新增（写 tags 表）

- [ ] **Step 5: 页面组装**：起卦→排盘→填占断→「保存卦例」（写库+跳卦例库提示）「导出 md」（下载文件）；排盘历史（最近 20 条可回看）；「重新起卦」清空

- [ ] **Step 6: 浏览器人工验证**：npm run dev，逐种起卦方式试排，检查盘面显示与配色

- [ ] **Step 7: Commit**

---
### Task 10: 卦例库页 + 回收站

**Files:**
- Create: `src/pages/GuashiLibPage.jsx`、`src/pages/RecyclePage.jsx`、`src/components/GuashiCard.jsx`、`src/utils/exportBatch.js`

**Interfaces:**
- Consumes: guashiRepo（list/softDelete/restore/purge/purgeExpired）
- Produces: 卦例库页：筛选栏（tag 多选 / 已反馈·未反馈 / 搜索框）+ 卡片列表 + 批量选择；操作：打开编辑（复用排盘页只读+可改）、单条/批量导出 md（zip 打包或逐个下载）、删除→回收站、导入 md（文件选择器 → mdToGuashi → addGuashi）

- [ ] **Step 1: 卦例库列表 + 筛选 + 搜索**（卡片：标题/日期/tag 徽章/吉凶色标/对错标记）

- [ ] **Step 2: 编辑与导出**（打开卦例：恢复盘面+占断区可改；导出单条=下载 .md；批量=zip（用 JSZip）或逐条下载，测试版先逐条下载）

- [ ] **Step 3: 导入**（input type=file 多选，解析后入库，失败清单提示）

- [ ] **Step 4: 回收站**（RecyclePage：列表+剩余天数，恢复/彻底删除/清空；启动时调 purgeExpired）

- [ ] **Step 5: 浏览器验证 + Commit**

---
### Task 11: 统计页 + 错题本

**Files:**
- Create: `src/pages/StatsPage.jsx`
- Test: `src/pages/stats.test.js`（纯函数统计逻辑）

**Interfaces:**
- Produces: `export function computeStats(guashiList) → {total, fed, unfed, jxOk, jxBad, jxRate, yqOk, yqBad, yqRate, fwOk, fwBad, fwRate}`（仅统计 status='已反馈'；对应字段 '对'/'错' 计数；rate=ok/(ok+bad)）

- [ ] **Step 1: 写 computeStats 纯函数 + 测试**（构造已反馈/未反馈混合数据断言各计数）

- [ ] **Step 2: StatsPage**：总览卡（总数/已反馈/未反馈）、三组正确率卡（吉凶/应期/方位，含进度条）、按 tag 筛选统计（选择 tag 后重算）、错题本列表（勾选"错"维度筛选，点开看盘面+断语+反馈）

- [ ] **Step 3: 浏览器验证 + Commit**

---
### Task 12: 辅助页 ×5（测试版简单版）

**Files:**
- Create: `src/pages/help/GuaciPage.jsx`、`src/pages/help/NayinPage.jsx`、`src/pages/help/ShiErChangShengPage.jsx`、`src/pages/help/ShengKeChongHePage.jsx`、`src/pages/help/QuXiangPage.jsx`、`src/data/helpData.js`

**Interfaces:**
- Produces: `/help/guaci`（卦名→卦象+卦辞；爻位→爻辞，数据先内置 64 卦卦辞+384 爻辞原文，解析内容空占位"解析整理中…"）；`/help/nayin`（六十甲子纳音表，五行配色）；`/help/changsheng`（十二长生表，五行配色）；`/help/chonghe`（六冲六合/刑冲克害关系表+简单 SVG 连线图）；`/help/quxiang`（爻位/地支/六亲六兽取象表，先内置常见条目，后续扩充）

- [ ] **Step 1: helpData.js 数据**（卦辞爻辞原文：网上公开《周易》全文数据，整理成 JSON；纳音 60 组；长生 12 组；冲合关系表）

- [ ] **Step 2: 五个页面渲染**（统一暗色表格风格；纳音/长生文字按五行配色；chonghe 用 SVG 画十二地支圆环连线）

- [ ] **Step 3: 联调跳转**（排盘页点卦名/爻位 → 对应页带参）

- [ ] **Step 4: 浏览器验证 + Commit**

---
### Task 13: 设置页

**Files:**
- Create: `src/pages/SettingsPage.jsx`

**Interfaces:**
- Consumes: settingsRepo、guashiRepo（全量导出/导入）
- Produces: 回收站保留天数（默认 30，数字输入）；数据备份：导出全部卦例为 JSON（下载）、导入 JSON 恢复（覆盖确认）；清空回收站按钮

- [ ] **Step 1: 实现设置项读写 + 备份导出/导入**
- [ ] **Step 2: 浏览器验证 + Commit**

---
### Task 14: 响应式精调 + 测试版验收

**Files:**
- Modify: `src/App.jsx`、`src/pages/PaipanPage.jsx`、`src/components/*`

**Interfaces:**
- Produces: ≥768px 桌面三栏（起卦|盘面|占断）；<768px 手机版顶部 Tab + 纵向滚动

- [ ] **Step 1: Tailwind 断点改造**（sm: 断点 + 盘面横向滚动容器；导航栏桌面左侧/手机顶部）

- [ ] **Step 2: F12 手机模拟验证**（375px 视窗走通 起卦→排盘→占断→保存 全流程）

- [ ] **Step 3: 全流程回归**：9 种起卦、导出 md、手动改 md 再导入、统计正确率、回收站

- [ ] **Step 4: 写测试版说明 README.md**（启动方法、功能清单、已知限制）

- [ ] **Step 5: Commit + 汇报交付**

---
## Self-Review 记录

- 设计文档 12 节全部有对应任务（排盘/占断/库/回收站/md/统计/辅助页/设置/响应式 ✓）
- 无占位符任务；所有接口签名在各任务 Interfaces 中定义一致（qigua 函数、paipan、repo、md 模块命名前后统一）
- 未知风险：干支算法需与线上日历核对（Task 3 Step 4 已列）；64 卦表提取依赖 b4.java 解析（Task 2 已列验证）
