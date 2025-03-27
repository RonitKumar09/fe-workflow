import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { JiraService } from './providers/jiraService';
import { ChecklistStorageService } from './providers/checklistStorageService';
import { JiraTasksProvider } from './views/jiraTasksProvider';
import { ChecklistEditorProvider } from './views/checklistEditorProvider';
import { JiraTask } from './models/jiraTask';
import { defaultWorkflowChecklist } from './models/workflowChecklist';

// Custom URI scheme for the checklist editor
export class ChecklistDocument implements vscode.CustomDocument {
  uri: vscode.Uri;
  
  constructor(uri: vscode.Uri) {
    this.uri = uri;
  }

  dispose(): void {}
}

export function activate(context: vscode.ExtensionContext) {
  console.log('JIRA Workflow Checklist extension is now active!');
  
  // Initialize services
  const jiraService = JiraService.getInstance();
  const checklistStorageService = ChecklistStorageService.getInstance(context);
  
  // Register tree data provider for JIRA tasks
  const jiraTasksProvider = new JiraTasksProvider(jiraService);
  vscode.window.registerTreeDataProvider('jiraTasksView', jiraTasksProvider);

  // Initialize notification system
  initializeNotificationSystem(jiraService, context, jiraTasksProvider);

  // Register refresh command for JIRA tasks
  context.subscriptions.push(
    vscode.commands.registerCommand('fe-dev-workflow.refreshJiraTasks', () => {
      jiraTasksProvider.refresh();
    })
  );
  
  // Register command to configure JIRA credentials
  context.subscriptions.push(
    vscode.commands.registerCommand('fe-dev-workflow.configureJiraCredentials', async () => {
      const baseUrl = await vscode.window.showInputBox({
        prompt: 'Enter your JIRA base URL (e.g., https://your-domain.atlassian.net)',
        ignoreFocusOut: true
      });

      if (!baseUrl) {
        return;
      }

      const username = await vscode.window.showInputBox({
        prompt: 'Enter your JIRA username (email)',
        ignoreFocusOut: true
      });

      if (!username) {
        return;
      }

      const apiToken = await vscode.window.showInputBox({
        prompt: 'Enter your JIRA API token',
        password: true,
        ignoreFocusOut: true
      });

      if (!apiToken) {
        return;
      }

      const config = vscode.workspace.getConfiguration('jiraWorkflow');
      await config.update('baseUrl', baseUrl, vscode.ConfigurationTarget.Global);
      await config.update('username', username, vscode.ConfigurationTarget.Global);
      await config.update('apiToken', apiToken, vscode.ConfigurationTarget.Global);

      vscode.window.showInformationMessage('JIRA credentials configured successfully!');
      jiraTasksProvider.refresh();
    })
  );
  
  // Register custom editor provider for the checklist
  context.subscriptions.push(ChecklistEditorProvider.register(context));
  
  // Store the task data for retrieval by the file system provider
  let taskCache = new Map<string, JiraTask>();
  
  // Virtual file system for checklist documents
  const checklistScheme = 'jira-checklist';
  const checklistFileSystemProvider = new class implements vscode.FileSystemProvider {
    private _emitter = new vscode.EventEmitter<vscode.FileChangeEvent[]>();
    onDidChangeFile: vscode.Event<vscode.FileChangeEvent[]> = this._emitter.event;
    
    async readFile(uri: vscode.Uri): Promise<Uint8Array> {
      const jiraTaskKey = path.basename(uri.path, '.json');
      
      // Get the task from cache or try to retrieve from JIRA
      let taskSummary = '';
      const cachedTask = taskCache.get(jiraTaskKey);
      
      if (cachedTask) {
        taskSummary = cachedTask.summary;
      } else {
        try {
          // Try to fetch the task from JIRA if not in cache
          const tasks = await jiraService.getMyTasks();
          const task = tasks.find(t => t.key === jiraTaskKey);
          if (task) {
            taskSummary = task.summary;
            taskCache.set(jiraTaskKey, task);
          }
        } catch (error) {
          console.error('Failed to fetch task summary:', error);
        }
      }
      
      const checklist = await checklistStorageService.loadChecklist(jiraTaskKey, taskSummary);
      return Buffer.from(JSON.stringify(checklist, null, 2));
    }
    
    async writeFile(uri: vscode.Uri, content: Uint8Array, _options: { create: boolean, overwrite: boolean }): Promise<void> {
      const jsonContent = Buffer.from(content).toString('utf-8');
      try {
        const checklist = JSON.parse(jsonContent);
        await checklistStorageService.saveChecklist(checklist);
      } catch (error) {
        console.error('Error writing checklist file:', error);
      }
    }
    
    watch(_uri: vscode.Uri, _options: { recursive: boolean, excludes: string[] }): vscode.Disposable {
      return new vscode.Disposable(() => {});
    }
    
    stat(_uri: vscode.Uri): vscode.FileStat {
      return {
        type: vscode.FileType.File,
        ctime: Date.now(),
        mtime: Date.now(),
        size: 0
      };
    }
    
    readDirectory(_uri: vscode.Uri): [string, vscode.FileType][] {
      return [];
    }
    
    createDirectory(_uri: vscode.Uri): void {}
    
    delete(_uri: vscode.Uri, _options: { recursive: boolean }): void {}
    
    rename(_oldUri: vscode.Uri, _newUri: vscode.Uri, _options: { overwrite: boolean }): void {}
  };
  
  context.subscriptions.push(
    vscode.workspace.registerFileSystemProvider(checklistScheme, checklistFileSystemProvider, { 
      isCaseSensitive: true 
    })
  );
  
  // Command to open checklist editor
  context.subscriptions.push(
    vscode.commands.registerCommand('fe-dev-workflow.openChecklistEditor', async (task: JiraTask) => {
      if (!task) {
        const tasks = await jiraService.getMyTasks();
        if (tasks.length === 0) {
          vscode.window.showInformationMessage('No JIRA tasks found.');
          return;
        }
        
        const selectedTask = await vscode.window.showQuickPick(
          tasks.map(t => ({ 
            label: t.key + ': ' + t.summary,
            task: t 
          })),
          { placeHolder: 'Select a JIRA task' }
        );
        
        if (!selectedTask) {
          return;
        }
        
        task = selectedTask.task;
      }
      
      // Add to task cache
      taskCache.set(task.key, task);
      
      // Create a URI for the checklist document
      const uri = vscode.Uri.parse(`${checklistScheme}:/${task.key}.json`);
      
      // Check if a checklist already exists, otherwise create a new one
      try {
        const existingChecklist = await checklistStorageService.loadChecklist(task.key, task.summary);
        
        // If the summary has changed, update it
        if (existingChecklist.jiraTaskSummary !== task.summary) {
          existingChecklist.jiraTaskSummary = task.summary;
          await checklistStorageService.saveChecklist(existingChecklist);
        }
      } catch (error) {
        // Create a new checklist if it doesn't exist
        const newChecklist = defaultWorkflowChecklist(task.key, task.summary);
        await checklistStorageService.saveChecklist(newChecklist);
      }
      
      // Open the document with our custom editor
      try {
        await vscode.commands.executeCommand('vscode.openWith', uri, ChecklistEditorProvider.viewType);
      } catch (error) {
        console.error('Error opening custom editor:', error);
        vscode.window.showErrorMessage('Failed to open checklist editor: ' + error);
      }
    })
  );
  
  // Command to export checklist
  context.subscriptions.push(
    vscode.commands.registerCommand('fe-dev-workflow.exportChecklist', async () => {
      const activeEditor = vscode.window.activeTextEditor;
      if (!activeEditor) {
        vscode.window.showErrorMessage('No active document to export');
        return;
      }
      
      const uri = activeEditor.document.uri;
      if (uri.scheme !== checklistScheme) {
        vscode.window.showErrorMessage('Active document is not a checklist');
        return;
      }
      
      const jiraTaskKey = path.basename(uri.path, '.json');
      const content = await checklistFileSystemProvider.readFile(uri);
      const checklist = JSON.parse(Buffer.from(content).toString('utf-8'));
      
      const format = await vscode.window.showQuickPick(
        ['html', 'json'],
        { placeHolder: 'Select export format' }
      ) as 'html' | 'json' | undefined;
      
      if (!format) {
        return;
      }
      
      try {
        const exportedPath = await checklistStorageService.exportChecklist(checklist, format);
        
        const openFile = 'Open File';
        const response = await vscode.window.showInformationMessage(
          `Checklist exported successfully to ${exportedPath}`, 
          openFile
        );
        
        if (response === openFile) {
          if (format === 'html') {
            await vscode.env.openExternal(vscode.Uri.file(exportedPath));
          } else {
            await vscode.window.showTextDocument(vscode.Uri.file(exportedPath));
          }
        }
      } catch (error) {
        vscode.window.showErrorMessage(`Failed to export checklist: ${error}`);
      }
    })
  );
}

