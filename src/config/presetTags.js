/**
 * 预置标签列表（Task 9）
 * 首次使用时自动写入 tags 表（见 tagsRepo.ensurePresetTags，仅种子一次）；
 * 之后一律以 tags 表为准：用户删除的预置标签不会被再次种回。
 * 颜色取暗色主题友好色（Tailwind 风格十六进制，可直接用于 inline style）。
 */
/** 自定义/自动新建标签的默认色板（按序号循环取色） */
export const TAG_PALETTE = [
  '#22d3ee', '#f87171', '#facc15', '#34d399', '#60a5fa',
  '#f97316', '#e879f9', '#a78bfa', '#fbbf24', '#e5e7eb',
];

/** 按序号取色（循环） */
export function paletteColor(i) {
  return TAG_PALETTE[((i % TAG_PALETTE.length) + TAG_PALETTE.length) % TAG_PALETTE.length];
}

/**
 * 判断标签色是否「灰/浅」（低饱和）——此类色用于选中态上色会褪色看不清。
 * 用 HSV 饱和度判定：灰系（如 #9ca3af / #e5e7eb / #8b93a7）饱和度 < 0.25。
 */
export function isPaleOrGray(hex) {
  if (typeof hex !== 'string' || hex[0] !== '#' || hex.length < 7) return false;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  if ([r, g, b].some((v) => Number.isNaN(v))) return false;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const s = max === 0 ? 0 : (max - min) / max; // HSV 饱和度（灰 = 0）
  return s < 0.25;
}

/**
 * 标签选中态配色（v1.3.2 拍板：保留旧方案按 t.color 上色，仅灰/浅色 fallback）：
 *   - 彩色标签 → 用自身色（与原视觉一致）
 *   - 灰/浅色标签 → fallback 品牌紫蓝（显眼，避免选中态"褪色"）
 * 圆点（色彩身份）始终用 t.color，与本函数无关。
 */
export function tagActiveStyle(hex) {
  if (!isPaleOrGray(hex)) return { borderColor: hex, color: hex, background: hex + '1f' };
  return {
    borderColor: 'rgb(var(--gold-rgb))',
    color: 'rgb(var(--gold-rgb))',
    background: 'var(--gold-soft)',
  };
}

export const PRESET_TAGS = [
  { name: '占病', color: '#c0392b' },
  { name: '占财运', color: '#d4af37' },
  { name: '占婚姻', color: '#e879f9' },
  { name: '出行', color: '#22d3ee' },
  { name: '考试', color: '#60a5fa' },
  { name: '寻物', color: '#f97316' },
  { name: '等反馈', color: '#a78bfa' },
  { name: '代占卦', color: '#34d399' },
  { name: '工作', color: '#fbbf24' },
  { name: '学业', color: '#818cf8' },
  { name: '天气', color: '#38bdf8' },
  { name: '其他', color: '#9ca3af' },
]
