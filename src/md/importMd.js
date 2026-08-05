/**
 * md 导入模块（六爻工作台 - Task 8）
 *
 * mdToGuashi(mdText) → {ok:true, guashi} | {ok:false, error}
 * 与 exportMd.js 的 guashiToMd 严格对称（可逆解析），轻量手写解析，不引入 YAML 库：
 *
 *   1. front matter 逐行 `key: value` 解析（`---` 包裹，字段顺序无关）：
 *      - 双引号包裹值 → 去引号 + 反转义（\\ → \，\" → "）
 *      - tags 数组 `[a, b]` → 逗号+空格拆分（引号感知，支持含逗号/特殊字符的 tag）
 *      - 未知字段忽略（容错）；缺省值：date=''、status='未反馈'、吉凶/对错=''
 *      - 必填校验：title 缺失/为空 → 缺少标题；起卦参数 缺失/为空/"" → 缺少起卦参数
 *   2. 起卦参数 `方法名|输入值|时间`：
 *      - 方法名：中文名 → QIGUA_METHODS id 反向映射；未知方法名 → ok:false
 *        （为与导出端「未知 id 原样输出」对称，已知 id 直接写入也接受）
 *      - 输入值按方法还原 params（与 exportMd 的 PARAMS_SERIALIZER 严格对称）：
 *          qian/computer → {lines}（6 位爻画后可带逗号分隔的动爻索引 → 追加 dong，
 *            如 `222211,2,5` → {lines:'222211', dong:[2,5]}；无动爻仅爻画，兼容旧格式）
 *          yaoming → {lines}
 *          guaname → `本卦[>变卦]`：6 位 1/2 爻画 → {lines}，否则 {input}；有变卦段追加 {bian}
 *          baoshu → {digits}；fenmiao → {ms, ss}（空段省略）
 *          number → {n1, n2, n3}（末尾 ,m2 → method:2；空段省略）
 *          time → {date: 输入值}
 *      - 时间段 → guashi.date：时间段含时刻（非空且不止日期，如带 HH:mm）时
 *        优先采用，保住起卦时刻（字符串 params 形态的 `钱币卦|211111|2026-08-04 14:30`
 *        导入后 date 为 2026-08-04 14:30）；否则用 front matter date；再缺为空串。
 *        确定性回退，不取当前日期。
 *   3. 正文按 `## 节名` 提取 断语/应期/备注/反馈（trim 首尾、保留内部换行）；
 *      盘面节内容丢弃：panSnapshot 留 null，导入后由排盘重新生成
 *
 * 纯函数，无 DOM 依赖。
 */
import { QIGUA_METHODS } from '../engine/qigua.js';

/** 方法中文名 → id（exportMd METHOD_NAME 的反向映射） */
const METHOD_ID = Object.fromEntries(QIGUA_METHODS.map((m) => [m.name, m.id]));
const METHOD_IDS = new Set(QIGUA_METHODS.map((m) => m.id));

/** 正文节名（盘面节解析但不落字段） */
const SECTIONS = ['盘面', '断语', '应期', '备注', '反馈'];
const SECTION_KEY = { 断语: 'duanyu', 应期: 'yingqi', 备注: 'beizhu', 反馈: 'fankui' };

/**
 * YAML 标量反序列化：双引号包裹则去引号并反转义（\\ → \，\" → "）；
 * 其余原样返回（不解析注释/单引号，保持轻量）。
 */
function unquote(s) {
  if (s.length >= 2 && s.startsWith('"') && s.endsWith('"')) {
    const inner = s.slice(1, -1);
    let out = '';
    for (let i = 0; i < inner.length; i++) {
      if (inner[i] === '\\' && i + 1 < inner.length && (inner[i + 1] === '\\' || inner[i + 1] === '"')) {
        out += inner[i + 1];
        i++;
      } else {
        out += inner[i];
      }
    }
    return out;
  }
  return s;
}

