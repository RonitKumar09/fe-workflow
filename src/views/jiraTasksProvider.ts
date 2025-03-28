import * as vscode from 'vscode';
import { JiraService } from '../providers/jiraService';
import { JiraTask } from '../models/jiraTask';

// Define release version categories
export enum VersionCategory {
  Unreleased = 'Unreleased',
  Released = 'Released',
  NoVersion = 'No Version',
  Done = 'Done',
  Discarded = 'Discarded'
}

// Define main group categories
export enum MainGroupCategory {
  UnreleasedVersions = 'Unreleased Versions',
  ReleasedVersions = 'Released Versions',
  DoneAndDiscarded = 'Done and Discarded Tasks'
}

// Class to represent a main group in the tree view
export class MainGroupItem extends vscode.TreeItem {
  constructor(
    public readonly category: MainGroupCategory,
    public readonly categoryItems: VersionCategoryItem[]
  ) {
    super(
      `${category} (${categoryItems.reduce((total, item) => total + item.tasks.length, 0)})`,
      vscode.TreeItemCollapsibleState.Expanded
    );
    
    this.contextValue = 'mainGroup';
    this.iconPath = getMainGroupIcon(category);
    this.tooltip = `${category}: ${categoryItems.reduce((total, item) => total + item.tasks.length, 0)} tasks`;
  }
}

