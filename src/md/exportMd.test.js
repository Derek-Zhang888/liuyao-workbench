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
    // v0.10 建议4 #9：列序改为 五行→爻画→世应，删除旺衰
    expect(md).toContain('| 六神 | 六亲 | 地支 | 五行 | 爻画 | 世应 |');
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
    // 列序改为 五行|爻画|世应（删除旺衰）
    expect(md).toContain('| 青龙 | 父母 | 辰 | 土 | 1● | 应 |'); // 三爻：应位 + 动爻
    expect(md).toContain('| 螣蛇 | 父母 | 戌 | 土 | 1 | 世 |'); // 上爻：世位
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
