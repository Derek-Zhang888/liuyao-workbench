/**
 * 涂鸦 SVG 序列化（六爻工作台 - v0.2 画板 A，v0.10 增 redo 栈）
 *
 * 纯函数模块，无 DOM 依赖。doodle 为矢量 JSON（record.doodle）：
 *   { version:1, width, height, elements:[{type:'pen'|'text'|'rect'|'circle'|'line'|'arrow', ...}] }
 * 与 DoodleBoard.jsx 的 6 种元素 schema 严格一致（见 docs/system_design.md §3.1）。
 *
 * 撤销/重做（v0.10）：redo 栈存于 doodle.redo（元素数组，仅内存态；序列化进 SVG 元数据
 * 无害，导入端忽略未知字段）。新画动作（doodleCommit / doodleClear）清空 redo 栈。
 *
 * 接口：
 *   emptyDoodle(width, height)        空涂鸦对象
 *   isEmptyDoodle(doodle)             是否为空（null/缺 elements/无元素）
 *   doodleToSvg(doodle)               → SVG markup（含 <metadata><![CDATA[{JSON}]]></metadata>）
 *   doodleToDataUri(doodle)           → data:image/svg+xml;utf8,<encodeURIComponent(svg)>
 *   doodleUndo(doodle)                → 撤销：弹出末元素压入 redo；无可撤销返回 null
 *   doodleRedo(doodle)                → 重做：从 redo 弹出末元素追加回 elements；无 redo 返回 null
 *   doodleCommit(doodle, el, w, h)    → 提交新元素并清空 redo 栈（返回新 doodle）
 *   doodleClear(doodle, w, h)         → 清空 elements 与 redo（返回新 doodle）
 *
 * 导出端（exportMd）用 doodleToDataUri 生成 md 图片行；导入端（importMd）直接解析
 * md 中 ```json 元数据块还原 doodle（不经 SVG 解析）。SVG 内嵌 metadata 供外部工具
 * 读取原始 JSON（可逆还原源），CDATA 中 `]]>` 按 XML 规则拆分为 `]]]]><![CDATA[>`。
 */
const ESCAPE = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' };

/** XML 文本转义（属性/文本节点共用） */
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ESCAPE[c]);
}

/** CDATA 内容安全化：JSON 中可能出现 `]]>`，拆分为两段 CDATA 拼接 */
function cdataSafe(s) {
  return String(s ?? '').replace(/]]>/g, ']]]]><![CDATA[>');
}

