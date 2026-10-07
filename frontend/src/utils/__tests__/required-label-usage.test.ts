import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import ts from 'typescript'

const SOURCE_ROOT = join(__dirname, '..', '..')
const LABEL_ATTRIBUTES = new Set(['labelText', 'legendText', 'titleText', 'label'])

const sourceFiles = (directory: string): string[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return entry.name === '__tests__' ? [] : sourceFiles(path)
    return path.endsWith('.tsx') && !path.includes('.test.') ? [path] : []
  })

const declaresRequired = (attributes: ts.JsxAttributes): boolean =>
  attributes.properties.some((attribute) => {
    if (!ts.isJsxAttribute(attribute)) return false
    const name = attribute.name.getText()
    if (name === 'required' || name === 'aria-required') return true
    if (name === 'ref' && attribute.initializer?.getText() === '{markRequired}') return true
    return name === 'inputProps' && !!attribute.initializer?.getText().includes('aria-required')
  })

/** Fields labelled with requiredLabel() that don't tell assistive technology they're required. */
const unannouncedRequiredFields = (): string[] =>
  sourceFiles(SOURCE_ROOT).flatMap((file) => {
    const source = readFileSync(file, 'utf8')
    if (!source.includes('requiredLabel(')) return []
    const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true)
    const findings: string[] = []
    const visit = (node: ts.Node) => {
      if (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) {
        const labelledRequired = node.attributes.properties.some(
          (attribute) =>
            ts.isJsxAttribute(attribute) &&
            LABEL_ATTRIBUTES.has(attribute.name.getText()) &&
            !!attribute.initializer?.getText().includes('requiredLabel('),
        )
        if (labelledRequired && !declaresRequired(node.attributes)) {
          const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart())
          findings.push(`${relative(SOURCE_ROOT, file)}:${line + 1} <${node.tagName.getText()}>`)
        }
      }
      ts.forEachChild(node, visit)
    }
    visit(sourceFile)
    return findings
  })

describe('requiredLabel usage', () => {
  it('pairs every required marker with required or aria-required on its input', () => {
    // The asterisk is hidden from screen readers (WCAG 3.3.2), so the input must say it.
    expect(unannouncedRequiredFields()).toEqual([])
  })
})
