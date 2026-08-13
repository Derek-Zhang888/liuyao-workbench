/**
 * md 导出模块测试（Task 7）
 * 验证 guashiToMd 三层格式输出：
 *   front matter（顺序固定）/ 标题 / 正文（盘面·断语·应期·备注·反馈）
 * 起卦参数格式契约：`方法名|输入值|时间`（导入端 Task 8 按同规则解析）
 * params 对象序列化规则：
 *   qian/yaoming/guaname/computer → 主值（lines/input）
 *   baoshu → digits；number → n1,n2,n3（method=2 时追加 ,m2）
 *   time → 时间（Date 或 ISO 字符串）
 * 时间回退：字符串 params 自带 | 后段；对象取 params.date/time；否则 guashi.date
 */
import { describe, expect, test } from 'vitest';
import { guashiToMd } from './exportMd.js';
import { mdToGuashi } from './importMd.js';
import { paipan } from '../engine/paipan.js';

/** 真实盘面：2026-08-04 10:30（庚戌日，月建未，六神起白虎）乾为天 初、三爻动 */
const snap = paipan({
  method: 'qian',
  params: { lines: '111111', dong: [0, 2] },
  date: new Date(2026, 7, 4, 10, 30),
});

/** 构造符合 guashi 字段设计的卦例（Task 6 结构） */
function makeGuashi(overrides = {}) {
  return {
    title: '占测今日出行',
    date: '2026-08-04',
    method: 'qian',
    params: '211111|2026-08-04 14:30',
    panSnapshot: snap,
    duanyu: '出行顺利',
    yingqi: '明日',
    jixiong: '吉',
    beizhu: '',
    fankui: '',
    status: '未反馈',
    jixiongOk: '',
    yingqiOk: '',
    fangweiOk: '',
    tags: ['出行', '等反馈'],
    ...overrides,
  };
}

/** 取 front matter 部分（两个 --- 之间） */
function frontMatter(md) {
  return md.split('---')[1] ?? '';
}

/** front matter 剔除 # 指导注释行后的字段区（避免注释里的示例干扰字段断言） */
function fmFields(md) {
  return frontMatter(md)
    .split('\n')
    .filter((l) => !l.trimStart().startsWith('#'))
    .join('\n');
}

/** 便捷：卦例覆盖项 → 去注释后的 front matter 字段区 */
function fmOf(overrides = {}) {
  return fmFields(guashiToMd(makeGuashi(overrides)));
}

/** 显示宽度：中文（含 ● 等全角字符）2 半角，ASCII 1（与 exportMd.js 内部算法一致） */
function dispWidth(s) {
  return [...String(s ?? '')].reduce((w, ch) => w + (ch.codePointAt(0) > 0xff ? 2 : 1), 0);
}

/** 取「## 盘面」小节内所有以 | 开头的表格原始行（含表头/分隔线/数据行） */
function panTableRawLines(md) {
  const lines = md.split('\n');
  const start = lines.findIndex((l) => l.startsWith('## 盘面'));
  const end = lines.findIndex((l, i) => i > start && l.startsWith('## '));
  const body = lines.slice(start + 1, end === -1 ? lines.length : end);
  return body.filter((l) => l.startsWith('|'));
}

/** 盘面表格 → 单元格数组（剔除分隔线、去除对齐空格）；table[0] 为表头 */
function panTable(md) {
  return panTableRawLines(md)
    .filter((l) => !/^\|[-|]+\|$/.test(l))
    .map((l) => l.split('|').slice(1, -1).map((c) => c.trim()));
}

/** 断言表格等宽对齐：每行 | 数量一致，且第 N 个 | 的显示宽度位置逐行一致（源码级对齐） */
function expectAligned(tableLines) {
  const pipePositions = tableLines.map((l) => {
    const pos = [];
    let w = 0;
    for (const ch of l) {
      if (ch === '|') pos.push(w);
      w += dispWidth(ch);
    }
    return pos;
  });
  const nPipes = pipePositions[0].length;
  for (const pos of pipePositions) {
    expect(pos.length).toBe(nPipes); // 单元格数一致（表头/分隔线/数据行）
  }
  for (let k = 0; k < nPipes; k++) {
    const col = pipePositions[0][k];
    for (const pos of pipePositions) {
      expect(pos[k]).toBe(col); // 第 N 个单元格起始列一致
    }
  }
}

