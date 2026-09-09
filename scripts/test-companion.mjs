import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'

const executable = process.env.SHORTCUTS_COMPANION ?? resolve('native/out/windows-x86_64/bin/backend.exe')
function record(frame) {
  const json = Buffer.from(JSON.stringify(frame))
  const header = Buffer.alloc(4)
  header.writeUInt32LE(json.length)
  return Buffer.concat([header, json])
}
function run(frames) {
  const result = spawnSync(executable, [], {
    env: { ...process.env, MYWALLPAPER_PROTOCOL: 'process-v2' },
    input: Buffer.concat(frames.map(record)), timeout: 30000, maxBuffer: 32 * 1024 * 1024,
    windowsHide: true,
  })
  if (result.error) throw result.error
  return result
}
function decode(bytes) {
  const frames = []
  let parts = []
  for (let offset = 0; offset < bytes.length;) {
    assert.ok(offset + 4 <= bytes.length)
    const header = bytes.readUInt32LE(offset)
    const kind = header >>> 30, size = header & 0x3fffffff
    offset += 4
    assert.ok(size > 0 && size <= 1024 * 1024 && offset + size <= bytes.length)
    parts.push(bytes.subarray(offset, offset + size))
    offset += size
    if (kind === 0 || kind === 3) { frames.push(JSON.parse(Buffer.concat(parts))); parts = [] }
  }
  assert.equal(parts.length, 0)
  return frames
}

const result = run([
  { type: 'init', v: 5 },
  { type: 'message', v: 5, payload: { kind: 'shortcuts.open', id: 'invalid-path', path: 'bad\0path' } },
  { type: 'message', v: 5, payload: { kind: 'shortcuts.scan', id: 'desktop' } },
  { type: 'shutdown', v: 5 },
])
assert.equal(result.status, 0, result.stderr.toString())
const frames = decode(result.stdout)
assert.deepEqual(frames[0], { type: 'ready', v: 5 })
assert.equal(frames[1].payload.id, 'invalid-path')
assert.match(frames[1].payload.error, /null characters/)
assert.equal(frames[2].payload.id, 'desktop')
assert.ok(Array.isArray(frames[2].payload.value), frames[2].payload.error)
for (const item of frames[2].payload.value) {
  assert.equal(typeof item.name, 'string')
  assert.equal(typeof item.exec_path, 'string')
  if (item.icon_base64 !== null) {
    assert.deepEqual(Buffer.from(item.icon_base64, 'base64').subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  }
}
const wrongVersion = run([{ type: 'init', v: 4 }])
assert.notEqual(wrongVersion.status, 0)
console.log('Windows companion protocol, path rejection, Desktop enumeration and PNG icons verified.')
