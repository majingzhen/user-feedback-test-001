<script setup>
import { computed, inject, provide, ref } from 'vue'

import { useProjectStore } from '@/stores/project'
import TimelineTrack from '@/components/timeline_track.vue'

const store = useProjectStore()
const engine = inject('engine')
const lanesEl = ref(null)

const TRACK_HEIGHTS = { video: 56, audio: 64 }

// 吸附：播放头与其他片段边缘，6px 阈值
const snapTime = (t, excludeClipId) => {
  const threshold = 6 / store.pxPerSecond
  const targets = [store.playhead]
  for (const track of store.project.tracks) {
    for (const c of track.clips) {
      if (c.id === excludeClipId) continue
      targets.push(c.start, c.start + c.duration)
    }
  }
  let best = t
  let bestDist = threshold
  for (const target of targets) {
    const d = Math.abs(t - target)
    if (d < bestDist) { bestDist = d; best = target }
  }
  return best
}

// 由鼠标 Y 坐标反查轨道（跨轨移动用）
const trackFromY = (clientY, type) => {
  if (!lanesEl.value) return null
  const rows = [...lanesEl.value.querySelectorAll('[data-track-id]')]
  for (const row of rows) {
    const rect = row.getBoundingClientRect()
    if (clientY >= rect.top && clientY <= rect.bottom) {
      const track = store.project.tracks.find(t => t.id === row.dataset.trackId)
      if (track && track.type === type) return track
    }
  }
  return null
}

provide('timeline', { snapTime, trackFromY, TRACK_HEIGHTS })

// 刻度尺
const ticks = computed(() => {
  const pps = store.pxPerSecond
  const step = pps >= 100 ? 1 : pps >= 50 ? 2 : pps >= 25 ? 5 : 10
  const total = Math.max(store.duration, 60)
  const list = []
  for (let t = 0; t <= total + step; t += step) list.push(t)
  return list
})

const contentWidth = computed(() => Math.max(store.duration, 60) * store.pxPerSecond + 200)

const scrollEl = ref(null)

const seekAt = (e) => {
  const rect = scrollEl.value.getBoundingClientRect()
  const x = e.clientX - rect.left + scrollEl.value.scrollLeft
  store.setPlayhead(x / store.pxPerSecond)
}

const onRulerDown = (e) => {
  engine.pause()
  seekAt(e)
  const move = (ev) => seekAt(ev)
  const up = () => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
}

const zoom = (dir) => {
  store.pxPerSecond = Math.min(240, Math.max(12, store.pxPerSecond * (dir > 0 ? 1.25 : 0.8)))
}
</script>

<template>
  <section class="timeline">
    <div class="toolbar">
      <span class="hint">空格 播放 · S 拆分 · Delete 删除 · 双击音频片段加音量点</span>
      <div class="spacer" />
      <button class="zbtn" @click="zoom(-1)">-</button>
      <button class="zbtn" @click="zoom(1)">+</button>
    </div>

    <div class="body">
      <div class="headers">
        <div class="ruler-corner" />
        <div
          v-for="track in store.project.tracks"
          :key="track.id"
          class="track-head"
          :style="{ height: TRACK_HEIGHTS[track.type] + 'px' }"
        >
          {{ track.label }}
        </div>
      </div>

      <div class="scroll" ref="scrollEl">
        <div ref="lanesEl" class="lanes">
        <div class="ruler" :style="{ width: contentWidth + 'px' }" @pointerdown="onRulerDown">
          <span
            v-for="t in ticks"
            :key="t"
            class="tick"
            :style="{ left: t * store.pxPerSecond + 'px' }"
          >{{ t }}s</span>
        </div>

        <TimelineTrack
          v-for="track in store.project.tracks"
          :key="track.id"
          :track="track"
          :height="TRACK_HEIGHTS[track.type]"
          :width="contentWidth"
        />
        </div>

        <div
          class="playhead"
          :style="{ left: store.playhead * store.pxPerSecond + 'px' }"
        />
      </div>
    </div>
  </section>
</template>

<style scoped>
.timeline {
  display: flex;
  flex-direction: column;
  min-height: 0;
  background: var(--bg-panel);
  border-top: 1px solid var(--border);
}
.toolbar {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  padding: var(--sp-2) var(--sp-4);
  border-bottom: 1px solid var(--border);
}
.hint { color: var(--text-3); }
.spacer { flex: 1; }
.zbtn {
  width: 24px;
  height: 24px;
  border-radius: var(--radius-sm);
  background: var(--bg-raised);
  color: var(--text-1);
}
.zbtn:hover { background: var(--bg-hover); }
.body { flex: 1; display: flex; min-height: 0; }
.headers {
  flex: none;
  width: 88px;
  border-right: 1px solid var(--border);
  overflow: hidden;
}
.ruler-corner { height: 24px; border-bottom: 1px solid var(--border); }
.track-head {
  display: flex;
  align-items: center;
  padding: 0 var(--sp-3);
  color: var(--text-2);
  border-bottom: 1px solid var(--border);
}
.scroll {
  flex: 1;
  overflow: auto;
  position: relative;
}
.ruler {
  position: relative;
  height: 24px;
  border-bottom: 1px solid var(--border);
  cursor: ew-resize;
  background: var(--bg-panel);
  position: sticky;
  top: 0;
  z-index: 5;
}
.tick {
  position: absolute;
  top: 4px;
  color: var(--text-3);
  font-size: var(--fs-xs);
  border-left: 1px solid var(--border);
  padding-left: var(--sp-1);
  height: 20px;
  pointer-events: none;
}
.playhead {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 1px;
  background: var(--accent);
  z-index: 6;
  pointer-events: none;
}
.playhead::before {
  content: '';
  position: absolute;
  top: 0;
  left: -5px;
  border: 5.5px solid transparent;
  border-top: 8px solid var(--accent);
}
</style>
