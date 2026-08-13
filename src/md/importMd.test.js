/**
 * md 导入模块测试（Task 8）
 * 验证 mdToGuashi 三层格式解析：
 *   front matter 逐行键值 / 双引号值反转义 / tags 数组拆分 / 缺省值与必填校验
 *   起卦参数 `方法名|输入值|时间` → method + params（与 exportMd 序列化严格对称）
 *   正文按 ## 节名提取；盘面节丢弃（panSnapshot 留空由 UI 层生成）
 */
import { describe, expect, test } from 'vitest';
import { guashiToMd } from './exportMd.js';
import { mdToGuashi } from './importMd.js';
import { paipan } from '../engine/paipan.js';

/** 真实盘面（仅用于导出端构造完整 md，导入端断言 panSnapshot 留空） */
const snap = paipan({
  method: 'qian',
  params: { lines: '111111', dong: [0, 2] },
  date: new Date(2026, 7, 4, 10, 30),
});

/** 构造符合 guashi 字段设计的卦例（Task 6 结构；params 用对象以保证往返无损） */
function makeGuashi(overrides = {}) {
  return {
    title: '占测今日出行',
    date: '2026-08-04',
    method: 'qian',
    params: { lines: '211111' },
    panSnapshot: snap,
    duanyu: '出行顺利',
    yingqi: '明日',
    jixiong: '吉',
    beizhu: '记得带伞',
    fankui: '已顺利到达',
    status: '未反馈',
    jixiongOk: '对',
    yingqiOk: '',
    fangweiOk: '错',
    tags: ['出行', '等反馈'],
    ...overrides,
  };
}

describe('mdToGuashi 完整解析', () => {
  test('完整 md：全字段解析正确', () => {
    const r = mdToGuashi(guashiToMd(makeGuashi()));
    expect(r.ok).toBe(true);
    const g = r.guashi;
    expect(g.title).toBe('占测今日出行');
    expect(g.date).toBe('2026-08-04');
    expect(g.tags).toEqual(['出行', '等反馈']);
    expect(g.status).toBe('未反馈');
    expect(g.jixiong).toBe('吉');
    expect(g.jixiongOk).toBe('对');
    expect(g.yingqiOk).toBe('');
    expect(g.fangweiOk).toBe('错');
    expect(g.method).toBe('qian');
    expect(g.params).toEqual({ lines: '211111' });
    expect(g.duanyu).toBe('出行顺利');
    expect(g.yingqi).toBe('明日');
    expect(g.beizhu).toBe('记得带伞');
    expect(g.fankui).toBe('已顺利到达');
    expect(g.panSnapshot).toBeNull(); // 盘面文本不存，留空由 UI 层生成
  });

  test('缺 title → ok:false', () => {
    const r = mdToGuashi('---\ndate: 2026-08-04\n---\n\n# x');
    expect(r.ok).toBe(false);
    expect(r.error).toContain('标题');
  });

  test('title 为空（""）→ ok:false', () => {
    const r = mdToGuashi('---\ntitle: ""\n起卦参数: 钱币卦|211111|2026-08-04\n---\n\n# x');
    expect(r.ok).toBe(false);
    expect(r.error).toContain('标题');
  });

  test('缺起卦参数 → ok:false', () => {
    const r = mdToGuashi('---\ntitle: x\ndate: 2026-08-04\n---\n\n# x');
    expect(r.ok).toBe(false);
    expect(r.error).toBe('缺少起卦参数');
  });

  test('起卦参数为空 / "" → ok:false', () => {
    expect(mdToGuashi('---\ntitle: x\n起卦参数: ""\n---\n\n# x').ok).toBe(false);
    expect(mdToGuashi('---\ntitle: x\n起卦参数: \n---\n\n# x').ok).toBe(false);
  });

  test('未知方法名 → ok:false', () => {
    const r = mdToGuashi('---\ntitle: x\n起卦参数: 扫把星|123|2026-08-04\n---\n\n# x');
    expect(r.ok).toBe(false);
    expect(r.error).toContain('未知起卦方式');
  });
});