/** pen 元素 points → <path d>（多点折线，M 起点 + L 后续点） */
function penPath(points) {
  if (!Array.isArray(points) || points.length === 0) return '';
  const d = points.map((p, k) => `${k === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  return d;
}

/**
 * 箭头头部尺寸 = f(strokeWidth)（v0.10 改进建8 #1；改进建9 #1 修复用户实测
 * 「调粗细箭头大小不变」）：末端箭头随线宽联动缩放，且全程（滑块 1-30）单调明显变化。
 *
 * 旧曲线 round(w*2.5) 夹在 [8, 40]：1-3 档全部 8（低档不区分），16-30 档全部 40
 * （高档饱和）——用户拖动粗细在 16~30 区间时箭头完全不变，视觉上「没跟随」。
 *
 * 新曲线 round(w*2.5) 夹在 [6, 80]：滑块最大 30 → 75，1-30 全程单调递增，
 * 低档小箭头（1 → 6）、高档大箭头（30 → 75）肉眼明显区分；默认粗细 4 → 10
 * 与旧值一致，旧涂鸦视觉不突变。
 * 画板渲染端（DoodleBoard.jsx）与序列化端（doodleToSvg）共用本函数，保证
 * 画板所见 = md 导出所得。
 * @param {number} [strokeWidth] 线宽（缺失/非法按 8）
 * @returns {number} 箭头多边形边长（像素）
 */
export function arrowHeadSize(strokeWidth = 3) {
  const w = Number(strokeWidth);
  if (!Number.isFinite(w) || w <= 0) return 8;
  return Math.min(80, Math.max(6, Math.round(w * 2.5)));
}

/** arrow 元素箭头多边形点串（终点处 30° 开角三角箭头；尺寸随线宽缩放） */
function arrowHeadPoints(x1, y1, x2, y2, size) {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const p1 = { x: x2 - size * Math.cos(angle - Math.PI / 6), y: y2 - size * Math.sin(angle - Math.PI / 6) };
  const p2 = { x: x2 - size * Math.cos(angle + Math.PI / 6), y: y2 - size * Math.sin(angle + Math.PI / 6) };
  return `${x2},${y2} ${p1.x},${p1.y} ${p2.x},${p2.y}`;
}

/** 单个元素 → SVG 子元素 markup */
function elementToSvg(el) {
  if (!el || !el.type) return '';
  switch (el.type) {
    case 'pen':
      return `<path d="${esc(penPath(el.points))}" stroke="${esc(el.color)}" stroke-width="${Number(el.width) || 4}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
    case 'text':
      return `<text x="${Number(el.x) || 0}" y="${Number(el.y) || 0}" font-size="${Number(el.size) || 16}" fill="${esc(el.color)}">${esc(el.text)}</text>`;
    case 'rect': {
      const fill = el.fill ? el.color : 'none';
      return `<rect x="${Number(el.x) || 0}" y="${Number(el.y) || 0}" width="${Number(el.w) || 0}" height="${Number(el.h) || 0}" stroke="${esc(el.color)}" stroke-width="${Number(el.strokeWidth) || 3}" fill="${esc(fill)}"/>`;
    }
    case 'circle': {
      // 2026-08-10：支持椭圆（rx/ry）与旋转（rotation，绕圆心）；旧数据仅有 r → rx=ry=r
      const cx = Number(el.cx) || 0;
      const cy = Number(el.cy) || 0;
      const rx = el.rx != null ? Number(el.rx) : (Number(el.r) || 0);
      const ry = el.ry != null ? Number(el.ry) : rx;
      const rot = Number(el.rotation) || 0;
      const tf = rot ? ` transform="rotate(${rot} ${cx} ${cy})"` : '';
      const fill = el.fill ? el.color : 'none';
      return `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}"${tf} stroke="${esc(el.color)}" stroke-width="${Number(el.strokeWidth) || 3}" fill="${esc(fill)}"/>`;
    }
    case 'line':
      return `<line x1="${Number(el.x1) || 0}" y1="${Number(el.y1) || 0}" x2="${Number(el.x2) || 0}" y2="${Number(el.y2) || 0}" stroke="${esc(el.color)}" stroke-width="${Number(el.strokeWidth) || 3}" stroke-linecap="round"/>`;
    case 'arrow': {
      // v0.10 改进建7 #1：箭头线不用 round 线帽（round 帽超出箭头尖）
      // v0.10 改进建8 #1：箭头尺寸随线宽联动（arrowHeadSize 与画板渲染端共用）
      // 箭头末端对准修复：线条终点回退 0.866w（w·√3/2），平头端被箭头三角形覆盖，
      // 尖端不外露平头截断面（与画板渲染端同公式）
      const w = Number(el.strokeWidth) || 3;
      const size = arrowHeadSize(el.strokeWidth);
      const angle = Math.atan2(Number(el.y2) - Number(el.y1), Number(el.x2) - Number(el.x1));
      const shrink = (w * Math.sqrt(3)) / 2;
      const lx2 = Number(el.x2) - shrink * Math.cos(angle);
      const ly2 = Number(el.y2) - shrink * Math.sin(angle);
      return `<g><line x1="${Number(el.x1) || 0}" y1="${Number(el.y1) || 0}" x2="${lx2}" y2="${ly2}" stroke="${esc(el.color)}" stroke-width="${w}"/><polygon points="${arrowHeadPoints(el.x1, el.y1, el.x2, el.y2, size)}" fill="${esc(el.color)}"/></g>`;
    }
    default:
      return '';
  }
}

/**
 * 空涂鸦对象
 * @param {number} [width] 画布宽（容器实测像素，默认 600）
 * @param {number} [height] 画布高（默认 400）
 * @returns {object} {version:1, width, height, elements:[]}
 */
export function emptyDoodle(width = 600, height = 400) {
  return { version: 1, width: Number(width) || 600, height: Number(height) || 400, elements: [] };
}

/**
 * 涂鸦是否为空（null/缺 elements/无元素 均视为空）
 * @param {object|null} doodle
 * @returns {boolean}
 */
export function isEmptyDoodle(doodle) {
  return !doodle || !Array.isArray(doodle.elements) || doodle.elements.length === 0;
}

/**
 * doodle JSON → SVG markup 字符串
 * 根元素 viewBox 与画布尺寸一致（preserveAspectRatio="xMidYMid meet" 与 DoodleBoard 覆盖层同口径，
 * 等比缩放居中，容器比例不同时不变形；坐标 1:1 还原）；内嵌 <metadata><![CDATA[原始JSON]]></metadata> 供导入还原。
 * @param {object} doodle 涂鸦对象
 * @returns {string} SVG markup
 */
export function doodleToSvg(doodle) {
  const d = doodle ?? {};
  const width = Number(d.width) || 600;
  const height = Number(d.height) || 400;
  const elements = Array.isArray(d.elements) ? d.elements : [];
  const body = elements.map((el) => elementToSvg(el)).join('\n  ');
  const meta = cdataSafe(JSON.stringify({ ...d, width, height }));
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet">` +
    `\n  <metadata><![CDATA[${meta}]]></metadata>` +
    (body ? `\n  ${body}` : '') +
    '\n</svg>'
  );
}

