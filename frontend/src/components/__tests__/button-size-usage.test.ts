import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import ts from 'typescript'

const SOURCE_ROOT = join(__dirname, '..', '..')

// Buttons in sections that haven't moved to md yet, counted per file. Lower the count as each
// section moves, and remove the entry once it reaches zero.
const PENDING_NON_MD_BUTTONS: Record<string, number> = {}

// Buttons that stay another size, counted per file. The login page signs in with Carbon's
// expressive 48px buttons.
const INTENTIONAL_NON_MD_BUTTONS: Record<string, number> = {
  'pages/Landing/index.tsx': 2,
}

const ALLOWED_NON_MD_BUTTONS = { ...PENDING_NON_MD_BUTTONS, ...INTENTIONAL_NON_MD_BUTTONS }

const sourceFiles = (directory: string): string[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return entry.name === '__tests__' ? [] : sourceFiles(path)
    return path.endsWith('.tsx') && !path.includes('.test.') ? [path] : []
  })

const sizeAttribute = (attributes: ts.JsxAttributes): string => {
  const size = attributes.properties.find(
    (attribute) => ts.isJsxAttribute(attribute) && attribute.name.getText() === 'size',
  )
  if (!size || !ts.isJsxAttribute(size)) return 'missing'
  return size.initializer && ts.isStringLiteral(size.initializer)
    ? size.initializer.text
    : (size.initializer?.getText() ?? 'missing')
}

/** Every Carbon Button whose size isn't an explicit "md", grouped by file. */
const nonMdButtonsByFile = (): Record<string, string[]> =>
  Object.fromEntries(
    sourceFiles(SOURCE_ROOT)
      .map((file) => {
        const source = readFileSync(file, 'utf8')
        const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true)
        const findings: string[] = []
        const visit = (node: ts.Node) => {
          if (
            (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) &&
            node.tagName.getText() === 'Button'
          ) {
            const size = sizeAttribute(node.attributes)
            if (size !== 'md') {
              const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart())
              findings.push(`${relative(SOURCE_ROOT, file)}:${line + 1} size=${size}`)
            }
          }
          ts.forEachChild(node, visit)
        }
        visit(sourceFile)
        return [relative(SOURCE_ROOT, file), findings] as const
      })
      .filter(([, findings]) => findings.length > 0),
  )

describe('Button size usage', () => {
  it('sets size="md" on every Button', () => {
    // Carbon defaults to lg (48px); LEXIS buttons are md (40px) outside the files listed above.
    const findings = nonMdButtonsByFile()
    const unexpected = Object.entries(findings)
      .filter(([file]) => !(file in ALLOWED_NON_MD_BUTTONS))
      .flatMap(([, fileFindings]) => fileFindings)
    expect(unexpected).toEqual([])
  })

  it.each(Object.entries(ALLOWED_NON_MD_BUTTONS))(
    'keeps the allowed non-md count for %s current',
    (file, count) => {
      expect(nonMdButtonsByFile()[file] ?? []).toHaveLength(count)
    },
  )
})
