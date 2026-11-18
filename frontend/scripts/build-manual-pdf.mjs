// Builds the user manual PDFs from docs/manual/<edition>/*.md and docs/manual/<edition>/images/.
//
//   cd frontend && npm run manual:pdf
//
// Output: frontend/public/manuals/LEXIS-<name>-User-Manual.pdf, one for industry users and one for
// each ministry role, served by the app for download. Uses marked for Markdown and the Playwright
// Chromium the e2e tests already install. Screenshots come from e2e/manual.screenshots.spec.ts
// (`npm run manual:screenshots`). `--check` stops before the PDFs: it runs the role, link and
// table checks only and needs no browser.
import { execSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import { chromium } from '@playwright/test'
import { Marked } from 'marked'

const MANUAL = path.resolve(import.meta.dirname, '..', '..', 'docs', 'manual')
const OUT = path.resolve(import.meta.dirname, '..', 'public', 'manuals')
const SYSTEM = 'Log Exemption Information System'

// One PDF each. A ministry manual holds only the chapters and lines marked for its role.
const MANUALS = [
  {
    dir: 'industry',
    name: 'Industry User Manual',
    audience: 'For industry users who log in with Business BCeID',
  },
  ...[
    ['administrator', 'Administrator'],
    ['application-approver', 'Application Approver'],
    ['exemption-approver', 'Exemption Approver'],
    ['read-only', 'Read Only'],
  ].map(([role, roleName]) => ({
    dir: 'ministry',
    role,
    name: `${roleName} User Manual`,
    audience: `For ministry staff with the ${roleName} role, who log in with IDIR`,
  })),
]
const ROLES = MANUALS.flatMap((manual) => manual.role ?? [])

/**
 * Keeps the lines written for one role. `<!-- roles: a, b -->` on a line of its own opens a block
 * that `<!-- /roles -->` closes; at the end of a line it applies to that line only.
 */
const linesForRole = (markdown, role, file) => {
  const kept = []
  let blockRoles = null
  markdown.split('\n').forEach((line, index) => {
    const fail = (problem) => {
      throw new Error(`${file}:${index + 1}: ${problem}`)
    }
    const rolesIn = (list) => {
      const roles = list.split(',').map((name) => name.trim())
      const unknown = roles.find((name) => !ROLES.includes(name))
      if (unknown) fail(`unknown role "${unknown}"`)
      return roles
    }
    if (line.trim() === '<!-- /roles -->') {
      if (!blockRoles) fail('no roles block is open')
      blockRoles = null
      return
    }
    const marker = line.match(/<!-- roles: ([^>]*?) -->\s*$/)
    if (marker && line.trim() === marker[0].trim()) {
      if (blockRoles) fail('a roles block is already open')
      blockRoles = rolesIn(marker[1])
      return
    }
    if (blockRoles && !blockRoles.includes(role)) return
    if (!marker) kept.push(line)
    else if (rolesIn(marker[1]).includes(role)) kept.push(line.slice(0, marker.index).trimEnd())
  })
  if (blockRoles) throw new Error(`${file}: a roles block is never closed`)
  return kept.join('\n')
}

const slug = (text) =>
  text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .trim()
    .replace(/\s+/g, '-')

const escapeHtml = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

let revision = ''
try {
  revision = execSync('git rev-parse --short HEAD', {
    cwd: MANUAL,
    stdio: ['ignore', 'pipe', 'ignore'],
  })
    .toString()
    .trim()
} catch {
  /* not a git checkout */
}
const date = new Date().toLocaleDateString('en-CA', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
})

