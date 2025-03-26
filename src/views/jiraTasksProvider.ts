import * as vscode from 'vscode';
import { JiraService } from '../providers/jiraService';
import { JiraTask } from '../models/jiraTask';

// Define categories of tasks
export enum TaskCategory {
  Done = 'Done',
  InProgress = 'In Progress',
  backlog = 'Not Started',
  Discard = 'Discard',
  Other = 'Other'
}

// Class to represent a task category node in the tree view
export class TaskCategoryItem extends vscode.TreeItem {
  constructor(
    public readonly category: string,
    public readonly tasks: JiraTask[]
  ) {
    super(
      `${category} (${tasks.length})`, 
      vscode.TreeItemCollapsibleState.Expanded
    );
    
    this.contextValue = 'taskCategory';
    this.iconPath = getCategoryIcon(category);
    this.description = `${tasks.length} task${tasks.length !== 1 ? 's' : ''}`;
    this.tooltip = `${tasks.length} task${tasks.length !== 1 ? 's' : ''} in ${category}`;
  }
}

// Helper function to determine the appropriate icon for each category
function getCategoryIcon(category: string): vscode.ThemeIcon {
  switch(category) {
    case TaskCategory.Done:
      return new vscode.ThemeIcon('check-all');
    case TaskCategory.InProgress:
      return new vscode.ThemeIcon('play-circle');
    case TaskCategory.backlog:
      return new vscode.ThemeIcon('circle-outline');
    case TaskCategory.Discard:
      return new vscode.ThemeIcon('trash');
    default:
      return new vscode.ThemeIcon('list-unordered');
  }
}

export class JiraTaskItem extends vscode.TreeItem {
  constructor(
    public readonly task: JiraTask,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState
  ) {
    super(task.key + ': ' + task.summary, collapsibleState);
    
    this.tooltip = `${task.key}: ${task.summary}\nStatus: ${task.status}\nType: ${task.type}`;
    this.description = task.status;
    
    // Set the context value based on the issue type to enable conditional context menu items
    this.contextValue = 'jiraTask';

    // Set icon based on issue type
    const iconType = task.type.toLowerCase();
    if (iconType.includes('bug')) {
      this.iconPath = new vscode.ThemeIcon('bug');
    } else if (iconType.includes('task')) {
      this.iconPath = new vscode.ThemeIcon('checklist');
    } else if (iconType.includes('story')) {
      this.iconPath = new vscode.ThemeIcon('book');
    } else if (iconType.includes('epic')) {
      this.iconPath = new vscode.ThemeIcon('rocket');
    } else {
      this.iconPath = new vscode.ThemeIcon('issue-opened');
    }

    // Command to execute when clicking on the item
    this.command = {
      command: 'fe-dev-workflow.openChecklistEditor',
      title: 'Open Checklist',
      arguments: [this.task]
    };
  }
}

// Type for tree items that can be either categories or tasks
type TreeItem = TaskCategoryItem | JiraTaskItem;

export class JiraTasksProvider implements vscode.TreeDataProvider<TreeItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<TreeItem | undefined | null | void> = 
    new vscode.EventEmitter<TreeItem | undefined | null | void>();
  
  readonly onDidChangeTreeData: vscode.Event<TreeItem | undefined | null | void> = 
    this._onDidChangeTreeData.event;

  constructor(private jiraService: JiraService) {}

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: TreeItem): vscode.TreeItem {
    return element;
  }

  // Helper method to categorize a task based on its status
  private categorizeTask(task: JiraTask): string {
    const status = task.status.toLowerCase();
    
    if (status.includes('done') || status.includes('resolved') || status.includes('closed')) {
      return TaskCategory.Done;
    } else if (status.includes('in progress') || status.includes('review') || status.includes('testing')) {
      return TaskCategory.InProgress;
    } else if (status.includes('to do') || status.includes('open') || status.includes('new')) {
      return TaskCategory.backlog;
    } else if (status.includes('discard') || status.includes('cancelled') || status.includes('won\'t do')) {
      return TaskCategory.Discard;
    } else {
      return TaskCategory.Other;
    }
  }

  async getChildren(element?: TreeItem): Promise<TreeItem[]> {
    // If element is a category, return its tasks
    if (element instanceof TaskCategoryItem) {
      return element.tasks.map(task => 
        new JiraTaskItem(task, vscode.TreeItemCollapsibleState.None)
      );
    } 
    // Root level - fetch and categorize tasks
    else {
      try {
        const tasks = await this.jiraService.getMyTasks();
        
        if (tasks.length === 0) {
          vscode.window.showInformationMessage('No JIRA tasks assigned to you.');
          return [];
        }
        
        // Group tasks by category
        const tasksByCategory = new Map<string, JiraTask[]>();
        
        // Initialize categories with empty arrays
        Object.values(TaskCategory).forEach(category => {
          tasksByCategory.set(category, []);
        });
        
        // Categorize each task
        tasks.forEach(task => {
          const category = this.categorizeTask(task);
          const categoryTasks = tasksByCategory.get(category) || [];
          categoryTasks.push(task);
          tasksByCategory.set(category, categoryTasks);
        });
        
        // Create category items, but only for categories that have tasks
        const categoryItems: TaskCategoryItem[] = [];
        tasksByCategory.forEach((categoryTasks, category) => {
          if (categoryTasks.length > 0) {
            categoryItems.push(new TaskCategoryItem(category, categoryTasks));
          }
        });
        
        return categoryItems;
      } catch (error) {
        vscode.window.showErrorMessage(`Failed to load JIRA tasks: ${error}`);
        return [];
      }
    }
  }
}