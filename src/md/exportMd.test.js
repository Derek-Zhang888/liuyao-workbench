/**
 * md 导出模块测试（Task 7）
 * 验证 guashiToMd 三层格式输出：
 *   front matter（顺序固定）/ 标题 / 正文（盘面·断语·应期·备注·反馈）
 * 起卦参数格式契约：`方法名|输入值|时间`（导入端 Task 8 按同规则解析）
 * params 对象序列化规则：
 *   qian/yaoming/guaname/computer → 主值（lines/input）
 *   baoshu → digits；fenmiao → ms,ss；number → n1,n2,n3（method=2 时追加 ,m2）
 *   time/shike → 时间（Date 或 ISO 字符串）
 * 时间回退：字符串 params 自带 | 后段；对象取 params.date/time；否则 guashi.date
 */
import { describe, expect, test } from 'vitest';
import { guashiToMd } from './exportMd.js';
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

describe('guashiToMd 三层格式', () => {
  test('完整卦例：front matter 字段齐全且顺序固定', () => {
    const fm = frontMatter(guashiToMd(makeGuashi()));
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
    expect(md).toContain('---\ntitle: 占测今日出行');
    expect(md).toContain('起卦参数: 钱币卦|211111|2026-08-04 14:30');
    expect(md).toContain('# 占测今日出行');
    expect(md).toContain('## 断语');
    expect(md).toContain('## 应期');
    expect(md).toContain('## 备注');
    expect(md).toContain('## 反馈');
  });

  test('tags 数组转 [tag1, tag2] 格式；空 tags 输出 []', () => {
    expect(guashiToMd(makeGuashi())).toContain('tags: [出行, 等反馈]');
    expect(guashiToMd(makeGuashi({ tags: [] }))).toContain('tags: []');
  });

  test('空字段输出 ""（YAML 可解析）；空断语留空行', () => {
    const md = guashiToMd(makeGuashi({ title: '', jixiong: '', jixiongOk: '', beizhu: '', duanyu: '' }));
    expect(md).toContain('title: ""');
    expect(md).toContain('吉凶: ""');
    expect(md).toContain('吉凶对错: ""');
    expect(md).toContain('## 断语\n\n');
  });

  test('盘面渲染：含本卦/变卦名与六亲表格', () => {
    const md = guashiToMd(makeGuashi());
    expect(md).toContain('## 盘面');
    expect(md).toContain(`本卦：${snap.ben.name}`);
    expect(md).toContain(`变卦：${snap.bian.name}`);
    expect(md).toContain('| 六神 | 六亲 | 地支 | 五行 | 世应 | 爻画 | 旺衰 |');
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
    expect(guashiToMd(makeGuashi())).toContain('起卦参数: 钱币卦|');
    const unknown = guashiToMd(makeGuashi({ method: 'foo', params: 'x' }));
    expect(unknown).toContain('起卦参数: foo|x|2026-08-04');
  });

  test('params 对象序列化：爻画/数字/报数/分秒/时间卦', () => {
    expect(guashiToMd(makeGuashi({ params: { lines: '211111' } }))).toContain('起卦参数: 钱币卦|211111|2026-08-04');
    expect(
      guashiToMd(makeGuashi({ method: 'number', params: { n1: 1, n2: 2, n3: 3, method: 2 } })),
    ).toContain('起卦参数: 数字卦|1,2,3,m2|2026-08-04');
    expect(guashiToMd(makeGuashi({ method: 'baoshu', params: { digits: '3412' } }))).toContain('起卦参数: 报数卦|3412|2026-08-04');
    expect(guashiToMd(makeGuashi({ method: 'fenmiao', params: { ms: 12, ss: 34 } }))).toContain('起卦参数: 分秒卦|12,34|2026-08-04');
    expect(
      guashiToMd(makeGuashi({ method: 'time', params: { date: new Date(2026, 7, 4, 14, 30) } })),
    ).toContain('起卦参数: 时间卦|2026-08-04 14:30|2026-08-04');
  });
});
