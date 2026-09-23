/**
 * @description Apex controller for the Profile Access Manager LWC.
 *              Tab 1 – Profile Access: getProfiles(), getProfileDetails()
 *              Tab 2 – Object Access : getStandardObjects(), getCustomObjects(), getApexClasses(),
 *                                      getApexTriggers(), getVfPages(), getFlows(),
 *                                      getObjectSecurityBundle()
 *                                      (Lightning Web Components / Aura Components / Workflow
 *                                      Rules are intentionally excluded — not queryable via
 *                                      standard Apex SOQL, Tooling API only)
 *              Tab 3 – Comparison   : analyzeWithAgentforce() (comparison itself runs client-side)
 *
 *              Each tab's methods are self-contained and do not share
 *              parameters or state with the other tabs.
 *
 * @author      Profile Access Manager
 * @apiVersion  59.0
 */
public with sharing class ProfileAccessManagerController {

    // ─────────────────────────────────────────────────────────────────────────
    // WRAPPER CLASSES – TAB 1 (unchanged)
    // ─────────────────────────────────────────────────────────────────────────

    public class ProfileWrapper {
        @AuraEnabled public String id          { get; set; }
        @AuraEnabled public String name        { get; set; }
        @AuraEnabled public String userLicense { get; set; }
    }

    public class ProfileDetailsWrapper {
        @AuraEnabled public String profileId             { get; set; }
        @AuraEnabled public String profileName           { get; set; }
        @AuraEnabled public String profileApiName        { get; set; }
        @AuraEnabled public String userLicense           { get; set; }
        @AuraEnabled public String description           { get; set; }
        @AuraEnabled public List<ObjectPermWrapper>    objectPerms      { get; set; }
        @AuraEnabled public List<FieldPermWrapper>     fieldPerms       { get; set; }
        @AuraEnabled public List<ApexClassWrapper>     apexClassAccess  { get; set; }
        @AuraEnabled public List<VFPageWrapper>        vfPageAccess     { get; set; }
        @AuraEnabled public List<TabVisibilityWrapper> tabVisibility    { get; set; }
        @AuraEnabled public List<AppVisibilityWrapper> appAccess        { get; set; }
        @AuraEnabled public List<RecordTypeWrapper>    recordTypeAccess { get; set; }
        @AuraEnabled public List<CustomPermWrapper>    customPerms      { get; set; }
        public ProfileDetailsWrapper() {
            objectPerms = new List<ObjectPermWrapper>(); fieldPerms = new List<FieldPermWrapper>();
            apexClassAccess = new List<ApexClassWrapper>(); vfPageAccess = new List<VFPageWrapper>();
            tabVisibility = new List<TabVisibilityWrapper>(); appAccess = new List<AppVisibilityWrapper>();
            recordTypeAccess = new List<RecordTypeWrapper>(); customPerms = new List<CustomPermWrapper>();
        }
    }

    public class ObjectPermWrapper {
        @AuraEnabled public String  profileName  { get; set; }
        @AuraEnabled public String  objectName   { get; set; }
        @AuraEnabled public Boolean canRead      { get; set; }
        @AuraEnabled public Boolean canCreate    { get; set; }
        @AuraEnabled public Boolean canEdit      { get; set; }
        @AuraEnabled public Boolean canDelete    { get; set; }
        @AuraEnabled public Boolean canViewAll   { get; set; }
        @AuraEnabled public Boolean canModifyAll { get; set; }
    }

    public class FieldPermWrapper {
        @AuraEnabled public String  profileName { get; set; }
        @AuraEnabled public String  objectName  { get; set; }
        @AuraEnabled public String  fieldName   { get; set; }
        @AuraEnabled public Boolean isReadable  { get; set; }
        @AuraEnabled public Boolean isEditable  { get; set; }
    }

    public class ApexClassWrapper {
        @AuraEnabled public String  profileName { get; set; }
        @AuraEnabled public String  className   { get; set; }
        @AuraEnabled public Boolean isEnabled   { get; set; }
    }

    public class VFPageWrapper {
        @AuraEnabled public String  profileName { get; set; }
        @AuraEnabled public String  pageName    { get; set; }
        @AuraEnabled public Boolean isEnabled   { get; set; }
    }

    public class TabVisibilityWrapper {
        @AuraEnabled public String profileName { get; set; }
        @AuraEnabled public String tabName     { get; set; }
        @AuraEnabled public String visibility  { get; set; }
    }

    public class AppVisibilityWrapper {
        @AuraEnabled public String  profileName { get; set; }
        @AuraEnabled public String  appName     { get; set; }
        @AuraEnabled public Boolean isVisible   { get; set; }
        @AuraEnabled public Boolean isDefault   { get; set; }
    }

    public class RecordTypeWrapper {
        @AuraEnabled public String  profileName    { get; set; }
        @AuraEnabled public String  objectName     { get; set; }
        @AuraEnabled public String  recordTypeName { get; set; }
        @AuraEnabled public Boolean isVisible      { get; set; }
        @AuraEnabled public Boolean isDefault      { get; set; }
    }

    public class CustomPermWrapper {
        @AuraEnabled public String  profileName     { get; set; }
        @AuraEnabled public String  permissionName  { get; set; }
        @AuraEnabled public String  permissionLabel { get; set; }
        @AuraEnabled public Boolean isEnabled       { get; set; }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // WRAPPER CLASSES – TAB 2 (rebuilt: category-driven, no profile dependency)
    // ─────────────────────────────────────────────────────────────────────────

    public class ObjectMeta {
        @AuraEnabled public String  label         { get; set; }
        @AuraEnabled public String  developerName { get; set; }
        @AuraEnabled public String  apiName       { get; set; }
        @AuraEnabled public Boolean isCustom      { get; set; }
    }

    /** Generic row for Apex Classes / Apex Triggers / LWC / Aura / VF Pages / Flows lists. */
    public class CategoryItem {
        @AuraEnabled public String name        { get; set; }
        @AuraEnabled public String apiVersion   { get; set; }
        @AuraEnabled public String status       { get; set; }
        @AuraEnabled public String processType  { get; set; }
    }

    public class ObjectLevelPermRow {
        @AuraEnabled public String  parentType  { get; set; } // 'Profile' | 'Permission Set'
        @AuraEnabled public String  parentName  { get; set; }
        @AuraEnabled public Boolean canRead      { get; set; }
        @AuraEnabled public Boolean canCreate    { get; set; }
        @AuraEnabled public Boolean canEdit      { get; set; }
        @AuraEnabled public Boolean canDelete    { get; set; }
        @AuraEnabled public Boolean canViewAll   { get; set; }
        @AuraEnabled public Boolean canModifyAll { get; set; }
    }

    public class FieldLevelSecRow {
        @AuraEnabled public String  fieldApiName { get; set; }
        @AuraEnabled public String  fieldLabel   { get; set; }
        @AuraEnabled public String  parentType   { get; set; } // 'Profile' | 'Permission Set'
        @AuraEnabled public String  parentName   { get; set; }
        @AuraEnabled public Boolean isReadable   { get; set; }
        @AuraEnabled public Boolean isEditable   { get; set; }
    }

    public class PermSetRow {
        @AuraEnabled public String  name         { get; set; }
        @AuraEnabled public Boolean canRead      { get; set; }
        @AuraEnabled public Boolean canCreate    { get; set; }
        @AuraEnabled public Boolean canEdit      { get; set; }
        @AuraEnabled public Boolean canDelete    { get; set; }
        @AuraEnabled public Boolean canViewAll   { get; set; }
        @AuraEnabled public Boolean canModifyAll { get; set; }
    }

    public class PermSetGroupRow {
        @AuraEnabled public String  groupLabel          { get; set; }
        @AuraEnabled public String  includedPermSetName { get; set; }
        @AuraEnabled public Boolean canRead              { get; set; }
        @AuraEnabled public Boolean canCreate            { get; set; }
        @AuraEnabled public Boolean canEdit              { get; set; }
        @AuraEnabled public Boolean canDelete            { get; set; }
        @AuraEnabled public Boolean canViewAll           { get; set; }
        @AuraEnabled public Boolean canModifyAll         { get; set; }
    }

    public class RoleRow {
        @AuraEnabled public String name           { get; set; }
        @AuraEnabled public String developerName  { get; set; }
        @AuraEnabled public String parentRoleName { get; set; }
    }

    public class RecordTypeRow {
        @AuraEnabled public String  name          { get; set; }
        @AuraEnabled public String  developerName { get; set; }
        @AuraEnabled public Boolean isActive      { get; set; }
    }

    public class RecordShareRow {
        @AuraEnabled public String userOrGroupId { get; set; }
        @AuraEnabled public String accessLevel   { get; set; }
        @AuraEnabled public String rowCause      { get; set; }
    }

    /** One fixed row in the "SOQL Security Limitations" disclosure table. Never carries a looked-up value. */
    public class SecurityLimitationRow {
        @AuraEnabled public String area        { get; set; }
        @AuraEnabled public String soqlSupport { get; set; } // 'Yes' | 'Partial' | 'No'
        @AuraEnabled public String result      { get; set; }
    }

    public class ObjectSecurityBundle {
        @AuraEnabled public String  objectApiName { get; set; }
        @AuraEnabled public String  objectLabel   { get; set; }
        @AuraEnabled public Boolean isCustom      { get; set; }
        @AuraEnabled public List<ObjectLevelPermRow>   objectPermissions   { get; set; }
        @AuraEnabled public List<FieldLevelSecRow>     fieldPermissions    { get; set; }
        @AuraEnabled public List<PermSetRow>           permissionSets      { get; set; }
        @AuraEnabled public List<PermSetGroupRow>      permissionSetGroups { get; set; }
        @AuraEnabled public List<RoleRow>              roleHierarchy       { get; set; }
        @AuraEnabled public List<RecordTypeRow>        recordTypes         { get; set; }
        @AuraEnabled public List<RecordShareRow>       recordLevelShares   { get; set; }
        @AuraEnabled public String                     recordShareNote     { get; set; }
        @AuraEnabled public List<SecurityLimitationRow> securityLimitations { get; set; }
        public ObjectSecurityBundle() {
            objectPermissions   = new List<ObjectLevelPermRow>();
            fieldPermissions    = new List<FieldLevelSecRow>();
            permissionSets      = new List<PermSetRow>();
            permissionSetGroups = new List<PermSetGroupRow>();
            roleHierarchy       = new List<RoleRow>();
            recordTypes         = new List<RecordTypeRow>();
            recordLevelShares   = new List<RecordShareRow>();
            securityLimitations = new List<SecurityLimitationRow>();
        }
    }

    /** One Profile or Permission Set that grants access to an Apex Class / Visualforce Page. */
    public class AccessGrantRow {
        @AuraEnabled public String parentType { get; set; } // 'Profile' | 'Permission Set'
        @AuraEnabled public String parentName { get; set; }
    }

    public class ComponentAccessBundle {
        @AuraEnabled public String componentName { get; set; }
        @AuraEnabled public String componentType { get; set; } // 'ApexClass' | 'ApexPage'
        @AuraEnabled public List<AccessGrantRow> accessGrants { get; set; }
        public ComponentAccessBundle() { accessGrants = new List<AccessGrantRow>(); }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // PRIVATE HELPERS
    // ─────────────────────────────────────────────────────────────────────────

    private class ObjectMetaComparator implements Comparator<ObjectMeta> {
        public Integer compare(ObjectMeta a, ObjectMeta b) { return a.label.compareTo(b.label); }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TAB 1 – PROFILE ACCESS  (independent: only reads Profile-linked data)
    // ─────────────────────────────────────────────────────────────────────────

    @AuraEnabled(cacheable=true)
    public static List<ProfileWrapper> getProfiles() {
        try {
            List<ProfileWrapper> result = new List<ProfileWrapper>();
            for (Profile p : [SELECT Id, Name, UserLicense.Name FROM Profile ORDER BY Name ASC LIMIT 500]) {
                ProfileWrapper pw = new ProfileWrapper();
                pw.id          = p.Id;
                pw.name        = p.Name;
                pw.userLicense = p.UserLicense != null ? p.UserLicense.Name : '';
                result.add(pw);
            }
            return result;
        } catch (Exception ex) {
            throw new AuraHandledException('Failed to load Profiles: ' + ex.getMessage());
        }
    }

    @AuraEnabled
    public static List<ProfileDetailsWrapper> getProfileDetails(List<Id> profileIds) {
        try {
            if (profileIds == null || profileIds.isEmpty()) throw new AuraHandledException('No profiles selected.');

            Map<Id, Profile> profileMap = new Map<Id, Profile>([
                SELECT Id, Name, Description, UserLicense.Name FROM Profile WHERE Id IN :profileIds
            ]);

            Map<Id, Id> profileToPermSet = new Map<Id, Id>();
            Map<Id, Id> permSetToProfile = new Map<Id, Id>();
            Set<Id>     permSetIds       = new Set<Id>();

            for (PermissionSet ps : [
                SELECT Id, ProfileId, Name FROM PermissionSet
                WHERE IsOwnedByProfile = true AND ProfileId IN :profileIds
            ]) {
                profileToPermSet.put(ps.ProfileId, ps.Id);
                permSetToProfile.put(ps.Id, ps.ProfileId);
                permSetIds.add(ps.Id);
            }

            Map<Id, ProfileDetailsWrapper> resultMap = new Map<Id, ProfileDetailsWrapper>();
            for (PermissionSet ps : [
                SELECT Id, ProfileId, Name FROM PermissionSet
                WHERE IsOwnedByProfile = true AND ProfileId IN :profileIds
            ]) {
                Profile p = profileMap.get(ps.ProfileId);
                if (p == null) continue;
                ProfileDetailsWrapper w = new ProfileDetailsWrapper();
                w.profileId = ps.ProfileId; w.profileName = p.Name; w.profileApiName = ps.Name;
                w.userLicense = p.UserLicense != null ? p.UserLicense.Name : '';
                w.description = p.Description;
                resultMap.put(ps.ProfileId, w);
            }

            for (ObjectPermissions op : [
                SELECT ParentId, SObjectType, PermissionsRead, PermissionsCreate, PermissionsEdit,
                       PermissionsDelete, PermissionsViewAllRecords, PermissionsModifyAllRecords
                FROM ObjectPermissions WHERE ParentId IN :permSetIds ORDER BY SObjectType ASC
            ]) {
                Id profId = permSetToProfile.get(op.ParentId); if (profId == null) continue;
                ProfileDetailsWrapper w = resultMap.get(profId);
                ObjectPermWrapper opw = new ObjectPermWrapper();
                opw.profileName = w.profileName; opw.objectName = op.SObjectType;
                opw.canRead = op.PermissionsRead; opw.canCreate = op.PermissionsCreate;
                opw.canEdit = op.PermissionsEdit; opw.canDelete = op.PermissionsDelete;
                opw.canViewAll = op.PermissionsViewAllRecords; opw.canModifyAll = op.PermissionsModifyAllRecords;
                w.objectPerms.add(opw);
            }

            for (FieldPermissions fp : [
                SELECT ParentId, SObjectType, Field, PermissionsRead, PermissionsEdit
                FROM FieldPermissions WHERE ParentId IN :permSetIds
                ORDER BY SObjectType, Field ASC LIMIT 50000
            ]) {
                Id profId = permSetToProfile.get(fp.ParentId); if (profId == null) continue;
                ProfileDetailsWrapper w = resultMap.get(profId);
                FieldPermWrapper fpw = new FieldPermWrapper();
                fpw.profileName = w.profileName; fpw.objectName = fp.SObjectType;
                String rawField = fp.Field;
                fpw.fieldName = rawField.contains('.') ? rawField.substringAfter('.') : rawField;
                fpw.isReadable = fp.PermissionsRead; fpw.isEditable = fp.PermissionsEdit;
                w.fieldPerms.add(fpw);
            }

            List<SetupEntityAccess> seaAll = [
                SELECT ParentId, SetupEntityId, SetupEntityType FROM SetupEntityAccess
                WHERE ParentId IN :permSetIds
                AND SetupEntityType IN ('ApexClass', 'ApexPage', 'CustomPermission')
            ];
            Set<Id> apexClassIds = new Set<Id>(); Set<Id> apexPageIds = new Set<Id>(); Set<Id> custPermIds = new Set<Id>();
            for (SetupEntityAccess sea : seaAll) {
                if      (sea.SetupEntityType == 'ApexClass')        apexClassIds.add(sea.SetupEntityId);
                else if (sea.SetupEntityType == 'ApexPage')         apexPageIds.add(sea.SetupEntityId);
                else if (sea.SetupEntityType == 'CustomPermission') custPermIds.add(sea.SetupEntityId);
            }
            Map<Id, String> apexClassNames = new Map<Id, String>(); Map<Id, String> apexPageNames = new Map<Id, String>();
            Map<Id, String> custPermNames = new Map<Id, String>(); Map<Id, String> custPermLabels = new Map<Id, String>();
            if (!apexClassIds.isEmpty()) for (ApexClass ac : [SELECT Id, Name FROM ApexClass WHERE Id IN :apexClassIds]) apexClassNames.put(ac.Id, ac.Name);
            if (!apexPageIds.isEmpty())  for (ApexPage ap  : [SELECT Id, Name FROM ApexPage  WHERE Id IN :apexPageIds])  apexPageNames.put(ap.Id, ap.Name);
            if (!custPermIds.isEmpty())  for (CustomPermission cp : [SELECT Id, DeveloperName, MasterLabel FROM CustomPermission WHERE Id IN :custPermIds]) { custPermNames.put(cp.Id, cp.DeveloperName); custPermLabels.put(cp.Id, cp.MasterLabel); }

            for (SetupEntityAccess sea : seaAll) {
                Id profId = permSetToProfile.get(sea.ParentId); if (profId == null) continue;
                ProfileDetailsWrapper w = resultMap.get(profId);
                if (sea.SetupEntityType == 'ApexClass') {
                    String cn = apexClassNames.get(sea.SetupEntityId); if (cn == null) continue;
                    ApexClassWrapper acw = new ApexClassWrapper(); acw.profileName = w.profileName; acw.className = cn; acw.isEnabled = true;
                    w.apexClassAccess.add(acw);
                } else if (sea.SetupEntityType == 'ApexPage') {
                    String pn = apexPageNames.get(sea.SetupEntityId); if (pn == null) continue;
                    VFPageWrapper vfw = new VFPageWrapper(); vfw.profileName = w.profileName; vfw.pageName = pn; vfw.isEnabled = true;
                    w.vfPageAccess.add(vfw);
                } else if (sea.SetupEntityType == 'CustomPermission') {
                    String cpN = custPermNames.get(sea.SetupEntityId); String cpL = custPermLabels.get(sea.SetupEntityId); if (cpN == null) continue;
                    CustomPermWrapper cpw = new CustomPermWrapper(); cpw.profileName = w.profileName; cpw.permissionName = cpN;
                    cpw.permissionLabel = cpL != null ? cpL : cpN; cpw.isEnabled = true;
                    w.customPerms.add(cpw);
                }
            }

            for (PermissionSetTabSetting tst : [SELECT ParentId, Name, Visibility FROM PermissionSetTabSetting WHERE ParentId IN :permSetIds ORDER BY Name ASC]) {
                Id profId = permSetToProfile.get(tst.ParentId); if (profId == null) continue;
                ProfileDetailsWrapper w = resultMap.get(profId);
                TabVisibilityWrapper tvw = new TabVisibilityWrapper(); tvw.profileName = w.profileName; tvw.tabName = tst.Name; tvw.visibility = tst.Visibility;
                w.tabVisibility.add(tvw);
            }

            Set<Id> permSetIdSet = new Set<Id>(permSetIds);
            List<SetupEntityAccess> appSeaList = [SELECT ParentId, SetupEntityId FROM SetupEntityAccess WHERE ParentId IN :permSetIdSet AND SetupEntityType = 'TabSet'];
            Set<Id> appEntityIds = new Set<Id>();
            for (SetupEntityAccess sea : appSeaList) appEntityIds.add(sea.SetupEntityId);
            // For SetupEntityType = 'TabSet', SetupEntityId is the App's Id, which joins to
            // AppMenuItem via ApplicationId — NOT AppMenuItem.Id (confirmed against a live org;
            // joining on Id silently matched zero rows, making Application Access always empty).
            Map<Id, String> appIdToName = new Map<Id, String>();
            if (!appEntityIds.isEmpty()) for (AppMenuItem ami : [SELECT ApplicationId, Name, Label FROM AppMenuItem WHERE ApplicationId IN :appEntityIds AND Type = 'TabSet' ORDER BY Name ASC]) appIdToName.put(ami.ApplicationId, String.isNotBlank(ami.Label) ? ami.Label : ami.Name);
            for (SetupEntityAccess sea : appSeaList) {
                Id profId = permSetToProfile.get(sea.ParentId); if (profId == null) continue;
                ProfileDetailsWrapper w = resultMap.get(profId);
                String appN = appIdToName.get(sea.SetupEntityId); if (appN == null) continue;
                AppVisibilityWrapper avw = new AppVisibilityWrapper(); avw.profileName = w.profileName; avw.appName = appN; avw.isVisible = true; avw.isDefault = false;
                w.appAccess.add(avw);
            }

            List<RecordType> allRTs = [SELECT Id, Name, SObjectType, IsActive FROM RecordType WHERE IsActive = true ORDER BY SObjectType, Name ASC LIMIT 2000];
            for (Id pid : profileIds) {
                ProfileDetailsWrapper w = resultMap.get(pid); if (w == null) continue;
                for (RecordType rt : allRTs) {
                    RecordTypeWrapper rtvw = new RecordTypeWrapper(); rtvw.profileName = w.profileName;
                    rtvw.objectName = rt.SObjectType; rtvw.recordTypeName = rt.Name; rtvw.isVisible = true; rtvw.isDefault = false;
                    w.recordTypeAccess.add(rtvw);
                }
            }

            List<ProfileDetailsWrapper> finalList = new List<ProfileDetailsWrapper>();
            for (Id pid : profileIds) if (resultMap.containsKey(pid)) finalList.add(resultMap.get(pid));
            return finalList;

        } catch (AuraHandledException ex) { throw ex;
        } catch (Exception ex) { throw new AuraHandledException('Error retrieving Profile details: ' + ex.getMessage()); }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TAB 2 – OBJECT ACCESS  (independent: no Profile parameters anywhere)
    // ─────────────────────────────────────────────────────────────────────────

    private static List<ObjectMeta> describeAllObjects() {
        List<ObjectMeta> result = new List<ObjectMeta>();
        Map<String, Schema.SObjectType> gd = Schema.getGlobalDescribe();
        for (String apiName : gd.keySet()) {
            try {
                Schema.DescribeSObjectResult dsr = gd.get(apiName).getDescribe();
                if (dsr.isQueryable() && !dsr.isDeprecatedAndHidden()) {
                    ObjectMeta m = new ObjectMeta();
                    m.label         = dsr.getLabel();
                    m.developerName = dsr.getName();
                    m.apiName       = dsr.getName();
                    m.isCustom      = dsr.isCustom();
                    result.add(m);
                }
            } catch (Exception ignored) {}
        }
        result.sort(new ObjectMetaComparator());
        return result;
    }

    @AuraEnabled(cacheable=true)
    public static List<ObjectMeta> getStandardObjects() {
        try {
            List<ObjectMeta> result = new List<ObjectMeta>();
            for (ObjectMeta m : describeAllObjects()) if (!m.isCustom) result.add(m);
            return result;
        } catch (Exception ex) { throw new AuraHandledException('Failed to load Standard Objects: ' + ex.getMessage()); }
    }

    @AuraEnabled(cacheable=true)
    public static List<ObjectMeta> getCustomObjects() {
        try {
            List<ObjectMeta> result = new List<ObjectMeta>();
            for (ObjectMeta m : describeAllObjects()) if (m.isCustom) result.add(m);
            return result;
        } catch (Exception ex) { throw new AuraHandledException('Failed to load Custom Objects: ' + ex.getMessage()); }
    }

    @AuraEnabled(cacheable=true)
    public static List<CategoryItem> getApexClasses() {
        try {
            List<CategoryItem> result = new List<CategoryItem>();
            for (ApexClass ac : [SELECT Name, ApiVersion, Status FROM ApexClass ORDER BY Name LIMIT 5000]) {
                CategoryItem ci = new CategoryItem();
                ci.name = ac.Name; ci.apiVersion = String.valueOf(ac.ApiVersion); ci.status = ac.Status;
                result.add(ci);
            }
            return result;
        } catch (Exception ex) { throw new AuraHandledException('Failed to load Apex Classes: ' + ex.getMessage()); }
    }

    @AuraEnabled(cacheable=true)
    public static List<CategoryItem> getApexTriggers() {
        try {
            List<CategoryItem> result = new List<CategoryItem>();
            for (ApexTrigger at : [SELECT Name, Status FROM ApexTrigger ORDER BY Name LIMIT 5000]) {
                CategoryItem ci = new CategoryItem();
                ci.name = at.Name; ci.status = at.Status;
                result.add(ci);
            }
            return result;
        } catch (Exception ex) { throw new AuraHandledException('Failed to load Apex Triggers: ' + ex.getMessage()); }
    }

    @AuraEnabled(cacheable=true)
    public static List<CategoryItem> getVfPages() {
        try {
            List<CategoryItem> result = new List<CategoryItem>();
            for (ApexPage p : [SELECT Name, ApiVersion FROM ApexPage ORDER BY Name LIMIT 5000]) {
                CategoryItem ci = new CategoryItem(); ci.name = p.Name; ci.apiVersion = String.valueOf(p.ApiVersion);
                result.add(ci);
            }
            return result;
        } catch (Exception ex) { throw new AuraHandledException('Failed to load Visualforce Pages: ' + ex.getMessage()); }
    }

    /**
     * Flows & Processes. FlowDefinition (the object named in the original spec) does not expose
     * Status/ProcessType to standard Apex SOQL. FlowDefinitionView does, without requiring the
     * Tooling API, so it is used here instead — same data, reliably queryable.
     */
    @AuraEnabled(cacheable=true)
    public static List<CategoryItem> getFlows() {
        try {
            List<CategoryItem> result = new List<CategoryItem>();
            // FlowDefinitionView does not support queryMore(), so it must be fetched as a single
            // list (one query round trip) rather than streamed via a SOQL for-loop, which batches
            // in groups of 200 and would request queryMore() once the org has more than that.
            List<FlowDefinitionView> flows = [
                SELECT Label, ProcessType, IsActive
                FROM FlowDefinitionView
                ORDER BY Label
                LIMIT 5000
            ];
            for (FlowDefinitionView fv : flows) {
                CategoryItem ci = new CategoryItem();
                ci.name = fv.Label;
                ci.processType = fv.ProcessType;
                ci.status = fv.IsActive ? 'Active' : 'Inactive';
                result.add(ci);
            }
            return result;
        } catch (Exception ex) { throw new AuraHandledException('Failed to load Flows & Processes: ' + ex.getMessage()); }
    }

    /**
     * Returns, for each selected Apex Class or Visualforce Page, the Profiles and Permission Sets
     * that grant access to it (via SetupEntityAccess). Apex Triggers are not covered — triggers
     * execute regardless of profile/permission-set access, so no such grant exists to report.
     * Flows are not covered either — flow access lives only in Profile metadata (flowAccesses),
     * which is not exposed through standard Apex SOQL.
     */
    @AuraEnabled
    public static List<ComponentAccessBundle> getComponentAccessDetails(String componentType, List<String> componentNames) {
        try {
            if (componentNames == null || componentNames.isEmpty()) {
                throw new AuraHandledException('No items selected.');
            }
            if (componentType != 'ApexClass' && componentType != 'ApexPage') {
                throw new AuraHandledException('Unsupported component type: ' + componentType);
            }

            Map<Id, String> entityIdToName = new Map<Id, String>();
            if (componentType == 'ApexClass') {
                for (ApexClass ac : [SELECT Id, Name FROM ApexClass WHERE Name IN :componentNames]) {
                    entityIdToName.put(ac.Id, ac.Name);
                }
            } else {
                for (ApexPage ap : [SELECT Id, Name FROM ApexPage WHERE Name IN :componentNames]) {
                    entityIdToName.put(ap.Id, ap.Name);
                }
            }
            if (entityIdToName.isEmpty()) throw new AuraHandledException('No matching components found.');

            Map<Id, String> profOwnedPsToProfileName = new Map<Id, String>();
            for (PermissionSet ps : [SELECT Id, Profile.Name FROM PermissionSet WHERE IsOwnedByProfile = true]) {
                if (ps.Profile != null) profOwnedPsToProfileName.put(ps.Id, ps.Profile.Name);
            }
            Map<Id, PermissionSet> standalonePs = new Map<Id, PermissionSet>([
                SELECT Id, Label FROM PermissionSet WHERE IsOwnedByProfile = false
            ]);

            Map<Id, List<AccessGrantRow>> byEntity = new Map<Id, List<AccessGrantRow>>();
            for (Id eid : entityIdToName.keySet()) byEntity.put(eid, new List<AccessGrantRow>());

            for (SetupEntityAccess sea : [
                SELECT ParentId, SetupEntityId
                FROM SetupEntityAccess
                WHERE SetupEntityType = :componentType AND SetupEntityId IN :entityIdToName.keySet()
            ]) {
                AccessGrantRow g = new AccessGrantRow();
                if (profOwnedPsToProfileName.containsKey(sea.ParentId)) {
                    g.parentType = 'Profile'; g.parentName = profOwnedPsToProfileName.get(sea.ParentId);
                } else if (standalonePs.containsKey(sea.ParentId)) {
                    g.parentType = 'Permission Set'; g.parentName = standalonePs.get(sea.ParentId).Label;
                } else { continue; }
                byEntity.get(sea.SetupEntityId).add(g);
            }

            List<ComponentAccessBundle> result = new List<ComponentAccessBundle>();
            for (Id eid : entityIdToName.keySet()) {
                ComponentAccessBundle b = new ComponentAccessBundle();
                b.componentName = entityIdToName.get(eid);
                b.componentType = componentType;
                b.accessGrants  = byEntity.get(eid);
                result.add(b);
            }
            return result;

        } catch (AuraHandledException ex) { throw ex;
        } catch (Exception ex) { throw new AuraHandledException('Failed to retrieve component access details: ' + ex.getMessage()); }
    }

    private static SecurityLimitationRow limRow(String area, String support, String result) {
        SecurityLimitationRow r = new SecurityLimitationRow();
        r.area = area; r.soqlSupport = support; r.result = result;
        return r;
    }

    private static List<SecurityLimitationRow> buildSecurityLimitations() {
        return new List<SecurityLimitationRow>{
            limRow('Object Permissions',   'Yes',     'Retrieved'),
            limRow('Field-Level Security', 'Yes',     'Retrieved'),
            limRow('Permission Sets',      'Yes',     'Retrieved'),
            limRow('Permission Set Groups','Yes',     'Retrieved'),
            limRow('Role Hierarchy',       'Partial', 'Structure only'),
            limRow('Record Types',         'Partial', 'Basic information'),
            limRow('Record-Level Sharing', 'Partial', 'Where supported'),
            limRow('Org-Wide Default (OWD)','No',     'Not Available Through SOQL'),
            limRow('Sharing Rules',        'No',      'Not Available Through SOQL'),
            limRow('Tab Visibility',       'No',      'Not Available Through SOQL')
        };
    }

    /**
     * Returns a full security bundle for each selected Standard/Custom Object, independent of
     * any Profile selection: Object Permissions, Field-Level Security, Permission Sets,
     * Permission Set Groups, Role Hierarchy (structure), Record Types, and Record-Level Sharing
     * (where a generic Share object exists). OWD, Sharing Rules and Tab Visibility are never
     * fetched or estimated — they only appear as fixed "Not Available Through SOQL" rows in
     * securityLimitations.
     */
    @AuraEnabled
    public static List<ObjectSecurityBundle> getObjectSecurityBundle(List<String> objectApiNames) {
        try {
            if (objectApiNames == null || objectApiNames.isEmpty()) {
                throw new AuraHandledException('No objects selected.');
            }

            Map<String, Schema.SObjectType> gd = Schema.getGlobalDescribe();
            Map<String, ObjectSecurityBundle> resultMap = new Map<String, ObjectSecurityBundle>();
            List<String> validApiNames = new List<String>();

            for (String apiName : objectApiNames) {
                if (String.isBlank(apiName) || !gd.containsKey(apiName.toLowerCase())) continue;
                Schema.DescribeSObjectResult dsr = gd.get(apiName.toLowerCase()).getDescribe();
                ObjectSecurityBundle b = new ObjectSecurityBundle();
                b.objectApiName = dsr.getName();
                b.objectLabel   = dsr.getLabel();
                b.isCustom      = dsr.isCustom();
                b.securityLimitations = buildSecurityLimitations();
                resultMap.put(dsr.getName(), b);
                validApiNames.add(dsr.getName());
            }
            if (validApiNames.isEmpty()) throw new AuraHandledException('No valid object API names supplied.');

            // ── Profile-owned Permission Sets → Profile Name, and standalone Permission Sets ──
            Map<Id, String> profOwnedPsToProfileName = new Map<Id, String>();
            for (PermissionSet ps : [SELECT Id, Profile.Name FROM PermissionSet WHERE IsOwnedByProfile = true]) {
                if (ps.Profile != null) profOwnedPsToProfileName.put(ps.Id, ps.Profile.Name);
            }
            Map<Id, PermissionSet> standalonePs = new Map<Id, PermissionSet>([
                SELECT Id, Label, PermissionSetGroupId FROM PermissionSet WHERE IsOwnedByProfile = false
            ]);
            Set<Id> allPsIds = new Set<Id>();
            allPsIds.addAll(profOwnedPsToProfileName.keySet());
            allPsIds.addAll(standalonePs.keySet());

            // ── Object-Level Permissions (Profile + Permission Set) ─────────────
            for (ObjectPermissions op : [
                SELECT ParentId, SObjectType, PermissionsRead, PermissionsCreate, PermissionsEdit,
                       PermissionsDelete, PermissionsViewAllRecords, PermissionsModifyAllRecords
                FROM ObjectPermissions
                WHERE SObjectType IN :validApiNames AND ParentId IN :allPsIds
            ]) {
                ObjectSecurityBundle b = resultMap.get(op.SObjectType);
                if (b == null) continue;
                ObjectLevelPermRow row = new ObjectLevelPermRow();
                if (profOwnedPsToProfileName.containsKey(op.ParentId)) {
                    row.parentType = 'Profile'; row.parentName = profOwnedPsToProfileName.get(op.ParentId);
                } else if (standalonePs.containsKey(op.ParentId)) {
                    row.parentType = 'Permission Set'; row.parentName = standalonePs.get(op.ParentId).Label;
                } else { continue; }
                row.canRead = op.PermissionsRead; row.canCreate = op.PermissionsCreate;
                row.canEdit = op.PermissionsEdit; row.canDelete = op.PermissionsDelete;
                row.canViewAll = op.PermissionsViewAllRecords; row.canModifyAll = op.PermissionsModifyAllRecords;
                b.objectPermissions.add(row);

                // Same row also feeds the dedicated Permission Sets tab (Permission Set only, not Profile).
                if (row.parentType == 'Permission Set') {
                    PermSetRow psRow = new PermSetRow();
                    psRow.name = row.parentName; psRow.canRead = row.canRead; psRow.canCreate = row.canCreate;
                    psRow.canEdit = row.canEdit; psRow.canDelete = row.canDelete;
                    psRow.canViewAll = row.canViewAll; psRow.canModifyAll = row.canModifyAll;
                    b.permissionSets.add(psRow);
                }
            }

            // ── Field-Level Security (Profile + Permission Set) ─────────────────
            Map<String, Map<String, Schema.SObjectField>> fieldsMapByObject = new Map<String, Map<String, Schema.SObjectField>>();
            for (String apiName : validApiNames) {
                try {
                    fieldsMapByObject.put(apiName.toLowerCase(), gd.get(apiName.toLowerCase()).getDescribe().fields.getMap());
                } catch (Exception ignored) {}
            }

            for (FieldPermissions fp : [
                SELECT ParentId, SObjectType, Field, PermissionsRead, PermissionsEdit
                FROM FieldPermissions
                WHERE SObjectType IN :validApiNames AND ParentId IN :allPsIds
                ORDER BY SObjectType, Field ASC
                LIMIT 20000
            ]) {
                ObjectSecurityBundle b = resultMap.get(fp.SObjectType);
                if (b == null) continue;
                FieldLevelSecRow row = new FieldLevelSecRow();
                String rawField = fp.Field;
                row.fieldApiName = rawField.contains('.') ? rawField.substringAfter('.') : rawField;
                row.fieldLabel   = row.fieldApiName;
                Map<String, Schema.SObjectField> fieldsMap = fieldsMapByObject.get(fp.SObjectType.toLowerCase());
                if (fieldsMap != null && fieldsMap.containsKey(row.fieldApiName)) {
                    row.fieldLabel = fieldsMap.get(row.fieldApiName).getDescribe().getLabel();
                }
                if (profOwnedPsToProfileName.containsKey(fp.ParentId)) {
                    row.parentType = 'Profile'; row.parentName = profOwnedPsToProfileName.get(fp.ParentId);
                } else if (standalonePs.containsKey(fp.ParentId)) {
                    row.parentType = 'Permission Set'; row.parentName = standalonePs.get(fp.ParentId).Label;
                } else { continue; }
                row.isReadable = fp.PermissionsRead; row.isEditable = fp.PermissionsEdit;
                b.fieldPermissions.add(row);
            }

            // ── Permission Set Groups (one row per group + included Permission Set) ───
            Map<Id, String> groupLabels = new Map<Id, String>();
            for (PermissionSetGroup psg : [SELECT Id, MasterLabel FROM PermissionSetGroup]) {
                groupLabels.put(psg.Id, psg.MasterLabel);
            }
            if (!groupLabels.isEmpty()) {
                Map<Id, Set<Id>> groupToMemberPs = new Map<Id, Set<Id>>();
                Map<Id, String>  memberPsNames    = new Map<Id, String>();
                for (PermissionSetGroupComponent comp : [
                    SELECT PermissionSetGroupId, PermissionSetId, PermissionSet.Name
                    FROM PermissionSetGroupComponent
                    WHERE PermissionSetGroupId IN :groupLabels.keySet()
                ]) {
                    if (!groupToMemberPs.containsKey(comp.PermissionSetGroupId)) {
                        groupToMemberPs.put(comp.PermissionSetGroupId, new Set<Id>());
                    }
                    groupToMemberPs.get(comp.PermissionSetGroupId).add(comp.PermissionSetId);
                    memberPsNames.put(comp.PermissionSetId, comp.PermissionSet.Name);
                }

                Set<Id> allMemberPsIds = new Set<Id>();
                for (Set<Id> s : groupToMemberPs.values()) allMemberPsIds.addAll(s);

                Map<String, ObjectPermissions> memberObjPerm = new Map<String, ObjectPermissions>();
                if (!allMemberPsIds.isEmpty()) {
                    for (ObjectPermissions op : [
                        SELECT ParentId, SObjectType, PermissionsRead, PermissionsCreate, PermissionsEdit,
                               PermissionsDelete, PermissionsViewAllRecords, PermissionsModifyAllRecords
                        FROM ObjectPermissions
                        WHERE SObjectType IN :validApiNames AND ParentId IN :allMemberPsIds
                    ]) {
                        memberObjPerm.put(op.ParentId + '|' + op.SObjectType, op);
                    }
                }

                Set<String> seenGroupSetObj = new Set<String>();
                for (Id groupId : groupToMemberPs.keySet()) {
                    for (Id memberPsId : groupToMemberPs.get(groupId)) {
                        for (String apiName : validApiNames) {
                            String dedupeKey = groupId + '|' + memberPsId + '|' + apiName;
                            if (seenGroupSetObj.contains(dedupeKey)) continue;
                            ObjectPermissions op = memberObjPerm.get(memberPsId + '|' + apiName);
                            if (op == null) continue;
                            seenGroupSetObj.add(dedupeKey);
                            ObjectSecurityBundle b = resultMap.get(apiName);
                            if (b == null) continue;
                            PermSetGroupRow row = new PermSetGroupRow();
                            row.groupLabel = groupLabels.get(groupId);
                            row.includedPermSetName = memberPsNames.get(memberPsId);
                            row.canRead = op.PermissionsRead; row.canCreate = op.PermissionsCreate;
                            row.canEdit = op.PermissionsEdit; row.canDelete = op.PermissionsDelete;
                            row.canViewAll = op.PermissionsViewAllRecords; row.canModifyAll = op.PermissionsModifyAllRecords;
                            b.permissionSetGroups.add(row);
                        }
                    }
                }
            }

            // ── Role Hierarchy Structure (shared across all selected objects) ───
            List<RoleRow> roleRows = new List<RoleRow>();
            for (UserRole ur : [SELECT Name, DeveloperName, ParentRoleId, ParentRole.Name FROM UserRole ORDER BY Name LIMIT 2000]) {
                RoleRow rr = new RoleRow();
                rr.name = ur.Name; rr.developerName = ur.DeveloperName;
                rr.parentRoleName = ur.ParentRole != null ? ur.ParentRole.Name : null;
                roleRows.add(rr);
            }
            for (ObjectSecurityBundle b : resultMap.values()) b.roleHierarchy = roleRows;

            // ── Record Types ─────────────────────────────────────────────────
            for (RecordType rt : [
                SELECT Name, DeveloperName, SObjectType, IsActive
                FROM RecordType
                WHERE SObjectType IN :validApiNames
                ORDER BY SObjectType, Name ASC
            ]) {
                ObjectSecurityBundle b = resultMap.get(rt.SObjectType);
                if (b == null) continue;
                RecordTypeRow row = new RecordTypeRow();
                row.name = rt.Name; row.developerName = rt.DeveloperName; row.isActive = rt.IsActive;
                b.recordTypes.add(row);
            }

            // ── Record-Level Sharing (only where a generic <Object>Share table exists) ──
            for (String apiName : validApiNames) {
                ObjectSecurityBundle b = resultMap.get(apiName);
                String shareObjName = apiName.endsWithIgnoreCase('__c')
                    ? apiName.substring(0, apiName.length() - 3) + '__Share'
                    : apiName + 'Share';

                if (!gd.containsKey(shareObjName.toLowerCase())) {
                    b.recordShareNote = 'No generic Share object for this object (fully public sharing model, or a standard object without a queryable Share table).';
                    continue;
                }
                try {
                    // Custom object Share tables use a field literally named "AccessLevel", but several
                    // standard objects (Account, Opportunity, Case, Contact, Lead, Campaign, ...) instead
                    // use "<ObjectName>AccessLevel". Resolve the actual field name via describe rather
                    // than assuming one or the other.
                    String accessLevelField = 'AccessLevel';
                    Map<String, Schema.SObjectField> shareFields = gd.get(shareObjName.toLowerCase()).getDescribe().fields.getMap();
                    if (!shareFields.containsKey('accesslevel')) {
                        for (String fname : shareFields.keySet()) {
                            if (fname.endsWithIgnoreCase('accesslevel')) {
                                accessLevelField = shareFields.get(fname).getDescribe().getName();
                                break;
                            }
                        }
                    }

                    List<SObject> shares = Database.query(
                        'SELECT UserOrGroupId, ' + accessLevelField + ', RowCause FROM ' + shareObjName + ' LIMIT 200'
                    );
                    for (SObject so : shares) {
                        RecordShareRow row = new RecordShareRow();
                        row.userOrGroupId = String.valueOf(so.get('UserOrGroupId'));
                        row.accessLevel   = String.valueOf(so.get(accessLevelField));
                        try { row.rowCause = String.valueOf(so.get('RowCause')); } catch (Exception ignored) {}
                        b.recordLevelShares.add(row);
                    }
                    if (shares.isEmpty()) {
                        b.recordShareNote = 'No explicit share records found for this object.';
                    }
                } catch (Exception ex) {
                    b.recordShareNote = 'Share table exists but could not be queried: ' + ex.getMessage();
                }
            }

            List<ObjectSecurityBundle> finalList = new List<ObjectSecurityBundle>();
            for (String apiName : validApiNames) if (resultMap.containsKey(apiName)) finalList.add(resultMap.get(apiName));
            return finalList;

        } catch (AuraHandledException ex) { throw ex;
        } catch (Exception ex) { throw new AuraHandledException('Failed to retrieve object security details: ' + ex.getMessage()); }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TAB 3 – ACCESS COMPARISON  (independent: only reads uploaded file JSON)
    // Comparison itself now runs entirely client-side in the LWC (see
    // profileAccessManager.js _compareGenericLocal) for both Object Access and
    // Profile Access — no Apex round trip, no risk of the 6MB synchronous heap
    // limit on large exports. Only Agentforce analysis still calls into Apex.
    //
    // Agentforce is an OPTIONAL, org-specific dependency, not a required one:
    //  - ConnectApi.EinsteinLLM / EinsteinPromptTemplateGenerationsInput are core system-namespace
    //    Apex types present in every org regardless of edition or licensing, so this class always
    //    compiles and deploys cleanly whether or not the target org has Agentforce enabled — there
    //    is no packaged/managed dependency here to break a deployment.
    //  - The Prompt Template name below ("AccessComparison_Analysis") is admin-created Setup
    //    metadata that cannot be deployed as part of this component; every org that wants this
    //    feature must create it once via Setup → Prompt Builder (see the setup checklist below).
    //  - If Agentforce/Prompt Builder isn't enabled, or the template doesn't exist yet in this org,
    //    the call below throws at RUNTIME (never at compile/deploy time) and is caught here, so the
    //    rest of the component — Profile Access, Object Access, and Access Comparison — is entirely
    //    unaffected. The LWC additionally remembers a failure for the session and stops offering the
    //    "Analyze with Agentforce" button once this has happened, so the user is never shown the
    //    same known failure twice.
    // ─────────────────────────────────────────────────────────────────────────

    @AuraEnabled
    public static String analyzeWithAgentforce(String comparisonJson) {
        try {
            ConnectApi.EinsteinPromptTemplateGenerationsInput templateInput =
                new ConnectApi.EinsteinPromptTemplateGenerationsInput();
            templateInput.isPreview = false;
            // Required — without an applicationName, generateMessagesForPromptTemplate fails with
            // a generic "Failed to generate Einstein LLM generations response" and no further
            // detail, even when the template, model, and running-user permissions are all correct.
            templateInput.additionalConfig = new ConnectApi.EinsteinLlmAdditionalConfigInput();
            templateInput.additionalConfig.applicationName = 'PromptBuilderPreview';

            ConnectApi.WrappedValue dataValue = new ConnectApi.WrappedValue();
            dataValue.value = comparisonJson;

            Map<String, ConnectApi.WrappedValue> inputParams = new Map<String, ConnectApi.WrappedValue>();
            inputParams.put('Input:ComparisonData', dataValue);
            templateInput.inputParams = inputParams;

            ConnectApi.EinsteinPromptTemplateGenerationsRepresentation response =
                ConnectApi.EinsteinLLM.generateMessagesForPromptTemplate(
                    'AccessComparison_Analysis',
                    templateInput
                );

            if (response != null && response.generations != null && !response.generations.isEmpty()) {
                String text = response.generations[0].text;
                if (String.isNotBlank(text)) return text;
            }
            return 'Agentforce returned an empty response. Verify the Prompt Template "AccessComparison_Analysis" is Active and the "ComparisonData" input is mapped correctly.';

        } catch (ConnectApi.ConnectApiException ex) {
            throw new AuraHandledException(
                'Agentforce Prompt Builder error: ' + ex.getMessage() + '\n\n'
                + 'Setup checklist:\n'
                + '  1. Enable Agentforce in Setup → Einstein → Generative AI\n'
                + '  2. Create Prompt Template "AccessComparison_Analysis" in Setup → Prompt Builder\n'
                + '  3. Add Text input "ComparisonData" to the template\n'
                + '  4. Grant running user "Use Einstein Generative AI Features" permission\n\n'
                + 'Use "Compare Access" for orgs without Agentforce.'
            );
        } catch (AuraHandledException ex) { throw ex;
        } catch (Exception ex) {
            throw new AuraHandledException('Agentforce analysis failed: ' + ex.getMessage() + '\nUse "Compare Access" for orgs without Agentforce.');
        }
    }
}