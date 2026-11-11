// IndexedDB 极简封装：project 存工程 JSON，media 存素材 blob
const DB_NAME = 'foxcut'
const DB_VERSION = 1

const openDb = () => new Promise((resolve, reject) => {
  if (typeof indexedDB === 'undefined') return reject(new Error('indexedDB 不可用'))
  const req = indexedDB.open(DB_NAME, DB_VERSION)
  req.onupgradeneeded = () => {
    req.result.createObjectStore('project')
    req.result.createObjectStore('media')
  }
  req.onsuccess = () => resolve(req.result)
  req.onerror = () => reject(req.error)
})

const tx = (store, mode, fn) => openDb().then(db => new Promise((resolve, reject) => {
  const t = db.transaction(store, mode)
  const req = fn(t.objectStore(store))
  t.oncomplete = () => resolve(req?.result)
  t.onerror = () => reject(t.error)
}))

export const idbGet = (store, key) => tx(store, 'readonly', s => s.get(key))
export const idbSet = (store, key, val) => tx(store, 'readwrite', s => s.put(val, key))
export const idbDel = (store, key) => tx(store, 'readwrite', s => s.delete(key))
export const idbKeys = (store) => tx(store, 'readonly', s => s.getAllKeys())
