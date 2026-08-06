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

/** 六亲单字 → 全称（表格可读性） */
const LIUQIN_FULL = { 父: '父母', 兄: '兄弟', 官: '官鬼', 财: '妻财', 孙: '子孙' };

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
  '#   下方盘面表格第 1 行为初爻，最后 1 行为上爻。',
  '#   世应列：「世」为求测人自己，「应」为对方或所测之事。',
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

/** panSnapshot（paipan 输出）→ 人类可读盘面文本 */
function renderPan(pan) {
  if (!pan || !pan.ben) return '（无盘面数据）';
  const ben = pan.ben;
  const bian = pan.bian;
  const head = [
    `本卦：${ben.name}（${ben.gong}宫）`,
    bian ? `变卦：${bian.name}（${bian.gong}宫）` : '变卦：（无变卦）',
    // v0.10 建议4 #9：补太岁干支 + 月建天干；删除原「旺衰」列
    `太岁：${pan.yearGZ ?? ''}  月建：${pan.monthGZ ?? ''}  日建：${pan.dayGZ ?? ''}  时建：${pan.hourGZ ?? ''}  旬空：${(pan.xunkong ?? []).join('')}`,
  ].join('\n');
  const header = '| 六神 | 六亲 | 地支 | 五行 | 爻画 | 世应 |';
  const sep = '|------|------|------|------|------|------|';
  const rows = (pan.yao ?? []).map((y, i) => {
    const shi = y.shi ? '世' : y.ying ? '应' : '';
    const line = `${y.line ?? ''}${y.dong ? '●' : ''}`;
    const liuqin = LIUQIN_FULL[y.liuqin] ?? y.liuqin ?? '';
    // 列序：五行后是爻画，再到世应（v0.10 建议4 #9）
    return `| ${(pan.liushen ?? [])[i] ?? ''} | ${liuqin} | ${y.zhi ?? ''} | ${y.wuxing ?? ''} | ${line} | ${shi} |`;
  });
  return [head, header, sep, ...rows].join('\n');
}

/** 正文节：`## 标题\n\n内容`（内容空时留空行） */
function section(title, content) {
  return `## ${title}\n\n${content}`;
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

  const body = [
    section('盘面', renderPan(rec.panSnapshot)),
    section('断语', rec.duanyu ?? ''),
    section('应期', rec.yingqi ?? ''),
    // v0.10 建议4 #6：反馈/备注 位置互换
    section('反馈', rec.fankui ?? ''),
    section('备注', rec.beizhu ?? ''),
  ].join('\n\n');

  return `---\n${FM_GUIDE}\n${fm}\n---\n\n# ${rec.title ?? ''}\n\n${body}\n`;
}
