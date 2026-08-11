/**
 * 占断输入区（Task 9 / v0.2 功能 D）
 *
 * 受控组件：value = {
 *   background,                        // v0.2 新增：占问背景（卦题→背景→断语 顺序）
 *   duanyu, yingqi, beizhu, fankui,   // 四个文本域（beizhu UI 标签为「笔记」，字段名不变）
 *   jixiong: '' | '吉' | '凶',        // 吉凶勾选（v0.2 功能 H 改为非必选，未选保存为「待占断」）
 *   status: '未反馈' | '已反馈',       // 反馈状态（默认未反馈）
 *   jixiongOk / yingqiOk / fangweiOk: '' | '对' | '错'  // 建议4 #2 去掉留空；吉凶对错必选、应期方位可选
 * }                                    // 勾选已反馈后展开的对错记录
 *
 * v0.10 建议4 #6：反馈/备注 textarea 位置互换；取消已反馈自动清空三项对错 + 归入未反馈。
 */

import { useEffect, useLayoutEffect, useRef } from 'react'

const textAreaCls =
  'w-full resize-y rounded-md border border-border bg-bg px-3 py-2 text-sm text-text outline-none transition-colors focus:border-gold'

/** 占断文本框高度惰性记忆（v1.2.0 Bug1）：手动下拉扩长后切页/重挂载保持；
 *  sessionStorage 三端各自本地，行为一致（三端同步 = 惰性语义一致） */
const DUAN_H_KEY = 'liuyao-duan-h'

function readDuanHeights() {
  try {
    const raw = sessionStorage.getItem(DUAN_H_KEY)
    if (raw) {
      const v = JSON.parse(raw)
      if (v && typeof v === 'object') return v
    }
  } catch (_) { /* 解析失败按空 */ }
  return {}
}

function saveDuanHeight(field, height) {
  if (!Number.isFinite(height) || height <= 0) return
  try {
    const v = readDuanHeights()
    v[field] = Math.round(height)
    sessionStorage.setItem(DUAN_H_KEY, JSON.stringify(v))
  } catch (_) { /* 静默 */ }
}

const pillCls = (active) =>
  `rounded-md border px-3 py-1 text-sm transition-colors ${
    active ? 'border-gold bg-goldSoft text-gold' : 'border-border text-muted hover:text-text'
  }`

/** 对/错 二选行（v0.10 建议4 #2 去掉留空）；不点保持未选，点同一项切换无效 */
function DuiCuoRow({ label, required, value, onChange }) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="w-20 shrink-0 text-muted">
        {label}
        {required && <span className="text-red">*</span>}
      </span>
      {['对', '错'].map((o) => (
        <button key={o} type="button" onClick={() => onChange(o)} className={pillCls(value === o)}>
          {o}
        </button>
      ))}
      {required && !value && <span className="text-xs text-red">必选</span>}
    </div>
  )
}

