import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import ts from 'typescript'

const SOURCE_ROOT = join(__dirname, '..', '..')
const NODE_HELPERS = new Set(['displayValue', 'displayTableValue'])

const sourceFiles = (directory: string): string[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return entry.name === '__tests__' ? [] : sourceFiles(path)
    return /\.tsx?$/.test(path) && !path.includes('.test.') ? [path] : []
  })

const callsNodeHelper = (node: ts.Expression): boolean =>
  ts.isCallExpression(node) && NODE_HELPERS.has(node.expression.getText())

/** displayValue() returns a React node for blank values, so it can't be joined into text. */
const textUsesOfNodeHelpers = (): string[] =>
  sourceFiles(SOURCE_ROOT).flatMap((file) => {
    const source = readFileSync(file, 'utf8')
    if (!/display(Table)?Value\(/.test(source)) return []
    const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true)
    const findings: string[] = []
    const visit = (node: ts.Node) => {
      const inTemplate =
        ts.isTemplateSpan(node) &&
        ts.isExpression(node.expression) &&
        callsNodeHelper(node.expression)
      const inConcatenation =
        ts.isBinaryExpression(node) &&
        node.operatorToken.kind === ts.SyntaxKind.PlusToken &&
        (callsNodeHelper(node.left) || callsNodeHelper(node.right))
      if (inTemplate || inConcatenation) {
        const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart())
        findings.push(`${relative(SOURCE_ROOT, file)}:${line + 1}`)
      }
      ts.forEachChild(node, visit)
    }
    visit(sourceFile)
    return findings
  })

describe('displayValue usage', () => {
  it('uses displayValueText wherever a read-only value becomes part of a string', () => {
    expect(textUsesOfNodeHelpers()).toEqual([])
  })
})
