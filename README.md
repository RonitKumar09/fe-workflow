# JIRA Workflow Checklist for Frontend Developers

A VS Code extension that helps frontend developers track their JIRA tasks and follow a standardized workflow checklist for each task.

## Features

- View all your assigned JIRA tasks in VS Code
- Track a detailed workflow checklist for each JIRA task
- Standardized workflow for frontend development tasks
- Export checklists as HTML or JSON
- Links to parent tasks and epics

## Requirements

- VS Code 1.98.0 or higher
- JIRA account with API access

## Extension Settings

This extension contributes the following settings:

* `jiraWorkflow.baseUrl`: Your JIRA instance URL (e.g., https://your-domain.atlassian.net)
* `jiraWorkflow.username`: Your JIRA username (email)
* `jiraWorkflow.apiToken`: Your JIRA API token

## Getting Started

1. Install the extension
2. Click on the JIRA Workflow icon in the activity bar
3. Configure your JIRA credentials when prompted
4. View your assigned tasks in the "My JIRA Tasks" panel
5. Click on a task to open its workflow checklist
6. Track your progress using the checklist for each task

## How to Get a JIRA API Token

1. Log in to your Atlassian account
2. Go to Account Settings > Security > Create and manage API tokens
3. Click "Create API token" and provide a label
4. Copy the generated token and use it in the extension settings

## Workflow Checklist Sections

The extension provides a comprehensive checklist covering all aspects of frontend development:

1. **Requirement Analysis**
   - Understand requirements from Jira and Figma
   - Clarify functionalities and resolve queries
   - Identify dependencies

2. **Estimation**
   - Discuss with backend team
   - Provide timeline to senior developer

3. **Development Phase**
   - Break tasks into manageable steps
   - Follow coding standards
   - Ensure proper error handling

4. **Environment Setup**
   - Configure correct development environment

5. **Testing**
   - Self-review and local testing
   - Test responsiveness, functionality, pagination, etc.

6. **Code Review**
   - Create PR with clear descriptions
   - Address feedback points

7. **Deployment Phase**
   - Verify deployment

8. **Dry Run**
   - Test with team members
   - Address any issues

9. **Demo (Optional)**
   - Present to stakeholders

## Export Options

You can export your completed checklist in two formats:

- **HTML**: For sharing with your team or including in documentation
- **JSON**: For programmatic use or integration with other tools

## Release Notes

### 1.0.0

- Initial release with JIRA task integration
- Workflow checklist tracking
- HTML and JSON export options
