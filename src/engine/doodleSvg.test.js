/**
 * 涂鸦 SVG 序列化测试（v0.2，功能 A）
 * 验证 6 种元素 → SVG markup → data URI → JSON 还原 roundtrip：
 *   空涂鸦 / 空判定 / pen/text/rect/circle/line/arrow /
 *   metadata CDATA 内嵌原始 JSON（]]> 转义）/ encodeURIComponent 编码
 */
import { describe, expect, test } from 'vitest';
import {
  emptyDoodle,
  isEmptyDoodle,
  doodleToSvg,
  doodleToDataUri,
  doodleUndo,
  doodleRedo,
  doodleCommit,
  doodleClear,
  doodleErase,
  arrowHeadSize,
  hitTestElement,
  translateElement,
} from './doodleSvg.js';

/** 完整 6 元素涂鸦样例（schema 见 design §3.1） */
const fullDoodle = {
  version: 1,
  width: 600,
  height: 400,
  elements: [
    { type: 'pen', color: '#e74c3c', width: 4, points: [{ x: 10, y: 20 }, { x: 30, y: 40 }, { x: 50, y: 20 }] },
    { type: 'text', x: 120, y: 90, text: '测卦', size: 20, color: '#e74c3c' },
    { type: 'rect', x: 10, y: 10, w: 80, h: 50, color: '#2ecc71', strokeWidth: 3, fill: false },
    { type: 'circle', cx: 60, cy: 60, r: 30, color: '#3498db', strokeWidth: 3, fill: true },
    { type: 'line', x1: 0, y1: 0, x2: 100, y2: 100, color: '#f1c40f', strokeWidth: 3 },
    { type: 'arrow', x1: 0, y1: 100, x2: 100, y2: 0, color: '#9b59b6', strokeWidth: 3 },
  ],
};

/** 从 SVG 中提取 metadata CDATA 内的 JSON 字符串 */
function extractMetaJson(svg) {
  const m = /<metadata><!\[CDATA\[([\s\S]*?)\]\]><\/metadata>/.exec(svg);
  return m ? m[1] : null;
}

describe('emptyDoodle / isEmptyDoodle', () => {
  test('emptyDoodle 默认与自定义尺寸', () => {
    expect(emptyDoodle()).toEqual({ version: 1, width: 600, height: 400, elements: [] });
    expect(emptyDoodle(320, 480)).toEqual({ version: 1, width: 320, height: 480, elements: [] });
  });

  test('isEmptyDoodle：null / 缺 elements / 空数组 均为空', () => {
    expect(isEmptyDoodle(null)).toBe(true);
    expect(isEmptyDoodle(undefined)).toBe(true);
    expect(isEmptyDoodle({})).toBe(true);
    expect(isEmptyDoodle({ version: 1, width: 600, height: 400, elements: [] })).toBe(true);
    expect(isEmptyDoodle(fullDoodle)).toBe(false);
  });
});

