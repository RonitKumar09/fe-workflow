import * as vscode from 'vscode';
import { ChecklistStorageService } from '../providers/checklistStorageService';
import { WorkflowChecklist } from '../models/workflowChecklist';

export class ChecklistEditorProvider implements vscode.CustomTextEditorProvider {
  public static readonly viewType = 'jira-checklist.editor';
  private readonly checklistStorageService: ChecklistStorageService;

  constructor(
    private readonly context: vscode.ExtensionContext
  ) {
    this.checklistStorageService = ChecklistStorageService.getInstance(context);
  }

  public static register(context: vscode.ExtensionContext): vscode.Disposable {
    const provider = new ChecklistEditorProvider(context);
    const providerRegistration = vscode.window.registerCustomEditorProvider(
      ChecklistEditorProvider.viewType,
      provider,
      {
        webviewOptions: {
          retainContextWhenHidden: true
        },
        supportsMultipleEditorsPerDocument: false
      }
    );
    return providerRegistration;
  }

  public async resolveCustomTextEditor(
    document: vscode.TextDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken
  ): Promise<void> {
    // Set the webview's initial html content
    webviewPanel.webview.options = {
      enableScripts: true,
    };

    // Parse the document content (should be JSON)
    const checklist: WorkflowChecklist = JSON.parse(document.getText());
    
    // Set up the webview content
    webviewPanel.webview.html = this.getHtmlForWebview(webviewPanel.webview, checklist);

    // Handle messages from the webview
    webviewPanel.webview.onDidReceiveMessage(async (message) => {
      switch (message.command) {
        case 'toggleCheckbox':
          await this.toggleCheckbox(message.sectionId, message.itemId, checklist);
          await this.saveChecklist(checklist);
          break;
        case 'exportChecklist':
          await this.exportChecklist(checklist, message.format);
          break;
        case 'toggleSection':
          this.toggleSection(message.sectionId, checklist, message.expanded);
          await this.saveChecklist(checklist);
          break;
        case 'updateProgress':
          webviewPanel.webview.postMessage({
            command: 'updateProgress',
            progress: this.calculateProgress(checklist)
          });
          break;
      }
    });

    // Update the webview when the document changes
    const changeDocumentSubscription = vscode.workspace.onDidChangeTextDocument(event => {
      if (event.document.uri.toString() === document.uri.toString()) {
        try {
          const updatedChecklist: WorkflowChecklist = JSON.parse(event.document.getText());
          webviewPanel.webview.html = this.getHtmlForWebview(webviewPanel.webview, updatedChecklist);
        } catch (error) {
          console.error('Error updating webview:', error);
        }
      }
    });

    // Clean up when the editor is closed
    webviewPanel.onDidDispose(() => {
      changeDocumentSubscription.dispose();
    });
  }

  private async toggleCheckbox(sectionId: string, itemId: string, checklist: WorkflowChecklist): Promise<void> {
    const section = checklist.sections.find(section => section.id === sectionId);
    if (section) {
      const item = section.items.find(item => item.id === itemId);
      if (item) {
        item.isChecked = !item.isChecked;
      }
    }
  }

  private toggleSection(sectionId: string, checklist: WorkflowChecklist, expanded: boolean): void {
    const section = checklist.sections.find(section => section.id === sectionId);
    if (section) {
      if (!section.metadata) {
        section.metadata = {};
      }
      section.metadata.expanded = expanded;
    }
  }

  private calculateProgress(checklist: WorkflowChecklist): { completed: number, total: number, percentage: number } {
    let completed = 0;
    let total = 0;
    
    checklist.sections.forEach(section => {
      section.items.forEach(item => {
        total++;
        if (item.isChecked) {
          completed++;
        }
      });
    });
    
    const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;
    
    return {
      completed,
      total,
      percentage
    };
  }

  private async saveChecklist(checklist: WorkflowChecklist): Promise<void> {
    await this.checklistStorageService.saveChecklist(checklist);
  }