export default function DuanInput({ value, onChange }) {
  const set = (k, v) => onChange({ ...value, [k]: v })
  const fed = value.status === '已反馈'

  // ---- 文本框高度惰性（v1.2.0 Bug1）：挂载时恢复上次手动 resize 的高度；
  // 松开（pointerup）时记录当前高度；React 不管理 style.height，重渲染不覆盖。 ----
  const taRefs = useRef({})
  const taRef = (field) => (el) => { taRefs.current[field] = el }
  useLayoutEffect(() => {
    const saved = readDuanHeights()
    for (const [f, h] of Object.entries(saved)) {
      const el = taRefs.current[f]
      if (el && Number(h) > 30) el.style.height = `${Number(h)}px`
    }
  }, [])
  /** 文本框指针松开 → 记录高度（resize 手柄拖完触发） */
  const recordH = (field) => () => {
    const el = taRefs.current[field]
    if (el) saveDuanHeight(field, el.offsetHeight)
  }

  // 取消已反馈：自动清空三项对错并归入未反馈（v0.10 建议4 #6）
  // v0.10 改进建7 #2：取消吉凶已在 click 内同步清对错+回未反馈，此处仅兜底
  // （三项对错已空时不再重复回调，避免多余渲染）
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  const prevStatusRef = useRef(value.status)
  useEffect(() => {
    if (prevStatusRef.current === '已反馈' && value.status === '未反馈') {
      if (value.jixiongOk || value.yingqiOk || value.fangweiOk) {
        onChangeRef.current({
          ...value,
          jixiongOk: '',
          yingqiOk: '',
          fangweiOk: '',
        })
      }
    }
    prevStatusRef.current = value.status
  }, [value.status, value])

  return (
    <div className="space-y-4">
      {/* 背景（v0.2 功能 D）：卦题→背景→断语 顺序；旧卦例无 background 字段时默认空 */}
      <div>
        <div className="mb-1.5 text-sm text-muted">背景</div>
        <textarea
          ref={taRef('background')}
          onPointerUp={recordH('background')}
          rows={2}
          className={textAreaCls}
          placeholder="占问背景（事由、双方关系、环境等）…"
          value={value.background}
          onChange={(e) => set('background', e.target.value)}
        />
      </div>

      {/* 断语 / 应期 / 方位（v0.10 建议5 #1：应期下加方位文本框） */}
      <div className="space-y-3">
        <div>
          <div className="mb-1.5 text-sm text-muted">断语</div>
          <textarea
            ref={taRef('duanyu')}
            onPointerUp={recordH('duanyu')}
            rows={4}
            className={textAreaCls}
            placeholder="占断结论…"
            value={value.duanyu}
            onChange={(e) => set('duanyu', e.target.value)}
          />
        </div>
        <div>
          <div className="mb-1.5 text-sm text-muted">应期</div>
          <textarea
            ref={taRef('yingqi')}
            onPointerUp={recordH('yingqi')}
            rows={2}
            className={textAreaCls}
            placeholder="应期预测…"
            value={value.yingqi}
            onChange={(e) => set('yingqi', e.target.value)}
          />
        </div>
        <div>
          <div className="mb-1.5 text-sm text-muted">方位</div>
          <textarea
            ref={taRef('fangwei')}
            onPointerUp={recordH('fangwei')}
            rows={2}
            className={textAreaCls}
            placeholder="方位预测…（有文字时卦例库未反馈卡片显示方位标志）"
            value={value.fangwei}
            onChange={(e) => set('fangwei', e.target.value)}
          />
        </div>
      </div>

      {/* 反馈 / 备注（v0.10 建议4 #6 互换位置：反馈在前） */}
      <div className="space-y-3">
        <div>
          <div className="mb-1.5 text-sm text-muted">反馈</div>
          <textarea
            ref={taRef('fankui')}
            onPointerUp={recordH('fankui')}
            rows={3}
            className={textAreaCls}
            placeholder="实际应验情况…"
            value={value.fankui}
            onChange={(e) => set('fankui', e.target.value)}
          />
        </div>
        <div>
          <div className="mb-1.5 text-sm text-muted">笔记</div>
          <textarea
            ref={taRef('beizhu')}
            onPointerUp={recordH('beizhu')}
            rows={3}
            className={textAreaCls}
            placeholder="笔记…"
            value={value.beizhu}
            onChange={(e) => set('beizhu', e.target.value)}
          />
        </div>
      </div>

      {/* 吉凶：v0.2 功能 H 改为非必选（未选保存为「待占断」）；v0.10 点击已选中项再次点击取消选中（jixiong 回 ''）
          v0.10 改进建7 #2：取消吉凶且已勾选已反馈 → 自动取消反馈（status 回未反馈）、清除已登记对错（jixiongOk 等） */}
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="text-muted">吉凶</span>
        {['吉', '凶'].map((g) => (
          <button
            key={g}
            type="button"
            onClick={() => {
              const next = value.jixiong === g ? '' : g
              if (next === '' && value.status === '已反馈') {
                onChange({
                  ...value,
                  jixiong: '',
                  status: '未反馈',
                  jixiongOk: '',
                  yingqiOk: '',
                  fangweiOk: '',
                })
              } else {
                set('jixiong', next)
              }
            }}
            className={pillCls(value.jixiong === g)}
          >
            {g}
          </button>
        ))}
        {value.jixiong && (
          <span className={`text-xs ${value.jixiong === '吉' ? 'text-gold' : 'text-red'}`}>
            {value.jixiong === '吉' ? '大吉之象' : '凶象需防'}
          </span>
        )}
      </div>

      {/* 反馈状态（v0.2 功能 H：未选吉凶时不可标记已反馈，与「已反馈需吉凶对错」校验自洽） */}
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="text-muted">反馈状态</span>
        <button
          type="button"
          disabled={!value.jixiong}
          onClick={() => set('status', fed ? '未反馈' : '已反馈')}
          className={`${pillCls(fed)} disabled:cursor-not-allowed disabled:opacity-40`}
          title={value.jixiong ? '' : '请先选择吉凶（吉/凶）再标记已反馈'}
        >
          {fed ? '✓ 已反馈' : '已反馈'}
        </button>
        <span className="text-xs text-muted">
          {fed ? '已登记反馈结果，可补充对错记录' : '默认未反馈，勾选后展开对错记录'}
        </span>
      </div>

      {/* 已反馈 → 对错记录 */}
      {fed && (
        <div className="space-y-3 rounded-lg border border-border bg-bg p-3">
          <DuiCuoRow
            label="吉凶对错"
            required
            value={value.jixiongOk}
            onChange={(v) => set('jixiongOk', v)}
          />
          <DuiCuoRow
            label="应期对错"
            value={value.yingqiOk}
            onChange={(v) => set('yingqiOk', v)}
          />
          <DuiCuoRow
            label="方位对错"
            value={value.fangweiOk}
            onChange={(v) => set('fangweiOk', v)}
          />
          {!value.jixiongOk && (
            <p className="text-xs text-red">吉凶对错为必填项（对/错/留空三选一）</p>
          )}
        </div>
      )}
    </div>
  )
}