describe('doodleToSvg', () => {
  test('6 种元素 → 对应 SVG 标签', () => {
    const svg = doodleToSvg(fullDoodle);
    expect(svg).toContain('<svg xmlns="http://www.w3.org/2000/svg"');
    expect(svg).toContain('viewBox="0 0 600 400"');
    expect(svg).toContain('preserveAspectRatio="xMidYMid meet"'); // 与 DoodleBoard 覆盖层同口径：等比缩放不变形
    expect(svg).toContain('<path d="M 10 20 L 30 40 L 50 20"');
    expect(svg).toContain('<text x="120" y="90" font-size="20"');
    expect(svg).toContain('测卦');
    expect(svg).toContain('<rect x="10" y="10" width="80" height="50"');
    expect(svg).toContain('fill="none"'); // rect fill=false → 外框
    expect(svg).toContain('<ellipse cx="60" cy="60" rx="30" ry="30"'); // 2026-08-10：circle → ellipse（rx=ry=r）
    expect(svg).toContain('fill="#3498db"'); // circle fill=true → 填充
    expect(svg).toContain('<line x1="0" y1="0" x2="100" y2="100"');
    expect(svg).toContain('<polygon points='); // arrow 箭头
  });

  test('metadata 内嵌原始 JSON（可逆还原源）', () => {
    const svg = doodleToSvg(fullDoodle);
    const json = extractMetaJson(svg);
    expect(json).not.toBeNull();
    expect(JSON.parse(json)).toEqual(fullDoodle);
  });

  test('文本含 XML 特殊字符转义，CDATA 内 ]] 边界安全', () => {
    const d = {
      version: 1, width: 100, height: 100,
      elements: [
        { type: 'text', x: 1, y: 2, text: 'a<b>&"c', size: 12, color: '#fff' },
      ],
    };
    const svg = doodleToSvg(d);
    expect(svg).toContain('a&lt;b&gt;&amp;&quot;c'); // 标签文本转义
    // JSON 元数据保持原始字符（CDATA 不转义），可 JSON.parse 还原
    expect(JSON.parse(extractMetaJson(svg)).elements[0].text).toBe('a<b>&"c');
  });

  test('JSON 含 ]]> 时 CDATA 拆分转义（不破坏 XML）', () => {
    const d = {
      version: 1, width: 50, height: 50,
      elements: [{ type: 'text', x: 0, y: 0, text: ']]>', size: 10, color: '#fff' }],
    };
    const svg = doodleToSvg(d);
    // CDATA 内容中出现 ]]> 被拆为 ]]]]><![CDATA[>（合法 XML）
    expect(svg).toContain(']]]]><![CDATA[>');
  });

  test('空涂鸦 → 无元素节点', () => {
    const svg = doodleToSvg(emptyDoodle());
    expect(svg).toContain('<metadata>');
    expect(svg).not.toContain('<path');
    expect(svg).not.toContain('<text');
  });

  test('null / 缺字段容错：不抛错且使用默认尺寸', () => {
    expect(doodleToSvg(null)).toContain('viewBox="0 0 600 400"');
    expect(doodleToSvg({})).toContain('viewBox="0 0 600 400"');
    expect(doodleToSvg({ width: 300 })).toContain('viewBox="0 0 300 400"');
  });
});

describe('doodleToDataUri', () => {
  test('前缀与编码正确（# 自动转 %23，URL 安全）', () => {
    const uri = doodleToDataUri(fullDoodle);
    expect(uri.startsWith('data:image/svg+xml;utf8,')).toBe(true);
    const svg = decodeURIComponent(uri.slice('data:image/svg+xml;utf8,'.length));
    expect(svg).toBe(doodleToSvg(fullDoodle));
    // 颜色 #e74c3c 在 encodeURIComponent 下编码为 %23e74c3c，不含裸 #
    expect(uri).not.toContain('#e74c3c');
  });

  test('roundtrip：dataURI → decode → metadata JSON 还原原对象', () => {
    const uri = doodleToDataUri(fullDoodle);
    const svg = decodeURIComponent(uri.split(',')[1]);
    expect(JSON.parse(extractMetaJson(svg))).toEqual(fullDoodle);
  });
});

