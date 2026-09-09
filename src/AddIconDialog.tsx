import { useState, useRef, useEffect } from 'react'
import { generateLetterIcon, extractNameFromPath } from './utils'

interface AddIconDialogProps {
  browsePath: () => Promise<string | null>
  onSave: (name: string, execPath: string, iconData?: string) => void
  onCancel: () => void
}

interface Preset {
  name: string
  execPath: string
  color: string
}

type IconSource = 'auto' | 'local' | 'url'

const PRESETS: { label: string; items: Preset[] }[] = [
  {
    label: 'Apps',
    items: [
      { name: 'Firefox', execPath: 'firefox.exe', color: '#e06c75' },
      { name: 'Chrome', execPath: 'chrome.exe', color: '#61afef' },
      { name: 'Terminal', execPath: 'wt.exe', color: '#313244' },
      { name: 'Files', execPath: 'explorer.exe', color: '#e5c07b' },
      { name: 'VS Code', execPath: 'code', color: '#56b6c2' },
      { name: 'Spotify', execPath: 'spotify', color: '#98c379' },
      { name: 'Discord', execPath: 'discord', color: '#7289da' },
      { name: 'Steam', execPath: 'steam', color: '#1b2838' },
    ],
  },
  {
    label: 'Websites',
    items: [
      { name: 'Google', execPath: 'https://google.com', color: '#e5c07b' },
      { name: 'YouTube', execPath: 'https://youtube.com', color: '#be5046' },
      { name: 'GitHub', execPath: 'https://github.com', color: '#6e7681' },
      { name: 'Gmail', execPath: 'https://gmail.com', color: '#e06c75' },
      { name: 'Reddit', execPath: 'https://reddit.com', color: '#d19a66' },
      { name: 'ChatGPT', execPath: 'https://chatgpt.com', color: '#98c379' },
    ],
  },
  {
    label: 'Folders',
    items: [
      { name: 'Home', execPath: '%USERPROFILE%', color: '#61afef' },
      { name: 'Documents', execPath: 'shell:Personal', color: '#e5c07b' },
      { name: 'Downloads', execPath: 'shell:Downloads', color: '#98c379' },
      { name: 'Pictures', execPath: 'shell:My Pictures', color: '#c678dd' },
    ],
  },
]