describe('mdToGuashi front matter', () => {
  test('date 缺省：front matter 缺失时回退起卦参数时间段，再缺为空串', () => {
    const g = mdToGuashi('---\ntitle: 测\n起卦参数: 钱币卦|211111|2026-08-04\n---\n\n# 测').guashi;
    expect(g.date).toBe('2026-08-04'); // 回退起卦参数时间段（确定性，不取当前日期）
    const g2 = mdToGuashi('---\ntitle: 测\n起卦参数: 钱币卦|211111|\n---\n\n# 测').guashi;
    expect(g2.date).toBe('');
  });

  test('status 缺省未反馈；吉凶/对错/备注缺省空串；tags 缺省 []', () => {
    const g = mdToGuashi('---\ntitle: 测\n起卦参数: 钱币卦|211111|2026-08-04\n---\n\n# 测').guashi;
    expect(g.status).toBe('未反馈');
    expect(g.jixiong).toBe('');
    expect(g.jixiongOk).toBe('');
    expect(g.yingqiOk).toBe('');
    expect(g.fangweiOk).toBe('');
    expect(g.tags).toEqual([]);
  });

  test('v1.3.0 取数/取数反馈缺省空串（旧 md 兼容）；导出往返无损', () => {
    const g = mdToGuashi('---\ntitle: 测\n起卦参数: 钱币卦|211111|2026-08-04\n---\n\n# 测').guashi;
    expect(g.quShu).toBe('');
    expect(g.quShuFb).toBe('');
    // 导出 → 导入往返（含三档「错」，验证原「甚远」改「错」后的取值）
    const rec = makeGuashi({ quShu: '三', quShuFb: '错' });
    const g2 = mdToGuashi(guashiToMd(rec)).guashi;
    expect(g2.quShu).toBe('三');
    expect(g2.quShuFb).toBe('错');
  });

  test('双引号包裹值反转义：反斜杠 / 双引号 / # / YAML 关键字 / 冒号 往返无损', () => {
    const rec = makeGuashi({
      title: '出行 #注意',
      date: 'a\\b',
      status: 'null',
      jixiong: 'a:b',
      tags: ['yes', '真', '#tag'],
    });
    const g = mdToGuashi(guashiToMd(rec)).guashi;
    expect(g.title).toBe('出行 #注意');
    expect(g.date).toBe('a\\b');
    expect(g.status).toBe('null');
    expect(g.jixiong).toBe('a:b');
    expect(g.tags).toEqual(['yes', '真', '#tag']);
  });

  test('值内含双引号字符往返无损', () => {
    const rec = makeGuashi({ title: '他说"吉"', jixiong: 'a"b' });
    const g = mdToGuashi(guashiToMd(rec)).guashi;
    expect(g.title).toBe('他说"吉"');
    expect(g.jixiong).toBe('a"b');
  });

  test('tags 解析：空数组 / 逗号 tag / 逗号+空格分隔两个 tag', () => {
    const md = '---\ntitle: x\n起卦参数: 钱币卦|211111|2026-08-04\ntags: []\n---\n\n# x';
    expect(mdToGuashi(md).guashi.tags).toEqual([]);
    const md2 = '---\ntitle: x\n起卦参数: 钱币卦|211111|2026-08-04\ntags: [a,b]\n---\n\n# x';
    expect(mdToGuashi(md2).guashi.tags).toEqual(['a,b']); // 逗号后无空格 → 单 tag
    const md3 = '---\ntitle: x\n起卦参数: 钱币卦|211111|2026-08-04\ntags: [a, b]\n---\n\n# x';
    expect(mdToGuashi(md3).guashi.tags).toEqual(['a', 'b']);
    // 逗号 tag + 普通 tag 混合（导出输出 [a,b, c]）
    const md4 = '---\ntitle: x\n起卦参数: 钱币卦|211111|2026-08-04\ntags: [a,b, c]\n---\n\n# x';
    expect(mdToGuashi(md4).guashi.tags).toEqual(['a,b', 'c']);
  });

  test('引号包裹的 tag 内部逗号不拆分（# tag 含逗号往返无损）', () => {
    const rec = makeGuashi({ tags: ['a#, b', 'c'] });
    const g = mdToGuashi(guashiToMd(rec)).guashi;
    expect(g.tags).toEqual(['a#, b', 'c']);
  });

  test('标签顺序无关（手写 md 乱序也可解析）', () => {
    const md = '---\nstatus: 已反馈\n起卦参数: 钱币卦|211111|2026-08-04\ntitle: 乱序\n吉凶: 凶\n---\n\n# 乱序';
    const g = mdToGuashi(md).guashi;
    expect(g.title).toBe('乱序');
    expect(g.status).toBe('已反馈');
    expect(g.jixiong).toBe('凶');
  });
});

