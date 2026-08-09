/**
 * 地支分析（六爻工作台 - 排盘引擎之五）
 *
 * 纯函数模块，无 DOM / 无外部状态。由 paipan 在需要时调用（传入 yongShen 或 dizhi 开关），
 * 产出 pan.dizhiAnalysis。各子项均为可读文本数组，便于盘面折叠区直接展示与单测。
 *
 * 分析能力：
 *   A. 本变五行（每个动爻）：化进神 / 化退神 / 化比和 / 化回头生 / 化回头克 / 化他
 *   B. 月建与爻：临月建 / 月破 / 月六合 / 月墓
 *   C. 日辰与爻：临日建 / 暗动 / 日破 / 动而愈动 / 动而冲散 / 日六合 / 日三合X局 / 日墓
 *   D. 动爻分析：被X爻生 / 被X爻克
 *   E. 卦内三合局：地支全 / 缺支待填实
 *   F. 入墓：月墓 / 日墓 / 动爻墓（被X爻墓） / 化墓（墓库落旬空附加「空墓」）
 *   G. 真空：旬空 + 死地
 *   H. 卦形：六合卦 / 六冲卦（复用盘面 ben.liuhe / ben.liuchong）
 *   I. 元神 / 忌神有力判定（依赖用神，未选用神时跳过）
 */
/** 五行相生：木→火→土→金→水→木 */
const SHENG = { 木: '火', 火: '土', 土: '金', 金: '水', 水: '木' };
/** 五行相克：木→土→水→火→金→木 */
const KE = { 木: '土', 土: '水', 水: '火', 火: '金', 金: '木' };

/** 爻位名（初爻→上爻） */
export const LINE_NAMES = ['初爻', '二爻', '三爻', '四爻', '五爻', '上爻'];

/** 五行墓库：水墓辰 / 木墓未 / 火土墓戌 / 金墓丑 */
export const MUKU = { 水: '辰', 木: '未', 火: '戌', 土: '戌', 金: '丑' };

/** 进神：本爻地支 → 变爻地支（同五行顺行一位）。
 *  v0.10 改进建7 #8：补齐土支（丑辰未戌 按 ZHI 序 +3 顺行：丑→辰→未→戌→丑），
 *  修复 天泽履上爻戌土→未土 漏判化退（旧实现仅识别木火金水四组）。 */
export const JINSHEN = {
  寅: '卯', 巳: '午', 申: '酉', 亥: '子',
  丑: '辰', 辰: '未', 未: '戌', 戌: '丑',
};
/** 退神：本爻地支 → 变爻地支（同五行逆行一位）。
 *  v0.10 改进建7 #8：补齐土支（丑辰未戌 按 ZHI 序 -3 逆行：戌→未→辰→丑→戌）。 */
export const TUISHEN = {
  卯: '寅', 午: '巳', 酉: '申', 子: '亥',
  未: '辰', 戌: '未', 丑: '戌', 辰: '丑',
};

/** 地支六冲表（互为键值） */
export const CHONG = {
  子: '午', 午: '子',
  丑: '未', 未: '丑',
  寅: '申', 申: '寅',
  卯: '酉', 酉: '卯',
  辰: '戌', 戌: '辰',
  巳: '亥', 亥: '巳',
};
/** 地支六合表（互为键值） */
export const HE = {
  子: '丑', 丑: '子',
  寅: '亥', 亥: '寅',
  卯: '戌', 戌: '卯',
  辰: '酉', 酉: '辰',
  巳: '申', 申: '巳',
  午: '未', 未: '午',
};

/** 三合局：局名 → 三支 */
const SANHE_GROUPS = [
  { name: '水', members: ['申', '子', '辰'] },
  { name: '木', members: ['亥', '卯', '未'] },
  { name: '火', members: ['寅', '午', '戌'] },
  { name: '金', members: ['巳', '酉', '丑'] },
];
/** 地支 → 所属三合局（日辰三合用） */
const SANHE_OF_ZHI = {};
for (const g of SANHE_GROUPS) {
  for (const z of g.members) SANHE_OF_ZHI[z] = g;
}

/** 旺相（旺/相）与否 */
const isWangXiang = (ws) => ws === '旺' || ws === '相';
/** 休囚（休/囚/死）与否 */
const isXiuQiu = (ws) => ws === '休' || ws === '囚' || ws === '死';

