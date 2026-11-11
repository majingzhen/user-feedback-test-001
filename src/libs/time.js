// 时间格式化
const pad = (n, w = 2) => String(n).padStart(w, '0')

// 秒 -> HH:MM:SS.mmm
export const formatTimecode = (sec) => {
  const s = Math.max(0, sec)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = Math.floor(s % 60)
  const ms = Math.round((s % 1) * 1000)
  return `${pad(h)}:${pad(m)}:${pad(ss)}.${pad(ms, 3)}`
}

// 秒 -> M:SS（素材列表用）
export const formatDuration = (sec) => {
  const s = Math.max(0, Math.round(sec))
  return `${Math.floor(s / 60)}:${pad(s % 60)}`
}