describe('mdToGuashi 起卦参数', () => {
  test('各方法 params 往返无损（与 exportMd 序列化对称）', () => {
    const cases = [
      ['qian', { lines: '211111' }],
      ['qian', { lines: '222211', dong: [1, 4] }], // F1：动爻随 md 往返
      ['yaoming', { lines: '311111' }],
      ['guaname', { input: '天风姤' }],
      ['guaname', { lines: '211111' }], // 爻画输入：导出以 lines 序列化，导入还原为 lines
      ['number', { n1: 1, n2: 2, n3: 3 }],
      ['number', { n1: 1, n2: 2, n3: 3, method: 2 }],
      ['baoshu', { digits: '3412' }],
      ['time', { date: '2026-08-04 14:30' }],
      ['computer', { lines: '111111' }],
      ['computer', { lines: '111111', dong: [0, 2] }], // F1
    ];
    for (const [method, params] of cases) {
      const g = mdToGuashi(guashiToMd(makeGuashi({ method, params }))).guashi;
      expect(g.method).toBe(method);
      expect(g.params).toEqual(params);
    }
  });

  test('旧格式兼容（F1）：无动爻 md 导入不报错且不落 dong 字段', () => {
    const md = '---\ntitle: x\n起卦参数: 钱币卦|222211|2026-08-04\n---\n\n# x';
    const g = mdToGuashi(md).guashi;
    expect(g.params).toEqual({ lines: '222211' }); // 无 dong 字段
    // 重排盘：无动爻 → 无变卦
    const pan = paipan({ method: 'qian', params: g.params, date: new Date(2026, 7, 4) });
    expect(pan.bian).toBeNull();
  });

  test('钱币卦带动爻导入后重排盘变卦保留（F1 主场景）', () => {
    // 风地观 222211，二、五爻动 → 变卦应为山水蒙
    const md = '---\ntitle: x\n起卦参数: 钱币卦|222211,1,4|2026-08-04\n---\n\n# x';
    const g = mdToGuashi(md).guashi;
    expect(g.params).toEqual({ lines: '222211', dong: [1, 4] });
    const pan = paipan({ method: 'qian', params: g.params, date: new Date(2026, 7, 4) });
    expect(pan.bian).not.toBeNull();
    expect(pan.bian.name).toBe('山水蒙');
    // 电脑卦同理
    const md2 = '---\ntitle: y\n起卦参数: 电脑卦|111111,0,2|2026-08-04\n---\n\n# y';
    const g2 = mdToGuashi(md2).guashi;
    const pan2 = paipan({ method: 'computer', params: g2.params, date: new Date(2026, 7, 4) });
    expect(pan2.bian.name).toBe('天水讼'); // 乾为天 初、三爻动 → 212111
  });

  test('动爻段容错：尾逗号/空段/非 0-5 整数一律丢弃，不误判 dong', () => {
    const mk = (input) => mdToGuashi(`---\ntitle: x\n起卦参数: 钱币卦|${input}|2026-08-04\n---\n\n# x`).guashi.params;
    expect(mk('211111,')).toEqual({ lines: '211111' }); // 尾逗号不误判 dong=[0]
    expect(mk('211111,2,')).toEqual({ lines: '211111', dong: [2] }); // 空段丢弃
    expect(mk('211111,9,x,2')).toEqual({ lines: '211111', dong: [2] }); // 越界/非数字丢弃
  });

  test('已知方法 id 直接写入也接受（导出端未知 id 原样输出的对称容错）', () => {
    const md = '---\ntitle: x\n起卦参数: qian|211111|2026-08-04\n---\n\n# x';
    const g = mdToGuashi(md).guashi;
    expect(g.method).toBe('qian');
    expect(g.params).toEqual({ lines: '211111' });
  });

  test('简报示例：数字卦单数输入 lenient 解析', () => {
    const md = '---\ntitle: a\n起卦参数: 数字卦|123|2026-08-04\n---\n\n# a';
    const g = mdToGuashi(md).guashi;
    expect(g.method).toBe('number');
    expect(g.params).toEqual({ n1: 123 });
  });

  test('空输入值容错：缺段/空段不报错，空段省略', () => {
    const g = mdToGuashi('---\ntitle: x\n起卦参数: 数字卦||2026-08-04\n---\n\n# x').guashi;
    expect(g.params).toEqual({});
    const g2 = mdToGuashi('---\ntitle: x\n起卦参数: 数字卦|1,,3|2026-08-04\n---\n\n# x').guashi;
    expect(g2.params).toEqual({ n1: 1, n3: 3 });
  });

  test('起卦参数按前两个 | 拆为三段（多余段并入时间段，容错）', () => {
    // 无 front matter date 时，date 回退起卦参数时间段（含多余 | 段）
    const md = '---\ntitle: x\n起卦参数: 钱币卦|211111|2026-08-04|14:30\n---\n\n# x';
    const g = mdToGuashi(md).guashi;
    expect(g.params).toEqual({ lines: '211111' });
    expect(g.date).toBe('2026-08-04|14:30');
    // 时间段含时刻（冒号）时优先于 front matter date（见 F1：保住起卦时刻）
    const md2 = '---\ntitle: x\ndate: 2026-08-04\n起卦参数: 钱币卦|211111|2026-08-04|14:30\n---\n\n# x';
    expect(mdToGuashi(md2).guashi.date).toBe('2026-08-04|14:30');
  });

  test('字符串 params 的起卦时刻保留（F1：导出端主力形态 round-trip）', () => {
    // 官方示例形态：字符串 params 自带 14:30，front matter date 仅日期粒度
    const rec = makeGuashi({ params: '211111|2026-08-04 14:30' });
    const g = mdToGuashi(guashiToMd(rec)).guashi;
    expect(g.date).toBe('2026-08-04 14:30'); // 时刻不丢失
    expect(g.method).toBe('qian');
    expect(g.params).toEqual({ lines: '211111' });
    // 重新导出仍保留时刻（不退化回 2026-08-04）
    const md2 = guashiToMd(g);
    expect(md2).toContain('起卦参数: 钱币卦|211111|2026-08-04 14:30');
    // 二次导入稳定
    expect(mdToGuashi(md2).guashi.date).toBe('2026-08-04 14:30');
  });

  test('数字卦非数字段兜底为 undefined（M5：NaN 不落 params）', () => {
    const g = mdToGuashi('---\ntitle: x\n起卦参数: 数字卦|1,2,x|2026-08-04\n---\n\n# x').guashi;
    expect(g.params).toEqual({ n1: 1, n2: 2 });
  });
});

