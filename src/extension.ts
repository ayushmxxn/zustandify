import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";

export function activate(context: vscode.ExtensionContext) {
  const convertAllStatusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100
  );
  convertAllStatusBarItem.text = "$(zap) Convert States to Stores";
  convertAllStatusBarItem.tooltip = "Convert useState hooks to Zustand stores";
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

      const useStateRegex =
        /const\s+\[(\w+),\s*set(\w+)\]\s*=\s*useState\s*\(([^)]*)\)/g;
      const matches = [...text.matchAll(useStateRegex)];

      if (matches.length === 0) {
        vscode.window.showInformationMessage(
          "No useState hooks found in the current file"
        );
        return;
      }

      const workspaceEdit = new vscode.WorkspaceEdit();
      const convertResults = await Promise.all(
        matches.map(async (match) => {
          const stateName = match[1];
          const capitalizedStateName =
            stateName.charAt(0).toUpperCase() + stateName.slice(1);
          const initialValue = match[3] || "null";

          const workspaceFolders = vscode.workspace.workspaceFolders;
          if (!workspaceFolders) {
            vscode.window.showErrorMessage("No workspace folder found");
            return null;
          }

          const projectRoot = workspaceFolders[0].uri.fsPath;
          const storeFolderPath = await findOrCreateStoreFolder(projectRoot);

          if (!storeFolderPath) {
            vscode.window.showErrorMessage(
              "Could not find or create store folder"
            );
            return null;
          }

          const isTypeScript = document.languageId.includes("typescript");
          const fileExtension = isTypeScript ? ".ts" : ".js";

          const storeFileName = `use${capitalizedStateName}Store${fileExtension}`;
          const storeFilePath = path.join(storeFolderPath, storeFileName);

          const storeContent = isTypeScript
            ? generateTypeScriptStoreContent(
                stateName,
                capitalizedStateName,
                initialValue
              )
            : generateJavaScriptStoreContent(
                stateName,
                capitalizedStateName,
                initialValue
              );

          fs.writeFileSync(storeFilePath, storeContent);

          return {
            stateName,
            capitalizedStateName,
            storeFileName,
            fileExtension,
            initialValue,
          };
        })
      );

      let editedDocumentText = text;

      // Add 'use client' at the top if not already present
      if (!editedDocumentText.includes("'use client'")) {
        editedDocumentText = `'use client';\n\n${editedDocumentText}`;
      }

      // Remove useState import
      editedDocumentText = removeUseStateImport(editedDocumentText);

      // Remove empty React import
      editedDocumentText = removeEmptyReactImport(editedDocumentText);

      // Add Zustand store imports
      convertResults.forEach((result) => {
        if (result) {
          const importStatement = `import ${
            result.stateName
          }Store from './store/${result.storeFileName.replace(
            result.fileExtension,
            ""
          )}';`;
          editedDocumentText = addImportStatement(
            editedDocumentText,
            importStatement
          );
        }
      });

      // Replace useState hooks with Zustand store usage
      convertResults.forEach((result) => {
        if (result) {
          const useStateRegex = new RegExp(
            `const\\s+\\[${result.stateName},\\s*set${result.capitalizedStateName}\\]\\s*=\\s*useState\\s*\\([^)]*\\)`
          );
          editedDocumentText = editedDocumentText.replace(
            useStateRegex,
            `const { ${result.stateName}, set${result.capitalizedStateName} } = ${result.stateName}Store()`
          );
        }
      });

      // Remove empty lines
      editedDocumentText = editedDocumentText.replace(/^\s*\n/gm, "").trim();

      const fullDocumentRange = new vscode.Range(
        new vscode.Position(0, 0),
        document.lineAt(document.lineCount - 1).range.end
      );
      workspaceEdit.replace(
        document.uri,
        fullDocumentRange,
        editedDocumentText
      );

      await vscode.workspace.applyEdit(workspaceEdit);

      vscode.window.showInformationMessage(
        `Converted ${matches.length} useState hook(s) to Zustand store`
      );
    }
  );

  context.subscriptions.push(convertAllCommand, convertAllStatusBarItem);
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
  capitalizedStateName: string,
  initialValue: string
): string {
  return `import { create } from "zustand";

// Types
interface ${capitalizedStateName}StoreState {
    ${stateName}: ${determineTypeFromInitialValue(initialValue)};
    set${capitalizedStateName}: (new${capitalizedStateName}: ${determineTypeFromInitialValue(
    initialValue
  )}) => void;
}

const use${capitalizedStateName}Store = create<${capitalizedStateName}StoreState>((set) => ({
    ${stateName}: ${initialValue}, // Initial Value
    set${capitalizedStateName}: (new${capitalizedStateName}) => set({ ${stateName}: new${capitalizedStateName} }), // Updater
}));

export default use${capitalizedStateName}Store;`;
}

function generateJavaScriptStoreContent(
  stateName: string,
  capitalizedStateName: string,
  initialValue: string
): string {
  return `import { create } from "zustand";

const use${capitalizedStateName}Store = create((set) => ({
    ${stateName}: ${initialValue}, // Initial Value
    set${capitalizedStateName}: (new${capitalizedStateName}) => set({ ${stateName}: new${capitalizedStateName} }), // Updater
}));

export default use${capitalizedStateName}Store;`;
}

function determineTypeFromInitialValue(initialValue: string): string {
  if (initialValue === "null") {
    return "any";
  }
  if (initialValue === "true" || initialValue === "false") {
    return "boolean";
  }
  if (!isNaN(Number(initialValue))) {
    return "number";
  }
  if (initialValue.startsWith("'") || initialValue.startsWith('"')) {
    return "string";
  }
  return "any";
}

export function deactivate() {}
