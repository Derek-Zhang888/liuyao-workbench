/**
 * 盘面画板（六爻工作台 - v0.2 功能 A，QQ 截图风；v0.10 修工具栏被涂鸦覆盖 + redo）
 *
 * 受控组件：props { enabled, doodle, onChange }
 *   enabled=false → 不渲染覆盖层与工具栏，不拦截点击（GuashiLibPage 只传 pan 时安全）
 *   doodle = {version,width,height,elements:[...6 种元素]} | null
 *   onChange(newDoodle) 每次增删元素回调（撤销/重做/清空/绘制/文字）
 *
 * 实现：
 *   - SVG 覆盖层 `preserveAspectRatio="none"`，viewBox = 画布尺寸（容器实测像素，坐标 1:1）
 *   - pointer 事件绘制：pen 折线 / rect 矩形 / circle 圆形（外接盒）/ line / arrow
 *   - text 工具点画布弹浮层输入，Enter 确认落字（字号=当前粗细档位）
 *   - 工具栏：6 工具 + 外框/填充切换 + 8 色预设 + <input type="color"> 调色板
 *     + 粗细滑块 1-30 + 撤销（弹末元素入 redo 栈）/ 重做 / 清空
 *   - 工具栏 z-index 高于 SVG 覆盖层（v0.10 修复：SVG absolute 盖住工具栏导致点不了）
 *   - 根节点 onClick stopPropagation，拦截爻位跳转（画板开启时优先级最高）
 *
 * 撤销/重做逻辑复用 doodleSvg.js（doodleUndo/doodleRedo/doodleCommit/doodleClear），
 * redo 栈存于 doodle.redo，新画动作自动清空（见 doodleSvg.js 头注释）。
 *
 * 纯前端零依赖（React + 原生 SVG + input[type=color]），多端 WebView 行为一致。
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { doodleUndo, doodleRedo, doodleCommit, doodleClear, doodleErase, arrowHeadSize, hitTestElement, translateElement } from '../engine/doodleSvg.js'

const TOOLS = [
  // 鼠标（2026-08-09）：恢复默认指针交互，不绘制、允许触摸滚动页面——
  // 安卓端打开画板后默认即是鼠标，避免手指拖动屏幕误触发画笔
  { id: 'mouse', label: '鼠标' },
  { id: 'pen', label: '画笔' },
  { id: 'text', label: '文字' },
  { id: 'rect', label: '矩形' },
  { id: 'circle', label: '圆形' },
  { id: 'line', label: '画线' },
  { id: 'arrow', label: '箭头' },
  { id: 'eraser', label: '橡皮擦' },
]

/** 工具栏位置会话持久化 key（两页共用同一偏好；仅位置，不涉及各页画板开关状态） */
const TOOLBAR_KEY = 'liuyao-doodle-toolbar'
/** 粗细双槽记忆 key：{draw, text}（文字工具独立记忆默认 20，其他工具共享默认 4） */
const WIDTH_KEY = 'liuyao-doodle-width'

/** 读粗细双槽记忆（解析失败/无值回退默认 {draw:4, text:20}） */
function readWidths() {
  try {
    const raw = sessionStorage.getItem(WIDTH_KEY)
    if (raw) {
      const v = JSON.parse(raw)
      if (v && typeof v === 'object') {
        return { draw: Number(v.draw) > 0 ? Number(v.draw) : 4, text: Number(v.text) > 0 ? Number(v.text) : 20 }
      }
    }
  } catch (_) { /* 解析失败按默认 */ }
  return { draw: 4, text: 20 }
}

const PRESET_COLORS = [
  '#e74c3c', '#f39c12', '#f1c40f', '#2ecc71',
  '#1abc9c', '#3498db', '#9b59b6', '#e5e7eb',
]

const toolBtnCls = (active) =>
  `rounded-md border px-2 py-1 text-xs transition-colors ${
    active ? 'border-gold bg-goldSoft text-gold' : 'border-border text-muted hover:text-text'
  }`

