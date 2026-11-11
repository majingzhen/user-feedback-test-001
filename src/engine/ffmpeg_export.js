// 导出引擎：由时间线模型生成 ffmpeg filter_complex，数学与 timeline_math 同源
import { FFmpeg } from '@ffmpeg/ffmpeg'
import coreURL from '@ffmpeg/core?url'
import wasmURL from '@ffmpeg/core/wasm?url'

import { idbGet } from '@/libs'
import { clipEnd, timelineDuration, sortedPoints } from '@/engine/timeline_math'

const f = (n) => Number(n.toFixed(3))
// filtergraph 内表达式里的逗号要转义
const esc = (s) => s.replaceAll(',', '\\,')

// 音量包络 -> volume 滤镜表达式（片段本地时间，分段线性）
const volumeExpr = (clip) => {
  const pts = sortedPoints(clip.volumePoints)
  if (pts.length === 0) return '1'
  let expr = String(pts[pts.length - 1].v)
  for (let i = pts.length - 2; i >= 0; i--) {
    const a = pts[i]
    const b = pts[i + 1]
    const span = b.t - a.t
    const seg = span <= 0
      ? String(b.v)
      : `(${a.v}+(${b.v}-${a.v})*(t-${f(a.t)})/${f(span)})`
    expr = `if(lt(t,${f(a.t)}),${a.v},if(lt(t,${f(b.t)}),${seg},${expr}))`
  }
  return `if(lt(t,${f(pts[0].t)}),${pts[0].v},${expr})`
}

// 片段的透明度斜坡（淡入淡出 + 转场），输出 fade alpha 滤镜链
const alphaFades = (clip, transitions) => {
  const fades = []
  if (clip.fadeIn > 0) fades.push(`fade=t=in:st=0:d=${f(clip.fadeIn)}:alpha=1`)
  if (clip.fadeOut > 0) fades.push(`fade=t=out:st=${f(clip.duration - clip.fadeOut)}:d=${f(clip.fadeOut)}:alpha=1`)
  for (const tr of transitions) {
    const st = f(tr.start - clip.start)
    const d = f(tr.duration)
    if (tr.clipAId === clip.id) fades.push(`fade=t=out:st=${st}:d=${d}:alpha=1`)
    if (tr.clipBId === clip.id) fades.push(`fade=t=in:st=${st}:d=${d}:alpha=1`)
  }
  return fades
}

