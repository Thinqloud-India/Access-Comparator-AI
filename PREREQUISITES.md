# Prerequisites

Everything needed **before** installing/deploying the Access Comparator AI component.

## 1. Salesforce Org Requirements

| Requirement | Detail |
|---|---|
| Edition | Any edition that supports Lightning Web Components and Apex (Enterprise, Unlimited, Performance, or Developer Edition). Lightning Experience must be enabled — this is an LWC, it does not run in Classic. |
| API Version | 59.0 or later (org's `Metadata API` version must be ≥ 59.0). |
| Apex enabled | Standard — required to deploy `ProfileAccessManagerController.cls`. |
| My Domain | Must be enabled (required for all modern LWC deployments). |

## 2. Tooling Requirements (for deployment)

Pick **one** of the following:

- **Salesforce CLI (`sf` / `sfdx`)** — v2.x recommended, plus a connected/authenticated org (`sf org login web`).
- **VS Code + Salesforce Extension Pack** — for point-and-click deploy of individual metadata.
- **Change Sets** — if deploying between two orgs connected via a deployment connection (sandbox → sandbox, sandbox → production).
- **Any standard Salesforce DevOps/CI pipeline** (Copado, Gearset, Flosum, GitHub Actions + sf CLI, etc.) — the source is plain SFDX-format metadata and works with any of these unmodified.

## 3. Permissions Required to Deploy

The user/service account performing the deployment needs:

- **"Author Apex"** system permission.
- **"Customize Application"** system permission (to deploy Lightning Components).
- **Modify All Data** or equivalent deploy permission, depending on your deployment tooling (Metadata API deploy generally requires System Administrator profile or an equivalent permission set).

## 4. Permissions Required to *Use* the Component (post-deployment)

The end user placing/using this component needs:

| Data being read | Required access |
|---|---|
| Profiles, Permission Sets, Object/Field Permissions | View Setup and Configuration, or System Administrator profile. Standard user profiles typically cannot query `ObjectPermissions`/`FieldPermissions` for profiles they don't own — **System Administrator (or a profile with "View Setup and Configuration" + "Manage Users")** is recommended. |
| Apex Class / Visualforce Page access (`SetupEntityAccess`) | Same as above. |
| Roles (`UserRole`) | Standard read access — available to all authenticated users by default. |
| Record Types | Standard read access. |
| Record-level sharing (`<Object>Share`) | Read access to the object's Share table; users only see sharing rows they're permitted to see under `with sharing`. |
| Agentforce narrative analysis (optional) | See section 6 below. |

> **Recommendation:** Assign this component's Lightning App Page / Tab only to System Administrator or a dedicated "Access Auditor" permission set with the above Setup-read permissions — it is a security-configuration tool and should not be broadly exposed.

## 5. Source Code You Need

Two metadata components, both included in this repository:

```
force-app/main/default/classes/ProfileAccessManagerController.cls
force-app/main/default/classes/ProfileAccessManagerController.cls-meta.xml
force-app/main/default/lwc/profileAccessManager/profileAccessManager.js
force-app/main/default/lwc/profileAccessManager/profileAccessManager.html
force-app/main/default/lwc/profileAccessManager/profileAccessManager.css
force-app/main/default/lwc/profileAccessManager/profileAccessManager.js-meta.xml
```

No custom objects, custom fields, or custom metadata types are required — the component reads exclusively from standard Salesforce security metadata objects (`Profile`, `PermissionSet`, `ObjectPermissions`, `FieldPermissions`, `SetupEntityAccess`, `PermissionSetTabSetting`, `AppMenuItem`, `RecordType`, `UserRole`, `PermissionSetGroup`, `PermissionSetGroupComponent`, `FlowDefinitionView`, `ApexClass`, `ApexTrigger`, `ApexPage`).

## 6. Optional: Agentforce / Prompt Builder (only if using "Analyze with Agentforce")

The **Compare Access** feature works with **zero** additional setup. The optional AI narrative summary needs:

- Agentforce / Einstein Generative AI **enabled** in the org (Setup → Einstein → Generative AI).
- A **Prompt Template** named exactly **`AccessComparison_Analysis`** created in Setup → Prompt Builder, with a single text input variable named **`ComparisonData`**.
- The running user must have the **"Use Einstein Generative AI Features"** permission.

If any of the above is missing, the button fails gracefully once, disables itself for the session, and the rest of the component is unaffected — this is not a hard prerequisite for the tool as a whole.

## 7. Client-Side Requirements (for using the Access Comparison tab)

- Users must have previously generated the `.xls` exports from the **Profile Access** or **Object Access** tab of this same component — the comparison step only accepts files it generated itself (validated by worksheet name/headers on upload).
- A modern browser (Chrome, Edge, Firefox, Safari — anything with `DOMParser` and `FileReader` support, which is all current browsers).