describe('mdToGuashi 正文', () => {
  test('正文缺节容错：只有断语节的 md', () => {
    const md =
      '---\ntitle: a\ndate: 2026-08-04\ntags: [占病]\nstatus: 未反馈\n吉凶: \n吉凶对错: \n应期对错: \n方位对错: \n起卦参数: 数字卦|123|2026-08-04\n---\n\n# a\n\n## 断语\n测试';
    const r = mdToGuashi(md);
    expect(r.ok).toBe(true);
    expect(r.guashi.duanyu).toBe('测试');
    expect(r.guashi.yingqi).toBe('');
    expect(r.guashi.beizhu).toBe('');
    expect(r.guashi.fankui).toBe('');
  });

  test('多行正文保留内部换行（trim 首尾空行）', () => {
    const md =
      '---\ntitle: x\n起卦参数: 钱币卦|211111|2026-08-04\n---\n\n# x\n\n## 断语\n第一句\n第二句\n\n## 应期\n\n三天后\n';
    const g = mdToGuashi(md).guashi;
    expect(g.duanyu).toBe('第一句\n第二句');
    expect(g.yingqi).toBe('三天后');
  });

  test('未知 ## 行视为正文内容，不截断当前节', () => {
    const md =
      '---\ntitle: x\n起卦参数: 钱币卦|211111|2026-08-04\n---\n\n# x\n\n## 断语\n前面\n## 补充说明\n后面\n';
    const g = mdToGuashi(md).guashi;
    expect(g.duanyu).toBe('前面\n## 补充说明\n后面');
  });

  test('盘面节内容被丢弃', () => {
    const md = '---\ntitle: x\n起卦参数: 钱币卦|211111|2026-08-04\n---\n\n# x\n\n## 盘面\n本卦：乾为天\n随便写的盘面内容\n\n## 断语\n测试';
    const g = mdToGuashi(md).guashi;
    expect(g.duanyu).toBe('测试');
    expect(g.panSnapshot).toBeNull();
  });
});

