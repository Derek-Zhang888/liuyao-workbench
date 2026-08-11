/**
 * md 导出模块（六爻工作台 - Task 7）
 *
 * guashiToMd(guashi) → 三层格式 markdown 文本：
 *   1. front matter（YAML，字段顺序固定），顶部为 FM_GUIDE 指导注释块
 *      （填写模板 / 填错无法导入的提醒 / 盘面 1=阳爻 2=阴爻释义，均为 `#` 注释，不影响解析）：
 *      title/date/tags/status/吉凶/吉凶对错/应期对错/方位对错/起卦参数
 *   2. 标题：# 卦题
 *   3. 正文：## 盘面 / ## 断语 / ## 应期 / ## 备注 / ## 反馈
 *
 * 起卦参数格式：`方法名|输入值|时间`（如 `钱币卦|211111|2026-08-04 14:30`）
 *   - 方法名：QIGUA_METHODS id → 中文名，未知 id 显示原 id
 *   - 输入值：
 *       params 为字符串 → 直接透传（`输入|时间` 两段）
 *       params 为对象 → 按方法序列化（可逆，导入端按同规则解析）：
 *         qian/computer → 主值 lines，动爻索引以逗号追加（`222211,2,5`；无动爻仅 6 位爻画，兼容旧格式）
 *         yaoming → lines；guaname → 本卦名（input / lines），有变卦时记作 `本卦>变卦`
 *         baoshu → digits
 *         number → n1,n2,n3（method=2 时追加 ,m2 标记）
 *         fenmiao → ms,ss
 *         time → 时间字符串（Date 或 ISO 字符串）
 *   - 时间：字符串 params 自带（| 后段）；对象取 params.date/time；
 *     均缺失时回退 guashi.date
 *
 * 纯函数，无 DOM 依赖。
 */
import { QIGUA_METHODS } from '../engine/qigua.js';
import { doodleToDataUri } from '../engine/doodleSvg.js';
import {
  markerBadgesFor,
  markerBadgesForBian,
  markerBadgesForFushen,
  wangshuaiAt,
} from '../engine/panMarkers.js';

/** 六亲单字 → 全称（表格可读性） */
const LIUQIN_FULL = { 父: '父母', 兄: '兄弟', 官: '官鬼', 财: '妻财', 孙: '子孙' };

/** 解析 '父戌土' → {liuqin, zhi, wuxing}（与 PanView/paipan 内部解析规则一致） */
function parseLiqin(s) {
  const m = /^([父兄官财孙])([子丑寅卯辰巳午未申酉戌亥])([木火土金水])$/.exec(s ?? '');
  return m ? { liuqin: m[1], zhi: m[2], wuxing: m[3] } : null;
}

/** 显示宽度：中文字符（含全角标点、●、（）等）按 2 个半角宽，ASCII/数字按 1 */
function dispWidth(s) {
  return [...String(s ?? '')].reduce((w, ch) => w + (ch.codePointAt(0) > 0xff ? 2 : 1), 0);
}

/** 单元格右侧补半角空格至显示宽度 width；内容超宽不截断（正常数据不会超） */
function padCell(s, width) {
  const str = String(s ?? '');
  const pad = width - dispWidth(str);
  return pad > 0 ? str + ' '.repeat(pad) : str;
}

/** 组装等宽表格行：`| 内容 | 内容 | ... |`（每列按 widths 显示宽度对齐） */
function renderRow(cells, widths) {
  return `| ${cells.map((c, i) => padCell(c, widths[i])).join(' | ')} |`;
}

/** 分隔线：`|` + `-`×(列宽+2) + `|`（每个单元格区域 `-` 数与数据行「| 内容 空格」等宽） */
function renderSep(widths) {
  return `|${widths.map((w) => '-'.repeat(w + 2)).join('|')}|`;
}

/** QIGUA_METHODS id → 中文名 */
const METHOD_NAME = Object.fromEntries(QIGUA_METHODS.map((m) => [m.id, m.name]));

