import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { WorkflowChecklist, defaultWorkflowChecklist } from '../models/workflowChecklist';

export class ChecklistStorageService {
  private static instance: ChecklistStorageService;
  private storagePath: string;

  private constructor(context: vscode.ExtensionContext) {
    this.storagePath = context.globalStoragePath;
    this.ensureStoragePathExists();
  }

  public static getInstance(context: vscode.ExtensionContext): ChecklistStorageService {
    if (!ChecklistStorageService.instance) {
      ChecklistStorageService.instance = new ChecklistStorageService(context);
    }
    return ChecklistStorageService.instance;
  }

  private ensureStoragePathExists(): void {
    if (!fs.existsSync(this.storagePath)) {
      fs.mkdirSync(this.storagePath, { recursive: true });
    }

    const checklistsDir = path.join(this.storagePath, 'checklists');
    if (!fs.existsSync(checklistsDir)) {
      fs.mkdirSync(checklistsDir, { recursive: true });
    }
  }

  private getChecklistFilePath(jiraTaskKey: string): string {
    return path.join(this.storagePath, 'checklists', `${jiraTaskKey}.json`);
  }

  public async saveChecklist(checklist: WorkflowChecklist): Promise<void> {
    const filePath = this.getChecklistFilePath(checklist.jiraTaskKey);
    checklist.lastUpdated = new Date().toISOString();
    
    try {
      fs.writeFileSync(filePath, JSON.stringify(checklist, null, 2), 'utf-8');
    } catch (error) {
      console.error('Failed to save checklist:', error);
      throw new Error(`Failed to save checklist for ${checklist.jiraTaskKey}`);
    }
  }

  public async loadChecklist(jiraTaskKey: string, jiraTaskSummary: string): Promise<WorkflowChecklist> {
    const filePath = this.getChecklistFilePath(jiraTaskKey);
    
    try {
      if (fs.existsSync(filePath)) {
        const data = fs.readFileSync(filePath, 'utf-8');
        const checklist: WorkflowChecklist = JSON.parse(data);
        return checklist;
      }
    } catch (error) {
      console.error('Failed to load checklist:', error);
    }

    // If file doesn't exist or there was an error, create a new checklist
    return defaultWorkflowChecklist(jiraTaskKey, jiraTaskSummary);
  }

