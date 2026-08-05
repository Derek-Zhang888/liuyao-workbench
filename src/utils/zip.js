/**
 * 极简 zip 生成器（Stored 模式 = 不压缩，纯打包）
 *
 * 与 PKWARE APPNOTE 6.3.x 兼容：CRC32 + Stored(0) + UTF-8 文件名 (general purpose bit 11)。
 * 无外部依赖，单文件 ≤ 80 行，浏览器端可用。
 *
 * 用法：
 *   const buf = createZip([{name: 'a.md', data: utf8Bytes}, ...])
 *   const blob = new Blob([buf], {type: 'application/zip'})
 */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

/** data: Uint8Array → CRC32（PKZIP 多项式） */
export function crc32(data) {
  let c = 0xffffffff
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

/** UTF-8 字符串 → Uint8Array（TextEncoder 已存在于现代浏览器与 Node 18+） */
export function utf8(s) {
  return new TextEncoder().encode(s)
}

/** Date → 'YYYY-MM-DD HH:mm'（本地时区） */
export function stamp(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

/** DOS 时间（仅精确到 2 秒，足够批量导出场景） */
function dosTime(d) {
  const sec = Math.floor(d.getSeconds() / 2)
  return ((d.getHours() & 0x1f) << 11) | ((d.getMinutes() & 0x3f) << 5) | (sec & 0x1f)
}
/** DOS 日期（1980-2107） */
function dosDate(d) {
  return (
    ((d.getFullYear() - 1980) << 9) |
    (((d.getMonth() + 1) & 0xf) << 5) |
    (d.getDate() & 0x1f)
  )
}

/**
 * 创建 zip 二进制内容（Stored 模式）
 * @param {Array<{name:string, data:Uint8Array}>} files
 * @param {Date} [ts] 文件时间戳
 * @returns {Uint8Array}
 */
export function createZip(files, ts = new Date()) {
  const time = dosTime(ts)
  const date = dosDate(ts)
  // UTF-8 文件名 + general purpose bit 11 标志
  const entries = files.map((f) => ({
    name: utf8(f.name),
    data: f.data,
    crc: crc32(f.data),
    offset: 0,
  }))

  const localParts = []
  const centralParts = []
  let offset = 0

  for (const e of entries) {
    e.offset = offset
    const header = new Uint8Array(30 + e.name.length)
    const dv = new DataView(header.buffer)
    dv.setUint32(0, 0x04034b50, true) // local file header signature
    dv.setUint16(4, 20, true) // version needed
    dv.setUint16(6, 1 << 11, true) // general purpose bit flag: UTF-8
    dv.setUint16(8, 0, true) // method: Stored
    dv.setUint16(10, time, true)
    dv.setUint16(12, date, true)
    dv.setUint32(14, e.crc, true)
    dv.setUint32(18, e.data.length, true) // compressed size
    dv.setUint32(22, e.data.length, true) // uncompressed size
    dv.setUint16(26, e.name.length, true)
    dv.setUint16(28, 0, true) // extra length
    header.set(e.name, 30)
    localParts.push(header, e.data)
    offset += header.length + e.data.length
  }

  const centralSizeStart = offset
  for (const e of entries) {
    const header = new Uint8Array(46 + e.name.length)
    const dv = new DataView(header.buffer)
    dv.setUint32(0, 0x02014b50, true) // central dir file header signature
    dv.setUint16(4, 20, true) // version made by
    dv.setUint16(6, 20, true) // version needed
    dv.setUint16(8, 1 << 11, true) // general purpose bit flag
    dv.setUint16(10, 0, true) // method
    dv.setUint16(12, time, true)
    dv.setUint16(14, date, true)
    dv.setUint32(16, e.crc, true)
    dv.setUint32(20, e.data.length, true)
    dv.setUint32(24, e.data.length, true)
    dv.setUint16(28, e.name.length, true)
    dv.setUint16(30, 0, true) // extra
    dv.setUint16(32, 0, true) // comment
    dv.setUint16(34, 0, true) // disk
    dv.setUint16(36, 0, true) // internal attr
    dv.setUint32(38, 0, true) // external attr
    dv.setUint32(42, e.offset, true)
    header.set(e.name, 46)
    centralParts.push(header)
  }
  const centralSize = centralParts.reduce((s, p) => s + p.length, 0)
  offset += centralSize

  // End of central directory record
  const eocd = new Uint8Array(22)
  const edv = new DataView(eocd.buffer)
  edv.setUint32(0, 0x06054b50, true)
  edv.setUint16(4, 0, true) // disk
  edv.setUint16(6, 0, true) // central dir disk
  edv.setUint16(8, entries.length, true) // entries on this disk
  edv.setUint16(10, entries.length, true) // total entries
  edv.setUint32(12, centralSize, true)
  edv.setUint32(16, centralSizeStart, true)
  edv.setUint16(20, 0, true) // comment length
  offset += eocd.length

  // 拼接
  const out = new Uint8Array(offset)
  let p = 0
  for (const part of localParts) { out.set(part, p); p += part.length }
  for (const part of centralParts) { out.set(part, p); p += part.length }
  out.set(eocd, p)
  return out
}