  private async exportChecklist(checklist: WorkflowChecklist, format: 'html' | 'json'): Promise<void> {
    try {
      const filePath = await this.checklistStorageService.exportChecklist(checklist, format);
      const openFile = 'Open File';
      const result = await vscode.window.showInformationMessage(
        `Checklist exported as ${format.toUpperCase()} successfully!`,
        openFile
      );

      if (result === openFile) {
        const uri = vscode.Uri.file(filePath);
        if (format === 'html') {
          await vscode.env.openExternal(uri);
        } else {
          await vscode.window.showTextDocument(uri);
        }
      }
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to export checklist: ${error}`);
    }
  }

  private getHtmlForWebview(webview: vscode.Webview, checklist: WorkflowChecklist): string {
    const nonce = this.getNonce();
    const progress = this.calculateProgress(checklist);
    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline';">
        <title>FE Developer Workflow Checklist</title>
        <style>
          :root {
            --section-bg: var(--vscode-editor-background);
            --section-border: var(--vscode-panel-border);
            --section-hover: var(--vscode-list-hoverBackground);
            --progress-bar-bg: var(--vscode-progressBar-background);
            --progress-bar-empty: var(--vscode-editorWidget-border);
            --checkbox-color: var(--vscode-checkbox-selectBackground, #0066B8);
            --checkbox-checkmark: var(--vscode-checkbox-foreground, #FFFFFF);
            --checkbox-border: var(--vscode-checkbox-border, #CCCCCC);
            --heading-font-size: 1.5em;
            --subheading-font-size: 1.3em;
            --normal-font-size: 0.95em;
            --small-font-size: 0.85em;
          }

          body {
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            color: var(--vscode-editor-foreground);
            padding: 0;
            margin: 0;
          }

          h1, h2, h3, h4 {
            margin-top: 0;
            margin-bottom: 8px;
            font-weight: 600;
          }

          h1 { font-size: var(--heading-font-size); }
          h2 { font-size: var(--subheading-font-size); }
          h3 { font-size: 1.1em; }
          h4 { font-size: 1em; }

          .container {
            max-width: 1000px;
            margin: 0 auto;
            padding: 20px;
          }

          .header {
            position: sticky;
            top: 0;
            background-color: var(--vscode-editor-background);
            padding: 15px 20px;
            box-shadow: 0 2px 5px rgba(0, 0, 0, 0.2);
            z-index: 10;
            display: flex;
            flex-direction: column;
            gap: 10px;
          }

          .task-info {
            display: flex;
            justify-content: space-between;
            align-items: center;
          }

          .task-details {
            flex: 1;
          }

          .export-controls {
            display: flex;
            gap: 10px;
          }

          .task-key {
            font-size: var(--heading-font-size);
            font-weight: bold;
            color: var(--vscode-textLink-foreground);
            margin-bottom: 5px;
          }

          .task-summary {
            font-weight: bold;
            margin-bottom: 10px;
            font-size: var(--subheading-font-size);
          }

          .task-metadata {
            font-size: var(--normal-font-size);
            color: var(--vscode-descriptionForeground);
          }

          .progress-container {
            width: 100%;
            margin: 15px 0;
          }

          .progress-bar-outer {
            width: 100%;
            height: 6px;
            background-color: var(--progress-bar-empty);
            border-radius: 3px;
            overflow: hidden;
          }

          .progress-bar-inner {
            height: 100%;
            background-color: var(--progress-bar-bg);
            border-radius: 3px;
            transition: width 0.3s ease;
          }

          .progress-text {
            display: flex;
            justify-content: space-between;
            font-size: var(--small-font-size);
            margin-top: 6px;
            color: var(--vscode-descriptionForeground);
          }

          .main-content {
            padding: 20px;
          }

          .sections-container {
            display: flex;
            flex-direction: column;
            gap: 15px;
          }

          .section {
            background-color: var(--section-bg);
            border: 1px solid var(--section-border);
            border-radius: 4px;
            overflow: hidden;
          }

          .section-header {
            padding: 10px 15px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            cursor: pointer;
            background-color: var(--vscode-sideBar-background);
            transition: background-color 0.2s;
          }

          .section-header:hover {
            background-color: var(--section-hover);
          }

          .section-title {
            font-size: 1.1em;
            font-weight: bold;
            color: var(--vscode-editor-foreground);
            display: flex;
            align-items: center;
            gap: 8px;
          }

          .section-progress {
            font-size: var(--small-font-size);
            color: var(--vscode-descriptionForeground);
          }

          .section-content {
            padding: 0;
            max-height: 0;
            overflow: hidden;
            transition: all 0.3s ease;
          }

          .section-content.expanded {
            padding: 15px;
            max-height: 2000px; /* Arbitrary large value */
          }

          .checklist-item {
            margin-bottom: 12px;
            padding-bottom: 12px;
            border-bottom: 1px solid var(--vscode-panel-border);
          }

          .checklist-item:last-child {
            margin-bottom: 0;
            padding-bottom: 0;
            border-bottom: none;
          }

          .checklist-item-header {
            display: flex;
            align-items: flex-start;
            gap: 10px;
          }

          .checkbox-container {
            margin-top: 3px;
            position: relative;
          }

          /* Improved checkbox styling for better visibility and functionality */
          .checkbox {
            appearance: none;
            -webkit-appearance: none;
            -moz-appearance: none;
            width: 16px;
            height: 16px;
            border: 1px solid var(--checkbox-border);
            border-radius: 3px;
            outline: none;
            cursor: pointer;
            position: relative;
            background-color: var(--vscode-input-background);
            transition: all 0.2s;
          }
          
          .checkbox:checked {
            background-color: var(--checkbox-color);
            border-color: var(--checkbox-color);
          }
          
          .checkbox:checked::after {
            content: '';
            position: absolute;
            left: 5px;
            top: 1px;
            width: 4px;
            height: 8px;
            border: solid var(--checkbox-checkmark);
            border-width: 0 2px 2px 0;
            transform: rotate(45deg);
          }
          
          .checkbox:hover {
            border-color: var(--checkbox-color);
          }

          .checklist-item-content {
            flex: 1;
          }

          .checklist-item-title {
            margin: 0;
            padding: 0;
            font-size: var(--normal-font-size);
          }

          .checked .checklist-item-title {
            text-decoration: line-through;
            color: var(--vscode-disabledForeground);
          }

          .checklist-item-description {
            font-size: var(--small-font-size);
            color: var(--vscode-descriptionForeground);
            margin-top: 5px;
            padding-left: 26px; /* align with title when checkbox is present */
          }

          .button {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 6px 12px;
            border-radius: 4px;
            cursor: pointer;
            font-size: var(--small-font-size);
            display: flex;
            align-items: center;
            gap: 6px;
            transition: background-color 0.2s;
          }

          .button:hover {
            background-color: var(--vscode-button-hoverBackground);
          }

          .button svg {
            width: 14px;
            height: 14px;
          }

          .timestamp {
            font-size: var(--small-font-size);
            color: var (--vscode-descriptionForeground);
            margin-top: 30px;
            border-top: 1px solid var(--vscode-editorWidget-border);
            padding-top: 10px;
            text-align: center;
          }

          /* Smaller SVG chevron */
          .chevron {
            width: 10px;
            height: 10px;
            transition: transform 0.3s ease;
            flex-shrink: 0;
          }

          .chevron.down {
            transform: rotate(90deg);
          }

          /* Icons for buttons */
          .icon {
            display: inline-block;
            width: 12px;
            height: 12px;
            vertical-align: middle;
          }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="task-info">
            <div class="task-details">
              <div class="task-key">${checklist.jiraTaskKey}</div>
              <div class="task-summary">${checklist.jiraTaskSummary}</div>
              <div class="task-metadata">
                Last updated: ${new Date(checklist.lastUpdated).toLocaleString()}
              </div>
            </div>
            <div class="export-controls">
              <button class="button" id="export-html">
                <svg class="icon" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M13.854 3.646a.5.5 0 0 1 0 .708l-7 7a.5.5 0 0 1-.708 0l-3.5-3.5a.5.5 0 1 1 .708-.708L6.5 10.293l6.646-6.647a.5.5 0 0 1 .708 0z"/>
                </svg>
                Export HTML
              </button>
              <button class="button" id="export-json">
                <svg class="icon" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M9.5 1a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5h-3a.5.5 0 0 1-.5-.5v-1a.5.5 0 0 1 .5-.5h3zm-3 4a.5.5 0 0 0-.5.5v1a.5.5 0 0 0 .5.5h3a.5.5 0 0 0 .5-.5v-1a.5.5 0 0 0-.5-.5h-3zm4.5.5a.5.5 0 0 1 .5-.5h3a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5h-3a.5.5 0 0 1-.5-.5v-1zm.5 2.5a.5.5 0 0 0-.5.5v1a.5.5 0 0 0 .5.5h3a.5.5 0 0 0 .5-.5v-1a.5.5 0 0 0-.5-.5h-3z"/>
                </svg>
                Export JSON
              </button>
            </div>
          </div>
          <div class="progress-container">
            <div class="progress-bar-outer">
              <div class="progress-bar-inner" style="width: ${progress.percentage}%"></div>
            </div>
            <div class="progress-text">
              <span>${progress.completed} of ${progress.total} items completed</span>
              <span>${progress.percentage}%</span>
            </div>
          </div>
        </div>

        <div class="main-content">
          <div class="sections-container">
            ${this.generateSectionsHtml(checklist)}
          </div>
        </div>

        <div class="timestamp">
          FE Developer Workflow Checklist for JIRA Task ${checklist.jiraTaskKey}
        </div>

        <script nonce="${nonce}">
          const vscode = acquireVsCodeApi();

          // Handle checkbox changes
          document.addEventListener('change', function(e) {
            if (e.target.classList.contains('checkbox')) {
              const sectionId = e.target.getAttribute('data-section-id');
              const itemId = e.target.getAttribute('data-item-id');
              
              // Toggle checked class for styling
              const contentElement = e.target.closest('.checklist-item-header').querySelector('.checklist-item-content');
              if (e.target.checked) {
                contentElement.classList.add('checked');
              } else {
                contentElement.classList.remove('checked');
              }
              
              // Send message to extension
              vscode.postMessage({
                command: 'toggleCheckbox',
                sectionId: sectionId,
                itemId: itemId
              });

              // Request progress update
              vscode.postMessage({
                command: 'updateProgress'
              });
            }
          });

          // Collapsible sections
          document.querySelectorAll('.section-header').forEach(header => {
            header.addEventListener('click', () => {
              const sectionId = header.getAttribute('data-section-id');
              const content = document.querySelector('.section-content[data-section-id="' + sectionId + '"]');
              const chevron = header.querySelector('.chevron');
              
              const isExpanded = content.classList.toggle('expanded');
              chevron.classList.toggle('down', isExpanded);
              
              // Send message to extension about section expansion state
              vscode.postMessage({
                command: 'toggleSection',
                sectionId: sectionId,
                expanded: isExpanded
              });
            });
          });

          // Export buttons
          document.getElementById('export-html').addEventListener('click', () => {
            vscode.postMessage({
              command: 'exportChecklist',
              format: 'html'
            });
          });

          document.getElementById('export-json').addEventListener('click', () => {
            vscode.postMessage({
              command: 'exportChecklist',
              format: 'json'
            });
          });

          // Handle messages from extension
          window.addEventListener('message', event => {
            const message = event.data;
            switch (message.command) {
              case 'updateProgress':
                updateProgressBar(message.progress);
                break;
            }
          });

          function updateProgressBar(progress) {
            const progressBar = document.querySelector('.progress-bar-inner');
            const progressText = document.querySelector('.progress-text');
            
            progressBar.style.width = progress.percentage + '%';
            progressText.innerHTML = 
              '<span>' + progress.completed + ' of ' + progress.total + ' items completed</span>' +
              '<span>' + progress.percentage + '%</span>';
          }

          // Initial progress update request
          vscode.postMessage({
            command: 'updateProgress'
          });
        </script>
      </body>
      </html>
    `;
  }

  private generateSectionsHtml(checklist: WorkflowChecklist): string {
    return checklist.sections.map(section => {
      const sectionItems = section.items || [];
      const sectionItemsCount = sectionItems.length;
      const completedItems = sectionItems.filter(item => item.isChecked).length;
      const sectionPercentage = sectionItemsCount > 0 
        ? Math.round((completedItems / sectionItemsCount) * 100) 
        : 0;
      const isExpanded = section.metadata?.expanded !== false; // Default to expanded if not specified
      
      return `
        <div class="section" data-section-id="${section.id}">
          <div class="section-header" data-section-id="${section.id}">
            <div class="section-title">
              <svg class="chevron ${isExpanded ? 'down' : ''}" viewBox="0 0 16 16" fill="none" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M6 4l4 4-4 4" />
              </svg>
              ${section.title}
            </div>
            <div class="section-progress">
              ${completedItems}/${sectionItemsCount} (${sectionPercentage}%)
            </div>
          </div>
          <div class="section-content ${isExpanded ? 'expanded' : ''}" data-section-id="${section.id}">
            ${this.generateItemsHtml(section)}
          </div>
        </div>
      `;
    }).join('');
  }

  private generateItemsHtml(section: any): string {
    return section.items.map((item: any) => `
      <div class="checklist-item" data-item-id="${item.id}">
        <div class="checklist-item-header">
          <div class="checkbox-container">
            <input type="checkbox" class="checkbox" 
                ${item.isChecked ? 'checked' : ''}
                data-section-id="${section.id}" 
                data-item-id="${item.id}">
          </div>
          <div class="checklist-item-content ${item.isChecked ? 'checked' : ''}">
            <p class="checklist-item-title">${item.title}</p>
          </div>
        </div>
        ${item.description ? `<p class="checklist-item-description">${item.description}</p>` : ''}
      </div>
    `).join('');
  }

  private getNonce(): string {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
      text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
  }
}