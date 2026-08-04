/**
 * md 导出模块（六爻工作台 - Task 7）
 *
 * guashiToMd(guashi) → 三层格式 markdown 文本：
 *   1. front matter（YAML，字段顺序固定）：
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
 *         yaoming/guaname → 主值（lines / input）
 *         baoshu → digits
 *         number → n1,n2,n3（method=2 时追加 ,m2 标记）
 *         fenmiao → ms,ss
 *         time/shike → 时间字符串（Date 或 ISO 字符串）
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
  guaname: (p) => p.input ?? p.lines ?? '',
  baoshu: (p) => p.digits ?? '',
  number: (p) => {
    const s = [p.n1 ?? '', p.n2 ?? '', p.n3 ?? ''].join(',');
    return p.method === 2 ? `${s},m2` : s;
  },
  fenmiao: (p) => [p.ms ?? '', p.ss ?? ''].join(','),
  time: (p) => timeToStr(p.date ?? p.time),
  shike: (p) => timeToStr(p.date ?? p.time),
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
    `月建：${pan.yuejian ?? ''}  日建：${pan.dayGZ ?? ''}  旬空：${(pan.xunkong ?? []).join('')}`,
  ].join('\n');
  const header = '| 六神 | 六亲 | 地支 | 五行 | 世应 | 爻画 | 旺衰 |';
  const sep = '|------|------|------|------|------|------|------|';
  const rows = (pan.yao ?? []).map((y, i) => {
    const shi = y.shi ? '世' : y.ying ? '应' : '';
    const line = `${y.line ?? ''}${y.dong ? '●' : ''}`;
    const liuqin = LIUQIN_FULL[y.liuqin] ?? y.liuqin ?? '';
    return `| ${(pan.liushen ?? [])[i] ?? ''} | ${liuqin} | ${y.zhi ?? ''} | ${y.wuxing ?? ''} | ${shi} | ${line} | ${y.wangshuai ?? ''} |`;
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
    section('备注', rec.beizhu ?? ''),
    section('反馈', rec.fankui ?? ''),
  ].join('\n\n');

  return `---\n${fm}\n---\n\n# ${rec.title ?? ''}\n\n${body}\n`;
}