describe('doodleUndo / doodleRedo / doodleCommit / doodleClear（v0.10 redo 栈）', () => {
  const elA = { type: 'text', x: 1, y: 2, text: 'A', size: 12, color: '#fff' };
  const elB = { type: 'line', x1: 0, y1: 0, x2: 10, y2: 10, color: '#000', strokeWidth: 3 };

  test('doodleCommit：追加元素并清空 redo 栈（新画动作使重做失效）', () => {
    const d = { version: 1, width: 600, height: 400, elements: [elA], redo: [elB] };
    const next = doodleCommit(d, elB, 600, 400);
    expect(next.elements).toEqual([elA, elB]);
    expect(next.redo).toEqual([]);
    // null 输入视为空涂鸦
    const fresh = doodleCommit(null, elA, 320, 240);
    expect(fresh.elements).toEqual([elA]);
    expect(fresh.redo).toEqual([]);
    expect(fresh.width).toBe(320);
    expect(fresh.height).toBe(240);
  });

  test('doodleUndo：弹出末元素压入 redo；无可撤销返回 null', () => {
    const d = { version: 1, width: 600, height: 400, elements: [elA, elB] };
    const u1 = doodleUndo(d);
    expect(u1.elements).toEqual([elA]);
    expect(u1.redo).toEqual([elB]);
    const u2 = doodleUndo(u1);
    expect(u2.elements).toEqual([]);
    expect(u2.redo).toEqual([elB, elA]);
    expect(doodleUndo(u2)).toBeNull(); // 已无可撤销
    expect(doodleUndo({ version: 1, elements: [] })).toBeNull();
    expect(doodleUndo(null)).toBeNull();
  });

  test('doodleRedo：从 redo 弹出末元素追加回；无 redo 返回 null', () => {
    const d = { version: 1, width: 600, height: 400, elements: [elA], redo: [elB] };
    const r = doodleRedo(d);
    expect(r.elements).toEqual([elA, elB]);
    expect(r.redo).toEqual([]);
    expect(doodleRedo(r)).toBeNull();
    expect(doodleRedo({ version: 1, elements: [] })).toBeNull();
  });

  test('撤销→重做往返：还原原始 elements，redo 栈同步', () => {
    const d = { version: 1, width: 600, height: 400, elements: [elA, elB] };
    const undone = doodleUndo(d);
    const redone = doodleRedo(undone);
    expect(redone.elements).toEqual(d.elements);
    expect(redone.redo).toEqual([]);
  });

  test('混合 redo 栈（普通元素 + 橡皮擦记录）：前进不把 erase 记录当元素追加（QA #1b）', () => {
    // 场景：画 3 元素 → 后退×2（redo=[C,B]）→ 橡皮擦删除剩余元素（redo=[C,B,{erase}]）
    const d = { version: 1, width: 600, height: 400, elements: [], redo: [elB, elA, { op: 'erase', index: 0, element: elA }] };
    // 前进：栈顶为 erase 记录 → 返回 null，不弹栈、不污染 elements
    const r = doodleRedo(d);
    expect(r).toBeNull();
    expect(d.elements).toEqual([]);
    expect(d.redo).toHaveLength(3);
    // 后退：消费栈顶 erase 记录按原位还原元素 → redo 恢复为普通元素
    const u = doodleUndo(d);
    expect(u.elements).toEqual([elA]);
    expect(u.redo).toEqual([elB, elA]);
    // 前进：弹出普通元素（elA），绝无 erase 垃圾对象
    const r2 = doodleRedo(u);
    expect(r2.elements).toEqual([elA, elA]);
    expect(r2.elements.every((e) => !(e && e.op === 'erase'))).toBe(true);
    expect(r2.redo).toEqual([elB]);
  });

  test('doodleErase（v0.10 改进建7 #1 橡皮擦）：按索引删除并记录擦除操作，后退按原位还原', () => {
    const d = { version: 1, width: 600, height: 400, elements: [elA, elB] };
    const e = doodleErase(d, 0); // 删除第一个
    expect(e.elements).toEqual([elB]);
    expect(e.redo).toEqual([{ op: 'erase', index: 0, element: elA }]); // 擦除记录（可后退还原）
    // 后退橡皮擦 → 元素按原位（索引 0）插回，redo 清空
    const u = doodleUndo(e);
    expect(u.elements).toEqual([elA, elB]);
    expect(u.redo).toEqual([]);
    // 删除中间元素 → 后退仍按原位插回
    const d3 = { version: 1, width: 600, height: 400, elements: [elA, elB, elA] };
    const e3 = doodleErase(d3, 1);
    const u3 = doodleUndo(e3);
    expect(u3.elements).toEqual([elA, elB, elA]);
    // 索引非法/越界/无元素 → null
    expect(doodleErase(d, -1)).toBeNull();
    expect(doodleErase(d, 2)).toBeNull();
    expect(doodleErase({ version: 1, elements: [] }, 0)).toBeNull();
    expect(doodleErase(null, 0)).toBeNull();
    // 保留宽度/高度等其余字段
    expect(e.width).toBe(600);
    expect(e.height).toBe(400);
  });

  test('doodleClear：清空 elements 与 redo', () => {
    const d = { version: 1, width: 600, height: 400, elements: [elA, elB], redo: [elA] };
    const c = doodleClear(d, 600, 400);
    expect(c.elements).toEqual([]);
    expect(c.redo).toEqual([]);
    const fresh = doodleClear(null, 100, 200);
    expect(fresh.elements).toEqual([]);
    expect(fresh.width).toBe(100);
    expect(fresh.height).toBe(200);
  });

  test('redo 栈不破坏序列化：doodleToSvg 元数据含 redo 可还原（导入端忽略未知字段）', () => {
    const d = { version: 1, width: 100, height: 100, elements: [elA], redo: [elB] };
    const svg = doodleToSvg(d);
    expect(JSON.parse(extractMetaJson(svg))).toEqual(d);
    expect(isEmptyDoodle(d)).toBe(false);
  });
});

