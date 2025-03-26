export interface ChecklistItem {
  id: string;
  title: string; 
  description?: string;
  isChecked: boolean;
  subItems?: ChecklistItem[];
}

export interface SectionMetadata {
  expanded?: boolean;
  [key: string]: any;
}

export interface ChecklistSection {
  id: string;
  title: string;
  items: ChecklistItem[];
  metadata?: SectionMetadata;
}

export interface WorkflowChecklist {
  jiraTaskKey: string;
  jiraTaskSummary: string;
  lastUpdated: string;
  sections: ChecklistSection[];
}

// Default workflow checklist template based on the specified requirements
export const defaultWorkflowChecklist = (jiraTaskKey: string, jiraTaskSummary: string): WorkflowChecklist => {
  return {
    jiraTaskKey,
    jiraTaskSummary,
    lastUpdated: new Date().toISOString(),
    sections: [
      {
        id: 'section-1',
        title: 'Requirement Analysis',
        metadata: { expanded: true },
        items: [
          {
            id: 'item-1-1',
            title: 'Understand the task requirements from Jira description & Figma',
            description: 'Review and fully understand the task requirements',
            isChecked: false
          },
          {
            id: 'item-1-2',
            title: 'Clarify functionality',
            description: 'Discuss with the project manager and backend team if there are queries in requirement or Figma',
            isChecked: false
          },
          {
            id: 'item-1-3',
            title: 'Resolve all queries with respect to Jira or Figma',
            isChecked: false
          },
          {
            id: 'item-1-4',
            title: 'Identify dependencies',
            description: 'Discuss with backend developers for integrate APIs and check third party libraries if required',
            isChecked: false
          },
          {
            id: 'item-1-5',
            title: 'Create sub tasks on Jira tickets on the basis of Figma layouts',
            isChecked: false
          }
        ]
      },
      {
        id: 'section-2',
        title: 'Estimation',
        items: [
          {
            id: 'item-2-1',
            title: 'Discuss with the backend team and provide a front-end dev timeline',
            isChecked: false
          },
          {
            id: 'item-2-2',
            title: 'Send timeline to Sr. Developer for approval',
            isChecked: false
          }
        ]
      },
      {
        id: 'section-3',
        title: 'Development Phase',
        items: [
          {
            id: 'item-3-1',
            title: 'Break the task into smaller, manageable steps',
            isChecked: false
          },
          {
            id: 'item-3-2',
            title: 'Update Jira ticket status as in dev',
            isChecked: false
          },
          {
            id: 'item-3-3',
            title: 'Follow coding standards',
            description: 'File structures, Function & variable naming conventions (Ex: Use camelCase)',
            isChecked: false
          },
          {
            id: 'item-3-4',
            title: 'Use screen wise CSS to avoid global conflicts for CSS',
            isChecked: false
          },
          {
            id: 'item-3-5',
            title: 'Write code in proper format',
            isChecked: false
          },
          {
            id: 'item-3-6',
            title: 'Use reusable code if available',
            isChecked: false
          },
          {
            id: 'item-3-7',
            title: 'Ensure proper API error handling',
            isChecked: false
          },
          {
            id: 'item-3-8',
            title: 'Debug & understand old code properly',
            isChecked: false
          }
        ]
      },
      {
        id: 'section-4',
        title: 'Environment Setup',
        items: [
          {
            id: 'item-4-1',
            title: 'Ensure your project points to the correct dev environment for that release',
            isChecked: false
          }
        ]
      },
      {
        id: 'section-5',
        title: 'Testing',
        items: [
          {
            id: 'item-5-1',
            title: 'Perform self-review and local testing',
            isChecked: false
          },
          {
            id: 'item-5-2',
            title: 'Check responsiveness (mobile/web view)',
            isChecked: false
          },
          {
            id: 'item-5-3',
            title: 'Verify screen matches Figma layout',
            isChecked: false
          },
          {
            id: 'item-5-4',
            title: 'Check functionality as per mention in ticket',
            isChecked: false
          },
          {
            id: 'item-5-5',
            title: 'Test pagination',
            isChecked: false
          },
          {
            id: 'item-5-6',
            title: 'Verify date format',
            isChecked: false
          },
          {
            id: 'item-5-7',
            title: 'Check enum values',
            isChecked: false
          },
          {
            id: 'item-5-8',
            title: 'Test search and filters',
            isChecked: false
          },
          {
            id: 'item-5-9',
            title: 'Login with a different user or tenant',
            isChecked: false
          },
          {
            id: 'item-5-10',
            title: 'Perform testing for new test cases',
            isChecked: false
          },
          {
            id: 'item-5-11',
            title: 'Debug bugs properly',
            isChecked: false
          },
          {
            id: 'item-5-12',
            title: 'Check API request & response',
            isChecked: false
          },
          {
            id: 'item-5-13',
            title: 'Verify code written properly',
            isChecked: false
          },
          {
            id: 'item-5-14',
            title: 'Use debugger or console to check values',
            isChecked: false
          }
        ]
      },
      {
        id: 'section-6',
        title: 'Code Review',
        items: [
          {
            id: 'item-6-1',
            title: 'Create a pull request (PR) with clear descriptions',
            description: 'Include local testing evidence with images or videos',
            isChecked: false
          },
          {
            id: 'item-6-2',
            title: 'Send PR to Sr. Developer for review',
            isChecked: false
          },
          {
            id: 'item-6-3',
            title: 'Review feedback from Sr. Developer',
            isChecked: false
          },
          {
            id: 'item-6-4',
            title: 'Work on feedback points',
            isChecked: false
          },
          {
            id: 'item-6-5',
            title: 'Send request to Sr. Developer for PR merging',
            isChecked: false
          }
        ]
      },
      {
        id: 'section-7',
        title: 'Deployment Phase',
        items: [
          {
            id: 'item-7-1',
            title: 'Deploy code in the current dev environment once PR is merged',
            isChecked: false
          },
          {
            id: 'item-7-2',
            title: 'Verify deployment done properly',
            isChecked: false
          },
          {
            id: 'item-7-3',
            title: 'Update ticket status as dev complete',
            isChecked: false
          }
        ]
      },
      {
        id: 'section-8',
        title: 'Dry Run',
        items: [
          {
            id: 'item-8-1',
            title: 'Do a dry run with other team members',
            isChecked: false
          },
          {
            id: 'item-8-2',
            title: 'Address any issues found during dry run',
            isChecked: false
          },
          {
            id: 'item-8-3',
            title: 'Discuss with team members for business demo or QA testing',
            isChecked: false
          },
          {
            id: 'item-8-4',
            title: 'Update ticket status as dev testing and assign to QA team if required',
            isChecked: false
          }
        ]
      },
      {
        id: 'section-9',
        title: 'Demo (Optional)',
        items: [
          {
            id: 'item-9-1',
            title: 'Address any issues found during business demo',
            isChecked: false
          },
          {
            id: 'item-9-2',
            title: 'Recheck points from sections 6, 7 & 8 as needed',
            isChecked: false
          }
        ]
      }
    ]
  };
};