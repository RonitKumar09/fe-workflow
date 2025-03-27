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
          await this.toggleCheckbox(message.sectionId, message.itemId, message.status, checklist);
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
        case 'updateNotes':
          await this.updateNotes(message.sectionId, message.itemId, message.notes, checklist);
          await this.saveChecklist(checklist);
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

  private async toggleCheckbox(sectionId: string, itemId: string, status: 'not-started' | 'in-progress' | 'completed', checklist: WorkflowChecklist): Promise<void> {
    const section = checklist.sections.find(section => section.id === sectionId);
    if (section) {
      const item = section.items.find(item => item.id === itemId);
      if (item) {
        item.status = status;
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

  private calculateProgress(checklist: WorkflowChecklist): { completed: number, total: number, percentage: number, inProgress: number } {
    let completed = 0;
    let inProgress = 0;
    let total = 0;
    
    checklist.sections.forEach(section => {
      section.items.forEach(item => {
        total++;
        if (item.status === 'completed') {
          completed++;
        } else if (item.status === 'in-progress') {
          inProgress++;
        }
      });
    });
    
    const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;
    
    return {
      completed,
      inProgress,
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
            --inprogress-color: var(--vscode-statusBarItem-warningBackground, #D9822B);
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
          
          .progress-bar-inprogress {
            height: 100%;
            background-color: var(--inprogress-color);
            border-radius: 3px;
            transition: width 0.3s ease;
            position: absolute;
            top: 0;
            left: 0;
            z-index: 1;
          }

          .progress-text {
            display: flex;
            justify-content: space-between;
            font-size: var(--small-font-size);
            margin-top: 6px;
            color: var(--vscode-descriptionForeground);
          }
          
          .progress-detail {
            display: flex;
            gap: 10px;
            font-size: var(--small-font-size);
            margin-top: 4px;
          }
          
          .progress-legend {
            display: flex;
            align-items: center;
            gap: 4px;
          }
          
          .legend-color {
            width: 10px;
            height: 10px;
            border-radius: 2px;
          }
          
          .legend-completed {
            background-color: var(--progress-bar-bg);
          }
          
          .legend-inprogress {
            background-color: var(--inprogress-color);
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
            max-height: 5000px; /* Increased to accommodate notes */
          }

          .checklist-item {
            margin-bottom: 16px;
            padding-bottom: 16px;
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

          .status-controls {
            display: flex;
            flex-direction: column;
            gap: 4px;
            min-width: 24px;
            margin-top: 3px;
          }

          .status-button {
            width: 24px;
            height: 24px;
            border: 1px solid var(--checkbox-border);
            border-radius: 4px;
            background-color: var(--vscode-button-secondaryBackground);
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.2s ease;
            position: relative;
          }
          
          .status-button:hover {
            background-color: var(--vscode-button-secondaryHoverBackground);
          }
          
          .status-button.active {
            border-color: var(--checkbox-color);
          }
          
          .status-not-started.active {
            background-color: var(--vscode-editor-background);
            border-color: var(--checkbox-color);
            border-width: 2px;
          }
          
          .status-in-progress.active {
            background-color: var(--inprogress-color);
            border-color: var(--inprogress-color);
          }
          
          .status-in-progress.active::after {
            content: '';
            display: block;
            width: 10px;
            height: 10px;
            border: 2px solid white;
            border-radius: 50%;
            border-bottom-color: transparent;
            animation: spin 1s linear infinite;
          }
          
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
          
          .status-completed.active {
            background-color: var(--checkbox-color);
            border-color: var (--checkbox-color);
          }
          
          .status-completed.active::after {
            content: '';
            display: block;
            width: 6px;
            height: 12px;
            border: solid white;
            border-width: 0 2px 2px 0;
            transform: rotate(45deg);
          }

          .checklist-item-content {
            flex: 1;
          }

          .checklist-item-title {
            margin: 0;
            padding: 0;
            font-size: var(--normal-font-size);
            transition: all 0.2s;
          }

          .completed .checklist-item-title {
            text-decoration: line-through;
            color: var(--vscode-disabledForeground);
            opacity: 0.8;
          }
          
          .in-progress .checklist-item-title {
            font-weight: bold;
            color: var (--inprogress-color);
          }

          .checklist-item-description {
            font-size: var(--small-font-size);
            color: var(--vscode-descriptionForeground);
            margin-top: 5px;
            margin-bottom: 8px;
          }
          
          .notes-container {
            margin-top: 10px;
            margin-bottom: 5px;
            padding-left: 34px; /* Align with title */
          }
          
          .notes-label {
            font-size: var(--small-font-size);
            color: var(--vscode-descriptionForeground);
            margin-bottom: 4px;
            font-weight: 500;
          }
          
          .notes-textarea {
            width: 100%;
            min-height: 60px;
            padding: 8px;
            border: 1px solid var(--vscode-input-border);
            border-radius: 4px;
            background-color: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            font-family: var(--vscode-font-family);
            font-size: var(--small-font-size);
            resize: vertical;
          }
          
          .notes-textarea:focus {
            outline: none;
            border-color: var(--vscode-focusBorder);
          }
          
          .notes-text {
            font-size: var(--small-font-size);
            color: var(--vscode-input-foreground);
            padding: 8px;
            background-color: var(--vscode-input-background);
            border-radius: 4px;
            border-left: 3px solid var(--vscode-focusBorder);
            white-space: pre-wrap;
          }
          
          .notes-text.empty {
            font-style: italic;
            color: var(--vscode-disabledForeground);
          }
          
          .edit-notes {
            cursor: pointer;
            margin-left: 4px;
            color: var(--vscode-textLink-foreground);
            font-size: var(--small-font-size);
          }

          .button {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 6px 12px;
            border-radius: 4px;
            cursor: pointer;
            font-size: var (--small-font-size);
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
            color: var(--vscode-descriptionForeground);
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
            <div class="progress-bar-outer" style="position: relative">
              <div class="progress-bar-inprogress" style="width: ${(progress.inProgress / progress.total) * 100}%"></div>
              <div class="progress-bar-inner" style="width: ${progress.percentage}%"></div>
            </div>
            <div class="progress-text">
              <span>${progress.completed} of ${progress.total} items completed (${progress.percentage}%)</span>
              <span>${progress.inProgress} in progress</span>
            </div>
            <div class="progress-detail">
              <div class="progress-legend">
                <div class="legend-color legend-completed"></div>
                <span>Completed</span>
              </div>
              <div class="progress-legend">
                <div class="legend-color legend-inprogress"></div>
                <span>In Progress</span>
              </div>
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
          
          // Track which notes are being edited
          const editingNotes = new Set();
          
          // Handle status button clicks
          document.addEventListener('click', function(e) {
            if (e.target.classList.contains('status-button') || e.target.closest('.status-button')) {
              const button = e.target.classList.contains('status-button') ? e.target : e.target.closest('.status-button');
              const statusType = button.getAttribute('data-status');
              const sectionId = button.getAttribute('data-section-id');
              const itemId = button.getAttribute('data-item-id');
              const itemElement = button.closest('.checklist-item');
              const contentElement = itemElement.querySelector('.checklist-item-content');
              
              // Update UI
              itemElement.querySelectorAll('.status-button').forEach(btn => {
                btn.classList.remove('active');
              });
              button.classList.add('active');
              
              // Update content class for styling
              contentElement.classList.remove('not-started', 'in-progress', 'completed');
              contentElement.classList.add(statusType);
              
              // Send message to extension
              vscode.postMessage({
                command: 'toggleCheckbox',
                sectionId: sectionId,
                itemId: itemId,
                status: statusType
              });
              
              // Request progress update
              vscode.postMessage({
                command: 'updateProgress'
              });
            }
          });
          
          // Handle edit notes clicks
          document.addEventListener('click', function(e) {
            if (e.target.classList.contains('edit-notes')) {
              const notesContainer = e.target.closest('.notes-container');
              const notesText = notesContainer.querySelector('.notes-text');
              const itemId = notesContainer.getAttribute('data-item-id');
              const sectionId = notesContainer.getAttribute('data-section-id');
              
              if (!editingNotes.has(itemId)) {
                // Switch to edit mode
                const currentNotes = notesText.getAttribute('data-notes') || '';
                
                // Create textarea
                const textarea = document.createElement('textarea');
                textarea.className = 'notes-textarea';
                textarea.value = currentNotes;
                textarea.placeholder = 'Add your notes here...';
                textarea.setAttribute('data-item-id', itemId);
                textarea.setAttribute('data-section-id', sectionId);
                
                // Replace text with textarea
                notesText.style.display = 'none';
                notesContainer.insertBefore(textarea, notesText.nextSibling);
                
                // Change edit link
                e.target.textContent = 'Save';
                
                // Focus textarea
                textarea.focus();
                
                // Mark as editing
                editingNotes.add(itemId);
              } else {
                // Save the notes
                const textarea = notesContainer.querySelector('.notes-textarea');
                const notes = textarea.value.trim();
                
                // Update data attribute
                notesText.setAttribute('data-notes', notes);
                
                // Update display
                if (notes) {
                  notesText.textContent = notes;
                  notesText.classList.remove('empty');
                } else {
                  notesText.textContent = 'No notes added yet';
                  notesText.classList.add('empty');
                }
                
                // Show text again
                notesText.style.display = 'block';
                
                // Remove textarea
                textarea.remove();
                
                // Change edit link back
                e.target.textContent = 'Edit';
                
                // Save to extension
                vscode.postMessage({
                  command: 'updateNotes',
                  sectionId: sectionId,
                  itemId: itemId,
                  notes: notes
                });
                
                // Remove from editing set
                editingNotes.delete(itemId);
              }
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
            const inProgressBar = document.querySelector('.progress-bar-inprogress');
            const progressText = document.querySelector('.progress-text');
            
            progressBar.style.width = progress.percentage + '%';
            inProgressBar.style.width = ((progress.inProgress / progress.total) * 100) + '%';
            
            progressText.innerHTML = 
              '<span>' + progress.completed + ' of ' + progress.total + ' items completed (' + progress.percentage + '%)</span>' +
              '<span>' + progress.inProgress + ' in progress</span>';
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
      const completedItems = sectionItems.filter(item => item.status === 'completed').length;
      const inProgressItems = sectionItems.filter(item => item.status === 'in-progress').length;
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
              ${completedItems}/${sectionItemsCount} (${sectionPercentage}%) · ${inProgressItems} in progress
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
          <div class="status-controls">
            <div class="status-button status-not-started ${item.status === 'not-started' ? 'active' : ''}"
                data-section-id="${section.id}" 
                data-item-id="${item.id}"
                data-status="not-started"
                title="Not Started">
            </div>
            <div class="status-button status-in-progress ${item.status === 'in-progress' ? 'active' : ''}"
                data-section-id="${section.id}" 
                data-item-id="${item.id}"
                data-status="in-progress"
                title="In Progress">
            </div>
            <div class="status-button status-completed ${item.status === 'completed' ? 'active' : ''}"
                data-section-id="${section.id}" 
                data-item-id="${item.id}"
                data-status="completed"
                title="Completed">
            </div>
          </div>
          <div class="checklist-item-content ${item.status}">
            <p class="checklist-item-title">${item.title}</p>
            ${item.description ? `<p class="checklist-item-description">${item.description}</p>` : ''}
            <div class="notes-container" data-section-id="${section.id}" data-item-id="${item.id}">
              <div class="notes-label">Notes <span class="edit-notes">Edit</span></div>
              <div class="notes-text ${!item.notes ? 'empty' : ''}" data-notes="${item.notes || ''}">
                ${item.notes || 'No notes added yet'}
              </div>
            </div>
          </div>
        </div>
      </div>
    `).join('');
  }
  
  private async updateNotes(sectionId: string, itemId: string, notes: string, checklist: WorkflowChecklist): Promise<void> {
    const section = checklist.sections.find(section => section.id === sectionId);
    if (section) {
      const item = section.items.find(item => item.id === itemId);
      if (item) {
        item.notes = notes;
      }
    }
  }

  private getNonce() {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
      text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
  }
}