describe('mdToGuashi 往返（导出 → 导入）', () => {
  test('真实卦例 round-trip：关键字段一致', () => {
    const rec = makeGuashi();
    const g = mdToGuashi(guashiToMd(rec)).guashi;
    expect(g.title).toBe(rec.title);
    expect(g.date).toBe(rec.date);
    expect(g.status).toBe(rec.status);
    expect(g.jixiong).toBe(rec.jixiong);
    expect(g.jixiongOk).toBe(rec.jixiongOk);
    expect(g.yingqiOk).toBe(rec.yingqiOk);
    expect(g.fangweiOk).toBe(rec.fangweiOk);
    expect(g.tags).toEqual(rec.tags);
    expect(g.method).toBe(rec.method);
    expect(g.params).toEqual(rec.params);
    expect(g.duanyu).toBe(rec.duanyu);
    expect(g.yingqi).toBe(rec.yingqi);
    expect(g.beizhu).toBe(rec.beizhu);
    expect(g.fankui).toBe(rec.fankui);
  });

  test('已反馈卦例 + 特殊字符全文 round-trip', () => {
    const rec = makeGuashi({
      title: '测#\\"子 出行',
      status: '已反馈',
      jixiong: '凶',
      jixiongOk: '错',
      yingqiOk: '对',
      fangweiOk: '',
      tags: ['a,b', 'x:y', ''],
      duanyu: '注意 #1\n甲：小心',
      yingqi: '本周五',
      beizhu: '无',
      fankui: '未应验\\记录',
    });
    const g = mdToGuashi(guashiToMd(rec)).guashi;
    expect(g.title).toBe(rec.title);
    expect(g.status).toBe(rec.status);
    expect(g.jixiong).toBe(rec.jixiong);
    expect(g.jixiongOk).toBe(rec.jixiongOk);
    expect(g.yingqiOk).toBe(rec.yingqiOk);
    expect(g.fangweiOk).toBe(rec.fangweiOk);
    expect(g.tags).toEqual(rec.tags);
    expect(g.duanyu).toBe(rec.duanyu);
    expect(g.yingqi).toBe(rec.yingqi);
    expect(g.beizhu).toBe(rec.beizhu);
    expect(g.fankui).toBe(rec.fankui);
  });
});

