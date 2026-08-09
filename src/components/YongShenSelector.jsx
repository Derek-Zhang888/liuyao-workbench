/**
 * 用神选择器（功能二：自定用神 + 高亮）
 *
 * 自包含控件区（样式与 TrueSolarPanel 协调）：六亲（父/兄/官/财/孙）与地支
 * （子…亥）两组互斥选项，点选即生效（再次点击取消）。
 *
 * 状态由 PaipanPage 持有（value/onChange），**不持久化**：刷新或重新起卦后清空。
 */
import { useState } from 'react'

/** 六亲选项（五者） */
const LIUQIN_OPTIONS = ['父', '兄', '官', '财', '孙']

/** 地支选项（十二者） */
const ZHI_OPTIONS = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥']

/** 选中样式：金色文字 + 微亮金色背景（与起卦页钱币选中一致） */
const pickCls = (active) =>
  `rounded-md border px-2.5 py-1 text-sm transition-colors ${
    active ? 'border-gold bg-goldSoft text-gold' : 'border-border bg-bg text-muted hover:text-text'
  }`

/**
 * @param {object|null} value 当前用神 {type:'liuqin'|'zhi', value}；null=未选
 * @param {(v: object|null) => void} onChange 变更回调（重新点选同一项传 null 取消）
 */
export default function YongShenSelector({ value, onChange }) {
  // 当前编辑模式：以 value 为准（未选时默认六亲）；本地仅缓存未选中时的展示模式
  const [mode, setMode] = useState('liuqin')
  const curMode = value?.type ?? mode

  /** 点击某选项：同项取消，异项选中并切换模式 */
  const pick = (type, v) => {
    if (value && value.type === type && value.value === v) {
      onChange(null)
      return
    }
    setMode(type)
    onChange({ type, value: v })
  }

  const isActive = (type, v) => value?.type === type && value?.value === v

  return (
    <section className="card rounded-xl border border-border bg-panel p-4 sm:p-5">
      <div className="mb-3">
        <h2 className="text-base font-medium text-gold">用神</h2>
        <p className="mt-0.5 text-xs text-muted">
          选六亲或地支，盘面金色高亮命中爻位；六亲五行合于月建/日建时一并高亮。选择不保存，刷新后清空。
        </p>
      </div>

      <div className="space-y-2.5 rounded-lg border border-border bg-bg p-3">
        {/* 六亲 */}
        <div className="flex flex-wrap items-center gap-1.5 text-sm">
          <span className="mr-1 w-10 shrink-0 text-muted">六亲</span>
          {LIUQIN_OPTIONS.map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => pick('liuqin', v)}
              className={pickCls(isActive('liuqin', v))}
              title={`以「${v}」为用神`}
            >
              {v}
            </button>
          ))}
        </div>
        {/* 地支 */}
        <div className="flex flex-wrap items-center gap-1.5 text-sm">
          <span className="mr-1 w-10 shrink-0 text-muted">地支</span>
          {ZHI_OPTIONS.map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => pick('zhi', v)}
              className={pickCls(isActive('zhi', v))}
              title={`以「${v}」为用神`}
            >
              {v}
            </button>
          ))}
        </div>
        {curMode === 'liuqin' ? (
          <p className="text-xs text-muted">六亲按「卦宫五行 vs 爻五行」判定；多现爻位全部高亮。</p>
        ) : (
          <p className="text-xs text-muted">地支按爻位直接匹配；多现爻位全部高亮。</p>
        )}
      </div>
    </section>
  )
}
