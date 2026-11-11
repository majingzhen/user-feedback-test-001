<script setup>
import { ref } from 'vue'

import { useProjectStore } from '@/stores/project'
import { idbSet } from '@/libs'
import { formatDuration } from '@/libs'

const store = useProjectStore()
const fileInput = ref(null)
const importing = ref(false)

// 探测素材元数据（时长、分辨率）
const probe = (file, type) => new Promise((resolve) => {
  const el = document.createElement(type === 'video' ? 'video' : 'audio')
  el.preload = 'metadata'
  el.src = URL.createObjectURL(file)
  el.onloadedmetadata = () => {
    resolve({
      duration: el.duration,
      width: el.videoWidth || 0,
      height: el.videoHeight || 0,
    })
    URL.revokeObjectURL(el.src)
  }
  el.onerror = () => resolve(null)
})

const importFiles = async (e) => {
  const files = [...e.target.files]
  e.target.value = ''
  importing.value = true
  for (const file of files) {
    const type = file.type.startsWith('video') ? 'video' : file.type.startsWith('audio') ? 'audio' : null
    if (!type) continue
    const meta = await probe(file, type)
    if (!meta || !isFinite(meta.duration)) continue
    const blobKey = crypto.randomUUID()
    await idbSet('media', blobKey, file)
    store.addSource({
      id: crypto.randomUUID(),
      name: file.name,
      type,
      duration: meta.duration,
      width: meta.width,
      height: meta.height,
      hasAudio: true,
      blobKey,
    })
  }
  importing.value = false
}

const addTo = (source, trackType) => {
  const track = store.project.tracks.find(t => t.type === trackType && t.id.endsWith('1'))
  store.addClip(source.id, track.id, store.playhead)
}
</script>

<template>
  <aside class="panel">
    <div class="panel-head">
      <span class="title">素材库</span>
      <button class="btn" @click="fileInput.click()">导入</button>
      <input ref="fileInput" type="file" multiple accept="video/*,audio/*" hidden @change="importFiles" />
    </div>

    <div v-if="store.project.sources.length === 0" class="empty">
      <svg viewBox="0 0 24 24" class="empty-icon" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="M3 9h18M8 5v14M16 5v14" />
      </svg>
      <div class="empty-title">还没有素材</div>
      <div class="empty-sub">点击「导入」添加视频或音频文件</div>
    </div>

    <ul class="list">
      <li v-for="s in store.project.sources" :key="s.id" class="item">
        <div class="item-head">
          <svg v-if="s.type === 'video'" viewBox="0 0 24 24" class="icon" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
            <rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 9h18" />
          </svg>
          <svg v-else viewBox="0 0 24 24" class="icon" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
            <path d="M9 18V6l10-2v12" /><circle cx="6.5" cy="18" r="2.5" /><circle cx="16.5" cy="16" r="2.5" />
          </svg>
          <span class="name" :title="s.name">{{ s.name }}</span>
          <span class="dur">{{ formatDuration(s.duration) }}</span>
        </div>
        <div class="item-actions">
          <button v-if="s.type === 'video'" class="mini" @click="addTo(s, 'video')">加到视频轨</button>
          <button v-if="s.type === 'audio'" class="mini" @click="addTo(s, 'audio')">加到音频轨</button>
          <label class="audio-toggle" v-if="s.type === 'video'">
            <input type="checkbox" v-model="s.hasAudio" /> 含音频
          </label>
        </div>
      </li>
    </ul>
  </aside>
</template>

<style scoped>
.panel {
  background: var(--bg-panel);
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--sp-3) var(--sp-4);
  border-bottom: 1px solid var(--border);
}
.title { font-size: var(--fs-sm); font-weight: var(--fw-medium); }
.btn {
  padding: var(--sp-1) var(--sp-3);
  border-radius: var(--radius-sm);
  background: var(--accent);
}
.btn:hover { background: var(--accent-hover); }
.empty {
  margin: var(--sp-5) var(--sp-4);
  padding: var(--sp-5) var(--sp-4);
  border: 1px dashed var(--border);
  border-radius: var(--radius);
  text-align: center;
  color: var(--text-2);
}
.empty-icon { width: 32px; height: 32px; margin: 0 auto var(--sp-3); color: var(--text-3); }
.empty-title { font-size: var(--fs-sm); font-weight: var(--fw-medium); color: var(--text-1); }
.empty-sub { margin-top: var(--sp-1); color: var(--text-3); }
.list { list-style: none; margin: 0; padding: var(--sp-2); overflow-y: auto; }
.item {
  padding: var(--sp-2) var(--sp-3);
  border-radius: var(--radius-sm);
  margin-bottom: var(--sp-1);
}
.item:hover { background: var(--bg-raised); }
.item-head { display: flex; align-items: center; gap: var(--sp-2); }
.icon { width: 16px; height: 16px; color: var(--text-2); flex: none; }
.name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dur { color: var(--text-3); flex: none; }
.item-actions { display: flex; align-items: center; gap: var(--sp-2); margin-top: var(--sp-2); }
.mini {
  padding: 2px var(--sp-2);
  border-radius: var(--radius-sm);
  background: var(--bg-raised);
  color: var(--text-2);
}
.mini:hover { background: var(--bg-hover); color: var(--text-1); }
.audio-toggle { display: flex; align-items: center; gap: var(--sp-1); color: var(--text-3); }
</style>
