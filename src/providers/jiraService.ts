import * as vscode from 'vscode';
import axios from 'axios';
import { JiraCredentials, JiraTask } from '../models/jiraTask';

export class JiraService {
  private static instance: JiraService;
  private credentials: JiraCredentials | undefined;

  private constructor() {}

  public static getInstance(): JiraService {
    if (!JiraService.instance) {
      JiraService.instance = new JiraService();
    }
    return JiraService.instance;
  }

  public async getCredentials(): Promise<JiraCredentials | undefined> {
    if (this.credentials) {
      return this.credentials;
    }

    const config = vscode.workspace.getConfiguration('jiraWorkflow');
    const baseUrl = config.get<string>('baseUrl');
    const username = config.get<string>('username');
    const apiToken = config.get<string>('apiToken');

    if (!baseUrl || !username || !apiToken) {
      const setupNow = 'Setup Now';
      const response = await vscode.window.showInformationMessage(
        'JIRA credentials are not configured. Would you like to set them now?',
        setupNow
      );

      if (response === setupNow) {
        await this.configureCredentials();
        return this.getCredentials();
      } else {
        return undefined;
      }
    }

    this.credentials = { baseUrl, username, apiToken };
    return this.credentials;
  }

  private async configureCredentials(): Promise<void> {
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

    this.credentials = { baseUrl, username, apiToken };
  }

  public async getMyTasks(): Promise<JiraTask[]> {
    const credentials = await this.getCredentials();
    if (!credentials) {
      throw new Error('JIRA credentials are not configured');
    }

    try {
      const response = await axios.get(
        `${credentials.baseUrl}/rest/api/3/search`,
        {
          params: {
            jql: 'assignee = currentUser() AND resolution = Unresolved ORDER BY updated DESC',
            fields: 'summary,description,status,issuetype,priority,parent,epic,issuelinks'
          },
          auth: {
            username: credentials.username,
            password: credentials.apiToken
          },
          headers: {
            'Accept': 'application/json'
          }
        }
      );

      return response.data.issues.map((issue: any) => {
        const parentKey = issue.fields.parent ? issue.fields.parent.key : undefined;
        const parentSummary = issue.fields.parent ? issue.fields.parent.fields.summary : undefined;

        let epicKey, epicSummary;
        if (issue.fields.epic) {
          epicKey = issue.fields.epic.key;
          epicSummary = issue.fields.epic.summary;
        }

        return {
          id: issue.id,
          key: issue.key,
          summary: issue.fields.summary,
          description: issue.fields.description || '',
          status: issue.fields.status.name,
          assignee: credentials.username,
          type: issue.fields.issuetype.name,
          priority: issue.fields.priority.name,
          parentKey,
          parentSummary,
          epicKey,
          epicSummary,
          url: `${credentials.baseUrl}/browse/${issue.key}`
        };
      });
    } catch (error) {
      console.error('Error fetching JIRA tasks:', error);
      throw new Error('Failed to fetch JIRA tasks. Please check your credentials and connection.');
    }
  }
}