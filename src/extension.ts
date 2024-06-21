import * as vscode from 'vscode'
import * as fs from 'fs'
import * as path from 'path'
import ignore, { Ignore } from 'ignore'

export function activate(context: vscode.ExtensionContext) {
  let disposable = vscode.commands.registerCommand('workspaceArchiver.generateCodeContext', () => {
    ensureIgnoreFileExists() // Ensure Ignore_files.txt exists
    generateCodeContext()
    vscode.window.showInformationMessage('workspace Archiver Generated Successfully!')
  })

  context.subscriptions.push(disposable)

  vscode.workspace.onDidSaveTextDocument(() => {
    ensureIgnoreFileExists() // Ensure Ignore_files.txt exists
    generateCodeContext()
    vscode.window.showInformationMessage('workspace Archiver Updated.')
  })

  ensureIgnoreFileExists() // Ensure Ignore_files.txt exists when the extension is activated
}

function ensureIgnoreFileExists() {
  const projectDir = vscode.workspace.rootPath?.toString() ?? ''
  const ignoreFilePath = path.join(projectDir, 'Ignore_files.txt')
  if (!fs.existsSync(ignoreFilePath)) {
    const defaultContent = [
      '# To ignore files with specific extensions, add them like this: *.log',
      'node_modules/',
      'dist/',
      'build/',
      'package-lock.json',
      'yarn.lock',
      'tsconfig.json',
      '*.svg',
      '*.png',
      '*.jpg',
      '*.jpeg',
      '*.gif',
      '*.ico',
      '*.webp',
      '*.eot',
      '*.ttf',
      '// Add more files and folders here...',
      '\n',
    ].join('\n')
    fs.writeFileSync(ignoreFilePath, defaultContent)
  }
}

function generateCodeContext() {
  const projectDir = vscode.workspace.rootPath?.toString() ?? ''
  const outputFile = path.join(projectDir, 'workspaceArchiver.txt')

  fs.existsSync(outputFile) && fs.unlinkSync(outputFile)

  const ig = loadGitignore(projectDir)
  ig.add('.*/') // Ignore all hidden files and folders

  const rootEntries = fs.readdirSync(projectDir, { withFileTypes: true })
  rootEntries.forEach((entry) => {
    if (entry.isDirectory()) {
      const dirPath = path.join(projectDir, entry.name)
      readFiles(dirPath, outputFile, projectDir, ig)
    }
  })
}

function loadGitignore(projectDir: string) {
  const gitignorePath = path.join(projectDir, '.gitignore')
  const ignoreFilesPath = path.join(projectDir, 'Ignore_files.txt')
  const ig = ignore()

  // Load .gitignore if it exists
  if (fs.existsSync(gitignorePath)) {
    const gitignoreContent = fs.readFileSync(gitignorePath).toString()
    ig.add(gitignoreContent)
  }

  // Load Ignore_files.txt
  if (fs.existsSync(ignoreFilesPath)) {
    const ignoreFilesContent = fs.readFileSync(ignoreFilesPath).toString()
    ig.add(ignoreFilesContent.split('\n').filter((line) => line.trim() && !line.startsWith('#')))
  }

  return ig
}

function readFiles(dir: string, outputFile: string, projectDir: string, ig: Ignore) {
  const entries = fs.readdirSync(dir, { withFileTypes: true })

  entries.forEach((entry: fs.Dirent) => {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      readFiles(fullPath, outputFile, projectDir, ig)
    } else if (entry.isFile()) {
      appendFileIfNotIgnored(fullPath, outputFile, projectDir, ig)
    }
  })
}

function appendFileIfNotIgnored(fullPath: string, outputFile: string, projectDir: string, ig: Ignore) {
  const isIgnored = ig.ignores(path.relative(projectDir, fullPath))
  if (!isIgnored) {
    const relativePath = path.relative(projectDir, fullPath)
    fs.appendFileSync(outputFile, `// File: ${relativePath}\n`)
    fs.appendFileSync(outputFile, fs.readFileSync(fullPath))
    fs.appendFileSync(outputFile, '\n')
  }
}

export function deactivate() {}
