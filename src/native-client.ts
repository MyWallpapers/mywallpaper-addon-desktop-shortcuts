import type { JsonValue, LayerNativeApi, NativeConnection } from '../generated/mywallpaper-runtime'

export interface DesktopIcon {
  name: string
  exec_path: string
  icon_base64: string | null
}

export function createNativeClient(native: LayerNativeApi, onStatus: (message: string | null) => void) {
  let connection: NativeConnection | null = null
  let disposed = false
  const cleanups: Array<() => void> = []
  const pending = new Map<string, { resolve(value: JsonValue): void; reject(error: Error): void }>()
  function rejectPending(message: string) {
    for (const request of pending.values()) request.reject(new Error(message))
    pending.clear()
  }
  const ready = (async () => {
    if (!native.companion.available) throw new Error('The Windows shortcut companion is unavailable.')
    const next = await native.companion.connect()
    if (disposed) { next.close(); throw new Error('Shortcuts were closed.') }
    connection = next
    cleanups.push(next.onMessage((message) => {
      if (!message || typeof message !== 'object' || Array.isArray(message) || message.kind !== 'shortcuts.result' || typeof message.id !== 'string') return
      const request = pending.get(message.id)
      if (!request) return
      pending.delete(message.id)
      if (typeof message.error === 'string') request.reject(new Error(message.error))
      else request.resolve(message.value ?? null)
    }))
    cleanups.push(next.onStateChange((state) => {
      onStatus(state === 'open' ? null : 'The Windows shortcut companion is ' + state + '.')
      if (state !== 'open') rejectPending('The shortcut companion connection was interrupted. Please retry.')
    }))
    onStatus(null)
    return next
  })()
  // A missing native attachment is rendered even before the first user action.
  void ready.catch((error: unknown) => { if (!disposed) onStatus(error instanceof Error ? error.message : 'Could not connect to Windows.') })

  async function request(operation: string, path?: string): Promise<JsonValue> {
    const current = await ready
    if (disposed || current.state !== 'open') throw new Error('The shortcut companion is not connected.')
    const id = crypto.randomUUID()
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject })
      void current.send({ kind: operation, id, ...(path === undefined ? {} : { path }) }).catch((error: unknown) => {
        pending.delete(id)
        reject(error instanceof Error ? error : new Error('Could not send the shortcut request.'))
      })
    })
  }

  return {
    async openPath(path: string): Promise<void> { await request('shortcuts.open', path) },
    async browsePath(): Promise<string | null> {
      const value = await request('shortcuts.browse')
      if (value !== null && typeof value !== 'string') throw new Error('The file picker returned an invalid path.')
      return value
    },
    async getDesktopIcons(): Promise<DesktopIcon[]> {
      const value = await request('shortcuts.scan')
      if (!Array.isArray(value)) throw new Error('Windows returned an invalid shortcut list.')
      return value.map((item) => {
        if (!item || typeof item !== 'object' || Array.isArray(item) || typeof item.name !== 'string' || typeof item.exec_path !== 'string' || !(item.icon_base64 === null || typeof item.icon_base64 === 'string')) throw new Error('Windows returned an invalid shortcut.')
        return { name: item.name, exec_path: item.exec_path, icon_base64: item.icon_base64 }
      })
    },
    dispose() {
      if (disposed) return
      disposed = true
      rejectPending('Shortcuts were closed.')
      cleanups.forEach((stop) => stop())
      connection?.close()
    },
  }
}
