<script setup>
import { inject, onMounted, ref, watch } from 'vue'

import { useProjectStore } from '@/stores/project'
import { formatTimecode } from '@/libs'

const store = useProjectStore()
const engine = inject('engine')
const canvasEl = ref(null)

onMounted(() => {
  engine.attachCanvas(canvasEl.value)
  engine.syncMedia().then(() => engine.renderFrame(store.playhead))
})

// 工程结构变化时同步媒体元素；播放头变化且非播放态时重绘（拖时间轴画面同步）
watch(
  () => store.project.tracks,
  async () => {
    await engine.syncMedia()
    if (!store.playing) engine.renderFrame(store.playhead)
  },
  { deep: true }
)
watch(
  () => store.playhead,
  (t) => { if (!store.playing) engine.renderFrame(t) }
)

const togglePlay = () => (store.playing ? engine.pause() : engine.play())
const toStart = () => { engine.pause(); store.setPlayhead(0) }
const toEnd = () => { engine.pause(); store.setPlayhead(store.duration) }
</script>

<template>
  <section class="preview">
    <div class="stage">
      <canvas
        ref="canvasEl"
        :width="store.project.width"
        :height="store.project.height"
        class="canvas"
      />
    </div>
    <div class="transport">
      <button class="tbtn" @click="toStart" title="回到开头">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M6 5v14M18 5l-9 7 9 7" /></svg>
      </button>
      <button class="tbtn play" @click="togglePlay" :title="store.playing ? '暂停' : '播放'">
        <svg v-if="!store.playing" viewBox="0 0 24 24" fill="currentColor"><path d="M7 4.5v15l13-7.5z" /></svg>
        <svg v-else viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1" /><rect x="14" y="4" width="4" height="16" rx="1" /></svg>
      </button>
      <button class="tbtn" @click="toEnd" title="跳到结尾">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M18 5v14M6 5l9 7-9 7" /></svg>
      </button>
      <span class="timecode">{{ formatTimecode(store.playhead) }} / {{ formatTimecode(store.duration) }}</span>
    </div>
  </section>
</template>

<style scoped>
.preview {
  display: flex;
  flex-direction: column;
  min-height: 0;
  background: var(--bg-app);
}
.stage {
  flex: 1;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--sp-4);
}
.canvas {
  max-width: 100%;
  max-height: 100%;
  background: #000;
  border-radius: var(--radius-sm);
  box-shadow: var(--shadow);
}
.transport {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--sp-3);
  padding: var(--sp-3);
  border-top: 1px solid var(--border);
  background: var(--bg-panel);
}
.tbtn {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-sm);
  color: var(--text-2);
}
.tbtn:hover { background: var(--bg-hover); color: var(--text-1); }
.tbtn svg { width: 18px; height: 18px; }
.tbtn.play {
  width: 40px;
  height: 40px;
  background: var(--accent);
  color: #fff;
  border-radius: 50%;
}
.tbtn.play:hover { background: var(--accent-hover); }
.timecode {
  font-variant-numeric: tabular-nums;
  color: var(--text-2);
  margin-left: var(--sp-3);
}
</style>
