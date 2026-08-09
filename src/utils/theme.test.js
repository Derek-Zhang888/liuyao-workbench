/**
 * 主题工具测试（玄穹方案 · 界面主题三选）
 */
import { describe, expect, it, beforeEach } from 'vitest'
import { THEME_KEY, applyTheme, getTheme, setTheme, systemDark } from './theme.js'

describe('theme 工具（玄穹主题三选）', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.classList.remove('dark')
    // matchMedia mock：默认浅色系统偏好
    if (!window.matchMedia) {
      window.matchMedia = () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} })
    }
  })

  it('默认跟随系统：未保存设置时返回 system', () => {
    expect(getTheme()).toBe('system')
  })

  it('systemDark：读取系统偏好', () => {
    expect(typeof systemDark()).toBe('boolean')
  })

  it('applyTheme：无保存设置时按系统浅色（默认 mock）不启用 dark', () => {
    expect(applyTheme()).toBe(false)
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })

  it('setTheme：保存并应用深色，html 加 dark 类', () => {
    expect(setTheme('dark')).toBe(true)
    expect(localStorage.getItem(THEME_KEY)).toBe('dark')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })

  it('setTheme：保存并应用浅色，html 移除 dark 类', () => {
    setTheme('dark')
    expect(setTheme('light')).toBe(false)
    expect(localStorage.getItem(THEME_KEY)).toBe('light')
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })

  it('applyTheme：保存深色后重新应用（模拟重启）仍为深色', () => {
    setTheme('dark')
    document.documentElement.classList.remove('dark')
    expect(applyTheme()).toBe(true)
  })

  it('applyTheme：保存浅色后重新应用不启用 dark', () => {
    setTheme('light')
    expect(applyTheme()).toBe(false)
  })
})
