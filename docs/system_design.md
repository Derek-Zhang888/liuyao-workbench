# 六爻工作台 v0.2 增量技术设计（A 画板 / B 标记 / C 香闺床帐 / D 占断 / E md 双向）

> 架构师：高见远 ｜ 基于 v0.1.0（290 tests / 17 files 全绿）｜ 约束：纯前端零新增依赖、最小侵入、旧快照/旧 md 双向兼容

## 1. 总体方案

### A. 盘面画板（涂鸦）
- **核心决策：涂鸦为 PaipanPage 独立 state，绝不挂 pan**（`useEffect([yongShen])` 会重排盘 setPan，挂 pan 必被冲掉）。
- 新组件 `DoodleBoard.jsx`：内部为绝对定位 `<svg>` 覆盖层（`preserveAspectRatio="none"`，viewBox=容器实测尺寸，坐标与容器像素 1:1），pointer 事件捕获绘制，产出**矢量 JSON**（6 种元素）。工具栏为 QQ 截图风：画笔/文字/矩形/圆形/画线/箭头 + 外框填充切换 + 8 色预设 + `<input type="color">` 调色板 + 粗细滑块 1–30 + 撤销(弹最后元素)/清空。
- 开关放 PanView 内「爻行列表之后、地支分析之前」；开启时覆盖**卦名行+爻行**（不遮地支分析），覆盖层 `onClick stopPropagation` 拦截爻位跳转。
- 取消勾选且涂鸦非空 → 复用 ConfirmDialog 确认后清除。
- 持久化三处：`record.doodle`（保存）、sessionStorage（跨页/刷新）、`handleLoadHistory` 回填 `rec.doodle`。
- 纯函数 `doodleSvg.js`：doodle JSON → SVG markup → `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`，导出用；导入端从 md 解析回 JSON。

### B. 盘面标记（11 开关，默认全关）
- **核心决策：标记进 pan 快照（`pan.markers`），paipan 新增 `markers` 选项烘焙**，镜像 dizhiAnalysis 先例。
  理由：① exportMd 保持纯 record 输入（API 不变 → 290 tests 零破坏）；② 单一计算源（引擎算一次，UI/导出同读），无双实现漂移；③ 旧快照无 `pan.markers` → UI/导出跳过，天然兼容；④ 符合 PRD「旧快照无对应字段时跳过」措辞。
- 即时展示：开关只在 SettingsPage（独立路由）改动；返回 PaipanPage 时挂载恢复会按 method/params **重排盘**（现有逻辑已读 nagan，扩展为读全部 marker 设置）→ 新盘自带新 markers。无需设置变更事件。
- `panMarkers.js` 纯函数：直读 `yao.wangshuai`（旺相休囚死）；复用 dizhiAnalysis 的 `yueJianLabels/riChenLabels`（月破/日破/月合/日合，日破按引擎休囚细分口径）；回头生/克直读 `benBianLabel` 语义；**新增** 回头冲（`CHONG[bianZhi]===benZhi`）、回头合（`HE[bianZhi]===benZhi`）、反吟（本变同爻位地支相冲）/伏吟（相同）、日月建六亲（`liuqinByWuxing(GONG_WUXING[gong], WUXING_ZHI[月建/日建支])`）。
- PanView 渲染：旺相休囚死=地支右上角小字（五行配色）；其余=爻行内紧凑角标，与现有 nagan/世应角标并排不重叠。

### C. 香闺/床帐
- **卦身升级精确推演**：`computeGuashen({shi, shiLine})`：阳世（line=1）从子、阴世（line=2）从午，`ZHI_CYCLE[(startIdx + shi) % 12]`（初爻=0…上爻=5，从初爻数至世爻）。替换 `GONG_GUASHEN` 查表（旧值不再使用，仅旧快照保留展示）。
- 香闺=卦身五行**所克**五行对应爻（`KE[gwx]`），床帐=卦身五行**所生**五行对应爻（`SHENG[gwx]`）；扫 yao 初→上取**首个**匹配爻，无匹配省略。烘焙进快照：`pan.xianggui / pan.chuangzhang`（`{zhi,wuxing}|null`）。显示：卦身右侧 `香闺：寅木　床帐：子水`。