/**
 * tags 数组反序列化：`[a, b]` → ['a', 'b']。
 * 分隔规则与导出端 join(', ') 对称：
 *   逗号后跟空白 → 分隔符；逗号后直接跟字符 → 视为 tag 内容（导出端对含逗号 tag 不引号包裹）。
 * 引号包裹的元素内部不拆分（引号感知，如 ["a#, b", c]）。
 */
function parseTags(raw) {
  if (raw === '' || raw === '""') return [];
  if (!raw.startsWith('[')) return [unquote(raw)]; // 标量容错（手写 md 未用数组）
  const content = (raw.endsWith(']') ? raw.slice(1, -1) : raw.slice(1)).trim();
  if (content === '') return [];
  return tokenizeTags(content).map((t) => unquote(t.trim()));
}

function tokenizeTags(s) {
  const out = [];
  let cur = '';
  let inQuote = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQuote) {
      if (c === '\\' && (s[i + 1] === '"' || s[i + 1] === '\\')) {
        cur += c + s[i + 1]; // 保留转义序列，交由 unquote 还原
        i++;
        continue;
      }
      if (c === '"') inQuote = false;
      cur += c;
      continue;
    }
    if (c === '"') {
      inQuote = true;
      cur += c;
      continue;
    }
    if (c === ',') {
      const next = s[i + 1];
      if (next === undefined || /\s/.test(next)) {
        out.push(cur);
        cur = '';
        continue;
      }
      cur += c;
      continue;
    }
    cur += c;
  }
  out.push(cur);
  return out;
}

/** 提取 front matter 字段；返回 { fields, body }（body 为正文剩余部分） */
function splitFrontMatter(md) {
  const lines = md.split('\n');
  if ((lines[0] ?? '').trim() !== '---') return { fields: {}, body: md };
  let end = lines.length;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') {
      end = i;
      break;
    }
  }
  return { fields: parseFmLines(lines.slice(1, end)), body: lines.slice(end + 1).join('\n') };
}

/** 逐行 `key: value` 解析（第一个冒号分隔；未知字段忽略） */
function parseFmLines(lines) {
  const f = {};
  for (const line of lines) {
    const m = /^([^:\s]+):\s*(.*)$/.exec(line);
    if (!m) continue;
    const key = m[1];
    const raw = m[2].trim();
    switch (key) {
      case 'title': f.title = unquote(raw); break;
      case 'date': f.date = unquote(raw); break;
      case 'tags': f.tags = parseTags(raw); break;
      case 'status': f.status = unquote(raw); break;
      case '吉凶': f.jixiong = unquote(raw); break;
      case '吉凶对错': f.jixiongOk = unquote(raw); break;
      case '应期对错': f.yingqiOk = unquote(raw); break;
      case '方位对错': f.fangweiOk = unquote(raw); break;
      case '起卦参数': f.qiguaParam = unquote(raw); break;
      default: break;
    }
  }
  return f;
}

/** 输入值 → params 对象（与 exportMd PARAMS_SERIALIZER 对称；空段省略） */
function parseInput(method, input) {
  const csv = (s) => s.split(',').map((x) => x.trim());
  /** 数值兜底：空段/NaN（非数字段）一律视作缺失，不落 params */
  const num = (v) => {
    if (v == null || v === '') return undefined;
    const n = Number(v);
    return Number.isNaN(n) ? undefined : n;
  };
  switch (method) {
    case 'qian':
    case 'computer': {
      // 格式：6 位爻画[,动爻索引...]（如 '222211,2,5'）；无动爻仅爻画（兼容旧格式，不落 dong）
      // 动爻段空/非 0-5 整数一律丢弃（与 num 兜底风格一致，避免污染 paipan 校验）
      const [lines, ...rest] = input.split(',');
      const dong = rest
        .map(num)
        .filter((v) => v !== undefined && Number.isInteger(v) && v >= 0 && v <= 5);
      const p = { lines };
      if (dong.length > 0) p.dong = dong;
      return p;
    }
    case 'yaoming':
      return { lines: input };
    case 'guaname': {
      // 格式：本卦[>变卦]（变卦段为空时省略，与旧格式向后兼容）
      const [ben, bian] = input.split('>');
      const p = /^[12]{6}$/.test(ben) ? { lines: ben } : { input: ben };
      if (bian) p.bian = bian;
      return p;
    }
    case 'baoshu':
      return { digits: input };
    case 'number': {
      const parts = csv(input);
      const m2 = parts[parts.length - 1] === 'm2';
      const nums = m2 ? parts.slice(0, -1) : parts;
      const p = {};
      for (let i = 0; i < 3; i++) {
        const v = num(nums[i]);
        if (v !== undefined) p[`n${i + 1}`] = v;
      }
      if (m2) p.method = 2;
      return p;
    }
    case 'time':
      return input ? { date: input } : {};
    default:
      return {};
  }
}