/**
 * doodle → data URI（md 导出图片行用）
 * @param {object} doodle 涂鸦对象
 * @returns {string} data:image/svg+xml;utf8,<encodeURIComponent(svg)>
 */
export function doodleToDataUri(doodle) {
  return `data:image/svg+xml;utf8,${encodeURIComponent(doodleToSvg(doodle))}`;
}

/** 点到线段距离（拖动命中检测用） */
function distToSeg(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const qx = a.x + t * dx;
  const qy = a.y + t * dy;
  return Math.hypot(p.x - qx, p.y - qy);
}

/**
 * 命中检测（2026-08-10 鼠标拖动用）：点是否落在元素上。
 * 各类型口径：pen 按点到折线距离；text 按估算文本框；rect 按包围盒+容差；
 * circle 按到圆心距离；line/arrow 按点到线段距离。
 * 容差 = max(线宽, 6)/2 + 4（至少 7px，便于点击）。
 * @param {object} el 元素对象
 * @param {object} point {x, y} 画布坐标
 * @returns {boolean}
 */
export function hitTestElement(el, point) {
  if (!el || !point) return false;
  const w = Number(el.strokeWidth) || Number(el.width) || 4;
  const tol = Math.max(w, 6) / 2 + 4;
  switch (el.type) {
    case 'pen': {
      const pts = Array.isArray(el.points) ? el.points : [];
      if (pts.length === 1) return Math.hypot(point.x - Number(pts[0].x), point.y - Number(pts[0].y)) <= tol;
      for (let i = 0; i < pts.length - 1; i++) {
        if (distToSeg(point, pts[i], pts[i + 1]) <= tol) return true;
      }
      return false;
    }
    case 'text': {
      const size = Number(el.size) || 20;
      const tw = String(el.text ?? '').length * size * 0.62;
      const th = size * 1.4;
      return point.x >= Number(el.x) - tol && point.x <= Number(el.x) + tw + tol &&
        point.y >= Number(el.y) - th && point.y <= Number(el.y) + tol;
    }
    case 'rect': {
      const x = Number(el.x) || 0;
      const y = Number(el.y) || 0;
      const rw = Math.abs(Number(el.w) || 0);
      const rh = Math.abs(Number(el.h) || 0);
      return point.x >= x - tol && point.x <= x + rw + tol && point.y >= y - tol && point.y <= y + rh + tol;
    }
    case 'circle': {
      // 2026-08-10：椭圆（rx/ry）+ 旋转命中。先把点绕圆心逆旋转，再按椭圆方程判断（容差外扩 rx/ry）
      const cx = Number(el.cx) || 0;
      const cy = Number(el.cy) || 0;
      const rx = el.rx != null ? Number(el.rx) : (Number(el.r) || 0);
      const ry = el.ry != null ? Number(el.ry) : rx;
      const rad = ((Number(el.rotation) || 0) * Math.PI) / 180;
      const dx = point.x - cx;
      const dy = point.y - cy;
      const c = Math.cos(rad);
      const s = Math.sin(rad);
      const lx = dx * c + dy * s; // 逆旋转后的局部 x
      const ly = -dx * s + dy * c; // 逆旋转后的局部 y
      const ex = Math.max(rx + tol, 1);
      const ey = Math.max(ry + tol, 1);
      return (lx * lx) / (ex * ex) + (ly * ly) / (ey * ey) <= 1;
    }
    case 'line':
    case 'arrow':
      return distToSeg(point, { x: Number(el.x1), y: Number(el.y1) }, { x: Number(el.x2), y: Number(el.y2) }) <= tol;
    default:
      return false;
  }
}

/**
 * 平移元素（2026-08-10 鼠标拖动用）：按类型平移坐标，返回新元素（不修改原对象）。
 * pen 平移全部 points；text/rect 平移 x,y；circle 平移 cx,cy；line/arrow 平移两端点。
 * @param {object} el 元素对象
 * @param {number} dx 水平位移
 * @param {number} dy 垂直位移
 * @returns {object} 新元素
 */
export function translateElement(el, dx, dy) {
  if (!el) return el;
  const ddx = Number(dx) || 0;
  const ddy = Number(dy) || 0;
  switch (el.type) {
    case 'pen':
      return { ...el, points: (el.points || []).map((p) => ({ x: Number(p.x) + ddx, y: Number(p.y) + ddy })) };
    case 'text':
      return { ...el, x: Number(el.x) + ddx, y: Number(el.y) + ddy };
    case 'rect':
      return { ...el, x: Number(el.x) + ddx, y: Number(el.y) + ddy };
    case 'circle':
      return { ...el, cx: Number(el.cx) + ddx, cy: Number(el.cy) + ddy };
    case 'line':
    case 'arrow':
      return { ...el, x1: Number(el.x1) + ddx, y1: Number(el.y1) + ddy, x2: Number(el.x2) + ddx, y2: Number(el.y2) + ddy };
    default:
      return el;
  }
}

