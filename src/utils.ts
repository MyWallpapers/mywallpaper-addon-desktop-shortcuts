import type { ShortcutIcon } from './types'

const ICON_PALETTE = [
  '#e06c75', '#e5c07b', '#98c379', '#56b6c2', '#61afef',
  '#c678dd', '#d19a66', '#be5046', '#7ec8e3', '#f5a623',
  '#a3be8c', '#b48ead', '#88c0d0', '#bf616a', '#d08770',
  '#ebcb8b',
]

const DOMAIN_NAMES: Record<string, string> = {
  'google.com': 'Google',
  'youtube.com': 'YouTube',
  'github.com': 'GitHub',
  'gmail.com': 'Gmail',
  'reddit.com': 'Reddit',
  'twitter.com': 'Twitter',
  'x.com': 'X',
  'facebook.com': 'Facebook',
  'instagram.com': 'Instagram',
  'linkedin.com': 'LinkedIn',
  'stackoverflow.com': 'Stack Overflow',
  'wikipedia.org': 'Wikipedia',
  'amazon.com': 'Amazon',
  'netflix.com': 'Netflix',
  'spotify.com': 'Spotify',
  'discord.com': 'Discord',
  'twitch.tv': 'Twitch',
  'chatgpt.com': 'ChatGPT',
  'openai.com': 'OpenAI',
  'claude.ai': 'Claude',
}

function hashCode(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash)
}

export function generateLetterIcon(name: string, bgColor?: string): string {
  const letter = (name || '?').charAt(0).toUpperCase().replace(/[&<>"']/g, (character) => `&#${character.charCodeAt(0)};`)
  const color = bgColor || ICON_PALETTE[hashCode(name) % ICON_PALETTE.length]

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
    <rect width="64" height="64" rx="14" fill="${color}"/>
    <text x="32" y="32" text-anchor="middle" dominant-baseline="central"
      font-family="system-ui, -apple-system, sans-serif" font-size="30" font-weight="700"
      fill="white">${letter}</text>
  </svg>`

  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

export function extractNameFromPath(path: string): string {
  const trimmed = path.trim()
  if (!trimmed) return ''

  // URL detection
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const url = new URL(trimmed)
      const hostname = url.hostname.replace(/^www\./, '')
      const known = DOMAIN_NAMES[hostname]
      if (known) return known
      // Capitalize first part of domain
      const domainPart = hostname.split('.')[0]
      return domainPart.charAt(0).toUpperCase() + domainPart.slice(1)
    } catch {
      return trimmed
    }
  }

  // Get basename
  const parts = trimmed.replace(/[\\/]+$/, '').split(/[\\/]/)
  let basename = parts[parts.length - 1] || trimmed

  // Strip extension
  basename = basename.replace(/\.\w+$/, '')

  // Capitalize
  return basename.charAt(0).toUpperCase() + basename.slice(1)
}

export function parseIcons(json: string): ShortcutIcon[] {
  try {
    const parsed = JSON.parse(json)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((icon): icon is ShortcutIcon =>
      icon !== null && typeof icon === 'object' &&
      typeof icon.id === 'string' && typeof icon.name === 'string' &&
      typeof icon.execPath === 'string' && typeof icon.iconData === 'string' &&
      Number.isInteger(icon.col) && icon.col >= 0 && Number.isInteger(icon.row) && icon.row >= 0)
  } catch {
    return []
  }
}

export function serializeIcons(icons: ShortcutIcon[]): string {
  return JSON.stringify(icons)
}

/**
 * Find the next free grid position, filling columns top-to-bottom, left-to-right.
 */
export function assignGridPosition(
  icons: ShortcutIcon[],
  maxRows: number
): { col: number; row: number } {
  if (maxRows <= 0) return { col: 0, row: 0 }

  const occupied = new Set(icons.map((i) => `${i.col},${i.row}`))

  for (let col = 0; ; col++) {
    for (let row = 0; row < maxRows; row++) {
      if (!occupied.has(`${col},${row}`)) {
        return { col, row }
      }
    }
  }
}

/**
 * Assign grid positions to a batch of new icons, avoiding existing positions.
 */
export function assignGridPositions(
  existingIcons: ShortcutIcon[],
  newIcons: Omit<ShortcutIcon, 'col' | 'row'>[],
  maxRows: number
): ShortcutIcon[] {
  const all = [...existingIcons]
  const positioned: ShortcutIcon[] = []

  for (const icon of newIcons) {
    const { col, row } = assignGridPosition(all, maxRows)
    const full: ShortcutIcon = { ...icon, col, row }
    all.push(full)
    positioned.push(full)
  }

  return positioned
}
