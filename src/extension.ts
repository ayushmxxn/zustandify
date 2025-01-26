import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";

export function activate(context: vscode.ExtensionContext) {
  const convertAllStatusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100
  );
  convertAllStatusBarItem.text = "$(zap) Convert States to Stores";
  convertAllStatusBarItem.tooltip = "Convert State hooks to Zustand stores";
  convertAllStatusBarItem.command = "zustandConverter.convertAll";
  convertAllStatusBarItem.show();

  const convertAllCommand = vscode.commands.registerCommand(
    "zustandConverter.convertAll",
    async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showInformationMessage("No active text editor");
        return;
      }

      const document = editor.document;
      const text = document.getText();

      const useStateRegex = /const\s+\[(\w+),\s*set(\w+)\]\s*=\s*useState/g;
      const matches = [...text.matchAll(useStateRegex)];

      if (matches.length === 0) {
        vscode.window.showInformationMessage(
          "No useState hooks found in the current file"
        );
        return;
      }

      const workspaceEdit = new vscode.WorkspaceEdit();
      const convertPromises = matches.map(async (match) => {
        const stateName = match[1];
        const capitalizedStateName =
          stateName.charAt(0).toUpperCase() + stateName.slice(1);

        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
          vscode.window.showErrorMessage("No workspace folder found");
          return;
        }

        const projectRoot = workspaceFolders[0].uri.fsPath;
        const storeFolderPath = await findOrCreateStoreFolder(projectRoot);

        if (!storeFolderPath) {
          vscode.window.showErrorMessage(
            "Could not find or create store folder"
          );
          return;
        }

        const isTypeScript = document.languageId.includes("typescript");
        const fileExtension = isTypeScript ? ".ts" : ".js";

        const storeFileName = `use${capitalizedStateName}Store${fileExtension}`;
        const storeFilePath = path.join(storeFolderPath, storeFileName);

        const storeContent = isTypeScript
          ? generateTypeScriptStoreContent(stateName, capitalizedStateName)
          : generateJavaScriptStoreContent(stateName, capitalizedStateName);

        fs.writeFileSync(storeFilePath, storeContent);

        const editedDocumentText = modifyDocumentContent(
          text,
          stateName,
          capitalizedStateName,
          storeFileName,
          fileExtension
        );

        const fullDocumentRange = new vscode.Range(
          new vscode.Position(0, 0),
          document.lineAt(document.lineCount - 1).range.end
        );
        workspaceEdit.replace(
          document.uri,
          fullDocumentRange,
          editedDocumentText
        );
      });

      await Promise.all(convertPromises);
      await vscode.workspace.applyEdit(workspaceEdit);

      vscode.window.showInformationMessage(
        `Converted ${matches.length} useState hook(s) to Zustand store`
      );
    }
  );

  context.subscriptions.push(convertAllCommand, convertAllStatusBarItem);
}