/** 解析 '父戌土' -> {liuqin, zhi, wuxing}（与 paipan 内解析规则一致；非法返回 null） */
function parseLiqin(s) {
  const m = /^([父兄官财孙])([子丑寅卯辰巳午未申酉戌亥])([木火土金水])$/.exec(s ?? '');
  return m ? { liuqin: m[1], zhi: m[2], wuxing: m[3] } : null;
}

/**
 * A. 本变五行单条标签
 * @param {string} benZhi 本爻地支
 * @param {string} benWx 本爻五行
 * @param {string} bianZhi 变爻地支
 * @param {string} bianWx 变爻五行
 * @returns {string} 如「化进神（寅→卯）」「化回头克（寅木克丑土）」
 */
export function benBianLabel(benZhi, benWx, bianZhi, bianWx) {
  if (bianWx === benWx) {
    if (JINSHEN[benZhi] === bianZhi) return `化进神（${benZhi}→${bianZhi}）`;
    if (TUISHEN[benZhi] === bianZhi) return `化退神（${benZhi}→${bianZhi}）`;
    return `化比和（${benZhi}→${bianZhi}）`;
  }
  if (SHENG[bianWx] === benWx) return `化回头生（${bianZhi}${bianWx}生${benZhi}${benWx}）`;
  if (KE[bianWx] === benWx) return `化回头克（${bianZhi}${bianWx}克${benZhi}${benWx}）`;
  return `化他（${bianZhi}${bianWx}）`;
}

/**
 * B. 月建与爻：单爻标签数组（同支/六冲/六合/墓库 各自独立判定，可并存）
 */
export function yueJianLabels(zhi, wuxing, yueZhi) {
  const out = [];
  if (zhi === yueZhi) out.push('临月建');
  if (CHONG[zhi] === yueZhi) out.push('月破');
  if (HE[zhi] === yueZhi) out.push('月六合');
  if (MUKU[wuxing] === yueZhi) out.push('月墓');
  return out;
}

/**
 * C. 日辰与爻：单爻标签数组
 * 六冲细分：静爻旺相=暗动 / 静爻休囚=日破 / 动爻旺相=动而愈动 / 动爻休囚=动而冲散
 */
export function riChenLabels(zhi, wuxing, dong, wangshuai, riZhi) {
  const out = [];
  if (zhi === riZhi) out.push('临日建');
  if (CHONG[zhi] === riZhi) {
    if (dong) out.push(isWangXiang(wangshuai) ? '动而愈动' : '动而冲散');
    else out.push(isWangXiang(wangshuai) ? '暗动' : '日破');
  }
  if (HE[zhi] === riZhi) out.push('日六合');
  // 日三合：爻支与日支为同一三合局的（不同）支；爻支即日支属临日建，不重复计
  const g = SANHE_OF_ZHI[zhi];
  if (g && zhi !== riZhi && g.members.includes(riZhi)) out.push(`日三合${g.name}局`);
  if (MUKU[wuxing] === riZhi) out.push('日墓');
  return out;
}

/**
 * E. 卦内三合局检测：四组局逐组统计，3 支齐全或 2 支缺一支时输出标签
 * @param {string[]} zhis 六爻地支（任意顺序）
 * @returns {string[]}
 */
export function sanHeLabels(zhis) {
  const out = [];
  for (const g of SANHE_GROUPS) {
    const present = g.members.filter((m) => zhis.includes(m));
    if (present.length === 3) {
      out.push(`卦内三合${g.name}局（地支全）`);
    } else if (present.length === 2) {
      const missing = g.members.find((m) => !present.includes(m));
      out.push(`卦内三合${g.name}局（缺${missing}，待填实）`);
    }
  }
  return out;
}

/**
 * I. 元神/忌神爻有力判定（参考传统六爻：先查无力诸因，再查有力诸因，否则中和）
 * @param {object} c 被判定之爻 {zhi, wuxing, dong, wangshuai}
 * @param {object} ctx 上下文 {yueZhi, riZhi, kong, dongIdx, bianZhi, bianWx, mu}
 * @returns {'有力'|'无力'|'中和'}
 */
