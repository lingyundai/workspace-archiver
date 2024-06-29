import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import ignore, { Ignore } from 'ignore';

let shouldGenerateArchiver = false;
let archiverGenerated = false;
let statusBarItem: vscode.StatusBarItem;

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument(onSave),
    vscode.workspace.onDidChangeWorkspaceFolders(onDidChangeWorkspaceFolders)
  );

  // Create the status bar item once
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBarItem.command = 'extension.toggleArchiver';
  // statusBarItem.text = 'Activate Workspace Archiver';
  context.subscriptions.push(statusBarItem);
  statusBarItem.show(); // Show the status bar item initially

  context.subscriptions.push(
    vscode.commands.registerCommand('extension.toggleArchiver', () => {
      shouldGenerateArchiver = !shouldGenerateArchiver;
      // statusBarItem.text = shouldGenerateArchiver ? 'Deactivate Workspace Archiver' : 'Reactivate Workspace Archiver';
      if (shouldGenerateArchiver) {
        promptUserForWorkspaceArchiver();
      } else {
        vscode.window.showInformationMessage('Workspace Archiver deactivated.');
      }
    })
  );

  // Check if this is the first run for the current workspace
  checkAndPromptForWorkspace();
}

function onDidChangeWorkspaceFolders(event: vscode.WorkspaceFoldersChangeEvent) {
  if (event.added.length > 0) {
    checkAndPromptForWorkspace();
  }
}

function checkAndPromptForWorkspace() {
  const workspaceFolder = vscode.workspace.workspaceFolders ? vscode.workspace.workspaceFolders[0].uri.fsPath : '';
  const workspaceArchiverPath = path.join(workspaceFolder, 'workspaceArchiver.txt');
  const ignoreFilePath = path.join(workspaceFolder, 'ignore_files.txt');

  if (fs.existsSync(workspaceArchiverPath) && fs.existsSync(ignoreFilePath)) {
    vscode.window.showInformationMessage('Workspace Archiver is deactivated because ignore_files.txt and workspaceArchiver.txt are not present.');
    deactivateArchiver();
  } else {
    promptUserForWorkspaceArchiver();
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
      statusBarItem.text = 'Deactivate Workspace Archiver'; // Update the status bar item text
      ensureIgnoreFileExists();
    } else if (selection === 'No') {
      shouldGenerateArchiver = false;
      statusBarItem.text = 'Reactivate Workspace Archiver'; // Update the status bar item text
    }
    else {
      vscode.window.showInformationMessage('Workspace Archiver is deactivated.');
      deactivateArchiver();
    }
  });
}

function onSave(document: vscode.TextDocument) {
  if (shouldGenerateArchiver) {
    const projectDir = vscode.workspace.workspaceFolders?.[0].uri.fsPath || '';
    const ignoreFilePath = path.join(projectDir, 'ignore_files.txt');

    if (fs.existsSync(ignoreFilePath)) {
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
    } else {
      ensureIgnoreFileExists();
    }
  }
}

function ensureIgnoreFileExists() {
  const projectDir = vscode.workspace.workspaceFolders?.[0].uri.fsPath || '';
  const ignoreFilePath = path.join(projectDir, 'ignore_files.txt');
  if (!fs.existsSync(ignoreFilePath)) {
    vscode.window.showWarningMessage('ignore_files.txt does not exist. Do you want to create a default ignore_files.txt?', 'Yes', 'No')
      .then(selection => {
        if (selection === 'Yes') {
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
          openIgnoreFile();
        } else {
          vscode.window.showWarningMessage('Workspace Archiver cannot proceed without ignore_files.txt.');
          deactivateArchiver();
        }
      });
  } else {
    openIgnoreFile();
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
  const ignoreFilePath = path.join(projectDir, 'ignore_files.txt');
  if (!fs.existsSync(ignoreFilePath)) {
    vscode.window.showWarningMessage('ignore_files.txt does not exist. Please create it before generating the Workspace Archiver.');
    ensureIgnoreFileExists();
    return;
  }

  const outputFile = path.join(projectDir, 'workspaceArchiver.txt');

  // Check if the file exists before trying to delete it
  if (fs.existsSync(outputFile)) {
    try {
      fs.unlinkSync(outputFile);
    } catch (error) {
      vscode.window.showErrorMessage(`Error deleting existing workspaceArchiver.txt: ${error}`);
      return;
    }
  }

  const ig = loadIgnoreFiles(projectDir);
  ig.add('.*'); // Ignore all hidden files and folders

  readFiles(projectDir, outputFile, projectDir, ig);
}

function loadIgnoreFiles(projectDir: string): Ignore {
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
    try {
      fs.appendFileSync(outputFile, `// File: ${relativePath}\n`);
      fs.appendFileSync(outputFile, fs.readFileSync(fullPath));
      fs.appendFileSync(outputFile, '\n');
    } catch (error) {
      vscode.window.showErrorMessage(`Error appending to workspaceArchiver.txt: ${error}`);
    }
  }
}

function deactivateArchiver() {
  shouldGenerateArchiver = false;
  statusBarItem.text = 'Reactivate Workspace Archiver'; // Update the status bar item text
}

export function deactivate() {
  if (statusBarItem) {
    statusBarItem.dispose();
  }
}
