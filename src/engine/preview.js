// 预览引擎：Canvas 合成视频轨 + WebAudio 驱动音量包络，与导出共用 timeline_math
import { idbGet } from '@/libs'
import { opacityAt, volumeAt, activeClipAt, clipEnd } from '@/engine/timeline_math'

export const createPreviewEngine = (store) => {
  let canvas = null
  let ctx = null
  let audioCtx = null
  let rafId = null
  let lastTs = 0
  const clipMedia = new Map() // clipId -> { el, gain }
  const blobUrls = new Map() // blobKey -> objectURL

  const getBlobUrl = async (blobKey) => {
    if (!blobUrls.has(blobKey)) {
      const blob = await idbGet('media', blobKey)
      if (!blob) return null
      blobUrls.set(blobKey, URL.createObjectURL(blob))
    }
    return blobUrls.get(blobKey)
  }

  const ensureAudioCtx = () => {
    if (!audioCtx) audioCtx = new AudioContext()
    return audioCtx
  }

  // 按当前工程同步媒体元素：新片段建元素，删掉的片段回收
  const syncMedia = async () => {
    const clips = store.project.tracks.flatMap(t => t.clips)
    const alive = new Set(clips.map(c => c.id))
    for (const [id, m] of clipMedia) {
      if (!alive.has(id)) {
        m.el.pause()
        m.el.removeAttribute('src')
        m.gain.disconnect()
        clipMedia.delete(id)
      }
    }
    for (const clip of clips) {
      if (clipMedia.has(clip.id)) continue
      const source = store.getSource(clip.sourceId)
      if (!source) continue
      const url = await getBlobUrl(source.blobKey)
      if (!url) continue
      const el = document.createElement(source.type === 'video' ? 'video' : 'audio')
      el.src = url
      el.preload = 'auto'
      const actx = ensureAudioCtx()
      const gain = actx.createGain()
      gain.gain.value = 0
      actx.createMediaElementSource(el).connect(gain).connect(actx.destination)
      el.addEventListener('seeked', () => { if (!store.playing) renderFrame(store.playhead) })
      clipMedia.set(clip.id, { el, gain })
    }
  }

  const syncElementTime = (el, clip, t) => {
    const target = clip.in + (t - clip.start)
    if (Math.abs(el.currentTime - target) > 0.2) el.currentTime = target
  }

  // 与 ffmpeg scale+pad 一致的 contain 绘制
  const drawContain = (el, W, H) => {
    const vw = el.videoWidth
    const vh = el.videoHeight
    if (!vw || !vh) return
    const s = Math.min(W / vw, H / vh)
    const w = vw * s
    const h = vh * s
    ctx.drawImage(el, (W - w) / 2, (H - h) / 2, w, h)
  }

  const renderFrame = (t) => {
    if (ctx && canvas) {
      ctx.globalAlpha = 1
      ctx.fillStyle = '#000'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      for (const track of store.project.tracks.filter(tr => tr.type === 'video')) {
        const clip = activeClipAt(track, t)
        if (!clip) continue
        const m = clipMedia.get(clip.id)
        if (!m) continue
        syncElementTime(m.el, clip, t)
        const o = opacityAt(clip, store.project.transitions, t)
        if (o <= 0.001) continue
        ctx.globalAlpha = o
        drawContain(m.el, canvas.width, canvas.height)
        ctx.globalAlpha = 1
      }
    }
    for (const track of store.project.tracks) {
      for (const clip of track.clips) {
        const m = clipMedia.get(clip.id)
        if (!m) continue
        const active = t >= clip.start && t < clipEnd(clip)
        m.gain.gain.value = active ? volumeAt(clip, t) : 0
      }
    }
  }

  const tick = (ts) => {
    const dt = (ts - lastTs) / 1000
    lastTs = ts
    const next = store.playhead + dt
    if (next >= store.duration) {
      store.setPlayhead(store.duration)
      pause()
      renderFrame(store.playhead)
      return
    }
    store.setPlayhead(next)
    renderFrame(next)
    rafId = requestAnimationFrame(tick)
  }

  const play = async () => {
    if (store.playing || store.duration <= 0) return
    await syncMedia()
    await ensureAudioCtx().resume()
    for (const clip of store.project.tracks.flatMap(t => t.clips)) {
      const m = clipMedia.get(clip.id)
      if (!m) continue
      if (store.playhead >= clip.start && store.playhead < clipEnd(clip)) {
        m.el.currentTime = clip.in + (store.playhead - clip.start)
        m.el.play()
      }
    }
    store.playing = true
    lastTs = performance.now()
    rafId = requestAnimationFrame(tick)
  }

  const pause = () => {
    store.playing = false
    if (rafId) cancelAnimationFrame(rafId)
    rafId = null
    for (const m of clipMedia.values()) m.el.pause()
  }

  const attachCanvas = (el) => {
    canvas = el
    ctx = el.getContext('2d')
  }

  return { attachCanvas, syncMedia, renderFrame, play, pause, getBlobUrl }
}