export function assessSpirit(c, ctx) {
  const { yueZhi, riZhi, kong, dongIdx, bianZhi, bianWx, mu } = ctx;
  // —— 无力诸因 ——
  if (CHONG[c.zhi] === yueZhi) return '无力'; // 月破
  const inMu =
    mu === yueZhi ||
    mu === riZhi ||
    dongIdx.some((k) => k !== c.index && yaoZhiAt(ctx, k) === mu) ||
    (c.dong && bianZhi === mu);
  if (inMu) return '无力'; // 入墓
  if (c.dong && bianWx && KE[bianWx] === c.wuxing) return '无力'; // 化回头克
  if (c.dong && bianZhi && TUISHEN[c.zhi] === bianZhi) return '无力'; // 化退神
  if (CHONG[c.zhi] === riZhi && !(c.dong && isWangXiang(c.wangshuai))) return '无力'; // 日破 / 动而冲散
  if (kong.includes(c.zhi) && c.wangshuai === '死') return '无力'; // 真空
  if (kong.includes(c.zhi) && isXiuQiu(c.wangshuai)) return '无力'; // 休囚旬空
  if (!c.dong && isXiuQiu(c.wangshuai)) return '无力'; // 休囚不动
  if (c.wangshuai === '死') return '无力'; // 衰绝
  // —— 有力诸因 ——
  if (c.zhi === yueZhi || c.zhi === riZhi) return '有力'; // 临日月
  if (isWangXiang(c.wangshuai)) return '有力'; // 旺相
  if (c.dong && bianWx && SHENG[bianWx] === c.wuxing) return '有力'; // 化回头生
  if (c.dong && bianZhi && JINSHEN[c.zhi] === bianZhi) return '有力'; // 化进神
  if (c.dong) return '有力'; // 发动
  return '中和';
}

/** 取某爻地支（供入墓检测用；取不到返回 ''） */
function yaoZhiAt(ctx, k) {
  return ctx.yaoZhi?.[k] ?? '';
}

/**
 * 计算完整地支分析
 * @param {object} p
 * @param {Array} p.yao 六爻（初→上），每项 {liuqin, zhi, wuxing, dong, wangshuai}
 * @param {object|null} p.bian 变卦摘要（含 liuqin 上→初 六亲字符串数组；无动爻为 null）
 * @param {string} p.monthGZ 月干支（如'乙未'）
 * @param {string} p.dayGZ 日干支（如'庚戌'）
 * @param {string[]} p.xunkong 旬空地支
 * @param {boolean} p.benLiuhe 本卦是否六合
 * @param {boolean} p.benLiuchong 本卦是否六冲
 * @param {object|null} p.yongShen 用神 {type:'liuqin'|'zhi', value}；null 则跳过 I
 * @returns {object} dizhiAnalysis 结构
 */
