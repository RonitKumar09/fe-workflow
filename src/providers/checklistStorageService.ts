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
            /* Light theme colors */
            --primary-color: #0052CC;
            --secondary-color: #172B4D;
            --bg-color: #ffffff;
            --text-color: #333;
            --text-light: #5E6C84;
            --border-color: #ddd;
            --success-color: #00875A;
            --header-bg: #F4F5F7;
            --section-hover: #f5f5f5;
            --item-notes-bg: #F4F5F7;
            --item-notes-border: #0052CC;
            --checkbox-border: #DFE1E6;
            --in-progress-color: #F5C94E;
            --button-bg: #0052CC;
            --button-text: #ffffff;
            --button-hover: #0747A6;
            --theme-toggle-shadow: rgba(0, 0, 0, 0.1);
          }
          
          /* Dark theme colors */
          [data-theme="dark"] {
            --primary-color: #4C9AFF;
            --secondary-color: #B8C7E0;
            --bg-color: #1A1A1A;
            --text-color: #E6E6E6;
            --text-light: #A8B2C1;
            --border-color: #444;
            --success-color: #36B37E;
            --header-bg: #2C2C2C;
            --section-hover: #333;
            --item-notes-bg: #2C2C2C;
            --item-notes-border: #4C9AFF;
            --checkbox-border: #555;
            --in-progress-color: #F5C94E;
            --button-bg: #4C9AFF;
            --button-text: #E6E6E6;
            --button-hover: #388BFF;
            --theme-toggle-shadow: rgba(255, 255, 255, 0.1);
          }
          
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
            line-height: 1.6;
            color: var(--text-color);
            max-width: 900px;
            margin: 0 auto;
            padding: 20px;
            background-color: var(--bg-color);
            transition: all 0.3s ease;
          }
          
          .header {
            background-color: var(--header-bg);
            padding: 20px;
            border-radius: 6px;
            margin-bottom: 30px;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
            position: relative;
          }
          
          .header-top {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 10px;
          }
          
          .logo-container {
            display: flex;
            align-items: center;
            margin-bottom: 15px;
          }
          
          .logo {
            width: 40px;
            height: 40px;
            margin-right: 15px;
          }
          
          .task-info {
            flex-grow: 1;
          }
          
          .theme-toggle {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 40px;
            height: 40px;
            border-radius: 50%;
            background-color: var(--bg-color);
            box-shadow: 0 2px 5px var(--theme-toggle-shadow);
            cursor: pointer;
            border: none;
            outline: none;
            transition: all 0.3s ease;
            margin-left: 15px;
            flex-shrink: 0;
          }
          
          .theme-toggle:hover {
            transform: scale(1.05);
          }
          
          .theme-toggle svg {
            width: 24px;
            height: 24px;
            fill: var(--primary-color);
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
            color: var (--text-light);
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
            width: 20px;
            height: 20px;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 3px;
            border: 1px solid var(--checkbox-border);
            background: var(--bg-color);
            color: var(--success-color);
            font-weight: bold;
          }
          
          .in-progress .checklist-item-title {
            color: var(--in-progress-color);
            font-weight: bold;
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
          
          .item-notes {
            font-size: 0.9em;
            color: var(--text-color);
            margin-top: 10px;
            padding: 8px;
            background-color: var(--item-notes-bg);
            border-left: 3px solid var(--item-notes-border);
            border-radius: 3px;
            white-space: pre-wrap;
          }
          
          .notes-label {
            font-weight: bold;
            margin-bottom: 5px;
            color: var(--secondary-color);
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
              background-color: white !important;
              color: black !important;
            }
            
            .theme-toggle {
              display: none;
            }
            
            .section, .header {
              page-break-inside: avoid;
              border: 1px solid #ddd !important;
            }
            
            @page {
              margin: 1.5cm;
            }
          }
          
          /* Tooltip styles */
          .tooltip {
            position: relative;
            display: inline-block;
          }
          
          .tooltip .tooltiptext {
            visibility: hidden;
            width: 140px;
            background-color: var(--header-bg);
            color: var(--text-color);
            text-align: center;
            border-radius: 6px;
            padding: 5px;
            position: absolute;
            z-index: 1;
            bottom: 125%;
            left: 50%;
            margin-left: -70px;
            opacity: 0;
            transition: opacity 0.3s;
            font-size: 12px;
            border: 1px solid var(--border-color);
          }
          
          .tooltip .tooltiptext::after {
            content: "";
            position: absolute;
            top: 100%;
            left: 50%;
            margin-left: -5px;
            border-width: 5px;
            border-style: solid;
            border-color: var(--header-bg) transparent transparent transparent;
          }
          
          .tooltip:hover .tooltiptext {
            visibility: visible;
            opacity: 1;
          }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="header-top">
            <div class="task-info">
              <div class="task-key">${checklist.jiraTaskKey}</div>
              <div class="task-summary">${checklist.jiraTaskSummary}</div>
              <div class="timestamp">Last updated: ${new Date(checklist.lastUpdated).toLocaleString()}</div>
            </div>
            <button id="theme-toggle" class="theme-toggle tooltip" aria-label="Toggle dark mode">
              <span class="tooltiptext">Toggle Dark Mode</span>
              <svg id="theme-toggle-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
                <!-- Sun icon (for dark mode toggle) -->
                <path class="sun-icon" d="M12,7c-2.76,0-5,2.24-5,5s2.24,5,5,5s5-2.24,5-5S14.76,7,12,7L12,7z M2,13h2c0.55,0,1-0.45,1-1s-0.45-1-1-1H2 c-0.55,0-1,0.45-1,1S1.45,13,2,13z M20,13h2c0.55,0,1-0.45,1-1s-0.45-1-1-1h-2c-0.55,0-1,0.45-1,1S19.45,13,20,13z M11,2v2 c0,0.55,0.45,1,1,1s1-0.45,1-1V2c0-0.55-0.45-1-1-1S11,1.45,11,2z M11,20v2c0,0.55,0.45,1,1,1s1-0.45,1-1v-2c0-0.55-0.45-1-1-1 S11,19.45,11,20z M5.99,4.58c-0.39-0.39-1.03-0.39-1.41,0c-0.39,0.39-0.39,1.03,0,1.41l1.06,1.06c0.39,0.39,1.03,0.39,1.41,0 s0.39-1.03,0-1.41L5.99,4.58z M18.36,16.95c-0.39-0.39-1.03-0.39-1.41,0c-0.39,0.39-0.39,1.03,0,1.41l1.06,1.06 c0.39,0.39,1.03,0.39,1.41,0c0.39-0.39,0.39-1.03,0-1.41L18.36,16.95z M19.42,5.99c0.39-0.39,0.39-1.03,0-1.41 c-0.39-0.39-1.03-0.39-1.41,0l-1.06,1.06c-0.39,0.39-0.39,1.03,0,1.41s1.03,0.39,1.41,0L19.42,5.99z M7.05,18.36 c0.39-0.39,0.39-1.03,0-1.41c-0.39-0.39-1.03-0.39-1.41,0l-1.06,1.06c-0.39,0.39-0.39,1.03,0,1.41s1.03,0.39,1.41,0L7.05,18.36z" />
                <!-- Moon icon (for light mode toggle) -->
                <path class="moon-icon" d="M12,3c-4.97,0-9,4.03-9,9s4.03,9,9,9s9-4.03,9-9c0-0.46-0.04-0.92-0.1-1.36c-0.98,1.37-2.58,2.26-4.4,2.26 c-2.98,0-5.4-2.42-5.4-5.4c0-1.81,0.89-3.42,2.26-4.4C12.92,3.04,12.46,3,12,3L12,3z" style="display: none;" />
              </svg>
            </button>
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
        
        <h1>FE Developer Workflow Checklist</h1>
        
        <div class="sections-container">
    `;

    for (const section of checklist.sections) {
      const sectionItems = section.items || [];
      const completedItems = sectionItems.filter(item => item.status === 'completed').length;
      const inProgressItems = sectionItems.filter(item => item.status === 'in-progress').length;
      const sectionItemsCount = sectionItems.length;
      const sectionPercentage = sectionItemsCount > 0 
        ? Math.round((completedItems / sectionItemsCount) * 100) 
        : 0;
      
      html += `
        <div class="section">
          <div class="section-header">
            <div class="section-title">${section.title}</div>
            <div class="section-progress">
              ${completedItems}/${sectionItemsCount} (${sectionPercentage}%) · ${inProgressItems} in progress
            </div>
          </div>
          <div class="section-content">
      `;
      
      for (const item of section.items) {
        const isCompleted = item.status === 'completed';
        const isInProgress = item.status === 'in-progress';
        const statusClass = isCompleted ? 'checked' : (isInProgress ? 'in-progress' : '');
        const statusSymbol = isCompleted ? '✓' : (isInProgress ? '⟳' : '□');
        
        html += `
          <div class="checklist-item ${statusClass}">
            <div class="checkbox">${statusSymbol}</div>
            <div class="checklist-item-content">
              <p class="checklist-item-title">${item.title}</p>
        `;
        
        if (item.description) {
          html += `
            <p class="checklist-item-description">${item.description}</p>
          `;
        }
        
        if (item.notes) {
          html += `
            <div class="item-notes">
              <div class="notes-label">Notes:</div>
              ${item.notes}
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
        </div>
      `;
    }
    
    html += `
        </div>
        
        <div class="footer">
          FE Developer Workflow Checklist for JIRA Task ${checklist.jiraTaskKey} - Generated on ${new Date().toLocaleString()}
        </div>

        <script>
          // Function to set the theme
          function setTheme(theme) {
            document.documentElement.setAttribute('data-theme', theme);
            
            // Update the icon
            const sunIcon = document.querySelector('.sun-icon');
            const moonIcon = document.querySelector('.moon-icon');
            
            if (theme === 'dark') {
              sunIcon.style.display = 'block';
              moonIcon.style.display = 'none';
            } else {
              sunIcon.style.display = 'none';
              moonIcon.style.display = 'block';
            }
            
            // Save the preference to localStorage
            localStorage.setItem('preferred-theme', theme);
          }
          
          // Function to toggle theme
          function toggleTheme() {
            const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
            const newTheme = currentTheme === 'light' ? 'dark' : 'light';
            setTheme(newTheme);
          }
          
          // Initialize theme based on saved preference or system preference
          document.addEventListener('DOMContentLoaded', () => {
            const savedTheme = localStorage.getItem('preferred-theme');
            const prefersDarkScheme = window.matchMedia('(prefers-color-scheme: dark)');
            
            if (savedTheme) {
              setTheme(savedTheme);
            } else if (prefersDarkScheme.matches) {
              setTheme('dark');
            } else {
              setTheme('light');
            }
            
            // Add event listener to the theme toggle button
            const themeToggle = document.getElementById('theme-toggle');
            if (themeToggle) {
              themeToggle.addEventListener('click', toggleTheme);
            }
          });
        </script>
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
        if (item.status === 'completed') {
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