# Access Comparator AI — Problem Statement & Solution

## The Problem

Salesforce admins and release managers routinely need to answer questions like:

- "What can this Profile actually access — objects, fields, Apex classes, VF pages, tabs, record types, custom permissions?"
- "Does this custom object's security (FLS, permission sets, sharing) match what we expect?"
- "Did UAT and Production drift apart after the last deployment — are Profiles and Permission Sets still in sync?"

Today, answering these requires:

- Manually clicking through **Setup → Profiles/Permission Sets → Object Settings → Field-Level Security** one object at a time, per profile.
- No native, single-screen way to see *all* permission dimensions (object, field, Apex, VF, tabs, apps, record types, custom permissions) for one or more profiles at once.
- No built-in way to **diff** access between two orgs (e.g., UAT vs. Production) — this is usually done by exporting Setup Audit Trail data or manually eyeballing two browser tabs side by side, which is slow and error-prone at scale (hundreds of profiles × thousands of fields).
- No exportable, shareable record of "what access looked like on date X" for audit or change-management purposes.

This is a recurring pain point during **release validation, security audits, and org-comparison exercises** (sandbox refresh checks, M&A org merges, compliance reviews).

## The Solution

**Access Comparator AI** is a single Lightning Web Component (`profileAccessManager`) + Apex controller that gives admins one screen to:

1. **Profile Access** — select one or more Profiles, retrieve their complete permission footprint (8 categories: Object Permissions, Field Permissions, Apex Class Access, Visualforce Access, Tab Visibility, Application Access, Record Type Access, Custom Permissions), and export it to Excel.

2. **Object Access** — browse by category (Standard Objects, Custom Objects, Apex Classes, Apex Triggers, Visualforce Pages, Flows & Processes), select items, and pull a full security bundle per object (Object Permissions, Field-Level Security, Permission Sets, Permission Set Groups, Role Hierarchy, Record Types, Record-Level Sharing) — with an explicit disclosure of what SOQL *cannot* see (Org-Wide Defaults, Sharing Rules, Tab Visibility).

3. **Access Comparison** — upload the Excel exports generated in the two tabs above from two different orgs (e.g., UAT and Production) and get an automatic, client-side diff: matching rows, differing permissions, and items missing on either side — with filters, sorting, pagination, and a re-exportable comparison workbook. An optional **Agentforce**-powered narrative summary can also be generated for a plain-English read of the differences.

### Why this approach

- **No data leaves the browser** for the comparison step — files are parsed and diffed client-side in the LWC, so it's safe for orgs with sensitive access data and works even without any AI feature enabled.
- **Built entirely on standard Apex SOQL** — no Tooling API, no managed package, no external dependency — so it deploys cleanly to any org regardless of edition.
- **Self-contained per tab** — Profile Access, Object Access, and Access Comparison do not share state, so each can be used independently.
- **Agentforce is optional** — if the org doesn't have it enabled, the "Analyze with Agentforce" button quietly disables itself after one failed attempt; the deterministic "Compare Access" path always works.

### Who this is for

- Salesforce Admins validating a release before/after deployment to Production.
- Security/compliance reviewers auditing what a Profile can actually touch.
- Consultants merging or migrating orgs who need a fast before/after access snapshot.