describe('guashiToMd 三层格式', () => {
  test('完整卦例：front matter 字段齐全且顺序固定', () => {
    const fm = fmFields(guashiToMd(makeGuashi()));
    const fields = [
      'title:', 'date:', 'tags:', 'status:',
      '吉凶:', '吉凶对错:', '应期对错:', '方位对错:', '起卦参数:',
    ];
    const idxs = fields.map((f) => fm.indexOf(f));
    expect(idxs.every((i) => i >= 0)).toBe(true); // 字段齐全
    expect(idxs).toEqual([...idxs].sort((a, b) => a - b)); // 顺序断言
  });

  test('简报示例：起卦参数透传 + 标题与正文节', () => {
    const md = guashiToMd(makeGuashi());
    expect(fmFields(md)).toContain('\ntitle: 占测今日出行');
    expect(fmFields(md)).toContain('起卦参数: 钱币卦|211111|2026-08-04 14:30');
    expect(md).toContain('# 占测今日出行');
    expect(md).toContain('## 断语');
    expect(md).toContain('## 应期');
    expect(md).toContain('## 备注');
    expect(md).toContain('## 反馈');
  });

  test('tags 数组转 [tag1, tag2] 格式；空 tags 输出 []', () => {
    expect(fmOf()).toContain('tags: [出行, 等反馈]');
    expect(fmOf({ tags: [] })).toContain('tags: []');
  });

  test('空字段输出 ""（YAML 可解析）；空断语留空行', () => {
    const over = { title: '', jixiong: '', jixiongOk: '', beizhu: '', duanyu: '' };
    const fm = fmOf(over);
    expect(fm).toContain('title: ""');
    expect(fm).toContain('吉凶: ""');
    expect(fm).toContain('吉凶对错: ""');
    expect(guashiToMd(makeGuashi(over))).toContain('## 断语\n\n');
  });

  test('盘面渲染：含本卦/变卦名与六亲表格', () => {
    const md = guashiToMd(makeGuashi());
    expect(md).toContain('## 盘面');
    expect(md).toContain(`本卦：${snap.ben.name}`);
    expect(md).toContain(`变卦：${snap.bian.name}`);
    // v0.10 改进建8 #5 新列结构（13 列：六神 爻位 六亲 地支 五行 爻画 世应 本卦标记 + 变卦 4 列 + 标记）
    expect(panTable(md)[0]).toEqual([
      '六神', '爻位', '六亲', '地支', '五行', '爻画', '世应', '本卦标记',
      '变卦六亲', '变卦地支', '变卦五行', '变卦爻画', '标记',
    ]);
    // 太岁干支 + 月建天干
    expect(md).toMatch(/太岁：[甲乙丙丁戊己庚辛壬癸][子丑寅卯辰巳午未申酉戌亥].+月建：[甲乙丙丁戊己庚辛壬癸][子丑寅卯辰巳午未申酉戌亥]/);
    expect(md).toContain('子孙'); // 乾为天初爻孙子水
    expect(md).toContain('父母'); // 乾为天父戌土/父辰土
    expect(md).toContain('白虎'); // 庚日初爻六神白虎
  });

  test('无动爻 bian=null 时变卦行显示（无变卦）', () => {
    const s = paipan({ method: 'qian', params: { lines: '111111', dong: [] }, date: new Date(2026, 7, 4) });
    const md = guashiToMd(makeGuashi({ panSnapshot: s }));
    expect(md).toContain('变卦：（无变卦）');
  });

  test('panSnapshot 缺失容错：盘面节显示（无盘面数据），其余节不受影响', () => {
    const md = guashiToMd(makeGuashi({ panSnapshot: null }));
    expect(md).toContain('## 盘面');
    expect(md).toContain('（无盘面数据）');
    expect(md).toContain('## 断语');
    expect(md).toContain('出行顺利');
  });

  test('方法名映射：qian→钱币卦；未知 id 显示原 id', () => {
    expect(fmOf()).toContain('起卦参数: 钱币卦|');
    expect(fmOf({ method: 'foo', params: 'x' })).toContain('起卦参数: foo|x|2026-08-04');
  });

  test('钱币卦/电脑卦带 dong 序列化（F1：动爻随 md 导出）；dong 为空仅爻画', () => {
    expect(fmOf({ params: { lines: '222211', dong: [2, 5] } })).toContain('起卦参数: 钱币卦|222211,2,5|2026-08-04');
    expect(
      fmOf({ method: 'computer', params: { lines: '111111', dong: [0, 2] } }),
    ).toContain('起卦参数: 电脑卦|111111,0,2|2026-08-04');
    // dong 空数组/缺失 → 仅 6 位爻画（与旧格式一致，向后兼容）
    expect(fmOf({ params: { lines: '211111', dong: [] } })).toContain('起卦参数: 钱币卦|211111|2026-08-04');
    expect(fmOf({ params: { lines: '211111' } })).toContain('起卦参数: 钱币卦|211111|2026-08-04');
  });

  test('params 对象序列化：爻画/数字/报数/时间卦', () => {
    expect(fmOf({ params: { lines: '211111' } })).toContain('起卦参数: 钱币卦|211111|2026-08-04');
    expect(
      fmOf({ method: 'number', params: { n1: 1, n2: 2, n3: 3, method: 2 } }),
    ).toContain('起卦参数: 数字卦|1,2,3,m2|2026-08-04');
    expect(fmOf({ method: 'baoshu', params: { digits: '3412' } })).toContain('起卦参数: 报数卦|3412|2026-08-04');
    expect(
      fmOf({ method: 'time', params: { date: new Date(2026, 7, 4, 14, 30) } }),
    ).toContain('起卦参数: 时间卦|2026-08-04 14:30|2026-08-04');
  });

  test('起卦参数三段全空输出 ""（YAML 兼容，不以 | 开头）', () => {
    const fm = fmOf({ method: '', params: null, date: '' });
    expect(fm).toContain('起卦参数: ""');
    expect(fm).not.toContain('起卦参数: |');
  });

  test('yamlScalar 转义：# / 反斜杠 / YAML 1.1 关键字强制引号包裹', () => {
    const fm = fmOf({ title: '出行 #注意', date: 'a\\b', status: 'null', tags: ['yes', '真'] });
    expect(fm).toContain('title: "出行 #注意"');
    expect(fm).toContain('date: "a\\\\b"');
    expect(fm).toContain('status: "null"');
    expect(fm).toContain('tags: ["yes", 真]');
  });

  test('数字卦 method=1 无标记；guaname/yaoming/computer/time 序列化', () => {
    expect(fmOf({ method: 'number', params: { n1: 1, n2: 2, n3: 3 } })).toContain('起卦参数: 数字卦|1,2,3|2026-08-04');
    expect(fmOf({ method: 'guaname', params: { input: '天风姤' } })).toContain('起卦参数: 卦名卦|天风姤|2026-08-04');
    expect(fmOf({ method: 'yaoming', params: { lines: '311111' } })).toContain('起卦参数: 爻名卦|311111|2026-08-04');
    expect(fmOf({ method: 'computer', params: { lines: '111111' } })).toContain('起卦参数: 电脑卦|111111|2026-08-04');
    expect(
      fmOf({ method: 'time', params: { date: new Date(2026, 7, 4, 14, 30) } }),
    ).toContain('起卦参数: 时间卦|2026-08-04 14:30|2026-08-04');
  });

  test('断语空行精确断言：## 断语 后空两行再 ## 应期', () => {
    const md = guashiToMd(makeGuashi({ duanyu: '' }));
    expect(md).toContain('## 断语\n\n\n\n## 应期');
  });

  test('盘面渲染：动爻●标记与世应列', () => {
    const md = guashiToMd(makeGuashi());
    const table = panTable(md);
    // 行序：第 1 行 = 上爻（世位），最后 1 行 = 初爻（动爻）；13 列版索引 7=本卦标记、12=标记
    expect(table[1]).toEqual(['螣蛇', '上爻', '父母', '戌', '土', '1', '世', '', '父母', '戌', '土', '1', '']);
    expect(table[table.length - 1]).toEqual(['白虎', '初爻', '子孙', '子', '水', '1●', '', '', '妻财', '寅', '木', '2', '']);
    // 三爻：应位 + 动爻
    expect(table.find((r) => r[1] === '三爻')).toEqual(['青龙', '三爻', '父母', '辰', '土', '1●', '应', '', '官鬼', '午', '火', '2', '']);
  });

  test('盘面渲染：卦级神煞行（2026-08-04 庚戌日乙未月丙午年，日支系按日支单基准）', () => {
    const md = guashiToMd(makeGuashi());
    // 全部统一「名(值)」格式：日干系/日支系/月支系
    expect(md).toContain('神煞：天乙贵人(丑未)'); // 庚日贵人丑未
    expect(md).toContain('禄神(申)'); // 庚日禄在申
    expect(md).toContain('天医(午)'); // 未月天医午
    expect(md).toContain('天喜(丑)');
    expect(md).toContain('天德(甲)'); // 未月天德甲
    expect(md).toContain('月德(甲)'); // 未月→亥卯未月德甲
    // 日支系单基准（名(值)）：戌日→寅午戌局
    expect(md).toContain('驿马(申)');
    expect(md).toContain('桃花(卯)'); // 寅午戌日桃花卯
    expect(md).toContain('华盖(戌)');
    expect(md).toContain('将星(午)');
    expect(md).toContain('劫煞(亥)');
    expect(md).toContain('灾煞(子)');
    expect(md).toContain('谋星(辰)');
    // 无 (日)/(年) 双基准标记
    expect(md).not.toContain('(日)');
    expect(md).not.toContain('(年)');
  });

  test('盘面渲染：神煞行日支系仅按日支（不展示年支结果）', () => {
    const s = paipan({ method: 'qian', params: { lines: '111111', dong: [] }, date: new Date(2024, 1, 10) });
    // 甲辰日（申子辰局，驿马寅）甲辰年（申子辰局）——同局也应只显示日支单值
    const md = guashiToMd(makeGuashi({ panSnapshot: s }));
    expect(md).toContain('驿马(寅)');
    expect(md).not.toContain('(日)');
    expect(md).not.toContain('(年)');
  });

  test('盘面渲染：旧快照无 shenshaList 时省略神煞行', () => {
    const s = paipan({ method: 'qian', params: { lines: '111111', dong: [] }, date: new Date(2026, 7, 4) });
    delete s.shenshaList;
    const md = guashiToMd(makeGuashi({ panSnapshot: s }));
    expect(md).not.toContain('神煞：');
    expect(md).toContain('太岁：丙午');
  });

  test('盘面渲染：纳干开启加天干列 + 变卦天干列（15 列）；未开启保持 13 列', () => {
    const s = paipan({
      method: 'qian', params: { lines: '211111', dong: [1] }, date: new Date(2026, 7, 4, 10, 30),
      nagan: true, // 纳干开关快照：yao 带 gan
    });
    const md = guashiToMd(makeGuashi({ panSnapshot: s }));
    const table = panTable(md);
    // v0.10 改进建8 #5：15 列表头（本卦天干列 + 本卦标记 + 变卦天干列 + 表尾标记）
    expect(table[0]).toEqual([
      '六神', '爻位', '六亲', '天干', '地支', '五行', '爻画', '世应', '本卦标记',
      '变卦六亲', '变卦天干', '变卦地支', '变卦五行', '变卦爻画', '标记',
    ]);
    expect(table.every((r) => r.length === 15)).toBe(true);
    // v0.10 #8 按上下经卦纳甲：天风姤 = 下巽上乾 → 初二三爻用巽内干辛、四五六爻用乾外干壬
    // （初爻丑土 辛丑，不再按乾宫误配为甲丑）；二爻动 → 变卦天山遁（下艮上乾：初二三爻丙、四五六爻壬）
    // 15 列版：0 六神 1 爻位 2 六亲 3 天干 4 地支 5 五行 6 爻画 7 世应 8 本卦标记 9 变卦六亲 10 变卦天干 11 变卦地支 12 变卦五行 13 变卦爻画 14 标记
    expect(table.find((r) => r[1] === '初爻')).toEqual(['白虎', '初爻', '父母', '辛', '丑', '土', '2', '世', '', '父母', '丙', '辰', '土', '2', '']);
    expect(table.find((r) => r[1] === '四爻')).toEqual(['朱雀', '四爻', '官鬼', '壬', '午', '火', '1', '应', '', '官鬼', '壬', '午', '火', '1', '']);
    // 未开启纳干：13 列表头，无天干列
    const s2 = paipan({ method: 'qian', params: { lines: '211111', dong: [1] }, date: new Date(2026, 7, 4, 10, 30) });
    const md2 = guashiToMd(makeGuashi({ panSnapshot: s2 }));
    const table2 = panTable(md2);
    expect(table2[0]).toEqual([
      '六神', '爻位', '六亲', '地支', '五行', '爻画', '世应', '本卦标记',
      '变卦六亲', '变卦地支', '变卦五行', '变卦爻画', '标记',
    ]);
    expect(table2.every((r) => r.length === 13)).toBe(true);
    // 无天干列：13 列版索引 3 为地支（初爻丑土），不存在天干单元格
    expect(table2.find((r) => r[1] === '初爻')).toEqual(['白虎', '初爻', '父母', '丑', '土', '2', '世', '', '父母', '辰', '土', '2', '']);
  });

  test('盘面渲染：伏神爻后追加伏神行（六亲/地支/五行，爻位·天干·爻画·世应·本卦标记·变卦留空）', () => {
    const s = paipan({ method: 'qian', params: { lines: '211111', dong: [1] }, date: new Date(2026, 7, 4, 10, 30) });
    const md = guashiToMd(makeGuashi({ panSnapshot: s }));
    const table = panTable(md);
    // 天风姤二爻伏神：妻财寅木 → 13 列版，爻位列留空，本卦标记/变卦列留空
    expect(table.find((r) => r[0] === '玄武')).toEqual(['玄武', '二爻', '子孙', '亥', '水', '1●', '', '', '官鬼', '午', '火', '2', '']);
    expect(table.find((r) => r[0] === '伏神')).toEqual(['伏神', '', '妻财', '寅', '木', '', '', '', '', '', '', '', '']);
    // 主爻行与伏神行紧邻（伏神紧随其爻行之后）
    const iFu = table.findIndex((r) => r[0] === '伏神');
    const iZhu = table.findIndex((r) => r[0] === '玄武');
    expect(iFu).toBe(iZhu + 1);
    // 无伏神的爻不产生伏神行（乾为天八纯卦六亲齐全）
    const s2 = paipan({ method: 'qian', params: { lines: '111111', dong: [] }, date: new Date(2026, 7, 4) });
    expect(panTable(guashiToMd(makeGuashi({ panSnapshot: s2 }))).some((r) => r[0] === '伏神')).toBe(false);
  });

  test('盘面渲染：行序上爻在首、初爻在末（第 1 行=上爻，最后 1 行=初爻）', () => {
    const md = guashiToMd(makeGuashi());
    const table = panTable(md);
    const dataRows = table.slice(1); // 剔除表头
    expect(dataRows[0][1]).toBe('上爻');
    expect(dataRows[dataRows.length - 1][1]).toBe('初爻');
    expect(dataRows.map((r) => r[1])).toEqual(['上爻', '五爻', '四爻', '三爻', '二爻', '初爻']);
  });

  test('盘面渲染：变卦列内容（bian 非空，动爻爻画翻转，非动爻保持）', () => {
    const md = guashiToMd(makeGuashi()); // 乾为天 初、三爻动 → 天水讼
    const table = panTable(md);
    // 初爻动（1→2）：变卦初爻 妻财寅木、爻画 2
    expect(table.find((r) => r[1] === '初爻')).toEqual(['白虎', '初爻', '子孙', '子', '水', '1●', '', '', '妻财', '寅', '木', '2', '']);
    // 三爻动（1→2）：变卦三爻 官鬼午火、爻画 2
    expect(table.find((r) => r[1] === '三爻')).toEqual(['青龙', '三爻', '父母', '辰', '土', '1●', '应', '', '官鬼', '午', '火', '2', '']);
    // 二爻不动（1→1）：变卦二爻 父母辰土、爻画 1（无 ●）
    expect(table.find((r) => r[1] === '二爻')).toEqual(['玄武', '二爻', '妻财', '寅', '木', '1', '', '', '父母', '辰', '土', '1', '']);
    // 上爻不动（1→1）：变卦上爻 父母戌土、爻画 1
    expect(table.find((r) => r[1] === '上爻')).toEqual(['螣蛇', '上爻', '父母', '戌', '土', '1', '世', '', '父母', '戌', '土', '1', '']);
  });

  test('盘面渲染：无变卦（bian null）时变卦 4 列留空', () => {
    const s = paipan({ method: 'qian', params: { lines: '111111', dong: [] }, date: new Date(2026, 7, 4) });
    const md = guashiToMd(makeGuashi({ panSnapshot: s }));
    expect(md).toContain('变卦：（无变卦）');
    const table = panTable(md);
    for (const r of table.slice(1)) {
      expect(r.slice(8, 12)).toEqual(['', '', '', '']); // 变卦六亲/地支/五行/爻画全空（13 列版索引 8-11）
    }
  });

  test('盘面渲染：旧快照 bian 有 liuqin 无 lines 时不崩溃且变卦爻画列留空（13/15 列）', () => {
    // 模拟 8/6 提交之前的旧快照：bian 仅含 liuqin（无 lines 字段），用户 DB 旧卦例形态
    const mk = (nagan) => {
      const s = paipan({
        method: 'qian', params: { lines: '111111', dong: [0, 2] }, date: new Date(2026, 7, 4, 10, 30),
        nagan,
      });
      delete s.bian.lines;
      return s;
    };
    for (const nagan of [false, true]) {
      let md;
      expect(() => { md = guashiToMd(makeGuashi({ panSnapshot: mk(nagan) })); }).not.toThrow();
      const table = panTable(md);
      const header = table[0];
      const col = (name) => header.indexOf(name);
      // 变卦六亲/地支/五行仍从 bian.liuqin 渲染（上爻父母戌土），变卦爻画列留空
      const shang = table.find((r) => r[1] === '上爻');
      expect(shang[col('变卦六亲')]).toBe('父母');
      expect(shang[col('变卦地支')]).toBe('戌');
      expect(shang[col('变卦五行')]).toBe('土');
      expect(shang[col('变卦爻画')]).toBe('');
      const chu = table.find((r) => r[1] === '初爻');
      expect(chu[col('变卦六亲')]).toBe('妻财');
      expect(chu[col('变卦地支')]).toBe('寅');
      expect(chu[col('变卦五行')]).toBe('木');
      expect(chu[col('变卦爻画')]).toBe('');
      // 列数完整（无纳干 13 / 纳干 15）且等宽对齐
      expect(table.every((r) => r.length === (nagan ? 15 : 13))).toBe(true);
      expectAligned(panTableRawLines(md));
    }
  });

  test('盘面渲染：13 列旧结构（无纳干），表头/数据行列数一致', () => {
    const s = paipan({ method: 'qian', params: { lines: '211111', dong: [1] }, date: new Date(2026, 7, 4, 10, 30) });
    const table = panTable(guashiToMd(makeGuashi({ panSnapshot: s })));
    expect(table[0]).toEqual([
      '六神', '爻位', '六亲', '地支', '五行', '爻画', '世应', '本卦标记',
      '变卦六亲', '变卦地支', '变卦五行', '变卦爻画', '标记',
    ]);
    expect(table.every((r) => r.length === 13)).toBe(true);
  });

  test('盘面渲染：等宽对齐（表头/分隔线/数据行逐列对齐，含伏神行/15 列/无变卦）', () => {
    // 13 列（乾为天 有变卦）
    expectAligned(panTableRawLines(guashiToMd(makeGuashi())));
    // 15 列 + 伏神行（天风姤 纳干）
    const s2 = paipan({
      method: 'qian', params: { lines: '211111', dong: [1] }, date: new Date(2026, 7, 4, 10, 30),
      nagan: true,
    });
    expectAligned(panTableRawLines(guashiToMd(makeGuashi({ panSnapshot: s2 }))));
    // 无变卦（bian null）
    const s3 = paipan({ method: 'qian', params: { lines: '111111', dong: [] }, date: new Date(2026, 7, 4) });
    expectAligned(panTableRawLines(guashiToMd(makeGuashi({ panSnapshot: s3 }))));
  });

  test('盘面渲染：自定用神标注（六亲/地支两形态），未选省略', () => {
    const s = paipan({
      method: 'qian', params: { lines: '211111', dong: [1] }, date: new Date(2026, 7, 4, 10, 30),
      yongShen: { type: 'liuqin', value: '财' },
    });
    const md = guashiToMd(makeGuashi({ panSnapshot: s }));
    expect(md).toContain('用神：六亲 财');
    const s2 = paipan({
      method: 'qian', params: { lines: '211111', dong: [1] }, date: new Date(2026, 7, 4, 10, 30),
      yongShen: { type: 'zhi', value: '寅' },
    });
    expect(guashiToMd(makeGuashi({ panSnapshot: s2 }))).toContain('用神：地支 寅');
    const s3 = paipan({ method: 'qian', params: { lines: '211111', dong: [1] }, date: new Date(2026, 7, 4, 10, 30) });
    expect(guashiToMd(makeGuashi({ panSnapshot: s3 }))).not.toContain('用神：');
  });

  test('地支分析：dizhiAnalysis 非空时盘面后追加小节，小节内容与盘面同口径', () => {
    const s = paipan({
      method: 'qian', params: { lines: '211111', dong: [1] }, date: new Date(2026, 7, 4, 10, 30),
      dizhi: true, // 地支分析计算（UI 恒传 true）
    });
    const md = guashiToMd(makeGuashi({ panSnapshot: s }));
    expect(md).toContain('## 地支分析');
    expect(md).toContain('**本变**：二爻 化他（午火）'); // 爻位前缀 + 文本
    expect(md).toContain('**月建**：初爻 月破、四爻 月六合');
    expect(md).toContain('**三合**：卦内三合火局（缺寅，待填实）'); // 无爻位条目直接文本
    // 位置：在盘面表格之后、断语之前
    const iDz = md.indexOf('## 地支分析');
    const iPan = md.indexOf('## 盘面');
    const iDy = md.indexOf('## 断语');
    expect(iDz).toBeGreaterThan(iPan);
    expect(iDz).toBeLessThan(iDy);
  });

  test('地支分析：dizhiAnalysis 全空时输出提示文案；旧快照无该字段则省略小节', () => {
    const s = paipan({ method: 'qian', params: { lines: '211111', dong: [] }, date: new Date(2026, 7, 4, 10, 30) });
    s.dizhiAnalysis = { benBian: [], yueJian: [], riChen: [], dongYao: [], sanHe: [], ruMu: [], zhenKong: [], yongShenJi: [] };
    expect(guashiToMd(makeGuashi({ panSnapshot: s }))).toContain('本卦无特殊地支关系（可选用神查看元神/忌神判定）。');
    delete s.dizhiAnalysis;
    const md = guashiToMd(makeGuashi({ panSnapshot: s }));
    expect(md).not.toContain('## 地支分析');
    expect(md).not.toContain('本卦无特殊地支关系');
  });

  test('导入可逆：含天干列/伏神/地支分析/用神的导出 md 仍可导入，新小节被安全丢弃', () => {
    const s = paipan({
      method: 'qian', params: { lines: '211111', dong: [1] }, date: new Date(2026, 7, 4, 10, 30),
      nagan: true, dizhi: true, yongShen: { type: 'liuqin', value: '财' },
    });
    const md = guashiToMd(makeGuashi({ panSnapshot: s, duanyu: '出行顺利' }));
    const r = mdToGuashi(md);
    expect(r.ok).toBe(true);
    expect(r.guashi.title).toBe('占测今日出行');
    expect(r.guashi.method).toBe('qian');
    // makeGuashi params 为字符串透传（无动爻段），导入还原为 {lines}（与既有契约一致）
    expect(r.guashi.params).toEqual({ lines: '211111' });
    expect(r.guashi.duanyu).toBe('出行顺利'); // 断语不受「地支分析」节影响
    expect(r.guashi.panSnapshot).toBe(null); // 盘面节整体丢弃，不落字段
  });

  test('v0.2 涂鸦节：doodle 非空时图片行 + json 元数据块，位置在文件最后（占断内容之后）', () => {
    const doodle = {
      version: 1, width: 600, height: 400,
      elements: [{ type: 'pen', color: '#e74c3c', width: 4, points: [{ x: 10, y: 20 }, { x: 30, y: 40 }] }],
    };
    const md = guashiToMd(makeGuashi({ doodle }));
    expect(md).toContain('## 涂鸦（电脑）');
    expect(md).toContain('![涂鸦（电脑）](data:image/svg+xml;utf8,');
    // json 元数据块可逆还原源
    expect(md).toContain('```json\n' + JSON.stringify(doodle) + '\n```');
    // 位置：备注（占断内容最后一节）之后，即文件最后
    const iTu = md.indexOf('## 涂鸦（电脑）');
    const iBz = md.indexOf('## 备注');
    const iDy = md.indexOf('## 断语');
    expect(iTu).toBeGreaterThan(iBz);
    expect(iTu).toBeGreaterThan(iDy);
    expect(md.indexOf('## 涂鸦（电脑）')).toBe(md.lastIndexOf('## 涂鸦（电脑）')); // 唯一
    // 空/缺省 doodle → 无涂鸦节（旧卦例兼容）
    expect(guashiToMd(makeGuashi())).not.toContain('## 涂鸦（电脑）');
    expect(guashiToMd(makeGuashi({ doodle: { version: 1, width: 600, height: 400, elements: [] } }))).not.toContain('## 涂鸦（电脑）');
  });

  test('v1.2.0 双涂鸦节：电脑/手机各一套独立导出，节序 电脑→手机，互不影响', () => {
    const doodle = { version: 1, width: 600, height: 400, elements: [{ type: 'pen', color: '#e74c3c', width: 4, points: [{ x: 1, y: 2 }] }] };
    const doodleMobile = { version: 1, width: 400, height: 300, elements: [{ type: 'text', x: 5, y: 6, size: 16, color: '#3498db', text: '手机批注' }] };
    const md = guashiToMd(makeGuashi({ doodle, doodleMobile }));
    expect(md).toContain('## 涂鸦（电脑）');
    expect(md).toContain('![涂鸦（电脑）](data:image/svg+xml;utf8,');
    expect(md).toContain('## 涂鸦（手机）');
    expect(md).toContain('![涂鸦（手机）](data:image/svg+xml;utf8,');
    expect(md).toContain('```json\n' + JSON.stringify(doodle) + '\n```');
    expect(md).toContain('```json\n' + JSON.stringify(doodleMobile) + '\n```');
    // 节序：涂鸦（电脑）在涂鸦（手机）之前；均在备注之后（文件最后）
    expect(md.indexOf('## 涂鸦（电脑）')).toBeLessThan(md.indexOf('## 涂鸦（手机）'));
    expect(md.indexOf('## 涂鸦（电脑）')).toBeGreaterThan(md.indexOf('## 备注'));
    // 只导出其一：另一节不出现
    const mdPc = guashiToMd(makeGuashi({ doodle }));
    expect(mdPc).toContain('## 涂鸦（电脑）');
    expect(mdPc).not.toContain('## 涂鸦（手机）');
    const mdMo = guashiToMd(makeGuashi({ doodleMobile }));
    expect(mdMo).not.toContain('## 涂鸦（电脑）');
    expect(mdMo).toContain('## 涂鸦（手机）');
  });

  test('v0.2 背景节：background 非空时在断语前；空则省略', () => {
    const md = guashiToMd(makeGuashi({ background: '占测今日出差是否顺利' }));
    expect(md).toContain('## 背景\n\n占测今日出差是否顺利');
    const iDz = md.indexOf('## 盘面');
    const iBg = md.indexOf('## 背景');
    const iDy = md.indexOf('## 断语');
    expect(iBg).toBeGreaterThan(iDz);
    expect(iBg).toBeLessThan(iDy);
    // 空 background 无该节
    expect(guashiToMd(makeGuashi({ background: '' }))).not.toContain('## 背景');
  });

  test('v0.2 标记列：pan.markers 存在时本卦标记/表尾标记两列均有内容（v0.10 改进建8 #5 固定列）', () => {
    const s = paipan({
      method: 'qian', params: { lines: '111111', dong: [0, 2] }, date: new Date(2026, 7, 4, 10, 30),
      markers: { 'marker-wangshuai': true, 'marker-yuepo': true },
    });
    expect(s.markers).toBeTruthy();
    const md = guashiToMd(makeGuashi({ panSnapshot: s }));
    const table = panTable(md);
    // 13 列：11 基础列 + 本卦标记 + 表尾标记（固定列结构）
    expect(table[0]).toEqual([
      '六神', '爻位', '六亲', '地支', '五行', '爻画', '世应', '本卦标记',
      '变卦六亲', '变卦地支', '变卦五行', '变卦爻画', '标记',
    ]);
    expect(table.every((r) => r.length === 13)).toBe(true);
    expectAligned(panTableRawLines(md));
    // 旧快照无 markers → 列结构不变（13 列），本卦标记/表尾标记栏留空
    const s2 = paipan({ method: 'qian', params: { lines: '111111', dong: [0, 2] }, date: new Date(2026, 7, 4, 10, 30) });
    const md2 = guashiToMd(makeGuashi({ panSnapshot: s2 }));
    const table2 = panTable(md2);
    expect(table2[0]).toEqual([
      '六神', '爻位', '六亲', '地支', '五行', '爻画', '世应', '本卦标记',
      '变卦六亲', '变卦地支', '变卦五行', '变卦爻画', '标记',
    ]);
    expect(table2.every((r) => r.length === 13)).toBe(true);
    // 无标记时本卦标记栏全部留空（表尾标记栏也留空）
    expect(table2.slice(1).every((r) => r[7] === '')).toBe(true);
    expect(table2.slice(1).every((r) => r[12] === '')).toBe(true);
  });

  test('v0.10 标记列：本卦标记入「本卦标记」栏、变卦标记入表尾「标记」栏（v0.10 改进建8 #5）', () => {
    // 直接构造 markers（模拟 computePanMarkers 输出，验证导出端字形渲染）
    const s = paipan({ method: 'qian', params: { lines: '111111', dong: [] }, date: new Date(2026, 7, 4) });
    s.markers = {
      wangshuai: [{ i: 0, ws: '囚' }, { i: 2, ws: '旺' }],
      yuePo: [0],
      huitouSheng: [1],
      jinTui: [{ i: 3, label: '进' }],
      fanYin: [{ i: 4, label: '伏' }],
    };
    const md = guashiToMd(makeGuashi({ panSnapshot: s }));
    const table = panTable(md);
    // 13 列版：索引 7=本卦标记栏、12=表尾标记栏
    const benCol = table.map((r) => r[7] ?? '');
    const markerCol = table.map((r) => r[12] ?? '');
    expect(benCol[table.length - 1]).toBe('囚 月破'); // 初爻：本卦旺衰囚 + 月破（空格隔开）
    expect(benCol.find((c) => c === '旺')).toBe('旺'); // 三爻辰土旺
    expect(benCol).toContain('进'); // 化进神放本卦标记栏
    expect(benCol).toContain('伏'); // 伏吟放本卦标记栏
    expect(markerCol).toContain('↲生'); // 回头箭头指向左（v0.10）放表尾标记栏
    expect(markerCol).not.toContain('月破'); // 月破属本卦，不进表尾标记栏
    expectAligned(panTableRawLines(md));
  });

  test('v0.10 标记列：变爻/伏神标记并入表尾「标记」栏（本卦标记只含本卦）', () => {
    const s = paipan({ method: 'qian', params: { lines: '211111', dong: [0] }, date: new Date(2026, 7, 4) });
    s.markers = {
      wangshuai: [{ i: 0, ws: '死' }], // 初爻丑土 月建未土克 → 死
      yuePo: [0], // 丑未冲
      bianWangshuai: [{ i: 0, ws: '死' }], // 变爻子水（土克水）
      fushenWangshuai: [{ i: 1, ws: '囚' }], // 二爻伏神寅木（木克土）
    };
    const md = guashiToMd(makeGuashi({ panSnapshot: s }));
    const table = panTable(md);
    // 数据行：第 1 行为上爻…最后 1 行为初爻；天风姤二爻有伏神，伏神行紧随「二爻」行之后
    const erRowIdx = table.findIndex((r) => r[1] === '二爻');
    const fuRowIdx = table.findIndex((r) => r[0] === '伏神');
    expect(erRowIdx).toBeGreaterThan(-1);
    expect(fuRowIdx).toBe(erRowIdx + 1);
    // 初爻行：本卦标记栏 = 本卦旺衰死 + 月破；表尾标记栏 = 变爻旺衰死（不跨栏错位）
    const benRowIdx = table.findIndex((r) => r[1] === '初爻');
    expect(table[benRowIdx][7]).toBe('死 月破');
    expect(table[benRowIdx][12]).toBe('死');
    // 伏神行：表尾标记栏 = 伏神旺衰囚（本卦标记栏留空）
    expect(table[fuRowIdx][7]).toBe('');
    expect(table[fuRowIdx][12]).toBe('囚');
    expectAligned(panTableRawLines(md));
  });

  test('v0.10 改进建7 #4 香闺/床帐全地支（空格分隔）并入盘面 head 行（数组结构）', () => {
    const s = paipan({ method: 'qian', params: { lines: '111111', dong: [] }, date: new Date(2026, 7, 4) });
    // 乾为天：卦身精确推演巳（火），克金→香闺=金全部[申,酉]、生土→床帐=土全部[丑,辰,未,戌]（十二支序）
    expect(s.guashenPrecise).toBe('巳');
    expect(s.xianggui).toEqual([{ zhi: '申' }, { zhi: '酉' }]);
    expect(s.chuangzhang).toEqual([{ zhi: '丑' }, { zhi: '辰' }, { zhi: '未' }, { zhi: '戌' }]);
    const md = guashiToMd(makeGuashi({ panSnapshot: s }));
    expect(md).toMatch(/卦身：巳\s+香闺：申 酉\s+床帐：丑 辰 未 戌/);
    // 旧快照对象形态 {zhi,wuxing} 向后兼容
    const old = paipan({ method: 'qian', params: { lines: '111111', dong: [] }, date: new Date(2026, 7, 4) });
    old.xianggui = { zhi: '申', wuxing: '金' };
    old.chuangzhang = { zhi: '辰', wuxing: '土' };
    const mdOld = guashiToMd(makeGuashi({ panSnapshot: old }));
    expect(mdOld).toMatch(/香闺：申金\s+床帐：辰土/);
    // 旧快照仅 guashen（无 guashenPrecise/香闺床帐）→ 只显示旧卦身，不崩
    const old2 = paipan({ method: 'qian', params: { lines: '111111', dong: [] }, date: new Date(2026, 7, 4) });
    delete old2.guashenPrecise;
    delete old2.xianggui;
    delete old2.chuangzhang;
    const mdOld2 = guashiToMd(makeGuashi({ panSnapshot: old2 }));
    expect(mdOld2).toContain('卦身：戌');
    expect(mdOld2).not.toContain('香闺');
  });

  test('v0.2 备注节名保持「备注」（不改成笔记，保证旧版导入不丢 beizhu）', () => {
    const md = guashiToMd(makeGuashi({ beizhu: '记得带伞' }));
    expect(md).toContain('## 备注\n\n记得带伞');
    expect(md).not.toContain('## 笔记');
  });
});