### D. 占断页
- record 新增 `background`（`withDefaults` 透传零迁移）；DuanInput 顶部加「背景」textarea（rows=2），顺序：卦题→背景→断语→…。
- 「备注」UI 标签改「笔记」，**字段名保留 `beizhu`**。

### E. md 导出/导入
- 节顺序：盘面→**涂鸦**→地支分析→**背景**→断语→应期→反馈→**备注（名字不变，理由见 7.2）**。
- 盘面节新增：**标记列**（等宽表格末尾追加「标记」列，紧凑符号如 `旺` `破` `合` `↳生` `进` `伏`）；香闺/床帐并入盘面 head 行。
- 涂鸦节格式：`![涂鸦](data:image/svg+xml;utf8,...)` 图片行 + 末尾 ```json 元数据块（可逆还原源）。
- importMd：SECTIONS 增 `涂鸦/背景/笔记`；`笔记` 别名映射 `beizhu`；`背景`→`background`；`涂鸦` 节 flush 时正则提取 ```json 块 → `guashi.doodle`（解析失败跳过）。
- 兼容：旧 md 无新节照常导入；新 md 被旧版导入时新节未知 → 旧版并入 buffer 丢弃（不崩，仅丢新字段）。**备注节名保持 `## 备注` 不改成 `## 笔记`**，否则旧版导入新版 md 会丢旧字段 beizhu，违反「仅丢新字段」承诺。

### F. 多端打包
- 全部 React + 原生 SVG + `<input type="color">`，零第三方依赖、无 Node/原生桥接；SVG data URI 为纯字符串编码，Tauri WebView2 / 安卓 / 苹果 WebKit 行为一致。

## 2. 文件清单（新增 4 / 修改 11）

| 文件 | 类型 | 改动要点 |
|---|---|---|
| `src/engine/panMarkers.js` | 新增 ~130 行 | MARKER_KEYS 11 键常量 + 角标字形常量 + `computePanMarkers({yao,bian,monthGZ,dayGZ,gongWx,markers})→pan.markers` |
| `src/engine/doodleSvg.js` | 新增 ~90 行 | `emptyDoodle()`/`isEmptyDoodle()`/`doodleToSvg(doodle)`/`doodleToDataUri(doodle)`（纯函数） |
| `src/components/DoodleBoard.jsx` | 新增 ~320 行 | 工具栏 + SVG 覆盖层 + 6 工具绘制 + 撤销/清空；props 见 §3.2 |
| `src/engine/dizhiAnalysis.js` | 修改 ~4 行 | 导出 `CHONG`/`HE`（加 export 关键字，非破坏） |
| `src/engine/paipan.js` | 修改 ~50 行 | 新增 `markers` 选项烘焙 `pan.markers`；`computeGuashen` 精确卦身替换 GONG_GUASHEN；`guashenBedroom` 计算 `pan.xianggui/chuangzhang`；导出 `liuqinByWuxing` |
| `src/components/PanView.jsx` | 修改 ~110 行 | 新增可选 props（doodle 开关/覆盖层容器）；`pan.markers` 角标 + 旺相小字 + 日月建六亲；卦身旁香闺/床帐；GuashiLibPage 只传 pan 时全部缺省不渲染 |
| `src/pages/PaipanPage.jsx` | 修改 ~70 行 | doodle/doodleEnabled state + sessionStorage + 保存/回填/重置；取消勾选 ConfirmDialog；readMarkers 并入排盘；EMPTY_DUAN.background + 回填/恢复 |
| `src/pages/SettingsPage.jsx` | 修改 ~90 行 | 「盘面选项」卡片 11 个 checkbox（nagan 同款模式） |
| `src/components/DuanInput.jsx` | 修改 ~30 行 | 顶部「背景」textarea；「备注」标签→「笔记」 |
| `src/md/exportMd.js` | 修改 ~100 行 | 涂鸦节/背景节；盘面「标记」列 + 香闺床帐 head 行 |
| `src/md/importMd.js` | 修改 ~55 行 | SECTIONS+涂鸦/背景/笔记；SECTION_KEY 别名；涂鸦 JSON 块解析 |
| `src/engine/panMarkers.test.js` | 新增 ~120 行 | 11 开关各判定 + 组合 + 空快照兼容 |
| `src/engine/doodleSvg.test.js` | 新增 ~80 行 | 6 元素→SVG→dataURI→JSON 还原 roundtrip |
| `src/components/DoodleBoard.test.jsx` | 新增 ~100 行 | 工具切换/绘制回调/撤销/清空 |
| `src/md/exportMd.test.js` | 修改 +~80 行 | 涂鸦/背景/笔记/标记列/香闺床帐断言 |
| `src/md/importMd.test.js` | 修改 +~70 行 | 新节解析 + 旧 md 兼容 + 新 md 旧版不崩 |
| `src/pages/PaipanPage.test.jsx` | 新增 ~100 行 | 全链路冒烟：起卦→画板→保存→导出→导入→还原 |