/** 钱币卦/电脑卦 params → 输入值：6 位爻画 + 动爻索引（逗号分隔，如 '222211,2,5'）；
 *  无动爻（dong 空/缺失）仅 6 位爻画，与旧格式向后兼容。
 *  与数字卦 `n1,n2,n3[,m2]` 可区分：qian/computer 首段为 6 位 1/2 爻画，数字卦为数值 */
function linesWithDong(p) {
  const lines = p.lines ?? '';
  if (!lines) return '';
  const dong = Array.isArray(p.dong) && p.dong.length > 0 ? `,${p.dong.join(',')}` : '';
  return lines + dong;
}

/** 各方法 params 对象 → 输入值字符串（与导入端 Task 8 约定一致） */
const PARAMS_SERIALIZER = {
  qian: (p) => linesWithDong(p),
  yaoming: (p) => p.lines ?? '',
  guaname: (p) => {
    const ben = p.input ?? p.lines ?? '';
    return p.bian ? `${ben}>${p.bian}` : ben; // 有变卦时记作 `本卦>变卦`
  },
  baoshu: (p) => p.digits ?? '',
  number: (p) => {
    const s = [p.n1 ?? '', p.n2 ?? '', p.n3 ?? ''].join(',');
    return p.method === 2 ? `${s},m2` : s;
  },
  time: (p) => timeToStr(p.date ?? p.time),
  computer: (p) => linesWithDong(p),
};

/** 时间 → 'YYYY-MM-DD HH:mm'（Date）或原样透传（字符串） */
function timeToStr(v) {
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    const p = (n) => String(n).padStart(2, '0');
    return `${v.getFullYear()}-${p(v.getMonth() + 1)}-${p(v.getDate())} ${p(v.getHours())}:${p(v.getMinutes())}`;
  }
  if (typeof v === 'string' && v) return v;
  return '';
}

