<script setup>
import { onMounted, onBeforeUnmount, provide, ref } from 'vue'

import { useProjectStore } from '@/stores/project'
import { createPreviewEngine } from '@/engine/preview'
import MediaLibrary from '@/components/media_library.vue'
import PreviewPlayer from '@/components/preview_player.vue'
import TimelinePanel from '@/components/timeline_panel.vue'
import ExportDialog from '@/components/export_dialog.vue'

const store = useProjectStore()
const engine = createPreviewEngine(store)
provide('engine', engine)

const showExport = ref(false)
const ready = ref(false)

onMounted(async () => {
  await store.loadProject()
  ready.value = true
  window.addEventListener('keydown', onKeydown)
})
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))

// 快捷键：空格播放/暂停，S 拆分选中片段，Delete 删除选中
const onKeydown = (e) => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return
  if (e.code === 'Space') {
    e.preventDefault()
    store.playing ? engine.pause() : engine.play()
  } else if (e.key === 's' || e.key === 'S') {
    if (store.selectedClipId) store.splitClip(store.selectedClipId, store.playhead)
  } else if (e.key === 'Delete' || e.key === 'Backspace') {
    if (store.selectedClipId) store.deleteClip(store.selectedClipId)
  }
}
</script>

<template>
  <div class="app">
    <header class="topbar">
      <div class="brand">FoxCut</div>
      <input
        class="project-name"
        v-model="store.project.name"
        spellcheck="false"
      />
      <div class="spacer" />
      <span class="save-state">
        {{ store.saveState === 'saving' ? '保存中…' : store.saveState === 'restored' ? '已恢复上次工程' : '已自动保存' }}
      </span>
      <button class="btn" @click="store.newProject()">新建工程</button>
      <button class="btn primary" @click="showExport = true">预检并导出</button>
    </header>

    <main class="main" v-if="ready">
      <MediaLibrary class="library" />
      <PreviewPlayer class="preview" />
      <TimelinePanel class="timeline" />
    </main>

    <ExportDialog v-if="showExport" @close="showExport = false" />
  </div>
</template>

<style scoped>
.app {
  height: 100%;
  display: flex;
  flex-direction: column;
  outline: none;
}
.topbar {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  padding: var(--sp-2) var(--sp-4);
  background: var(--bg-panel);
  border-bottom: 1px solid var(--border);
}
.brand {
  font-size: var(--fs-lg);
  font-weight: var(--fw-semibold);
  color: var(--accent);
}
.project-name {
  font-size: var(--fs-xs);
  color: var(--text-1);
  background: var(--bg-raised);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: var(--sp-1) var(--sp-2);
  width: 180px;
}
.spacer { flex: 1; }
.save-state { color: var(--text-3); font-size: var(--fs-xs); }
.btn {
  padding: var(--sp-2) var(--sp-3);
  border-radius: var(--radius-sm);
  background: var(--bg-raised);
  color: var(--text-1);
}
.btn:hover { background: var(--bg-hover); }
.btn.primary { background: var(--accent); }
.btn.primary:hover { background: var(--accent-hover); }
.main {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: 240px 1fr;
  grid-template-rows: 1fr 320px;
  grid-template-areas: "library preview" "timeline timeline";
}
.library { grid-area: library; }
.preview { grid-area: preview; }
.timeline { grid-area: timeline; }
</style>