/** 单元素 → SVG JSX（含绘制中的 draft，半透明） */
function SvgElement({ el, draft = false }) {
  const cls = draft ? 'opacity-60' : ''
  const fill = el.fill ? el.color : 'none'
  switch (el.type) {
    case 'pen':
      return (
        <path
          className={cls}
          d={el.points.map((p, k) => `${k === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')}
          stroke={el.color}
          strokeWidth={el.width}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )
    case 'text':
      return (
        <text x={el.x} y={el.y} fontSize={el.size} fill={el.color} className={cls}>
          {el.text}
        </text>
      )
    case 'rect':
      return (
        <rect
          className={cls}
          x={el.x}
          y={el.y}
          width={el.w}
          height={el.h}
          stroke={el.color}
          strokeWidth={el.strokeWidth}
          fill={fill}
        />
      )
    case 'circle': {
      // 2026-08-10：椭圆（rx/ry）+ 旋转（绕圆心）；旧数据仅有 r → rx=ry=r
      const rx = el.rx != null ? Number(el.rx) : (Number(el.r) || 0)
      const ry = el.ry != null ? Number(el.ry) : rx
      const rot = Number(el.rotation) || 0
      return (
        <ellipse
          className={cls}
          cx={el.cx}
          cy={el.cy}
          rx={rx}
          ry={ry}
          transform={rot ? `rotate(${rot} ${el.cx} ${el.cy})` : undefined}
          stroke={el.color}
          strokeWidth={el.strokeWidth}
          fill={fill}
        />
      )
    }
    case 'line':
      return (
        <line
          className={cls}
          x1={el.x1}
          y1={el.y1}
          x2={el.x2}
          y2={el.y2}
          stroke={el.color}
          strokeWidth={el.strokeWidth}
          strokeLinecap="round"
        />
      )
    case 'arrow': {
      // v0.10 改进建8 #1：箭头尺寸随线宽联动（与序列化端 doodleSvg 共用 arrowHeadSize）
      const angle = Math.atan2(el.y2 - el.y1, el.x2 - el.x1)
      const size = arrowHeadSize(el.strokeWidth)
      const p1 = { x: el.x2 - size * Math.cos(angle - Math.PI / 6), y: el.y2 - size * Math.sin(angle - Math.PI / 6) }
      const p2 = { x: el.x2 - size * Math.cos(angle + Math.PI / 6), y: el.y2 - size * Math.sin(angle + Math.PI / 6) }
      // 线条终点回退 0.866w（w·√3/2）：使线条平头端在箭头三角形内「宽度匹配」处结束，
      // 尖端不外露平头截断面（线越粗越明显，箭头尖才会真正对准线条）
      const w = Number(el.strokeWidth) || 3
      const shrink = (w * Math.sqrt(3)) / 2
      const lx2 = el.x2 - shrink * Math.cos(angle)
      const ly2 = el.y2 - shrink * Math.sin(angle)
      return (
        <g className={cls}>
          {/* v0.10 改进建7 #1：箭头线不再 round 线帽；线条终点回退进箭头三角形内（尖点保持 el.x2/el.y2） */}
          <line
            x1={el.x1}
            y1={el.y1}
            x2={lx2}
            y2={ly2}
            stroke={el.color}
            strokeWidth={el.strokeWidth}
          />
          <polygon points={`${el.x2},${el.y2} ${p1.x},${p1.y} ${p2.x},${p2.y}`} fill={el.color} />
        </g>
      )
    }
    default:
      return null
  }
}

export default function DoodleBoard({ enabled, doodle, onChange }) {
  const containerRef = useRef(null)
  const svgRef = useRef(null)
  const [size, setSize] = useState({ width: 0, height: 0 })
  // 默认工具 = 鼠标（2026-08-09）：画板开启时不会误画线，安卓端手指拖动页面正常滚动
  const [tool, setTool] = useState('mouse')
  // 工具栏收起为悬浮球（2026-08-09）：true 时隐藏工具栏、显示悬浮球，点击展开
  const [collapsed, setCollapsed] = useState(false)
  const [color, setColor] = useState('#e74c3c')
  // 粗细双槽（文字/其他工具独立记忆）：drawWidth 供画笔等绘制工具共享，textWidth 供文字专用；
  // 当前粗细 = 派生值 strokeWidth（切工具自动切回各自记忆）；sessionStorage 持久化
  const [drawWidth, setDrawWidth] = useState(() => readWidths().draw)
  const [textWidth, setTextWidth] = useState(() => readWidths().text)
  const strokeWidth = tool === 'text' ? textWidth : drawWidth
  useEffect(() => {
    try { sessionStorage.setItem(WIDTH_KEY, JSON.stringify({ draw: drawWidth, text: textWidth })) } catch (_) { /* 静默 */ }
  }, [drawWidth, textWidth])
  const [fill, setFill] = useState(false)
  const [draft, setDraft] = useState(null) // 绘制中元素
  const [textDraft, setTextDraft] = useState(null) // {x, y, value}
  // 2026-08-10：鼠标工具拖动元素状态 {index, dx, dy, startX, startY}；null=未拖动。
  // 拖动中仅本地渲染（不写回 doodle），松手才一次性提交（清空 redo 栈，与新增动作同语义）
  const [dragSel, setDragSel] = useState(null)
  // 2026-08-10：圆形选中态（鼠标工具单击圆形 → 显示形状控制点：右/下/旋转手柄）。
  // 仅 tool==='mouse' 时有效；切工具/点空白/选其他元素时清除
  const [selectSel, setSelectSel] = useState(null)
  // 2026-08-10：形状调整拖动 {mode:'rx'|'ry'|'rot', index, cx, cy, rx0, ry0, rot0, startX, startY}
  const [shapeDrag, setShapeDrag] = useState(null)
  // 2026-08-10：触摸设备（手机/平板，coarse pointer）→ 控制点手柄加大（r12+命中20px），桌面保持 r7；
  // 手指点击精度低，命中区必须足够大才能按住
  const [isCoarse] = useState(() => {
    try {
      return window.matchMedia?.('(pointer: coarse)').matches ?? false
    } catch (_) {
      return false
    }
  })
  const textInputRef = useRef(null) // 文字浮层 input（显式 focus 兜底，见下方 effect）
  // 工具栏位置（v0.10 改进建7 #1 可拖动，sessionStorage 持久；改进建9 #1 改 fixed 视口级定位）：
  // 无已保存位置 → null（挂载后按画布容器实测位置默认，见 useLayoutEffect）
  const [toolbarPos, setToolbarPos] = useState(() => {
    try {
      const raw = sessionStorage.getItem(TOOLBAR_KEY)
      if (raw) {
        const v = JSON.parse(raw)
        if (v && Number.isFinite(v.x) && Number.isFinite(v.y)) return { x: v.x, y: v.y }
      }
    } catch (_) { /* 解析失败按默认 */ }
    return null
  })
  const toolbarPosRef = useRef(toolbarPos)
  useEffect(() => { toolbarPosRef.current = toolbarPos }, [toolbarPos])
  const dragRef = useRef(null) // {startX, startY, origX, origY}
  // 工具栏尺寸（四角拖拽调形）：{w,h} 或 null=内容自适应；随位置一起 sessionStorage 持久化
  const [toolbarSize, setToolbarSize] = useState(() => {
    try {
      const raw = sessionStorage.getItem(TOOLBAR_KEY)
      if (raw) {
        const v = JSON.parse(raw)
        if (v && Number.isFinite(v.w) && Number.isFinite(v.h)) return { w: v.w, h: v.h }
      }
    } catch (_) { /* 解析失败按默认 */ }
    return null
  })
  const toolbarSizeRef = useRef(toolbarSize)
  useEffect(() => { toolbarSizeRef.current = toolbarSize }, [toolbarSize])
  const resizeRef = useRef(null) // {startX, startY, origW, origH, corner}

  // 容器实测尺寸（viewBox 坐标 1:1 用）+ 工具栏初始定位（改进建9 #1）：
  // 仅在启用时测量一次，随窗口变化不追踪（保持已绘坐标稳定）。
  // 工具栏改 fixed 视口定位后需真实落点：无已保存位置时默认落在画布容器左上角
  // （延续旧「盘面左上角」观感）；用 useLayoutEffect 在绘制前完成，避免先闪现视口 (0,0)。
  // 2026-08-09 修复「安卓端工具栏消失」：挂载时容器可能在视口外（页面已滚动，rect 为负），
  // 默认位置钳制在视口内 [8, vw-220]x[8, vh-60]，保证工具栏/悬浮球始终可见可拖。
  useLayoutEffect(() => {
    if (!enabled) return undefined
    const el = containerRef.current
    if (!el) return undefined
    const rect = el.getBoundingClientRect()
    if (rect.width && rect.height) setSize({ width: rect.width, height: rect.height })
    setToolbarPos((prev) => {
      if (prev) return prev
      const vw = window.innerWidth || 800
      const vh = window.innerHeight || 600
      return {
        x: Math.max(8, Math.min(rect.left + 8, vw - 220)),
        y: Math.max(8, Math.min(rect.top + 8, vh - 60)),
      }
    })
    return undefined
  }, [enabled])

  // 文字浮层打开后聚焦输入框（改进建9 #1 修复「点文字工具后没有输入框」）：
  // autoFocus 在部分 WebView/触屏下时序不稳，此处显式 focus 兜底，
  // 确保「点画布 → 弹输入框」稳定出现。
  useEffect(() => {
    if (textDraft) textInputRef.current?.focus()
  }, [textDraft])

  if (!enabled) return null

  const elements = doodle && Array.isArray(doodle.elements) ? doodle.elements : []
  // 画布尺寸：优先已存 doodle 尺寸（导入还原时保持一致），否则容器实测，再兜底 600x400
  const width = (doodle && Number(doodle.width)) || size.width || 600
  const height = (doodle && Number(doodle.height)) || size.height || 400

  // 文字浮层定位（改进建9 #1）：钳制在画布内，靠近右/下边缘时收进容器，
  // 避免输入框（w-44 ≈ 190px）超出画布被 PanView overflow-hidden 裁剪而「看不到」。
  // 2026-08-10：preserveAspectRatio 改 xMidYMid meet 后内容可能居中留白（letterbox），
  // 浮层按内容区像素定位（scale + offset 与 getPoint 同源），容器比例不同时不错位；
  // 容器未测量时兜底用画布坐标百分比。
  const textStyle = textDraft
    ? (() => {
        const w = Math.max(1, width)
        const h = Math.max(1, height)
        const rect = svgRef.current ? svgRef.current.getBoundingClientRect() : { width: 0, height: 0 }
        if (rect.width && rect.height) {
          const scale = Math.min(rect.width / w, rect.height / h)
          const ox = (rect.width - w * scale) / 2
          const oy = (rect.height - h * scale) / 2
          const leftPx = ox + Math.max(0, Math.min(w - 190 / scale, textDraft.x)) * scale
          const topPx = oy + Math.max(0, Math.min(h - 34 / scale, textDraft.y - 18)) * scale
          return { left: `${leftPx}px`, top: `${topPx}px` }
        }
        const leftPct = (Math.max(0, Math.min(w - 190, textDraft.x)) / w) * 100
        const topPct = (Math.max(0, Math.min(h - 34, textDraft.y - 18)) / h) * 100
        return { left: `${leftPct}%`, top: `${topPct}%` }
      })()
    : null

  /** 工具栏当前渲染位置：无保存值（首次挂载未测量完成）时兜底视口 (8,8) */
  const tp = toolbarPos ?? { x: 8, y: 8 }

  /** 覆盖层光标与触摸行为（2026-08-09：鼠标工具恢复默认指针交互，触摸可滚动页面；
   *  2026-08-10：鼠标工具命中元素拖动中 → 锁手势防页面滚动 + 抓取光标） */
  const cursorCls = tool === 'mouse'
    ? (dragSel ? 'cursor-grabbing' : 'cursor-default')
    : tool === 'eraser' ? 'cursor-pointer' : 'cursor-crosshair'
  // 触摸锁（v1.2.0 用户拍板方案）：选中圆形（控制点出现）或拖动元素期间 → svg 整体 touch-none
  // 锁屏防滚动（渲染期 class，触摸开始前已生效，规避 SVG 子元素 touch-action 不可靠）；
  // 点空白处 setSelectSel(null) 控制点消失 → 恢复 touch-auto 可滚动。shapeDrag 隐含于 selectSel。
  const touchCls = tool === 'mouse'
    ? (dragSel || selectSel !== null ? 'touch-none' : 'touch-auto')
    : 'touch-none'

  /** pointer 事件 → 画布坐标（viewBox 与容器像素映射）。
   *  2026-08-10：preserveAspectRatio 改 xMidYMid meet 后，容器与画布比例不同时内容
   *  等比居中（letterbox），此处按内容区（缩放后居中区域）换算，offset 补偿留白。 */
  const getPoint = (e) => {
    const rect = svgRef.current ? svgRef.current.getBoundingClientRect() : { left: 0, top: 0, width: 1, height: 1 }
    const w = Math.max(1, width)
    const h = Math.max(1, height)
    if (!rect.width || !rect.height) return { x: 0, y: 0 }
    const scale = Math.min(rect.width / w, rect.height / h)
    const ox = (rect.width - w * scale) / 2
    const oy = (rect.height - h * scale) / 2
    return { x: (e.clientX - rect.left - ox) / scale, y: (e.clientY - rect.top - oy) / scale }
  }

  /** 圆形半径（2026-08-10：兼容旧 r 字段，新数据 rx/ry 优先） */
  const circleRx = (el) => (el.rx != null ? Number(el.rx) : (Number(el.r) || 0))
  const circleRy = (el) => (el.ry != null ? Number(el.ry) : circleRx(el))

  /** 圆形局部偏移 (lx,ly) → 画布坐标（应用 rotation 绕圆心旋转） */
  const rotPoint = (el, lx, ly) => {
    const rad = ((Number(el.rotation) || 0) * Math.PI) / 180
    const c = Math.cos(rad)
    const s = Math.sin(rad)
    return { x: Number(el.cx) + lx * c - ly * s, y: Number(el.cy) + lx * s + ly * c }
  }

  /** 画布点 → 圆形局部坐标（逆旋转，形状调整用） */
  const invRot = (el, p) => {
    const rad = ((Number(el.rotation) || 0) * Math.PI) / 180
    const c = Math.cos(rad)
    const s = Math.sin(rad)
    const dx = p.x - Number(el.cx)
    const dy = p.y - Number(el.cy)
    return { x: dx * c + dy * s, y: -dx * s + dy * c }
  }

  /** 圆形元素在形状调整拖动中的临时值（shapeDrag 存在时用于渲染/控制点坐标） */
  const shapePreview = (el, k) => {
    if (shapeDrag && shapeDrag.index === k && el.type === 'circle') {
      return {
        ...el,
        rx: shapeDrag.rx1 != null ? shapeDrag.rx1 : circleRx(el),
        ry: shapeDrag.ry1 != null ? shapeDrag.ry1 : circleRy(el),
        rotation: shapeDrag.rot1 != null ? shapeDrag.rot1 : (Number(el.rotation) || 0),
      }
    }
    return el
  }

  /** 提交元素（新元素追加到末尾，清空 redo 栈） */
  const commit = (el) => {
    onChange?.(doodleCommit(doodle, el, width, height))
    setDraft(null)
  }

  /** 撤销：弹出最后一个元素（压入 redo 栈） */
  const undo = () => {
    const next = doodleUndo(doodle)
    if (next) onChange?.(next)
  }

  /** 重做：从 redo 栈弹出最后一个元素追加回（v0.10） */
  const redo = () => {
    const next = doodleRedo(doodle)
    if (next) onChange?.(next)
  }

  /** 清空全部元素（含 redo 栈） */
  const clearAll = () => {
    onChange?.(doodleClear(doodle, width, height))
  }

  /** 前进可用判定（v0.10 改进建7 #1，QA #1b 修复）：仅当 redo 栈非空且栈顶为普通元素时可前进；
   * 栈顶为橡皮擦记录（{op:'erase'}）→ 前进禁用（擦除记录仅服务后退还原，绝不当元素追加） */
  const redoList = doodle && Array.isArray(doodle.redo) ? doodle.redo : []
  const lastRedo = redoList[redoList.length - 1]
  const redoCount = redoList.length > 0 && !(lastRedo && lastRedo.op === 'erase') ? redoList.length : 0
  /** 后退可用判定（QA #1b 补）：elements 非空可弹末元素；或 redo 栈顶为擦除记录可还原（elements 已空也能后退还原被擦元素） */
  const canUndo = elements.length > 0 || !!(lastRedo && lastRedo.op === 'erase')

  /** 橡皮擦：点击元素删除（元素级删除，压入 redo 栈可撤销） */
  const eraseEl = (k, e) => {
    e.stopPropagation()
    const next = doodleErase(doodle, k)
    if (next) onChange?.(next)
  }

  /** 工具栏/悬浮球拖拽（v0.10 改进建7 #1：pointer capture 拖把手移动位置，松手持久化；
   *  2026-08-09 新需求：设立窗口边界，拖拽坐标钳制在视口内 [0, vw-w]x[0, vh-h]，
   *  防止工具栏/悬浮球拖出窗口后拖不回来（覆盖旧「允许负坐标越界」决策）；
   *  悬浮球（40px）按自身尺寸钳制，工具栏按工具栏尺寸钳制） */
  const onHandleDown = (e) => {
    e.preventDefault()
    e.stopPropagation()
    const base = toolbarPosRef.current ?? { x: 8, y: 8 } // 首次挂载未完成定位前的兜底
    // 悬浮球自身带 data-testid="doodle-fab"，工具栏把手没有 → 用是否悬浮球区分钳制尺寸
    const isFab = e.currentTarget.getAttribute?.('data-testid') === 'doodle-fab'
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      origX: base.x,
      origY: base.y,
      isFab,
    }
    try { e.currentTarget.setPointerCapture?.(e.pointerId) } catch (_) { /* 测试环境无 capture 时静默 */ }
  }
  const onHandleMove = (e) => {
    const d = dragRef.current
    if (!d) return
    const vw = window.innerWidth || 800
    const vh = window.innerHeight || 600
    const w = d.isFab ? 44 : toolbarSizeRef.current?.w || 220
    const h = d.isFab ? 44 : toolbarSizeRef.current?.h || 48
    // 边界钳制：不能移出窗口（防止拖不回）
    setToolbarPos({
      x: Math.max(0, Math.min(d.origX + e.clientX - d.startX, vw - w)),
      y: Math.max(0, Math.min(d.origY + e.clientY - d.startY, vh - h)),
    })
  }
  const onHandleUp = () => {
    if (!dragRef.current) return
    dragRef.current = null
    try {
      sessionStorage.setItem(
        TOOLBAR_KEY,
        JSON.stringify({ ...toolbarPosRef.current, ...toolbarSizeRef.current }),
      )
    } catch (_) { /* 静默 */ }
  }

  /** 四角拖拽调形：pointer capture 拖把手改变浮窗形状（宽度收窄时功能按钮自动换行重排）；
   *  首次拖拽（无已存尺寸）从当前内容实测尺寸起步；松手随位置一起持久化 */
  const onResizeDown = (e, corner) => {
    e.preventDefault()
    e.stopPropagation()
    const rect = e.currentTarget.parentElement?.getBoundingClientRect?.()
    const base =
      toolbarSizeRef.current ??
      (rect && rect.width ? { w: rect.width, h: rect.height } : { w: 300, h: 48 })
    resizeRef.current = { startX: e.clientX, startY: e.clientY, origW: base.w, origH: base.h, corner }
    try { e.currentTarget.setPointerCapture?.(e.pointerId) } catch (_) { /* 测试环境无 capture 时静默 */ }
  }
  const onResizeMove = (e) => {
    const r = resizeRef.current
    if (!r) return
    const dx = e.clientX - r.startX
    const dy = e.clientY - r.startY
    // corner 含 e → 东侧角（宽度随 dx）；含 s → 南侧角（高度随 dy）；否则反向（西/北角）
    const w = r.origW + (r.corner.includes('e') ? dx : -dx)
    const h = r.origH + (r.corner.includes('s') ? dy : -dy)
    const next = { w: Math.max(220, w), h: Math.max(40, h) }
    toolbarSizeRef.current = next // 同步 ref：pointerup 可能在同一批事件内到达，state 尚未 flush
    setToolbarSize(next)
  }
  const onResizeUp = () => {
    if (!resizeRef.current) return
    resizeRef.current = null
    try {
      sessionStorage.setItem(
        TOOLBAR_KEY,
        JSON.stringify({ ...toolbarPosRef.current, ...toolbarSizeRef.current }),
      )
    } catch (_) { /* 静默 */ }
  }

  /** 2026-08-10：形状控制点按下（右=调宽 rx / 下=调高 ry / 上=旋转）：
   *  stopPropagation 避免触发 SVG 主体拖动；pointer capture 持续跟手 */
  const onShapeDown = (e, index, mode, el) => {
    e.preventDefault()
    e.stopPropagation()
    // v1.2.0 Bug2：控制点元素已带 touch-none（渲染期生效）；此处同步设置 style 双保险——
    // touch-action 必须在手势开始前确定，靠 React state 重渲染来不及（触摸会先滚动页面）
    try { e.currentTarget.style.touchAction = 'none' } catch (_) { /* 忽略 */ }
    try { e.currentTarget.setPointerCapture?.(e.pointerId) } catch (_) { /* 测试环境无 capture 时静默 */ }
    setShapeDrag({
      mode,
      index,
      cx: Number(el.cx),
      cy: Number(el.cy),
      rx0: circleRx(el),
      ry0: circleRy(el),
      rot0: Number(el.rotation) || 0,
      startX: e.clientX,
      startY: e.clientY,
    })
  }
  const onShapeMove = (e) => {
    const d = shapeDrag
    if (!d) return
    const p = getPoint(e)
    if (d.mode === 'rx' || d.mode === 'ry') {
      // 逆旋转到局部坐标 → 取水平/垂直分量绝对值（最小 4px 防压扁为 0）
      const loc = invRot({ cx: d.cx, cy: d.cy, rotation: d.rot0 }, p)
      const v = Math.max(4, Math.abs(d.mode === 'rx' ? loc.x : loc.y))
      setShapeDrag(d.mode === 'rx' ? { ...d, rx1: v } : { ...d, ry1: v })
    } else if (d.mode === 'rot') {
      const ang = Math.atan2(p.y - d.cy, p.x - d.cx) * (180 / Math.PI)
      const startAng = Math.atan2(d.startY - d.cy, d.startX - d.cx) * (180 / Math.PI)
      setShapeDrag({ ...d, rot1: d.rot0 + (ang - startAng) })
    }
  }
  const onShapeUp = () => {
    const d = shapeDrag
    if (!d) return
    const el = elements[d.index]
    if (el && el.type === 'circle') {
      let nextEl
      if (d.mode === 'rx') nextEl = { ...el, rx: d.rx1 != null ? d.rx1 : d.rx0 }
      else if (d.mode === 'ry') nextEl = { ...el, ry: d.ry1 != null ? d.ry1 : d.ry0 }
      else if (d.mode === 'rot') {
        const rot = Math.round(((d.rot1 != null ? d.rot1 : d.rot0) % 360 + 360) % 360)
        nextEl = { ...el, rotation: rot }
      }
      const next = [...elements]
      next[d.index] = nextEl
      onChange?.({ ...doodle, elements: next, redo: [] })
    }
    setShapeDrag(null)
  }

  const handlePointerDown = (e) => {
    // 鼠标工具（2026-08-09 起默认）：未命中元素时不绘制、恢复默认交互（触摸可滚动页面）；
    // 2026-08-10：命中已有元素 → 开始拖动（pointer capture 持续跟手）；命中圆形额外置为选中态（显示形状控制点）
    if (tool === 'mouse') {
      const p = getPoint(e)
      for (let k = elements.length - 1; k >= 0; k--) {
        if (hitTestElement(elements[k], p)) {
          e.preventDefault()
          // ⚠️ v1.2.0 Bug2 复诊（用户报）：不能在此同步设置 e.currentTarget.style.touchAction——
          // currentTarget 是 SVG 覆盖层本体，设置后 touch-action 永久为 none → 拖动元素后盘面
          // 整体锁死无法滚动。拖元素的触摸锁由 touchCls 动态控制（dragSel → svg touch-none，
          // 松手 dragSel=null → 恢复 touch-auto）；控制点（handle g）才是渲染期 touch-none 的正确位置。
          try { e.currentTarget.setPointerCapture?.(e.pointerId) } catch (_) { /* 测试环境无 capture 时静默 */ }
          setSelectSel(elements[k].type === 'circle' ? k : null)
          setDragSel({ index: k, dx: 0, dy: 0, startX: p.x, startY: p.y })
          return
        }
      }
      setSelectSel(null)
      return
    }
    // 橡皮擦：不启动绘制，交由元素 onClick 删除
    if (tool === 'eraser') return
    if (tool === 'text') {
      // 改进建9 #1 修复「点文字工具后没有输入框」：阻止 pointerdown 默认行为。
      // 浏览器默认会在 pointerdown 后将焦点移到事件目标（SVG/body），使刚 autoFocus
      // 的浮层 input 立即失焦 → onBlur 空值提交 → setTextDraft(null) → 输入框一闪而过。
      e.preventDefault()
      setTextDraft({ ...getPoint(e), value: '' })
      return
    }
    const p = getPoint(e)
    try {
      e.currentTarget.setPointerCapture?.(e.pointerId)
    } catch (_) { /* 测试环境无 pointer capture 时静默 */ }
    if (tool === 'pen') {
      setDraft({ type: 'pen', color, width: strokeWidth, points: [p] })
    } else if (tool === 'rect') {
      setDraft({ type: 'rect', start: p, x: p.x, y: p.y, w: 0, h: 0, color, strokeWidth, fill })
    } else if (tool === 'circle') {
      setDraft({ type: 'circle', start: p, cx: p.x, cy: p.y, r: 0, color, strokeWidth, fill })
    } else if (tool === 'line' || tool === 'arrow') {
      setDraft({ type: tool, x1: p.x, y1: p.y, x2: p.x, y2: p.y, color, strokeWidth })
    }
  }

  const handlePointerMove = (e) => {
    // 2026-08-10：拖动中实时更新位移（仅本地 state，不写回 doodle）
    if (dragSel) {
      const p = getPoint(e)
      setDragSel((s) => (s ? { ...s, dx: p.x - s.startX, dy: p.y - s.startY } : s))
      return
    }
    if (!draft) return
    const p = getPoint(e)
    if (draft.type === 'pen') {
      setDraft({ ...draft, points: [...draft.points, p] })
    } else if (draft.type === 'rect') {
      setDraft({
        ...draft,
        x: Math.min(draft.start.x, p.x),
        y: Math.min(draft.start.y, p.y),
        w: Math.abs(p.x - draft.start.x),
        h: Math.abs(p.y - draft.start.y),
      })
    } else if (draft.type === 'circle') {
      setDraft({
        ...draft,
        cx: (draft.start.x + p.x) / 2,
        cy: (draft.start.y + p.y) / 2,
        r: Math.max(Math.abs(p.x - draft.start.x), Math.abs(p.y - draft.start.y)) / 2,
      })
    } else if (draft.type === 'line' || draft.type === 'arrow') {
      setDraft({ ...draft, x2: p.x, y2: p.y })
    }
  }

  const handlePointerUp = () => {
    // 2026-08-10：拖动结束 → 一次性提交平移后的元素（清空 redo 栈，与新增动作同语义）
    if (dragSel) {
      const el = elements[dragSel.index]
      if (el && (dragSel.dx !== 0 || dragSel.dy !== 0)) {
        const next = [...elements]
        next[dragSel.index] = translateElement(el, dragSel.dx, dragSel.dy)
        onChange?.({ ...doodle, elements: next, redo: [] })
      }
      setDragSel(null)
      return
    }
    if (!draft) return
    commit(draft)
  }

  /** 文字确认：非空文本落字（字号=当前粗细档位）。v0.10 修复双提交：
   * 先置空 textDraft 再 commit，避免 Enter 提交后浮层残留触发 onBlur 二次落字 */
  const commitText = () => {
    const t = (textDraft?.value ?? '').trim()
    if (t && textDraft) {
      const p = { x: textDraft.x, y: textDraft.y }
      setTextDraft(null)
      commit({ type: 'text', x: p.x, y: p.y, text: t, size: strokeWidth, color })
    } else {
      setTextDraft(null)
    }
  }

  return (
    <>
      {/* 画板覆盖层（SVG 绘制 + 文字浮层） */}
      <div
        ref={containerRef}
        className="absolute inset-0 z-20"
        onClick={(e) => e.stopPropagation()} // 拦截爻位跳转（画板开启优先级最高）
      >
        {/* SVG 覆盖层：viewBox = 画布尺寸（容器实测像素，坐标 1:1）。
            ⚠️ 2026-08-10 修复「保存到卦例库后画板整体右移+横向拉长」：
            原 preserveAspectRatio="none" + h-full w-full 会把画布强制拉伸到当前容器宽高比——
            排盘页容器与卦例库容器比例不同 → 内容变形。改为 xMidYMid meet：内容等比缩放居中
            （任何容器不变形不裁切）；绘制时容器=画布尺寸，无留白，观感与原来完全一致。
            pointer 换算见 getPoint（含 letterbox 偏移补偿）。 */}
        <svg
          ref={svgRef}
          className={`absolute inset-0 h-full w-full ${touchCls} ${cursorCls}`}
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="xMidYMid meet"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
        >
          {elements.map((el, k) => (
            <g
              key={k}
              onClick={tool === 'eraser' ? (e) => eraseEl(k, e) : undefined}
              className={tool === 'eraser' ? 'cursor-pointer' : undefined}
            >
              {/* 2026-08-10：拖动中的元素实时平移显示（dx/dy 临时位移）；选中圆形在形状调整中显示临时 rx/ry/rot */}
              <SvgElement
                el={
                  dragSel && dragSel.index === k
                    ? translateElement(el, dragSel.dx, dragSel.dy)
                    : shapePreview(el, k)
                }
              />
            </g>
          ))}
          {/* 2026-08-10：鼠标工具选中圆形 → 形状控制点（右中=调宽 / 下中=调高 / 上方=旋转） */}
          {tool === 'mouse' && !dragSel && selectSel != null && elements[selectSel] && elements[selectSel].type === 'circle'
            ? (() => {
                const selEl = shapePreview(elements[selectSel], selectSel)
                const rx = Math.max(circleRx(selEl), 4)
                const ry = Math.max(circleRy(selEl), 4)
                const right = rotPoint(selEl, rx, 0)
                const bottom = rotPoint(selEl, 0, ry)
                const rotH = rotPoint(selEl, 0, -ry - 24)
                const handle = (pos, mode, title) => (
                  <g
                    key={mode}
                    data-handle={mode}
                    onPointerDown={(e) => onShapeDown(e, selectSel, mode, elements[selectSel])}
                    onPointerMove={onShapeMove}
                    onPointerUp={onShapeUp}
                    onPointerCancel={onShapeUp}
                    className="cursor-pointer touch-none"
                  >
                    {/* 透明命中区：触摸设备 20px / 桌面 14px（必须大于可见手柄，手指才按得中） */}
                    <circle cx={pos.x} cy={pos.y} r={isCoarse ? 20 : 14} fill="transparent" />
                    <circle cx={pos.x} cy={pos.y} r={isCoarse ? 12 : 7} fill="#ffffff" stroke="#5b6be0" strokeWidth={2} />
                    <circle cx={pos.x} cy={pos.y} r={isCoarse ? 3.5 : 2.5} fill="#5b6be0" />
                    <title>{title}</title>
                  </g>
                )
                return (
                  <g data-testid="circle-handles">
                    {handle(right, 'rx', '拖动调整宽度')}
                    {handle(bottom, 'ry', '拖动调整高度')}
                    {handle(rotH, 'rot', '拖动旋转')}
                  </g>
                )
              })()
            : null}
          {draft ? <SvgElement el={draft} draft /> : null}
        </svg>

        {/* 文字工具浮层：点画布后在此输入，回车确认落字（v0.10 按画布坐标百分比定位，避免缩放错位；
            改进建9 #1 百分比钳制在画布内 + 显式 focus 兜底） */}
        {textDraft ? (
          <div
            className="absolute z-40"
            style={textStyle || undefined}
          >
            <input
              ref={textInputRef}
              autoFocus
              value={textDraft.value}
              onChange={(e) => setTextDraft({ ...textDraft, value: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitText()
                else if (e.key === 'Escape') setTextDraft(null)
              }}
              onBlur={commitText}
              placeholder="输入文字，回车确认"
              className="w-44 rounded-md border border-gold bg-bg px-2 py-0.5 text-sm text-text outline-none"
            />
          </div>
        ) : null}
      </div>

      {/* 工具栏（v0.10 改进建7 #1：可拖拽移动，位置 sessionStorage 持久；拖把手 ⋮⋮ 移动，
          松手落位，避免遮挡卦名/爻行；后退/前进 = 撤销/重做）
          改进建9 #1：fixed 视口级定位，脱离 PanView overflow-hidden 裁剪 → 可在整个窗口
          页面自由移动；随 DoodleBoard 卸载自动消失
          （玄穹修复：createPortal 到 body，脱离 .card 动画 transform 捕获的 containing
          block——否则 fixed 定位被盘面卡片接管，页面滚动后工具栏漂移/消失）
          2026-08-09：收起为悬浮球（collapsed 时隐藏工具栏，显示可点击展开的悬浮球） */}
      {createPortal(
        collapsed ? (
          <button
            type="button"
            data-testid="doodle-fab"
            onClick={() => setCollapsed(false)}
            title="展开画板工具栏（可拖拽移动悬浮球）"
            aria-label="展开画板工具栏"
            className="fixed z-50 flex h-10 w-10 touch-none items-center justify-center rounded-full border border-gold bg-toolbarBg text-base text-gold shadow-lg transition-transform hover:scale-110 active:scale-95"
            style={{ left: tp.x, top: tp.y }}
            onPointerDown={onHandleDown}
            onPointerMove={onHandleMove}
            onPointerUp={onHandleUp}
            onPointerCancel={onHandleUp}
          >
            ✎
          </button>
        ) : (
        <div
          data-testid="doodle-toolbar"
          className="fixed z-50"
          style={{ position: 'fixed', left: tp.x, top: tp.y }}
        >
        <div
          className="relative flex select-none flex-wrap items-center gap-1.5 rounded-md border border-border bg-toolbarBg px-2 py-1.5 shadow-lg"
          style={{
            width: toolbarSize ? `${toolbarSize.w}px` : undefined,
            minHeight: toolbarSize ? `${toolbarSize.h}px` : undefined,
          }}
        >
          {/* 四角拖拽把手（改进建9 #2：拖动边角改变浮窗形状，宽度变化时功能按钮 flex-wrap 自动换行重排） */}
          {[
            { corner: 'nw', cls: '-left-1.5 -top-1.5 cursor-nwse-resize' },
            { corner: 'ne', cls: '-right-1.5 -top-1.5 cursor-nesw-resize' },
            { corner: 'sw', cls: '-left-1.5 -bottom-1.5 cursor-nesw-resize' },
            { corner: 'se', cls: '-right-1.5 -bottom-1.5 cursor-nwse-resize' },
          ].map(({ corner, cls }) => (
            <span
              key={corner}
              data-testid={`resize-${corner}`}
              className={`absolute h-3 w-3 ${cls} touch-none rounded-sm bg-borderDim70 transition-colors hover:bg-gold`}
              title="拖动调整工具栏形状"
              onPointerDown={(e) => onResizeDown(e, corner)}
              onPointerMove={onResizeMove}
              onPointerUp={onResizeUp}
              onPointerCancel={onResizeUp}
            />
          ))}
          <span
            className="cursor-grab touch-none select-none px-0.5 text-muted transition-colors active:cursor-grabbing hover:text-gold"
            title="拖动移动工具栏"
            onPointerDown={onHandleDown}
            onPointerMove={onHandleMove}
            onPointerUp={onHandleUp}
            onPointerCancel={onHandleUp}
          >
            ⋮⋮
          </span>
          {TOOLS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => { setTool(t.id); setSelectSel(null); setShapeDrag(null) }}
              className={toolBtnCls(tool === t.id)}
            >
              {t.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setFill(!fill)}
            title="矩形/圆形外框与填充切换"
            className={toolBtnCls(fill)}
          >
            {fill ? '填充' : '外框'}
          </button>
          <span className="mx-0.5 h-4 w-px bg-border" />
          {PRESET_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={`颜色 ${c}`}
              onClick={() => setColor(c)}
              className={`h-4 w-4 rounded-full border ${color === c ? 'border-gold ring-1 ring-gold' : 'border-border'}`}
              style={{ backgroundColor: c }}
            />
          ))}
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            title="调色板"
            className="h-5 w-6 cursor-pointer border border-border bg-transparent"
          />
          <span className="mx-0.5 h-4 w-px bg-border" />
          <label className="flex items-center gap-1 text-[11px] text-muted">
            粗细
            <input
              type="range"
              min="1"
              max="30"
              value={strokeWidth}
              onChange={(e) => {
                const v = Number(e.target.value)
                // 双槽记忆：文字工具调文字槽，其他工具调共享绘制槽
                if (tool === 'text') setTextWidth(v)
                else setDrawWidth(v)
              }}
              className="w-20"
            />
            <span className="w-5 text-right text-gold">{strokeWidth}</span>
          </label>
          <span className="mx-0.5 h-4 w-px bg-border" />
          <button type="button" onClick={undo} disabled={!canUndo} className={toolBtnCls(false)}>
            后退
          </button>
          <button type="button" onClick={redo} disabled={redoCount === 0} className={toolBtnCls(false)}>
            前进
          </button>
          <button type="button" onClick={clearAll} disabled={elements.length === 0} className={toolBtnCls(false)}>
            清空
          </button>
          <button
            type="button"
            onClick={() => setCollapsed(true)}
            title="收起为悬浮球（点击悬浮球重新展开）"
            className="rounded-md border border-gold px-2 py-1 text-xs text-gold transition-colors hover:bg-goldSoft"
          >
            收起
          </button>
        </div>
        </div>
        ),
        document.body,
      )}
    </>
  )
}
