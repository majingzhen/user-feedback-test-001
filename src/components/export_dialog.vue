<script setup>
import { computed, ref } from 'vue'

import { useProjectStore } from '@/stores/project'
import { precheck } from '@/engine/precheck'
import { exportMp4 } from '@/engine/ffmpeg_export'

const emit = defineEmits(['close'])
const store = useProjectStore()

const result = computed(() => precheck(store.project))
const exporting = ref(false)
const progress = ref(0)
const downloadUrl = ref('')
const exportError = ref('')

const startExport = async () => {
  exporting.value = true
  exportError.value = ''
  progress.value = 0
  try {
    const blob = await exportMp4(store.project, (p) => { progress.value = p })
    downloadUrl.value = URL.createObjectURL(blob)
  } catch (err) {
    exportError.value = err.message || '导出失败'
  } finally {
    exporting.value = false
  }
}
</script>

<template>
  <div class="mask" @click.self="emit('close')">
    <div class="dialog">
      <div class="head">
        <span class="title">导出前预检</span>
        <button class="close" @click="emit('close')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
      </div>

      <div class="body">
        <div v-if="result.errors.length === 0 && result.warnings.length === 0" class="ok">
          时间线检查通过，没有发现冲突。
        </div>

        <div v-for="(err, i) in result.errors" :key="'e' + i" class="row error">
          <span class="dot" />{{ err }}
        </div>
        <div v-for="(warn, i) in result.warnings" :key="'w' + i" class="row warning">
          <span class="dot" />{{ warn }}
        </div>

        <div v-if="exporting" class="progress-wrap">
          <div class="bar"><div class="fill" :style="{ width: progress * 100 + '%' }" /></div>
          <div class="pct">{{ Math.round(progress * 100) }}%</div>
        </div>

        <div v-if="exportError" class="row error"><span class="dot" />{{ exportError }}</div>

        <a v-if="downloadUrl" class="download" :href="downloadUrl" download="export.mp4">
          导出完成，点击下载 export.mp4
        </a>
      </div>

      <div class="foot">
        <button class="btn" @click="emit('close')">关闭</button>
        <button
          class="btn primary"
          :disabled="result.errors.length > 0 || exporting"
          @click="startExport"
        >
          {{ exporting ? '导出中…' : '开始导出 MP4' }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.mask {
  position: fixed;
  inset: 0;
  background: rgb(0 0 0 / 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}
.dialog {
  width: 480px;
  max-height: 70vh;
  display: flex;
  flex-direction: column;
  background: var(--bg-panel);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
}
.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--sp-4);
  border-bottom: 1px solid var(--border);
}
.title { font-size: var(--fs-md); font-weight: var(--fw-semibold); }
.close { width: 28px; height: 28px; color: var(--text-2); border-radius: var(--radius-sm); }
.close:hover { background: var(--bg-hover); color: var(--text-1); }
.close svg { width: 16px; height: 16px; }
.body { padding: var(--sp-4); overflow-y: auto; }
.ok { color: var(--text-1); padding: var(--sp-3); background: var(--bg-raised); border-radius: var(--radius); }
.row {
  display: flex;
  align-items: baseline;
  gap: var(--sp-2);
  padding: var(--sp-2) 0;
}
.row .dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex: none;
  transform: translateY(-1px);
}
.row.error .dot { background: var(--danger); }
.row.error { color: var(--danger); }
.row.warning .dot { background: var(--warn); }
.row.warning { color: var(--warn); }
.progress-wrap { display: flex; align-items: center; gap: var(--sp-3); margin-top: var(--sp-4); }
.bar {
  flex: 1;
  height: 6px;
  border-radius: 3px;
  background: var(--bg-raised);
  overflow: hidden;
}
.fill { height: 100%; background: var(--accent); transition: width var(--t); }
.pct { color: var(--text-2); font-variant-numeric: tabular-nums; }
.download {
  display: block;
  margin-top: var(--sp-4);
  padding: var(--sp-3);
  text-align: center;
  background: var(--accent);
  color: #fff;
  border-radius: var(--radius);
  text-decoration: none;
}
.download:hover { background: var(--accent-hover); }
.foot {
  display: flex;
  justify-content: flex-end;
  gap: var(--sp-2);
  padding: var(--sp-4);
  border-top: 1px solid var(--border);
}
.btn {
  padding: var(--sp-2) var(--sp-4);
  border-radius: var(--radius-sm);
  background: var(--bg-raised);
}
.btn:hover { background: var(--bg-hover); }
.btn.primary { background: var(--accent); color: #fff; }
.btn.primary:hover { background: var(--accent-hover); }
.btn:disabled { opacity: 0.4; cursor: not-allowed; }
</style>
