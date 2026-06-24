/**
 * FUNPARTS · Storage Adapter
 *
 * Usa Firebase Realtime Database quando as variáveis de ambiente estão
 * configuradas (produção / Vercel). Cai silenciosamente para localStorage
 * quando não estão — útil para rodar localmente sem precisar do Firebase.
 *
 * API pública (assíncrona):
 *   listAll(prefix)       → Array de objetos
 *   put(key, obj)         → true | false
 *   del(key)              → true | false
 *   probeStorage()        → "firebase" | "local" | "none"
 */

import { initializeApp, getApps } from 'firebase/app'
import {
  getDatabase,
  ref,
  set,
  get,
  remove,
  query,
  orderByKey,
  startAt,
  endAt,
} from 'firebase/database'

// ──────────────────────────────────────────────────────────────
// Firebase init (só se as variáveis existirem)
// ──────────────────────────────────────────────────────────────
let _db = null

function getDB() {
  if (_db) return _db
  const apiKey = import.meta.env.VITE_FIREBASE_API_KEY
  if (!apiKey) return null

  const firebaseConfig = {
    apiKey,
    authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    databaseURL:       import.meta.env.VITE_FIREBASE_DATABASE_URL,
    projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId:             import.meta.env.VITE_FIREBASE_APP_ID,
  }

  const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0]
  _db = getDatabase(app)
  return _db
}

// ──────────────────────────────────────────────────────────────
// Firebase RTDB helpers
// ──────────────────────────────────────────────────────────────

// Chave Firebase: troca ':' e '.' por '-' (RTDB não aceita)
const fbKey = (k) => k.replace(/[:.]/g, '-')

async function fbList(prefix) {
  const db = getDB()
  if (!db) return null
  try {
    const safePfx = fbKey(prefix)
    const q = query(
      ref(db, 'funparts'),
      orderByKey(),
      startAt(safePfx),
      endAt(safePfx + '\uf8ff')
    )
    const snap = await get(q)
    if (!snap.exists()) return []
    return Object.values(snap.val())
  } catch (e) {
    console.warn('[storage] fbList error', e)
    return null
  }
}

async function fbPut(key, obj) {
  const db = getDB()
  if (!db) return false
  try {
    await set(ref(db, `funparts/${fbKey(key)}`), obj)
    return true
  } catch (e) {
    console.warn('[storage] fbPut error', e)
    return false
  }
}

async function fbDel(key) {
  const db = getDB()
  if (!db) return false
  try {
    await remove(ref(db, `funparts/${fbKey(key)}`))
    return true
  } catch (e) {
    console.warn('[storage] fbDel error', e)
    return false
  }
}

// ──────────────────────────────────────────────────────────────
// localStorage helpers
// ──────────────────────────────────────────────────────────────

function lsList(prefix) {
  try {
    return Object.keys(localStorage)
      .filter((k) => k.startsWith(prefix))
      .map((k) => JSON.parse(localStorage.getItem(k)))
      .filter(Boolean)
  } catch { return [] }
}

function lsPut(key, obj) {
  try { localStorage.setItem(key, JSON.stringify(obj)); return true }
  catch { return false }
}

function lsDel(key) {
  try { localStorage.removeItem(key); return true }
  catch { return false }
}

// ──────────────────────────────────────────────────────────────
// API pública
// ──────────────────────────────────────────────────────────────

export async function probeStorage() {
  if (getDB()) return 'firebase'
  if (typeof localStorage !== 'undefined') return 'local'
  return 'none'
}

export async function listAll(prefix) {
  if (getDB()) {
    const result = await fbList(prefix)
    if (result !== null) return result
  }
  return lsList(prefix)
}

export async function put(key, obj) {
  if (getDB()) return fbPut(key, obj)
  return lsPut(key, obj)
}

export async function del(key) {
  if (getDB()) return fbDel(key)
  return lsDel(key)
}