export function computeDizhiAnalysis({
  yao = [],
  bian = null,
  monthGZ = '',
  dayGZ = '',
  xunkong = [],
  benLiuhe = false,
  benLiuchong = false,
  yongShen = null,
} = {}) {
  const yueZhi = monthGZ ? monthGZ[1] : '';
  const riZhi = dayGZ ? dayGZ[1] : '';
  const kong = Array.isArray(xunkong) ? xunkong : [];
  const bianLiuqin = bian && Array.isArray(bian.liuqin) ? bian.liuqin : null;

  /** 动爻索引数组（初爻=0） */
  const dongIdx = yao.map((y, i) => (y.dong ? i : -1)).filter((i) => i >= 0);

  /** 变爻信息（无变卦返回 null） */
  const bianOf = (i) => {
    if (!bianLiuqin) return null;
    return parseLiqin(bianLiuqin[5 - i]);
  };

  const benBian = [];
  const yueJian = [];
  const riChen = [];
  const dongYao = [];
  const ruMu = [];
  const zhenKong = [];

  for (let i = 0; i < yao.length; i++) {
    const y = yao[i];
    // A. 本变五行（仅动爻）
    if (y.dong) {
      const b = bianOf(i);
      if (b) benBian.push({ yaoIndex: i, text: benBianLabel(y.zhi, y.wuxing, b.zhi, b.wuxing) });
    }
    // B. 月建与爻
    for (const t of yueJianLabels(y.zhi, y.wuxing, yueZhi)) yueJian.push({ yaoIndex: i, text: t });
    // C. 日辰与爻
    for (const t of riChenLabels(y.zhi, y.wuxing, y.dong, y.wangshuai, riZhi)) riChen.push({ yaoIndex: i, text: t });
    // D. 动爻分析：被其他动爻五行生 / 克
    if (y.dong) {
      for (const j of dongIdx) {
        if (j === i) continue;
        const o = yao[j];
        if (SHENG[o.wuxing] === y.wuxing) dongYao.push({ yaoIndex: i, text: `被${LINE_NAMES[j]}生` });
        if (KE[o.wuxing] === y.wuxing) dongYao.push({ yaoIndex: i, text: `被${LINE_NAMES[j]}克` });
      }
    }
    // F. 入墓（月墓 / 日墓 / 动爻墓=被X爻墓 / 化墓；墓库落旬空附「空墓」）
    const mu = MUKU[y.wuxing];
    if (mu === yueZhi) ruMu.push({ yaoIndex: i, text: kong.includes(mu) ? '月墓（空墓）' : '月墓' });
    if (mu === riZhi) ruMu.push({ yaoIndex: i, text: kong.includes(mu) ? '日墓（空墓）' : '日墓' });
    for (const j of dongIdx) {
      if (j === i) continue;
      if (yao[j].zhi === mu) ruMu.push({ yaoIndex: i, text: kong.includes(mu) ? `被${LINE_NAMES[j]}墓（空墓）` : `被${LINE_NAMES[j]}墓` });
    }
    if (y.dong) {
      const b = bianOf(i);
      if (b && b.zhi === mu) ruMu.push({ yaoIndex: i, text: kong.includes(b.zhi) ? '化墓（空墓）' : '化墓' });
    }
    // G. 真空：旬空 + 死地
    if (kong.includes(y.zhi) && y.wangshuai === '死') zhenKong.push({ yaoIndex: i });
  }

  // E. 卦内三合局
  const sanHe = sanHeLabels(yao.map((y) => y.zhi)).map((text) => ({ text }));

  // H. 卦形（六合 / 六冲 二选一）
  let guaXing = null;
  if (benLiuhe) guaXing = '六合卦';
  else if (benLiuchong) guaXing = '六冲卦';

  // I. 元神 / 忌神有力判定（仅选用神后）
  const yongShenJi = [];
  if (yongShen) {
    const usIdx = yao
      .map((y, i) => (yongShen.type === 'liuqin' ? y.liuqin === yongShen.value : y.zhi === yongShen.value) ? i : -1)
      .filter((i) => i >= 0);
    const seen = new Set();
    const pushSpirit = (role, j) => {
      const key = `${j}|${role}`;
      if (seen.has(key)) return; // 多现用神共享同一元神/忌神时去重
      seen.add(key);
      const yj = yao[j];
      const b = bianOf(j);
      const verdict = assessSpirit(
        { index: j, zhi: yj.zhi, wuxing: yj.wuxing, dong: yj.dong, wangshuai: yj.wangshuai },
        {
          yueZhi,
          riZhi,
          kong,
          dongIdx,
          bianZhi: b ? b.zhi : null,
          bianWx: b ? b.wuxing : null,
          mu: MUKU[yj.wuxing],
          yaoZhi: yao.map((yy) => yy.zhi),
        },
      );
      yongShenJi.push({ yaoIndex: j, text: `${role}（${LINE_NAMES[j]}·${yj.liuqin}${yj.zhi}${yj.wuxing}）${verdict}` });
    };
    for (const u of usIdx) {
      const uwx = yao[u].wuxing;
      // 元神五行 = 生用神者；忌神五行 = 克用神者
      const yuanWx = Object.keys(SHENG).find((k) => SHENG[k] === uwx);
      const jiWx = Object.keys(KE).find((k) => KE[k] === uwx);
      for (let j = 0; j < yao.length; j++) {
        if (j === u) continue;
        if (yuanWx && yao[j].wuxing === yuanWx) pushSpirit('元神', j);
        if (jiWx && yao[j].wuxing === jiWx) pushSpirit('忌神', j);
      }
    }
  }

  return { benBian, yueJian, riChen, dongYao, sanHe, ruMu, zhenKong, guaXing, yongShenJi };
}