/** 时间戳 → 'YYYY-MM-DD HH:mm'；非法/缺失返回 ''（v0.10 改进建7 #3 创建/最后编辑） */
function fmtTs(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** YAML 1.1 布尔/空值关键字（大小写不敏感），裸输出会被解析成布尔/None */
const YAML_KEYWORDS = new Set(['null', 'true', 'false', 'yes', 'no', 'on', 'off', '~']);

/**
 * YAML 标量安全输出：空/缺失 → ""（保证导入可解析）；
 * 以下情况强制双引号包裹并转义：
 *   - 含 #（空格+# 后内容会被 YAML 当注释丢弃）
 *   - 含反斜杠/双引号（双引号串内须转义）
 *   - 恰为 YAML 1.1 关键字（null/true/false/yes/no/on/off/~）
 *   - 含冒号等特殊字符、行首为特殊符号
 * 其余原样输出（与简报示例一致，如 `title: 占测今日出行`）。
 */
function yamlScalar(v) {
  if (v === null || v === undefined) return '""';
  const s = String(v);
  if (s === '') return '""';
  if (
    /^[一-龥A-Za-z0-9,.+()\-/·%\s]+$/.test(s) && // # 不在安全集
    !/^[\s\-*&[\]{}|>]/.test(s) &&
    !YAML_KEYWORDS.has(s.toLowerCase()) // 关键字强制加引号
  ) {
    return s;
  }
  return `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`; // 先转义反斜杠再转义双引号
}

/**
 * front matter 顶部指导块（全部为 YAML `#` 注释行，YAML 解析器与导入端
 * importMd.parseFmLines（正则 `^([^:\s]+):`，`# ` 开头行不匹配）均会跳过）。
 * 覆盖三点：① 各字段填写模板 ② 填错会导致无法导入的提醒 ③ 盘面 1/2 爻画释义（人与 AI 均可读）。
 * 约束：任何一行都不得整行为三连字符，否则会提前截断 front matter。
 */
const FM_GUIDE = [
  '# ===== 六爻工作台 · 卦例文件 =====',
  '# 下面 # 开头的行是 YAML 注释，仅为填写说明，导入时会被忽略，可保留也可删除。',
  '#',
  '# 一、填写模板（照示例改内容；冒号用半角 ":"，冒号后留一个空格）',
  '#   title: 占测今日出行          【必填】卦题，一句话说明所占何事',
  '#   date: 2026-08-04 14:30      起卦日期时间，YYYY-MM-DD 或 YYYY-MM-DD HH:mm',
  '#   tags: [出行, 等反馈]         标签数组，半角逗号+空格分隔；无标签写 []',
  '#   status: 未反馈              未反馈 / 已反馈',
  '#   吉凶: 吉                    吉 / 凶 / 平；未定写 ""',
  '#   吉凶对错: 对                 回访应验后填 对 / 错；未定写 ""',
  '#   应期对错: 对                 同上',
  '#   方位对错: 对                 同上',
  '#   起卦参数: 钱币卦|211111,0,2|2026-08-04 14:30',
  '#     【必填】三段式「方法名|输入值|时间」，用半角竖线 | 分隔，缺段留空但竖线要保留。',
  '#     方法名取：钱币卦 电脑卦 爻名卦 卦名卦 报数卦 数字卦 时间卦',
  '#     输入值：钱币卦/电脑卦/爻名卦为 6 位爻画，其后可跟动爻位（0=初爻 … 5=上爻）；',
  '#            卦名卦填卦名（如 天风姤）；报数卦填数字串；数字卦填 n1,n2,n3；',
  '#            时间卦填时间。',
  '#',
  '# 二、格式提醒：title 与 起卦参数 缺失或写错（误用中文冒号「：」、中文竖线「｜」，',
  '#   方法名不在上表，竖线段数不对等）会导致本文件【无法导入】，导入时报错并跳过。',
  '#   值中若含 # : " 等符号，请用半角双引号整体包住，例：title: "出行 #注意"。',
  '#',
  '# 三、盘面读法（给人，也给其他 AI）：爻画 1 = 阳爻（实线 —），2 = 阴爻（断线 - -）；',
  '#   爻画后的 ● 表示该爻为动爻，动爻按 1↔2 翻转后即得变卦。',
  '#   起卦参数中的 6 位数字同为爻画，自左至右依次是初爻、二爻、三爻、四爻、五爻、上爻；',
  '#   下方盘面表格第 1 行为上爻，最后 1 行为初爻。',
  '#   变卦列展示本卦各爻动变后的六亲/地支/五行/爻画，无变卦（无动爻）的卦该列为空。',
  '#   世应列：「世」为求测人自己，「应」为对方或所测之事。',
  '#   本卦标记列展示本卦爻标记（旺衰、月破/月合/日破/日合、化进/退、反伏吟），无标记留空；',
  '#   表尾标记列展示变卦标记（变爻旺衰、回头生克冲合、变爻破合）与伏神标记，无标记留空。',
].join('\n');

/** 起卦参数 YAML 安全：空串或以 | 开头（块标量指示符）时输出 "" */
function safeQiguaParam(s) {
  return s === '' || s.startsWith('|') ? '""' : s;
}

/** tags 数组 → `[tag1, tag2]`（逗号+空格） */
function yamlTags(tags) {
  const arr = Array.isArray(tags) ? tags : [];
  return `[${arr.map(yamlScalar).join(', ')}]`;
}

/** 组装起卦参数：`方法名|输入值|时间` */
function buildQiguaParam(g) {
  const name = METHOD_NAME[g.method] ?? String(g.method ?? '');
  const p = g.params;
  let input = '';
  let time = '';
  if (typeof p === 'string') {
    const [i, t] = p.split('|');
    input = i ?? '';
    time = t ?? '';
  } else if (p && typeof p === 'object') {
    input = (PARAMS_SERIALIZER[g.method] ?? (() => ''))(p);
    time = timeToStr(p.date ?? p.time);
  }
  if (!time) time = g.date ?? '';
  return `${name}|${input}|${time}`;
}

/** 神煞项 → md 文本：统一「名(值)」格式（日干系/日支系/月支系均单基准） */
function renderShenshaItem(s) {
  return `${s.name}(${s.zhi ?? s.gan ?? ''})`;
}

/** 爻位名（初爻→上爻），与盘面 PanView 一致 */
const LINE_NAMES = ['初爻', '二爻', '三爻', '四爻', '五爻', '上爻'];

/**
 * 地支分析（功能一）→ md 小节文本；da 为空（旧快照未计算）返回 ''。
 * 与 PanView 折叠区同口径的 8 小节：本变/月建/日辰/动爻/三合/入墓/真空/用神；
 * 条目统一「爻位 文本」（三合等无爻位的条目直接输出文本）；全空输出提示文案。
 */
function renderDizhiAnalysis(da) {
  if (!da) return '';
  const sections = [
    ['本变', da.benBian],
    ['月建', da.yueJian],
    ['日辰', da.riChen],
    ['动爻', da.dongYao],
    ['三合', da.sanHe],
    ['入墓', da.ruMu],
    ['真空', da.zhenKong],
    ['用神', da.yongShenJi],
  ];
  const lines = [];
  for (const [label, items] of sections) {
    if (!items || items.length === 0) continue;
    const parts = items.map((e) => {
      const pre = e.yaoIndex != null ? LINE_NAMES[e.yaoIndex] : '';
      const text = e.text ?? '真空'; // zhenKong 条目仅 {yaoIndex}
      return pre ? `${pre} ${text}` : text;
    });
    lines.push(`**${label}**：${parts.join('、')}`);
  }
  if (lines.length === 0) return '本卦无特殊地支关系（可选用神查看元神/忌神判定）。';
  return lines.join('\n');
}

/** panSnapshot（paipan 输出）→ 人类可读盘面文本；rec 为卦例记录（可选，用于创建/最后编辑时间） */
function renderPan(pan, rec) {
  if (!pan || !pan.ben) return '（无盘面数据）';
  const ben = pan.ben;
  const bian = pan.bian;
  // 创建/最后编辑（v0.10 改进建7 #3）：从卦例记录 createdAt/updatedAt 取（旧快照/旧记录缺失省略）
  const created = fmtTs(rec?.createdAt) || (rec?.date ?? '');
  const updated = fmtTs(rec?.updatedAt);
  // 真太阳时校准标注（新快照含 trueSolarInfo，旧快照无此字段时保持原样）
  const ts = pan.trueSolarInfo;
  const tsNote = ts
    ? `  真太阳时：${ts.trueSolarTime} ${ts.trueSolarShichen}${ts.cityName ? `（${ts.cityName}）` : ''}${
        ts.refDayGZ !== pan.dayGZ ? `；若按真太阳时 23:00 换日，日建则为 ${ts.refDayGZ}` : ''
      }`
    : '';
  const head = [
    `本卦：${ben.name}（${ben.gong}宫）`,
    bian ? `变卦：${bian.name}（${bian.gong}宫）` : '变卦：（无变卦）',
    // v0.10 建议4 #9：补太岁干支 + 月建天干；删除原「旺衰」列
    `太岁：${pan.yearGZ ?? ''}  月建：${pan.monthGZ ?? ''}  日建：${pan.dayGZ ?? ''}  时建：${pan.hourGZ ?? ''}  旬空：${(pan.xunkong ?? []).join('')}${tsNote}`,
    // v0.10 改进建7 #3：创建/最后编辑（与卦例库卡片口径一致；均缺失时省略）
    created || updated ? `创建：${created}　最后编辑：${updated}` : '',
    // 卦级神煞行：跟随年月日干支（旧快照无 shenshaList 时省略此行）
    (pan.shenshaList ?? []).length
      ? `神煞：${pan.shenshaList.map(renderShenshaItem).join(' ')}`
      : '',
    // 自定用神（功能二）：旧快照无 yongShen 时省略此行
    pan.yongShen
      ? `用神：${pan.yongShen.type === 'zhi' ? '地支' : '六亲'} ${pan.yongShen.value}`
      : '',
    // 卦身/香闺/床帐（v0.2 功能 C）：卦身精确推演优先，旧快照回退旧值；无结果省略。
    // v0.10 香闺/床帐为数组（只显示地支，全匹配），旧快照对象形态向后兼容
    (() => {
      const gs = pan.guashenPrecise ?? pan.guashen ?? '';
      const parts = [
        gs ? `卦身：${gs}` : '',
        bedroomText('香闺', pan.xianggui),
        bedroomText('床帐', pan.chuangzhang),
      ].filter((l) => l !== '');
      return parts.join('   ');
    })(),
  ]
    .filter((l) => l !== '')
    .join('\n');
  // 天干列（功能三，v0.10 改进建7 #5）：nagan 开启（快照 yao 带 gan）时本卦加天干列，
  // 变卦同步加变卦天干列（按变卦上下经卦纳甲，旧快照 bian 无 gan 时留空兼容）。
  // v0.10 改进建8 #5：新增「本卦标记」列（世应后）与表尾「标记」列——列顺序固定为
  //   六神|爻位|六亲|[天干]|地支|五行|爻画|世应|本卦标记|变卦六亲|变卦地支|变卦五行|变卦爻画|标记
  // 本卦标记 = 本卦爻标记（旺衰 + 月破/日破/月合/日合/进退/反伏吟）；
  // 表尾标记 = 变卦标记（变爻旺衰 + 回头生克冲合 + 变爻破合）+ 伏神标记。
  // 两列恒存在（无 markers 时留空），列数稳定：无纳干 13 列 / 纳干 15 列。
  const hasGan = (pan.yao ?? []).some((y) => y.gan != null);
  const markers = pan.markers ?? null;
  const yao = pan.yao ?? [];
  const liushen = pan.liushen ?? [];

  const headerCells = hasGan
    ? ['六神', '爻位', '六亲', '天干', '地支', '五行', '爻画', '世应', '本卦标记', '变卦六亲', '变卦天干', '变卦地支', '变卦五行', '变卦爻画', '标记']
    : ['六神', '爻位', '六亲', '地支', '五行', '爻画', '世应', '本卦标记', '变卦六亲', '变卦地支', '变卦五行', '变卦爻画', '标记'];

/** 香闺/床帐 → md 文本（v0.10 改进建7 #4 新结构数组 [{zhi}] 只显示地支、空格分隔；
 * 旧快照对象 {zhi,wuxing} 兼容；空/缺省省略） */
function bedroomText(name, v) {
  if (!v) return '';
  if (Array.isArray(v)) {
    if (v.length === 0) return '';
    return `${name}：${v.map((x) => x.zhi ?? '').join(' ')}`;
  }
  return `${name}：${v.zhi ?? ''}${v.wuxing ?? ''}`;
}

/** 单爻「本卦标记」列文本（v0.10 改进建8 #5）：本卦旺衰 + 本卦角标（月破/日破/月合/日合/进退/反伏吟），
 *  标记间空格隔开。无 markers 返回 ''（留空）。月破/日破/月合/日合写全（字形即 '月破'/'日破'/'月合'/'日合'）。 */
const benMarkerCell = (i) => {
  if (!markers) return '';
  const glyphs = [];
  const ws = wangshuaiAt(markers, i, 'ben');
  if (ws && ws.ws) glyphs.push(ws.ws);
  glyphs.push(...markerBadgesFor(markers, i).map((b) => b.g));
  return glyphs.join(' ');
};

/** 单爻表尾「标记」列文本（v0.10 改进建8 #5）：变爻旺衰 + 变爻角标（回头生克冲合、变爻月破/日破/月合/日合），
 *  标记间空格隔开。无 markers 返回 ''。回头箭头与 UI 一致指向左。 */
const bianMarkerCell = (i) => {
  if (!markers) return '';
  const glyphs = [];
  const bws = wangshuaiAt(markers, i, 'bian');
  if (bws && bws.ws) glyphs.push(bws.ws);
  glyphs.push(...markerBadgesForBian(markers, i).map((b) => b.g));
  return glyphs.join(' ');
};

/** 伏神行「标记」列文本（v0.10）：伏神旺衰 + 伏神角标 */
const fushenMarkerCell = (i) => {
  if (!markers) return '';
  const glyphs = [];
  const fws = wangshuaiAt(markers, i, 'fushen');
  if (fws && fws.ws) glyphs.push(fws.ws);
  glyphs.push(...markerBadgesForFushen(markers, i).map((b) => b.g));
  return glyphs.join(' ');
};

  // 数据行（第 1 行 = 上爻，最后 1 行 = 初爻；bian.liuqin 为上→初，5-i 取同爻位；
  // 变卦爻画 bian.lines[i] 为纯数字 1/2，不带动爻 ● 标记；
  // 旧快照 bian 可能无 lines 字段（仅 liuqin），此时变卦爻画列留空，不崩溃）
  const rows = [];
  for (let i = yao.length - 1; i >= 0; i--) {
    const y = yao[i];
    const b = bian ? parseLiqin(bian.liuqin[5 - i]) : null;
    const shi = y.shi ? '世' : y.ying ? '应' : '';
    const line = `${y.line ?? ''}${y.dong ? '●' : ''}`;
    const liuqin = LIUQIN_FULL[y.liuqin] ?? y.liuqin ?? '';
    const row = [liushen[i] ?? '', LINE_NAMES[i], liuqin];
    if (hasGan) row.push(y.gan ?? '');
    row.push(
      y.zhi ?? '',
      y.wuxing ?? '',
      line,
      shi,
      benMarkerCell(i), // 本卦标记列（v0.10 改进建8 #5）
      b ? LIUQIN_FULL[b.liuqin] ?? b.liuqin : '',
    );
    if (hasGan) row.push(b ? bian?.gan?.[i] ?? '' : ''); // 变卦天干列（v0.10 改进建7 #5）
    row.push(b ? b.zhi : '', b ? b.wuxing : '', bian?.lines?.[i] ?? '');
    row.push(bianMarkerCell(i)); // 表尾标记列：变卦标记（v0.10 改进建8 #5）
    rows.push(row);
    if (y.fushen) {
      // 伏神行：六神列「伏神」、爻位列留空，六亲/地支/五行列填伏神值（六亲用全称），
      // 天干/爻画/世应/本卦标记/变卦列留空；紧跟在所属爻行之后
      const fu = LIUQIN_FULL[y.fushen.liuqin] ?? y.fushen.liuqin ?? '';
      const fuRow = ['伏神', ''];
      fuRow.push(fu);
      if (hasGan) fuRow.push(''); // 天干
      fuRow.push(y.fushen.zhi ?? '', y.fushen.wuxing ?? ''); // 地支 五行
      fuRow.push('', ''); // 爻画 世应
      fuRow.push(''); // 本卦标记（伏神行留空）
      fuRow.push(''); // 变卦六亲
      if (hasGan) fuRow.push(''); // 变卦天干
      fuRow.push('', '', ''); // 变卦地支 变卦五行 变卦爻画
      fuRow.push(fushenMarkerCell(i)); // 表尾标记列：伏神旺衰 + 伏神破合（v0.10）
      rows.push(fuRow);
    }
  }

  // 列宽 = max(表头显示宽, 该列所有单元格显示宽) + 2（两侧留白）
  const widths = headerCells.map((h, ci) =>
    Math.max(dispWidth(h), ...rows.map((r) => dispWidth(r[ci] ?? ''))) + 2,
  );
  const header = renderRow(headerCells, widths);
  const sep = renderSep(widths);
  return [head, header, sep, ...rows.map((r) => renderRow(r, widths))].join('\n');
}

/** 正文节：`## 标题\n\n内容`（内容空时留空行） */
function section(title, content) {
  return `## ${title}\n\n${content}`;
}

/**
 * 涂鸦节（v0.2 功能 A；v1.2.0 节名参数化）：
 *   `![节名](data:image/svg+xml;utf8,...)` 图片行 + ```json 元数据块（可逆还原源）
 * 空/缺省返回 ''（旧卦例无涂鸦时跳过该节）。
 * @param {string} title 节名（'涂鸦（电脑）' / '涂鸦（手机）'）
 */
function renderDoodle(title, doodle) {
  if (!doodle || !Array.isArray(doodle.elements) || doodle.elements.length === 0) return '';
  const dataUri = doodleToDataUri(doodle);
  const json = JSON.stringify(doodle);
  return `![${title}](${dataUri})\n\n\`\`\`json\n${json}\n\`\`\``;
}

/**
 * 卦例对象 → 三层格式 md 文本
 * @param {object} g guashi 记录（字段见 src/db/guashiRepo.js 头注释）
 * @returns {string}
 */
export function guashiToMd(g) {
  const rec = g ?? {};
  const fm = [
    ['title', yamlScalar(rec.title ?? '')],
    ['date', yamlScalar(rec.date ?? '')],
    ['tags', yamlTags(rec.tags)],
    ['status', yamlScalar(rec.status ?? '')],
    ['吉凶', yamlScalar(rec.jixiong ?? '')],
    ['吉凶对错', yamlScalar(rec.jixiongOk ?? '')],
    ['应期对错', yamlScalar(rec.yingqiOk ?? '')],
    ['方位对错', yamlScalar(rec.fangweiOk ?? '')],
    ['起卦参数', safeQiguaParam(buildQiguaParam(rec))],
  ]
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n');

  // 地支分析（功能一）：dizhiAnalysis 非空时在盘面后追加独立小节；旧快照无此字段则省略
  const dizhi = renderDizhiAnalysis(rec.panSnapshot?.dizhiAnalysis ?? null);
  // 涂鸦节（v0.2 功能 A；v1.2.0 拆两节：电脑/手机各一套独立涂鸦）
  const doodlePcText = renderDoodle('涂鸦（电脑）', rec.doodle);
  const doodleMobileText = renderDoodle('涂鸦（手机）', rec.doodleMobile);
  // 背景节（v0.2 功能 D）：background 非空时在断语前
  const background = rec.background ?? '';
  // 节顺序（v0.2，涂鸦移最后 2026-08-09）：盘面→地支分析→背景→断语→应期→反馈→备注→涂鸦（电脑）→涂鸦（手机）；
  // 涂鸦数据放文件最后（占断内容之后）；importMd 按节名识别位置无关，导入恢复不受影响
  const body = [
    section('盘面', renderPan(rec.panSnapshot, rec)),
    ...(dizhi ? [section('地支分析', dizhi)] : []),
    ...(background ? [section('背景', background)] : []),
    section('断语', rec.duanyu ?? ''),
    section('应期', rec.yingqi ?? ''),
    // v0.10 建议4 #6：反馈/备注 位置互换
    section('反馈', rec.fankui ?? ''),
    section('备注', rec.beizhu ?? ''),
    ...(doodlePcText ? [section('涂鸦（电脑）', doodlePcText)] : []),
    ...(doodleMobileText ? [section('涂鸦（手机）', doodleMobileText)] : []),
  ].join('\n\n');

  return `---\n${FM_GUIDE}\n${fm}\n---\n\n# ${rec.title ?? ''}\n\n${body}\n`;
}
