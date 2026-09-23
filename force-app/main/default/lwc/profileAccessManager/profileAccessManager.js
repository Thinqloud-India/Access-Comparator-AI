// profileAccessManager.js
import { LightningElement, track } from 'lwc';
import getProfiles           from '@salesforce/apex/ProfileAccessManagerController.getProfiles';
import getProfileDetails     from '@salesforce/apex/ProfileAccessManagerController.getProfileDetails';
import getStandardObjects    from '@salesforce/apex/ProfileAccessManagerController.getStandardObjects';
import getCustomObjects      from '@salesforce/apex/ProfileAccessManagerController.getCustomObjects';
import getApexClasses        from '@salesforce/apex/ProfileAccessManagerController.getApexClasses';
import getApexTriggers       from '@salesforce/apex/ProfileAccessManagerController.getApexTriggers';
import getVfPages            from '@salesforce/apex/ProfileAccessManagerController.getVfPages';
import getFlows              from '@salesforce/apex/ProfileAccessManagerController.getFlows';
import getObjectSecurityBundle from '@salesforce/apex/ProfileAccessManagerController.getObjectSecurityBundle';
import getComponentAccessDetails from '@salesforce/apex/ProfileAccessManagerController.getComponentAccessDetails';
import analyzeWithAgentforce from '@salesforce/apex/ProfileAccessManagerController.analyzeWithAgentforce';

const TOAST_MS = 6000;
const COMP_PAGE_SIZE = 200; // default page size — comparison results can be tens of thousands of rows, user-adjustable

const CATEGORY_LABELS = {
    standardObjects: 'Standard Objects',
    customObjects:   'Custom Objects',
    apexClasses:     'Apex Classes',
    apexTriggers:    'Apex Triggers',
    vfPages:         'Visualforce Pages',
    flows:           'Flows & Processes'
};

const CATEGORY_FILTERS = {
    standardObjects: [],
    customObjects:   [],
    apexClasses:     ['status', 'apiVersion'],
    apexTriggers:    ['status'],
    vfPages:         ['apiVersion'],
    flows:           ['status', 'processType']
};

const CATEGORY_APEX = {
    standardObjects: getStandardObjects,
    customObjects:   getCustomObjects,
    apexClasses:     getApexClasses,
    apexTriggers:    getApexTriggers,
    vfPages:         getVfPages,
    flows:           getFlows
};

// Lightning Web Components / Aura Components are intentionally excluded — LightningComponentBundle
// and AuraDefinitionBundle are Tooling-API-only and not queryable via standard Apex SOQL.
const CATEGORY_GROUPS = [
    { key: 'objects',     label: 'Objects',     items: ['standardObjects', 'customObjects'] },
    { key: 'apex',        label: 'Apex',        items: ['apexClasses', 'apexTriggers'] },
    { key: 'visualforce', label: 'Visualforce', items: ['vfPages'] },
    { key: 'automation',  label: 'Automation',  items: ['flows'] }
];

// Only these two categories have a real, SOQL-backed "who has access" answer (via SetupEntityAccess).
// Apex Triggers execute regardless of profile access (no grant exists to report); Flow access lives
// only in Profile metadata (flowAccesses), not standard SOQL — neither gets an Analyze Access button.
const ACCESS_COMPONENT_TYPE = {
    apexClasses: 'ApexClass',
    vfPages:     'ApexPage'
};

const SUB_TABS = [
    { key: 'objPerms',      label: 'Object Permissions' },
    { key: 'fls',           label: 'Field-Level Security' },
    { key: 'permSets',      label: 'Permission Sets' },
    { key: 'permSetGroups', label: 'Permission Set Groups' },
    { key: 'roles',         label: 'Role Hierarchy' },
    { key: 'recordTypes',   label: 'Record Types' },
    { key: 'recordShare',   label: 'Record-Level Access' },
    { key: 'limitations',   label: 'Security Limitations' }
];

const PROFILE_SUB_TABS = [
    { key: 'objectPerms', label: 'Object Permissions' },
    { key: 'fieldPerms',  label: 'Field Permissions' },
    { key: 'apexClass',   label: 'Apex Class Access' },
    { key: 'vfPage',      label: 'Visualforce Access' },
    { key: 'tabVis',      label: 'Tab Visibility' },
    { key: 'appAccess',   label: 'Application Access' },
    { key: 'recordType',  label: 'Record Type Access' },
    { key: 'customPerm',  label: 'Custom Permissions' }
];

export default class ProfileAccessManager extends LightningElement {

    // ─── TAB STATE ───────────────────────────────────────────────────────────
    @track activeTab = 'profile'; // 'profile' | 'object' | 'comparison'

    get isTab1() { return this.activeTab === 'profile'; }
    get isTab2() { return this.activeTab === 'object'; }
    get isTab3() { return this.activeTab === 'comparison'; }
    get tab1Class() { return 'pam-tab-btn' + (this.isTab1 ? ' active' : ''); }
    get tab2Class() { return 'pam-tab-btn' + (this.isTab2 ? ' active' : ''); }
    get tab3Class() { return 'pam-tab-btn' + (this.isTab3 ? ' active' : ''); }

    handleTabClick(e) { this.activeTab = e.currentTarget.dataset.tab; }

    // Header icon/subtitle adapt to the active tab so the banner never describes the wrong feature.
    get headerIconName() {
        if (this.isTab2) return 'standard:entity';
        if (this.isTab3) return 'utility:compare';
        return 'standard:profile';
    }
    get headerSubtitle() {
        if (this.isTab2) return 'Analyze security for Objects, Apex Classes/Triggers, Visualforce Pages, and Flows.';
        if (this.isTab3) return 'Compare UAT vs Production access and review the differences.';
        return 'Search, select and export complete permission details for any Salesforce Profile.';
    }

    // ═════════════════════════════════════════════════════════════════════════
    // TAB 1 STATE – PROFILE ACCESS (used only inside Tab 1)
    // ═════════════════════════════════════════════════════════════════════════
    @track profiles       = [];
    @track searchTerm     = '';
    @track isWorking      = false;
    @track profilesLoaded = false;
    @track loadError      = '';

    @track profileDetailsResults = [];
    @track showProfileResults    = false;
    _lastAnalyzedProfileIds = null; // Set of profile Ids the results currently on screen reflect

    // ═════════════════════════════════════════════════════════════════════════
    // TAB 2 STATE – OBJECT ACCESS (used only inside Tab 2, no profile fields here)
    // ═════════════════════════════════════════════════════════════════════════
    @track activeCategory            = 'standardObjects';
    @track categorySearchTerm        = '';
    @track categoryStatusFilter      = 'All';
    @track categoryApiVersionFilter  = 'All';
    @track categoryProcessTypeFilter = 'All';
    @track objSortField              = null;
    @track objSortDir                = 'asc';
    @track isCategoryLoading         = false;
    _categoryCache = {}; // categoryKey -> normalized item array (reassigned wholesale to stay reactive)

    @track objSecurityResults      = [];
    @track showObjResults          = false;
    @track isLoadingObjSecurity    = false;
    _lastAnalyzedObjectApiNames = null; // Set of object API names the results currently on screen reflect

    @track componentAccessResults   = [];
    @track showComponentAccess      = false;
    @track isLoadingComponentAccess = false;
    _lastAnalyzedComponentKey = null; // "<category>|<sorted,comma,names>" the results currently on screen reflect

    // ═════════════════════════════════════════════════════════════════════════
    // TAB 3 STATE – ACCESS COMPARISON (used only inside Tab 3)
    // ═════════════════════════════════════════════════════════════════════════
    @track comparisonType = 'Profile Access'; // 'Profile Access' | 'Object Access'
    @track uatFileName   = '';
    @track prodFileName  = '';
    @track uatValid      = false;
    @track prodValid     = false;
    @track uatError      = '';
    @track prodError     = '';
    _uatData  = null;
    _prodData = null;
    @track compResults       = [];
    @track filteredComp      = [];
    @track compSummary       = null;
    @track showCompResults   = false;
    @track isComparing       = false;
    @track compStatusFilter  = 'All';
    @track compProfileFilter = 'All';
    @track compObjectSearch  = '';
    @track compSortField     = null;
    @track compSortDir       = 'asc';
    @track compPage          = 1;
    @track compPageSize      = COMP_PAGE_SIZE;
    @track agentforceVerdict  = null;
    @track agentforceSummary  = null;
    // Full (unfiltered) result set for this Agentforce run, plus its own independent filter/sort/
    // pagination state — deliberately separate from compResults/filteredComp so this table never
    // affects (or is affected by) the Compare Access table above it.
    @track agentforceRows          = [];
    @track agentforceFilteredRows  = [];
    @track agentforceStatusFilter  = 'All';
    @track agentforceProfileFilter = 'All';
    @track agentforceObjectSearch  = '';
    @track agentforceSortField     = null;
    @track agentforceSortDir       = 'asc';
    @track agentforcePage          = 1;
    @track agentforcePageSize      = COMP_PAGE_SIZE;
    // Optimistic default — Agentforce/Prompt Builder availability can only be known for certain by
    // actually calling it (a proactive pre-check would either guess at undocumented org metadata or
    // waste a real LLM call just to probe). The first real failure flips this to false so the button
    // stops being offered for the rest of the session instead of repeatedly failing the same way.
    @track agentforceAvailable        = true;
    @track agentforceUnavailableReason = '';
    @track showAgentforce    = false;
    @track isAgentforcing    = false;

    // ─── TOAST (shared UI utility, not tab-specific state) ─────────────────────
    @track toastVisible = false;
    @track toastTitle   = '';
    @track toastMessage = '';
    @track toastType    = 'success';
    _toastTimer = null;

    // ═════════════════════════════════════════════════════════════════════════
    // LIFECYCLE
    // Each tab's initial data is loaded independently, in parallel. Neither
    // load depends on the other, and neither call blocks the other tab.
    // ═════════════════════════════════════════════════════════════════════════

    connectedCallback() {
        this._loadProfiles();                              // Tab 1 only
        this._ensureCategoryLoaded(this.activeCategory);    // Tab 2 only – loads just the default category
    }

    // ═════════════════════════════════════════════════════════════════════════
    // TAB 1 – PROFILE ACCESS
    // ═════════════════════════════════════════════════════════════════════════

    _loadProfiles() {
        getProfiles()
            .then(result => {
                this.profiles = (result || []).map((p, i) => ({
                    id          : p.id   || p.Id   || ('idx-' + i),
                    name        : p.name || p.Name || '(unknown)',
                    userLicense : p.userLicense || p.UserLicense || '',
                    selected    : false,
                    rowClass    : 'pam-profile-row'
                }));
                this.profilesLoaded = true;
                this.loadError = '';
            })
            .catch(err => {
                this.profilesLoaded = true;
                this.loadError = this._msg(err);
                this._toast('Failed to Load Profiles', this.loadError, 'error');
            });
    }

    get filteredProfiles() {
        const q = (this.searchTerm || '').toLowerCase().trim();
        return this.profiles
            .filter(p => !q || (p.name || '').toLowerCase().includes(q))
            .map(p => ({
                ...p,
                rowClass: 'pam-profile-row' + (p.selected ? ' pam-profile-row--selected' : '')
            }));
    }

    get selectedCount()        { return this.profiles.filter(p => p.selected).length; }
    get hasSelections()        { return this.selectedCount > 0; }
    get noResults()            { return this.profilesLoaded && this.filteredProfiles.length === 0; }
    get isGetDetailsDisabled() { return !this.hasSelections || this.isWorking; }

