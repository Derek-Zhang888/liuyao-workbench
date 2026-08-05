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