/** 起卦参数 `方法名|输入值|时间` → {ok, method, params, time}；未知方法名 → ok:false */
function parseQiguaParam(s) {
  if (!s) return { ok: false, error: '缺少起卦参数' };
  const [name, input = '', ...rest] = s.split('|');
  const time = rest.join('|');
  const method = METHOD_ID[name] ?? (METHOD_IDS.has(name) ? name : undefined);
  if (!method) return { ok: false, error: `未知起卦方式：${name}` };
  return { ok: true, method, params: parseInput(method, input), time };
}

/** 正文 `## 节名` 提取；未知节名/`##` 行视为正文内容；盘面节丢弃 */
function parseBody(body) {
  const out = { duanyu: '', yingqi: '', beizhu: '', fankui: '' };
  let current = null; // 当前节 key（null = 正文前区）
  let buf = [];
  const flush = () => {
    if (current && SECTION_KEY[current]) out[SECTION_KEY[current]] = buf.join('\n').trim();
    buf = [];
  };
  for (const line of body.split('\n')) {
    const m = /^##\s+(\S+)/.exec(line);
    if (m && SECTIONS.includes(m[1])) {
      flush();
      current = m[1];
      continue;
    }
    buf.push(line);
  }
  flush();
  return out;
}

/** 时间段是否含时刻（非空且不止日期）：含 ':'（如 HH:mm / ISO 时间部分）视为精确时刻 */
function hasTimePart(s) {
  return typeof s === 'string' && s !== '' && s.includes(':');
}

/**
 * md 文本 → 卦例对象
 * @param {string} mdText guashiToMd 导出的三层格式文本
 * @returns {{ok:true, guashi:object} | {ok:false, error:string}}
 */
export function mdToGuashi(mdText) {
  if (typeof mdText !== 'string') return { ok: false, error: '输入必须为字符串' };
  const md = mdText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const { fields, body } = splitFrontMatter(md);

  const title = fields.title ?? '';
  if (!title.trim()) return { ok: false, error: '缺少标题' };

  const qp = parseQiguaParam(fields.qiguaParam ?? '');
  if (!qp.ok) return qp;

  // date 解析：起卦参数时间段含时刻（如 2026-08-04 14:30）时优先采用，保住起卦时刻
  // （字符串 params 形态下时间段即 params 自带时间，front matter date 只有日期粒度）；
  // 时间段为纯日期/空时回退 front matter date；再缺为空串。确定性，不取当前日期。
  const date = hasTimePart(qp.time)
    ? qp.time
    : fields.date && fields.date !== ''
      ? fields.date
      : qp.time;

  const bodyFields = parseBody(body);
  return {
    ok: true,
    guashi: {
      title,
      date,
      tags: fields.tags ?? [],
      status: fields.status && fields.status !== '' ? fields.status : '未反馈',
      jixiong: fields.jixiong ?? '',
      jixiongOk: fields.jixiongOk ?? '',
      yingqiOk: fields.yingqiOk ?? '',
      fangweiOk: fields.fangweiOk ?? '',
      method: qp.method,
      params: qp.params,
      duanyu: bodyFields.duanyu,
      yingqi: bodyFields.yingqi,
      beizhu: bodyFields.beizhu,
      fankui: bodyFields.fankui,
      panSnapshot: null, // 盘面文本不存，由 UI 层按 method/params 重新排盘生成
    },
  };
}
