/**
 * 真太阳时校准面板（六爻工作台）
 *
 * 自包含组件：开启/关闭开关 + 国家→城市两级下拉 + 手动经度/时区输入 + 保存/清除。
 * 状态持久化到 IndexedDB（src/db/trueSolarSettings.js，键 trueSolarEnabled / trueSolarConfig），
 * 挂载时读取回填；不依赖父组件状态——排盘页每次起卦时另行读取设置决定 trueSolar 参数。
 *
 * 原位于设置页（SettingsPage），用户反馈难找，已整体迁移到起卦页（QiguaSelector 起卦表单
 * 起卦时间输入区下方），本组件保持原设置页全部交互与文案逻辑不变。
 */
import { useEffect, useRef, useState } from 'react'
import {
  loadTrueSolarSettings,
  saveTrueSolarSettings,
  saveTrueSolarEnabled,
  configFromCity,
  configFromManual,
} from '../db/trueSolarSettings.js'
import { COUNTRY_NAMES, citiesOf, cityLabel } from '../data/cities.js'

/** 真太阳时设置输入控件统一样式 */
const tsInputCls =
  'rounded-md border border-border bg-bg px-3 py-1.5 text-sm text-text outline-none transition-colors focus:border-gold'

/**
 * 真太阳时校准面板
 * @param {{ className?: string }} props 附加类名（用于外层间距控制）
 */