export function AddIconDialog({ onSave, onCancel, browsePath }: AddIconDialogProps) {
  const [execPath, setExecPath] = useState('')
  const [name, setName] = useState('')
  const [nameManuallyEdited, setNameManuallyEdited] = useState(false)
  const [iconSource, setIconSource] = useState<IconSource>('auto')
  const [iconLocalData, setIconLocalData] = useState<string | null>(null)
  const [iconUrl, setIconUrl] = useState('')
  const pathInputRef = useRef<HTMLInputElement>(null)
  const [browseError, setBrowseError] = useState<string | null>(null)
  const [browsing, setBrowsing] = useState(false)
  const iconFileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    pathInputRef.current?.focus()
  }, [])

  const handlePathChange = (value: string) => {
    setExecPath(value)
    if (!nameManuallyEdited) {
      setName(extractNameFromPath(value))
    }
  }

  const handleNameChange = (value: string) => {
    setName(value)
    setNameManuallyEdited(true)
  }

  // Browse for file/app/folder
  const handleBrowseFile = async () => {
    setBrowsing(true)
    setBrowseError(null)
    try {
      const filePath = await browsePath()
      if (filePath) handlePathChange(filePath)
    } catch (error) {
      setBrowseError(error instanceof Error ? error.message : 'Could not open the file picker.')
    } finally {
      setBrowsing(false)
    }
  }

  // Icon file upload
  const handleIconFileClick = () => {
    iconFileInputRef.current?.click()
  }

  const handleIconFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onloadend = () => {
      setIconLocalData(reader.result as string)
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  // Resolve the final icon to use
  const resolveIcon = (): string | undefined => {
    if (iconSource === 'local' && iconLocalData) return iconLocalData
    if (iconSource === 'url' && iconUrl.trim()) return iconUrl.trim()
    // 'auto' or no custom icon: return undefined so fallback to generated
    return undefined
  }

  const handleCustomSave = () => {
    const trimmedName = name.trim()
    const trimmedPath = execPath.trim()
    if (!trimmedName || !trimmedPath) return
    const icon = resolveIcon() || generateLetterIcon(trimmedName)
    onSave(trimmedName, trimmedPath, icon)
  }

  const handlePresetClick = (preset: Preset) => {
    const icon = resolveIcon() || generateLetterIcon(preset.name, preset.color)
    onSave(preset.name, preset.execPath, icon)
  }

  // Preview icon
  const getPreviewIcon = (): string | null => {
    if (iconSource === 'local' && iconLocalData) return iconLocalData
    if (iconSource === 'url' && iconUrl.trim()) return iconUrl.trim()
    if (name.trim()) return generateLetterIcon(name.trim())
    return null
  }

  const previewIcon = getPreviewIcon()
  const canSave = name.trim() && execPath.trim()

  return (
    <div style={overlayStyle} onClick={onCancel}>
      <div style={dialogStyle} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={headerStyle}>
          <h3 style={titleStyle}>Add Shortcut</h3>
          <button onClick={onCancel} style={closeBtnStyle}>✕</button>
        </div>

        <div style={scrollAreaStyle}>
          {/* Preset sections */}
          {PRESETS.map((section) => (
            <div key={section.label} style={{ marginBottom: 16 }}>
              <div style={sectionLabelStyle}>{section.label}</div>
              <div style={presetGridStyle}>
                {section.items.map((preset) => (
                  <button
                    key={preset.name}
                    onClick={() => handlePresetClick(preset)}
                    style={presetTileStyle}
                    title={preset.execPath}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = 'scale(1.08)'
                      e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = 'scale(1)'
                      e.currentTarget.style.boxShadow = 'none'
                    }}
                  >
                    <div
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 8,
                        backgroundColor: preset.color,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 16,
                        fontWeight: 700,
                        color: '#fff',
                        flexShrink: 0,
                      }}
                    >
                      {preset.name.charAt(0)}
                    </div>
                    <span style={presetLabelStyle}>{preset.name}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}

          {/* Divider */}
          <div style={dividerStyle}>
            <span style={dividerLineStyle} />
            <span style={dividerTextStyle}>or add custom</span>
            <span style={dividerLineStyle} />
          </div>

          {/* Path / URL with Browse button */}
          <label style={labelStyle}>Path / URL</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              ref={pathInputRef}
              type="text"
              value={execPath}
              onChange={(e) => handlePathChange(e.target.value)}
              placeholder="e.g. C:\\Apps\\app.exe or https://..."
              style={{ ...inputStyle, flex: 1 }}
            />
            <button onClick={handleBrowseFile} disabled={browsing} style={browseBtnStyle}>
              {browsing ? 'Selecting…' : 'Browse…'}
            </button>
          </div>
          {browseError && <p role="alert" style={{ color: '#e06c75' }}>{browseError}</p>}

          {/* Name */}
          <label style={labelStyle}>Name (auto-filled from path)</label>
          <input
            type="text"
            value={name}
            onChange={(e) => handleNameChange(e.target.value)}
            placeholder="e.g. Firefox"
            style={inputStyle}
            onKeyDown={(e) => e.key === 'Enter' && handleCustomSave()}
          />

          {/* Icon Source */}
          <label style={{ ...labelStyle, marginTop: 16 }}>Icon</label>
          <div style={iconSourceRowStyle}>
            {(['auto', 'local', 'url'] as const).map((src) => (
              <button
                key={src}
                onClick={() => setIconSource(src)}
                style={{
                  ...iconSourceBtnStyle,
                  backgroundColor: iconSource === src ? '#89b4fa' : '#313244',
                  color: iconSource === src ? '#1e1e2e' : '#a6adc8',
                  fontWeight: iconSource === src ? 600 : 400,
                }}
              >
                {src === 'auto' ? 'Auto' : src === 'local' ? 'Local File' : 'Online URL'}
              </button>
            ))}
          </div>

          {/* Icon: Local upload */}
          {iconSource === 'local' && (
            <div style={{ marginTop: 10 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <button onClick={handleIconFileClick} style={browseBtnStyle}>
                  Choose Image...
                </button>
                {iconLocalData && (
                  <img
                    src={iconLocalData}
                    alt=""
                    style={{ width: 32, height: 32, borderRadius: 6, objectFit: 'cover' }}
                  />
                )}
                {iconLocalData && (
                  <button
                    onClick={() => setIconLocalData(null)}
                    style={{ ...closeBtnStyle, fontSize: 12, padding: '2px 6px' }}
                  >
                    ✕
                  </button>
                )}
              </div>
              <input
                ref={iconFileInputRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={handleIconFileSelected}
              />
            </div>
          )}

          {/* Icon: URL */}
          {iconSource === 'url' && (
            <div style={{ marginTop: 10 }}>
              <input
                type="text"
                value={iconUrl}
                onChange={(e) => setIconUrl(e.target.value)}
                placeholder="https://example.com/icon.png"
                style={inputStyle}
              />
              {iconUrl.trim() && (
                <img
                  src={iconUrl.trim()}
                  alt=""
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 6,
                    objectFit: 'cover',
                    marginTop: 8,
                  }}
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                  onLoad={(e) => { (e.target as HTMLImageElement).style.display = 'block' }}
                />
              )}
            </div>
          )}

          {/* Live preview */}
          {previewIcon && (
            <div style={previewStyle}>
              <span style={{ color: '#6c7086', fontSize: 12 }}>Preview:</span>
              <div style={previewContentStyle}>
                <img
                  src={previewIcon}
                  alt=""
                  style={{ width: 32, height: 32, borderRadius: 8, objectFit: 'cover' }}
                />
                <span style={{ color: '#cdd6f4', fontSize: 13 }}>
                  {name.trim() || 'Shortcut'}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={footerStyle}>
          <button onClick={onCancel} style={cancelBtnStyle}>Cancel</button>
          <button
            onClick={handleCustomSave}
            disabled={!canSave}
            style={{ ...saveBtnStyle, opacity: canSave ? 1 : 0.5 }}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  )
}

/* ── Styles ── */

const overlayStyle: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  backgroundColor: 'rgba(0, 0, 0, 0.5)',
  zIndex: 100,
}

const dialogStyle: React.CSSProperties = {
  backgroundColor: '#1e1e2e',
  borderRadius: 14,
  minWidth: 340,
  maxWidth: 420,
  maxHeight: '90%',
  display: 'flex',
  flexDirection: 'column',
  boxShadow: '0 12px 40px rgba(0, 0, 0, 0.5)',
  border: '1px solid rgba(255, 255, 255, 0.1)',
  overflow: 'hidden',
}

const headerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '16px 20px 0',
}

const titleStyle: React.CSSProperties = {
  margin: 0,
  color: '#cdd6f4',
  fontSize: 16,
  fontWeight: 600,
}

const closeBtnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: '#6c7086',
  fontSize: 16,
  cursor: 'pointer',
  padding: '4px 8px',
  borderRadius: 6,
  lineHeight: 1,
}

const scrollAreaStyle: React.CSSProperties = {
  padding: '16px 20px',
  overflowY: 'auto',
  flex: 1,
}

const sectionLabelStyle: React.CSSProperties = {
  color: '#6c7086',
  fontSize: 11,
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  marginBottom: 8,
}

const presetGridStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 6,
}

const presetTileStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 4,
  padding: '8px 6px 6px',
  width: 60,
  backgroundColor: '#313244',
  border: '1px solid rgba(255,255,255,0.06)',
  borderRadius: 10,
  cursor: 'pointer',
  transition: 'transform 0.15s, box-shadow 0.15s',
}

const presetLabelStyle: React.CSSProperties = {
  color: '#a6adc8',
  fontSize: 10,
  textAlign: 'center',
  lineHeight: '12px',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  maxWidth: 54,
}

const dividerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  margin: '8px 0 16px',
}

const dividerLineStyle: React.CSSProperties = {
  flex: 1,
  height: 1,
  backgroundColor: 'rgba(255,255,255,0.08)',
}

const dividerTextStyle: React.CSSProperties = {
  color: '#6c7086',
  fontSize: 11,
  whiteSpace: 'nowrap',
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  color: '#a6adc8',
  fontSize: 12,
  marginBottom: 4,
  marginTop: 12,
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 12px',
  backgroundColor: '#313244',
  border: '1px solid rgba(255, 255, 255, 0.1)',
  borderRadius: 8,
  color: '#cdd6f4',
  fontSize: 14,
  outline: 'none',
  boxSizing: 'border-box',
}

const browseBtnStyle: React.CSSProperties = {
  padding: '8px 14px',
  backgroundColor: '#313244',
  border: '1px solid rgba(255, 255, 255, 0.15)',
  borderRadius: 8,
  color: '#cdd6f4',
  fontSize: 13,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
  flexShrink: 0,
}

const iconSourceRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: 4,
  marginTop: 4,
}

const iconSourceBtnStyle: React.CSSProperties = {
  flex: 1,
  padding: '6px 0',
  border: 'none',
  borderRadius: 6,
  fontSize: 12,
  cursor: 'pointer',
  transition: 'background-color 0.15s',
}

const previewStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  marginTop: 14,
  padding: '10px 12px',
  backgroundColor: 'rgba(255,255,255,0.04)',
  borderRadius: 8,
}

const previewContentStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
}

const footerStyle: React.CSSProperties = {
  display: 'flex',
  gap: 8,
  justifyContent: 'flex-end',
  padding: '12px 20px 16px',
  borderTop: '1px solid rgba(255,255,255,0.06)',
}

const cancelBtnStyle: React.CSSProperties = {
  padding: '8px 16px',
  backgroundColor: 'transparent',
  border: '1px solid rgba(255, 255, 255, 0.15)',
  borderRadius: 8,
  color: '#a6adc8',
  fontSize: 13,
  cursor: 'pointer',
}

const saveBtnStyle: React.CSSProperties = {
  padding: '8px 16px',
  backgroundColor: '#89b4fa',
  border: 'none',
  borderRadius: 8,
  color: '#1e1e2e',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
}