const css = `
  @page { size: Letter; margin: 22mm 18mm 20mm 18mm; }
  @page :first { margin: 0; }
  :root { --blue: #013366; --blue-2: #1e5189; --gold: #fcba19; --ink: #2d2d2d; --muted: #5b6370; --rule: #d8dce2; --tint: #f3f6fa; }
  * { box-sizing: border-box; }
  html { font-family: Arial, "Helvetica Neue", Helvetica, sans-serif; font-size: 10.5pt; color: var(--ink); line-height: 1.5; }
  body { margin: 0; }
  a { color: var(--blue-2); text-decoration: none; }

  .cover { height: 279.4mm; width: 215.9mm; position: relative; background: var(--blue); color: #fff; page-break-after: always; overflow: hidden; }
  .cover::before { content: ""; position: absolute; left: 0; right: 0; top: 0; height: 9mm; background: var(--gold); }
  .cover::after { content: ""; position: absolute; right: -60mm; bottom: -60mm; width: 170mm; height: 170mm; border-radius: 50%; border: 18mm solid rgba(255,255,255,.06); }
  .cover .inner { position: absolute; left: 22mm; right: 22mm; top: 70mm; }
  .cover .kicker { font-size: 11pt; letter-spacing: .18em; text-transform: uppercase; color: var(--gold); font-weight: 700; }
  .cover h1 { font-size: 38pt; line-height: 1.1; margin: 6mm 0 4mm; padding: 0; border: 0; color: #fff; font-weight: 700; text-wrap: balance; }
  .cover .sub { font-size: 18pt; font-weight: 300; opacity: .92; }
  .cover .bar { width: 28mm; height: 2mm; background: var(--gold); margin: 12mm 0; }
  .cover .meta { font-size: 10pt; opacity: .85; line-height: 1.8; }
  .cover .foot { position: absolute; left: 22mm; bottom: 20mm; font-size: 9.5pt; opacity: .8; }

  .toc { page-break-after: always; }
  .toc h1 { border: 0; }
  .toc ol { list-style: none; padding: 0; margin: 8mm 0 0; }
  .toc li { border-bottom: 1px solid var(--rule); }
  .toc li a { display: flex; gap: 6mm; padding: 3.2mm 0; color: var(--ink); font-size: 12pt; }
  .toc-num { width: 9mm; color: var(--blue-2); font-weight: 700; text-align: right; }

  .intro { page-break-after: always; }
  .chapter { page-break-before: always; }

  h1 { font-size: 24pt; color: var(--blue); margin: 0 0 6mm; padding-bottom: 3mm; border-bottom: 2.5px solid var(--gold); line-height: 1.2; }
  h2 { font-size: 15pt; color: var(--blue); margin: 9mm 0 3mm; page-break-after: avoid; }
  h3 { font-size: 12pt; color: var(--blue-2); margin: 6mm 0 2mm; page-break-after: avoid; }
  p, ul, ol { margin: 0 0 3mm; }
  li { margin-bottom: 1mm; }
  strong { color: #1a1a1a; }
  code { font-family: "SFMono-Regular", Menlo, Consolas, monospace; font-size: 9pt; background: var(--tint); padding: .3mm 1.2mm; border-radius: 1mm; }
  blockquote { margin: 4mm 0 5mm; padding: 3mm 4mm; background: var(--tint); border-left: 1.2mm solid var(--gold); page-break-inside: avoid; }
  blockquote p:last-child { margin-bottom: 0; }

  table { width: 100%; border-collapse: collapse; margin: 3mm 0 5mm; font-size: 9.3pt; page-break-inside: auto; }
  thead { display: table-header-group; }
  tr { page-break-inside: avoid; }
  th { background: var(--blue); color: #fff; text-align: left; padding: 2mm 2.5mm; font-weight: 700; }
  td { padding: 2mm 2.5mm; border-bottom: 1px solid var(--rule); vertical-align: top; }
  tbody tr:nth-child(even) td { background: var(--tint); }
  td:first-child { width: 34%; }

  figure { margin: 5mm 0 6mm; page-break-inside: avoid; text-align: center; }
  figure img { max-width: 88%; max-height: 100mm; border: 1px solid var(--rule); border-radius: 1.5mm; box-shadow: 0 1mm 3mm rgba(1,51,102,.12); }
  figcaption { font-size: 8.8pt; color: var(--muted); margin-top: 2mm; font-style: italic; }
`

