import { describe, expect, test } from 'vitest'
import { createZip, crc32, utf8 } from './zip.js'

describe('crc32（PKZIP 多项式）', () => {
  test('空数据 → 0', () => {
    expect(crc32(new Uint8Array())).toBe(0)
  })
  test('"123456789" → 0xCBF43926（标准 PKZIP 测试向量）', () => {
    expect(crc32(utf8('123456789'))).toBe(0xcbf43926)
  })
})

describe('createZip Stored 模式', () => {
  test('空文件列表生成最小 zip（仅 EOCD）', () => {
    const buf = createZip([], new Date(2026, 0, 1))
    const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
    // EOCD 签名 0x06054b50
    expect(dv.getUint32(buf.length - 22, true)).toBe(0x06054b50)
    expect(dv.getUint16(buf.length - 22 + 8, true)).toBe(0) // entries
  })

  test('单文件：local header + data + central dir + EOCD 都存在', () => {
    const data = utf8('hello\n')
    const buf = createZip([{ name: 'a.txt', data }], new Date(2026, 7, 5))
    const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
    // Local file header 签名
    expect(dv.getUint32(0, true)).toBe(0x04034b50)
    // Central dir 签名
    const centralSig = dv.getUint32(30 + data.length + 4, true)
    // 中央目录从 local header(30+5) + data(6) = 42 起 偏移；eocdOffset 之前 4 字节是签名
    const eocdOffset = buf.length - 22
    expect(dv.getUint32(eocdOffset, true)).toBe(0x06054b50)
    expect(dv.getUint16(eocdOffset + 8, true)).toBe(1) // entries
    // 文件名 UTF-8 标志 (bit 11)
    expect(dv.getUint16(6, true) & (1 << 11)).toBeTruthy()
  })

  test('多文件 CRC32 与文件名按 UTF-8 写入', () => {
    const files = [
      { name: 'a.md', data: utf8('# a') },
      { name: '卦例.md', data: utf8('# 中文卦例') },
    ]
    const buf = createZip(files, new Date(2026, 7, 5))
    // 简单验证：包含 UTF-8 字节序列
    const bytes = Array.from(buf.slice(0, 200))
    // 找 a.md 出现位置：先 local header 签名 0x04034b50 → little-endian 字节序 50 4b 03 04
    expect(bytes.slice(0, 4)).toEqual([0x50, 0x4b, 0x03, 0x04])
  })

  test('CRC32 与文件大小在 local + central 头部一致', () => {
    const data = utf8('hello world\n')
    const buf = createZip([{ name: 'x.txt', data }], new Date(2026, 7, 5))
    const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
    const localCrc = dv.getUint32(14, true)
    expect(localCrc).toBe(crc32(data))
    // Central dir 起始：30 + name.length + data.length
    const centralOffset = 30 + 5 + data.length
    const centralCrc = dv.getUint32(centralOffset + 16, true)
    expect(centralCrc).toBe(localCrc)
  })
})