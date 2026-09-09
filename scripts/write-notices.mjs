import { readFile, writeFile } from 'node:fs/promises'
const notices = await Promise.all(['react', 'react-dom'].map(async (name) =>
  `## ${name}\n\n${await readFile(new URL(`../node_modules/${name}/LICENSE`, import.meta.url), 'utf8')}`))
await writeFile(new URL('../dist/THIRD_PARTY_NOTICES.md', import.meta.url), '# Third-party notices\n\n' + notices.join('\n\n'))