export default function TrueSolarPanel({ className = '' }) {
  // 开关与配置
  const [tsEnabled, setTsEnabled] = useState(false)
  const [tsConfig, setTsConfig] = useState(null)
  // 国家 → 城市下拉（仅城市选择即存，切换国家不落库）
  const [tsCountry, setTsCountry] = useState('中国')
  const [tsCity, setTsCity] = useState('')
  // 手动经度 + UTC 时区输入
  const [manualEW, setManualEW] = useState('E')
  const [manualLng, setManualLng] = useState('')
  const [manualTz, setManualTz] = useState('8')
  // 提示 / 错误
  const [tsMsg, setTsMsg] = useState('')
  const [tsError, setTsError] = useState('')
  // 用户是否已先行操作：挂载读取为异步，若用户在读取完成前就切换/配置，
  // 丢弃较旧的读取结果，避免把用户刚做的修改覆盖回去（竞态防御）
  const userTouched = useRef(false)

  /** 挂载时读取设置回填：开关状态 + 已有城市配置回填国家/城市下拉 */
  useEffect(() => {
    ;(async () => {
      try {
        const ts = await loadTrueSolarSettings()
        if (userTouched.current) return // 用户已先行操作，忽略本次读取
        setTsEnabled(ts.enabled)
        setTsConfig(ts.config)
        if (ts.config?.source === 'city') {
          setTsCountry(ts.config.country ?? '中国')
          setTsCity(ts.config.city ?? '')
        }
      } catch (_) { /* 读取失败按默认（关闭、无配置）处理 */ }
    })()
  }, [])

  /** 开关切换：只持久化开关状态，配置键保持原样（任何时刻切换都不会清掉配置） */
  const handleTsToggle = async (enabled) => {
    userTouched.current = true
    setTsEnabled(enabled)
    setTsError('')
    // 竞态防御：挂载读取（loadTrueSolarSettings）为异步，若用户在其完成前切换开关，
    // 闭包 tsConfig 仍为初始 null。若此时把整份设置（enabled + config）落库，会把库中
    // 已有配置（如北京）误清为 null。因此开关切换只写 trueSolarEnabled 键、绝不触碰
    // trueSolarConfig 键（持久化层新增 saveTrueSolarEnabled，仅写开关键）——从根上
    // 消除「用户操作覆盖读取中的配置」的可能，也不引入新的读写竞态。
    await saveTrueSolarEnabled(enabled)
    // 读取库中最新配置用于 UI 回显（仅读不写，不会覆盖任何配置）
    let latest = null
    try {
      latest = await loadTrueSolarSettings()
    } catch (_) {
      /* 读取失败保持当前内存显示 */
    }
    const cfg = latest?.config ?? tsConfig
    setTsConfig(cfg)
    if (cfg?.source === 'city') {
      setTsCountry(cfg.country ?? '中国')
      setTsCity(cfg.city ?? '')
    }
    setTsMsg(
      enabled
        ? cfg
          ? `已开启真太阳时校准（${cityLabel(cfg)}）`
          : '已开启真太阳时校准；请选择起卦城市或手动输入经度后保存，否则起卦将按北京时间排盘。'
        : '已关闭真太阳时校准（排盘恢复按北京时间）',
    )
  }

  /** 国家切换：重置城市选择（未保存前不落库） */
  const handleTsCountry = (country) => {
    userTouched.current = true
    setTsCountry(country)
    setTsCity('')
    setTsError('')
  }

  /** 城市选择即存：生成配置并持久化 */
  const handleTsCity = async (city) => {
    userTouched.current = true
    setTsCity(city)
    setTsError('')
    if (!city) return
    const cfg = configFromCity(tsCountry, city)
    const saved = await saveTrueSolarSettings({ enabled: tsEnabled, config: cfg })
    setTsConfig(saved.config)
    setTsMsg(`已保存起卦城市：${cityLabel(saved.config)}`)
  }

  /** 手动经度保存：校验后持久化 */
  const handleTsManualSave = async () => {
    userTouched.current = true
    setTsError('')
    const lngNum = Number(manualLng)
    const tzNum = Number(manualTz)
    if (!Number.isFinite(lngNum) || lngNum <= 0 || lngNum > 180) {
      setTsError('经度须为 0-180 的数值')
      return
    }
    if (!Number.isFinite(tzNum) || tzNum < -12 || tzNum > 14) {
      setTsError('UTC 时区偏移须为 -12 ~ +14 小时')
      return
    }
    const lng = manualEW === 'W' ? -lngNum : lngNum
    const cfg = configFromManual(lng, Math.round(tzNum * 60))
    if (!cfg) {
      setTsError('手动经度配置非法，请检查输入')
      return
    }
    const saved = await saveTrueSolarSettings({ enabled: tsEnabled, config: cfg })
    setTsConfig(saved.config)
    setTsCountry('中国')
    setTsCity('')
    setTsMsg(`已保存手动经度配置：${cityLabel(saved.config)}`)
  }

  /** 清除配置（保留开关状态） */
  const handleTsClear = async () => {
    userTouched.current = true
    setTsError('')
    const saved = await saveTrueSolarSettings({ enabled: tsEnabled, config: null })
    setTsConfig(saved.config)
    setTsCity('')
    setTsMsg('已清除起卦城市配置（开关保持当前状态）')
  }

  return (
    <div className={`space-y-2 rounded-lg border border-border bg-bg p-3 ${className}`}>
      {/* 标题 + 开关 */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm text-text">真太阳时</span>
        <label className="flex items-center gap-2 text-sm text-text">
          <input
            type="checkbox"
            checked={tsEnabled}
            onChange={(e) => handleTsToggle(e.target.checked)}
            className="h-4 w-4 accent-gold"
          />
          开启校准
        </label>
      </div>

      {tsEnabled && (
        <div className="space-y-2 border-t border-border pt-2">
          {/* 国家 → 城市 两级下拉（选择即存） */}
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <div className="mb-1 text-xs text-muted">国家</div>
              <select
                aria-label="真太阳时国家"
                value={tsCountry}
                onChange={(e) => handleTsCountry(e.target.value)}
                className={`${tsInputCls} w-28`}
              >
                {COUNTRY_NAMES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <div className="mb-1 text-xs text-muted">城市</div>
              <select
                aria-label="真太阳时城市"
                value={tsCity}
                onChange={(e) => handleTsCity(e.target.value)}
                className={`${tsInputCls} w-32`}
              >
                <option value="">请选择城市</option>
                {citiesOf(tsCountry).map((c) => (
                  <option key={c.city} value={c.city}>
                    {c.city}
                  </option>
                ))}
              </select>
            </div>
            <span className="text-xs text-muted">选择城市即保存（含经度与时区）</span>
          </div>

          {/* 手动输入经度 + 时区 */}
          <div className="flex flex-wrap items-end gap-3 border-t border-border pt-2">
            <div>
              <div className="mb-1 text-xs text-muted">经度</div>
              <div className="flex gap-1">
                <select
                  aria-label="经度方向"
                  value={manualEW}
                  onChange={(e) => setManualEW(e.target.value)}
                  className={`${tsInputCls} w-14`}
                >
                  <option value="E">东经</option>
                  <option value="W">西经</option>
                </select>
                <input
                  aria-label="经度数值"
                  type="number"
                  min="0"
                  max="180"
                  step="0.1"
                  value={manualLng}
                  onChange={(e) => setManualLng(e.target.value)}
                  placeholder="0-180"
                  className={`${tsInputCls} w-24`}
                />
              </div>
            </div>
            <div>
              <div className="mb-1 text-xs text-muted">UTC 时区（小时）</div>
              <input
                aria-label="UTC 时区"
                type="number"
                min="-12"
                max="14"
                step="0.5"
                value={manualTz}
                onChange={(e) => setManualTz(e.target.value)}
                placeholder="如 8 / -5"
                className={`${tsInputCls} w-24`}
              />
            </div>
            <button
              type="button"
              onClick={handleTsManualSave}
              className="rounded-md border border-gold px-3 py-1.5 text-sm text-gold transition-colors hover:bg-goldSoft"
            >
              保存手动经度
            </button>
            <span className="text-xs text-muted">就近城市优先，手动输入用于城市表未覆盖地点</span>
          </div>

          {/* 当前配置 */}
          <div className="flex flex-wrap items-center gap-2 border-t border-border pt-2 text-sm">
            <span className="text-muted">当前配置：</span>
            {tsConfig ? (
              <>
                <span className="text-gold">{cityLabel(tsConfig)}</span>
                <button
                  type="button"
                  onClick={handleTsClear}
                  className="text-xs text-muted transition-colors hover:text-red"
                >
                  清除
                </button>
              </>
            ) : (
              <span className="text-red">未配置（开启后未配置城市时起卦将按北京时间排盘）</span>
            )}
          </div>
        </div>
      )}

      {tsMsg && <div className="text-xs text-gold">{tsMsg}</div>}
      {tsError && <div className="text-xs text-red">{tsError}</div>}
    </div>
  )
}
