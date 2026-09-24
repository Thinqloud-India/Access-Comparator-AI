# Access Comparator AI

A Salesforce Lightning Web Component that gives admins a single screen to view, analyze, and compare **Profile** and **Object-level access** across orgs — including a UAT vs. Production diff with an optional AI-generated narrative summary.

## What it does

- **Profile Access** — select one or more Profiles and retrieve their complete permission footprint across 8 categories (Object Permissions, Field Permissions, Apex Class Access, Visualforce Access, Tab Visibility, Application Access, Record Type Access, Custom Permissions), exportable to Excel.
- **Object Access** — browse by category (Standard/Custom Objects, Apex Classes/Triggers, Visualforce Pages, Flows & Processes) and pull a full security bundle per object, including a disclosure of what standard SOQL cannot see (Org-Wide Defaults, Sharing Rules, Tab Visibility).
- **Access Comparison** — upload two Excel exports (e.g. from UAT and Production) and get an automatic, client-side diff — matches, differences, and items missing on either side — with an optional Agentforce-powered plain-English summary.

All comparison logic runs entirely in the browser; no access data leaves the page during comparison, and it works even without AI enabled.

## Tech Stack

Built entirely on standard Salesforce metadata — no managed package, no Tooling API, no custom objects.

| Layer | Technology |
|---|---|
| UI | Salesforce Lightning Web Components (LWC) |
| Backend / Business Logic | Apex |
| Data Access | Standard Apex SOQL against Profile, PermissionSet, ObjectPermissions, FieldPermissions, SetupEntityAccess, RecordType, UserRole, PermissionSetGroup, and related objects |
| Metadata | Salesforce Metadata API (Profile, permission, and object metadata) |
| AI (optional) | Salesforce Prompt Builder / Agentforce — narrative comparison analysis |
| Dev Tooling | Salesforce VS Code Extension Pack, Salesforce CLI (SF CLI) |
| Source Control | Git & GitHub |
| AI-Assisted Development | Claude (Anthropic) |

## Documentation

| Document | Purpose |
|---|---|
| [PROBLEM_STATEMENT_AND_SOLUTION.md](PROBLEM_STATEMENT_AND_SOLUTION.md) | 1-pager: why this tool exists and what it solves |
| [PREREQUISITES.md](PREREQUISITES.md) | Everything needed before installing the component |
| [HOWTOUSE.md](HOWTOUSE.md) | Configuring and using the component after deployment |
| [DEPLOYMENT.md](DEPLOYMENT.md) | Step-by-step deployment guide (CLI, VS Code, Change Sets, manual package) |

## Repository Structure

```
force-app/main/default/
├── classes/
│   ├── ProfileAccessManagerController.cls
│   └── ProfileAccessManagerController.cls-meta.xml
└── lwc/profileAccessManager/
    ├── profileAccessManager.js
    ├── profileAccessManager.html
    ├── profileAccessManager.css
    └── profileAccessManager.js-meta.xml
```

## Quick Start

1. Review [PREREQUISITES.md](PREREQUISITES.md) — confirm org edition, API version, and permissions.
2. Follow [DEPLOYMENT.md](DEPLOYMENT.md) to deploy the Apex class and LWC to your org.
3. Follow [HOWTOUSE.md](HOWTOUSE.md) to add the component to a Tab/App Page and start using it.

## Security

This is a security-configuration visibility tool and should be restricted to System Administrators or a dedicated "Access Auditor" permission set. The Apex controller runs `with sharing`; the Access Comparison step is fully client-side; the only optional path where data leaves the org is the opt-in Agentforce narrative analysis. See [PREREQUISITES.md](PREREQUISITES.md) and [DEPLOYMENT.md](DEPLOYMENT.md) for full detail.