/** One manual's chapters as a single HTML document. */
const buildHtml = (manual) => {
  const dir = path.join(MANUAL, manual.dir)
  const read = (file) => {
    const markdown = readFileSync(path.join(dir, file), 'utf-8')
    return manual.role ? linesForRole(markdown, manual.role, `${manual.dir}/${file}`) : markdown
  }
  const chapterFiles = readdirSync(dir)
    .filter((f) => /^\d\d-.+\.md$/.test(f))
    .sort()
  // A chapter whose title is not kept for this role is left out; the rest are numbered in order.
  const chapters = chapterFiles
    .map((file) => ({ file, id: path.basename(file, '.md'), markdown: read(file) }))
    .filter((chapter) => /^# /m.test(chapter.markdown))
    .map((chapter) => {
      if (/^\|[-| :]+\|\n(?!\|)/m.test(chapter.markdown)) {
        throw new Error(`${manual.name}: a table in ${chapter.file} has no rows left`)
      }
      return chapter
    })
    .map((chapter, index) => ({
      ...chapter,
      markdown: chapter.markdown.replace(/^# (\d+\.\s*)?/m, `# ${index + 1}. `),
    }))

  const headingIds = new Set()
  const linkedIds = []

  /** Markdown → HTML for one chapter; heading ids and links are made unique across the book. */
  const render = (markdown, chapterId) => {
    const marked = new Marked({
      gfm: true,
      renderer: {
        heading({ tokens, depth, text }) {
          const inner = this.parser.parseInline(tokens)
          const id = depth === 1 ? chapterId : `${chapterId}--${slug(text)}`
          headingIds.add(id)
          return `<h${depth} id="${id}">${inner}</h${depth}>\n`
        },
        link({ href, tokens }) {
          const inner = this.parser.parseInline(tokens)
          if (/^https?:|^mailto:/.test(href)) return `<a href="${href}">${inner}</a>`
          const [file, anchor] = href.split('#')
          if (file && !chapters.some((chapter) => chapter.file === file)) {
            if (chapterFiles.includes(file)) {
              throw new Error(`${manual.name}: ${chapterId} links to ${file}, which it leaves out`)
            }
            // Developer docs aren't in the book.
            return inner
          }
          const target = file ? path.basename(file, '.md') : chapterId
          const id = anchor ? `${target}--${anchor}` : target
          linkedIds.push({ id, chapterId })
          return `<a href="#${id}">${inner}</a>`
        },
        image({ href, text }) {
          const caption = escapeHtml(text)
          return `<figure><img src="${pathToFileURL(path.join(dir, href)).href}" alt="${caption}"><figcaption>${caption}</figcaption></figure>`
        },
      },
    })
    return marked.parse(markdown)
  }

  /** The README's opening and its "How to read this manual" section are the introduction. */
  const readme = read('README.md')
  const opening = readme
    .split('\n## Contents')[0]
    .replace(/^# .*\n/, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
  const howToRead = readme.match(/## How to read this manual\n([\s\S]*?)(?=\n## |$)/)?.[1] ?? ''
  const intro = render(
    `# About this manual\n\n${opening}\n\n## How to read this manual\n${howToRead}`,
    'about',
  )

  const body = chapters
    .map((chapter) => `<section class="chapter">${render(chapter.markdown, chapter.id)}</section>`)
    .join('\n')

  const deadLink = linkedIds.find((link) => !headingIds.has(link.id))
  if (deadLink) {
    throw new Error(
      `${manual.name}: ${deadLink.chapterId} links to #${deadLink.id}, which is not in it`,
    )
  }

  const toc = chapters
    .map((chapter) => {
      const title = chapter.markdown.match(/^# (.+)$/m)[1]
      const [, num, name] = title.match(/^(\d+)\.\s*(.*)$/)
      return `<li><a href="#${chapter.id}"><span class="toc-num">${num}</span><span class="toc-name">${escapeHtml(name)}</span></a></li>`
    })
    .join('\n')

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>LEXIS ${manual.name}</title><style>${css}</style></head><body>
<section class="cover"><div class="inner">
  <div class="kicker">Ministry of Forests</div>
  <h1>${SYSTEM}</h1>
  <div class="sub">${manual.name}</div>
  <div class="bar"></div>
  <div class="meta">${date}${revision ? `<br>Revision ${revision}` : ''}</div>
</div><div class="foot">${manual.audience}</div></section>
<section class="toc"><h1>Contents</h1><ol>${toc}</ol></section>
<section class="intro">${intro}</section>
${body}
</body></html>`
}

const temp = mkdtempSync(path.join(tmpdir(), 'lexis-manual-'))
const pages = MANUALS.map((manual) => {
  const fileName = `LEXIS-${manual.name.replaceAll(' ', '-')}`
  const htmlPath = path.join(temp, `${fileName}.html`)
  writeFileSync(htmlPath, buildHtml(manual))
  return { manual, htmlPath, out: path.join(OUT, `${fileName}.pdf`) }
})

if (process.argv.includes('--check')) {
  console.log(`Checked ${pages.length} manuals: ${temp}`)
  process.exit(0)
}

mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch()
try {
  for (const { manual, htmlPath, out } of pages) {
    const page = await browser.newPage()
    await page.goto(pathToFileURL(htmlPath).href, { waitUntil: 'load' })
    await page.pdf({
      path: out,
      format: 'Letter',
      printBackground: true,
      preferCSSPageSize: true,
      displayHeaderFooter: true,
      headerTemplate: '<span></span>',
      footerTemplate: `<div style="width:100%;font-family:Arial,sans-serif;font-size:7.5pt;color:#5b6370;padding:0 18mm;display:flex;justify-content:space-between">
      <span>${SYSTEM} — ${manual.name}</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`,
    })
    await page.close()
    console.log(`Wrote ${path.relative(process.cwd(), out)}`)
  }
} finally {
  await browser.close()
}