/** front matter 顶部指导块（bug #13）：填写模板 / 填错无法导入提醒 / 1=阳爻 2=阴爻释义 */
describe('guashiToMd front matter 指导块', () => {
  test('位于 front matter 顶部（title 之前），且全部为 # 注释行', () => {
    const fm = frontMatter(guashiToMd(makeGuashi()));
    const lines = fm.split('\n').filter((l) => l !== '');
    expect(lines[0].startsWith('#')).toBe(true);
    const firstField = lines.findIndex((l) => l.startsWith('title:'));
    expect(firstField).toBeGreaterThan(0);
    // 指导块每一行都是 # 注释，不产生 YAML 字段
    expect(lines.slice(0, firstField).every((l) => l.startsWith('#'))).toBe(true);
  });

  test('三点要求：填写模板 / 填错无法导入提醒 / 1 阳爻 2 阴爻说明', () => {
    const fm = frontMatter(guashiToMd(makeGuashi()));
    expect(fm).toContain('填写模板'); // ① 模板
    expect(fm).toContain('#   title: 占测今日出行'); // ① 逐字段示例
    expect(fm).toContain('#   起卦参数: 钱币卦|211111,0,2|2026-08-04 14:30');
    expect(fm).toContain('无法导入'); // ② 填错提醒
    expect(fm).toContain('1 = 阳爻'); // ③ 盘面释义
    expect(fm).toContain('2 = 阴爻');
    expect(fm).toContain('● 表示该爻为动爻');
  });

  test('盘面表格说明：第 1 行上爻最后 1 行初爻 + 变卦列 + 本卦标记/表尾标记列说明', () => {
    const fm = frontMatter(guashiToMd(makeGuashi()));
    expect(fm).toContain('下方盘面表格第 1 行为上爻，最后 1 行为初爻');
    expect(fm).toContain('变卦列展示本卦各爻动变后的六亲/地支/五行/爻画，无变卦（无动爻）的卦该列为空');
    // v0.10 改进建8 #5：本卦标记列 / 表尾标记列说明
    expect(fm).toContain('本卦标记列展示本卦爻标记');
    expect(fm).toContain('表尾标记列展示变卦标记');
  });

  test('不破坏 front matter：无整行三连字符，导入端仍可解析', () => {
    const md = guashiToMd(makeGuashi());
    expect(frontMatter(md).split('\n').some((l) => l.trim() === '---')).toBe(false);
    const r = mdToGuashi(md);
    expect(r.ok).toBe(true);
    expect(r.guashi.title).toBe('占测今日出行');
    expect(r.guashi.method).toBe('qian');
    expect(r.guashi.params).toEqual({ lines: '211111' });
    expect(r.guashi.tags).toEqual(['出行', '等反馈']);
    expect(r.guashi.jixiong).toBe('吉');
  });
});