describe('mdToGuashi v0.2 新节（涂鸦/背景/笔记）', () => {
  test('涂鸦节：json 元数据块还原 doodle；图片行不干扰解析', () => {
    const doodle = {
      version: 1, width: 600, height: 400,
      elements: [
        { type: 'pen', color: '#e74c3c', width: 4, points: [{ x: 10, y: 20 }, { x: 30, y: 40 }] },
        { type: 'text', x: 120, y: 90, text: '测卦', size: 20, color: '#e74c3c' },
      ],
    };
    const g = mdToGuashi(guashiToMd(makeGuashi({ doodle }))).guashi;
    expect(g.doodle).toEqual(doodle);
    expect(g.duanyu).toBe('出行顺利'); // 涂鸦节不污染断语
  });

  test('v1.2.0 双涂鸦节：电脑/手机分别还原到 doodle/doodleMobile', () => {
    const doodle = { version: 1, width: 600, height: 400, elements: [{ type: 'pen', color: '#e74c3c', width: 4, points: [{ x: 1, y: 2 }] }] };
    const doodleMobile = { version: 1, width: 400, height: 300, elements: [{ type: 'text', x: 5, y: 6, size: 16, color: '#3498db', text: '手机批注' }] };
    const g = mdToGuashi(guashiToMd(makeGuashi({ doodle, doodleMobile }))).guashi;
    expect(g.doodle).toEqual(doodle);
    expect(g.doodleMobile).toEqual(doodleMobile);
  });

  test('v1.2.0 旧 md 单「涂鸦」节 → doodle（电脑），doodleMobile 为 null（向后兼容）', () => {
    const doodle = { version: 1, width: 600, height: 400, elements: [{ type: 'pen', color: '#e74c3c', width: 4, points: [{ x: 1, y: 2 }] }] };
    const md = guashiToMd(makeGuashi({ doodle }))
      .replace('## 涂鸦（电脑）', '## 涂鸦')
      .replace('![涂鸦（电脑）](', '![涂鸦](');
    const g = mdToGuashi(md).guashi;
    expect(g.doodle).toEqual(doodle);
    expect(g.doodleMobile).toBeNull();
  });

  test('背景节/笔记节：background 还原；「笔记」与「备注」均映射 beizhu', () => {
    const g = mdToGuashi(guashiToMd(makeGuashi({ background: '占测出差', beizhu: '记得带伞' }))).guashi;
    expect(g.background).toBe('占测出差');
    expect(g.beizhu).toBe('记得带伞');
    // 手写 md 用「笔记」节名 → beizhu
    const md = '---\ntitle: x\n起卦参数: 钱币卦|211111|2026-08-04\n---\n\n# x\n\n## 笔记\n手写笔记内容\n';
    expect(mdToGuashi(md).guashi.beizhu).toBe('手写笔记内容');
    // 旧 md 用「备注」节名 → beizhu（向后兼容）
    const mdOld = '---\ntitle: x\n起卦参数: 钱币卦|211111|2026-08-04\n---\n\n# x\n\n## 备注\n旧版备注\n';
    expect(mdToGuashi(mdOld).guashi.beizhu).toBe('旧版备注');
  });

  test('旧 md（无新节）导入不崩：background 默认空串、doodle 默认 null', () => {
    const oldMd = '---\ntitle: x\n起卦参数: 钱币卦|211111|2026-08-04\n---\n\n# x\n\n## 断语\n测试';
    const g = mdToGuashi(oldMd).guashi;
    expect(g.ok !== false).toBe(true);
    expect(g.background).toBe('');
    expect(g.doodle).toBeNull();
    expect(g.duanyu).toBe('测试');
  });

  test('涂鸦节 json 解析失败 → doodle 置 null，其余字段正常（不阻断导入）', () => {
    const md =
      '---\ntitle: x\n起卦参数: 钱币卦|211111|2026-08-04\n---\n\n# x\n\n## 涂鸦\n![涂鸦](data:image/svg+xml;utf8,xxx)\n\n```json\n{ 这不是合法 JSON }\n```\n\n## 断语\n正常断语';
    const g = mdToGuashi(md).guashi;
    expect(g.doodle).toBeNull();
    expect(g.duanyu).toBe('正常断语');
  });

  test('新 md 被旧版解析器不崩（仅丢新字段）：新节对旧节解析无副作用', () => {
    // 模拟旧版解析器只认 盘面/断语/应期/备注/反馈 五个节：
    // 涂鸦/背景/笔记 视为未知节 → 被并入 buffer 丢弃，旧字段全部保留
    const md = guashiToMd(makeGuashi({
      background: '背景内容',
      beizhu: '备注内容',
      doodle: { version: 1, width: 600, height: 400, elements: [{ type: 'line', x1: 0, y1: 0, x2: 1, y2: 1, color: '#fff', strokeWidth: 3 }] },
      duanyu: '断语内容',
      fankui: '反馈内容',
    }));
    const r = mdToGuashi(md); // 新解析器完整还原
    expect(r.ok).toBe(true);
    expect(r.guashi.background).toBe('背景内容');
    expect(r.guashi.beizhu).toBe('备注内容');
    expect(r.guashi.doodle).not.toBeNull();
    expect(r.guashi.duanyu).toBe('断语内容');
    expect(r.guashi.fankui).toBe('反馈内容');
    expect(r.guashi.yingqi).toBe('明日');
  });

  test('v0.2 全字段 round-trip：涂鸦+背景+笔记 往返无损', () => {
    const rec = makeGuashi({
      background: '起卦背景：问事业',
      beizhu: '笔记：下月再看',
      doodle: {
        version: 1, width: 320, height: 240,
        elements: [
          { type: 'arrow', x1: 0, y1: 0, x2: 100, y2: 100, color: '#3498db', strokeWidth: 6 },
          { type: 'rect', x: 10, y: 10, w: 40, h: 20, color: '#2ecc71', strokeWidth: 2, fill: true },
        ],
      },
    });
    const g = mdToGuashi(guashiToMd(rec)).guashi;
    expect(g.background).toBe(rec.background);
    expect(g.beizhu).toBe(rec.beizhu);
    expect(g.doodle).toEqual(rec.doodle);
  });
});

