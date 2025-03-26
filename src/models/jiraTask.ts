export interface JiraTask {
  id: string;
  key: string;
  summary: string;
  description: string;
  status: string;
  assignee: string;
  type: string;
  priority: string;
  parentKey?: string;
  parentSummary?: string;
  epicKey?: string;
  epicSummary?: string;
  url: string;
}

export interface JiraCredentials {
  baseUrl: string;
  username: string;
  apiToken: string;
}