    get getDetailsLabel() {
        if (this.isWorking)     return 'Retrieving…';
        if (this.hasSelections) return `Get Profile Details (${this.selectedCount})`;
        return 'Get Profile Details';
    }

    get workingText() {
        return `Retrieving details for ${this.selectedCount} profile(s)…`;
    }

    get toastClass() { return 'pam-toast pam-toast--' + this.toastType; }

    handleSearch(e) { this.searchTerm = e.target.value; }

    handleSelectAll() {
        const q   = (this.searchTerm || '').toLowerCase().trim();
        const vis = new Set(
            this.profiles.filter(p => !q || p.name.toLowerCase().includes(q)).map(p => p.id)
        );
        this.profiles = this.profiles.map(p => vis.has(p.id) ? { ...p, selected: true } : p);
    }

    handleDeselectAll() { this.profiles = this.profiles.map(p => ({ ...p, selected: false })); }

    handleProfileClick(e) {
        if (e.target && e.target.tagName === 'INPUT') return;
        this._toggleProfile(e.currentTarget.dataset.id);
    }

    handleProfileToggle(e) { this._toggleProfile(e.target.dataset.id); }

    handleProfileRowKeydown(e) {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            this._toggleProfile(e.currentTarget.dataset.id);
        }
    }

    _toggleProfile(id) {
        this.profiles = this.profiles.map(p => p.id === id ? { ...p, selected: !p.selected } : p);
    }

    dismissToast() {
        if (this._toastTimer) clearTimeout(this._toastTimer);
        this.toastVisible = false;
    }

    handleGetDetails() {
        if (this.isGetDetailsDisabled) return;
        const ids = this.profiles.filter(p => p.selected).map(p => p.id);
        this.isWorking          = true;
        this.showProfileResults = false;

        getProfileDetails({ profileIds: ids })
            .then(result => {
                this.isWorking = false;
                this.profileDetailsResults = (result || []).map((p, i) => this._decorateProfileBundle(p, i));
                this.showProfileResults    = true;
                this._lastAnalyzedProfileIds = new Set(ids);
                this._toast('Done', `Retrieved details for ${ids.length} profile(s).`, 'success');
            })
            .catch(err => {
                this.isWorking = false;
                this._toast('Error', this._msg(err), 'error');
            });
    }

    get isGenProfileExcelDisabled() { return !this.showProfileResults || this.profileDetailsResults.length === 0; }

    get genProfileExcelLabel() {
        const n = this.profileDetailsResults.length;
        return n > 0 ? `Generate Excel (${n})` : 'Generate Excel';
    }

    // True when the checkbox selection has changed since these results were generated — the
    // results/Excel export still reflect the previous selection until "Refresh Results" is clicked.
    get isProfileSelectionStale() {
        if (!this.showProfileResults || !this._lastAnalyzedProfileIds) return false;
        const current = new Set(this.profiles.filter(p => p.selected).map(p => p.id));
        return !this._setsEqual(current, this._lastAnalyzedProfileIds);
    }

    _decorateProfileBundle(p, i) {
        const rowKey = 'prof-' + i;
        const bundle = {
            ...p,
            rowKey,
            collapsed: false,
            toggleIcon: '▾',
            objectPerms: (p.objectPerms || []).map((o, oi) => ({
                ...o, rowKey: `${rowKey}-op-${oi}`,
                readLabel: this._b(o.canRead), createLabel: this._b(o.canCreate), editLabel: this._b(o.canEdit),
                deleteLabel: this._b(o.canDelete), viewAllLabel: this._b(o.canViewAll), modifyAllLabel: this._b(o.canModifyAll)
            })),
            fieldPerms: (p.fieldPerms || []).map((f, fi) => ({
                ...f, rowKey: `${rowKey}-fp-${fi}`,
                readLabel: this._b(f.isReadable), editLabel: this._b(f.isEditable)
            })),
            apexClassAccess: (p.apexClassAccess || []).map((a, ai) => ({
                ...a, rowKey: `${rowKey}-ac-${ai}`, enabledLabel: this._b(a.isEnabled)
            })),
            vfPageAccess: (p.vfPageAccess || []).map((v, vi) => ({
                ...v, rowKey: `${rowKey}-vf-${vi}`, enabledLabel: this._b(v.isEnabled)
            })),
            tabVisibility: (p.tabVisibility || []).map((t, ti) => ({
                ...t, rowKey: `${rowKey}-tv-${ti}`
            })),
            appAccess: (p.appAccess || []).map((a, ai) => ({
                ...a, rowKey: `${rowKey}-app-${ai}`, visibleLabel: this._b(a.isVisible), defaultLabel: this._b(a.isDefault)
            })),
            recordTypeAccess: (p.recordTypeAccess || []).map((r, ri) => ({
                ...r, rowKey: `${rowKey}-rt-${ri}`, visibleLabel: this._b(r.isVisible), defaultLabel: this._b(r.isDefault)
            })),
            customPerms: (p.customPerms || []).map((c, ci) => ({
                ...c, rowKey: `${rowKey}-cp-${ci}`, enabledLabel: this._b(c.isEnabled)
            }))
        };
        return this._applyProfileSubTab(bundle, 'objectPerms');
    }

    _applyProfileSubTab(bundle, tab) {
        return {
            ...bundle,
            activeSubTab: tab,
            subTabs: PROFILE_SUB_TABS.map(st => ({
                key: st.key, label: st.label,
                btnClass: 'pam-subtab-btn' + (st.key === tab ? ' active' : '')
            })),
            showObjectPerms : tab === 'objectPerms',
            showFieldPerms  : tab === 'fieldPerms',
            showApexClass   : tab === 'apexClass',
            showVfPage      : tab === 'vfPage',
            showTabVis      : tab === 'tabVis',
            showAppAccess   : tab === 'appAccess',
            showRecordType  : tab === 'recordType',
            showCustomPerm  : tab === 'customPerm'
        };
    }

    handleProfileSubTabClick(e) {
        const rowKey = e.currentTarget.dataset.row;
        const tab    = e.currentTarget.dataset.subtab;
        this.profileDetailsResults = this.profileDetailsResults.map(p => p.rowKey === rowKey ? this._applyProfileSubTab(p, tab) : p);
    }

    // ── Collapse/expand, dismiss, and jump-to navigation for multi-profile results ─────────────
    handleToggleProfileCard(e) {
        const rowKey = e.currentTarget.dataset.row;
        this.profileDetailsResults = this.profileDetailsResults.map(p => {
            if (p.rowKey !== rowKey) return p;
            const collapsed = !p.collapsed;
            return { ...p, collapsed, toggleIcon: collapsed ? '▸' : '▾' };
        });
    }

    handleDismissProfileCard(e) {
        const rowKey = e.currentTarget.dataset.row;
        this.profileDetailsResults = this.profileDetailsResults.filter(p => p.rowKey !== rowKey);
    }

    handleExpandAllProfiles() {
        this.profileDetailsResults = this.profileDetailsResults.map(p => ({ ...p, collapsed: false, toggleIcon: '▾' }));
    }

    handleCollapseAllProfiles() {
        this.profileDetailsResults = this.profileDetailsResults.map(p => ({ ...p, collapsed: true, toggleIcon: '▸' }));
    }

    handleJumpToProfileCard(e) {
        const rowKey = e.target.value;
        if (!rowKey) return;
        const el = this.template.querySelector(`[data-anchor="${rowKey}"]`);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        e.target.value = '';
    }

    handleGenProfileExcel() {
        this._downloadProfileExcel(this.profileDetailsResults);
    }

    // ═════════════════════════════════════════════════════════════════════════
    // TAB 2 – OBJECT ACCESS
    // Category-driven: Objects (Standard/Custom), Apex (Classes/Triggers),
    // Lightning (LWC/Aura), Visualforce (Pages), Automation (Flows & Processes).
    // Fully self-contained: no profile selection, no profile data, no reference
    // to Tab 1 state anywhere below.
    // ═════════════════════════════════════════════════════════════════════════

    get categoryNav() {
        return CATEGORY_GROUPS.map(g => ({
            key: g.key,
            label: g.label,
            items: g.items.map(k => ({
                key: k,
                label: CATEGORY_LABELS[k],
                navClass: 'pam-cat-item' + (k === this.activeCategory ? ' pam-cat-item--active' : '')
            }))
        }));
    }

    get isObjectCategory()       { return this.activeCategory === 'standardObjects' || this.activeCategory === 'customObjects'; }
    get activeCategoryLabel()    { return CATEGORY_LABELS[this.activeCategory] || ''; }
    get showStatusFilter()       { return (CATEGORY_FILTERS[this.activeCategory] || []).includes('status'); }
    get showApiVersionFilter()   { return (CATEGORY_FILTERS[this.activeCategory] || []).includes('apiVersion'); }
    get showProcessTypeFilter()  { return (CATEGORY_FILTERS[this.activeCategory] || []).includes('processType'); }

    get categorySearchPlaceholder() {
        return this.isObjectCategory ? 'Search by name or API name…' : 'Search by name…';
    }

    handleCategoryClick(e) {
        const key = e.currentTarget.dataset.key;
        if (!key || key === this.activeCategory) return;
        this.activeCategory            = key;
        this.categorySearchTerm        = '';
        this.categoryStatusFilter      = 'All';
        this.categoryApiVersionFilter  = 'All';
        this.categoryProcessTypeFilter = 'All';
        this.objSortField              = null;
        this.objSortDir                = 'asc';
        this.showObjResults            = false;
        this.showComponentAccess       = false;
        this.componentAccessResults    = [];
        this._ensureCategoryLoaded(key);
    }

    _ensureCategoryLoaded(key) {
        if (this._categoryCache[key]) return;
        this.isCategoryLoading = true;
        CATEGORY_APEX[key]()
            .then(result => {
                const normalized = (result || []).map((raw, i) => this._normalizeCategoryItem(key, raw, i));
                this._categoryCache = { ...this._categoryCache, [key]: normalized };
                this.isCategoryLoading = false;
            })
            .catch(err => {
                this.isCategoryLoading = false;
                this._toast('Failed to Load', this._msg(err), 'error');
            });
    }

    _normalizeCategoryItem(key, raw, i) {
        if (key === 'standardObjects' || key === 'customObjects') {
            return {
                id            : key + '-' + i,
                label         : raw.label,
                developerName : raw.developerName,
                apiName       : raw.apiName,
                isCustom      : raw.isCustom,
                typeLabel     : raw.isCustom ? 'Custom' : 'Standard',
                selected      : false
            };
        }
        return {
            id          : key + '-' + i,
            name        : raw.name,
            apiVersion  : raw.apiVersion,
            status      : raw.status,
            processType : raw.processType,
            selected    : false
        };
    }

    get categoryItems()  { return this._categoryCache[this.activeCategory] || []; }
    get categoryLoaded() { return !!this._categoryCache[this.activeCategory]; }

    get filteredCategoryItems() {
        const items = this.categoryItems;
        const q = (this.categorySearchTerm || '').toLowerCase().trim();

        if (this.isObjectCategory) {
            // Single search box matches label, API name, or developer name — no separate API-only field.
            let filtered = items.filter(o =>
                !q ||
                (o.label || '').toLowerCase().includes(q) ||
                (o.apiName || '').toLowerCase().includes(q) ||
                (o.developerName || '').toLowerCase().includes(q)
            );
            filtered = this._sortRows(filtered, this.objSortField, this.objSortDir);
            return filtered.map(o => ({ ...o, rowClass: 'pam-obj-row' + (o.selected ? ' pam-obj-row--selected' : '') }));
        }

        const statusF = this.categoryStatusFilter      || 'All';
        const apiVerF = this.categoryApiVersionFilter   || 'All';
        const procF   = this.categoryProcessTypeFilter  || 'All';
        return items
            .filter(it => {
                if (q && !(it.name || '').toLowerCase().includes(q)) return false;
                if (statusF !== 'All' && it.status !== statusF) return false;
                if (apiVerF !== 'All' && it.apiVersion !== apiVerF) return false;
                if (procF   !== 'All' && it.processType !== procF) return false;
                return true;
            })
            .map(it => ({ ...it, rowClass: 'pam-obj-row' + (it.selected ? ' pam-obj-row--selected' : '') }));
    }

    get categoryNoResults() { return this.categoryLoaded && this.filteredCategoryItems.length === 0; }

    get categoryStatusOptions() {
        const vals = [...new Set(this.categoryItems.map(i => i.status).filter(Boolean))].sort();
        return [{ label: 'All Status', value: 'All' }, ...vals.map(v => ({ label: v, value: v }))];
    }
    get categoryApiVersionOptions() {
        const vals = [...new Set(this.categoryItems.map(i => i.apiVersion).filter(Boolean))].sort();
        return [{ label: 'All Versions', value: 'All' }, ...vals.map(v => ({ label: v, value: v }))];
    }
    get categoryProcessTypeOptions() {
        const vals = [...new Set(this.categoryItems.map(i => i.processType).filter(Boolean))].sort();
        return [{ label: 'All Process Types', value: 'All' }, ...vals.map(v => ({ label: v, value: v }))];
    }

    handleCategorySearch(e)            { this.categorySearchTerm = e.target.value; }
    handleCategoryStatusFilter(e)      { this.categoryStatusFilter = e.target.value; }
    handleCategoryApiVersionFilter(e)  { this.categoryApiVersionFilter = e.target.value; }
    handleCategoryProcessTypeFilter(e) { this.categoryProcessTypeFilter = e.target.value; }

    handleObjSort(e) {
        const field = e.currentTarget.dataset.field;
        if (this.objSortField === field) {
            this.objSortDir = this.objSortDir === 'asc' ? 'desc' : 'asc';
        } else {
            this.objSortField = field;
            this.objSortDir = 'asc';
        }
    }

    get objSortIndicators() {
        const mk = (f) => this.objSortField === f ? (this.objSortDir === 'desc' ? ' ▼' : ' ▲') : ' ⇅';
        return { label: mk('label'), apiName: mk('apiName'), typeLabel: mk('typeLabel') };
    }

    // ── Object selection (spans Standard + Custom Objects caches) ──────────

    get selectedObjectApiNames() {
        const std = this._categoryCache.standardObjects || [];
        const cus = this._categoryCache.customObjects   || [];
        return [...std, ...cus].filter(o => o.selected).map(o => o.apiName);
    }
    get selectedObjectCount() { return this.selectedObjectApiNames.length; }
    get hasObjectSelections() { return this.selectedObjectCount > 0; }

    // ── Category selection (Apex Classes/Triggers, Visualforce Pages, Flows & Processes) ──
    get selectedCategoryItems() { return (this._categoryCache[this.activeCategory] || []).filter(i => i.selected); }
    get selectedCategoryCount() { return this.selectedCategoryItems.length; }
    get hasCategorySelections() { return this.selectedCategoryCount > 0; }

    get showSelectionBadge() {
        return this.isObjectCategory ? this.hasObjectSelections : this.hasCategorySelections;
    }
    get selectionBadgeCount() {
        return this.isObjectCategory ? this.selectedObjectCount : this.selectedCategoryCount;
    }

    get isGetObjPermsDisabled() { return !this.hasObjectSelections || this.isLoadingObjSecurity; }

    get getObjPermsLabel() {
        if (this.isLoadingObjSecurity) return 'Analyzing…';
        const oc = this.selectedObjectCount;
        return oc > 0 ? `Analyze Object Security (${oc})` : 'Analyze Object Security';
    }

    get isGenObjExcelDisabled() { return !this.showObjResults || this.objSecurityResults.length === 0; }

    get genObjExcelLabel() {
        const n = this.objSecurityResults.length;
        return n > 0 ? `Generate Excel (${n})` : 'Generate Excel';
    }

    // True when the checkbox selection has changed since Object Security results were generated.
    get isObjSelectionStale() {
        if (!this.showObjResults || !this._lastAnalyzedObjectApiNames) return false;
        const current = new Set(this.selectedObjectApiNames);
        return !this._setsEqual(current, this._lastAnalyzedObjectApiNames);
    }

    // True when the checkbox selection has changed since Component Access results were generated.
    get isComponentSelectionStale() {
        if (!this.showComponentAccess || !this._lastAnalyzedComponentKey) return false;
        const key = this.activeCategory + '|' + this.selectedCategoryItems.map(i => i.name).sort().join(',');
        return key !== this._lastAnalyzedComponentKey;
    }

    // ── Component access (Apex Classes / Visualforce Pages only) ───────────
    get showAnalyzeAccessButton()  { return !!ACCESS_COMPONENT_TYPE[this.activeCategory]; }
    get isAnalyzeAccessDisabled()  { return !this.hasCategorySelections || this.isLoadingComponentAccess; }

    // Every category supports selection + Generate Excel. Apex Classes/Visualforce Pages
    // additionally get "Analyze Access" (real SetupEntityAccess data); Apex Triggers and
    // Flows & Processes export their plain selected-row list without an access-analysis step.
    get isCategorySelectable() { return true; }

    get analyzeAccessLabel() {
        if (this.isLoadingComponentAccess) return 'Analyzing…';
        const sc = this.selectedCategoryCount;
        return sc > 0 ? `Analyze Access (${sc})` : 'Analyze Access';
    }

    get isGenCategoryExcelDisabled() {
        if (this.showAnalyzeAccessButton) return !this.showComponentAccess || this.componentAccessResults.length === 0;
        return !this.hasCategorySelections;
    }

    get genCategoryExcelLabel() {
        const n = this.showAnalyzeAccessButton ? this.componentAccessResults.length : this.selectedCategoryCount;
        return n > 0 ? `Generate Excel (${n})` : 'Generate Excel';
    }

    handleObjectSelectAll() {
        const key = this.activeCategory;
        const visibleIds = new Set(this.filteredCategoryItems.map(o => o.id));
        const updated = (this._categoryCache[key] || []).map(o => visibleIds.has(o.id) ? { ...o, selected: true } : o);
        this._categoryCache = { ...this._categoryCache, [key]: updated };
        this.showComponentAccess = false;
    }

    handleObjectClearAll() {
        const key = this.activeCategory;
        const updated = (this._categoryCache[key] || []).map(o => ({ ...o, selected: false }));
        this._categoryCache = { ...this._categoryCache, [key]: updated };
        this.showComponentAccess = false;
    }

    handleObjectToggle(e) { this._toggleObject(e.currentTarget.dataset.id); }

    handleObjectRowKeydown(e) {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            this._toggleObject(e.currentTarget.dataset.id);
        }
    }

    handleObjectRowClick(e) {
        if (e.target && e.target.tagName === 'INPUT') return;
        this._toggleObject(e.currentTarget.dataset.id);
    }

    _toggleObject(id) {
        const key = this.activeCategory;
        const updated = (this._categoryCache[key] || []).map(o => o.id === id ? { ...o, selected: !o.selected } : o);
        this._categoryCache = { ...this._categoryCache, [key]: updated };
        this.showComponentAccess = false;
    }

    handleAnalyzeComponentAccess() {
        const componentType = ACCESS_COMPONENT_TYPE[this.activeCategory];
        if (!componentType) return;
        const names = this.selectedCategoryItems.map(i => i.name);
        if (!names.length) {
            this._toast('No Selection', 'Please select at least one item.', 'warning');
            return;
        }

        this.isLoadingComponentAccess = true;
        this.showComponentAccess      = false;

        getComponentAccessDetails({ componentType, componentNames: names })
            .then(result => {
                this.componentAccessResults = (result || []).map((r, i) => ({
                    ...r,
                    rowKey: 'ca-' + i,
                    accessGrants: (r.accessGrants || []).map((g, gi) => ({ ...g, rowKey: `ca-${i}-${gi}` }))
                }));
                this.showComponentAccess      = true;
                this.isLoadingComponentAccess = false;
                this._lastAnalyzedComponentKey = this.activeCategory + '|' + names.slice().sort().join(',');
                this._toast('Done', `Retrieved access details for ${names.length} item(s).`, 'success');
            })
            .catch(err => {
                this.isLoadingComponentAccess = false;
                this._toast('Error', this._msg(err), 'error');
            });
    }

    handleGenCategoryExcel() {
        try {
            if (this.showAnalyzeAccessButton) {
                this._genComponentAccessExcel();
            } else {
                this._genPlainCategoryExcel();
            }
        } catch (ex) {
            this._toast('Export Error', ex.message || 'Could not generate file.', 'error');
        }
    }

    _genComponentAccessExcel() {
        const label = this.activeCategoryLabel;
        const listRows  = this.componentAccessResults.map(r => [r.componentName]);
        const grantRows = [];
        this.componentAccessResults.forEach(r => {
            if ((r.accessGrants || []).length) {
                r.accessGrants.forEach(g => grantRows.push([r.componentName, g.parentType, g.parentName]));
            } else {
                grantRows.push([r.componentName, '', 'No Profile or Permission Set grants access.']);
            }
        });

        const sheets = [
            { name: label.substring(0, 31), headers: ['Name'], rows: listRows },
            { name: 'Access Grants', headers: ['Name', 'Granted Via', 'Profile / Permission Set Name'], rows: grantRows }
        ];
        const xml = this._buildXls(sheets, [label]);
        const ts  = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        this._triggerDownload(xml, `${label.replace(/\s+/g, '')}_${ts}.xls`);
        this._toast('Downloaded', `${label} Excel (with access grants) generated.`, 'success');
    }

    _genPlainCategoryExcel() {
            const selected = this.selectedCategoryItems;
            if (!selected.length) {
                this._toast('No Selection', 'Please select at least one item.', 'warning');
                return;
            }
            const headers = ['Name'];
            if (this.showStatusFilter)      headers.push('Status');
            if (this.showApiVersionFilter)  headers.push('API Version');
            if (this.showProcessTypeFilter) headers.push('Process Type');

            const rows = selected.map(it => {
                const row = [it.name];
                if (this.showStatusFilter)      row.push(it.status || '');
                if (this.showApiVersionFilter)  row.push(it.apiVersion || '');
                if (this.showProcessTypeFilter) row.push(it.processType || '');
                return row;
            });

        const label = this.activeCategoryLabel;
        const sheets = [{ name: label.substring(0, 31), headers, rows }];
        const xml = this._buildXls(sheets, [label]);
        const ts  = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        this._triggerDownload(xml, `${label.replace(/\s+/g, '')}_${ts}.xls`);
        this._toast('Downloaded', `${label} Excel generated.`, 'success');
    }

    // ── Object Security analysis ────────────────────────────────────────────

    handleAnalyzeObjectSecurity() {
        const apiNames = this.selectedObjectApiNames;
        if (!apiNames.length) {
            this._toast('No Object Selected', 'Please select at least one object.', 'warning');
            return;
        }

        this.isLoadingObjSecurity = true;
        this.showObjResults       = false;

        getObjectSecurityBundle({ objectApiNames: apiNames })
            .then(result => {
                this.objSecurityResults = (result || []).map((r, i) => this._decorateSecurityBundle(r, i));
                this.showObjResults       = true;
                this.isLoadingObjSecurity = false;
                this._lastAnalyzedObjectApiNames = new Set(apiNames);
                this._toast('Done', `Retrieved security details for ${apiNames.length} object(s).`, 'success');
            })
            .catch(err => {
                this.isLoadingObjSecurity = false;
                this._toast('Error', this._msg(err), 'error');
            });
    }

    _decorateSecurityBundle(r, i) {
        const rowKey = 'sec-' + i;
        const bundle = {
            ...r,
            rowKey,
            collapsed: false,
            toggleIcon: '▾',
            objectPermissions: (r.objectPermissions || []).map((p, pi) => ({
                ...p, rowKey: `${rowKey}-op-${pi}`,
                readLabel: this._b(p.canRead), createLabel: this._b(p.canCreate), editLabel: this._b(p.canEdit),
                deleteLabel: this._b(p.canDelete), viewAllLabel: this._b(p.canViewAll), modifyAllLabel: this._b(p.canModifyAll)
            })),
            fieldPermissions: (r.fieldPermissions || []).map((f, fi) => ({
                ...f, rowKey: `${rowKey}-fp-${fi}`,
                readLabel: this._b(f.isReadable), editLabel: this._b(f.isEditable)
            })),
            permissionSets: (r.permissionSets || []).map((p, pi) => ({
                ...p, rowKey: `${rowKey}-ps-${pi}`,
                readLabel: this._b(p.canRead), createLabel: this._b(p.canCreate), editLabel: this._b(p.canEdit),
                deleteLabel: this._b(p.canDelete), viewAllLabel: this._b(p.canViewAll), modifyAllLabel: this._b(p.canModifyAll)
            })),
            permissionSetGroups: (r.permissionSetGroups || []).map((g, gi) => ({
                ...g, rowKey: `${rowKey}-psg-${gi}`,
                readLabel: this._b(g.canRead), createLabel: this._b(g.canCreate), editLabel: this._b(g.canEdit),
                deleteLabel: this._b(g.canDelete), viewAllLabel: this._b(g.canViewAll), modifyAllLabel: this._b(g.canModifyAll)
            })),
            roleHierarchy: (r.roleHierarchy || []).map((role, ri) => ({
                ...role, rowKey: `${rowKey}-role-${ri}`, parentRoleLabel: role.parentRoleName || '(Top Level)'
            })),
            recordTypes: (r.recordTypes || []).map((rt, rti) => ({
                ...rt, rowKey: `${rowKey}-rt-${rti}`, activeLabel: this._b(rt.isActive)
            })),
            recordLevelShares: (r.recordLevelShares || []).map((sh, si) => ({
                ...sh, rowKey: `${rowKey}-sh-${si}`
            })),
            securityLimitations: (r.securityLimitations || []).map((lm, li) => ({
                ...lm, rowKey: `${rowKey}-lim-${li}`,
                supportBadgeClass: this._limBadgeClass(lm.soqlSupport),
                supportTooltip: this._limTooltip(lm.soqlSupport)
            }))
        };
        return this._applySubTab(bundle, 'objPerms');
    }

    _applySubTab(bundle, tab) {
        return {
            ...bundle,
            activeSubTab: tab,
            subTabs: SUB_TABS.map(st => ({
                key: st.key, label: st.label,
                btnClass: 'pam-subtab-btn' + (st.key === tab ? ' active' : '')
            })),
            showObjPerms      : tab === 'objPerms',
            showFls           : tab === 'fls',
            showPermSets      : tab === 'permSets',
            showPermSetGroups : tab === 'permSetGroups',
            showRoles         : tab === 'roles',
            showRecordTypes   : tab === 'recordTypes',
            showRecordShare   : tab === 'recordShare',
            showLimitations   : tab === 'limitations'
        };
    }

    handleSubTabClick(e) {
        const rowKey = e.currentTarget.dataset.row;
        const tab    = e.currentTarget.dataset.subtab;
        this.objSecurityResults = this.objSecurityResults.map(r => r.rowKey === rowKey ? this._applySubTab(r, tab) : r);
    }

    // ── Collapse/expand, dismiss, and jump-to navigation for multi-object results ──────────────
    handleToggleObjCard(e) {
        const rowKey = e.currentTarget.dataset.row;
        this.objSecurityResults = this.objSecurityResults.map(r => {
            if (r.rowKey !== rowKey) return r;
            const collapsed = !r.collapsed;
            return { ...r, collapsed, toggleIcon: collapsed ? '▸' : '▾' };
        });
    }

    handleDismissObjCard(e) {
        const rowKey = e.currentTarget.dataset.row;
        this.objSecurityResults = this.objSecurityResults.filter(r => r.rowKey !== rowKey);
    }

    handleExpandAllObj() {
        this.objSecurityResults = this.objSecurityResults.map(r => ({ ...r, collapsed: false, toggleIcon: '▾' }));
    }

    handleCollapseAllObj() {
        this.objSecurityResults = this.objSecurityResults.map(r => ({ ...r, collapsed: true, toggleIcon: '▸' }));
    }

    handleJumpToObjCard(e) {
        const rowKey = e.target.value;
        if (!rowKey) return;
        const el = this.template.querySelector(`[data-anchor="${rowKey}"]`);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        e.target.value = '';
    }

    _limBadgeClass(support) {
        if (support === 'Yes')     return 'pam-lim-badge pam-lim-badge--yes';
        if (support === 'Partial') return 'pam-lim-badge pam-lim-badge--partial';
        return 'pam-lim-badge pam-lim-badge--no';
    }

    _limTooltip(support) {
        if (support === 'Yes')     return 'Fully retrievable via standard Apex SOQL.';
        if (support === 'Partial') return 'Partially retrievable — some details (e.g. calculated record-level access) are not exposed via SOQL.';
        return 'Not retrievable via standard Apex SOQL — configure and verify this directly in Setup.';
    }

    handleGenObjExcel() {
        try {
            const objInfoRows = [];
            const objPermRows = [];
            const flsRows     = [];
            const psRows      = [];
            const psgRows     = [];
            const roleRows    = [];
            const rtRows      = [];
            const shareRows   = [];
            const limRows     = [];

            this.objSecurityResults.forEach(r => {
                objInfoRows.push([r.objectLabel, r.objectApiName, r.isCustom ? 'Custom' : 'Standard']);
                (r.objectPermissions || []).forEach(p => objPermRows.push([
                    r.objectLabel, r.objectApiName, p.parentType, p.parentName,
                    p.readLabel, p.createLabel, p.editLabel, p.deleteLabel, p.viewAllLabel, p.modifyAllLabel
                ]));
                (r.fieldPermissions || []).forEach(f => flsRows.push([
                    r.objectLabel, r.objectApiName, f.fieldApiName, f.fieldLabel, f.parentType, f.parentName, f.readLabel, f.editLabel
                ]));
                (r.permissionSets || []).forEach(p => psRows.push([
                    r.objectLabel, r.objectApiName, p.name,
                    p.readLabel, p.createLabel, p.editLabel, p.deleteLabel, p.viewAllLabel, p.modifyAllLabel
                ]));
                (r.permissionSetGroups || []).forEach(g => psgRows.push([
                    r.objectLabel, r.objectApiName, g.groupLabel, g.includedPermSetName,
                    g.readLabel, g.createLabel, g.editLabel, g.deleteLabel, g.viewAllLabel, g.modifyAllLabel
                ]));
                (r.roleHierarchy || []).forEach(role => roleRows.push([role.name, role.developerName, role.parentRoleLabel]));
                (r.recordTypes || []).forEach(rt => rtRows.push([r.objectLabel, r.objectApiName, rt.name, rt.developerName, rt.activeLabel]));
                if ((r.recordLevelShares || []).length) {
                    r.recordLevelShares.forEach(sh => shareRows.push([
                        r.objectLabel, r.objectApiName, sh.userOrGroupId, sh.accessLevel, sh.rowCause || ''
                    ]));
                } else {
                    shareRows.push([r.objectLabel, r.objectApiName, '', '', r.recordShareNote || 'Not available.']);
                }
                (r.securityLimitations || []).forEach(lm => limRows.push([r.objectLabel, r.objectApiName, lm.area, lm.soqlSupport, lm.result]));
            });

            // Role Hierarchy is the same org-wide structure for every selected object — dedupe for a clean sheet.
            const seenRoles = new Set();
            const dedupedRoleRows = roleRows.filter(row => {
                const key = row.join('|');
                if (seenRoles.has(key)) return false;
                seenRoles.add(key);
                return true;
            });

            const sheets = [
                { name: 'Object Information',   headers: ['Object Label','API Name','Type'], rows: objInfoRows },
                { name: 'Object Permissions',    headers: ['Object Label','API Name','Granted Via','Name','Read','Create','Edit','Delete','View All','Modify All'], rows: objPermRows },
                { name: 'Field Level Security',  headers: ['Object Label','API Name','Field API Name','Field Label','Granted Via','Name','Readable','Editable'], rows: flsRows },
                { name: 'Permission Sets',       headers: ['Object Label','API Name','Permission Set','Read','Create','Edit','Delete','View All','Modify All'], rows: psRows },
                { name: 'Permission Set Groups', headers: ['Object Label','API Name','Permission Set Group','Included Permission Set','Read','Create','Edit','Delete','View All','Modify All'], rows: psgRows },
                { name: 'Role Hierarchy',        headers: ['Role Name','Developer Name','Parent Role'], rows: dedupedRoleRows },
                { name: 'Record Types',          headers: ['Object Label','API Name','Record Type','Developer Name','Active'], rows: rtRows },
                { name: 'Record Level Access',   headers: ['Object Label','API Name','User Or Group Id','Access Level','Row Cause / Note'], rows: shareRows },
                { name: 'Security Limitations',  headers: ['Object Label','API Name','Security Area','SOQL Support','Result'], rows: limRows }
            ];

            const objNames = this.objSecurityResults.map(r => r.objectLabel);
            const xml = this._buildXls(sheets, objNames);
            const ts  = new Date().toISOString().slice(0, 10).replace(/-/g, '');
            this._triggerDownload(xml, `ObjectSecurity_${ts}.xls`);
            this._toast('Downloaded', 'Object Security Excel (9 sheets) generated.', 'success');
        } catch (ex) {
            this._toast('Export Error', ex.message || 'Could not generate file.', 'error');
        }
    }

    // ═════════════════════════════════════════════════════════════════════════
    // TAB 3 – ACCESS COMPARISON
    // Fully self-contained: only reads the two uploaded files, no reference to
    // Tab 1 or Tab 2 state anywhere below.
    // ═════════════════════════════════════════════════════════════════════════

    handleComparisonTypeChange(e) {
        const type = e.target.value;
        if (!type || type === this.comparisonType) return;
        if (this.uatFileName || this.prodFileName) {
            const proceed = window.confirm('Switching comparison type will clear your uploaded files and results. Continue?');
            if (!proceed) { e.target.value = this.comparisonType; return; }
        }
        this.comparisonType  = type;
        this.uatFileName     = ''; this.prodFileName = '';
        this.uatValid        = false; this.prodValid = false;
        this.uatError        = ''; this.prodError = '';
        this._uatData         = null; this._prodData = null;
        this.compResults      = []; this.filteredComp = []; this.compSummary = null;
        this.showCompResults  = false; this.showAgentforce = false;
        this.compStatusFilter = 'All'; this.compProfileFilter = 'All'; this.compObjectSearch = '';
        this.compSortField    = null; this.compSortDir = 'asc'; this.compPage = 1;
        this.agentforceRows          = []; this.agentforceFilteredRows = [];
        this.agentforceSummary       = null; this.agentforceVerdict = null;
        this.agentforceStatusFilter  = 'All'; this.agentforceProfileFilter = 'All'; this.agentforceObjectSearch = '';
        this.agentforceSortField     = null; this.agentforceSortDir = 'asc'; this.agentforcePage = 1;
    }

    get isProfileAccessComparison() { return this.comparisonType === 'Profile Access'; }
    get isObjectAccessComparison()  { return this.comparisonType === 'Object Access'; }
    get comparisonTypeHint() {
        return this.isObjectAccessComparison
            ? 'Upload two "ObjectSecurity_*.xls" files generated from the Object Access tab (Analyze Object Security → Generate Excel).'
            : 'Upload two "ProfileAccess_*.xls" files generated from the Profile Access tab (Get Profile Details → Generate Excel).';
    }
    get uatUploadLabel()  { return this.isObjectAccessComparison ? 'UAT Object Access File'  : 'UAT Profile Access File'; }
    get prodUploadLabel() { return this.isObjectAccessComparison ? 'Production Object Access File' : 'Production Profile Access File'; }
    get uatUploadBtnLabel()  { return this.uatFileName  ? 'Replace UAT File'         : 'Upload UAT Excel'; }
    get prodUploadBtnLabel() { return this.prodFileName ? 'Replace Production File'  : 'Upload Production Excel'; }
    get compColLabelCategory() { return 'Category'; }
    get compColLabelItem()     { return 'Item'; }
    get compareEngineHint() { return 'Works in every org. Runs entirely in your browser — no data leaves the page, no AI required.'; }

    handleUatUpload(e) {
        const file = e.target.files[0]; if (!file) return;
        this.uatFileName = file.name; this.uatValid = false; this.uatError = '';
        this._readFile(file, content => {
            const { data, error, summary } = this._parseAndValidate(content, 'UAT');
            if (error) { this.uatError = error; this._toast('UAT File Error', error, 'error'); }
            else       {
                this._uatData = data; this.uatValid = true;
                if (summary) console.log('[ProfileAccessManager] ' + summary);
                this._toast('UAT File', summary || 'File validated successfully.', 'success');
            }
        });
    }

    handleProdUpload(e) {
        const file = e.target.files[0]; if (!file) return;
        this.prodFileName = file.name; this.prodValid = false; this.prodError = '';
        this._readFile(file, content => {
            const { data, error, summary } = this._parseAndValidate(content, 'Production');
            if (error) { this.prodError = error; this._toast('Production File Error', error, 'error'); }
            else       {
                this._prodData = data; this.prodValid = true;
                if (summary) console.log('[ProfileAccessManager] ' + summary);
                this._toast('Production File', summary || 'File validated successfully.', 'success');
            }
        });
    }

    handleRemoveUatFile() {
        this.uatFileName = ''; this.uatValid = false; this.uatError = ''; this._uatData = null;
    }

    handleRemoveProdFile() {
        this.prodFileName = ''; this.prodValid = false; this.prodError = ''; this._prodData = null;
    }

    _readFile(file, callback) {
        const reader = new FileReader();
        reader.onload  = ev => callback(ev.target.result);
        reader.onerror = () => this._toast('File Read Error', 'Could not read the uploaded file.', 'error');
        reader.readAsText(file, 'utf-8');
    }

    _parseAndValidate(content, source) {
        try {
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(content, 'application/xml');

            if (xmlDoc.querySelector('parsererror')) {
                return { data: null, error: `${source} file is not a valid XML Spreadsheet (.xls) file exported from this tool.` };
            }

            return this.isObjectAccessComparison
                ? this._parseObjectAccessFile(xmlDoc, source)
                : this._parseProfileAccessFile(xmlDoc, source);
        } catch (ex) {
            return { data: null, error: `Failed to parse ${source} file: ${ex.message}` };
        }
    }

    _readAllRows(ws) {
        const NS = 'urn:schemas-microsoft-com:office:spreadsheet';
        const rowEls = ws.getElementsByTagNameNS(NS, 'Row');
        const allRows = [];
        for (let i = 0; i < rowEls.length; i++) {
            const cellEls = rowEls[i].getElementsByTagNameNS(NS, 'Cell');
            const rowData = [];
            for (let j = 0; j < cellEls.length; j++) {
                const dataEl = cellEls[j].getElementsByTagNameNS(NS, 'Data')[0];
                rowData.push(dataEl ? dataEl.textContent : '');
            }
            allRows.push(rowData);
        }
        return allRows;
    }

    // Every sheet produced by _buildXls has a merged "Scope: ..." row before the real header
    // row, so the header can't be assumed to be at index 0 — scan the first few rows for it.
    _findHeaderRow(allRows, anchorCols) {
        for (let i = 0; i < Math.min(allRows.length, 5); i++) {
            if (anchorCols.some(c => allRows[i].includes(c))) return { headerRow: allRows[i], headerIdx: i };
        }
        return null;
    }

    _findWorksheet(xmlDoc, name) {
        const NS = 'urn:schemas-microsoft-com:office:spreadsheet';
        const worksheets = xmlDoc.getElementsByTagNameNS(NS, 'Worksheet');
        for (let i = 0; i < worksheets.length; i++) {
            const ws  = worksheets[i];
            const wsn = ws.getAttributeNS(NS, 'Name') || ws.getAttribute('ss:Name') || '';
            if (wsn === name) return ws;
        }
        return null;
    }

    // Object Access comparison reads 4 sheets of an ObjectSecurity_*.xls export (from the Object
    // Access tab) that are genuinely comparable across orgs — Object Permissions, Field Level
    // Security, Permission Sets, and Permission Set Groups — flattening each into the same
    // generic {profile, category, item, permission, value} row used by Profile Access, so both
    // modes share one comparator. The other 5 sheets in that export are deliberately excluded:
    // Object Information/Record Types (no Profile or Permission Set dimension to compare),
    // Role Hierarchy (org structure, not a permission grant), Security Limitations (static
    // disclosure text, not real data), and Record-Level Access (contains User/Group Ids, which
    // are always different between two orgs even for the "same" user — comparing them would
    // show near-100% false mismatches).
    //
    // "Object Permissions" and "Field Level Security" grant access via either a Profile or a
    // Permission Set (the "Granted Via" column) — both are included, labeled distinctly, e.g.
    // "System Administrator (Profile)" vs "MyPermSet (Permission Set)".
    _parseObjectAccessFile(xmlDoc, source) {
        const objPermWs = this._findWorksheet(xmlDoc, 'Object Permissions');
        const objInfoWs = this._findWorksheet(xmlDoc, 'Object Information');
        if (!objPermWs || !objInfoWs) {
            return { data: null, error: `${source} file does not look like an Object Access export. Please upload a file generated from the Object Access tab (select objects → Analyze Object Security → Generate Excel).` };
        }

        const SHEETS = [
            { name: 'Object Permissions',    nameCol: 'Name',              grantedViaCol: 'Granted Via', itemCols: ['API Name'],                          perms: ['Read','Create','Edit','Delete','View All','Modify All'] },
            { name: 'Field Level Security',  nameCol: 'Name',              grantedViaCol: 'Granted Via', itemCols: ['API Name','Field API Name'],         perms: ['Readable','Editable'] },
            { name: 'Permission Sets',       nameCol: 'Permission Set',    grantedViaFixed: 'Permission Set',  itemCols: ['API Name'],                     perms: ['Read','Create','Edit','Delete','View All','Modify All'] },
            { name: 'Permission Set Groups', nameCol: 'Permission Set Group', grantedViaFixed: 'Permission Set Group', itemCols: ['API Name','Included Permission Set'], perms: ['Read','Create','Edit','Delete','View All','Modify All'] }
        ];

        const data = [];
        const diag = [];
        for (const spec of SHEETS) {
            const ws = this._findWorksheet(xmlDoc, spec.name);
            if (!ws) { diag.push(`${spec.name}: sheet not found`); continue; }

            const allRows = this._readAllRows(ws);
            if (allRows.length < 2) { diag.push(`${spec.name}: empty sheet`); continue; }

            const need  = [spec.nameCol, ...(spec.grantedViaCol ? [spec.grantedViaCol] : []), ...spec.itemCols, ...spec.perms];
            const found = this._findHeaderRow(allRows, [spec.nameCol]);
            if (!found) { diag.push(`${spec.name}: header row not found`); continue; }
            const { headerRow, headerIdx } = found;
            if (!need.every(c => headerRow.includes(c))) {
                const missing = need.filter(c => !headerRow.includes(c));
                diag.push(`${spec.name}: missing column(s) ${missing.join(', ')}`);
                continue;
            }

            const idx = {};
            need.forEach(c => { idx[c] = headerRow.indexOf(c); });

            let sheetRows = 0;
            for (let i = headerIdx + 1; i < allRows.length; i++) {
                const row = allRows[i];
                if (!row.length || row.length < headerRow.length || row.every(c => !c)) continue;
                const rawName = row[idx[spec.nameCol]] || '';
                if (!rawName) continue;
                const grantedVia = spec.grantedViaCol ? (row[idx[spec.grantedViaCol]] || '') : spec.grantedViaFixed;
                const profile = `${rawName} (${grantedVia})`;
                const item = spec.itemCols.map(c => row[idx[c]] || '').join(' / ');
                for (const perm of spec.perms) {
                    data.push({ profile, category: spec.name, item, permission: perm, value: row[idx[perm]] || '' });
                    sheetRows++;
                }
            }
            diag.push(`${spec.name}: ${sheetRows} rows`);
        }

        if (!data.length) return { data: null, error: `${source} file contains no recognizable Object Access data rows.` };
        return { data, error: null, summary: `${source} parsed — ${diag.join(' | ')}` };
    }

    // Profile Access comparison reads all 8 sheets of a ProfileAccess_*.xls export (from the
    // Profile Access tab) and flattens every permission cell into a generic
    // {profile, category, item, permission, value} row for the Apex comparator.
    _parseProfileAccessFile(xmlDoc, source) {
        const summaryWs = this._findWorksheet(xmlDoc, 'Profile Summary');
        const objPermWs = this._findWorksheet(xmlDoc, 'Object Permissions');
        if (!summaryWs || !objPermWs) {
            return { data: null, error: `${source} file does not look like a Profile Access export. Please upload a file generated from the Profile Access tab (Get Profile Details → Generate Excel).` };
        }

        const SHEETS = [
            { name: 'Object Permissions',   itemCols: ['Object Name'],                perms: ['Read','Create','Edit','Delete','View All','Modify All'] },
            { name: 'Field Permissions',    itemCols: ['Object Name','Field Name'],   perms: ['Readable','Editable'] },
            { name: 'Apex Class Access',    itemCols: ['Apex Class Name'],            perms: ['Enabled'] },
            { name: 'Visualforce Access',   itemCols: ['VF Page Name'],               perms: ['Enabled'] },
            { name: 'Tab Visibility',       itemCols: ['Tab Name'],                   perms: ['Visibility'] },
            { name: 'Application Access',   itemCols: ['Application Name'],           perms: ['Visible'] },
            { name: 'Record Type Access',   itemCols: ['Object Name','Record Type Name'], perms: ['Visible','Default'] },
            { name: 'Custom Permissions',   itemCols: ['API Name'],                   perms: ['Enabled'] }
        ];

        const data = [];
        const diag = []; // one entry per sheet, for the diagnostic toast — e.g. "Object Permissions: 6846 rows"
        for (const spec of SHEETS) {
            const ws = this._findWorksheet(xmlDoc, spec.name);
            if (!ws) { diag.push(`${spec.name}: sheet not found`); continue; }

            const allRows = this._readAllRows(ws);
            if (allRows.length < 2) { diag.push(`${spec.name}: empty sheet`); continue; }

            const need  = ['Profile Name', ...spec.itemCols, ...spec.perms];
            const found = this._findHeaderRow(allRows, ['Profile Name']);
            if (!found) { diag.push(`${spec.name}: header row not found`); continue; }
            const { headerRow, headerIdx } = found;
            if (!need.every(c => headerRow.includes(c))) {
                const missing = need.filter(c => !headerRow.includes(c));
                diag.push(`${spec.name}: missing column(s) ${missing.join(', ')}`);
                continue;
            }

            const idx = {};
            need.forEach(c => { idx[c] = headerRow.indexOf(c); });

            let sheetRows = 0;
            for (let i = headerIdx + 1; i < allRows.length; i++) {
                const row = allRows[i];
                // Sheets with zero rows render a single merged "No records." cell instead of
                // real columns — its cell count won't match the header, so it's not real data.
                if (!row.length || row.length < headerRow.length || row.every(c => !c)) continue;
                const profile = row[idx['Profile Name']] || '';
                if (!profile) continue;
                const item = spec.itemCols.map(c => row[idx[c]] || '').join('.');
                for (const perm of spec.perms) {
                    data.push({ profile, category: spec.name, item, permission: perm, value: row[idx[perm]] || '' });
                    sheetRows++;
                }
            }
            diag.push(`${spec.name}: ${sheetRows} rows`);
        }

        if (!data.length) return { data: null, error: `${source} file contains no recognizable Profile Access data rows.` };
        return { data, error: null, summary: `${source} parsed — ${diag.join(' | ')}` };
    }

    get isCompareDisabled()    { return !this.uatValid || !this.prodValid || this.isComparing; }
    // Both buttons work off the same uploaded files, independently of each other — Agentforce
    // does not require "Compare Access" to have been run first (an org without Agentforce can
    // still use Compare Access, and a user can go straight to Agentforce without an extra click).
    get isAgentforceDisabled() { return !this.uatValid || !this.prodValid || this.isAgentforcing; }
    get noCompResults()        { return this.showCompResults && this.filteredComp.length === 0; }

    get compareApexLabel()   { return this.isComparing    ? 'Comparing…'  : 'Compare Access'; }
    get agentforceLabel()    { return this.isAgentforcing ? 'Analyzing…'  : 'Analyze with Agentforce'; }

    get compStatusOptions() {
        return [
            { label: 'All',                  value: 'All' },
            { label: 'Same',                 value: 'Same' },
            { label: 'Difference',           value: 'Difference' },
            { label: 'Missing in UAT',       value: 'Missing in UAT' },
            { label: 'Missing in Production',value: 'Missing in Production' }
        ];
    }

    get compProfileOptions() {
        const profiles = [...new Set(this.compResults.map(r => r.profile))].sort();
        return [{ label: 'All Profiles', value: 'All' },
                ...profiles.map(p => ({ label: p, value: p }))];
    }

    // Runs the comparison entirely client-side — both Object Access and Profile Access parsers
    // (see _parseObjectAccessFile / _parseProfileAccessFile) now produce the same generic
    // {profile, category, item, permission, value} row shape, so one comparator covers both.
    // A System-Administrator-scale export can be 20,000+ permission rows per file; round-tripping
    // that through Apex would blow the 6MB synchronous heap limit (an uncatchable
    // System.LimitException), so this never goes through Apex — no size limit, and no data ever
    // leaves the browser.
    //
    // Resolves with the raw result — shared by both "Compare Access" and "Analyze with
    // Agentforce" so either button can be clicked independently of the other, without one
    // requiring the other to have run first.
    //
    // The diff itself is deferred one tick (setTimeout 0) so the browser actually gets a chance
    // to paint the calling button's spinner first — without this, the CPU-heavy loop runs in the
    // same synchronous call stack as the click, so the tab appears to freeze with zero visual
    // feedback until it's all done.
    _runComparison() {
        return new Promise((resolve, reject) => {
            setTimeout(() => {
                try {
                    resolve(this._compareGenericLocal(this._uatData, this._prodData));
                } catch (ex) {
                    reject(ex);
                }
            }, 0);
        });
    }

    handleCompareApex() {
        if (!this.uatValid || !this.prodValid) {
            this._toast('Upload Required', 'Please upload and validate both UAT and Production files first.', 'warning');
            return;
        }
        this.isComparing     = true;
        this.showCompResults = false;

        this._runComparison()
            .then(result => this._applyCompareResult(result))
            .catch(err => {
                this.isComparing = false;
                this._toast('Comparison Error', this._msg(err), 'error');
            });
    }

    _applyCompareResult(result, silent) {
        this.compResults  = result.rows || [];
        this.compSummary  = {
            totalObjects  : result.totalObjects,
            totalProfiles : result.totalProfiles,
            totalPerms    : result.totalPermissions,
            matching      : result.matching,
            differences   : result.differences,
            missingInUat  : result.missingInUat,
            missingInProd : result.missingInProd
        };
        this._applyFilters();
        this.showCompResults = true;
        this.isComparing     = false;
        if (!silent) {
            this._toast(
                'Comparison Complete',
                `${result.differences} difference(s) found across ${result.totalPermissions} permission(s).`,
                result.differences > 0 ? 'warning' : 'success'
            );
        }
    }

    _normalizeCompareVal(permission, val) {
        if (permission === 'Visibility') return val ? String(val).trim() : '-';
        if (val === undefined || val === null || val === '') return 'No';
        const lower = String(val).toLowerCase().trim();
        return (lower === 'true' || lower === 'yes' || lower === '1' || lower === 'y') ? 'Yes' : 'No';
    }

    _compareGenericLocal(uatRows, prodRows) {
        const keyOf = r => `${r.profile}|${r.category}|${r.item}|${r.permission}`;
        const uatMap  = new Map();
        const prodMap = new Map();
        const allProfiles = new Set();
        const allItems    = new Set();

        (uatRows || []).forEach(r => {
            if (!r.profile || !r.item || !r.permission) return;
            uatMap.set(keyOf(r), r);
            allProfiles.add(r.profile); allItems.add(`${r.category}: ${r.item}`);
        });
        (prodRows || []).forEach(r => {
            if (!r.profile || !r.item || !r.permission) return;
            prodMap.set(keyOf(r), r);
            allProfiles.add(r.profile); allItems.add(`${r.category}: ${r.item}`);
        });

        const allKeys = new Set([...uatMap.keys(), ...prodMap.keys()]);
        const result = {
            rows: [], totalObjects: allItems.size, totalProfiles: allProfiles.size,
            totalPermissions: 0, matching: 0, differences: 0, missingInUat: 0, missingInProd: 0
        };

        allKeys.forEach(key => {
            const uRow = uatMap.get(key);
            const pRow = prodMap.get(key);
            const anyRow = uRow || pRow;
            result.totalPermissions++;
            const row = {
                profile    : anyRow.profile,
                objectLabel: anyRow.category,
                apiName    : anyRow.item,
                permission : anyRow.permission
            };
            if (!uRow) {
                row.uatValue = '-'; row.prodValue = this._normalizeCompareVal(row.permission, pRow.value);
                row.status = 'Missing in UAT'; result.missingInUat++;
            } else if (!pRow) {
                row.uatValue = this._normalizeCompareVal(row.permission, uRow.value); row.prodValue = '-';
                row.status = 'Missing in Production'; result.missingInProd++;
            } else {
                const uv = this._normalizeCompareVal(row.permission, uRow.value);
                const pv = this._normalizeCompareVal(row.permission, pRow.value);
                row.uatValue = uv; row.prodValue = pv;
                if (uv === pv) { row.status = 'Same'; result.matching++; }
                else            { row.status = 'Difference'; result.differences++; }
            }
            result.rows.push(row);
        });

        return result;
    }

    // Extracts just the Deployment Readiness verdict badge from the AI's response. Relies on the
    // fixed 6-section structure the prompt template requires (1. Executive Summary … 6. Deployment
    // Readiness). If the model didn't follow that format, no verdict is shown.
    _parseAgentforceResponse(text) {
        if (!text) return { sections: [], verdict: null };

        const SECTION_MATCHERS = {
            1: /executive\s+summary/i, 2: /critical\s+risks/i, 3: /missing\s+in\s+production/i,
            4: /missing\s+in\s+uat/i,  5: /recommendations/i,  6: /deployment\s+readiness/i
        };
        const headerRe = /^#{0,4}\s*([1-6])\.\s*(.+)$/;

        const rawSections = {};
        let currentNum = null;
        text.split('\n').forEach(rawLine => {
            const line = rawLine.trim();
            const m = line.match(headerRe);
            if (m && SECTION_MATCHERS[Number(m[1])].test(m[2])) {
                currentNum = Number(m[1]); rawSections[currentNum] = rawSections[currentNum] || []; return;
            }
            if (currentNum && line) rawSections[currentNum].push(line);
        });

        if (!Object.keys(rawSections).length) return { sections: [], verdict: null };

        let verdict = null;
        const joined = (rawSections[6] || []).join(' ');
        if (/do not deploy/i.test(joined))          verdict = { label: 'Do Not Deploy',      badgeClass: 'pam-verdict pam-verdict--red' };
        else if (/deploy with caution/i.test(joined)) verdict = { label: 'Deploy with Caution', badgeClass: 'pam-verdict pam-verdict--orange' };
        else if (/ready to deploy/i.test(joined))     verdict = { label: 'Ready to Deploy',     badgeClass: 'pam-verdict pam-verdict--green' };

        return { verdict };
    }

    handleAnalyzeAgentforce() {
        if (!this.uatValid || !this.prodValid) {
            this._toast('Upload Required', 'Please upload and validate both UAT and Production files first.', 'warning');
            return;
        }
        this.isAgentforcing = true;
        this.showAgentforce = false;
        this.agentforceStatusFilter  = 'All';
        this.agentforceProfileFilter = 'All';
        this.agentforceObjectSearch  = '';
        this.agentforceSortField     = null;
        this.agentforceSortDir       = 'asc';
        this.agentforcePage          = 1;

        // Fully independent of "Compare Access" — computes the diff itself internally (so this
        // button works even if Compare Access was never clicked).
        //
        // The summary stat cards shown here come from this real, locally-computed result — never
        // from the AI's text — so the headline numbers are guaranteed accurate even though the
        // deployment verdict is AI-generated.
        let summary  = null;
        let fullRows = [];
        this._runComparison()
            .then(result => {
                fullRows = result.rows;
                const diffs = result.rows.filter(r => r.status !== 'Same').slice(0, 200);
                summary = {
                    totalObjects : result.totalObjects, totalProfiles: result.totalProfiles,
                    totalPerms   : result.totalPermissions, matching: result.matching,
                    differences  : result.differences, missingInUat: result.missingInUat,
                    missingInProd: result.missingInProd
                };
                return analyzeWithAgentforce({ comparisonJson: JSON.stringify({ summary, differences: diffs }) });
            })
            .then(result => {
                this.agentforceSummary = summary;
                this.agentforceRows    = fullRows;
                this._applyAgentforceFilters();
                const parsed = this._parseAgentforceResponse(result);
                this.agentforceVerdict  = parsed.verdict;
                this.showAgentforce   = true;
                this.isAgentforcing   = false;
            })
            .catch(err => {
                this.agentforceSummary = null;
                this.agentforceRows    = [];
                this.agentforceFilteredRows = [];
                this.agentforceVerdict  = null;
                this.showAgentforce   = false;
                this.isAgentforcing   = false;
                const msg = this._msg(err);
                // Apex only surfaces "Agentforce ..." error text for genuine configuration/licensing
                // failures (Prompt Builder not enabled, template missing, permission missing) — never
                // for unrelated errors. On that signal, stop offering the button for this session
                // instead of letting the user repeatedly hit the same known failure.
                if (/Agentforce/i.test(msg)) {
                    this.agentforceAvailable = false;
                    this.agentforceUnavailableReason = msg;
                }
                this._toast('Agentforce Error', msg, 'error');
            });
    }

    handleCompStatusFilter(e) {
        this.compStatusFilter = e.target.value;
        this._applyFilters();
    }

    handleCompProfileFilter(e) {
        this.compProfileFilter = e.target.value;
        this._applyFilters();
    }

    handleCompObjectSearch(e) {
        this.compObjectSearch = e.target.value;
        this._applyFilters();
    }

    handleCompSort(e) {
        const field = e.currentTarget.dataset.field;
        if (this.compSortField === field) {
            this.compSortDir = this.compSortDir === 'asc' ? 'desc' : 'asc';
        } else {
            this.compSortField = field;
            this.compSortDir = 'asc';
        }
        this._applyFilters();
    }

    get compSortIndicators() {
        const mk = (f) => this.compSortField === f ? (this.compSortDir === 'desc' ? ' ▼' : ' ▲') : ' ⇅';
        return {
            profile: mk('profile'), objectLabel: mk('objectLabel'),
            apiName: mk('apiName'), permission: mk('permission'), status: mk('status')
        };
    }

    _applyFilters() {
        const status  = this.compStatusFilter  || 'All';
        const profile = this.compProfileFilter || 'All';
        const search  = (this.compObjectSearch || '').toLowerCase().trim();

        let rows = this.compResults.filter(r => {
            if (status  !== 'All' && r.status  !== status)  return false;
            if (profile !== 'All' && r.profile !== profile) return false;
            if (search  && !(r.apiName || '').toLowerCase().includes(search)) return false;
            return true;
        });
        rows = this._sortRows(rows, this.compSortField, this.compSortDir);
        this.filteredComp = rows.map((r, i) => this._decorateCompRow(r, i));
        this.compPage = 1;
    }

    // Comparison result sets can be tens of thousands of rows — only the current page is ever
    // rendered into the DOM, otherwise the browser tab freezes trying to paint all of it at once.
    get pagedComp() {
        const start = (this.compPage - 1) * this.compPageSize;
        return this.filteredComp.slice(start, start + this.compPageSize);
    }

    get compTotalPages() { return Math.max(1, Math.ceil(this.filteredComp.length / this.compPageSize)); }
    get compPageInfo()   { return `Page ${this.compPage} of ${this.compTotalPages}`; }
    get isCompPrevDisabled() { return this.compPage <= 1; }
    get isCompNextDisabled() { return this.compPage >= this.compTotalPages; }
    get showCompPagination() { return this.filteredComp.length > this.compPageSize; }

    handleCompPrevPage() { if (this.compPage > 1) this.compPage--; }
    handleCompNextPage() { if (this.compPage < this.compTotalPages) this.compPage++; }

    handleCompPageSizeChange(e) {
        this.compPageSize = Number(e.target.value) || COMP_PAGE_SIZE;
        this.compPage = 1;
    }

    handleCompJumpToPage(e) {
        const val = parseInt(e.target.value, 10);
        if (!isNaN(val)) {
            this.compPage = Math.min(Math.max(val, 1), this.compTotalPages);
        }
        e.target.value = this.compPage;
    }

    get isCompPageSize200()  { return this.compPageSize === 200; }
    get isCompPageSize500()  { return this.compPageSize === 500; }
    get isCompPageSize1000() { return this.compPageSize === 1000; }

    _compRowClass(status) {
        if (status === 'Difference')            return 'comp-row comp-row--diff';
        if (status === 'Missing in UAT')        return 'comp-row comp-row--missing-uat';
        if (status === 'Missing in Production') return 'comp-row comp-row--missing-prod';
        return 'comp-row';
    }

    _statusBadgeClass(status) {
        if (status === 'Same')                  return 'comp-badge comp-badge--same';
        if (status === 'Difference')            return 'comp-badge comp-badge--diff';
        if (status === 'Missing in UAT')        return 'comp-badge comp-badge--missing-uat';
        if (status === 'Missing in Production') return 'comp-badge comp-badge--missing-prod';
        return 'comp-badge';
    }

    _decorateCompRow(r, i) {
        return {
            ...r,
            rowKey          : 'ar-' + i,
            rowClass        : this._compRowClass(r.status),
            statusBadgeClass: this._statusBadgeClass(r.status),
            uatCellClass    : r.status === 'Difference' ? 'comp-val comp-val--diff' : 'comp-val',
            prodCellClass   : r.status === 'Difference' ? 'comp-val comp-val--diff' : 'comp-val'
        };
    }

    get compSummaryFmt() {
        if (!this.compSummary) return null;
        const s = this.compSummary;
        return {
            totalObjects : this._fmt(s.totalObjects),
            totalProfiles: this._fmt(s.totalProfiles),
            totalPerms   : this._fmt(s.totalPerms),
            matching     : this._fmt(s.matching),
            differences  : this._fmt(s.differences),
            missingInUat : this._fmt(s.missingInUat),
            missingInProd: this._fmt(s.missingInProd)
        };
    }

    get agentforceSummaryFmt() {
        if (!this.agentforceSummary) return null;
        const s = this.agentforceSummary;
        return {
            totalObjects : this._fmt(s.totalObjects),
            totalProfiles: this._fmt(s.totalProfiles),
            totalPerms   : this._fmt(s.totalPerms),
            matching     : this._fmt(s.matching),
            differences  : this._fmt(s.differences),
            missingInUat : this._fmt(s.missingInUat),
            missingInProd: this._fmt(s.missingInProd)
        };
    }

    // ── Agentforce comparison table — independent filters/sort/pagination from Compare Access ──
    get agentforceStatusOptions()  { return this.compStatusOptions; }
    get agentforceProfileOptions() {
        const profiles = [...new Set(this.agentforceRows.map(r => r.profile))].sort();
        return [{ label: 'All Profiles', value: 'All' }, ...profiles.map(p => ({ label: p, value: p }))];
    }

    handleAgentforceStatusFilter(e)  { this.agentforceStatusFilter  = e.target.value; this._applyAgentforceFilters(); }
    handleAgentforceProfileFilter(e) { this.agentforceProfileFilter = e.target.value; this._applyAgentforceFilters(); }
    handleAgentforceObjectSearch(e)  { this.agentforceObjectSearch  = e.target.value; this._applyAgentforceFilters(); }

    handleAgentforceSort(e) {
        const field = e.currentTarget.dataset.field;
        if (this.agentforceSortField === field) {
            this.agentforceSortDir = this.agentforceSortDir === 'asc' ? 'desc' : 'asc';
        } else {
            this.agentforceSortField = field;
            this.agentforceSortDir = 'asc';
        }
        this._applyAgentforceFilters();
    }

    get agentforceSortIndicators() {
        const mk = (f) => this.agentforceSortField === f ? (this.agentforceSortDir === 'desc' ? ' ▼' : ' ▲') : ' ⇅';
        return {
            profile: mk('profile'), objectLabel: mk('objectLabel'),
            apiName: mk('apiName'), permission: mk('permission'), status: mk('status')
        };
    }

    _applyAgentforceFilters() {
        const status  = this.agentforceStatusFilter  || 'All';
        const profile = this.agentforceProfileFilter || 'All';
        const search  = (this.agentforceObjectSearch || '').toLowerCase().trim();

        let rows = this.agentforceRows.filter(r => {
            if (status  !== 'All' && r.status  !== status)  return false;
            if (profile !== 'All' && r.profile !== profile) return false;
            if (search  && !(r.apiName || '').toLowerCase().includes(search)) return false;
            return true;
        });
        rows = this._sortRows(rows, this.agentforceSortField, this.agentforceSortDir);
        this.agentforceFilteredRows = rows.map((r, i) => this._decorateCompRow(r, i));
        this.agentforcePage = 1;
    }

    get noAgentforceResults() { return this.agentforceFilteredRows.length === 0; }

    get pagedAgentforceRows() {
        const start = (this.agentforcePage - 1) * this.agentforcePageSize;
        return this.agentforceFilteredRows.slice(start, start + this.agentforcePageSize);
    }

    get agentforceTotalPages() { return Math.max(1, Math.ceil(this.agentforceFilteredRows.length / this.agentforcePageSize)); }
    get agentforcePageInfo()   { return `Page ${this.agentforcePage} of ${this.agentforceTotalPages}`; }
    get isAgentforcePrevDisabled() { return this.agentforcePage <= 1; }
    get isAgentforceNextDisabled() { return this.agentforcePage >= this.agentforceTotalPages; }
    get showAgentforcePagination() { return this.agentforceFilteredRows.length > this.agentforcePageSize; }

    handleAgentforcePrevPage() { if (this.agentforcePage > 1) this.agentforcePage--; }
    handleAgentforceNextPage() { if (this.agentforcePage < this.agentforceTotalPages) this.agentforcePage++; }

    handleAgentforcePageSizeChange(e) {
        this.agentforcePageSize = Number(e.target.value) || COMP_PAGE_SIZE;
        this.agentforcePage = 1;
    }

    handleAgentforceJumpToPage(e) {
        const val = parseInt(e.target.value, 10);
        if (!isNaN(val)) {
            this.agentforcePage = Math.min(Math.max(val, 1), this.agentforceTotalPages);
        }
        e.target.value = this.agentforcePage;
    }

    get isAgentforcePageSize200()  { return this.agentforcePageSize === 200; }
    get isAgentforcePageSize500()  { return this.agentforcePageSize === 500; }
    get isAgentforcePageSize1000() { return this.agentforcePageSize === 1000; }

    handleExportComparison() {
        try {
            const diffs = this.compResults.filter(r => r.status !== 'Same');
            const s     = this.compSummary || {};

            const colCat  = this.compColLabelCategory;
            const colItem = this.compColLabelItem;
            const sheets = [
                {
                    name   : 'Comparison',
                    headers: ['Profile', colCat, colItem, 'Permission','UAT','Production','Status'],
                    rows   : this.compResults.map(r => [
                        r.profile, r.objectLabel || r.apiName, r.apiName,
                        r.permission, r.uatValue, r.prodValue, r.status
                    ])
                },
                {
                    name   : 'Summary',
                    headers: ['Metric','Value'],
                    rows   : [
                        ['Comparison Type',           this.comparisonType],
                        ['Total Items Compared',      String(s.totalObjects  || 0)],
                        ['Total Profiles Compared',   String(s.totalProfiles || 0)],
                        ['Total Permissions Compared',String(s.totalPerms    || 0)],
                        ['Matching Permissions',      String(s.matching      || 0)],
                        ['Different Permissions',     String(s.differences   || 0)],
                        ['Missing in UAT',            String(s.missingInUat  || 0)],
                        ['Missing in Production',     String(s.missingInProd || 0)]
                    ]
                },
                {
                    name   : 'Differences',
                    headers: ['Profile', colCat, colItem, 'Permission','UAT','Production','Status'],
                    rows   : diffs.map(r => [
                        r.profile, r.objectLabel || r.apiName, r.apiName,
                        r.permission, r.uatValue, r.prodValue, r.status
                    ])
                }
            ];

            const xml = this._buildXls(sheets, ['UAT vs Production Comparison']);
            const ts  = new Date().toISOString().slice(0, 10).replace(/-/g, '');
            this._triggerDownload(xml, `AccessComparison_${ts}.xls`);
            this._toast('Downloaded', 'Comparison Excel (3 sheets) generated.', 'success');
        } catch (ex) {
            this._toast('Export Error', ex.message || 'Could not generate file.', 'error');
        }
    }

    // Exports the Agentforce panel's own comparison data + AI verdict — entirely independent
    // of "Export Comparison Excel" (which exports the Compare Access table). Two buttons, two
    // separate files, matching the rest of this tab's "don't run/depend on each other" design.
    handleExportAgentforceComparison() {
        try {
            const diffs = this.agentforceRows.filter(r => r.status !== 'Same');
            const s     = this.agentforceSummary || {};

            const colCat  = this.compColLabelCategory;
            const colItem = this.compColLabelItem;
            const sheets = [
                {
                    name   : 'Comparison',
                    headers: ['Profile', colCat, colItem, 'Permission','UAT','Production','Status'],
                    rows   : this.agentforceRows.map(r => [
                        r.profile, r.objectLabel || r.apiName, r.apiName,
                        r.permission, r.uatValue, r.prodValue, r.status
                    ])
                },
                {
                    name   : 'Summary',
                    headers: ['Metric','Value'],
                    rows   : [
                        ['Comparison Type',           this.comparisonType],
                        ['Total Items Compared',      String(s.totalObjects  || 0)],
                        ['Total Profiles Compared',   String(s.totalProfiles || 0)],
                        ['Total Permissions Compared',String(s.totalPerms    || 0)],
                        ['Matching Permissions',      String(s.matching      || 0)],
                        ['Different Permissions',     String(s.differences   || 0)],
                        ['Missing in UAT',            String(s.missingInUat  || 0)],
                        ['Missing in Production',     String(s.missingInProd || 0)],
                        ['Deployment Readiness',      this.agentforceVerdict ? this.agentforceVerdict.label : 'N/A']
                    ]
                },
                {
                    name   : 'Differences',
                    headers: ['Profile', colCat, colItem, 'Permission','UAT','Production','Status'],
                    rows   : diffs.map(r => [
                        r.profile, r.objectLabel || r.apiName, r.apiName,
                        r.permission, r.uatValue, r.prodValue, r.status
                    ])
                }
            ];

            const xml = this._buildXls(sheets, ['UAT vs Production Comparison (Agentforce)']);
            const ts  = new Date().toISOString().slice(0, 10).replace(/-/g, '');
            this._triggerDownload(xml, `AgentforceComparison_${ts}.xls`);
            this._toast('Downloaded', 'Agentforce Comparison Excel (3 sheets) generated.', 'success');
        } catch (ex) {
            this._toast('Export Error', ex.message || 'Could not generate file.', 'error');
        }
    }

    // ═════════════════════════════════════════════════════════════════════════
    // SHARED HELPERS – TOAST, EXCEL BUILDER, MISC
    // (Pure utilities only — hold no tab-specific state.)
    // ═════════════════════════════════════════════════════════════════════════

    _toast(title, message, type) {
        if (this._toastTimer) clearTimeout(this._toastTimer);
        this.toastTitle   = title;
        this.toastMessage = message;
        this.toastType    = type || 'success';
        this.toastVisible = true;
        this._toastTimer  = setTimeout(() => { this.toastVisible = false; }, TOAST_MS);
    }

    _msg(err) {
        if (err && err.body && err.body.message) return err.body.message;
        if (err && err.message)                  return err.message;
        return 'An unexpected error occurred.';
    }

    _triggerDownload(xml, filename) {
        try {
            const dataUri = 'data:application/vnd.ms-excel;charset=utf-8,'
                + encodeURIComponent('﻿' + xml);
            const link = document.createElement('a');
            link.setAttribute('href', dataUri);
            link.setAttribute('download', filename);
            link.style.display = 'none';
            document.body.appendChild(link);
            link.click();
            setTimeout(() => document.body.removeChild(link), 500);
        } catch (dlErr) {
            this._toast('Download Error', 'Could not download file. Try a different browser.', 'error');
        }
    }

    /** Tab 1 profile access download (unchanged from before). */
    _downloadProfileExcel(profileDataList) {
        try {
            const sheets = [
                {
                    name   : 'Profile Summary',
                    headers: ['Profile Name', 'API Name', 'User License', 'Description'],
                    rows   : profileDataList.map(p => [
                        p.profileName    || '',
                        p.profileApiName || '',
                        p.userLicense    || '',
                        p.description    || ''
                    ])
                },
                {
                    name   : 'Object Permissions',
                    headers: ['Profile Name', 'Object Name', 'Read', 'Create', 'Edit', 'Delete', 'View All', 'Modify All'],
                    rows   : profileDataList.flatMap(p =>
                        (p.objectPerms || []).map(o => [
                            p.profileName, o.objectName,
                            this._b(o.canRead), this._b(o.canCreate), this._b(o.canEdit),
                            this._b(o.canDelete), this._b(o.canViewAll), this._b(o.canModifyAll)
                        ])
                    )
                },
                {
                    name   : 'Field Permissions',
                    headers: ['Profile Name', 'Object Name', 'Field Name', 'Readable', 'Editable'],
                    rows   : profileDataList.flatMap(p =>
                        (p.fieldPerms || []).map(f => [
                            p.profileName, f.objectName, f.fieldName,
                            this._b(f.isReadable), this._b(f.isEditable)
                        ])
                    )
                },
                {
                    name   : 'Apex Class Access',
                    headers: ['Profile Name', 'Apex Class Name', 'Enabled'],
                    rows   : profileDataList.flatMap(p =>
                        (p.apexClassAccess || []).map(a => [p.profileName, a.className, this._b(a.isEnabled)])
                    )
                },
                {
                    name   : 'Visualforce Access',
                    headers: ['Profile Name', 'VF Page Name', 'Enabled'],
                    rows   : profileDataList.flatMap(p =>
                        (p.vfPageAccess || []).map(v => [p.profileName, v.pageName, this._b(v.isEnabled)])
                    )
                },
                {
                    name   : 'Tab Visibility',
                    headers: ['Profile Name', 'Tab Name', 'Visibility'],
                    rows   : profileDataList.flatMap(p =>
                        (p.tabVisibility || []).map(t => [p.profileName, t.tabName, t.visibility || ''])
                    )
                },
                {
                    name   : 'Application Access',
                    headers: ['Profile Name', 'Application Name', 'Visible'],
                    rows   : profileDataList.flatMap(p =>
                        (p.appAccess || []).map(a => [p.profileName, a.appName, this._b(a.isVisible)])
                    )
                },
                {
                    name   : 'Record Type Access',
                    headers: ['Profile Name', 'Object Name', 'Record Type Name', 'Visible', 'Default'],
                    rows   : profileDataList.flatMap(p =>
                        (p.recordTypeAccess || []).map(r => [
                            p.profileName, r.objectName, r.recordTypeName,
                            this._b(r.isVisible), this._b(r.isDefault)
                        ])
                    )
                },
                {
                    name   : 'Custom Permissions',
                    headers: ['Profile Name', 'API Name', 'Label', 'Enabled'],
                    rows   : profileDataList.flatMap(p =>
                        (p.customPerms || []).map(c => [
                            p.profileName, c.permissionName, c.permissionLabel, this._b(c.isEnabled)
                        ])
                    )
                }
            ];

            const xml      = this._buildXls(sheets, profileDataList.map(p => p.profileName));
            const ts       = new Date().toISOString().slice(0, 10).replace(/-/g, '');
            const filename = `ProfileAccess_${ts}.xls`;
            this._triggerDownload(xml, filename);
        } catch (ex) {
            this._toast('Export Error', ex.message || 'Could not generate file.', 'error');
        }
    }

    _buildXls(sheets, profileNames) {
        const e    = s => String(s == null ? '' : s)
            .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
        const pStr = (profileNames || []).join(', ');
        let   ws   = '';

        sheets.forEach(sh => {
            const numCols  = sh.headers.length;
            const numData  = sh.rows.length;
            const totalRows = 2 + (numData > 0 ? numData : 1);
            let rows = '';

            rows += `\n    <Row ss:StyleID="si">` +
                    `<Cell ss:MergeAcross="${numCols - 1}">` +
                    `<Data ss:Type="String">Scope: ${e(pStr)}</Data>` +
                    `</Cell></Row>`;

            rows += '\n    <Row ss:StyleID="sh">';
            sh.headers.forEach(h => { rows += `<Cell><Data ss:Type="String">${e(h)}</Data></Cell>`; });
            rows += '</Row>';

            if (numData === 0) {
                rows += `\n    <Row><Cell ss:MergeAcross="${numCols - 1}">` +
                        `<Data ss:Type="String">No records.</Data></Cell></Row>`;
            } else {
                sh.rows.forEach(r => {
                    rows += '\n    <Row>';
                    r.forEach(c => { rows += `<Cell><Data ss:Type="String">${e(c)}</Data></Cell>`; });
                    rows += '</Row>';
                });
            }

            ws += `\n  <Worksheet ss:Name="${e(sh.name)}">` +
                  `\n    <Table` +
                  ` ss:ExpandedRowCount="${totalRows}"` +
                  ` ss:ExpandedColumnCount="${numCols}"` +
                  ` ss:DefaultColumnWidth="120"` +
                  ` ss:DefaultRowHeight="15"` +
                  `>${rows}\n    </Table>` +
                  `\n  </Worksheet>`;
        });

        return `<?xml version="1.0" encoding="UTF-8"?><?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
          xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
          xmlns:x="urn:schemas-microsoft-com:office:excel">
  <Styles>
    <Style ss:ID="Default"><Font ss:FontName="Calibri" ss:Size="11"/></Style>
    <Style ss:ID="sh">
      <Font ss:Bold="1" ss:Color="#FFFFFF" ss:FontName="Calibri" ss:Size="11"/>
      <Interior ss:Color="#0176D3" ss:Pattern="Solid"/>
      <Alignment ss:Horizontal="Center" ss:Vertical="Center" ss:WrapText="0"/>
      <Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#004E9A"/></Borders>
    </Style>
    <Style ss:ID="si">
      <Font ss:Bold="1" ss:Color="#032D60" ss:FontName="Calibri" ss:Size="10"/>
      <Interior ss:Color="#E8F4FD" ss:Pattern="Solid"/>
    </Style>
  </Styles>${ws}
</Workbook>`;
    }

    _fmt(n) { return Number(n || 0).toLocaleString('en-US'); }

    _sortRows(rows, field, dir) {
        if (!field) return rows;
        const mult = dir === 'desc' ? -1 : 1;
        return [...rows].sort((a, b) => {
            const av = String(a[field] == null ? '' : a[field]).toLowerCase();
            const bv = String(b[field] == null ? '' : b[field]).toLowerCase();
            if (av < bv) return -1 * mult;
            if (av > bv) return 1 * mult;
            return 0;
        });
    }

    _setsEqual(a, b) {
        if (a.size !== b.size) return false;
        for (const v of a) if (!b.has(v)) return false;
        return true;
    }

    _b(v) {
        if (v === true  || v === 'true')  return 'Yes';
        if (v === false || v === 'false') return 'No';
        return String(v == null ? '' : v);
    }
}