// 构建完整 filter_complex 与输入映射
export const buildGraph = (project) => {
  const { width: W, height: H, fps } = project
  const total = f(timelineDuration(project.tracks))
  const inputMap = new Map() // sourceId -> input index
  const inputOf = (sid) => {
    if (!inputMap.has(sid)) inputMap.set(sid, inputMap.size)
    return inputMap.get(sid)
  }
  const chains = []
  const audioLabels = []

  // 视频轨：每轨一条全时长透明底，片段 alpha 叠加
  const videoTracks = project.tracks.filter(t => t.type === 'video')
  const trackLabels = []
  videoTracks.forEach((track, ti) => {
    if (track.clips.length === 0) return
    let prev = `tb${ti}`
    chains.push(`color=c=black@0:s=${W}x${H}:r=${fps}:d=${total},format=rgba[${prev}]`)
    track.clips.forEach((clip, ci) => {
      const idx = inputOf(clip.sourceId)
      const fades = alphaFades(clip, project.transitions)
      const fadeChain = fades.length ? ',' + fades.join(',') : ''
      const raw = `vc${ti}_${ci}`
      const delayed = `vd${ti}_${ci}`
      const out = `to${ti}_${ci}`
      chains.push(
        `[${idx}:v]trim=start=${f(clip.in)}:duration=${f(clip.duration)},setpts=PTS-STARTPTS,` +
        `scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2,` +
        `setsar=1,fps=${fps},format=rgba${fadeChain}[${raw}]`
      )
      chains.push(`[${raw}]setpts=PTS+${f(clip.start)}/TB[${delayed}]`)
      chains.push(`[${prev}][${delayed}]overlay=0:0:eof_action=pass[${out}]`)
      prev = out
    })
    trackLabels.push(prev)
  })

  // 音频：所有轨道的片段（视频源带音频的也取），包络 + 淡入淡出 + 延时 + 混音
  const allClips = project.tracks.flatMap(t => t.clips)
  allClips.forEach((clip, ci) => {
    const source = project.sources.find(s => s.id === clip.sourceId)
    if (!source || !source.hasAudio) return
    const idx = inputOf(clip.sourceId)
    const label = `ac${ci}`
    const fades = []
    if (clip.fadeIn > 0) fades.push(`afade=t=in:st=0:d=${f(clip.fadeIn)}`)
    if (clip.fadeOut > 0) fades.push(`afade=t=out:st=${f(clip.duration - clip.fadeOut)}:d=${f(clip.fadeOut)}`)
    const fadeChain = fades.length ? ',' + fades.join(',') : ''
    const ms = Math.round(clip.start * 1000)
    chains.push(
      `[${idx}:a]atrim=start=${f(clip.in)}:duration=${f(clip.duration)},asetpts=PTS-STARTPTS,` +
      `aresample=44100,aformat=channel_layouts=stereo,` +
      `volume='${esc(volumeExpr(clip))}':eval=frame${fadeChain},adelay=${ms}|${ms}[${label}]`
    )
    audioLabels.push(label)
  })

  // 视频轨堆叠：黑底 -> v1 -> v2
  let vout = null
  if (trackLabels.length > 0) {
    chains.push(`color=c=black:s=${W}x${H}:r=${fps}:d=${total}[bg]`)
    let prev = 'bg'
    trackLabels.forEach((label, i) => {
      const out = i === trackLabels.length - 1 ? 'vout' : `ov${i}`
      const tail = i === trackLabels.length - 1 ? ':format=yuv420' : ''
      chains.push(`[${prev}][${label}]overlay=0:0${tail}[${out}]`)
      prev = out
    })
    vout = 'vout'
  }

  let aout = null
  if (audioLabels.length === 1) {
    chains.push(`[${audioLabels[0]}]apad,atrim=duration=${total}[aout]`)
    aout = 'aout'
  } else if (audioLabels.length > 1) {
    const ins = audioLabels.map(l => `[${l}]`).join('')
    chains.push(`${ins}amix=inputs=${audioLabels.length}:duration=longest:normalize=0,apad,atrim=duration=${total}[aout]`)
    aout = 'aout'
  }

  return { filterComplex: chains.join(';'), inputMap, vout, aout, total }
}

export const exportMp4 = async (project, onProgress) => {
  const { filterComplex, inputMap, vout, aout, total } = buildGraph(project)
  const ffmpeg = new FFmpeg()
  ffmpeg.on('progress', ({ progress }) => onProgress?.(Math.min(1, Math.max(0, progress))))
  await ffmpeg.load({ coreURL, wasmURL })

  const entries = [...inputMap.entries()]
  for (const [sourceId, idx] of entries) {
    const source = project.sources.find(s => s.id === sourceId)
    const blob = await idbGet('media', source.blobKey)
    if (!blob) throw new Error(`素材「${source.name}」的文件数据缺失`)
    await ffmpeg.writeFile(`in${idx}`, new Uint8Array(await blob.arrayBuffer()))
  }

  const args = []
  for (const idx of inputMap.values()) args.push('-i', `in${idx}`)
  args.push('-filter_complex', filterComplex)
  if (vout) args.push('-map', `[${vout}]`)
  if (aout) args.push('-map', `[${aout}]`)
  args.push('-t', String(total), '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p')
  if (aout) args.push('-c:a', 'aac')
  args.push('-movflags', '+faststart', 'out.mp4')

  const code = await ffmpeg.exec(args)
  if (code !== 0) throw new Error('ffmpeg 导出失败')
  const data = await ffmpeg.readFile('out.mp4')
  ffmpeg.terminate()
  return new Blob([data.buffer], { type: 'video/mp4' })
}