## 3. 数据模型与接口

### 3.1 涂鸦 JSON schema（record.doodle，6 元素）
```json
{ "version": 1, "width": 600, "height": 400,
  "elements": [
    { "type":"pen",    "color":"#e74c3c", "width":4, "points":[[x,y],...] },
    { "type":"text",   "x":120, "y":90, "text":"测", "size":20, "color":"#e74c3c" },
    { "type":"rect",   "x":10, "y":10, "w":80, "h":50, "color":"#e74c3c", "strokeWidth":3, "fill":false },
    { "type":"circle", "cx":60, "cy":60, "r":30, "color":"#e74c3c", "strokeWidth":3, "fill":false },
    { "type":"line",   "x1":0, "y1":0, "x2":100, "y2":100, "color":"#e74c3c", "strokeWidth":3 },
    { "type":"arrow",  "x1":0, "y1":0, "x2":100, "y2":100, "color":"#e74c3c", "strokeWidth":3 }
  ] }
```
空涂鸦=`{version:1,width,height,elements:[]}`；无涂鸦=null/缺省。

### 3.2 DoodleBoard 接口（与 PaipanPage 接线）
```js
<DoodleBoard enabled={doodleEnabled} doodle={doodle} onChange={setDoodle} />
// PanView 新增可选 props（缺省安全）：
//   doodle / doodleEnabled / onDoodleChange / onDoodleToggle
// PaipanPage：const [doodle,setDoodle]=useState(null); const [doodleEnabled,setDoodleEnabled]=useState(false)
```

### 3.3 盘面标记数据流（关键决策：进快照）
`SettingsPage 11 开关 → setSetting('marker-*', bool) → PaipanPage 排盘/恢复时 readMarkers() → paipan({markers}) → pan.markers（烘焙） → PanView 渲染角标 / exportMd 读 pan.markers 渲染「标记」列`。旧快照无 pan.markers → 两处均跳过。pan.markers 结构：
```js
{ wangshuai:[{i,ws}], yuePo:[i], riPo:[i], yueHe:[i], riHe:[i],
  huitouSheng:[i], huitouKe:[i], huitouChong:[i], huitouHe:[i],
  jinTui:[{i,label:'进'|'退'}], fanYin:[{i,label:'伏'|'反'}],
  riyueLiqin:{ yue:{zhi,wuxing,liuqin}, ri:{zhi,wuxing,liuqin} } | null }
```
全关时 `pan.markers` 省略（同 nagan 模式）。

### 3.4 香闺/床帐与卦身
```js
// src/engine/paipan.js
export function computeGuashen({ shi, shiLine })          // 阳世从子(0)/阴世从午(6)，ZHI_CYCLE[(s+shi)%12]
export function guashenBedroom(guashenZhi, yao)           // → { xianggui:{zhi,wuxing}|null, chuangzhang:{...}|null }
// paipan 输出追加：pan.guashen(新算法字符串)、pan.xianggui、pan.chuangzhang
```

### 3.5 importMd 接口
```js
SECTIONS = ['盘面','涂鸦','背景','断语','应期','备注','笔记','反馈']
SECTION_KEY = { 断语:'duanyu', 应期:'yingqi', 备注:'beizhu', 笔记:'beizhu', 反馈:'fankui', 背景:'background' }
// 涂鸦：current==='涂鸦' 时收集行，flush 时 /```json\s*([\s\S]*?)```/ 提取 → guashi.doodle（失败置 null）
// mdToGuashi 返回 guashi 增加 background、doodle 字段
```

## 4. 任务列表（≤5，按依赖序）