describe('mdToGuashi 用神（v0.2 功能 I）', () => {
  test('快照带用神导出 md → 导入还原 guashi.yongShen（六亲）', () => {
    const rec = makeGuashi({
      panSnapshot: { ...snap, yongShen: { type: 'liuqin', value: '财' } },
    });
    const md = guashiToMd(rec);
    expect(md).toContain('用神：六亲 财');
    const g = mdToGuashi(md).guashi;
    expect(g.yongShen).toEqual({ type: 'liuqin', value: '财' });
  });

  test('快照带用神导出 md → 导入还原 guashi.yongShen（地支）', () => {
    const rec = makeGuashi({
      panSnapshot: { ...snap, yongShen: { type: 'zhi', value: '寅' } },
    });
    const md = guashiToMd(rec);
    expect(md).toContain('用神：地支 寅');
    const g = mdToGuashi(md).guashi;
    expect(g.yongShen).toEqual({ type: 'zhi', value: '寅' });
  });

  test('旧 md（无盘面用神行）→ yongShen 为 null（向后兼容）', () => {
    const g = mdToGuashi('---\ntitle: x\n起卦参数: 钱币卦|211111|2026-08-04\n---\n\n# x\n\n## 盘面\n本卦：乾为天\n\n## 断语\n测试').guashi;
    expect(g.yongShen).toBeNull();
    expect(g.duanyu).toBe('测试');
  });

  test('手写 md 盘面含用神行也可解析（与 paipan yongShen 参数同构）', () => {
    const md =
      '---\ntitle: x\n起卦参数: 钱币卦|211111|2026-08-04\n---\n\n# x\n\n## 盘面\n本卦：乾为天\n用神：六亲 父\n\n## 断语\n测试';
    const g = mdToGuashi(md).guashi;
    expect(g.yongShen).toEqual({ type: 'liuqin', value: '父' });
  });

  test('用神参与重排：导入后 paipan 传 yongShen 得盘面带用神高亮', () => {
    const rec = makeGuashi({
      panSnapshot: { ...snap, yongShen: { type: 'liuqin', value: '财' } },
    });
    const g = mdToGuashi(guashiToMd(rec)).guashi;
    const pan = paipan({
      method: g.method,
      params: g.params,
      date: new Date(2026, 7, 4, 10, 30),
      yongShen: g.yongShen,
    });
    expect(pan.yongShen).toEqual({ type: 'liuqin', value: '财' });
  });
});

describe('mdToGuashi 创建/最后编辑（v0.10 改进建7 #3）', () => {
  test('盘面 head 行「创建/最后编辑」→ createdAt/updatedAt（YYYY-MM-DD HH:mm → 时间戳）', () => {
    // 本地时间 Date（fmtTs 按本地时区，避免 UTC 构造时区漂移）
    const created = new Date(2026, 7, 8, 9, 0).getTime();
    const updated = new Date(2026, 7, 8, 10, 30).getTime();
    const md = guashiToMd(makeGuashi({ createdAt: created, updatedAt: updated }));
    const g = mdToGuashi(md).guashi;
    expect(g.createdAt).toBe(created);
    expect(g.updatedAt).toBe(updated);
  });

  test('仅创建（date 回退）→ createdAt 落字段、updatedAt 不落', () => {
    const created = new Date(2026, 7, 8, 9, 0).getTime();
    const md = guashiToMd(makeGuashi({ createdAt: created }));
    const g = mdToGuashi(md).guashi;
    expect(g.createdAt).toBe(created);
    expect('updatedAt' in g).toBe(false);
  });

  test('缺失（旧 md 无创建/最后编辑行）→ createdAt/updatedAt 不落字段（向后兼容，仓储默认补齐）', () => {
    const g = mdToGuashi('---\ntitle: 旧卦例\ndate: 2026-08-04\n起卦参数: 钱币卦|211111|2026-08-04\n---\n\n# 旧卦例\n\n## 盘面\n本卦：天风姤（乾宫）\n\n## 断语\n测试').guashi;
    expect('createdAt' in g).toBe(false);
    expect('updatedAt' in g).toBe(false);
  });

  test('手写 md 盘面含创建/最后编辑行也可解析', () => {
    const md =
      '---\ntitle: x\n起卦参数: 钱币卦|211111|2026-08-04\n---\n\n# x\n\n## 盘面\n本卦：乾为天（乾宫）\n创建：2026-08-08 09:00　最后编辑：2026-08-08 10:30\n\n## 断语\n测试';
    const g = mdToGuashi(md).guashi;
    expect(g.createdAt).toBe(new Date(2026, 7, 8, 9, 0).getTime());
    expect(g.updatedAt).toBe(new Date(2026, 7, 8, 10, 30).getTime());
  });
});