function modifyDocumentContent(
  documentText: string,
  stateName: string,
  capitalizedStateName: string,
  storeFileName: string,
  fileExtension: string
): string {
  // Ensure only one 'use client' directive
  let modifiedText = documentText.replace(/^['"]use client['"];\s*\n?/gm, "");
  modifiedText = `'use client';\n\n${modifiedText}`;

  // Remove useState import
  modifiedText = removeUseStateImport(modifiedText);

  // Remove empty React import
  modifiedText = removeEmptyReactImport(modifiedText);

  // Add Zustand store import
  const importStatement = `import ${stateName}Store from './store/${storeFileName.replace(
    fileExtension,
    ""
  )}';`;
  modifiedText = addImportStatement(modifiedText, importStatement);

  // Replace useState hook with Zustand store usage
  const useStateRegex = new RegExp(
    `const\\s+\\[${stateName},\\s*set${capitalizedStateName}\\]\\s*=\\s*useState\\([^)]*\\)`
  );
  modifiedText = modifiedText.replace(
    useStateRegex,
    `const { ${stateName}, set${capitalizedStateName} } = ${stateName}Store()`
  );

  return modifiedText.replace(/^\s*\n/gm, "").trim();
}

function addImportStatement(documentText: string, newImport: string): string {
  const importRegex = /^import\s+.*\n?/gm;
  const imports = documentText.match(importRegex);

  if (imports && imports.length > 0) {
    const lastImportIndex =
      documentText.lastIndexOf(imports[imports.length - 1]) +
      imports[imports.length - 1].length;
    return (
      documentText.slice(0, lastImportIndex) +
      "\n" +
      newImport +
      documentText.slice(lastImportIndex)
    );
  }

  return `'use client';\n\n${newImport}\n\n` + documentText;
}

function removeUseStateImport(documentText: string): string {
  const useStateImportRegex =
    /import\s*(\w+,\s*)?{[^}]*useState[^}]*}\s*from\s*['"]react['"];?\n?/;
  return documentText.replace(useStateImportRegex, "");
}

function removeEmptyReactImport(documentText: string): string {
  const emptyReactImportRegex = /import\s*(\w+)?\s*from\s*['"]react['"];?\n?/;
  const reactImportMatch = documentText.match(emptyReactImportRegex);

  if (
    reactImportMatch &&
    (!reactImportMatch[1] || reactImportMatch[1].trim() === "")
  ) {
    return documentText.replace(emptyReactImportRegex, "");
  }

  return documentText;
}

async function findOrCreateStoreFolder(
  rootPath: string
): Promise<string | null> {
  const findSourceFolder = (currentPath: string): string | null => {
    if (
      fs.existsSync(path.join(currentPath, "src")) &&
      fs.statSync(path.join(currentPath, "src")).isDirectory()
    ) {
      const srcPath = path.join(currentPath, "src");
      const storePath = path.join(srcPath, "store");
      if (!fs.existsSync(storePath)) {
        fs.mkdirSync(storePath, { recursive: true });
      }
      return storePath;
    }

    if (
      fs.existsSync(path.join(currentPath, "app")) &&
      fs.statSync(path.join(currentPath, "app")).isDirectory()
    ) {
      const appPath = path.join(currentPath, "app");
      const storePath = path.join(appPath, "store");
      if (!fs.existsSync(storePath)) {
        fs.mkdirSync(storePath, { recursive: true });
      }
      return storePath;
    }

    const subdirs = fs
      .readdirSync(currentPath)
      .filter(
        (file) =>
          fs.statSync(path.join(currentPath, file)).isDirectory() &&
          !file.startsWith(".")
      );

    for (const subdir of subdirs) {
      const subdirPath = path.join(currentPath, subdir);
      const result = findSourceFolder(subdirPath);
      if (result) {
        return result;
      }
    }

    return null;
  };

  const storeFolder = findSourceFolder(rootPath);

  if (storeFolder) {
    return storeFolder;
  }

  const srcPath = path.join(rootPath, "src");
  const storePath = path.join(srcPath, "store");

  if (!fs.existsSync(srcPath)) {
    fs.mkdirSync(srcPath, { recursive: true });
  }

  if (!fs.existsSync(storePath)) {
    fs.mkdirSync(storePath, { recursive: true });
  }

  return storePath;
}

function generateTypeScriptStoreContent(
  stateName: string,
  capitalizedStateName: string
): string {
  return `import { create } from "zustand";

interface ${capitalizedStateName}StoreState {
    ${stateName}: any;
    set${capitalizedStateName}: (new${capitalizedStateName}: any) => void;
}

const use${capitalizedStateName}Store = create<${capitalizedStateName}StoreState>((set) => ({
    ${stateName}: null,
    set${capitalizedStateName}: (new${capitalizedStateName}) => set({ ${stateName}: new${capitalizedStateName} }),
}));

export default use${capitalizedStateName}Store;`;
}

function generateJavaScriptStoreContent(
  stateName: string,
  capitalizedStateName: string
): string {
  return `import { create } from "zustand";

const use${capitalizedStateName}Store = create((set) => ({
    ${stateName}: null,
    set${capitalizedStateName}: (new${capitalizedStateName}) => set({ ${stateName}: new${capitalizedStateName} }),
}));

export default use${capitalizedStateName}Store;`;
}

export function deactivate() {}