describe('v0.10 改进建8 #1 箭头随粗细缩放', () => {
  test('arrowHeadSize：线宽 4 → 10（旧固定值一致）、1 → 6、30 → 75、非法 → 8', () => {
    expect(arrowHeadSize(4)).toBe(10);
    expect(arrowHeadSize(1)).toBe(6);
    expect(arrowHeadSize(30)).toBe(75);
    expect(arrowHeadSize(0)).toBe(8);
    expect(arrowHeadSize(-5)).toBe(8);
    expect(arrowHeadSize(null)).toBe(8);
    expect(arrowHeadSize(undefined)).toBe(8);
    expect(arrowHeadSize('abc')).toBe(8);
  });

  test('arrowHeadSize 单调不减：线宽越大箭头越大（全档位 1-30 无饱和平台）', () => {
    const sizes = [1, 2, 3, 4, 5, 8, 12, 16, 20, 24, 30].map(arrowHeadSize);
    for (let k = 1; k < sizes.length; k++) {
      expect(sizes[k]).toBeGreaterThanOrEqual(sizes[k - 1]);
    }
  });

  test('arrowHeadSize 低档小箭头高档大箭头明显区分（改进建9 #1：修复高档饱和）', () => {
    // 旧曲线 round(w*2.5) 上限 40：线宽 16-30 全部 40，用户实测「调粗细箭头大小不变」。
    // 新曲线上限 80：16 → 40、24 → 60、30 → 75，全程明显递增。
    expect(arrowHeadSize(16)).toBe(40);
    expect(arrowHeadSize(24)).toBe(60);
    expect(arrowHeadSize(30)).toBe(75);
    // 高档 30（75）约为低档 1（6）的 12.5 倍，肉眼可辨
    expect(arrowHeadSize(30)).toBeGreaterThan(arrowHeadSize(1) * 5);
    // 相邻两档也明显变化（旧曲线在 16-30 区间无任何变化）
    expect(arrowHeadSize(24) - arrowHeadSize(16)).toBeGreaterThanOrEqual(15);
  });

  test('箭头末端对准：line 终点回退 0.866w 进箭头三角形，polygon 尖端仍在元素终点（粗细越大回退越多）', () => {
    const mk = (strokeWidth) => ({
      version: 1, width: 600, height: 400,
      elements: [{ type: 'arrow', x1: 0, y1: 0, x2: 100, y2: 0, color: '#e74c3c', strokeWidth }],
    });
    // 水平箭头 w=4 → 回退 4·√3/2=3.464，line 终点 (96.536, 0)
    let svg = doodleToSvg(mk(4));
    let m = /<line x1="0" y1="0" x2="([\d.-]+)" y2="([\d.-]+)"/.exec(svg);
    expect(Number(m[1])).toBeCloseTo(100 - (4 * Math.sqrt(3)) / 2, 5);
    expect(Number(m[2])).toBeCloseTo(0, 5);
    expect(svg).toContain('<polygon points="100,0'); // 尖端保持在元素终点
    // w=30 → 回退 25.98，line 终点 (74.02, 0)
    svg = doodleToSvg(mk(30));
    m = /<line x1="0" y1="0" x2="([\d.-]+)" y2="([\d.-]+)"/.exec(svg);
    expect(Number(m[1])).toBeCloseTo(100 - (30 * Math.sqrt(3)) / 2, 5);
    // 斜向箭头回退方向与线方向一致（45° 线：x/y 各回退 shrink/√2）
    const d45 = { version: 1, width: 600, height: 400, elements: [{ type: 'arrow', x1: 0, y1: 0, x2: 100, y2: 100, color: '#e74c3c', strokeWidth: 10 }] };
    const s45 = doodleToSvg(d45);
    const m45 = /<line x1="0" y1="0" x2="([\d.-]+)" y2="([\d.-]+)"/.exec(s45);
    const exp = 100 - ((10 * Math.sqrt(3)) / 2) * Math.SQRT1_2;
    expect(Number(m45[1])).toBeCloseTo(exp, 5);
    expect(Number(m45[2])).toBeCloseTo(exp, 5);
  });

  test('doodleToSvg：粗线箭头头部多边形大于细线（序列化端与画板同步）', () => {
    const mk = (strokeWidth) => ({
      version: 1, width: 100, height: 100,
      elements: [{ type: 'arrow', x1: 0, y1: 0, x2: 100, y2: 0, color: '#000', strokeWidth }],
    });
    const thin = doodleToSvg(mk(1));
    const thick = doodleToSvg(mk(30));
    const pointsOf = (svg) => {
      const m = /<polygon points="([\d.,\s-]+)"/.exec(svg);
      return m ? m[1].trim() : '';
    };
    const thinPts = pointsOf(thin);
    const thickPts = pointsOf(thick);
    expect(thinPts).not.toBe('');
    expect(thickPts).not.toBe('');
    // 多边形顶点坐标之差的绝对值（箭头边长）粗线 > 细线
    const span = (pts) => {
      const nums = pts.split(/[\s,]+/).map(Number);
      return Math.max(...nums) - Math.min(...nums);
    };
    expect(span(thickPts)).toBeGreaterThan(span(thinPts));
    // 默认线宽（缺失）也输出箭头，且尺寸取 arrowHeadSize 默认
    expect(doodleToSvg(mk(undefined))).toContain('<polygon points=');
  });
});

