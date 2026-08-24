import { describe, it, expect } from 'vitest'
import { paletteColor, isPaleOrGray, tagActiveStyle } from './presetTags.js'

describe('paletteColor 循环取色', () => {
  it('按序号取色，越界循环回首位', () => {
    expect(paletteColor(0)).toBe('#22d3ee')
    expect(paletteColor(9)).toBe('#e5e7eb')
    expect(paletteColor(10)).toBe('#22d3ee') // 循环
    expect(paletteColor(-1)).toBe('#e5e7eb') // 负数也归一化
  })
})

describe('isPaleOrGray 灰/浅色判定（选中态褪色保护）', () => {
  it('灰系（低饱和）判为 true', () => {
    expect(isPaleOrGray('#9ca3af')).toBe(true) // 预设「其他」中灰
    expect(isPaleOrGray('#e5e7eb')).toBe(true) // 调色板浅灰
    expect(isPaleOrGray('#8b93a7')).toBe(true) // muted 灰蓝
    expect(isPaleOrGray('#000000')).toBe(true) // 纯黑/纯白饱和度 0
    expect(isPaleOrGray('#ffffff')).toBe(true)
  })
  it('彩色标签判为 false', () => {
    expect(isPaleOrGray('#d4af37')).toBe(false) // 占财运 金
    expect(isPaleOrGray('#60a5fa')).toBe(false) // 考试 蓝
    expect(isPaleOrGray('#f87171')).toBe(false) // 红
    expect(isPaleOrGray('#5b6be0')).toBe(false) // 品牌紫蓝
    expect(isPaleOrGray('#fbbf24')).toBe(false) // 工作 琥珀
  })
  it('非法输入安全返回 false', () => {
    expect(isPaleOrGray('')).toBe(false)
    expect(isPaleOrGray(undefined)).toBe(false)
    expect(isPaleOrGray('red')).toBe(false)
    expect(isPaleOrGray('#zzz')).toBe(false)
  })
})

describe('tagActiveStyle 选中态配色（彩色用自身色 / 灰浅 fallback 品牌紫蓝）', () => {
  it('彩色标签用自身色（与旧方案一致）', () => {
    expect(tagActiveStyle('#60a5fa')).toEqual({
      borderColor: '#60a5fa',
      color: '#60a5fa',
      background: '#60a5fa1f',
    })
  })
  it('灰/浅标签 fallback 品牌紫蓝', () => {
    expect(tagActiveStyle('#9ca3af')).toEqual({
      borderColor: 'rgb(var(--gold-rgb))',
      color: 'rgb(var(--gold-rgb))',
      background: 'var(--gold-soft)',
    })
  })
})
