import * as vscode from 'vscode';
import { JiraService } from '../providers/jiraService';
import { JiraTask } from '../models/jiraTask';

// Define release version categories
export enum VersionCategory {
  Unreleased = 'Unreleased',
  Released = 'Released',
  NoVersion = 'No Version'
}

// Class to represent a release version node in the tree view
export class VersionCategoryItem extends vscode.TreeItem {
  constructor(
    public readonly category: string,
    public readonly tasks: JiraTask[],
    public readonly version?: string,
    public readonly releaseDate?: string
  ) {
    super(
      version ? `${version} (${tasks.length})` : `${category} (${tasks.length})`, 
      vscode.TreeItemCollapsibleState.Expanded
    );
    
    this.contextValue = 'versionCategory';
    this.iconPath = getVersionIcon(category);
    
    // Show release date in the description if available
    if (releaseDate) {
      this.description = `${tasks.length} task${tasks.length !== 1 ? 's' : ''} · ${releaseDate}`;
      this.tooltip = `${version}: ${tasks.length} task${tasks.length !== 1 ? 's' : ''}\nRelease Date: ${releaseDate}`;
    } else {
      this.description = `${tasks.length} task${tasks.length !== 1 ? 's' : ''}`;
      this.tooltip = `${version || category}: ${tasks.length} task${tasks.length !== 1 ? 's' : ''}`;
    }
  }
}

// Helper function to determine the appropriate icon for each version category
function getVersionIcon(category: string): vscode.ThemeIcon {
  switch(category) {
    case VersionCategory.Unreleased:
      return new vscode.ThemeIcon('milestone');
    case VersionCategory.Released:
      return new vscode.ThemeIcon('tag');
    case VersionCategory.NoVersion:
      return new vscode.ThemeIcon('circle-outline');
    default:
      return new vscode.ThemeIcon('versions');
  }
}

export class JiraTaskItem extends vscode.TreeItem {
  constructor(
    public readonly task: JiraTask,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState
  ) {
    super(task.key + ': ' + task.summary, collapsibleState);
    
    // Set tooltip with task info
    this.tooltip = `${task.key}: ${task.summary}\nStatus: ${task.status}\nType: ${task.type}\nClick to open checklist`;
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

    // Command to execute when clicking on the item - using key to reference task
    this.command = {
      command: 'fe-dev-workflow.openChecklistEditor',
      title: 'Open Checklist',
      arguments: [task] // Pass entire task object
    };
  }
}

// Type for tree items that can be either categories or tasks
type TreeItem = VersionCategoryItem | JiraTaskItem;

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

  // Helper method to categorize a task based on its release version
  private categorizeTask(task: JiraTask): { category: string, versionName?: string, releaseDate?: string } {
    if (!task.fixVersions || task.fixVersions.length === 0) {
      return { category: VersionCategory.NoVersion };
    }
    
    // For simplicity, we'll use the first version associated with the task
    const version = task.fixVersions[0];
    if (version.released) {
      return { 
        category: VersionCategory.Released,
        versionName: version.name,
        releaseDate: version.releaseDate
      };
    } else {
      return { 
        category: VersionCategory.Unreleased,
        versionName: version.name,
        releaseDate: version.releaseDate
      };
    }
  }

  async getChildren(element?: TreeItem): Promise<TreeItem[]> {
    // If element is a category, return its tasks
    if (element instanceof VersionCategoryItem) {
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
        
        // Group tasks by version
        const tasksByVersion = new Map<string, {
          category: string,
          versionName?: string,
          releaseDate?: string,
          tasks: JiraTask[]
        }>();
        
        // Categorize each task
        tasks.forEach(task => {
          const { category, versionName, releaseDate } = this.categorizeTask(task);
          // Create a unique key for the version
          const versionKey = versionName ? `${category}-${versionName}` : category;
          
          let versionGroup = tasksByVersion.get(versionKey);
          if (!versionGroup) {
            versionGroup = {
              category,
              versionName,
              releaseDate,
              tasks: []
            };
            tasksByVersion.set(versionKey, versionGroup);
          }
          
          versionGroup.tasks.push(task);
        });
        
        // Create version items and sort them
        const versionItems: VersionCategoryItem[] = [];
        
        // First, handle "No Version" category
        const noVersionGroup = tasksByVersion.get(VersionCategory.NoVersion);
        if (noVersionGroup && noVersionGroup.tasks.length > 0) {
          versionItems.push(new VersionCategoryItem(
            noVersionGroup.category,
            noVersionGroup.tasks
          ));
        }
        
        // Handle unreleased versions
        const unreleasedVersions = Array.from(tasksByVersion.values())
          .filter(group => group.category === VersionCategory.Unreleased)
          .sort((a, b) => {
            // Sort by release date if available (earliest first), otherwise by name
            if (a.releaseDate && b.releaseDate) {
              return new Date(a.releaseDate).getTime() - new Date(b.releaseDate).getTime();
            } else if (a.releaseDate) {
              return -1; // Versions with release dates come first
            } else if (b.releaseDate) {
              return 1;
            }
            // Finally, sort alphabetically by name
            return (a.versionName || '').localeCompare(b.versionName || '');
          });
        
        unreleasedVersions.forEach(group => {
          versionItems.push(new VersionCategoryItem(
            group.category,
            group.tasks,
            group.versionName,
            group.releaseDate
          ));
        });
        
        // Handle released versions
        const releasedVersions = Array.from(tasksByVersion.values())
          .filter(group => group.category === VersionCategory.Released)
          .sort((a, b) => {
            // Sort released versions by date (most recent first)
            if (a.releaseDate && b.releaseDate) {
              return new Date(b.releaseDate).getTime() - new Date(a.releaseDate).getTime();
            } else if (a.releaseDate) {
              return -1;
            } else if (b.releaseDate) {
              return 1;
            }
            return (b.versionName || '').localeCompare(a.versionName || '');
          });
        
        releasedVersions.forEach(group => {
          versionItems.push(new VersionCategoryItem(
            group.category,
            group.tasks,
            group.versionName,
            group.releaseDate
          ));
        });
        
        return versionItems;
      } catch (error) {
        vscode.window.showErrorMessage(`Failed to load JIRA tasks: ${error}`);
        return [];
      }
    }
  }
}