/** v0.10 #16：md 盘面标记列修复 + 导入→重排标记恢复 + 涂鸦导入还原 */
describe('v0.10 md 盘面标记与导入还原', () => {
  test('标记列写全且空格隔开：月破/日破/月合/日合 分开写全（不再只写「破/合」）', () => {
    const s = paipan({ method: 'qian', params: { lines: '111111', dong: [0, 2] }, date: new Date(2026, 7, 4, 10, 30) });
    s.markers = {
      wangshuai: [{ i: 0, ws: '死' }],
      riHe: [2],        // 三爻辰土 与日建戌：辰酉合? 戌与辰无合 → 手工置为日合以验证字形
      huitouChong: [0], // 动爻回头冲（变爻午火 冲 本爻子水）
    };
    const md = guashiToMd(makeGuashi({ panSnapshot: s }));
    const table = panTable(md);
    // 13 列版：索引 7=本卦标记栏、12=表尾标记栏
    const benCol = table.map((r) => r[7] ?? '');
    const markerCol = table.map((r) => r[12] ?? '');
    // 初爻行：本卦标记栏=死（本卦旺衰）；表尾标记栏=回头冲（回头箭头指向左 ↲）
    const benIdx = table.findIndex((r) => r[1] === '初爻');
    expect(table[benIdx][7]).toBe('死');
    expect(table[benIdx][12]).toBe('↲冲');
    // 三爻行：日合（写全）放本卦标记栏
    const sanIdx = table.findIndex((r) => r[1] === '三爻');
    expect(table[sanIdx][7]).toBe('日合');
    expect(markerCol).not.toContain('日合');
    expectAligned(panTableRawLines(md));
  });

  test('标记列与爻行对齐：本卦地支月破显示在本卦标记栏（不与变卦地支错位）', () => {
    // 天风姤 初爻动：本卦初爻丑土 月破（未丑冲）；变爻为乾为天初爻子水（无月破）
    // 旧实现曾出现「本卦月破显示到变卦地支」错位——此处断言月破出现在初爻行本卦标记栏
    const s = paipan({
      method: 'qian', params: { lines: '211111', dong: [0] }, date: new Date(2026, 7, 4),
      markers: { 'marker-wangshuai': true, 'marker-yuepo': true },
    });
    expect(s.markers.yuePo).toEqual([0]);
    const md = guashiToMd(makeGuashi({ panSnapshot: s }));
    const table = panTable(md);
    const benIdx = table.findIndex((r) => r[1] === '初爻');
    expect(table[benIdx][3]).toBe('丑'); // 本卦地支丑（13 列版：0 六神 1 爻位 2 六亲 3 地支）
    expect(table[benIdx][9]).toBe('子'); // 变卦地支子（9 变卦地支）
    expect(table[benIdx][7]).toContain('月破'); // 月破在本卦标记栏（而非变卦地支行）
    // 其他行本卦标记栏不出现月破
    const others = table.filter((r, k) => k !== benIdx).map((r) => r[7] ?? '');
    expect(others.some((c) => c.includes('月破'))).toBe(false);
    expectAligned(panTableRawLines(md));
  });

  test('导入→重排标记恢复：mdToGuashi 后按 method/params 重排（携带 markers 设置）', () => {
    // 1) 导出带标记快照的 md（params 对象形态，含动爻信息，可逆）
    const s = paipan({
      method: 'qian', params: { lines: '211111', dong: [0] }, date: new Date(2026, 7, 4),
      markers: { 'marker-wangshuai': true, 'marker-yuepo': true },
    });
    const md = guashiToMd(makeGuashi({ panSnapshot: s, params: { lines: '211111', dong: [0] } }));
    // 2) 导入（panSnapshot 恒 null，doodle/yongShen 等保留）
    const r = mdToGuashi(md);
    expect(r.ok).toBe(true);
    expect(r.guashi.panSnapshot).toBeNull();
    expect(r.guashi.params).toEqual({ lines: '211111', dong: [0] });
    // 3) 重排（等效 resolvePan 携带 markers 设置）→ 标记恢复
    const repan = paipan({
      method: r.guashi.method,
      params: r.guashi.params,
      date: new Date(String(r.guashi.date).replace(' ', 'T')),
      markers: { 'marker-wangshuai': true, 'marker-yuepo': true },
    });
    expect(repan.markers.yuePo).toEqual([0]); // 初爻丑土月破恢复
    expect(repan.markers.wangshuai[0]).toMatchObject({ i: 0, ws: '旺' }); // 丑土同月建=旺
  });

  test('涂鸦导入完整还原：导出 md → mdToGuashi 还原 doodle（含 SVG 图片行与 json 元数据）', () => {
    const doodle = {
      version: 1, width: 600, height: 400,
      elements: [
        { type: 'pen', color: '#e74c3c', width: 4, points: [{ x: 10, y: 20 }, { x: 50, y: 80 }] },
        { type: 'text', x: 20, y: 40, text: '标记', size: 16, color: '#f39c12' },
      ],
    };
    const md = guashiToMd(makeGuashi({ doodle }));
    expect(md).toContain('## 涂鸦（电脑）');
    expect(md).toContain('![涂鸦（电脑）](data:image/svg+xml;utf8,');
    const r = mdToGuashi(md);
    expect(r.ok).toBe(true);
    expect(r.guashi.doodle).toEqual(doodle);
  });
});

