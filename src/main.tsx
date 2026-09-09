import { createRoot } from 'react-dom/client'
import type { AddonValues, CanvasAddonMountContext } from '../generated/mywallpaper-runtime'
import DesktopShortcuts from './index'
import { createNativeClient } from './native-client'
import type { Settings } from './types'

function readSettings(layer: AddonValues, device: AddonValues): Settings {
  return {
    iconsData: typeof device.iconsData === 'string' ? device.iconsData : '[]',
    iconSize: typeof layer.iconSize === 'number' ? layer.iconSize : 48,
    gridSpacing: typeof layer.gridSpacing === 'number' ? layer.gridSpacing : 90,
    showLabels: typeof layer.showLabels === 'boolean' ? layer.showLabels : true,
    labelColor: typeof layer.labelColor === 'string' ? layer.labelColor : '#ffffff',
  }
}

export function mount({ layer, runtime }: CanvasAddonMountContext): () => void {
  const root = createRoot(layer.root)
  let disposed = false
  let layerValues = layer.settings.get()
  let deviceValues = layer.deviceSettings.get()
  let nativeStatus: string | null = runtime.mode === 'thumbnail' ? null : 'Connecting to Windows…'
  const client = runtime.mode === 'thumbnail' ? null : createNativeClient(layer.native, (status) => {
    nativeStatus = status
    render()
  })
  const onButtonClick = (key: string, listener: () => void) => layer.actions.on(key, listener)
  const setValue = async (key: 'iconsData', value: string) => { await layer.deviceSettings.set({ [key]: value }) }
  const unavailable = async (): Promise<never> => { throw new Error('Shortcut actions are unavailable in a thumbnail.') }
  const openPath = client?.openPath ?? unavailable
  const getDesktopIcons = client?.getDesktopIcons ?? unavailable
  const browsePath = client?.browsePath ?? unavailable
  function render() {
    if (disposed) return
    root.render(<DesktopShortcuts
      settings={readSettings(layerValues, deviceValues)}
      width={layer.root.clientWidth || runtime.instance.width}
      height={layer.root.clientHeight || runtime.instance.height}
      setValue={setValue} onButtonClick={onButtonClick}
      openPath={openPath} getDesktopIcons={getDesktopIcons} browsePath={browsePath}
      nativeStatus={nativeStatus}
    />)
  }
  const stopLayer = layer.settings.subscribe((value) => { layerValues = value; render() })
  const stopDevice = layer.deviceSettings.subscribe((value) => { deviceValues = value; render() })
  const observer = new ResizeObserver(render)
  observer.observe(layer.root)
  function dispose() {
    if (disposed) return
    disposed = true
    stopLayer(); stopDevice(); observer.disconnect(); client?.dispose(); stopDispose()
    root.unmount()
  }
  const stopDispose = layer.lifecycle.onDispose(dispose)
  render()
  return dispose
}