// Class to represent a release version node in the tree view
export class VersionCategoryItem extends vscode.TreeItem {
  constructor(
    public readonly category: string,
    public readonly tasks: JiraTask[],
    public readonly version?: string,
    public readonly releaseDate?: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState = vscode.TreeItemCollapsibleState.Expanded
  ) {
    super(
      version ? `${version} (${tasks.length})` : `${category} (${tasks.length})`, 
      collapsibleState
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
    case VersionCategory.Done:
      return new vscode.ThemeIcon('check-all');
    case VersionCategory.Discarded:
      return new vscode.ThemeIcon('trash');
    default:
      return new vscode.ThemeIcon('versions');
  }
}

// Helper function to get the icon for main groups
function getMainGroupIcon(category: MainGroupCategory): vscode.ThemeIcon {
  switch(category) {
    case MainGroupCategory.UnreleasedVersions:
      return new vscode.ThemeIcon('milestone');
    case MainGroupCategory.ReleasedVersions:
      return new vscode.ThemeIcon('tag');
    case MainGroupCategory.DoneAndDiscarded:
      return new vscode.ThemeIcon('archive');
    default:
      return new vscode.ThemeIcon('list-tree');
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
type TreeItem = MainGroupItem | VersionCategoryItem | JiraTaskItem;

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
    // First check the task status to determine if it's Done or Discarded
    const status = task.status.toLowerCase();
    
    // Check for Done status
    if (status.includes('done') || status.includes('closed') || status.includes('resolved') || 
        status.includes('complete') || status.includes('finished')) {
      return { category: VersionCategory.Done };
    }
    
    // Check for Discarded status
    if (status.includes('discard') || status.includes('won\'t do') || status.includes('wont do') || 
        status.includes('cancelled') || status.includes('canceled') || 
        status.includes('invalid') || status.includes('obsolete') || status.includes('reject')) {
      return { category: VersionCategory.Discarded };
    }
    
    // If not Done or Discarded, categorize by version
    if (!task.fixVersions || !Array.isArray(task.fixVersions) || task.fixVersions.length === 0) {
      return { category: VersionCategory.NoVersion };
    }
    
    // For simplicity, we'll use the first version in the array
    const version = task.fixVersions[0];
    if (version && typeof version === 'object' && 'released' in version && version.released) {
      return { 
        category: VersionCategory.Released,
        versionName: version.name,
        releaseDate: version.releaseDate
      };
    } else if (version && typeof version === 'object') {
      return { 
        category: VersionCategory.Unreleased,
        versionName: version.name,
        releaseDate: version.releaseDate
      };
    } else {
      // Fallback if version exists but has unexpected structure
      return { category: VersionCategory.NoVersion };
    }
  }

  async getChildren(element?: TreeItem): Promise<TreeItem[]> {
    // Third level - if element is a category, return its tasks
    if (element instanceof VersionCategoryItem) {
      return element.tasks.map(task => 
        new JiraTaskItem(task, vscode.TreeItemCollapsibleState.None)
      );
    } 
    // Second level - if element is a main group, return its categories
    else if (element instanceof MainGroupItem) {
      return element.categoryItems;
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
        
        // Create category items
        const unreleasedCategoryItems: VersionCategoryItem[] = [];
        const releasedCategoryItems: VersionCategoryItem[] = [];
        const doneDiscardedCategoryItems: VersionCategoryItem[] = [];
        
        // Handle unreleased versions
        const unreleasedVersions = Array.from(tasksByVersion.values())
          .filter(group => group.category === VersionCategory.Unreleased)
          .sort((a, b) => {
            // Sort unreleased versions by release date (earliest first)
            if (a.releaseDate && b.releaseDate) {
              return new Date(a.releaseDate).getTime() - new Date(b.releaseDate).getTime();
            } else if (a.releaseDate) {
              return -1; // a has a date, b doesn't
            } else if (b.releaseDate) {
              return 1;  // b has a date, a doesn't
            } else {
              // If no release dates, sort alphabetically by version name
              return (a.versionName || '').localeCompare(b.versionName || '');
            }
          });
          
        // Create unreleased version category items
        unreleasedVersions.forEach(group => {
          unreleasedCategoryItems.push(
            new VersionCategoryItem(
              group.category,
              group.tasks,
              group.versionName,
              group.releaseDate,
              vscode.TreeItemCollapsibleState.Expanded
            )
          );
        });
        
        // Handle released versions
        const releasedVersions = Array.from(tasksByVersion.values())
          .filter(group => group.category === VersionCategory.Released)
          .sort((a, b) => {
            // Sort released versions by release date (most recent first)
            if (a.releaseDate && b.releaseDate) {
              return new Date(b.releaseDate).getTime() - new Date(a.releaseDate).getTime();
            } else if (a.releaseDate) {
              return -1; // a has a date, b doesn't
            } else if (b.releaseDate) {
              return 1;  // b has a date, a doesn't
            } else {
              // If no release dates, sort alphabetically by version name
              return (a.versionName || '').localeCompare(b.versionName || '');
            }
          });
          
        // Create released version category items
        releasedVersions.forEach(group => {
          releasedCategoryItems.push(
            new VersionCategoryItem(
              group.category,
              group.tasks,
              group.versionName,
              group.releaseDate,
              vscode.TreeItemCollapsibleState.Expanded
            )
          );
        });
        
        // Handle No Version tasks (if any)
        const noVersionGroup = Array.from(tasksByVersion.values())
          .find(group => group.category === VersionCategory.NoVersion);
          
        if (noVersionGroup && noVersionGroup.tasks.length > 0) {
          releasedCategoryItems.push(
            new VersionCategoryItem(
              VersionCategory.NoVersion,
              noVersionGroup.tasks,
              undefined,
              undefined,
              vscode.TreeItemCollapsibleState.Expanded
            )
          );
        }
        
        // Handle Done and Discarded tasks
        const doneGroup = Array.from(tasksByVersion.values())
          .find(group => group.category === VersionCategory.Done);
          
        if (doneGroup && doneGroup.tasks.length > 0) {
          doneDiscardedCategoryItems.push(
            new VersionCategoryItem(
              VersionCategory.Done,
              doneGroup.tasks,
              undefined,
              undefined,
              vscode.TreeItemCollapsibleState.Collapsed
            )
          );
        }
        
        const discardedGroup = Array.from(tasksByVersion.values())
          .find(group => group.category === VersionCategory.Discarded);
          
        if (discardedGroup && discardedGroup.tasks.length > 0) {
          doneDiscardedCategoryItems.push(
            new VersionCategoryItem(
              VersionCategory.Discarded,
              discardedGroup.tasks,
              undefined,
              undefined,
              vscode.TreeItemCollapsibleState.Collapsed
            )
          );
        }
        
        // Create the three main groups
        const mainGroups: MainGroupItem[] = [];
        
        // Add Unreleased Versions group if it has items
        if (unreleasedCategoryItems.length > 0) {
          mainGroups.push(
            new MainGroupItem(
              MainGroupCategory.UnreleasedVersions,
              unreleasedCategoryItems
            )
          );
        }
        
        // Add Released Versions group if it has items
        if (releasedCategoryItems.length > 0) {
          mainGroups.push(
            new MainGroupItem(
              MainGroupCategory.ReleasedVersions,
              releasedCategoryItems
            )
          );
        }
        
        // Add Done and Discarded group if it has items
        if (doneDiscardedCategoryItems.length > 0) {
          mainGroups.push(
            new MainGroupItem(
              MainGroupCategory.DoneAndDiscarded,
              doneDiscardedCategoryItems
            )
          );
        }
        
        return mainGroups;
      } catch (error) {
        vscode.window.showErrorMessage(`Failed to load JIRA tasks: ${error}`);
        return [];
      }
    }
  }
}