/** v0.10 改进建7：#3 创建/最后编辑、#5 变卦天干列、#9 标记列归属 */
describe('v0.10 改进建7 md 导出新增字段', () => {
  test('#3 创建/最后编辑 head 行：createdAt/updatedAt 写入「创建/最后编辑」，date 回退创建', () => {
    // 用本地时间 Date（fmtTs 按本地时区格式化，避免 UTC 构造在 CI 时区漂移）
    const created = new Date(2026, 7, 8, 9, 0).getTime();
    const updated = new Date(2026, 7, 8, 10, 30).getTime();
    const md = guashiToMd(makeGuashi({ createdAt: created, updatedAt: updated }));
    expect(md).toMatch(/创建：2026-08-08 09:00　最后编辑：2026-08-08 10:30/);
    // 仅 createdAt → 创建显示、最后编辑留空（格式仍为一行）
    const md2 = guashiToMd(makeGuashi({ createdAt: created }));
    expect(md2).toMatch(/创建：2026-08-08 09:00　最后编辑：/);
    // 无 createdAt/updatedAt（旧记录）→ 创建回退 date、最后编辑空
    const md3 = guashiToMd(makeGuashi({}));
    expect(md3).toMatch(/创建：2026-08-04　最后编辑：/);
    // 无 date 也无时间 → 整行省略（旧快照兼容）
    const md4 = guashiToMd(makeGuashi({ date: '' }));
    expect(md4).not.toContain('创建：');
  });

  test('#3 创建/最后编辑 导入还原 createdAt/updatedAt（缺失不落字段，向后兼容）', () => {
    const created = new Date(2026, 7, 8, 9, 0).getTime();
    const updated = new Date(2026, 7, 8, 10, 30).getTime();
    const md = guashiToMd(makeGuashi({ createdAt: created, updatedAt: updated }));
    const r = mdToGuashi(md);
    expect(r.ok).toBe(true);
    expect(r.guashi.createdAt).toBe(created);
    expect(r.guashi.updatedAt).toBe(updated);
    // 缺失：旧 md 无创建/最后编辑行 → 不落字段（仓储默认补齐）
    const mdOld = '---\ntitle: 旧卦例\ndate: 2026-08-04\n起卦参数: 钱币卦|211111|2026-08-04\n---\n\n# 旧卦例\n\n## 盘面\n\n本卦：天风姤（乾宫）\n\n## 断语\n';
    const rOld = mdToGuashi(mdOld);
    expect(rOld.ok).toBe(true);
    expect('createdAt' in rOld.guashi).toBe(false);
    expect('updatedAt' in rOld.guashi).toBe(false);
  });

  test('#5 开启纳干：变卦天干列按变卦上下经卦纳甲（乾为天初动→天风姤 辛辛辛壬壬壬）', () => {
    const s = paipan({
      method: 'qian', params: { lines: '111111', dong: [0] }, date: new Date(2026, 7, 4, 10, 30),
      nagan: true,
    });
    expect(s.bian.name).toBe('天风姤');
    expect(s.bian.gan).toEqual(['辛', '辛', '辛', '壬', '壬', '壬']);
    const md = guashiToMd(makeGuashi({ panSnapshot: s }));
    const table = panTable(md);
    expect(table[0]).toContain('变卦天干');
    const chuIdx = table.findIndex((r) => r[1] === '初爻');
    expect(table[chuIdx][10]).toBe('辛'); // 变卦天干列（15 列版索引 10）
    expect(table[chuIdx][11]).toBe('丑'); // 变卦地支（天风姤初爻父丑土）
    const shangIdx = table.findIndex((r) => r[1] === '上爻');
    expect(table[shangIdx][10]).toBe('壬'); // 上爻变卦天干（上卦乾外干壬）
    expectAligned(panTableRawLines(md));
    // 旧快照 bian 无 gan（手工删除）→ 变卦天干列留空不崩
    const old = paipan({
      method: 'qian', params: { lines: '111111', dong: [0] }, date: new Date(2026, 7, 4, 10, 30),
      nagan: true,
    });
    delete old.bian.gan;
    const mdOld = guashiToMd(makeGuashi({ panSnapshot: old }));
    expect(panTable(mdOld).find((r) => r[1] === '初爻')[10]).toBe('');
  });

  test('#9 标记归属（v0.10 改进建8 #5 分栏）：本卦标记在本卦标记栏、变卦标记在表尾标记栏、伏神标记在伏神行表尾栏', () => {
    // 天风姤 初爻动：本卦初爻丑土 月破 + 变卦初爻子水 死旺衰；二爻伏神财寅木
    const s = paipan({
      method: 'qian', params: { lines: '211111', dong: [0] }, date: new Date(2026, 7, 4),
      markers: {
        'marker-wangshuai': true,
        'marker-yuepo': true,
        'marker-jintui-fanfuyin': true,
      },
    });
    const md = guashiToMd(makeGuashi({ panSnapshot: s }));
    const table = panTable(md);
    const chuIdx = table.findIndex((r) => r[1] === '初爻');
    const shangIdx = table.findIndex((r) => r[1] === '上爻');
    // 本卦初爻行：本卦地支丑（月破）+ 本卦旺衰旺 → 本卦标记栏；变爻旺衰死 → 表尾标记栏（不跨栏错位）
    expect(table[chuIdx][3]).toBe('丑'); // 本卦地支
    expect(table[chuIdx][9]).toBe('子'); // 变卦地支
    expect(table[chuIdx][7]).toBe('旺 月破');
    expect(table[chuIdx][12]).toBe('死');
    // 上爻（无月破/进退/回头）本卦标记栏只有本卦旺衰、表尾标记栏只有变卦旺衰——不出现其他爻的「月破」
    expect(table[shangIdx][7]).toBe('旺');
    expect(table[shangIdx][12]).toBe('旺');
    expect(table[shangIdx][7]).not.toContain('月破');
    // 伏神行：本卦标记栏留空、表尾标记栏仅伏神旺衰（不含本卦/变卦标记）
    const fuIdx = table.findIndex((r) => r[0] === '伏神');
    expect(fuIdx).toBeGreaterThan(-1);
    expect(table[fuIdx][7]).toBe('');
    expect(table[fuIdx][12]).toBe('囚');
    // 其余行本卦标记栏不得出现「月破」（月破只属于初爻行）
    const others = table.filter((r, k) => k !== chuIdx).map((r) => r[7] ?? '');
    expect(others.some((c) => c.includes('月破'))).toBe(false);
    expectAligned(panTableRawLines(md));
  });

  test('#9 无变卦爻时表尾标记栏留空：只有本卦旺衰，不出现变卦/回头/进退字形', () => {
    const s = paipan({
      method: 'qian', params: { lines: '211111', dong: [] }, date: new Date(2026, 7, 4),
      markers: { 'marker-wangshuai': true, 'marker-jintui-fanfuyin': true },
    });
    expect(s.bian).toBeNull(); // 无动爻 → 无变卦
    const md = guashiToMd(makeGuashi({ panSnapshot: s }));
    const table = panTable(md).slice(1); // 跳过表头
    const benCol = table.map((r) => r[7] ?? '');
    const markerCol = table.map((r) => r[12] ?? '');
    // 本卦标记栏：主行单个本卦旺衰字、伏神行留空；表尾标记栏：无变卦时主行留空、伏神行旺衰字
    for (const c of benCol) {
      expect(c === '' || /^[旺相休囚死]$/.test(c), `本卦标记栏应为旺衰字或空，实际：${JSON.stringify(c)}`).toBe(true);
    }
    for (const c of markerCol) {
      expect(c === '' || /^[旺相休囚死]$/.test(c), `表尾标记栏应为旺衰字或空，实际：${JSON.stringify(c)}`).toBe(true);
    }
    // 无 进/退/伏/反/↲ 字形（两栏都不出现）
    expect(benCol.join('') + markerCol.join('')).not.toMatch(/[进退伏反↲]/);
    expectAligned(panTableRawLines(md));
  });
});

describe('v1.3.0 取数双字段导出', () => {
  test('front matter 含 取数/取数反馈（值非空时原样输出）', () => {
    const fm = fmOf({ quShu: '三', quShuFb: '神准' });
    expect(fm).toContain('取数: 三');
    expect(fm).toContain('取数反馈: 神准');
  });

  test('旧记录无取数字段导出为空串（""），md 往返导入无损', () => {
    const fm = fmOf({});
    expect(fm).toContain('取数: ""');
    expect(fm).toContain('取数反馈: ""');
    const g = mdToGuashi(guashiToMd(makeGuashi({ quShu: '三', quShuFb: '相近' }))).guashi;
    expect(g.quShu).toBe('三');
    expect(g.quShuFb).toBe('相近');
  });
});
