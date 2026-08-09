/**
 * TrueSolarPanel 真太阳时面板测试（起卦页 UI）
 *
 * 覆盖：默认关闭不展开 → 开启展开配置区并提示未配置 → 选择城市即存 IndexedDB →
 * 挂载回填已有配置 → 手动经度保存 → 清除配置。持久化走 fake-indexeddb 的 settings 表。
 */
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { openDB } from '../db/index.js'
import * as tsModule from '../db/trueSolarSettings.js'
import { loadTrueSolarSettings, saveTrueSolarSettings } from '../db/trueSolarSettings.js'
import TrueSolarPanel from './TrueSolarPanel.jsx'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

/** 每用例前清空 settings 表（复用同一连接，避免重建库） */
beforeEach(async () => {
  const db = await openDB()
  await new Promise((resolve, reject) => {
    const tx = db.transaction('settings', 'readwrite')
    tx.objectStore('settings').clear()
    tx.oncomplete = resolve
    tx.onerror = () => reject(tx.error)
  })
})

describe('TrueSolarPanel 真太阳时面板（起卦页）', () => {
  test('默认渲染：开关关闭，不展示配置区', () => {
    render(<TrueSolarPanel />)
    const cb = screen.getByRole('checkbox', { name: '开启校准' })
    expect(cb.checked).toBe(false)
    expect(screen.queryByLabelText('真太阳时国家')).toBeNull()
    expect(screen.queryByText('当前配置：')).toBeNull()
  })

  test('开启后展开配置区并提示未配置（按北京时间排盘）', async () => {
    render(<TrueSolarPanel />)
    fireEvent.click(screen.getByRole('checkbox', { name: '开启校准' }))

    expect(await screen.findByText('当前配置：')).toBeTruthy()
    expect(screen.getByText('未配置（开启后未配置城市时起卦将按北京时间排盘）')).toBeTruthy()
    // 国家 → 城市两级下拉 + 手动输入均可用
    expect(screen.getByLabelText('真太阳时国家')).toBeTruthy()
    expect(screen.getByLabelText('真太阳时城市')).toBeTruthy()
    expect(screen.getByLabelText('经度数值')).toBeTruthy()
    expect(screen.getByLabelText('UTC 时区')).toBeTruthy()
    // 开关状态已持久化
    const s = await loadTrueSolarSettings()
    expect(s.enabled).toBe(true)
    expect(s.config).toBeNull()
  })

  test('选择城市即保存到 IndexedDB，并回显配置', async () => {
    render(<TrueSolarPanel />)
    fireEvent.click(screen.getByRole('checkbox', { name: '开启校准' }))
    await screen.findByText('当前配置：')

    // 默认国家「中国」，选择「北京」
    fireEvent.change(screen.getByLabelText('真太阳时城市'), { target: { value: '北京' } })

    expect(await screen.findByText(/已保存起卦城市：/)).toBeTruthy()
    const s = await loadTrueSolarSettings()
    expect(s.enabled).toBe(true)
    expect(s.config).toMatchObject({ source: 'city', country: '中国', city: '北京', lng: 116.407 })
  })

  test('挂载时回填已有配置：开关开启、国家/城市下拉选中', async () => {
    await saveTrueSolarSettings({ enabled: true, config: { source: 'city', country: '美国', city: '纽约', lng: -74.006, timezoneOffsetMin: -300, label: '美国·纽约（西经74.0° UTC-5）' } })

    render(<TrueSolarPanel />)

    await waitFor(() => {
      expect(screen.getByRole('checkbox', { name: '开启校准' }).checked).toBe(true)
    })
    expect(screen.getByLabelText('真太阳时国家').value).toBe('美国')
    expect(screen.getByLabelText('真太阳时城市').value).toBe('纽约')
    // 配置区默认展开并显示当前配置
    expect(screen.getByText('美国·纽约（西经74.0° UTC-5）')).toBeTruthy()
  })

  test('手动经度保存：校验通过后持久化并清除城市下拉', async () => {
    render(<TrueSolarPanel />)
    fireEvent.click(screen.getByRole('checkbox', { name: '开启校准' }))
    await screen.findByText('当前配置：')

    fireEvent.change(screen.getByLabelText('经度数值'), { target: { value: '104.1' } })
    fireEvent.change(screen.getByLabelText('UTC 时区'), { target: { value: '8' } })
    fireEvent.click(screen.getByText('保存手动经度'))

    expect(await screen.findByText(/已保存手动经度配置：/)).toBeTruthy()
    const s = await loadTrueSolarSettings()
    expect(s.config).toMatchObject({ source: 'manual', lng: 104.1, timezoneOffsetMin: 480 })
  })

  test('手动经度非法输入提示错误，不落库', async () => {
    render(<TrueSolarPanel />)
    fireEvent.click(screen.getByRole('checkbox', { name: '开启校准' }))
    await screen.findByText('当前配置：')

    fireEvent.change(screen.getByLabelText('经度数值'), { target: { value: '999' } })
    fireEvent.click(screen.getByText('保存手动经度'))

    expect(await screen.findByText('经度须为 0-180 的数值')).toBeTruthy()
    const s = await loadTrueSolarSettings()
    expect(s.config).toBeNull()
  })

  test('清除配置：保留开关状态，恢复未配置提示', async () => {
    await saveTrueSolarSettings({ enabled: true, config: { source: 'city', country: '中国', city: '北京', lng: 116.407, timezoneOffsetMin: 480, label: '中国·北京（东经116.4° UTC+8）' } })

    render(<TrueSolarPanel />)
    await waitFor(() => {
      expect(screen.getByRole('checkbox', { name: '开启校准' }).checked).toBe(true)
    })
    fireEvent.click(screen.getByText('清除'))

    expect(await screen.findByText('已清除起卦城市配置（开关保持当前状态）')).toBeTruthy()
    const s = await loadTrueSolarSettings()
    expect(s.enabled).toBe(true) // 开关保持
    expect(s.config).toBeNull()
    expect(screen.getByText('未配置（开启后未配置城市时起卦将按北京时间排盘）')).toBeTruthy()
  })

  test('竞态：挂载读取未完成时切换开关，库中已有配置不被清空', async () => {
    // 预置库：enabled=true + 北京配置（load 延迟 300ms 期间用户先点开关）
    const beijing = { source: 'city', country: '中国', city: '北京', lng: 116.407, timezoneOffsetMin: 480, label: '中国·北京（东经116.4° UTC+8）' }
    await saveTrueSolarSettings({ enabled: true, config: beijing })

    // 延迟挂载读取：首次 loadTrueSolarSettings 挂起，模拟读取未完成时 tsConfig 仍为 null；
    // 后续调用（开关切换内的重读）走真实库读取
    let resolveMountLoad = () => {}
    const mountLoadPromise = new Promise((resolve) => { resolveMountLoad = resolve })
    let callCount = 0
    const realLoad = tsModule.loadTrueSolarSettings
    const spy = vi.spyOn(tsModule, 'loadTrueSolarSettings').mockImplementation(() => {
      callCount += 1
      return callCount === 1 ? mountLoadPromise : realLoad()
    })

    render(<TrueSolarPanel />)
    // 读取未完成：开关仍为默认关闭
    expect(screen.getByRole('checkbox', { name: '开启校准' }).checked).toBe(false)

    // 用户在读取完成前点击开启
    fireEvent.click(screen.getByRole('checkbox', { name: '开启校准' }))

    // 等待保存落库（UI 消息只在 save 完成后才设置）
    expect(await screen.findByText(/已开启真太阳时校准/)).toBeTruthy()

    // 关键断言：库中配置必须保持北京，不能被误清为 null
    const after = await realLoad()
    expect(after.enabled).toBe(true)
    expect(after.config).toMatchObject({ source: 'city', country: '中国', city: '北京', lng: 116.407 })

    // 挂载读取最终返回：userTouched 已置位，应被忽略，不覆盖用户操作；UI 回显保留的配置
    resolveMountLoad({ enabled: true, config: beijing })
    await waitFor(() => {
      expect(screen.getByText('中国·北京（东经116.4° UTC+8）')).toBeTruthy()
    })
    expect(screen.getByRole('checkbox', { name: '开启校准' }).checked).toBe(true)

    spy.mockRestore()
  })
})