export function deactivate() {
  // Stop notification polling when extension is deactivated
  const jiraService = JiraService.getInstance();
  jiraService.stopNotificationPolling();
}

/**
 * Initializes the JIRA task notification system
 */
function initializeNotificationSystem(
  jiraService: JiraService, 
  context: vscode.ExtensionContext,
  jiraTasksProvider: JiraTasksProvider
): void {
  const config = vscode.workspace.getConfiguration('jiraWorkflow');
  const notificationsEnabled = config.get<boolean>('notificationsEnabled');
  
  // Register commands related to notifications
  context.subscriptions.push(
    vscode.commands.registerCommand('fe-dev-workflow.toggleNotifications', async () => {
      const config = vscode.workspace.getConfiguration('jiraWorkflow');
      const currentlyEnabled = config.get<boolean>('notificationsEnabled');
      
      await config.update('notificationsEnabled', !currentlyEnabled, vscode.ConfigurationTarget.Global);
      
      // Restart notification system with new settings
      initializeNotificationSystem(jiraService, context, jiraTasksProvider);
      
      vscode.window.showInformationMessage(`JIRA task notifications ${!currentlyEnabled ? 'enabled' : 'disabled'}`);
    })
  );

  // Add command to open task when clicked from notification
  context.subscriptions.push(
    vscode.commands.registerCommand('fe-dev-workflow.openTaskFromNotification', async (task: JiraTask) => {
      await vscode.commands.executeCommand('fe-dev-workflow.openChecklistEditor', task);
    })
  );
  
  // Stop existing polling if any
  jiraService.stopNotificationPolling();
  
  // If notifications are disabled, we're done
  if (!notificationsEnabled) {
    console.log('JIRA task notifications are disabled');
    return;
  }
  
  // Start notification polling
  jiraService.startNotificationPolling((newTasks: JiraTask[]) => {
    // Handle multiple new tasks
    if (newTasks.length > 0) {
      // Play notification sound if enabled
      const playSound = config.get<boolean>('notificationSound');
      
      if (newTasks.length === 1) {
        // Single task notification
        const task = newTasks[0];
        
        // Create action buttons for the notification
        const openTask = 'Open Task';
        const openJira = 'Open in JIRA';
        
        vscode.window.showInformationMessage(
          `New JIRA task assigned to you: ${task.key} - ${task.summary}`,
          { modal: false, detail: `Type: ${task.type} | Priority: ${task.priority}` },
          openTask, 
          openJira
        ).then(selection => {
          if (selection === openTask) {
            vscode.commands.executeCommand('fe-dev-workflow.openTaskFromNotification', task);
          } else if (selection === openJira) {
            vscode.env.openExternal(vscode.Uri.parse(task.url));
          }
        });
      } else {
        // Multiple task notification
        const viewTasks = 'View Tasks';
        
        vscode.window.showInformationMessage(
          `${newTasks.length} new JIRA tasks assigned to you`,
          viewTasks
        ).then(selection => {
          if (selection === viewTasks) {
            vscode.commands.executeCommand('workbench.view.extension.jira-workflow');
            jiraTasksProvider.refresh();
          }
        });
      }
      
      // Play sound if enabled
      if (playSound) {
        vscode.commands.executeCommand('workbench.action.focusActiveEditorGroup')
          .then(() => {
            vscode.commands.executeCommand('editor.action.marker.next')
              .then(() => {
                vscode.commands.executeCommand('workbench.action.focusActiveEditorGroup');
              });
          });
      }
      
      // Refresh the task list in the sidebar
      jiraTasksProvider.refresh();
    }
  });
  
  // Also register configuration change listener to restart notification system when settings change
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('jiraWorkflow.notificationsEnabled') || 
          e.affectsConfiguration('jiraWorkflow.notificationPollingInterval') ||
          e.affectsConfiguration('jiraWorkflow.notificationSound')) {
        initializeNotificationSystem(jiraService, context, jiraTasksProvider);
      }
    })
  );
}