describe('hitTestElement 命中检测（2026-08-10 鼠标拖动）', () => {
  const pt = (x, y) => ({ x, y });

  test('pen：折线上点命中、远离不命中', () => {
    const el = { type: 'pen', width: 4, points: [{ x: 100, y: 100 }, { x: 200, y: 200 }] };
    expect(hitTestElement(el, pt(150, 150))).toBe(true);
    expect(hitTestElement(el, pt(100, 100))).toBe(true);
    expect(hitTestElement(el, pt(150, 100))).toBe(false);
  });

  test('pen：单点元素容差内命中', () => {
    const el = { type: 'pen', width: 4, points: [{ x: 100, y: 100 }] };
    expect(hitTestElement(el, pt(103, 102))).toBe(true);
    expect(hitTestElement(el, pt(120, 120))).toBe(false);
  });

  test('text：文本框内命中、框外不命中', () => {
    const el = { type: 'text', x: 50, y: 100, size: 20, text: 'liuyao' };
    expect(hitTestElement(el, pt(60, 100))).toBe(true);
    expect(hitTestElement(el, pt(100, 92))).toBe(true);
    expect(hitTestElement(el, pt(200, 100))).toBe(false);
  });

  test('rect：内部命中、外部不命中', () => {
    const el = { type: 'rect', x: 50, y: 50, w: 100, h: 60, strokeWidth: 4 };
    expect(hitTestElement(el, pt(100, 80))).toBe(true);
    expect(hitTestElement(el, pt(50, 50))).toBe(true);
    expect(hitTestElement(el, pt(160, 120))).toBe(false);
  });

  test('circle：圆内命中、圆外不命中', () => {
    const el = { type: 'circle', cx: 100, cy: 100, r: 30, strokeWidth: 4 };
    expect(hitTestElement(el, pt(100, 100))).toBe(true);
    expect(hitTestElement(el, pt(125, 100))).toBe(true);
    expect(hitTestElement(el, pt(140, 100))).toBe(false);
  });

  test('line/arrow：线段上命中、远离不命中', () => {
    for (const type of ['line', 'arrow']) {
      const el = { type, x1: 0, y1: 0, x2: 100, y2: 0, strokeWidth: 4 };
      expect(hitTestElement(el, pt(50, 0))).toBe(true);
      expect(hitTestElement(el, pt(50, 6))).toBe(true);
      expect(hitTestElement(el, pt(50, 30))).toBe(false);
    }
  });
});

