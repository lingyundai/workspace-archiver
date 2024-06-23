import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import ignore, { Ignore } from 'ignore';

let shouldGenerateArchiver = false;
let archiverGenerated = false;
let statusBarItem: vscode.StatusBarItem;

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument(checkProject),
    vscode.workspace.onDidSaveTextDocument(onSave)
  );

  // Create the status bar item once
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBarItem.command = 'extension.reactivateArchiver';
  statusBarItem.text = 'Reactivate Workspace Archiver';
  statusBarItem.hide(); // Initially hide the status bar item
  context.subscriptions.push(statusBarItem);

  context.subscriptions.push(
    vscode.commands.registerCommand('extension.reactivateArchiver', () => {
      shouldGenerateArchiver = true;
      statusBarItem.hide();
      promptUserForWorkspaceArchiver();
    })
  );

  const isFirstRun = context.globalState.get<boolean>('isFirstRun', true);
  if (isFirstRun) {
    checkProject();
    context.globalState.update('isFirstRun', false);
  }
}

function checkProject(document?: vscode.TextDocument) {
  if (vscode.workspace.workspaceFolders) {
    const projectDir = vscode.workspace.workspaceFolders[0].uri.fsPath;
    if (!shouldGenerateArchiver) {
      promptUserForWorkspaceArchiver();
    }
  }
}

function promptUserForWorkspaceArchiver() {
  vscode.window.showInformationMessage(
    'Would you like to run Workspace Archiver for this project?',
    'Yes',
    'No'
  ).then(selection => {
    if (selection === 'Yes') {
      shouldGenerateArchiver = true;
      ensureIgnoreFileExists();
      openIgnoreFile();
      vscode.window.showInformationMessage('Please enter files you would like to ignore.');
    } else if (selection === 'No') {
      shouldGenerateArchiver = false;
      statusBarItem.show(); // Show the status bar item if user selects "No"
    }
  });
}

function onSave(document: vscode.TextDocument) {
  if (shouldGenerateArchiver) {
    const projectDir = vscode.workspace.workspaceFolders?.[0].uri.fsPath || '';
    if (document.fileName.endsWith('ignore_files.txt')) {
      generateCodeContext(projectDir);
      if (!archiverGenerated) {
        vscode.window.showInformationMessage('Workspace Archiver Generated Successfully!');
        archiverGenerated = true;
      } else {
        vscode.window.showInformationMessage('Workspace Archiver Updated.');
      }
    } else {
      generateCodeContext(projectDir);
      vscode.window.showInformationMessage('Workspace Archiver Updated.');
    }
  }
}

function ensureIgnoreFileExists() {
  const projectDir = vscode.workspace.workspaceFolders?.[0].uri.fsPath || '';
  const ignoreFilePath = path.join(projectDir, 'ignore_files.txt');
  if (!fs.existsSync(ignoreFilePath)) {
    const defaultContent = [
      '# To ignore files with specific extensions, add them like this: *.log',
      '# Please make sure to ignore binary or unsupported text encoding files',
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
      '\n'
    ].join('\n');
    fs.writeFileSync(ignoreFilePath, defaultContent);
  }
}

function openIgnoreFile() {
  const projectDir = vscode.workspace.workspaceFolders?.[0].uri.fsPath || '';
  const ignoreFilePath = path.join(projectDir, 'ignore_files.txt');
  vscode.workspace.openTextDocument(ignoreFilePath).then(document => {
    vscode.window.showTextDocument(document);
  });
}

function generateCodeContext(projectDir: string) {
  const outputFile = path.join(projectDir, 'workspaceArchiver.txt');
  if (fs.existsSync(outputFile)) fs.unlinkSync(outputFile);

  const ig = loadIgnoreFiles(projectDir);
  ig.add('.*'); // Ignore all hidden files and folders

  readFiles(projectDir, outputFile, projectDir, ig);
}

function loadIgnoreFiles(projectDir: string) {
  const ignoreFilePath = path.join(projectDir, 'ignore_files.txt');
  const ig = ignore();

  if (fs.existsSync(ignoreFilePath)) {
    const ignoreContent = fs.readFileSync(ignoreFilePath).toString();
    ig.add(ignoreContent.split('\n').filter(line => line.trim() && !line.startsWith('#')));
  }

  return ig;
}

function readFiles(dir: string, outputFile: string, projectDir: string, ig: Ignore) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  entries.forEach(entry => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      readFiles(fullPath, outputFile, projectDir, ig);
    } else if (entry.isFile() && !fullPath.endsWith('ignore_files.txt')) {
      appendFileIfNotIgnored(fullPath, outputFile, projectDir, ig);
    }
  });
}

function appendFileIfNotIgnored(fullPath: string, outputFile: string, projectDir: string, ig: Ignore) {
  const relativePath = path.relative(projectDir, fullPath);
  if (!ig.ignores(relativePath)) {
    fs.appendFileSync(outputFile, `// File: ${relativePath}\n`);
    fs.appendFileSync(outputFile, fs.readFileSync(fullPath));
    fs.appendFileSync(outputFile, '\n');
  }
}

export function deactivate() {
  // Clean up the status bar item when the extension is deactivated
  if (statusBarItem) {
    statusBarItem.dispose();
  }
}
