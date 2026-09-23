# Deployment Guide

Step-by-step guide to deploy `Access Comparator AI` (the `profileAccessManager` LWC + `ProfileAccessManagerController` Apex class) into a Salesforce org.

Before starting, confirm you meet everything in `PREREQUISITES.md`.

---

## Option A — Deploy with Salesforce CLI (recommended)

### Step 1: Install the Salesforce CLI

```bash
npm install --global @salesforce/cli
sf --version
```

### Step 2: Clone / obtain this repository

```bash
git clone <this-repo-url>
cd Access-Comparator-AI
```

If the repo does not yet have an `sfdx-project.json`, create one at the repo root so the CLI recognizes it as a project:

```json
{
  "packageDirectories": [
    { "path": "force-app", "default": true }
  ],
  "namespace": "",
  "sourceApiVersion": "59.0"
}
```

### Step 3: Authenticate to the target org

```bash
# Sandbox / UAT
sf org login web --alias uat --instance-url https://test.salesforce.com

# Production
sf org login web --alias prod --instance-url https://login.salesforce.com
```

### Step 4: Validate the deployment (dry run — recommended for Production)

```bash
sf project deploy validate --source-dir force-app/main/default --target-org uat
```

Fix any validation errors (see **Troubleshooting** below) before proceeding.

### Step 5: Deploy

```bash
sf project deploy start --source-dir force-app/main/default --target-org uat
```

Expected deployed components:
- `ApexClass: ProfileAccessManagerController`
- `LightningComponentBundle: profileAccessManager`

### Step 6: Run Apex tests (Production requirement)

Production deployments require test coverage. If no test class exists yet for `ProfileAccessManagerController`, add one before deploying to Production — Salesforce requires ≥75% org-wide coverage and every deployed class should have dedicated tests. See **Step 6a** below.

```bash
sf apex run test --target-org prod --test-level RunLocalTests --wait 10
```

### Step 6a: (If missing) Add a minimal Apex test class

Create `force-app/main/default/classes/ProfileAccessManagerControllerTest.cls` covering at minimum:
- `getProfiles()`
- `getProfileDetails(List<Id>)`
- `getStandardObjects()` / `getCustomObjects()`
- `getApexClasses()` / `getApexTriggers()` / `getVfPages()` / `getFlows()`
- `getObjectSecurityBundle(List<String>)`
- `getComponentAccessDetails(String, List<String>)`
- Negative cases (empty/blank input throwing `AuraHandledException`)

Deploy this test class the same way as Step 5, then re-run Step 6.

### Step 7: Deploy to Production

Once validated in a sandbox and tests pass:

```bash
sf project deploy start --source-dir force-app/main/default --target-org prod --test-level RunLocalTests
```

---

## Option B — Deploy with VS Code + Salesforce Extension Pack

1. Install **Visual Studio Code** and the **Salesforce Extension Pack** from the VS Code Marketplace.
2. Open the `Access-Comparator-AI` folder in VS Code (ensure it has an `sfdx-project.json` — see Option A, Step 2).
3. `Ctrl+Shift+P` → **SFDX: Authorize an Org** → select environment (Production/Sandbox) → log in → set an org alias.
4. Right-click `force-app/main/default/classes/ProfileAccessManagerController.cls` → **SFDX: Deploy Source to Org**.
5. Right-click `force-app/main/default/lwc/profileAccessManager` → **SFDX: Deploy Source to Org**.
6. Confirm both show a green checkmark / "Deploy Succeeded" in the Output panel.

---

## Option C — Deploy with Change Sets (org-to-org, no CLI)

Use this if source and target orgs already have a deployment connection (e.g., sandbox → production).

1. In the **source** org: Setup → **Outbound Change Sets** → **New**.
2. Name it, e.g. `AccessComparatorAI_v1`.
3. **Add** → Component Type: **Apex Class** → select `ProfileAccessManagerController`.
4. **Add** → Component Type: **Lightning Web Component** → select `profileAccessManager`.
5. **Upload** the change set, selecting the target org.
6. In the **target** org: Setup → **Inbound Change Sets** → find the uploaded set → **Validate** (and optionally run tests), then **Deploy**.

---

## Option D — Manual / Unmanaged Package (quick trial only)

Not recommended for real projects, but useful for a fast personal-org trial:

1. Zip the `force-app/main/default` folder contents preserving the `classes/` and `lwc/` subfolders, plus a `package.xml` manifest (see below).
2. Use **Workbench** (workbench.developerforce.com) → **Migration** → **Deploy** → upload the zip → Deploy.

Example `package.xml`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<Package xmlns="http://soap.sforce.com/2006/04/metadata">
    <types>
        <members>ProfileAccessManagerController</members>
        <name>ApexClass</name>
    </types>
    <types>
        <members>profileAccessManager</members>
        <name>LightningComponentBundle</name>
    </types>
    <version>59.0</version>
</Package>
```

---

## Post-Deployment Checklist

- [ ] `ProfileAccessManagerController` shows **Active** status under Setup → Apex Classes.
- [ ] `profileAccessManager` appears under Setup → Lightning Components.
- [ ] Component added to a Tab / App Page / Home Page (see `HOWTOUSE.md` §1).
- [ ] Tab/Page visibility restricted to the intended admin/audit users (see `HOWTOUSE.md` §2).
- [ ] Smoke test: open the component as a System Administrator user, confirm the Profile Access tab loads the org's Profile list without errors.
- [ ] Smoke test: select 1 profile → Get Profile Details → confirm results render and Generate Excel downloads a file.
- [ ] Smoke test: Object Access tab → select 1 standard object → Analyze Object Security → confirm results render.
- [ ] *(Optional)* If using Agentforce analysis, confirm the `AccessComparison_Analysis` Prompt Template exists and is Active (see `PREREQUISITES.md` §6).

---

## Troubleshooting

| Symptom | Likely Cause | Fix |
|---|---|---|
| Deploy fails: "Invalid type: LightningComponentBundle" | API version mismatch or My Domain not enabled | Confirm org API version ≥ 59.0 and My Domain is active |
| Deploy fails on Production: coverage below 75% | No test class deployed with the Apex controller | Add `ProfileAccessManagerControllerTest.cls` (Step 6a) before deploying |
| Component doesn't appear in App Builder's component list | Deployment didn't include the LWC bundle, or `isExposed` is false | Confirm `profileAccessManager.js-meta.xml` deployed and `isExposed=true` |
| "Insufficient Privileges" when opening the tab | User's Profile/Permission Set lacks visibility to the Tab/App Page | Grant tab visibility per `HOWTOUSE.md` §2 |
| Profile list loads empty or errors | Running user's profile lacks "View Setup and Configuration" | Use a System Administrator (or equivalent) user — see `PREREQUISITES.md` §4 |
| "Analyze with Agentforce" always fails | Agentforce not enabled, or Prompt Template missing/misnamed | Follow `PREREQUISITES.md` §6 exactly — template name must be `AccessComparison_Analysis` with input `ComparisonData` |
| Upload in Access Comparison tab rejected | File wasn't generated by this component, or wrong Comparison Type selected | Re-export from Tab 1/2 of this component and match the Comparison Type to the file's origin tab |
