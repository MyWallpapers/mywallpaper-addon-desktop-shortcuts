import assert from 'node:assert/strict'
import { access, readdir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

// Module/stylesheet smoke only. Test Canvas mounting and rendering in a browser.
const links = []
globalThis.document = {
  querySelectorAll() { return links },
  createElement(tag) {
    assert.equal(tag, 'link')
    const listeners = new Map()
    return {
      href: '', rel: '', sheet: null,
      addEventListener(event, listener) { listeners.set(event, listener) },
      dispatch(event) { listeners.get(event)?.() },
    }
  },
  head: {
    append(link) {
      links.push(link)
      void readFile(new URL(link.href)).then((bytes) => {
        assert.ok(bytes.length > 0, 'the emitted stylesheet must not be empty')
        link.sheet = {}
        link.dispatch('load')
      }).catch(() => link.dispatch('error'))
    },
  },
}

const entry = await import(pathToFileURL(resolve('dist/assets/addon.js')).href)
assert.equal(typeof entry.mount, 'function', 'the production module must export mount')
await assert.rejects(access(resolve('dist/index.html')), { code: 'ENOENT' })
const assets = await readdir(resolve('dist/assets'))
const expectedStyles = assets.filter((name) => name.endsWith('.css'))
  .map((name) => pathToFileURL(resolve('dist/assets', name)).href).sort()
assert.deepEqual(links.map((link) => link.href).sort(), expectedStyles,
  'the production module must load every emitted stylesheet')
assert.ok(links.every((link) => link.sheet !== null), 'stylesheets must finish loading')
