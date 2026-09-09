import { useEffect, useState, useCallback, useRef } from 'react'
import type { DesktopIcon } from './native-client'
import type { Settings, ShortcutIcon } from './types'
import { parseIcons, serializeIcons, assignGridPosition, assignGridPositions, generateLetterIcon } from './utils'
import { AddIconDialog } from './AddIconDialog'

const DRAG_THRESHOLD = 5

export interface DesktopShortcutsProps {
  settings: Settings
  width: number
  height: number
  setValue(key: 'iconsData', value: string): Promise<void>
  onButtonClick(key: string, listener: () => void): () => void
  openPath(path: string): Promise<void>
  getDesktopIcons(): Promise<DesktopIcon[]>
  browsePath(): Promise<string | null>
  nativeStatus: string | null
}

export default function DesktopShortcuts({ settings, setValue, onButtonClick, openPath, getDesktopIcons, browsePath, width, height, nativeStatus }: DesktopShortcutsProps) {
  const [error, setError] = useState<string | null>(null)

  const [showAddDialog, setShowAddDialog] = useState(false)
  const [hoveredIconId, setHoveredIconId] = useState<string | null>(null)

  // Drag state
  const [dragIconId, setDragIconId] = useState<string | null>(null)
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null)
  const [dropTarget, setDropTarget] = useState<{ col: number; row: number } | null>(null)
  const dragStartRef = useRef<{ x: number; y: number; iconId: string } | null>(null)
  const didDragRef = useRef(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const icons = parseIcons(settings.iconsData)
  const { iconSize, gridSpacing, showLabels, labelColor } = settings

  const cellW = gridSpacing
  const cellH = gridSpacing
  const maxRows = Math.max(1, Math.floor(height / gridSpacing))
  const maxCols = Math.max(1, Math.floor(width / gridSpacing))

  // Save icons helper
  const saveIcons = useCallback(
    (updated: ShortcutIcon[]) => {
      void setValue('iconsData', serializeIcons(updated)).catch((error: unknown) => {
        setError(error instanceof Error ? error.message : 'Could not save shortcuts.')
      })
    },
    [setValue]
  )

  // Button click handlers
  useEffect(() => {
    return onButtonClick('addShortcut', () => {
      setShowAddDialog(true)
    })
  }, [onButtonClick])

  useEffect(() => {
    return onButtonClick('scanDesktop', async () => {
      try {
        const desktopIcons = await getDesktopIcons()
        if (!desktopIcons.length) return

        const currentIcons = parseIcons(settings.iconsData)

        const newIcons = desktopIcons.map((info) => ({
          id: crypto.randomUUID(),
          name: info.name,
          execPath: info.exec_path,
          iconData: info.icon_base64
            ? `data:image/png;base64,${info.icon_base64}`
            : generateLetterIcon(info.name),
        }))

        const positioned = assignGridPositions(currentIcons, newIcons, maxRows)
        saveIcons([...currentIcons, ...positioned])
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not import desktop shortcuts.')
        console.error('[DesktopShortcuts] Failed to scan desktop icons:', err)
      }
    })
  }, [onButtonClick, getDesktopIcons, settings.iconsData, maxRows, saveIcons])

  useEffect(() => {
    return onButtonClick('clearAll', () => {
      saveIcons([])
    })
  }, [onButtonClick, saveIcons])

  // Add icon from dialog
  const handleAddIcon = useCallback(
    (name: string, execPath: string, iconData?: string) => {
      const currentIcons = parseIcons(settings.iconsData)
      const { col, row } = assignGridPosition(currentIcons, maxRows)

      const newIcon: ShortcutIcon = {
        id: crypto.randomUUID(),
        name,
        execPath,
        iconData: iconData || generateLetterIcon(name),
        col,
        row,
      }

      saveIcons([...currentIcons, newIcon])
      setShowAddDialog(false)
    },
    [settings.iconsData, maxRows, saveIcons]
  )

  // Delete single icon
  const handleDeleteIcon = useCallback(
    (iconId: string) => {
      const currentIcons = parseIcons(settings.iconsData)
      saveIcons(currentIcons.filter((i) => i.id !== iconId))
    },
    [settings.iconsData, saveIcons]
  )

  // Click to open (only if not dragging)
  const handleIconClick = useCallback(
    (icon: ShortcutIcon) => {
      if (didDragRef.current) return
      openPath(icon.execPath).catch((err) => {
        setError(err instanceof Error ? err.message : 'Could not open this shortcut.')
        console.error('[DesktopShortcuts] Failed to open path:', icon.execPath, err)
      })
    },
    [openPath]
  )

  // ── Drag & Drop ─────────────────────────────────────────

  const handlePointerDown = useCallback(
    (iconId: string, e: React.PointerEvent) => {
      // Ignore if clicking delete button
      if ((e.target as HTMLElement).closest('[data-delete-btn]')) return
      e.preventDefault()

      const rect = containerRef.current?.getBoundingClientRect()
      dragStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        iconId,
      }
      didDragRef.current = false
    },
    []
  )

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const start = dragStartRef.current
      if (!start) return

      const dx = e.clientX - start.x
      const dy = e.clientY - start.y

      // Check threshold before starting drag
      if (!didDragRef.current) {
        if (Math.abs(dx) < DRAG_THRESHOLD && Math.abs(dy) < DRAG_THRESHOLD) return
        didDragRef.current = true
        setDragIconId(start.iconId)
      }

      // Get position relative to container
      const rect = containerRef.current?.getBoundingClientRect()
      if (!rect) return

      const localX = e.clientX - rect.left
      const localY = e.clientY - rect.top

      setDragPos({ x: localX, y: localY })

      // Calculate which grid cell we're over
      const col = Math.max(0, Math.min(maxCols - 1, Math.floor(localX / cellW)))
      const row = Math.max(0, Math.min(maxRows - 1, Math.floor(localY / cellH)))
      setDropTarget({ col, row })
    }

    const onUp = () => {
      const start = dragStartRef.current
      if (!start) return

      if (didDragRef.current && dropTarget && dragIconId) {
        // Perform the swap/move
        const currentIcons = parseIcons(settings.iconsData)
        const draggedIcon = currentIcons.find((i) => i.id === dragIconId)
        const targetIcon = currentIcons.find(
          (i) => i.col === dropTarget.col && i.row === dropTarget.row
        )

        if (draggedIcon) {
          const updated = currentIcons.map((icon) => {
            if (icon.id === draggedIcon.id) {
              // Move dragged icon to drop target
              return { ...icon, col: dropTarget.col, row: dropTarget.row }
            }
            if (targetIcon && icon.id === targetIcon.id) {
              // Swap: move target icon to dragged icon's old position
              return { ...icon, col: draggedIcon.col, row: draggedIcon.row }
            }
            return icon
          })
          saveIcons(updated)
        }
      }

      // Reset drag state
      dragStartRef.current = null
      setDragIconId(null)
      setDragPos(null)
      setDropTarget(null)

      // Allow click handler to check didDragRef on the same frame
      requestAnimationFrame(() => {
        didDragRef.current = false
      })
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [dragIconId, dropTarget, settings.iconsData, saveIcons, cellW, cellH, maxCols, maxRows])

  // Find dragged icon data for ghost rendering
  const draggedIcon = dragIconId ? icons.find((i) => i.id === dragIconId) : null

  return (
    <div ref={containerRef} style={{ position: 'relative', width, height, overflow: 'hidden' }}>
      {(error || nativeStatus) && <p role="status" style={{ position: 'absolute', top: 0, left: 8, right: 8, zIndex: 20, padding: 8, background: '#282832', color: '#fff', borderRadius: 8 }}>{error || nativeStatus}</p>}
      {icons.length === 0 && !showAddDialog && (
        <div style={emptyStateStyle}>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="rgba(205,214,244,0.25)"
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ width: 40, height: 40, marginBottom: 12 }}
          >
            <rect x="3" y="3" width="18" height="18" rx="3" />
            <path d="M12 8v8M8 12h8" />
          </svg>
          <span style={{ color: 'rgba(205,214,244,0.4)', fontSize: 13, textAlign: 'center' }}>
            No shortcuts yet — click <strong>Add Shortcut</strong> in the sidebar to get started
          </span>
        </div>
      )}

      {/* Drop target indicator */}
      {dropTarget && dragIconId && (
        <div
          style={{
            position: 'absolute',
            left: dropTarget.col * cellW,
            top: dropTarget.row * cellH,
            width: cellW,
            height: cellH,
            borderRadius: 8,
            border: '2px dashed rgba(137, 180, 250, 0.6)',
            backgroundColor: 'rgba(137, 180, 250, 0.1)',
            pointerEvents: 'none',
            zIndex: 5,
          }}
        />
      )}

      {icons.map((icon) => {
        const x = icon.col * cellW
        const y = icon.row * cellH
        const isHovered = hoveredIconId === icon.id
        const isDragging = icon.id === dragIconId

        return (
          <div
            key={icon.id}
            onClick={() => handleIconClick(icon)}
            onPointerDown={(e) => handlePointerDown(icon.id, e)}
            title={icon.execPath}
            style={{
              position: 'absolute',
              left: x,
              top: y,
              width: cellW,
              height: cellH,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: isDragging ? 'grabbing' : 'pointer',
              borderRadius: 8,
              transition: isDragging ? 'none' : 'background-color 0.15s',
              userSelect: 'none',
              backgroundColor: isHovered && !isDragging ? 'rgba(255,255,255,0.08)' : 'transparent',
              opacity: isDragging ? 0.3 : 1,
              touchAction: 'none',
            }}
            onMouseEnter={() => !dragIconId && setHoveredIconId(icon.id)}
            onMouseLeave={() => setHoveredIconId(null)}
          >
            {/* Delete button */}
            {isHovered && !dragIconId && (
              <button
                data-delete-btn
                onClick={(e) => {
                  e.stopPropagation()
                  handleDeleteIcon(icon.id)
                }}
                style={deleteBtnStyle}
                title="Remove shortcut"
              >
                ✕
              </button>
            )}

            <img
              src={icon.iconData || generateLetterIcon(icon.name)}
              alt={icon.name}
              draggable={false}
              style={{
                width: iconSize,
                height: iconSize,
                objectFit: 'contain',
                flexShrink: 0,
                pointerEvents: 'none',
              }}
            />
            {showLabels && (
              <span
                style={{
                  marginTop: 4,
                  fontSize: 11,
                  color: labelColor,
                  textAlign: 'center',
                  lineHeight: '14px',
                  maxWidth: cellW - 8,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  textShadow: '0 1px 3px rgba(0,0,0,0.8)',
                  pointerEvents: 'none',
                }}
              >
                {icon.name}
              </span>
            )}
          </div>
        )
      })}

      {/* Drag ghost */}
      {draggedIcon && dragPos && (
        <div
          style={{
            position: 'absolute',
            left: dragPos.x - cellW / 2,
            top: dragPos.y - cellH / 2,
            width: cellW,
            height: cellH,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'none',
            zIndex: 50,
            opacity: 0.85,
            transform: 'scale(1.08)',
            filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.4))',
          }}
        >
          <img
            src={draggedIcon.iconData || generateLetterIcon(draggedIcon.name)}
            alt={draggedIcon.name}
            draggable={false}
            style={{
              width: iconSize,
              height: iconSize,
              objectFit: 'contain',
            }}
          />
          {showLabels && (
            <span
              style={{
                marginTop: 4,
                fontSize: 11,
                color: labelColor,
                textAlign: 'center',
                lineHeight: '14px',
                maxWidth: cellW - 8,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                textShadow: '0 1px 3px rgba(0,0,0,0.8)',
              }}
            >
              {draggedIcon.name}
            </span>
          )}
        </div>
      )}

      {showAddDialog && (
        <AddIconDialog
          browsePath={browsePath}
          onSave={handleAddIcon}
          onCancel={() => setShowAddDialog(false)}
        />
      )}
    </div>
  )
}

const emptyStateStyle: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 0,
  pointerEvents: 'none',
}

const deleteBtnStyle: React.CSSProperties = {
  position: 'absolute',
  top: 4,
  right: 4,
  width: 18,
  height: 18,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  backgroundColor: 'rgba(0,0,0,0.6)',
  border: '1px solid rgba(255,255,255,0.15)',
  borderRadius: '50%',
  color: '#cdd6f4',
  fontSize: 10,
  cursor: 'pointer',
  padding: 0,
  lineHeight: 1,
  zIndex: 10,
}