| ID | 任务 | 文件 | 依赖 | 验收标准 |
|---|---|---|---|---|
| T01 | 共享引擎层（纯函数基础设施） | panMarkers.js(新)、doodleSvg.js(新)、paipan.js(改)、dizhiAnalysis.js(改)、panMarkers.test.js(新)、doodleSvg.test.js(新) | — | paipan 支持 markers 选项产出 pan.markers；卦身精确推演+香闺床帐；doodle→SVG→dataURI 可逆；290 tests 全绿 |
| T02 | 画板组件+盘面接线（A） | DoodleBoard.jsx(新)、PanView.jsx(改)、PaipanPage.jsx(改)、DoodleBoard.test.jsx(新) | T01 | 6 工具+30 档粗细+颜色/调色板+撤销/清空；取消弹窗确认；开启拦截爻位点击；跨页保留；保存落 record.doodle 可回填 |
| T03 | 盘面标记+香闺床帐 UI（B+C） | SettingsPage.jsx(改)、PanView.jsx(改)、PaipanPage.jsx(改) | T01 | 11 开关默认关、IndexedDB 持久化；重排盘即时角标；旺相小字；日月建六亲；香闺/床帐显示；旧快照跳过 |
| T04 | 占断增强+md 双向（D+E） | DuanInput.jsx(改)、PaipanPage.jsx(改)、exportMd.js(改)、importMd.js(改)、exportMd.test.js(扩展)、importMd.test.js(扩展) | T01 | 背景框/笔记改名；md 含涂鸦/背景/标记列/香闺床帐；导入还原；旧 md 不崩；新旧双向兼容 |
| T05 | 集成与兼容回归 | PaipanPage.test.jsx(新)、exportMd.test.js(扩展)、importMd.test.js(扩展) | T02、T03、T04 | 全链路 起卦→画板→标记→保存→导出→导入→还原；新 md 被旧版导入不崩仅丢新字段；全量测试绿+三端冒烟清单 |

- **可并行**：T02/T03/T04 均仅依赖 T01 可并行；三者对 PaipanPage.jsx 的改动区域不重叠（doodle state / readMarkers / duan 字段），多人并行时按区域隔离提交；单人顺序执行最稳。

## 5. 依赖包
**零新增**。沿用现有 react@18.3.1 / react-dom / react-router-dom；测试沿用 vitest + testing-library + jsdom + fake-indexeddb。

## 6. 共享知识
- 设置键：`marker-wangshuai`、`marker-yuepo`、`marker-ripo`、`marker-yuehe`、`marker-rihe`、`marker-huitou-sheng`、`marker-huitou-ke`、`marker-huitou-chong`、`marker-huitou-he`、`marker-jintui-fanfuyin`、`marker-riyue-liuqin`。
- 角标字形：旺/相/休/囚/死（五行配色：旺=--wuxing-huo、相=橙、休=灰、囚=--wuxing-shui、死=黑）；月破「破」、日破「破·暗」区分按引擎口径；月合/日合「合」；回头「↳生/↳克/↳冲/↳合」；化进退「进/退」；反伏吟「伏/反」；日月建六亲=六亲单字。
- 涂鸦 canvas：容器实测尺寸存 doodle.width/height，SVG `preserveAspectRatio="none"` 使坐标与容器像素 1:1；data URI 用 `encodeURIComponent`（# 自动转 %23）。
- 测试纪律：vitest `--maxWorkers=1`；Windows 清 dist 用 PowerShell。
- 全部新 API 向后兼容：旧快照/旧 md/仅传 pan 的调用方均不崩。

## 7. 待明确事项（已尽量收敛）
1. **卦身口径**：按 PRD「阳世从子/阴世从午，从初爻数至世爻」字面实现（乾为天→巳）。与旧简化表（乾→戌）不一致属预期升级；若单测发现与传统「乾卦身戌」不符，需主理人复核口径后再调（实现已抽纯函数，改动一点）。
2. **备注 md 节名**：设计定 `## 备注` 不变（仅 UI 改名「笔记」），以保证旧版导入新版 md 不丢旧字段 beizhu；如需 md 也显示「笔记」请拍板（将引入旧版丢 beizhu 的兼容缺口）。
3. 香闺/床帐多爻命中取首个（PRD 示例为单值）；如需展示全部命中爻，改动局限于 guashenBedroom 返回数组。
4. 画板文字字号=当前粗细档位（P2 再扩展字体/字号选择）。