  public async deleteChecklist(jiraTaskKey: string): Promise<void> {
    const filePath = this.getChecklistFilePath(jiraTaskKey);
    
    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
      } catch (error) {
        console.error('Failed to delete checklist:', error);
        throw new Error(`Failed to delete checklist for ${jiraTaskKey}`);
      }
    }
  }

  public async exportChecklist(checklist: WorkflowChecklist, format: 'html' | 'json'): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const exportDir = path.join(this.storagePath, 'exports');
    
    if (!fs.existsSync(exportDir)) {
      fs.mkdirSync(exportDir, { recursive: true });
    }

    let filePath: string;
    
    if (format === 'json') {
      filePath = path.join(exportDir, `${checklist.jiraTaskKey}_${timestamp}.json`);
      fs.writeFileSync(filePath, JSON.stringify(checklist, null, 2), 'utf-8');
    } else {
      filePath = path.join(exportDir, `${checklist.jiraTaskKey}_${timestamp}.html`);
      const html = this.generateHtml(checklist);
      fs.writeFileSync(filePath, html, 'utf-8');
    }

    return filePath;
  }

  private generateHtml(checklist: WorkflowChecklist): string {
    const progress = this.calculateProgress(checklist);
    
    let html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Workflow Checklist for ${checklist.jiraTaskKey}</title>
        <style>
          :root {
            --primary-color: #0052CC;
            --secondary-color: #172B4D;
            --bg-color: #ffffff;
            --text-color: #333;
            --text-light: #5E6C84;
            --border-color: #ddd;
            --success-color: #00875A;
            --header-bg: #F4F5F7;
            --section-hover: #f5f5f5;
          }
          
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
            line-height: 1.6;
            color: var(--text-color);
            max-width: 900px;
            margin: 0 auto;
            padding: 20px;
            background-color: var(--bg-color);
          }
          
          .header {
            background-color: var(--header-bg);
            padding: 20px;
            border-radius: 6px;
            margin-bottom: 30px;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
          }
          
          h1 { 
            color: var(--primary-color);
            border-bottom: 1px solid var(--border-color);
            padding-bottom: 10px;
            margin-top: 0;
          }
          
          .task-key {
            font-size: 1.4em;
            font-weight: bold;
            color: var(--primary-color);
            margin-bottom: 5px;
          }
          
          .task-summary {
            font-size: 1.1em;
            font-weight: bold;
            margin-bottom: 15px;
          }
          
          .timestamp {
            color: var(--text-light);
            font-size: 0.9em;
            margin-top: 5px;
          }
          
          .progress-container {
            margin: 25px 0;
          }
          
          .progress-bar-outer {
            width: 100%;
            height: 10px;
            background-color: var(--border-color);
            border-radius: 5px;
            overflow: hidden;
          }
          
          .progress-bar-inner {
            height: 100%;
            background-color: var(--primary-color);
            border-radius: 5px;
          }
          
          .progress-text {
            display: flex;
            justify-content: space-between;
            font-size: 0.9em;
            margin-top: 8px;
            color: var(--text-light);
          }
          
          .sections-container {
            display: flex;
            flex-direction: column;
            gap: 15px;
          }
          
          .section {
            background-color: var(--bg-color);
            border: 1px solid var(--border-color);
            border-radius: 6px;
            margin-bottom: 20px;
            overflow: hidden;
          }
          
          .section-header {
            background-color: var(--header-bg);
            padding: 15px;
            display: flex;
            justify-content: space-between;
            align-items: center;
          }
          
          .section-title {
            font-size: 1.1em;
            font-weight: bold;
            color: var(--secondary-color);
          }
          
          .section-progress {
            font-size: 0.9em;
            color: var(--text-light);
          }
          
          .section-content {
            padding: 15px;
          }
          
          .checklist-item {
            display: flex;
            margin-bottom: 12px;
            padding-bottom: 12px;
            border-bottom: 1px solid var(--border-color);
          }
          
          .checklist-item:last-child {
            margin-bottom: 0;
            padding-bottom: 0;
            border-bottom: none;
          }
          
          .checkbox {
            margin-right: 10px;
            margin-top: 4px;
            flex-shrink: 0;
          }
          
          .checked .checklist-item-title {
            color: var(--success-color);
            text-decoration: line-through;
          }
          
          .checklist-item-content {
            flex: 1;
          }
          
          .checklist-item-title {
            margin: 0;
            padding: 0;
          }
          
          .checklist-item-description {
            font-size: 0.9em;
            color: var(--text-light);
            margin-top: 5px;
            margin-bottom: 0;
          }
          
          .footer {
            margin-top: 30px;
            padding-top: 15px;
            border-top: 1px solid var(--border-color);
            text-align: center;
            font-size: 0.8em;
            color: var(--text-light);
          }
          
          @media print {
            body {
              padding: 0;
            }
            
            .section, .header {
              page-break-inside: avoid;
            }
            
            @page {
              margin: 1.5cm;
            }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="task-key">${checklist.jiraTaskKey}</div>
          <div class="task-summary">${checklist.jiraTaskSummary}</div>
          <div class="timestamp">Last updated: ${new Date(checklist.lastUpdated).toLocaleString()}</div>
          
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
        
        <h1>FE Developer Workflow Checklist</h1>
        
        <div class="sections-container">
    `;

    for (const section of checklist.sections) {
      const sectionItems = section.items || [];
      const completedItems = sectionItems.filter(item => item.isChecked).length;
      const sectionItemsCount = sectionItems.length;
      const sectionPercentage = sectionItemsCount > 0 
        ? Math.round((completedItems / sectionItemsCount) * 100) 
        : 0;
      
      html += `
        <div class="section">
          <div class="section-header">
            <div class="section-title">${section.title}</div>
            <div class="section-progress">
              ${completedItems}/${sectionItemsCount} (${sectionPercentage}%)
            </div>
          </div>
          <div class="section-content">
      `;
      
      for (const item of section.items) {
        const checkedClass = item.isChecked ? 'checked' : '';
        const checkedSymbol = item.isChecked ? '✓' : '□';
        
        html += `
          <div class="checklist-item ${checkedClass}">
            <div class="checkbox">${checkedSymbol}</div>
            <div class="checklist-item-content">
              <p class="checklist-item-title">${item.title}</p>
        `;
        
        if (item.description) {
          html += `
            <p class="checklist-item-description">${item.description}</p>
          `;
        }
        
        html += `
            </div>
          </div>
        `;
      }
      
      html += `
          </div>
        </div>
      `;
    }
    
    html += `
        </div>
        
        <div class="footer">
          FE Developer Workflow Checklist for JIRA Task ${checklist.jiraTaskKey} - Generated on ${new Date().toLocaleString()}
        </div>
      </body>
      </html>
    `;
    
    return html;
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
}