/** 取 redo 栈（无则空数组） */
function redoOf(doodle) {
  return Array.isArray(doodle?.redo) ? doodle.redo : [];
}

/**
 * 撤销：弹出末元素压入 redo 栈；无可撤销返回 null（DoodleBoard 按钮 disabled 依据）。
 * v0.10 改进建7 #1：redo 栈末项为橡皮擦记录（{op:'erase',index,element}）时，
 * 撤销 = 把被擦除元素按原位插回（还原橡皮擦，而非弹出末尾留存元素）。
 * @param {object} doodle 涂鸦对象
 * @returns {object|null} 新 doodle；无可撤销返回 null
 */
export function doodleUndo(doodle) {
  const elements = Array.isArray(doodle?.elements) ? doodle.elements : [];
  const redo = redoOf(doodle);
  const last = redo[redo.length - 1];
  if (last && last.op === 'erase') {
    // 撤销橡皮擦：按原位插回被删元素
    const next = [...elements];
    next.splice(Math.min(last.index, next.length), 0, last.element);
    return { ...doodle, elements: next, redo: redo.slice(0, -1) };
  }
  if (elements.length === 0) return null;
  const popped = elements[elements.length - 1];
  return { ...doodle, elements: elements.slice(0, -1), redo: [...redo, popped] };
}

/**
 * 重做：从 redo 栈弹出末元素追加回 elements；无 redo 返回 null。
 * v0.10 改进建7 #1（QA #1b 修复）：栈顶为橡皮擦记录（{op:'erase'}）时返回 null 不弹栈——
 * 擦除记录仅服务「后退」还原，绝不当元素追加（否则 elements 混入垃圾对象污染数据）。
 * @param {object} doodle 涂鸦对象
 * @returns {object|null} 新 doodle（elements 多末元素、redo 少末元素）；无 redo / 栈顶为擦除记录返回 null
 */
export function doodleRedo(doodle) {
  const redo = redoOf(doodle);
  if (redo.length === 0) return null;
  const last = redo[redo.length - 1];
  if (last && last.op === 'erase') return null; // 栈顶为擦除记录：前进无动作
  const restored = last;
  const elements = Array.isArray(doodle.elements) ? doodle.elements : [];
  return { ...doodle, elements: [...elements, restored], redo: redo.slice(0, -1) };
}

/**
 * 提交新元素：追加到 elements 末尾并清空 redo 栈（新画动作使重做历史失效）
 * @param {object|null} doodle 涂鸦对象（null 视为空涂鸦）
 * @param {object} el 元素对象
 * @param {number} [width] 画布宽
 * @param {number} [height] 画布高
 * @returns {object} 新 doodle
 */
export function doodleCommit(doodle, el, width, height) {
  const base = doodle && typeof doodle === 'object' ? { ...doodle } : { version: 1 };
  const elements = Array.isArray(base.elements) ? base.elements : [];
  return { ...base, width: Number(width) || 600, height: Number(height) || 400, elements: [...elements, el], redo: [] };
}

/**
 * 删除元素（橡皮擦，v0.10 改进建7 #1）：按索引删除元素。
 * redo 栈记录擦除操作 {op:'erase', index, element}，doodleUndo 按原位插回（可撤销）。
 * @param {object} doodle 涂鸦对象
 * @param {number} index 元素索引（0 起）
 * @returns {object|null} 新 doodle；索引非法/无元素返回 null
 */
export function doodleErase(doodle, index) {
  const elements = Array.isArray(doodle?.elements) ? doodle.elements : [];
  if (!Number.isInteger(index) || index < 0 || index >= elements.length) return null;
  const removed = elements[index];
  return {
    ...doodle,
    elements: elements.filter((_, k) => k !== index),
    redo: [...redoOf(doodle), { op: 'erase', index, element: removed }],
  };
}

/**
 * 清空全部元素与 redo 栈
 * @param {object|null} doodle 涂鸦对象
 * @param {number} [width] 画布宽
 * @param {number} [height] 画布高
 * @returns {object} 新 doodle（elements=[]、redo=[]）
 */
export function doodleClear(doodle, width, height) {
  const base = doodle && typeof doodle === 'object' ? { ...doodle } : { version: 1 };
  return { ...base, width: Number(width) || 600, height: Number(height) || 400, elements: [], redo: [] };
}