describe('translateElement 平移（2026-08-10 鼠标拖动）', () => {
  test('pen：全部 points 平移，不改原对象', () => {
    const el = { type: 'pen', width: 4, points: [{ x: 1, y: 2 }, { x: 3, y: 4 }] };
    const next = translateElement(el, 10, 20);
    expect(next.points).toEqual([{ x: 11, y: 22 }, { x: 13, y: 24 }]);
    expect(el.points[0]).toEqual({ x: 1, y: 2 });
    expect(next).not.toBe(el);
  });

  test('text/rect：x,y 平移', () => {
    expect(translateElement({ type: 'text', x: 5, y: 6 }, 3, -2)).toMatchObject({ x: 8, y: 4 });
    expect(translateElement({ type: 'rect', x: 5, y: 6, w: 10, h: 10 }, -1, 1)).toMatchObject({ x: 4, y: 7, w: 10, h: 10 });
  });

  test('circle：cx,cy 平移', () => {
    expect(translateElement({ type: 'circle', cx: 5, cy: 6, r: 10 }, 2, 3)).toMatchObject({ cx: 7, cy: 9, r: 10 });
  });

  test('line/arrow：两端点平移', () => {
    expect(translateElement({ type: 'arrow', x1: 0, y1: 0, x2: 10, y2: 20 }, 5, 5)).toMatchObject({ x1: 5, y1: 5, x2: 15, y2: 25 });
  });

  test('零位移返回等价对象', () => {
    expect(translateElement({ type: 'line', x1: 1, y1: 2, x2: 3, y2: 4 }, 0, 0)).toMatchObject({ x1: 1, y1: 2, x2: 3, y2: 4 });
  });
});


describe('circle 椭圆命中与序列化（2026-08-10）', () => {
  const pt = (x, y) => ({ x, y });

  test('椭圆（rx≠ry）：按椭圆方程命中', () => {
    const el = { type: 'circle', cx: 100, cy: 100, rx: 60, ry: 20, strokeWidth: 4 };
    expect(hitTestElement(el, pt(150, 100))).toBe(true); // 水平 rx 内
    expect(hitTestElement(el, pt(100, 115))).toBe(true); // 垂直 ry 内
    expect(hitTestElement(el, pt(170, 100))).toBe(false); // 超出 rx（距圆心 70 > 60+容差）
  });

  test('旋转 90°：长轴转垂直，水平方向变窄', () => {
    const el = { type: 'circle', cx: 100, cy: 100, rx: 60, ry: 20, rotation: 90, strokeWidth: 4 };
    expect(hitTestElement(el, pt(100, 150))).toBe(true); // 旋转后长轴在垂直方向
    expect(hitTestElement(el, pt(150, 100))).toBe(false); // 水平方向超出窄轴（60→20）
  });

  test('带 rx/ry/rotation：序列化为 ellipse + transform', () => {
    const d = { version: 1, width: 600, height: 400, elements: [{ type: 'circle', cx: 10, cy: 20, rx: 30, ry: 10, rotation: 45, strokeWidth: 3, color: '#000' }] };
    const svg = doodleToSvg(d);
    expect(svg).toContain('<ellipse cx="10" cy="20" rx="30" ry="10"');
    expect(svg).toContain('transform="rotate(45 10 20)"');
  });

  test('旧数据（仅 r）：rx=ry=r 且无 transform', () => {
    const d = { version: 1, width: 600, height: 400, elements: [{ type: 'circle', cx: 10, cy: 20, r: 15, strokeWidth: 3, color: '#000' }] };
    const svg = doodleToSvg(d);
    expect(svg).toContain('rx="15" ry="15"');
    expect(svg).not.toContain('transform=');
  });
});
