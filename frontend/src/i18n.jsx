import React from 'react';
import { flushSync } from 'react-dom';
import { ChevronDown, Languages } from 'lucide-react';

export const I18N = {
  en: {
    // -- Auth / Login ----------------------------------------------------------
    login: 'Login', signingIn: 'Signing in...', username: 'Username', password: 'Password',
    enterpriseLogin: 'Enterprise Login - GSC LLC',
    signIn: 'Sign In', enterpriseSecurity: 'Enterprise Security Platform',
    secureSignIn: 'Secure Sign In', usernameLabel: 'USERNAME', passwordLabel: 'PASSWORD',
    enterUsername: 'Enter username', enterPassword: 'Enter password',
    usernamePasswordRequired: 'Username and password required',
    loginFailed: 'Login failed', backendConnectionFailed: 'Backend connection failed',

    // -- Navigation ------------------------------------------------------------
    dashboard: 'Dashboard', events: 'Face Events', eventSettings: 'Event',
    persons: 'Persons Database', attendance: 'Attendance', search: 'Search by Picture',
    cameras: 'Cameras', users: 'Users / Roles', auditLogs: 'Audit Logs',
    logout: 'Logout', lightMode: 'Light Mode', darkMode: 'Dark Mode',
    powered: 'Powered by GSC LLC',
    navOverview: 'OVERVIEW', navIntelligence: 'ANALYTICS',
    navInfrastructure: 'INFRASTRUCTURE', navSettings: 'SETTINGS',

    // -- WebSocket status ------------------------------------------------------
    wsLive: 'WebSocket Live', wsConnecting: 'Connecting...',
    wsReconnecting: 'Reconnecting...', wsDisconnected: 'Disconnected',
    wsLiveShort: 'Live', wsConnectingShort: 'Connecting',
    wsReconnectingShort: 'Reconnecting', wsOffline: 'Offline',

    // -- Page titles -----------------------------------------------------------
    realtime: 'Real-time Face Analytics', faceEvents: 'Face Capture Events',
    personsDb: 'Employee / VIP / Blacklist Database',
    attendanceTitle: 'Attendance / Visit Timeline',
    usersTitle: 'Users / Roles Management', camerasTitle: 'Camera Management',
    auditLogsTitle: 'Audit Logs / Security Trail',

    // -- Stats / Dashboard -----------------------------------------------------
    totalEvents: 'Total Events', todayEvents: 'Events Today', activeCameras: 'Active Cameras',
    registeredPersons: 'Registered Persons', employees: 'Employees',
    vipClients: 'VIP Clients', blacklist: 'Blacklist', lowQuality: 'Low Quality',
    latestCaptures: 'Latest Captures', topCameras: 'Top Cameras',
    hourly: 'Today Hourly Face Captures',

    // -- Person management -----------------------------------------------------
    registerPerson: 'Register Person',
    registerHint: 'Choose an uploaded image or select a Face Event from camera captures.',
    uploadRegister: 'Upload Image & Register', selectFromEvents: 'Select from Face Events',
    fullName: 'Full name', departmentCompany: 'Department / Company',
    phone: 'Phone', notes: 'Notes', cancel: 'Cancel', save: 'Save',
    delete: 'Delete', history: 'History', fullHistory: 'Full History', close: 'Close',
    edit: 'Edit', face: 'Face', saving: 'Saving...',
    unknownPerson: 'Unknown Person', unnamed: 'Unnamed Person',
    noAdditionalInfo: 'No additional info',
    employeeOption: 'Employee', vipOption: 'VIP Client', blacklistOption: 'Blacklist',
    personRegistered: 'Person registered',
    chooseAtLeastOneImage: 'Choose at least 1 image',
    writeFullName: 'Write full name', selectEvent: 'Select event',
    dragDropHint: 'Drag & drop photos here, or click to select',
    dragDropSub: 'Up to 5 photos - Embeddings are averaged for accuracy',
    addMore: 'Add more',
    noPersonsRegistered: 'No persons registered',
    noPersonsHint: 'Register your first person using a face event or upload.',
    deletePersonConfirm: 'Delete this registered person? Events will remain, but person will be unlinked.',

    // -- Search ----------------------------------------------------------------
    allGroups: 'All Groups', allPersons: 'All Persons', unknown: 'Unknown',
    results: 'Results', chooseImage: 'Choose image',
    searchHint: 'Upload a face image and the system will find similar Face Events.',
    searching: 'Searching...', similarity: 'Similarity', match: 'Match', quality: 'Quality',

    // -- Events grid -----------------------------------------------------------
    allTime: 'All time', today: 'Today', thisWeek: 'This week', yesterday: 'Yesterday',
    allCameras: 'All Cameras', lowQShort: 'Low Q',
    searchByPerson: 'Search by person name...',
    exportCsv: 'Export CSV', deleteSelected: 'Delete selected', clearSelection: 'Clear',
    noEventsYet: 'No face events yet',
    waitingForCaptures: 'Waiting for camera captures...',
    noEventsMatchFilter: 'No events match the current filter',
    clearAllFilters: 'Clear all filters',
    deleteEventConfirm: 'Delete this event?',

    // -- Cameras ---------------------------------------------------------------
    addCamera: 'Add Camera', editCamera: 'Edit Camera', updateCamera: 'Update Camera',
    addNewCamera: 'Add New Camera', saveChanges: 'Save Changes',
    cameraName: 'Camera name', ipAddress: 'IP address e.g. 172.16.11.197',
    rtspPort: 'Port', channel: 'Camera line', location: 'Location',
    activeLabel: 'Active', aiEnabled: 'Detection Enabled', liveEnabled: 'Live Enabled',
    cancelEdit: 'Cancel Edit', noLocation: 'No location',
    aiDetection: 'Detection', liveStream: 'Live Stream',
    directionLabel: 'Direction',
    bidirectional: 'Bidirectional (default)',
    entranceOnly: 'Entrance (IN only)', exitOnly: 'Exit (OUT only)',
    rtspOverride: 'Stream override',
    cameraNamePlaceholder: 'e.g. Main Entrance',
    locationPlaceholder: 'e.g. Building A - Floor 1',
    inLabel: 'IN', outLabel: 'OUT', bothLabel: 'BOTH',
    streamUnavailable: 'Stream unavailable',
    cannotReachServer: 'Cannot reach server',
    cameraCreated: 'Camera created', cameraUpdated: 'Camera updated',
    cameraDeleted: 'Camera deleted',
    failedToDeleteCamera: 'Failed to delete camera',
    failedToUpdateCamera: 'Failed to update camera',
    failedToCreateCamera: 'Failed to create camera',
    deleteCamera: 'Delete this camera?',
    noCamerasConfigured: 'No cameras configured',
    noCamerasHint: 'Add your first camera to start receiving face events.',

    // -- Users -----------------------------------------------------------------
    createUser: 'Create User', create: 'Create', role: 'Role',
    active: 'Active', inactive: 'Inactive',
    viewerNote: 'Viewer mode: you can view data, but cannot register, edit or delete.',
    adminCreateUserNote: 'Admin can create Operator or Viewer accounts.',
    userCreated: 'User created', userStatusUpdated: 'User status updated',
    permissionsUpdated: 'Permissions updated',
    failedToUpdate: 'Failed to update', failedToDelete: 'Failed to delete',
    cannotDeleteYourself: 'You cannot delete yourself',
    keepUsersRoles: 'Keep Users / Roles enabled for your own account',
    securityAlertOwn: 'Security Alert: You cannot deactivate your own admin account!',
    readOnly: 'Read only', operator: 'Operator',
    fullAccess: 'Full access', adminTools: 'Admin tools', operations: 'Operations',
    fullAccessLocked: 'Full access locked',
    selected: 'selected', seeMore: 'See more', hideDetails: 'Hide details',
    cannotChangeOwnStatus: 'Cannot change own status',

    // -- Person history / detail -----------------------------------------------
    personHistory: 'Person History', totalDetections: 'Total detections',
    uniqueCameras: 'Unique cameras', firstSeen: 'First seen', lastSeen: 'Last seen',
    seenCount: 'Seen count', timeline: 'Timeline', camerasList: 'Cameras', faceId: 'Face ID',
    loadingHistory: 'Loading history...', historyLoadFailed: 'History load failed',
    historyConnectionFailed: 'Backend connection failed while loading history',
    unnamedPerson: 'Unnamed Person', targetId: 'Target ID', mergeInto: 'Merge into',
    mergeUnknownHint: 'Merge this unknown person into the target person ID',
    crossCameraJourney: 'Cross-Camera Journey', loadingJourney: 'Loading journey...',
    cameraAppearances: 'camera appearances', noJourneyData: 'No journey data yet.',
    totalVisits: 'Total visits', last7Days: 'Last 7 days', activityByHour: 'Activity by hour',
    eventsLabel: 'events', cameraDistribution: 'Camera distribution', noData: 'No data',
    visitTimeline: 'Visit timeline', noVisitsYet: 'No visits yet', camera: 'Camera',
    loadMore: 'Load more',

    // -- Attendance ------------------------------------------------------------
    noAttendanceRecords: 'No attendance records',
    noAttendanceHint: 'Visits and attendance events will appear here.',

    // -- Live alert ------------------------------------------------------------
    blacklistAlertLabel: 'BLACKLIST ALERT', vipDetectedLabel: 'VIP DETECTED',
    employeeDetectedLabel: 'EMPLOYEE DETECTED', unknownPersonLabel: 'UNKNOWN PERSON',

    // -- Toast messages --------------------------------------------------------
    sessionRefreshed: 'Session refreshed automatically.',
    sessionExpiresSoon: 'Session expires soon. Please re-login.',
    sessionRefreshFailed: 'Could not refresh session.',
    sessionExpired: 'Session expired. Please sign in again.',
    exportAdminOnly: 'Only Admin can export reports',
    exportFailed: 'Export failed', exportDownloaded: 'Export downloaded',
    exportConnectionFailed: 'Export connection failed',
    connectionError: 'Connection error - backend unreachable',
    faceUpdated: 'Face updated', faceUpdateFailed: 'Face update failed',
    viewerCannotEdit: 'Viewer cannot edit',
    adminOnlyDeletePersons: 'Only Admin can delete persons',
    adminOnlyDeleteEvents: 'Only Admin can delete events',

    // -- Quality / misc --------------------------------------------------------
    lowQualityFace: 'LOW QUALITY FACE', lowQualityBadge: 'LOW QUALITY',
    viewerCameraNote: 'Viewer/Operator mode: you can view cameras, but only Admin can add, edit or delete.',
    rtspBuildNote: 'Camera connection is configured from IP, username, password, and protocol mode.',

    // -- Enterprise tabs -------------------------------------------------------
    zones: 'Zones', sessions: 'Sessions', alerts: 'Alerts', webhooks: 'Webhooks',
    reports: 'Reports', settings: 'Settings', securityTitle: 'Security',

    // -- Session management ----------------------------------------------------
    logoutConfirm: 'Are you sure you want to log out?', logoutConfirmAction: 'Log out',
    activeSessions: 'Active Sessions', refresh: 'Refresh',
    logoutEverywhere: 'Logout everywhere', logoutEverywhereConfirm: 'Logout from all devices?',
    loadError: 'Load error', sessionRevoked: 'Session revoked',
    loadingSessions: 'Loading sessions...', noActiveSessions: 'No active sessions',
    currentSession: 'Current session', session: 'Session',
    started: 'Started', expiresIn: 'Expires in', revoke: 'Revoke', activeStatus: 'Active',

    // -- Alerts panel ----------------------------------------------------------
    alarmRules: 'Alarm Rules', newAlarmRule: 'New Alarm Rule',
    alertName: 'Alert Name', alertNamePlaceholder: 'e.g. Blacklist Alert',
    triggerWhen: 'Trigger When', cooldownLabel: 'Cooldown',
    cooldownHint: 'seconds between repeat alerts for same person',
    minConfidence: 'Min Confidence', minConfidenceHint: '0 = all, 0.7 = high confidence only',
    saveAlarmRule: 'Save Alarm Rule',
    noAlarmRulesTitle: 'No alarm rules yet',
    noAlarmRulesBody: 'Create a rule to notify your team when selected event types are detected.',
    recentHistory: 'Recent Dispatch History', loadingLabel: 'Loading...',
    blacklistTrigger: 'Blacklist detection', vipTrigger: 'VIP detection',
    employeeTrigger: 'Employee detection', unknownTrigger: 'Unknown person',
    anyTrigger: 'Any person type',
    botTokenRequired: 'Bot token is required', chatIdRequired: 'Chat ID is required',
    alertCreated: 'Alert rule created', testAlertSent: 'Test alert dispatched',
    deleteAlertConfirm: 'Delete this alert config?',
    telegramChannel: 'Telegram Bot Channel',
    telegramHint: 'Create a bot via @BotFather, add it to your group, then get the Chat ID from @userinfobot. Face images are sent automatically with each alert.',

    // -- Event notifications ---------------------------------------------------
    eventAutomation: 'Event Automation',
    eventAutomationDesc: 'Configure local browser sounds and external alarm delivery for face events.',
    notifications: 'Notifications', alarm: 'Alarm',
    notificationSettings: 'Notification',
    notificationDesc: 'Control live popup cards and browser sound rules for each event type.',
    livePopupCards: 'Live event popup cards',
    livePopupDesc: 'Show the image notification card when a new face event arrives.',
    noSound: 'No sound', softPing: 'Soft ping', softNotice: 'Soft notice',
    vipChime: 'VIP chime', warningAlarm: 'Warning alarm', blacklistAlarm: 'Blacklist alarm',
    testSound: 'Test',
    blacklistSoundHint: 'Use a stronger alarm for high-risk detections.',
    eventSoundHint: 'Browser sound for this event type.',

    // -- Export ----------------------------------------------------------------
    exportMenu: 'Export',
    exportAttendanceExcel: 'Attendance Excel', exportAttendancePdf: 'Attendance PDF',
    exportEventsExcel: 'Events Excel', exportPersonsExcel: 'Persons Excel',
    exportAuditExcel: 'Audit Excel',
  },

  hy: {
    // -- Auth / Login ----------------------------------------------------------
    login: 'Մուտք', signingIn: 'Մուտք ե կատարվում...', username: 'Օգտատեր', password: 'Գաղտնաբառ',
    enterpriseLogin: 'Enterprise Մուտք - GSC LLC',
    signIn: 'Մուտք Գորցել', enterpriseSecurity: 'Քորպորատիվ անվտանգություն հարթակ',
    secureSignIn: 'անվտանգություն Մուտք', usernameLabel: 'ԤԳՏԱՏԵՐ', passwordLabel: 'ԳԱՂՏՆԱԲԱՌ',
    enterUsername: 'Մուտքագրեք Օգտատեր', enterPassword: 'Մուտքագրեք Գաղտնաբառ',
    usernamePasswordRequired: 'Փահանջվում ե Օգտատեր և Գաղտնաբառ',
    loginFailed: 'Մուտքn դզախոլվեց', backendConnectionFailed: 'հետին սերվերi հետ կապ դզախոլվեց',

    // -- Navigation ------------------------------------------------------------
    dashboard: 'Վահանակ', events: 'դեմքի իրադարդզություններ', eventSettings: 'իրադարդզություն',
    persons: 'Անձանց Բազա', attendance: 'հաճախումներ', search: 'որոնում նկարով',
    cameras: 'տեսախծիկներ', users: 'Օգտատերներ / դերեր', auditLogs: 'Audit լոգեր',
    logout: 'Ելք', lightMode: 'լուսավոր րեժիմ', darkMode: 'մութ րեժիմ',
    powered: 'ստեղզվաթ GSC LLC-ի կողմից',
    navOverview: 'ԵՆԴՀԱՆՈՈՐ', navIntelligence: 'ՎԵՐԼՈՒՈՒՅՈՈՆ',
    navInfrastructure: 'ԵՆԹԱՔԱՌՈՒՑՎԱԴՔ', navSettings: 'ՔԱՌԳԱՎՈՌՈՈՄՆԵՌ',

    // -- WebSocket status ------------------------------------------------------
    wsLive: 'WebSocket Ակտիվ', wsConnecting: 'կապ հաստատվում...',
    wsReconnecting: 'վերամիացում...', wsDisconnected: 'անջատվաց',
    wsLiveShort: 'Ակտիվ', wsConnectingShort: 'կապ',
    wsReconnectingShort: 'վերամիացում', wsOffline: 'անցանց',

    // -- Page titles -----------------------------------------------------------
    realtime: 'դեմքի վերլուզություն իրական ժամանակում',
    faceEvents: 'դեմքի հայտնաբերումi իրադարդզություններ',
    personsDb: 'աշխատակիտս / VIP / սեվ ցուցակ Բազա',
    attendanceTitle: 'հաճախումներi / այցերի ժամանակացույց',
    usersTitle: 'Օգտատերների և դերերի կարավարում', camerasTitle: 'տեսախծիկներi կարավարում',
    auditLogsTitle: 'Audit լոգեր / անվտանգությունi Պատմություն',

    // -- Stats / Dashboard -----------------------------------------------------
    totalEvents: 'Ենդհանուր իրադարդզություններ', todayEvents: 'Այսօրվա իրադարձություններ', activeCameras: 'Ակտիվ տեսախծիկներ',
    registeredPersons: 'Գրանցվաց Անձինք', employees: 'աշխատակիտսեր',
    vipClients: 'VIP հաճախուրդներ', blacklist: 'սեվ ցուցակ', lowQuality: 'ցադհր որակ',
    latestCaptures: 'վերջին հայտնաբերումner', topCameras: 'լավագույն տեսախծիկներ',
    hourly: 'այսորվա ժամային հայտնաբերումner',

    // -- Person management -----------------------------------------------------
    registerPerson: 'Գրանցվել Անձ',
    registerHint: 'Ենտրեք վերբերնվաց լուսանկար կամ տեսախծիկi Face Event.',
    uploadRegister: 'Վերբերնել նկար և Գրանցվել', selectFromEvents: 'Ենտրել Face Event-ից',
    fullName: 'անուն ազգանուն', departmentCompany: 'Բաժին / Ենկերություն',
    phone: 'հերախոս', notes: 'նշումներ', cancel: 'չեղարկել', save: 'պահպանել',
    delete: 'ջնջել', history: 'Պատմություն', fullHistory: 'Ամբոլջ Պատմություն', close: 'փակել',
    edit: 'խմբագրել', face: 'դեմք', saving: 'պահպանելvum ե...',
    unknownPerson: 'անհայտ Անձ', unnamed: 'անանուն Անձ',
    noAdditionalInfo: 'լրացուցիչ տեղեկություն չկա',
    employeeOption: 'աշխատակիտս', vipOption: 'VIP հաճախուրդ', blacklistOption: 'սեվ ցուցակ',
    personRegistered: 'Անձn գրանցվեց',
    chooseAtLeastOneImage: 'Ենտրեք արնվազնում 1 լուսանկար',
    writeFullName: 'Գրեք անուն-ազգանուն', selectEvent: 'Ենտրեք իրադարդզություն',
    dragDropHint: 'Քաշեք լուսանկարnere այստեգշ, կամ սեղմետ ենտրել',
    dragDropSub: 'Մինչև 5 լուսանկար - Embedding-ner վերջնականացվում ե',
    addMore: 'Ավելացնել',
    noPersonsRegistered: 'Անձինք գրանցվաց չեն',
    noPersonsHint: 'Գրանցվել արաջին Անձn դեմքի իրադարդզությունից կամ վերբերնումից.',
    deletePersonConfirm: 'ջնջել՞ այս Անձn? իրադարդզություններն կկմնան, բայց Անձi կապn կկտրվի.',

    // -- Search ----------------------------------------------------------------
    allGroups: 'բոլոր խմբեր', allPersons: 'բոլոր Անձինք', unknown: 'անհայտ',
    results: 'Արդյունքներ', chooseImage: 'Ենտրել լուսանկար',
    searchHint: 'Վերբերնեք դեմքի լուսանկար, և համակարգն կգտնի նման դեմքի իրադարդզություններ.',
    searching: 'որոնում ե...', similarity: 'նմանություն', match: 'համապատասխանություն', quality: 'որակություն',

    // -- Events grid -----------------------------------------------------------
    allTime: 'Ամբոլջ ժամանակ', today: 'Այսոր', thisWeek: 'Այս շաբաթ', yesterday: 'Երեկ',
    allCameras: 'բոլոր տեսախծիկներ', lowQShort: 'ցադհր. որակ',
    searchByPerson: 'Օրոնել Անձi անունov...',
    exportCsv: 'Արտագանել CSV', deleteSelected: 'ջնջել Ենտրանվացներն', clearSelection: 'Մաքրել',
    noEventsYet: 'դեմքի իրադարդզություններ դերդ չկան',
    waitingForCaptures: 'սպասում ենք տեսախծիկi հայտնաբերումnere...',
    noEventsMatchFilter: 'Ֆիլտրին համապատասխանոգհ իրադարդզություններ չկան',
    clearAllFilters: 'Մաքրել բոլոր Ֆիլտրներն',
    deleteEventConfirm: 'ջնջել՞ այս իրադարդզությունն?',

    // -- Cameras ---------------------------------------------------------------
    addCamera: 'Ավելացնել տեսախծիկ', editCamera: 'խմբագրել տեսախծիկ',
    updateCamera: 'Թարմակել տեսախծիկ', addNewCamera: 'Ավելացնել Նոր տեսախծիկ',
    saveChanges: 'պահպանել Փոխություններն',
    cameraName: 'տեսախծիկi անուն', ipAddress: 'IP հասցե, որինակ 172.16.11.197',
    rtspPort: 'Port', channel: 'Camera line', location: 'տեղադրում',
    activeLabel: 'Ակտիվ', aiEnabled: 'հայտնաբերումn Ակտիվ', liveEnabled: 'Live Ակտիվ',
    cancelEdit: 'չեղարկել խմբագրելn', noLocation: 'տեղադրում չկա',
    aiDetection: 'հայտնաբերում', liveStream: 'Օուլիգհ Հերադզակություն',
    directionLabel: 'Օողղություն',
    bidirectional: 'Երկկոգհմանի (կանխադրվաց)',
    entranceOnly: 'Մուտք (միայն ՄՈՒԹՔ)', exitOnly: 'Ելք (միայն ԵԼՔ)',
    rtspOverride: 'Stream Փոխություն',
    cameraNamePlaceholder: 'որինակ Գլխավոր Մուտք',
    locationPlaceholder: 'որինակ Շենկ Ա - Հարկ 1',
    inLabel: 'ՄՈՒԹՔ', outLabel: 'ԵԼՔ', bothLabel: 'ԵՐՔՈՒ',
    streamUnavailable: 'Stream-n անհասանելի ե',
    cannotReachServer: 'սերվերn անհասանելի ե',
    cameraCreated: 'տեսախծիկn Ավելացրեց',
    cameraUpdated: 'տեսախծիկn թարմակովեց',
    cameraDeleted: 'տեսախծիկn ջնջվեց',
    failedToDeleteCamera: 'տեսախծիկi ջնջումն դզախոլվեց',
    failedToUpdateCamera: 'տեսախծիկi թարմակումն դզախոլվեց',
    failedToCreateCamera: 'տեսախծիկi ստեղզումն դզախոլվեց',
    deleteCamera: 'ջնջել՞ այս տեսախծիկn?',
    noCamerasConfigured: 'տեսախծիկներ կարգավորվաց չեն',
    noCamerasHint: 'Ավելացնել արաջին տեսախծիկn դեմքի հայտնաբերումner ստանալու համար.',

    // -- Users -----------------------------------------------------------------
    createUser: 'ստեղզել Օգտատեր', create: 'ստեղզել', role: 'դեր',
    active: 'Ակտիվ', inactive: 'անջատկվաց',
    viewerNote: 'Viewer րեժիմ: կարողհ ե միայն դիտել data, բայց վերջարադրություն, խմբագրել և ջնջություն իրավունք չունեք.',
    adminCreateUserNote: 'Admin-n կարողհ ե ստեղզել Operator կամ Viewer Օգտատերներ.',
    userCreated: 'Օգտատերn ստեղզվեց', userStatusUpdated: 'Օգտատերi կարգաթությունn թարմակովեց',
    permissionsUpdated: 'իրավունքներն թարմակվեցսին',
    failedToUpdate: 'Թարմակումն դզախոլվեց', failedToDelete: 'ջնջումն դզախոլվեց',
    cannotDeleteYourself: 'Դուք կարողհ չեք ջնջել Դզեր հեշաբին',
    keepUsersRoles: 'Փահպանել Users/Roles իրավունքն Դզեր հեշաբին համար',
    securityAlertOwn: 'անվտանգություն Ազդանաշան: Դուք չեք կարողհ անգորցատսել Դզեր admin հեշաբին!',
    readOnly: 'միայն կարտալ', operator: 'Operator',
    fullAccess: 'լիճին Մուտք', adminTools: 'Admin Գադզերանկներ', operations: 'գորցարկումner',
    fullAccessLocked: 'լիճին Մուտքn արգելվաց',
    selected: 'Ենտրանվաց', seeMore: 'Տեսել Ավելին', hideDetails: 'Փահել Մանկրամասություններն',
    cannotChangeOwnStatus: 'Դզեր կարգաթությունն փոխել կարելի չկա',

    // -- Person history / detail -----------------------------------------------
    personHistory: 'Անձi Պատմություն', totalDetections: 'Ենդհանուր հայտնաբերումner',
    uniqueCameras: 'Տարբեր տեսախծիկներ', firstSeen: 'Արաջին Անգամ', lastSeen: 'Վերջին Անգամ',
    seenCount: 'Տեսնովել ե', timeline: 'ժամանակագիրս', camerasList: 'տեսախծիկներ', faceId: 'դեմքի ID',
    loadingHistory: 'Պատմությունը բեռնվում է...', historyLoadFailed: 'Պատմության բեռնումը ձախողվեց',
    historyConnectionFailed: 'Պատմությունը բեռնելիս սերվերի կապը խափանվեց',
    unnamedPerson: 'Անանուն անձ', targetId: 'Թիրախի ID', mergeInto: 'Միավորել',
    mergeUnknownHint: 'Միավորել այս անհայտ անձը նշված անձի ID-ի հետ',
    crossCameraJourney: 'Շարժը տեսախցիկներով', loadingJourney: 'Շարժը բեռնվում է...',
    cameraAppearances: 'հայտնվել է տեսախցիկներում', noJourneyData: 'Շարժի տվյալներ դեռ չկան։',
    totalVisits: 'Ընդհանուր այցեր', last7Days: 'Վերջին 7 օրը', activityByHour: 'Ակտիվությունն ըստ ժամերի',
    eventsLabel: 'իրադարձություն', cameraDistribution: 'Բաշխումն ըստ տեսախցիկների', noData: 'Տվյալներ չկան',
    visitTimeline: 'Այցերի ժամանակագիծ', noVisitsYet: 'Այցեր դեռ չկան', camera: 'Տեսախցիկ',
    loadMore: 'Բեռնել ավելին',

    // -- Attendance ------------------------------------------------------------
    noAttendanceRecords: 'հաճախումներ չկա',
    noAttendanceHint: 'Այցերն և հաճախումներi իրադարդզություններն այստեգշ կհայտնևն.',

    // -- Live alert ------------------------------------------------------------
    blacklistAlertLabel: 'ՍԵՎ ՑՈՒՑԱՔի ԱզԴԱՆԱՇԱՆ',
    vipDetectedLabel: 'VIP ՀԱՅՏՆԱԲԵՐՈՎԵԼ',
    employeeDetectedLabel: 'ԱՇԽԱՏԱՔիՏս ՀԱՅՏՆԱԲԵՐHՎԵԼ',
    unknownPersonLabel: 'ԱՆՀԱՅՏ ԱՆԴ',

    // -- Toast messages --------------------------------------------------------
    sessionRefreshed: 'սեսիաn ավտոմատ թարմակովեց.',
    sessionExpiresSoon: 'սեսիաn սկորո կավարտի. Խրնդրում ենք նոր Մուտք գորցել.',
    sessionRefreshFailed: 'սեսիաn թարմակել հնարար չհեգավ.',
    sessionExpired: 'սեսիաn ավարտովեց. Խրնդրում ենք Մուտք գորցել նորից.',
    exportAdminOnly: 'Տեգհեկագրումներն կարողհ ե արտագանել միայն Admin-n',
    exportFailed: 'Արտագանումն դզախոլվեց', exportDownloaded: 'Արտագանումն բերնվեց',
    exportConnectionFailed: 'Արտագանումի կապn դզախոլվեց',
    connectionError: 'կապi սխալ - սերվերn անդհետար ե',
    faceUpdated: 'դեմքn թարմակովեց', faceUpdateFailed: 'դեմքի թարմակումն դզախոլվեց',
    viewerCannotEdit: 'Viewer-n կարողհ չե խմբագրել',
    adminOnlyDeletePersons: 'Անձինք կարողհ ե ջնջել միայն Admin-n',
    adminOnlyDeleteEvents: 'իրադարդզություններն կարողհ ե ջնջել միայն Admin-n',

    // -- Quality / misc --------------------------------------------------------
    lowQualityFace: 'ՑԱԴՀՐ ՈՐԱՔի ԴԵՄՔ', lowQualityBadge: 'ՑԱԴՀՐ ՈՐԱՔ',
    viewerCameraNote: 'Viewer/Operator րեժիմում կարողհ եք դիտել տեսախծիկներn, բայց ավելացնել, խմբագրել կամ ջնջել կարողհ ե միայն Admin-n.',
    rtspBuildNote: 'Camera connection-n կկարգավորվի IP / username / password / protocol mode դաշտերով.',

    // -- Enterprise tabs -------------------------------------------------------
    zones: 'գոտիներ', sessions: 'սեսիոներ', alerts: 'Ազդանաշաններ', webhooks: 'Webhooks',
    reports: 'Նաշվեթություններ', settings: 'կարգավորումner', securityTitle: 'անվտանգություն',

    // -- Session management ----------------------------------------------------
    logoutConfirm: 'Վստահ եք, որ ուզում եք դուրս գալ համակարգիցի?', logoutConfirmAction: 'Դուրս գալ',
    activeSessions: 'Ակտիվ սեսիոներ', refresh: 'Թարմակել',
    logoutEverywhere: 'Դուրս գալ ամեն տեղից', logoutEverywhereConfirm: 'Դուրս գալ բոլոր սարքերիցի?',
    loadError: 'Բերնման սխալ', sessionRevoked: 'սեսիաn չեղարկվեց',
    loadingSessions: 'սեսիոներn բերնում են...', noActiveSessions: 'Ակտիվ սեսիոներ չկան',
    currentSession: 'Ենթաթիկ սեսիա', session: 'սեսիա',
    started: 'սկսվել ե', expiresIn: 'Ավարտվում ե', revoke: 'չեղարկվեց', activeStatus: 'Ակտիվ',

    // -- Alerts panel ----------------------------------------------------------
    alarmRules: 'Ազդանաշանի կանոններ', newAlarmRule: 'Նոր Ազդանաշանի Քանոն',
    alertName: 'Ազդանաշանի անուն', alertNamePlaceholder: 'որինակ սեվ ցուցակi Ազդանաշան',
    triggerWhen: 'Երբ Ազդանաշանել', cooldownLabel: 'Սակախ ժամանակ',
    cooldownHint: 'վայրկհան նույն Անձi երկին ազդանաշանի միջևվ',
    minConfidence: 'Նվազագույն հավասեգհություն',
    minConfidenceHint: '0 = բոլոր, 0.7 = միայն մետս հավասեգհությունamb',
    saveAlarmRule: 'պահպանել Ազդանաշանի Քանոն',
    noAlarmRulesTitle: 'Ազդանաշանի կանոններ դերդ չեն ավելացվաց',
    noAlarmRulesBody: 'Ստեղզեք կանոն Դզեր խումբին ցանուցնել, երբ ենտրնվաց տիպն հայտնաբերում ե.',
    recentHistory: 'Վերջին Օուջարխման Պատմություն', loadingLabel: 'Բերնում ե...',
    blacklistTrigger: 'սեվ ցուցակi հայտնաբերում', vipTrigger: 'VIP հայտնաբերում',
    employeeTrigger: 'աշխատակիտսi հայտնաբերում', unknownTrigger: 'անհայտ Անձ',
    anyTrigger: 'Անբաշխական Անձnayin տիպ',
    botTokenRequired: 'Bot token-n պատահրվում ե', chatIdRequired: 'Chat ID-n պատահրվում ե',
    alertCreated: 'Ազդանաշանի կանոնն ստեղզվեց', testAlertSent: 'Փխորդզնային ազդանաշանն ուջարկվեց',
    deleteAlertConfirm: 'ջնջել՞ այս ազդանաշանի կանոնն?',
    telegramChannel: 'Telegram Bot Քանալ',
    telegramHint: 'Ստեղզեք bot @BotFather-i մամ, ավելել այդ Դզեր խումբում, ապա խումբի ID-n ստանալ @userinfobot-ից. դեմքի լուսանկարnern ավտոմատ կուջարկվեին.',

    // -- Event notifications ---------------------------------------------------
    eventAutomation: 'իրադարդզությունների Ավտոմատիզացիա',
    eventAutomationDesc: 'Քարգավորեք տերխային browser-i ժայներ և արակայ ազդանաշան իրադարդզությունների համար.',
    notifications: 'Ցանուցություններ', alarm: 'Ազդանաշան',
    notificationSettings: 'Ցանուցություն',
    notificationDesc: 'Քարվարեք live popup կարտեզ և browser ժայներ ամեն իրադարդզությունի տիպի համար.',
    livePopupCards: 'Live իրադարդզությունի Popup Քարտեզ',
    livePopupDesc: 'Ցույցադրեցել նկարիկ ցանուցություն, երբ նոր դեմքի իրադարդզություն գա.',
    noSound: 'ժայն չե', softPing: 'Փոխուն ping', softNotice: 'Փոխուն ցանուցություն',
    vipChime: 'VIP ժայն', warningAlarm: 'Նախազգուշաթսում', blacklistAlarm: 'սեվ ցուցակi Ազդանաշան',
    testSound: 'զարկել',
    blacklistSoundHint: 'Օգտվեցեք ավելի ուժեգավոր ազդանաշան մետս վտանգակների հայտնաբերումi համար.',
    eventSoundHint: 'Browser-i ժայն այս իրադարդզությունի տիպի համար.',

    // -- Export ----------------------------------------------------------------
    exportMenu: 'Արտագանել',
    exportAttendanceExcel: 'հաճախումներ Excel', exportAttendancePdf: 'հաճախումներ PDF',
    exportEventsExcel: 'իրադարդզություններ Excel', exportPersonsExcel: 'Անձինք Excel',
    exportAuditExcel: 'Audit լոգներ Excel',
  },

  ru: {
    // -- Auth / Login ----------------------------------------------------------
    login: 'Войти', signingIn: 'Вход...', username: 'Логин', password: 'Пароль',
    enterpriseLogin: 'Enterprise вход - GSC LLC',
    signIn: 'Войти', enterpriseSecurity: 'Платформа корпоративной безопасности',
    secureSignIn: 'Безопасный вход', usernameLabel: 'ЛОГИН', passwordLabel: 'ПАРОЛЬ',
    enterUsername: 'Введите логин', enterPassword: 'Введите пароль',
    usernamePasswordRequired: 'Требуются логин и пароль',
    loginFailed: 'Ошибка входа', backendConnectionFailed: 'Ошибка подключения к серверу',

    // -- Navigation ------------------------------------------------------------
    dashboard: 'Панель', events: 'События лиц', eventSettings: 'Событие',
    persons: 'База персон', attendance: 'Посещения', search: 'Поиск по фото',
    cameras: 'Камеры', users: 'Пользователи / Роли', auditLogs: 'Аудит логи',
    logout: 'Выход', lightMode: 'Светлая тема', darkMode: 'Тёмная тема',
    powered: 'Разработано GSC LLC',
    navOverview: 'ОБЗОР', navIntelligence: 'АНАЛИТИКА',
    navInfrastructure: 'ИНФРАСТРУКТУРА', navSettings: 'НАСТРОЙКИ',

    // -- WebSocket status ------------------------------------------------------
    wsLive: 'WebSocket Активен', wsConnecting: 'Подключение...',
    wsReconnecting: 'Переподключение...', wsDisconnected: 'Отключён',
    wsLiveShort: 'Активен', wsConnectingShort: 'Подключение',
    wsReconnectingShort: 'Переподключение', wsOffline: 'Офлайн',

    // -- Page titles -----------------------------------------------------------
    realtime: 'Аналитика лиц в реальном времени',
    faceEvents: 'События распознавания лиц',
    personsDb: 'База Сотрудник / VIP / Чёрный список',
    attendanceTitle: 'Лента посещений',
    usersTitle: 'Управление пользователями и ролями', camerasTitle: 'Управление камерами',
    auditLogsTitle: 'Аудит логи / История безопасности',

    // -- Stats / Dashboard -----------------------------------------------------
    totalEvents: 'Всего событий', todayEvents: 'События сегодня', activeCameras: 'Активные камеры',
    registeredPersons: 'Зарегистрированные персоны', employees: 'Сотрудники',
    vipClients: 'VIP клиенты', blacklist: 'Чёрный список', lowQuality: 'Низкое качество',
    latestCaptures: 'Последние события', topCameras: 'Топ камер',
    hourly: 'Почасовая статистика за сегодня',

    // -- Person management -----------------------------------------------------
    registerPerson: 'Зарегистрировать персону',
    registerHint: 'Выберите загруженное фото или Face Event с камеры.',
    uploadRegister: 'Загрузить фото и зарегистрировать', selectFromEvents: 'Выбрать из Face Events',
    fullName: 'ФИО', departmentCompany: 'Отдел / Компания',
    phone: 'Телефон', notes: 'Заметки', cancel: 'Отмена', save: 'Сохранить',
    delete: 'Удалить', history: 'История', fullHistory: 'Полная история', close: 'Закрыть',
    edit: 'Редактировать', face: 'Фото', saving: 'Сохранение...',
    unknownPerson: 'Неизвестная персона', unnamed: 'Безымянная персона',
    noAdditionalInfo: 'Нет дополнительной информации',
    employeeOption: 'Сотрудник', vipOption: 'VIP клиент', blacklistOption: 'Чёрный список',
    personRegistered: 'Персона зарегистрирована',
    chooseAtLeastOneImage: 'Выберите хотя бы 1 фото',
    writeFullName: 'Введите ФИО', selectEvent: 'Выберите событие',
    dragDropHint: 'Перетащите фото сюда или нажмите для выбора',
    dragDropSub: 'До 5 фото - Эмбеддинги усредняются для точности',
    addMore: 'Добавить ещё',
    noPersonsRegistered: 'Персоны не зарегистрированы',
    noPersonsHint: 'Зарегистрируйте первую персону через событие или загрузку фото.',
    deletePersonConfirm: 'Удалить эту персону? События останутся, но связь с персоной будет удалена.',

    // -- Search ----------------------------------------------------------------
    allGroups: 'Все группы', allPersons: 'Все персоны', unknown: 'Неизвестный',
    results: 'Результаты', chooseImage: 'Выберите фото',
    searchHint: 'Загрузите фото лица, система найдёт похожие Face Events.',
    searching: 'Поиск...', similarity: 'Сходство', match: 'Совпадение', quality: 'Качество',

    // -- Events grid -----------------------------------------------------------
    allTime: 'Всё время', today: 'Сегодня', thisWeek: 'Эта неделя', yesterday: 'Вчера',
    allCameras: 'Все камеры', lowQShort: 'Низ. К.',
    searchByPerson: 'Поиск по имени персоны...',
    exportCsv: 'Экспорт CSV', deleteSelected: 'Удалить выбранные', clearSelection: 'Сбросить',
    noEventsYet: 'Событий распознавания лиц пока нет',
    waitingForCaptures: 'Ожидание захватов с камеры...',
    noEventsMatchFilter: 'Нет событий, соответствующих фильтру',
    clearAllFilters: 'Сбросить все фильтры',
    deleteEventConfirm: 'Удалить это событие?',

    // -- Cameras ---------------------------------------------------------------
    addCamera: 'Добавить камеру', editCamera: 'Редактировать камеру',
    updateCamera: 'Обновить камеру', addNewCamera: 'Добавить новую камеру',
    saveChanges: 'Сохранить изменения',
    cameraName: 'Название камеры', ipAddress: 'IP адрес, например 172.16.11.197',
    rtspPort: 'Port', channel: 'Camera line', location: 'Локация',
    activeLabel: 'Активна', aiEnabled: 'Detection enabled', liveEnabled: 'Live включён',
    cancelEdit: 'Отменить редактирование', noLocation: 'Нет локации',
    aiDetection: 'Detection', liveStream: 'Прямой эфир',
    directionLabel: 'Направление',
    bidirectional: 'Bidirectional (default)',
    entranceOnly: 'Entrance (IN only)', exitOnly: 'Exit (OUT only)',
    rtspOverride: 'Stream override',
    cameraNamePlaceholder: 'напр. Главный вход',
    locationPlaceholder: 'напр. Здание A - Этаж 1',
    inLabel: 'ВХОД', outLabel: 'ВЫХОД', bothLabel: 'ОБА',
    streamUnavailable: 'Трансляция недоступна',
    cannotReachServer: 'Не удаётся подключиться к серверу',
    cameraCreated: 'Камера добавлена', cameraUpdated: 'Камера обновлена',
    cameraDeleted: 'Камера удалена',
    failedToDeleteCamera: 'Ошибка удаления камеры',
    failedToUpdateCamera: 'Ошибка обновления камеры',
    failedToCreateCamera: 'Ошибка создания камеры',
    deleteCamera: 'Удалить эту камеру?',
    noCamerasConfigured: 'Камеры не настроены',
    noCamerasHint: 'Добавьте первую камеру для получения событий распознавания лиц.',

    // -- Users -----------------------------------------------------------------
    createUser: 'Создать пользователя', create: 'Создать', role: 'Роль',
    active: 'Активен', inactive: 'Отключён',
    viewerNote: 'Режим Viewer: можно только просматривать, без регистрации, редактирования и удаления.',
    adminCreateUserNote: 'Admin может создавать учетные записи Operator или Viewer.',
    userCreated: 'Пользователь создан', userStatusUpdated: 'Статус пользователя обновлён',
    permissionsUpdated: 'Права доступа обновлены',
    failedToUpdate: 'Ошибка обновления', failedToDelete: 'Ошибка удаления',
    cannotDeleteYourself: 'Нельзя удалить свою учётную запись',
    keepUsersRoles: 'Оставьте права Users/Roles для своей учётной записи',
    securityAlertOwn: 'Предупреждение безопасности: нельзя деактивировать свой admin аккаунт!',
    readOnly: 'Только чтение', operator: 'Оператор',
    fullAccess: 'Полный доступ', adminTools: 'Инструменты Admin', operations: 'Операции',
    fullAccessLocked: 'Полный доступ заблокирован',
    selected: 'выбрано', seeMore: 'Показать ещё', hideDetails: 'Скрыть детали',
    cannotChangeOwnStatus: 'Нельзя изменить свой статус',

    // -- Person history / detail -----------------------------------------------
    personHistory: 'История персоны', totalDetections: 'Всего обнаружений',
    uniqueCameras: 'Уникальные камеры', firstSeen: 'Первое появление', lastSeen: 'Последнее появление',
    seenCount: 'Количество появлений', timeline: 'Хронология', camerasList: 'Камеры', faceId: 'Face ID',
    loadingHistory: 'Загрузка истории...', historyLoadFailed: 'Не удалось загрузить историю',
    historyConnectionFailed: 'Ошибка подключения при загрузке истории',
    unnamedPerson: 'Безымянная персона', targetId: 'ID назначения', mergeInto: 'Объединить',
    mergeUnknownHint: 'Объединить неизвестную персону с указанным ID',
    crossCameraJourney: 'Маршрут между камерами', loadingJourney: 'Загрузка маршрута...',
    cameraAppearances: 'появлений на камерах', noJourneyData: 'Данных маршрута пока нет.',
    totalVisits: 'Всего посещений', last7Days: 'Последние 7 дней', activityByHour: 'Активность по часам',
    eventsLabel: 'событий', cameraDistribution: 'Распределение по камерам', noData: 'Нет данных',
    visitTimeline: 'Хронология посещений', noVisitsYet: 'Посещений пока нет', camera: 'Камера',
    loadMore: 'Загрузить ещё',

    // -- Attendance ------------------------------------------------------------
    noAttendanceRecords: 'Записей посещаемости нет',
    noAttendanceHint: 'Визиты и события посещаемости появятся здесь.',

    // -- Live alert ------------------------------------------------------------
    blacklistAlertLabel: 'ТРЕВОГА: ЧЁРНЫЙ СПИСОК', vipDetectedLabel: 'VIP ОБНАРУЖЕН',
    employeeDetectedLabel: 'СОТРУДНИК ОБНАРУЖЕН', unknownPersonLabel: 'НЕИЗВЕСТНАЯ ПЕРСОНА',

    // -- Toast messages --------------------------------------------------------
    sessionRefreshed: 'Сессия обновлена автоматически.',
    sessionExpiresSoon: 'Сессия скоро истечёт. Пожалуйста, войдите снова.',
    sessionRefreshFailed: 'Не удалось обновить сессию.',
    sessionExpired: 'Сессия истекла. Войдите снова.',
    exportAdminOnly: 'Только Admin может экспортировать отчёты',
    exportFailed: 'Ошибка экспорта', exportDownloaded: 'Экспорт скачан',
    exportConnectionFailed: 'Ошибка подключения при экспорте',
    connectionError: 'Ошибка соединения - сервер недоступен',
    faceUpdated: 'Фото лица обновлено', faceUpdateFailed: 'Ошибка обновления фото лица',
    viewerCannotEdit: 'Viewer не может редактировать',
    adminOnlyDeletePersons: 'Только Admin может удалять персон',
    adminOnlyDeleteEvents: 'Только Admin может удалять события',

    // -- Quality / misc --------------------------------------------------------
    lowQualityFace: 'ЛИЦО НИЗКОГО КАЧЕСТВА', lowQualityBadge: 'НИЗКОЕ КАЧЕСТВО',
    viewerCameraNote: 'В режиме Viewer/Operator можно просматривать камеры, но добавлять, изменять и удалять может только Admin.',
    rtspBuildNote: 'Camera connection is configured from IP, username, password, and protocol mode.',

    // -- Enterprise tabs -------------------------------------------------------
    zones: 'Зоны', sessions: 'Сессии', alerts: 'Оповещения', webhooks: 'Вебхуки',
    reports: 'Отчёты', settings: 'Настройки', securityTitle: 'Безопасность',

    // -- Session management ----------------------------------------------------
    logoutConfirm: 'Вы уверены, что хотите выйти?', logoutConfirmAction: 'Выйти',
    activeSessions: 'Активные сессии', refresh: 'Обновить',
    logoutEverywhere: 'Выйти везде', logoutEverywhereConfirm: 'Выйти со всех устройств?',
    loadError: 'Ошибка загрузки', sessionRevoked: 'Сессия отозвана',
    loadingSessions: 'Загрузка сессий...', noActiveSessions: 'Нет активных сессий',
    currentSession: 'Текущая сессия', session: 'Сессия',
    started: 'Начало', expiresIn: 'Истекает через', revoke: 'Отозвать', activeStatus: 'Активна',

    // -- Alerts panel ----------------------------------------------------------
    alarmRules: 'Правила оповещения', newAlarmRule: 'Новое правило оповещения',
    alertName: 'Название оповещения', alertNamePlaceholder: 'напр. Тревога чёрного списка',
    triggerWhen: 'Когда срабатывать', cooldownLabel: 'Перерыв',
    cooldownHint: 'секунд между повторными оповещениями для одной персоны',
    minConfidence: 'Мин. уверенность', minConfidenceHint: '0 = все, 0.7 = только высокая уверенность',
    saveAlarmRule: 'Сохранить правило оповещения',
    noAlarmRulesTitle: 'Правил оповещения ещё нет',
    noAlarmRulesBody: 'Создайте правило для уведомления команды при обнаружении выбранных типов событий.',
    recentHistory: 'История последних отправок', loadingLabel: 'Загрузка...',
    blacklistTrigger: 'Обнаружение в чёрном списке', vipTrigger: 'Обнаружение VIP',
    employeeTrigger: 'Обнаружение сотрудника', unknownTrigger: 'Неизвестная персона',
    anyTrigger: 'Любой тип персоны',
    botTokenRequired: 'Bot token обязателен', chatIdRequired: 'Chat ID обязателен',
    alertCreated: 'Правило оповещения создано', testAlertSent: 'Тестовое оповещение отправлено',
    deleteAlertConfirm: 'Удалить это правило оповещения?',
    telegramChannel: 'Telegram Bot канал',
    telegramHint: 'Создайте бота через @BotFather, добавьте его в группу, затем получите Chat ID через @userinfobot. Фото лица отправляется автоматически с каждым оповещением.',

    // -- Event notifications ---------------------------------------------------
    eventAutomation: 'Автоматизация событий',
    eventAutomationDesc: 'Настройте звуки браузера и внешнюю доставку оповещений для событий лиц.',
    notifications: 'Уведомления', alarm: 'Сигнализация',
    notificationSettings: 'Уведомление',
    notificationDesc: 'Управляйте всплывающими картами и звуками браузера для каждого типа событий.',
    livePopupCards: 'Всплывающие карты событий',
    livePopupDesc: 'Показывать карточку уведомления при новом событии распознавания лиц.',
    noSound: 'Без звука', softPing: 'Тихий пинг', softNotice: 'Тихое уведомление',
    vipChime: 'Звук VIP', warningAlarm: 'Сигнал предупреждения', blacklistAlarm: 'Сигнал чёрного списка',
    testSound: 'Тест',
    blacklistSoundHint: 'Используйте более сильный сигнал для высокорисковых обнаружений.',
    eventSoundHint: 'Звук браузера для этого типа событий.',

    // -- Export ----------------------------------------------------------------
    exportMenu: 'Экспорт',
    exportAttendanceExcel: 'Посещения Excel', exportAttendancePdf: 'Посещения PDF',
    exportEventsExcel: 'События Excel', exportPersonsExcel: 'Персоны Excel',
    exportAuditExcel: 'Аудит Excel',
  },
};

export const I18nContext = React.createContext({ lang: 'en', setLang: () => {} });

export function useTr() {
  const { lang } = React.useContext(I18nContext);
  return key => I18N[lang]?.[key] || I18N.en[key] || key;
}

export const ACS_I18N = {
  en: {
    acsAccessController: 'Access Controller', acsEnterprise: 'GSC LLC Enterprise',
    acsSecurePlatform: 'Secure Platform', acsBackToLauncher: 'Back to Launcher',
    acsSearchNavigation: 'Search navigation…', acsOverview: 'OVERVIEW',
    acsDevices: 'DEVICES', acsPersons: 'PERSONS', acsAttendance: 'ATTENDANCE',
    acsSecurity: 'SECURITY', acsReports: 'REPORTS', acsSettings: 'SETTINGS',
    acsDashboard: 'Dashboard', acsDeviceManagement: 'Device Management',
    acsRealTimeMonitoring: 'Real Time Monitoring', acsPersonManagement: 'Person Management',
    acsCredentialHealth: 'Credential Health', acsAccessLevels: 'Access Levels',
    acsVisitorManagement: 'Visitor Management', acsBulkImport: 'Bulk Import',
    acsAttendanceDashboard: 'Attendance', acsAccessRequests: 'Access Requests',
    acsAntiPassback: 'Anti-Passback', acsDualAuth: 'Dual Auth', acsTailgating: 'Tailgating',
    acsGuardTour: 'Guard Tour', acsMustering: 'Mustering', acsAuditReport: 'Audit Report',
    acsZoneOccupancy: 'Zone Occupancy', acsAccessLogs: 'Access Logs', acsAnalytics: 'Analytics',
    acsHolidayCalendar: 'Holidays', acsLiftConfig: 'Lift Config',
    acsPolicyTemplates: 'Policy Templates', acsDoorCamera: 'Door Camera',
    acsMobileCards: 'Mobile Cards', acsLive: 'ACS Live',
    acsNoResults: 'No results for', acsNavigate: 'Navigate', acsOpen: 'Open', acsClose: 'Close',
  },
  hy: {
    acsAccessController: 'Մուտքի վերահսկիչ', acsEnterprise: 'GSC LLC Enterprise',
    acsSecurePlatform: 'Անվտանգ հարթակ', acsBackToLauncher: 'Վերադառնալ ծրագրերի ընտրությանը',
    acsSearchNavigation: 'Որոնել նավարկությունում…', acsOverview: 'ԸՆԴՀԱՆՈՒՐ',
    acsDevices: 'ՍԱՐՔԵՐ', acsPersons: 'ԱՆՁԻՆՔ', acsAttendance: 'ՀԱՇՎԱՌՈՒՄ',
    acsSecurity: 'ԱՆՎՏԱՆԳՈՒԹՅՈՒՆ', acsReports: 'ՀԱՇՎԵՏՎՈՒԹՅՈՒՆՆԵՐ', acsSettings: 'ԿԱՐԳԱՎՈՐՈՒՄՆԵՐ',
    acsDashboard: 'Վահանակ', acsDeviceManagement: 'Սարքերի կառավարում',
    acsRealTimeMonitoring: 'Իրական ժամանակի դիտարկում', acsPersonManagement: 'Անձանց կառավարում',
    acsCredentialHealth: 'Հավաստագրերի վիճակ', acsAccessLevels: 'Մուտքի մակարդակներ',
    acsVisitorManagement: 'Այցելուների կառավարում', acsBulkImport: 'Զանգվածային ներմուծում',
    acsAttendanceDashboard: 'Հաճախումներ', acsAccessRequests: 'Մուտքի հարցումներ',
    acsAntiPassback: 'Կրկնանցման արգելք', acsDualAuth: 'Կրկնակի նույնականացում', acsTailgating: 'Հետևից անցում',
    acsGuardTour: 'Պահակային երթուղի', acsMustering: 'Անձնակազմի հավաք', acsAuditReport: 'Աուդիտի հաշվետվություն',
    acsZoneOccupancy: 'Գոտիների զբաղվածություն', acsAccessLogs: 'Մուտքի գրանցամատյան', acsAnalytics: 'Վերլուծություն',
    acsHolidayCalendar: 'Տոներ', acsLiftConfig: 'Վերելակի կարգավորում',
    acsPolicyTemplates: 'Քաղաքականության ձևանմուշներ', acsDoorCamera: 'Դռան տեսախցիկ',
    acsMobileCards: 'Բջջային քարտեր', acsLive: 'ACS ակտիվ',
    acsNoResults: 'Արդյունքներ չկան՝', acsNavigate: 'Նավարկում', acsOpen: 'Բացել', acsClose: 'Փակել',
  },
  ru: {
    acsAccessController: 'Контроллер доступа', acsEnterprise: 'GSC LLC Enterprise',
    acsSecurePlatform: 'Защищённая платформа', acsBackToLauncher: 'Назад к выбору приложения',
    acsSearchNavigation: 'Поиск по навигации…', acsOverview: 'ОБЗОР',
    acsDevices: 'УСТРОЙСТВА', acsPersons: 'ПЕРСОНЫ', acsAttendance: 'УЧЁТ ВРЕМЕНИ',
    acsSecurity: 'БЕЗОПАСНОСТЬ', acsReports: 'ОТЧЁТЫ', acsSettings: 'НАСТРОЙКИ',
    acsDashboard: 'Панель управления', acsDeviceManagement: 'Управление устройствами',
    acsRealTimeMonitoring: 'Мониторинг в реальном времени', acsPersonManagement: 'Управление персонами',
    acsCredentialHealth: 'Состояние учётных данных', acsAccessLevels: 'Уровни доступа',
    acsVisitorManagement: 'Управление посетителями', acsBulkImport: 'Массовый импорт',
    acsAttendanceDashboard: 'Посещаемость', acsAccessRequests: 'Запросы доступа',
    acsAntiPassback: 'Антипассбэк', acsDualAuth: 'Двойная аутентификация', acsTailgating: 'Контроль прохода',
    acsGuardTour: 'Маршрут охраны', acsMustering: 'Сбор персонала', acsAuditReport: 'Аудиторский отчёт',
    acsZoneOccupancy: 'Занятость зон', acsAccessLogs: 'Журнал доступа', acsAnalytics: 'Аналитика',
    acsHolidayCalendar: 'Праздники', acsLiftConfig: 'Настройка лифта',
    acsPolicyTemplates: 'Шаблоны политик', acsDoorCamera: 'Камера двери',
    acsMobileCards: 'Мобильные карты', acsLive: 'ACS онлайн',
    acsNoResults: 'Нет результатов для', acsNavigate: 'Навигация', acsOpen: 'Открыть', acsClose: 'Закрыть',
  },
};

const ACS_DASH_I18N = {
  en: {
    acsDashLoadError: 'Dashboard data could not be loaded',
    acsDashAttentionCount: '{count} items need attention', acsDashAttentionNone: 'No urgent issues need attention',
    acsDashOnlineOffline: '{online} online, {offline} offline', acsDashNeedAttention: 'Needs Attention',
    acsDashReviewControllers: 'Review Controllers', acsDashPeopleCredentials: 'People and credentials',
    acsDashAllSynced: 'All synchronized', acsDashPresentAbsent: '{present} present, {absent} absent',
    acsDashUnknownAttempts: 'Unknown access attempts', acsDashToday: '{count} today',
    acsDashTitle: 'Access Control Dashboard', acsDashSubtitle: "Start with a task, review alerts and follow today's door activity",
    acsDashUpdated: 'Updated {time}', acsDashLoadingStatus: 'Loading status', acsDashRefreshStatus: 'Refresh Status',
    acsDashDoorEventsToday: 'Door events today', acsDashGranted: 'allowed', acsDashDenied: 'denied',
    acsDashControllersAvailable: 'controllers available', acsDashOnlineControllers: 'Online Controllers',
    acsDashAllowedToday: 'Allowed Today', acsDashDeniedAlarm: 'Denied or Alarm', acsDashPeopleSynced: 'People Synced',
    acsDashInsideToday: 'Inside Today', acsDashOpenRequests: 'Open Requests', acsDashQuickActions: 'Quick Actions',
    acsDashCommonTasks: 'Most common tasks', acsDashCheckDoorsLive: 'Check Doors Live',
    acsDashCheckDoorsDetail: 'Open, lock and watch door activity', acsDashManagePeople: 'Manage People',
    acsDashManagePeopleDetail: 'People, cards and face access', acsDashSetAccessRights: 'Set Access Rights',
    acsDashSetAccessDetail: 'Choose who can enter each area', acsDashViewPassHistory: 'View Pass History',
    acsDashPassHistoryDetail: 'Allowed, denied and alarm events', acsDashDoorControllers: 'Door Controllers',
    acsDashDoorControllersDetail: 'Connection and door status for each controller',
    acsDashOpenLiveMonitoring: 'Open Live Monitoring', acsDashNoControllers: 'No controllers added yet. Add a controller to start controlling doors.',
    acsDashDoorCount: '{count} door', acsDashOnline: 'Online', acsDashOffline: 'Offline', acsDashDisabled: 'Disabled',
    acsDashOpenCount: '{count} open', acsDashLatestDoorActivity: 'Latest Door Activity',
    acsDashLatestDoorDetail: 'Most recent allowed, denied and alarm events', acsDashViewLiveActivity: 'View Live Activity',
    acsDashNoDoorActivity: 'No door activity yet. Recent allowed and denied entries will appear here.',
    acsDashUnknownCardHolder: 'Unknown card holder', acsDashController: 'Controller', acsDashDoor: 'Door',
    acsDashOtherEvent: 'Other event', acsDashEmergencyActions: 'Emergency Actions',
    acsDashEmergencyDescription: 'These actions affect all active controllers. Confirmation is required.',
    acsDashLockAllDoors: 'Lock All Doors', acsDashOpenAllDoors: 'Open All Doors',
  },
  hy: {
    acsDashLoadError: 'Վահանակի տվյալները չհաջողվեց բեռնել',
    acsDashAttentionCount: '{count} խնդիր ուշադրության կարիք ունի', acsDashAttentionNone: 'Շտապ խնդիրներ չկան',
    acsDashOnlineOffline: '{online} առցանց, {offline} անցանց', acsDashNeedAttention: 'Ուշադրություն է պահանջվում',
    acsDashReviewControllers: 'Դիտել վերահսկիչները', acsDashPeopleCredentials: 'Անձինք և հավաստագրեր',
    acsDashAllSynced: 'Բոլորը համաժամացված են', acsDashPresentAbsent: '{present} ներկա, {absent} բացակա',
    acsDashUnknownAttempts: 'Անհայտ մուտքի փորձեր', acsDashToday: '{count} այսօր',
    acsDashTitle: 'Մուտքի վերահսկման վահանակ', acsDashSubtitle: 'Սկսեք առաջադրանքից, դիտեք ազդանշանները և այսօրվա դռների ակտիվությունը',
    acsDashUpdated: 'Թարմացվել է՝ {time}', acsDashLoadingStatus: 'Կարգավիճակը բեռնվում է', acsDashRefreshStatus: 'Թարմացնել կարգավիճակը',
    acsDashDoorEventsToday: 'Այսօրվա դռան իրադարձություններ', acsDashGranted: 'թույլատրված', acsDashDenied: 'մերժված',
    acsDashControllersAvailable: 'հասանելի վերահսկիչներ', acsDashOnlineControllers: 'Առցանց վերահսկիչներ',
    acsDashAllowedToday: 'Այսօր թույլատրված', acsDashDeniedAlarm: 'Մերժում կամ ահազանգ', acsDashPeopleSynced: 'Համաժամացված անձինք',
    acsDashInsideToday: 'Այսօր ներսում', acsDashOpenRequests: 'Բաց հարցումներ', acsDashQuickActions: 'Արագ գործողություններ',
    acsDashCommonTasks: 'Ամենատարածված գործողությունները', acsDashCheckDoorsLive: 'Դիտել դռները ուղիղ եթերում',
    acsDashCheckDoorsDetail: 'Բացել, փակել և դիտել դռան ակտիվությունը', acsDashManagePeople: 'Կառավարել անձանց',
    acsDashManagePeopleDetail: 'Անձինք, քարտեր և դեմքով մուտք', acsDashSetAccessRights: 'Սահմանել մուտքի իրավունքներ',
    acsDashSetAccessDetail: 'Ընտրեք՝ ով կարող է մուտք գործել յուրաքանչյուր գոտի', acsDashViewPassHistory: 'Դիտել անցումների պատմությունը',
    acsDashPassHistoryDetail: 'Թույլատրված, մերժված և ահազանգի իրադարձություններ', acsDashDoorControllers: 'Դռների վերահսկիչներ',
    acsDashDoorControllersDetail: 'Յուրաքանչյուր վերահսկիչի կապը և դռների կարգավիճակը',
    acsDashOpenLiveMonitoring: 'Բացել ուղիղ դիտարկումը', acsDashNoControllers: 'Վերահսկիչներ դեռ չեն ավելացվել։ Ավելացրեք վերահսկիչ՝ դռները կառավարելու համար։',
    acsDashDoorCount: '{count} դուռ', acsDashOnline: 'Առցանց', acsDashOffline: 'Անցանց', acsDashDisabled: 'Անջատված',
    acsDashOpenCount: '{count} բաց', acsDashLatestDoorActivity: 'Դռների վերջին ակտիվությունը',
    acsDashLatestDoorDetail: 'Վերջին թույլատրված, մերժված և ահազանգի իրադարձությունները', acsDashViewLiveActivity: 'Դիտել ուղիղ ակտիվությունը',
    acsDashNoDoorActivity: 'Դռների ակտիվություն դեռ չկա։ Վերջին թույլատրված և մերժված մուտքերը կհայտնվեն այստեղ։',
    acsDashUnknownCardHolder: 'Քարտի անհայտ կրող', acsDashController: 'Վերահսկիչ', acsDashDoor: 'Դուռ',
    acsDashOtherEvent: 'Այլ իրադարձություն', acsDashEmergencyActions: 'Արտակարգ գործողություններ',
    acsDashEmergencyDescription: 'Այս գործողությունները ազդում են բոլոր ակտիվ վերահսկիչների վրա։ Պահանջվում է հաստատում։',
    acsDashLockAllDoors: 'Փակել բոլոր դռները', acsDashOpenAllDoors: 'Բացել բոլոր դռները',
  },
  ru: {
    acsDashLoadError: 'Не удалось загрузить данные панели управления',
    acsDashAttentionCount: '{count} проблем требуют внимания', acsDashAttentionNone: 'Срочных проблем нет',
    acsDashOnlineOffline: '{online} онлайн, {offline} офлайн', acsDashNeedAttention: 'Требует внимания',
    acsDashReviewControllers: 'Проверить контроллеры', acsDashPeopleCredentials: 'Персоны и учётные данные',
    acsDashAllSynced: 'Всё синхронизировано', acsDashPresentAbsent: '{present} присутствуют, {absent} отсутствуют',
    acsDashUnknownAttempts: 'Неизвестные попытки доступа', acsDashToday: '{count} сегодня',
    acsDashTitle: 'Панель управления доступом', acsDashSubtitle: 'Начните с задачи, проверьте оповещения и активность дверей за сегодня',
    acsDashUpdated: 'Обновлено: {time}', acsDashLoadingStatus: 'Загрузка статуса', acsDashRefreshStatus: 'Обновить статус',
    acsDashDoorEventsToday: 'События дверей за сегодня', acsDashGranted: 'разрешено', acsDashDenied: 'отказано',
    acsDashControllersAvailable: 'контроллеров доступно', acsDashOnlineControllers: 'Контроллеры онлайн',
    acsDashAllowedToday: 'Разрешено сегодня', acsDashDeniedAlarm: 'Отказ или тревога', acsDashPeopleSynced: 'Персоны синхронизированы',
    acsDashInsideToday: 'Внутри сегодня', acsDashOpenRequests: 'Открытые запросы', acsDashQuickActions: 'Быстрые действия',
    acsDashCommonTasks: 'Частые задачи', acsDashCheckDoorsLive: 'Проверить двери онлайн',
    acsDashCheckDoorsDetail: 'Открывать, закрывать и отслеживать активность дверей', acsDashManagePeople: 'Управлять персонами',
    acsDashManagePeopleDetail: 'Персоны, карты и доступ по лицу', acsDashSetAccessRights: 'Настроить права доступа',
    acsDashSetAccessDetail: 'Выберите, кто может войти в каждую зону', acsDashViewPassHistory: 'История проходов',
    acsDashPassHistoryDetail: 'Разрешённые, отклонённые и тревожные события', acsDashDoorControllers: 'Контроллеры дверей',
    acsDashDoorControllersDetail: 'Подключение и состояние дверей каждого контроллера',
    acsDashOpenLiveMonitoring: 'Открыть онлайн-мониторинг', acsDashNoControllers: 'Контроллеры ещё не добавлены. Добавьте контроллер, чтобы управлять дверями.',
    acsDashDoorCount: '{count} дверь', acsDashOnline: 'Онлайн', acsDashOffline: 'Офлайн', acsDashDisabled: 'Отключён',
    acsDashOpenCount: '{count} открыто', acsDashLatestDoorActivity: 'Последняя активность дверей',
    acsDashLatestDoorDetail: 'Последние разрешённые, отклонённые и тревожные события', acsDashViewLiveActivity: 'Открыть текущую активность',
    acsDashNoDoorActivity: 'Активности дверей пока нет. Последние разрешённые и отклонённые проходы появятся здесь.',
    acsDashUnknownCardHolder: 'Неизвестный владелец карты', acsDashController: 'Контроллер', acsDashDoor: 'Дверь',
    acsDashOtherEvent: 'Другое событие', acsDashEmergencyActions: 'Экстренные действия',
    acsDashEmergencyDescription: 'Эти действия затрагивают все активные контроллеры. Требуется подтверждение.',
    acsDashLockAllDoors: 'Закрыть все двери', acsDashOpenAllDoors: 'Открыть все двери',
  },
};


const ACS_USABILITY_I18N = {
  en: {
    acsNavHome: 'Home',
    acsNavControllers: 'Controllers',
    acsNavLiveDoors: 'Live doors',
    acsNavPeople: 'People',
    acsNavCredentialCheck: 'Credential check',
    acsNavAccessRules: 'Access rules',
    acsNavVisitors: 'Visitors',
    acsNavImportPeople: 'Import people',
    acsNavAttendance: 'Attendance',
    acsNavRequests: 'Access requests',
    acsNavAntiPassback: 'Prevent repeat entry',
    acsNavDualAuth: 'Two-person verification',
    acsNavTailgating: 'Multiple-person passage',
    acsNavGuardTour: 'Guard routes',
    acsNavMustering: 'Emergency headcount',
    acsNavAudit: 'Action report',
    acsNavOccupancy: 'People in zones',
    acsNavHistory: 'Passage history',
    acsNavAnalytics: 'Access analytics',
    acsNavHolidays: 'Holidays',
    acsNavLift: 'Floor access',
    acsNavPolicies: 'Access templates',
    acsNavDoorCamera: 'Door cameras',
    acsNavMobileCards: 'Mobile passes',
    acsBeta: 'BETA',
    acsHelpButton: 'Help',
    acsHelpHowToStart: 'How to use this page',
    acsHelpNothingHidden: 'All functions remain available. The interface only organizes them by task and priority.',
    acsHelpGoDashboard: 'Go to Home',
    acsHelpFindFunction: 'Find a function',
    acsGuideDashboard: 'Check the Needs Attention section first.|Use Quick Actions for common tasks.|Follow Quick setup when configuring a new system.',
    acsGuideDevices: 'Check whether each controller is online.|Add or edit the controller and its connection settings.|Test the connection before using its doors.',
    acsGuideMonitoring: 'Expand All Controllers and choose a controller.|Select a door card to open or close its controls.|Watch the event list to confirm the result.',
    acsGuidePersons: 'Choose the required department.|Add a person and the credentials they will use.|Check the synchronization result after saving.',
    acsGuideCredentials: 'Use the issue filter to find incomplete people.|Open a person to correct missing credentials.|Retry synchronization and verify the final status.',
    acsGuideLevels: 'Create an access rule for an area or role.|Select doors, schedules and assigned people.|Verify and apply the rule to controllers.',
    acsGuideVisitors: 'Create a visitor and define the visit time.|Assign the required temporary access.|Close or review the visit when it ends.',
    acsGuideBulkImport: 'Download and complete the template.|Select the prepared CSV or Excel file.|Preview the rows before starting the import.',
    acsGuideAttendance: 'Select the date or reporting period.|Review attendance exceptions first.|Open a person for detailed time records.',
    acsGuideRequests: 'Open pending requests first.|Check the person, door and requested period.|Approve or reject the request with a clear reason.',
    acsGuideAntiPassback: 'Create a rule for the required entry and exit doors.|Choose soft mode for warnings or hard mode for blocking.|Review violations before changing the rule.',
    acsGuideDualAuth: 'Choose the protected door.|Set the credential pair and allowed time window.|Test the rule with authorized credentials.',
    acsGuideTailgating: 'Link the monitored door and detection source.|Set the alert conditions.|Review detections and confirm real incidents.',
    acsGuideGuardTour: 'Create a route and add checkpoints in order.|Assign the planned time or guard.|Review missed and completed checkpoints.',
    acsGuideMustering: 'Select the emergency or controlled zone.|Review people currently marked inside.|Confirm each person as accounted for.',
    acsGuideAudit: 'Choose the period and action type.|Apply filters to narrow the report.|Export the verified result when needed.',
    acsGuideOccupancy: 'Select a zone to view its current count.|Check entry and exit events behind the number.|Investigate zones that exceed their limit.',
    acsGuideLogs: 'Set the controller, door and event filters.|Search by person, card or time.|Open the matching event for full details.',
    acsGuideAnalytics: 'Choose the reporting period.|Compare allowed, denied and peak activity.|Export the chart data when a report is required.',
    acsGuideHolidays: 'Choose the required year.|Add official or organization-specific days.|Check which schedules use the exception.',
    acsGuideLift: 'Add the supported lift controller.|Map floors to access rules.|Test an assigned credential before activation.',
    acsGuidePolicies: 'Create a reusable door and schedule template.|Review the template before applying it.|Apply it to an access rule and verify the result.',
    acsGuideDoorCamera: 'Choose a controller and door.|Select the camera that views that door.|Trigger a test event and verify the snapshot.',
    acsGuideMobileCards: 'Choose the person who receives the pass.|Issue and deliver the mobile credential.|Revoke or reissue it if the device changes.',
    acsSectionDoors: 'DOORS & CONTROLLERS',
    acsSectionPeopleAccess: 'PEOPLE & ACCESS',
    acsSectionWorkforce: 'TIME & ATTENDANCE',
    acsSectionInsights: 'REPORTS & ANALYTICS',
    acsHelpDashboard: 'A clear overview of system health, tasks and today’s access activity.',
    acsHelpDevices: 'Add controllers, check connectivity and manage the doors attached to each device.',
    acsHelpMonitoring: 'Watch door status and events live; select a door to open its remote controls.',
    acsHelpPersons: 'Add employees, organize departments and manage the credentials assigned to each person.',
    acsHelpCredentials: 'Find missing credentials, synchronization errors and people who need attention.',
    acsHelpLevels: 'Define who can enter each area, through which doors and on what schedule.',
    acsHelpVisitors: 'Register visitors, track active visits and review completed or overdue visits.',
    acsHelpBulkImport: 'Import people and credentials from a prepared CSV or Excel file.',
    acsHelpAttendance: 'Review attendance, shifts, schedules and calculated working time.',
    acsHelpRequests: 'Review and approve temporary or exceptional access requests.',
    acsHelpAntiPassback: 'Prevent repeated entry without a matching exit and review rule violations.',
    acsHelpDualAuth: 'Require two different credentials before a protected door can be opened.',
    acsHelpTailgating: 'Detect and review cases where several people pass on one credential.',
    acsHelpGuardTour: 'Create guard routes and monitor whether checkpoints are completed on time.',
    acsHelpMustering: 'See who is inside and account for people during an emergency.',
    acsHelpAudit: 'Filter, review and export security and administration activity.',
    acsHelpOccupancy: 'Monitor the current number of people in controlled zones.',
    acsHelpLogs: 'Search all allowed, denied, alarm and manual door events.',
    acsHelpAnalytics: 'Compare access activity, trends and exceptions for the selected period.',
    acsHelpHolidays: 'Maintain holidays and exceptions used by attendance and access schedules.',
    acsHelpLift: 'Configure floor access rules for supported lift controllers.',
    acsHelpPolicies: 'Reuse door and schedule configurations when creating access levels.',
    acsHelpDoorCamera: 'Link cameras to doors so access events can include a related snapshot.',
    acsHelpMobileCards: 'Issue and manage supported mobile credentials.',
    acsSetupStartHere: 'START HERE',
    acsSetupTitle: 'Quick setup path',
    acsSetupSubtitle: 'Follow these four steps to make access control ready for daily use.',
    acsSetupReady: 'ready',
    acsSetupStep: 'Step',
    acsSetupController: 'Connect a controller',
    acsSetupControllerDetail: 'Add the device that manages your doors.',
    acsSetupControllerReady: '{count} controller(s) added',
    acsSetupPeople: 'Add people',
    acsSetupPeopleDetail: 'Create employees and assign credentials.',
    acsSetupPeopleReady: '{count} person(s) added',
    acsSetupAccess: 'Define access',
    acsSetupAccessDetail: 'Choose doors, people and schedules.',
    acsSetupAccessReady: '{count} access level(s) created',
    acsSetupMonitor: 'Check doors live',
    acsSetupMonitorDetail: 'Verify door state and recent events.',
    acsStatusLegend: 'Status guide:',
    acsStatusNormal: 'Normal',
    acsStatusAttention: 'Needs attention',
    acsStatusCritical: 'Critical',
    acsStatusInactive: 'Inactive',
  },
  hy: {
    acsNavHome: 'Գլխավոր',
    acsNavControllers: 'Վերահսկիչներ',
    acsNavLiveDoors: 'Դռներ առցանց',
    acsNavPeople: 'Անձինք',
    acsNavCredentialCheck: 'Տվյալների ստուգում',
    acsNavAccessRules: 'Մուտքի կանոններ',
    acsNavVisitors: 'Այցելուներ',
    acsNavImportPeople: 'Անձանց ներմուծում',
    acsNavAttendance: 'Հաճախումներ',
    acsNavRequests: 'Մուտքի հարցումներ',
    acsNavAntiPassback: 'Կրկնակի մուտքի արգելք',
    acsNavDualAuth: 'Երկու անձով հաստատում',
    acsNavTailgating: 'Մի քանի անձի անցում',
    acsNavGuardTour: 'Պահակային երթուղիներ',
    acsNavMustering: 'Արտակարգ հաշվառում',
    acsNavAudit: 'Գործողությունների հաշվետվություն',
    acsNavOccupancy: 'Մարդիկ գոտիներում',
    acsNavHistory: 'Անցումների պատմություն',
    acsNavAnalytics: 'Մուտքի վերլուծություն',
    acsNavHolidays: 'Տոներ',
    acsNavLift: 'Հարկերի հասանելիություն',
    acsNavPolicies: 'Մուտքի ձևանմուշներ',
    acsNavDoorCamera: 'Դռների տեսախցիկներ',
    acsNavMobileCards: 'Բջջային անցագրեր',
    acsBeta: 'ՓՈՐՁ.',
    acsHelpButton: 'Օգնություն',
    acsHelpHowToStart: 'Ինչպես օգտագործել այս էջը',
    acsHelpNothingHidden: 'Բոլոր գործառույթները պահպանված են։ Ինտերֆեյսը միայն դասավորում է դրանք ըստ խնդրի և առաջնահերթության։',
    acsHelpGoDashboard: 'Գլխավոր էջ',
    acsHelpFindFunction: 'Գտնել գործառույթ',
    acsGuideDashboard: 'Սկզբում ստուգեք ուշադրություն պահանջող բաժինը։|Հաճախակի գործողությունների համար օգտագործեք արագ կոճակները։|Նոր համակարգի դեպքում հետևեք արագ կարգավորման քայլերին։',
    acsGuideDevices: 'Ստուգեք յուրաքանչյուր վերահսկիչի կապի վիճակը։|Ավելացրեք կամ խմբագրեք վերահսկիչի կապի տվյալները։|Դռներն օգտագործելուց առաջ փորձարկեք կապը։',
    acsGuideMonitoring: 'Բացեք բոլոր վերահսկիչները և ընտրեք անհրաժեշտը։|Ընտրեք դռան քարտը՝ կառավարումը բացելու կամ փակելու համար։|Արդյունքը հաստատեք իրադարձությունների ցանկում։',
    acsGuidePersons: 'Ընտրեք անհրաժեշտ բաժինը։|Ավելացրեք անձին և նրա նույնականացման միջոցները։|Պահպանումից հետո ստուգեք համաժամացման արդյունքը։',
    acsGuideCredentials: 'Խնդրի զտիչով գտեք թերի տվյալներով անձանց։|Բացեք անձին և լրացրեք բացակայող տվյալները։|Կրկնեք համաժամացումը և ստուգեք վերջնական վիճակը։',
    acsGuideLevels: 'Ստեղծեք մուտքի կանոն տարածքի կամ դերի համար։|Ընտրեք դռները, ժամանակացույցը և անձանց։|Ստուգեք և կիրառեք կանոնը վերահսկիչների վրա։',
    acsGuideVisitors: 'Գրանցեք այցելուին և այցի ժամանակը։|Տրամադրեք անհրաժեշտ ժամանակավոր մուտքը։|Այցի ավարտից հետո փակեք կամ դիտեք այն։',
    acsGuideBulkImport: 'Ներբեռնեք և լրացրեք ձևանմուշը։|Ընտրեք պատրաստված CSV կամ Excel ֆայլը։|Ներմուծումից առաջ դիտեք տողերի նախադիտումը։',
    acsGuideAttendance: 'Ընտրեք ամսաթիվը կամ հաշվետու ժամանակահատվածը։|Սկզբում ստուգեք հաճախման բացառությունները։|Բացեք անձին՝ մանրամասն ժամերը դիտելու համար։',
    acsGuideRequests: 'Սկզբում բացեք սպասող հարցումները։|Ստուգեք անձին, դուռը և պահանջվող ժամանակը։|Հաստատեք կամ մերժեք՝ նշելով հստակ պատճառը։',
    acsGuideAntiPassback: 'Ստեղծեք կանոն անհրաժեշտ մուտքի և ելքի դռների համար։|Նախազգուշացման համար ընտրեք մեղմ, իսկ արգելափակման համար՝ խիստ ռեժիմ։|Կանոնը փոխելուց առաջ դիտեք խախտումները։',
    acsGuideDualAuth: 'Ընտրեք պաշտպանվող դուռը։|Սահմանեք երկու նույնականացման միջոցը և ժամանակային պատուհանը։|Փորձարկեք կանոնը թույլատրված տվյալներով։',
    acsGuideTailgating: 'Կապեք վերահսկվող դուռը և հայտնաբերման աղբյուրը։|Սահմանեք ահազանգի պայմանները։|Դիտեք դեպքերը և հաստատեք իրական խախտումները։',
    acsGuideGuardTour: 'Ստեղծեք երթուղի և հերթականությամբ ավելացրեք կետերը։|Նշեք նախատեսված ժամանակը կամ պահակին։|Դիտեք բաց թողնված և ավարտված կետերը։',
    acsGuideMustering: 'Ընտրեք արտակարգ կամ վերահսկվող գոտին։|Դիտեք ներսում նշված անձանց։|Յուրաքանչյուր անձի համար հաստատեք հաշվառումը։',
    acsGuideAudit: 'Ընտրեք ժամանակահատվածը և գործողության տեսակը։|Զտիչներով նեղացրեք հաշվետվությունը։|Անհրաժեշտության դեպքում արտահանեք ստուգված արդյունքը։',
    acsGuideOccupancy: 'Ընտրեք գոտին՝ ընթացիկ քանակը տեսնելու համար։|Ստուգեք թվի հիմքում գտնվող մուտքի և ելքի դեպքերը։|Ուսումնասիրեք սահմանաչափը գերազանցած գոտիները։',
    acsGuideLogs: 'Սահմանեք վերահսկիչի, դռան և իրադարձության զտիչները։|Որոնեք ըստ անձի, քարտի կամ ժամանակի։|Բացեք համապատասխան իրադարձությունը՝ մանրամասները տեսնելու համար։',
    acsGuideAnalytics: 'Ընտրեք հաշվետու ժամանակահատվածը։|Համեմատեք թույլատրված, մերժված և պիկային ակտիվությունը։|Հաշվետվության համար արտահանեք տվյալները։',
    acsGuideHolidays: 'Ընտրեք անհրաժեշտ տարին։|Ավելացրեք պետական կամ կազմակերպության հատուկ օրերը։|Ստուգեք, թե որ ժամանակացույցերն են օգտագործում բացառությունը։',
    acsGuideLift: 'Ավելացրեք աջակցվող վերելակային վերահսկիչը։|Կապեք հարկերը մուտքի կանոնների հետ։|Ակտիվացումից առաջ փորձարկեք նշանակված տվյալը։',
    acsGuidePolicies: 'Ստեղծեք դռների և ժամանակացույցի բազմակի օգտագործման ձևանմուշ։|Կիրառելուց առաջ ստուգեք այն։|Կիրառեք մուտքի կանոնի վրա և ստուգեք արդյունքը։',
    acsGuideDoorCamera: 'Ընտրեք վերահսկիչը և դուռը։|Ընտրեք այդ դուռը դիտող տեսախցիկը։|Ստեղծեք փորձնական իրադարձություն և ստուգեք լուսանկարը։',
    acsGuideMobileCards: 'Ընտրեք անցագիր ստացող անձին։|Թողարկեք և փոխանցեք բջջային նույնականացման միջոցը։|Սարքի փոփոխման դեպքում չեղարկեք կամ վերաթողարկեք այն։',
    acsSectionDoors: 'ԴՌՆԵՐ ԵՎ ՎԵՐԱՀՍԿԻՉՆԵՐ',
    acsSectionPeopleAccess: 'ԱՆՁԻՆՔ ԵՎ ՄՈՒՏՔ',
    acsSectionWorkforce: 'ԱՇԽԱՏԱԺԱՄԱՆԱԿ',
    acsSectionInsights: 'ՀԱՇՎԵՏՎՈՒԹՅՈՒՆ ԵՎ ՎԵՐԼՈՒԾՈՒԹՅՈՒՆ',
    acsHelpDashboard: 'Համակարգի վիճակի, առաջադրանքների և այսօրվա մուտքի իրադարձությունների համառոտ պատկերը։',
    acsHelpDevices: 'Ավելացրեք վերահսկիչներ, ստուգեք կապը և կառավարեք յուրաքանչյուր սարքին միացված դռները։',
    acsHelpMonitoring: 'Հետևեք դռների վիճակին և իրադարձություններին իրական ժամանակում, իսկ կառավարումը բացելու համար ընտրեք դուռը։',
    acsHelpPersons: 'Ավելացրեք աշխատակիցներ, կազմեք բաժիններ և կառավարեք յուրաքանչյուր անձի նույնականացման միջոցները։',
    acsHelpCredentials: 'Գտեք բացակայող տվյալները, համաժամացման սխալները և ուշադրություն պահանջող անձանց։',
    acsHelpLevels: 'Սահմանեք, թե ով, որ դռներով և ինչ ժամանակացույցով կարող է մուտք գործել։',
    acsHelpVisitors: 'Գրանցեք այցելուներին, հետևեք ընթացիկ այցերին և դիտեք ավարտված կամ ուշացած այցերը։',
    acsHelpBulkImport: 'Ներմուծեք անձանց և նույնականացման տվյալները պատրաստված CSV կամ Excel ֆայլից։',
    acsHelpAttendance: 'Դիտեք հաճախումները, հերթափոխերը, ժամանակացույցերը և հաշվարկված աշխատաժամանակը։',
    acsHelpRequests: 'Դիտեք և հաստատեք ժամանակավոր կամ բացառիկ մուտքի հարցումները։',
    acsHelpAntiPassback: 'Կանխեք կրկնակի մուտքն առանց համապատասխան ելքի և դիտեք խախտումները։',
    acsHelpDualAuth: 'Պաշտպանված դուռը բացելուց առաջ պահանջեք երկու տարբեր նույնականացման միջոց։',
    acsHelpTailgating: 'Հայտնաբերեք դեպքերը, երբ մեկ նույնականացման իրադարձությամբ անցնում է մի քանի անձ։',
    acsHelpGuardTour: 'Ստեղծեք պահակային երթուղիներ և վերահսկեք անցակետերի ժամանակին կատարումը։',
    acsHelpMustering: 'Արտակարգ իրավիճակում տեսեք, թե ովքեր են ներսում և հաշվառեք մարդկանց։',
    acsHelpAudit: 'Զտեք, դիտեք և արտահանեք անվտանգության ու կառավարման գործողությունները։',
    acsHelpOccupancy: 'Վերահսկեք կառավարվող գոտիներում գտնվող մարդկանց ընթացիկ քանակը։',
    acsHelpLogs: 'Որոնեք թույլատրված, մերժված, տագնապային և ձեռքով կատարված դռների իրադարձությունները։',
    acsHelpAnalytics: 'Համեմատեք մուտքի ակտիվությունը, միտումները և բացառությունները ընտրված ժամանակահատվածում։',
    acsHelpHolidays: 'Կառավարեք տոները և բացառությունները, որոնք օգտագործվում են ժամանակացույցերում։',
    acsHelpLift: 'Կարգավորեք հարկերի հասանելիությունը աջակցվող վերելակային վերահսկիչների համար։',
    acsHelpPolicies: 'Վերօգտագործեք դռների և ժամանակացույցերի կարգավորումները մուտքի մակարդակներ ստեղծելիս։',
    acsHelpDoorCamera: 'Կապեք տեսախցիկը դռանը, որպեսզի մուտքի իրադարձությունը ունենա համապատասխան լուսանկար։',
    acsHelpMobileCards: 'Թողարկեք և կառավարեք աջակցվող բջջային նույնականացման միջոցները։',
    acsSetupStartHere: 'ՍԿՍԵՔ ԱՅՍՏԵՂԻՑ',
    acsSetupTitle: 'Արագ կարգավորման ուղի',
    acsSetupSubtitle: 'Կատարեք այս չորս քայլը՝ համակարգը ամենօրյա աշխատանքի պատրաստելու համար։',
    acsSetupReady: 'պատրաստ',
    acsSetupStep: 'Քայլ',
    acsSetupController: 'Միացնել վերահսկիչը',
    acsSetupControllerDetail: 'Ավելացրեք ձեր դռները կառավարող սարքը։',
    acsSetupControllerReady: 'Ավելացված վերահսկիչներ՝ {count}',
    acsSetupPeople: 'Ավելացնել անձանց',
    acsSetupPeopleDetail: 'Ստեղծեք աշխատակիցներ և կցեք նույնականացման միջոցներ։',
    acsSetupPeopleReady: 'Ավելացված անձինք՝ {count}',
    acsSetupAccess: 'Սահմանել մուտքը',
    acsSetupAccessDetail: 'Ընտրեք դռները, անձանց և ժամանակացույցերը։',
    acsSetupAccessReady: 'Ստեղծված մուտքի մակարդակներ՝ {count}',
    acsSetupMonitor: 'Ստուգել դռները',
    acsSetupMonitorDetail: 'Ստուգեք դռների վիճակը և վերջին իրադարձությունները։',
    acsStatusLegend: 'Կարգավիճակներ՝',
    acsStatusNormal: 'Նորմալ',
    acsStatusAttention: 'Պահանջում է ուշադրություն',
    acsStatusCritical: 'Կրիտիկական',
    acsStatusInactive: 'Անջատված',
  },
  ru: {
    acsNavHome: 'Главная',
    acsNavControllers: 'Контроллеры',
    acsNavLiveDoors: 'Двери онлайн',
    acsNavPeople: 'Люди',
    acsNavCredentialCheck: 'Проверка учётных данных',
    acsNavAccessRules: 'Правила доступа',
    acsNavVisitors: 'Посетители',
    acsNavImportPeople: 'Импорт людей',
    acsNavAttendance: 'Посещаемость',
    acsNavRequests: 'Запросы на доступ',
    acsNavAntiPassback: 'Защита от повторного входа',
    acsNavDualAuth: 'Подтверждение двумя людьми',
    acsNavTailgating: 'Проход нескольких людей',
    acsNavGuardTour: 'Маршруты охраны',
    acsNavMustering: 'Учёт при эвакуации',
    acsNavAudit: 'Отчёт о действиях',
    acsNavOccupancy: 'Люди в зонах',
    acsNavHistory: 'История проходов',
    acsNavAnalytics: 'Аналитика доступа',
    acsNavHolidays: 'Праздники',
    acsNavLift: 'Доступ к этажам',
    acsNavPolicies: 'Шаблоны доступа',
    acsNavDoorCamera: 'Камеры у дверей',
    acsNavMobileCards: 'Мобильные пропуска',
    acsBeta: 'ТЕСТ',
    acsHelpButton: 'Помощь',
    acsHelpHowToStart: 'Как пользоваться этой страницей',
    acsHelpNothingHidden: 'Все функции сохранены. Интерфейс только упорядочивает их по задачам и важности.',
    acsHelpGoDashboard: 'На главную',
    acsHelpFindFunction: 'Найти функцию',
    acsGuideDashboard: 'Сначала проверьте блок «Требует внимания».|Для частых задач используйте быстрые действия.|При первичной настройке следуйте четырём шагам.',
    acsGuideDevices: 'Проверьте, какие контроллеры находятся в сети.|Добавьте или измените параметры подключения контроллера.|Перед управлением дверями проверьте соединение.',
    acsGuideMonitoring: 'Раскройте «Все контроллеры» и выберите нужный.|Нажмите на карточку двери, чтобы открыть или закрыть управление.|Проверьте результат в списке событий.',
    acsGuidePersons: 'Выберите нужный отдел.|Добавьте человека и используемые им учётные данные.|После сохранения проверьте результат синхронизации.',
    acsGuideCredentials: 'Фильтром проблемы найдите людей с неполными данными.|Откройте человека и добавьте отсутствующие данные.|Повторите синхронизацию и проверьте итоговый статус.',
    acsGuideLevels: 'Создайте правило доступа для зоны или должности.|Выберите двери, расписание и людей.|Проверьте и примените правило к контроллерам.',
    acsGuideVisitors: 'Создайте посетителя и укажите время визита.|Назначьте необходимый временный доступ.|После завершения закройте визит или просмотрите его историю.',
    acsGuideBulkImport: 'Скачайте и заполните шаблон.|Выберите подготовленный файл CSV или Excel.|Перед импортом обязательно проверьте предварительный просмотр.',
    acsGuideAttendance: 'Выберите дату или отчётный период.|Сначала проверьте отклонения посещаемости.|Откройте человека для просмотра подробного учёта времени.',
    acsGuideRequests: 'Сначала откройте ожидающие запросы.|Проверьте человека, дверь и запрошенный период.|Подтвердите или отклоните запрос с понятной причиной.',
    acsGuideAntiPassback: 'Создайте правило для нужных входных и выходных дверей.|Для предупреждения выберите мягкий режим, для блокировки — строгий.|Перед изменением правила проверьте нарушения.',
    acsGuideDualAuth: 'Выберите защищаемую дверь.|Укажите пару учётных данных и допустимое время.|Проверьте правило разрешёнными идентификаторами.',
    acsGuideTailgating: 'Свяжите контролируемую дверь с источником обнаружения.|Задайте условия предупреждения.|Просмотрите обнаружения и подтвердите реальные нарушения.',
    acsGuideGuardTour: 'Создайте маршрут и добавьте контрольные точки по порядку.|Назначьте время или сотрудника охраны.|Проверьте пропущенные и пройденные точки.',
    acsGuideMustering: 'Выберите аварийную или контролируемую зону.|Проверьте людей, отмеченных внутри.|Подтвердите учёт каждого человека.',
    acsGuideAudit: 'Выберите период и тип действия.|Сузьте отчёт с помощью фильтров.|При необходимости экспортируйте проверенный результат.',
    acsGuideOccupancy: 'Выберите зону и посмотрите текущее количество людей.|Проверьте события входа и выхода, из которых получено число.|Разберите зоны с превышенным лимитом.',
    acsGuideLogs: 'Задайте фильтры контроллера, двери и события.|Ищите по человеку, карте или времени.|Откройте найденное событие для просмотра подробностей.',
    acsGuideAnalytics: 'Выберите отчётный период.|Сравните разрешённые, отклонённые события и часы пик.|Экспортируйте данные, если нужен отчёт.',
    acsGuideHolidays: 'Выберите нужный год.|Добавьте государственные или внутренние выходные дни.|Проверьте, какие расписания используют исключение.',
    acsGuideLift: 'Добавьте поддерживаемый лифтовой контроллер.|Свяжите этажи с правилами доступа.|Перед включением проверьте назначенный идентификатор.',
    acsGuidePolicies: 'Создайте повторно используемый шаблон дверей и расписания.|Проверьте шаблон перед применением.|Примените его к правилу доступа и проверьте результат.',
    acsGuideDoorCamera: 'Выберите контроллер и дверь.|Назначьте камеру, которая видит эту дверь.|Создайте тестовое событие и проверьте снимок.',
    acsGuideMobileCards: 'Выберите человека, которому выдаётся пропуск.|Выпустите и передайте мобильный идентификатор.|При смене устройства отзовите или перевыпустите его.',
    acsSectionDoors: 'ДВЕРИ И КОНТРОЛЛЕРЫ',
    acsSectionPeopleAccess: 'ЛЮДИ И ДОСТУП',
    acsSectionWorkforce: 'ВРЕМЯ И ПОСЕЩАЕМОСТЬ',
    acsSectionInsights: 'ОТЧЁТЫ И АНАЛИТИКА',
    acsHelpDashboard: 'Краткий обзор состояния системы, задач и событий доступа за сегодня.',
    acsHelpDevices: 'Добавляйте контроллеры, проверяйте связь и управляйте подключёнными к ним дверями.',
    acsHelpMonitoring: 'Следите за дверями и событиями в реальном времени; выберите дверь, чтобы открыть управление.',
    acsHelpPersons: 'Добавляйте сотрудников, создавайте отделы и управляйте учётными данными каждого человека.',
    acsHelpCredentials: 'Находите отсутствующие данные, ошибки синхронизации и людей, требующих внимания.',
    acsHelpLevels: 'Определяйте, кто, через какие двери и по какому расписанию может проходить.',
    acsHelpVisitors: 'Регистрируйте посетителей, контролируйте текущие визиты и просматривайте историю.',
    acsHelpBulkImport: 'Загружайте людей и учётные данные из подготовленного файла CSV или Excel.',
    acsHelpAttendance: 'Просматривайте посещаемость, смены, расписания и рассчитанное рабочее время.',
    acsHelpRequests: 'Проверяйте и подтверждайте временные или исключительные запросы на доступ.',
    acsHelpAntiPassback: 'Запрещайте повторный вход без соответствующего выхода и проверяйте нарушения.',
    acsHelpDualAuth: 'Требуйте два разных активных идентификатора перед открытием защищённой двери.',
    acsHelpTailgating: 'Выявляйте случаи, когда по одному идентификатору проходит несколько человек.',
    acsHelpGuardTour: 'Создавайте маршруты охраны и контролируйте своевременное прохождение точек.',
    acsHelpMustering: 'Смотрите, кто находится внутри, и проводите учёт людей при эвакуации.',
    acsHelpAudit: 'Фильтруйте, проверяйте и экспортируйте действия безопасности и администрирования.',
    acsHelpOccupancy: 'Контролируйте текущее количество людей в управляемых зонах.',
    acsHelpLogs: 'Ищите разрешённые, отклонённые, тревожные и ручные события дверей.',
    acsHelpAnalytics: 'Сравнивайте активность доступа, тенденции и исключения за выбранный период.',
    acsHelpHolidays: 'Управляйте праздниками и исключениями, используемыми в расписаниях.',
    acsHelpLift: 'Настраивайте доступ к этажам для поддерживаемых лифтовых контроллеров.',
    acsHelpPolicies: 'Повторно используйте настройки дверей и расписаний при создании уровней доступа.',
    acsHelpDoorCamera: 'Связывайте камеры с дверями, чтобы сохранять снимок вместе с событием доступа.',
    acsHelpMobileCards: 'Выпускайте и управляйте поддерживаемыми мобильными идентификаторами.',
    acsSetupStartHere: 'НАЧНИТЕ ЗДЕСЬ',
    acsSetupTitle: 'Быстрая настройка',
    acsSetupSubtitle: 'Выполните четыре шага, чтобы подготовить контроль доступа к ежедневной работе.',
    acsSetupReady: 'готово',
    acsSetupStep: 'Шаг',
    acsSetupController: 'Подключить контроллер',
    acsSetupControllerDetail: 'Добавьте устройство, которое управляет дверями.',
    acsSetupControllerReady: 'Добавлено контроллеров: {count}',
    acsSetupPeople: 'Добавить людей',
    acsSetupPeopleDetail: 'Создайте сотрудников и назначьте идентификаторы.',
    acsSetupPeopleReady: 'Добавлено людей: {count}',
    acsSetupAccess: 'Настроить доступ',
    acsSetupAccessDetail: 'Выберите двери, людей и расписание.',
    acsSetupAccessReady: 'Создано уровней доступа: {count}',
    acsSetupMonitor: 'Проверить двери',
    acsSetupMonitorDetail: 'Проверьте состояние дверей и последние события.',
    acsStatusLegend: 'Статусы:',
    acsStatusNormal: 'Норма',
    acsStatusAttention: 'Требует внимания',
    acsStatusCritical: 'Критично',
    acsStatusInactive: 'Неактивно',
  },
};

const ACS_UI_ROWS = [
  ['All', 'Բոլորը', 'Все'],
  ['Local', 'Տեղային', 'Локально'],
  ['Controller', 'Վերահսկիչ', 'Контроллер'],
  ['Door', 'Դուռ', 'Дверь'],
  ['Event', 'Իրադարձություն', 'Событие'],
  ['Credential', 'Հավաստագիր', 'Учётные данные'],
  ['Access granted', 'Մուտքը թույլատրված է', 'Доступ разрешён'],
  ['Access denied', 'Մուտքը մերժված է', 'Доступ запрещён'],
  ['Manual unlock', 'Ձեռքով ապակողպում', 'Ручная разблокировка'],
  ['Card + face', 'Քարտ + դեմք', 'Карта + лицо'],
  ['Access Controller', 'Մուտքի վերահսկիչ', 'Контроллер доступа'],
  ['Device Management', 'Սարքերի կառավարում', 'Управление устройствами'],
  ['Devices', 'Սարքեր', 'Устройства'],
  ['Access Control Devices', 'Մուտքի վերահսկման սարքեր', 'Устройства контроля доступа'],
  ['Add Device', 'Ավելացնել սարք', 'Добавить устройство'], ['Add First Device', 'Ավելացնել առաջին սարքը', 'Добавить первое устройство'],
  ['Total', 'Ընդամենը', 'Всего'], ['Online', 'Առցանց', 'Онлайн'], ['Offline', 'Անցանց', 'Офлайн'], ['Disabled', 'Անջատված', 'Отключено'], ['Active', 'Ակտիվ', 'Активно'],
  ['Search controllers...', 'Որոնել վերահսկիչներ…', 'Поиск контроллеров…'], ['All devices', 'Բոլոր սարքերը', 'Все устройства'], ['Refresh All', 'Թարմացնել բոլորը', 'Обновить всё'],
  ['New ACS Device', 'Նոր ACS սարք', 'Новое устройство ACS'], ['Loading devices...', 'Սարքերը բեռնվում են…', 'Загрузка устройств…'],
  ['No access control devices yet.', 'Մուտքի վերահսկման սարքեր դեռ չկան։', 'Устройств контроля доступа пока нет.'],
  ['No devices match the current search or status filter.', 'Ոչ մի սարք չի համապատասխանում որոնմանը կամ կարգավիճակի զտիչին։', 'Нет устройств, соответствующих поиску или фильтру статуса.'],
  ['Confirm', 'Հաստատել', 'Подтвердить'], ['Notice', 'Ծանուցում', 'Уведомление'], ['Cancel', 'Չեղարկել', 'Отмена'], ['Delete', 'Ջնջել', 'Удалить'], ['Edit', 'Խմբագրել', 'Изменить'], ['OK', 'Լավ', 'ОК'],
  ['Device Name *', 'Սարքի անուն *', 'Название устройства *'], ['Main Entrance Controller', 'Հիմնական մուտքի վերահսկիչ', 'Контроллер главного входа'],
  ['IP Address *', 'IP հասցե *', 'IP-адрес *'], ['Control Mode', 'Կառավարման եղանակ', 'Режим управления'],
  ['HTTP Port', 'HTTP պորտ', 'HTTP-порт'], ['SDK Port', 'SDK պորտ', 'SDK-порт'], ['Door Count', 'Դռների քանակ', 'Количество дверей'],
  ['Username', 'Օգտանուն', 'Имя пользователя'], ['Password', 'Գաղտնաբառ', 'Пароль'], ['Password (leave blank to keep)', 'Գաղտնաբառ (դատարկ թողեք՝ չփոխելու համար)', 'Пароль (оставьте пустым, чтобы не менять)'],
  ['Enter password', 'Մուտքագրեք գաղտնաբառը', 'Введите пароль'], ['Location', 'Տեղադրություն', 'Расположение'], ['Notes', 'Նշումներ', 'Примечания'], ['Optional notes', 'Լրացուցիչ նշումներ', 'Дополнительные примечания'],
  ['Building A, Floor 1', 'Շենք A, 1-ին հարկ', 'Здание A, этаж 1'], ['Test Connection', 'Փորձարկել կապը', 'Проверить соединение'], ['Testing...', 'Փորձարկվում է…', 'Проверка…'],
  ['Saving...', 'Պահվում է…', 'Сохранение…'], ['Update Device', 'Թարմացնել սարքը', 'Обновить устройство'], ['Connection', 'Կապ', 'Подключение'], ['Connected', 'Միացված', 'Подключено'], ['Not checked', 'Չստուգված', 'Не проверено'],
  ['Not specified', 'Նշված չէ', 'Не указано'], ['Last configuration update', 'Կազմաձևի վերջին թարմացում', 'Последнее обновление конфигурации'],
  ['Refresh Status', 'Թարմացնել կարգավիճակը', 'Обновить статус'], ['Capturing...', 'Նկարվումը կատարվում է…', 'Снимок создаётся…'], ['Snapshot', 'Պատկեր', 'Снимок'],
  ['Show', 'Ցույց տալ', 'Показать'], ['Hide', 'Թաքցնել', 'Скрыть'], ['Log', 'Մատյան', 'Журнал'], ['Loading...', 'Բեռնվում է…', 'Загрузка…'], ['No events yet', 'Իրադարձություններ դեռ չկան', 'Событий пока нет'],
  ['Recent Access Log', 'Մուտքերի վերջին մատյան', 'Последний журнал доступа'], ['Time', 'Ժամանակ', 'Время'], ['Door', 'Դուռ', 'Дверь'], ['Type', 'Տեսակ', 'Тип'], ['Card / Person', 'Քարտ / անձ', 'Карта / персона'],
  ['Checking...', 'Ստուգվում է…', 'Проверка…'], ['Refresh', 'Թարմացնել', 'Обновить'], ['Syncing...', 'Համաժամացվում է…', 'Синхронизация…'], ['Sync Cards', 'Համաժամացնել քարտերը', 'Синхронизировать карты'],
  ['Loading sync info...', 'Համաժամացման տվյալները բեռնվում են…', 'Загрузка сведений о синхронизации…'], ['Offline cache empty', 'Անցանց պահոցը դատարկ է', 'Офлайн-кэш пуст'],
  ['Unlocked', 'Ապակողպված', 'Разблокировано'], ['Locked', 'Կողպված', 'Заблокировано'], ['Open', 'Բաց', 'Открыта'], ['Closed', 'Փակ', 'Закрыта'],
  ['Unlock', 'Ապակողպել', 'Разблокировать'], ['Lock', 'Կողպել', 'Заблокировать'], ['Stay Open', 'Մնա բաց', 'Оставить открытой'], ['Stay Closed', 'Մնա փակ', 'Оставить закрытой'],
  ['Manual Unlock', 'Ձեռքով ապակողպում', 'Ручная разблокировка'], ['Manual Lock', 'Ձեռքով կողպում', 'Ручная блокировка'], ['Access Granted', 'Մուտքը թույլատրված է', 'Доступ разрешён'], ['Access Denied', 'Մուտքը մերժված է', 'Доступ запрещён'],
  ['Door Opened', 'Դուռը բացվել է', 'Дверь открыта'], ['Door Closed', 'Դուռը փակվել է', 'Дверь закрыта'], ['Alarm', 'Ահազանգ', 'Тревога'],
  ['Real-Time Monitoring', 'Իրական ժամանակի դիտարկում', 'Мониторинг в реальном времени'],
  ['Live door status, remote control and access events', 'Դռների ուղիղ կարգավիճակ, հեռավար կառավարում և մուտքի իրադարձություններ', 'Статус дверей, удалённое управление и события доступа в реальном времени'],
  ['Disable event sounds', 'Անջատել իրադարձությունների ձայները', 'Выключить звуки событий'], ['Enable event sounds', 'Միացնել իրադարձությունների ձայները', 'Включить звуки событий'],
  ['Events', 'Իրադարձություններ', 'События'], ['Auto refresh', 'Ավտոմատ թարմացում', 'Автообновление'], ['Pull Events', 'Բեռնել իրադարձությունները', 'Получить события'],
  ['Active Controllers', 'Ակտիվ վերահսկիչներ', 'Активные контроллеры'], ['Open Doors', 'Բաց դռներ', 'Открытые двери'], ['Granted Today', 'Այսօր թույլատրված', 'Разрешено сегодня'], ['Denied Today', 'Այսօր մերժված', 'Отказано сегодня'], ['Unknown Today', 'Այսօր անհայտ', 'Неизвестные сегодня'],
  ['Resources', 'Ռեսուրսներ', 'Ресурсы'], ['Search doors', 'Որոնել դռներ', 'Поиск дверей'], ['All Controllers', 'Բոլոր վերահսկիչները', 'Все контроллеры'], ['Door Status', 'Դռան կարգավիճակ', 'Статус двери'],
  ['Updating every 3 seconds', 'Թարմացվում է յուրաքանչյուր 3 վայրկյանը մեկ', 'Обновление каждые 3 секунды'], ['Auto refresh paused', 'Ավտոմատ թարմացումը դադարեցված է', 'Автообновление приостановлено'],
  ['Loading controllers...', 'Վերահսկիչները բեռնվում են…', 'Загрузка контроллеров…'], ['No matching doors', 'Համապատասխան դռներ չկան', 'Нет подходящих дверей'],
  ['Door Open', 'Դուռը բաց է', 'Дверь открыта'], ['Door Closed', 'Դուռը փակ է', 'Дверь закрыта'], ['Reader Online', 'Ընթերցիչը առցանց է', 'Считыватель онлайн'], ['Reader Offline', 'Ընթերցիչը անցանց է', 'Считыватель офлайн'],
  ['Select a door', 'Ընտրեք դուռ', 'Выберите дверь'], ['Remote door control', 'Դռան հեռավար կառավարում', 'Удалённое управление дверью'], ['Momentary unlock', 'Կարճատև ապակողպում', 'Кратковременная разблокировка'],
  ['Close Door', 'Փակել դուռը', 'Закрыть дверь'], ['Return to normal', 'Վերադարձնել նորմալ վիճակին', 'Вернуть в нормальный режим'], ['Remain Open', 'Մնալ բաց', 'Оставить открытой'], ['Keep door unlocked', 'Պահել դուռը ապակողպված', 'Оставить дверь разблокированной'],
  ['Remain Closed', 'Մնալ փակ', 'Оставить закрытой'], ['Keep door locked', 'Պահել դուռը կողպված', 'Оставить дверь заблокированной'],
  ['Emergency Open All', 'Արտակարգ բացել բոլորը', 'Экстренно открыть все'], ['Lockdown All', 'Արտակարգ փակել բոլորը', 'Заблокировать все'],
  ['Recent Operator Commands', 'Օպերատորի վերջին հրամանները', 'Последние команды оператора'], ['No operator commands recorded', 'Օպերատորի հրամաններ գրանցված չեն', 'Команды оператора не зарегистрированы'],
  ['Door Controllers', 'Դռների վերահսկիչներ', 'Контроллеры дверей'],
  ['Real-Time Events', 'Իրական ժամանակի իրադարձություններ', 'События в реальном времени'], ['Name, card, controller...', 'Անուն, քարտ, վերահսկիչ…', 'Имя, карта, контроллер…'],
  ['All Events', 'Բոլոր իրադարձությունները', 'Все события'], ['Manual Control', 'Ձեռքով կառավարում', 'Ручное управление'], ['All Credentials', 'Բոլոր հավաստագրերը', 'Все учётные данные'],
  ['Face', 'Դեմք', 'Лицо'], ['Card', 'Քարտ', 'Карта'], ['Fingerprint', 'Մատնահետք', 'Отпечаток пальца'], ['Manual', 'Ձեռքով', 'Вручную'],
  ['No events for this selection', 'Այս ընտրության համար իրադարձություններ չկան', 'Для этого выбора нет событий'], ['Unknown person', 'Անհայտ անձ', 'Неизвестная персона'],
  ['Access Event Details', 'Մուտքի իրադարձության մանրամասներ', 'Сведения о событии доступа'], ['Person', 'Անձ', 'Персона'], ['Result', 'Արդյունք', 'Результат'], ['Controller', 'Վերահսկիչ', 'Контроллер'],
  ['Credential', 'Հավաստագիր', 'Учётные данные'], ['Card Number', 'Քարտի համար', 'Номер карты'], ['Reason', 'Պատճառ', 'Причина'],
  ['Person Management', 'Անձանց կառավարում', 'Управление персонами'], ['Add Person', 'Ավելացնել անձ', 'Добавить персону'], ['Search people...', 'Որոնել անձանց…', 'Поиск персон…'], ['Department', 'Բաժին', 'Отдел'],
  ['Access Levels', 'Մուտքի մակարդակներ', 'Уровни доступа'], ['Create Access Level', 'Ստեղծել մուտքի մակարդակ', 'Создать уровень доступа'], ['Search access levels', 'Որոնել մուտքի մակարդակներ', 'Поиск уровней доступа'],
  ['Credential Health', 'Հավաստագրերի կարգավիճակ', 'Состояние учётных данных'], ['ID, name or department', 'ID, անուն կամ բաժին', 'ID, имя или отдел'],
  ['Visitor Management', 'Այցելուների կառավարում', 'Управление посетителями'], ['Add Visitor', 'Ավելացնել այցելու', 'Добавить посетителя'], ['Bulk Import', 'Զանգվածային ներմուծում', 'Массовый импорт'], ['Attendance', 'Հաճախում', 'Посещаемость'],
  ['Apply', 'Կիրառել', 'Применить'], ['Clear', 'Մաքրել', 'Очистить'], ['Filter', 'Զտիչ', 'Фильтр'], ['Status', 'Կարգավիճակ', 'Статус'], ['Actions', 'Գործողություններ', 'Действия'],
  ['Create', 'Ստեղծել', 'Создать'], ['Update', 'Թարմացնել', 'Обновить'], ['Back', 'Հետ', 'Назад'], ['Next', 'Հաջորդ', 'Далее'], ['Previous', 'Նախորդ', 'Назад'],
  ['Required', 'Պարտադիր', 'Обязательно'], ['Optional', 'Ընտրովի', 'Необязательно'], ['Details', 'Մանրամասներ', 'Сведения'], ['Name', 'Անուն', 'Имя'], ['Date', 'Ամսաթիվ', 'Дата'],
  ['Access Events', 'Մուտքի իրադարձություններ', 'События доступа'], ['Access Logs', 'Մուտքերի մատյան', 'Журнал доступа'], ['Access Requests', 'Մուտքի հարցումներ', 'Запросы доступа'], ['ACS Analytics', 'ACS վերլուծություն', 'Аналитика ACS'],
  ['Add & Issue Card', 'Ավելացնել և թողարկել քարտ', 'Добавить и выдать карту'], ['Add Another', 'Ավելացնել ևս մեկը', 'Добавить ещё'], ['Add Department', 'Ավելացնել բաժին', 'Добавить отдел'], ['Add PIN Code', 'Ավելացնել PIN կոդ', 'Добавить PIN-код'], ['Add Sub Department', 'Ավելացնել ենթաբաժին', 'Добавить подотдел'],
  ['All Day', 'Ամբողջ օրը', 'Весь день'], ['All Departments', 'Բոլոր բաժինները', 'Все отделы'], ['All persons', 'Բոլոր անձինք', 'Все персоны'], ['All events', 'Բոլոր իրադարձությունները', 'Все события'],
  ['Audit Report', 'Աուդիտի հաշվետվություն', 'Аудиторский отчёт'], ['Basic Information', 'Հիմնական տեղեկություններ', 'Основная информация'], ['Bulk Import', 'Զանգվածային ներմուծում', 'Массовый импорт'], ['Business Hours', 'Աշխատանքային ժամեր', 'Рабочие часы'],
  ['Capture From Device', 'Նկարել սարքից', 'Снять с устройства'], ['Capture From USB Camera', 'Նկարել USB տեսախցիկից', 'Снять с USB-камеры'], ['Capture Photo', 'Նկարել լուսանկար', 'Сделать фото'], ['Check In', 'Մուտք', 'Приход'], ['Check Out', 'Ելք', 'Уход'],
  ['Click to manage credentials', 'Սեղմեք՝ հավաստագրերը կառավարելու համար', 'Нажмите, чтобы управлять учётными данными'], ['Clone level', 'Պատճենել մակարդակը', 'Клонировать уровень'], ['Create & Generate QR', 'Ստեղծել և գեներացնել QR', 'Создать и сгенерировать QR'], ['Create Level', 'Ստեղծել մակարդակ', 'Создать уровень'],
  ['Create a person and assign controller credentials', 'Ստեղծել անձ և նշանակել վերահսկիչի հավաստագրեր', 'Создать персону и назначить учётные данные контроллера'], ['Credential & Apply Health', 'Հավաստագրեր և կիրառելիության վիճակ', 'Учётные данные и состояние применения'], ['Current access role', 'Ընթացիկ մուտքի դեր', 'Текущая роль доступа'], ['Custom Schedule', 'Անհատական ժամանակացույց', 'Пользовательское расписание'],
  ['Date of Employment', 'Աշխատանքի ընդունման ամսաթիվ', 'Дата приёма на работу'], ['Delete Department', 'Ջնջել բաժինը', 'Удалить отдел'], ['Department name', 'Բաժնի անուն', 'Название отдела'], ['Deploy schedule to controllers', 'Տեղակայել ժամանակացույցը վերահսկիչներին', 'Развернуть расписание на контроллерах'], ['Describe what happened…', 'Նկարագրեք՝ ինչ է տեղի ունեցել…', 'Опишите, что произошло…'],
  ['Door #', 'Դռան №', 'Дверь №'], ['Door Camera', 'Դռան տեսախցիկ', 'Камера двери'], ['Door unlocked.', 'Դուռը ապակողպված է։', 'Дверь разблокирована.'], ['Dual Auth', 'Երկակի հաստատում', 'Двойное подтверждение'], ['Dual Authentication', 'Երկակի նույնականացում', 'Двойная аутентификация'],
  ['Early Exit', 'Վաղ ելք', 'Ранний уход'], ['Edit Person', 'Խմբագրել անձին', 'Изменить персону'], ['Edit PIN Code', 'Խմբագրել PIN կոդը', 'Изменить PIN-код'], ['Effective Period', 'Գործողության ժամկետ', 'Срок действия'], ['Execute Import', 'Կատարել ներմուծումը', 'Выполнить импорт'], ['Export CSV', 'Արտահանել CSV', 'Экспорт CSV'], ['Export Excel', 'Արտահանել Excel', 'Экспорт Excel'],
  ['First Name', 'Անուն', 'Имя'], ['Free-form checkpoints', 'Ազատ ստուգման կետեր', 'Произвольные контрольные точки'], ['Full name', 'Ամբողջական անուն', 'Полное имя'], ['Full Name *', 'Ամբողջական անուն *', 'Полное имя *'], ['Guard Tour', 'Պահակային երթուղի', 'Маршрут охраны'], ['Half Day', 'Կես օր', 'Половина дня'], ['Holiday Calendar', 'Տոների օրացույց', 'Календарь праздников'],
  ['ID number', 'ID համար', 'Номер ID'], ['ID Number', 'ID համար', 'Номер ID'], ['In progress', 'Ընթացքի մեջ', 'В процессе'], ['Issue Card', 'Թողարկել քարտ', 'Выдать карту'], ['Last Name', 'Ազգանուն', 'Фамилия'], ['Lift Config', 'Վերելակի կարգավորում', 'Настройка лифта'], ['Manual adjust', 'Ձեռքով ճշգրտում', 'Ручная корректировка'], ['Mark Absent', 'Նշել բացակա', 'Отметить отсутствующим'], ['Mark Present', 'Նշել ներկա', 'Отметить присутствующим'],
  ['Missing card', 'Բացակա քարտ', 'Нет карты'], ['Missing face', 'Բացակա դեմք', 'Нет лица'], ['Missing fingerprint', 'Բացակա մատնահետք', 'Нет отпечатка'], ['Missing PIN', 'Բացակա PIN', 'Нет PIN'], ['Mobile Cards', 'Բջջային քարտեր', 'Мобильные карты'], ['New Access Level', 'Նոր մուտքի մակարդակ', 'Новый уровень доступа'], ['No access level', 'Մուտքի մակարդակ չկա', 'Нет уровня доступа'], ['No capacity limit', 'Տարողության սահմանափակում չկա', 'Без лимита вместимости'], ['No description', 'Նկարագրություն չկա', 'Нет описания'], ['No doors configured', 'Դռներ կազմաձևված չեն', 'Двери не настроены'],
  ['Note (optional)', 'Նշում (ընտրովի)', 'Примечание (необязательно)'], ['Office Hours', 'Գրասենյակային ժամեր', 'Офисные часы'], ['Optional description', 'Ընտրովի նկարագրություն', 'Необязательное описание'], ['Ordered checkpoints', 'Դասավորված ստուգման կետեր', 'Упорядоченные контрольные точки'], ['Pending approval', 'Սպասում է հաստատման', 'Ожидает одобрения'], ['Phone No.', 'Հեռախոսահամար', 'Номер телефона'], ['Policy Templates', 'Կանոնների ձևանմուշներ', 'Шаблоны политик'], ['Private Information', 'Անձնական տեղեկություններ', 'Личная информация'],
  ['QR Code', 'QR կոդ', 'QR-код'], ['Real Time Monitoring', 'Իրական ժամանակի դիտարկում', 'Мониторинг в реальном времени'], ['Reason, comment…', 'Պատճառ, մեկնաբանություն…', 'Причина, комментарий…'], ['Regenerate ID', 'Վերագեներացնել ID-ն', 'Сгенерировать ID заново'], ['Remove card', 'Հեռացնել քարտը', 'Удалить карту'], ['Remove fingerprint', 'Հեռացնել մատնահետքը', 'Удалить отпечаток'], ['Rename All Departments', 'Վերանվանել բոլոր բաժինները', 'Переименовать все отделы'], ['Rename Department', 'Վերանվանել բաժինը', 'Переименовать отдел'], ['Run Report', 'Կազմել հաշվետվություն', 'Сформировать отчёт'],
  ['Saved locally', 'Պահվել է տեղային', 'Сохранено локально'], ['Search access records', 'Որոնել մուտքի գրառումներ', 'Поиск записей доступа'], ['Search by name, department, card…', 'Որոնել անունով, բաժնով, քարտով…', 'Поиск по имени, отделу, карте…'], ['Search ID, name, card or email', 'Որոնել ID-ով, անունով, քարտով կամ էլ․ փոստով', 'Поиск по ID, имени, карте или e-mail'], ['Second card number', 'Երկրորդ քարտի համար', 'Номер второй карты'], ['Show QR', 'Ցույց տալ QR-ը', 'Показать QR'], ['Start Enrollment', 'Սկսել գրանցումը', 'Начать регистрацию'], ['Starting enrollment...', 'Գրանցումը սկսվում է…', 'Регистрация запускается…'], ['Submit Request', 'Ուղարկել հարցում', 'Отправить запрос'],
  ['Sync Now', 'Համաժամացնել հիմա', 'Синхронизировать сейчас'], ['Sync pending', 'Համաժամացումը սպասման մեջ է', 'Синхронизация ожидается'], ['Sync Status', 'Համաժամացման կարգավիճակ', 'Статус синхронизации'], ['Test snapshot', 'Փորձարկել պատկերը', 'Проверить снимок'], ['Time & Attendance', 'Ժամանակ և հաճախում', 'Время и посещаемость'], ['Total Employees', 'Աշխատակիցների ընդհանուր քանակ', 'Всего сотрудников'], ['Total Events', 'Իրադարձությունների ընդհանուր քանակ', 'Всего событий'], ['Try Again', 'Փորձել կրկին', 'Попробовать снова'], ['Unique Persons', 'Եզակի անձինք', 'Уникальные персоны'], ['Unlimited entries', 'Անսահմանափակ մուտքեր', 'Неограниченные проходы'], ['Unnamed person', 'Անանուն անձ', 'Безымянная персона'], ['Update Level', 'Թարմացնել մակարդակը', 'Обновить уровень'], ['Valid From', 'Գործում է՝ սկսած', 'Действует с'], ['Valid To', 'Գործում է՝ մինչև', 'Действует до'], ['Verify controller plan', 'Ստուգել վերահսկիչի պլանը', 'Проверить план контроллера'], ['Visit Reason', 'Այցի պատճառ', 'Причина визита'], ['Waiting for card...', 'Սպասում է քարտին…', 'Ожидание карты…'], ['Work Hours', 'Աշխատանքային ժամեր', 'Рабочие часы'], ['Zone Occupancy', 'Գոտիների զբաղվածություն', 'Занятость зон'],
  ['Include sub-departments', 'Ներառել ենթաբաժինները', 'Включить подотделы'], ['Add', 'Ավելացնել', 'Добавить'], ['Search', 'Որոնում', 'Поиск'], ['PROFILE PICTURE', 'ԱՆՁՆԱԿԱՆ ԼՈՒՍԱՆԿԱՐ', 'ФОТО ПРОФИЛЯ'], ['Profile Picture', 'Անձնական լուսանկար', 'Фото профиля'],
  ['Person credentials, access assignment and controller provisioning', 'Անձի հավաստագրեր, մուտքի նշանակումներ և վերահսկիչի տրամադրում', 'Учётные данные персоны, назначение доступа и настройка контроллера'], ['Retry Failed', 'Կրկնել անհաջողները', 'Повторить неудачные'],
  ['Total Persons', 'Անձանց ընդհանուր քանակ', 'Всего персон'], ['Applied', 'Կիրառված', 'Применено'], ['Pending', 'Սպասման մեջ', 'Ожидает'], ['Failed', 'Անհաջող', 'Ошибка'], ['Need Attention', 'Ուշադրության կարիք ունի', 'Требует внимания'],
  ['PIN', 'PIN', 'PIN'], ['Access Level', 'Մուտքի մակարդակ', 'Уровень доступа'], ['SEARCH', 'ՈՐՈՆՈՒՄ', 'ПОИСК'], ['ISSUE', 'ԽՆԴԻՐ', 'ПРОБЛЕМА'], ['All issues', 'Բոլոր խնդիրները', 'Все проблемы'],
  ['PERSON', 'ԱՆՁ', 'ПЕРСОНА'], ['CREDENTIALS', 'ՀԱՎԱՍՏԱԳՐԵՐ', 'УЧЁТНЫЕ ДАННЫЕ'], ['ACCESS', 'ՄՈՒՏՔ', 'ДОСТУП'], ['APPLY STATUS', 'ԿԻՐԱՌՄԱՆ ԿԱՐԳԱՎԻՃԱԿ', 'СТАТУС ПРИМЕНЕНИЯ'], ['ISSUES', 'ԽՆԴԻՐՆԵՐ', 'ПРОБЛЕМЫ'], ['No matching persons.', 'Համապատասխան անձինք չկան։', 'Нет подходящих персон.'],
  ['Manage Access Levels', 'Կառավարել մուտքի մակարդակները', 'Управление уровнями доступа'], ['Assign People', 'Նշանակել անձանց', 'Назначить персон'], ['Assigned People', 'Նշանակված անձինք', 'Назначенные персоны'], ['Access Points', 'Մուտքի կետեր', 'Точки доступа'], ['Schedules', 'Ժամանակացույցեր', 'Расписания'], ['All levels', 'Բոլոր մակարդակները', 'Все уровни'], ['No access levels yet. Create one to define door access groups.', 'Մուտքի մակարդակներ դեռ չկան։ Ստեղծեք մեկը՝ դռների մուտքի խմբերը սահմանելու համար։', 'Уровней доступа пока нет. Создайте уровень, чтобы определить группы доступа к дверям.'], ['Create First Level', 'Ստեղծել առաջին մակարդակը', 'Создать первый уровень'], ['New Level', 'Նոր մակարդակ', 'Новый уровень'],
  ['HikCentral Preview', 'HikCentral նախադիտում', 'Предпросмотр HikCentral'], ['Sync People', 'Համաժամացնել անձանց', 'Синхронизировать персон'], ['New Visitor', 'Նոր այցելու', 'Новый посетитель'], ['EXPECTED', 'ՍՊԱՍՎՈՂ', 'ОЖИДАЕТСЯ'], ['INSIDE', 'ՆԵՐՍՈՒՄ', 'ВНУТРИ'], ['OVERDUE', 'ԺԱՄԿԵՏԱՑ', 'ПРОСРОЧЕНО'], ['Reservations', 'Ամրագրումներ', 'Бронирования'], ['Watch List', 'Դիտարկման ցուցակ', 'Список наблюдения'], ['All', 'Բոլորը', 'Все'], ['Reserved', 'Ամրագրված', 'Забронировано'], ['Completed', 'Ավարտված', 'Завершено'], ['Expired', 'Ժամկետանց', 'Истекло'], ['Cancelled', 'Չեղարկված', 'Отменено'], ['No visitors found.', 'Այցելուներ չեն գտնվել։', 'Посетители не найдены.'],
  ['Profile', 'Անձնական', 'Профиль'], ['Picture', 'լուսանկար', 'фото'], ['Credential Information', 'Հավաստագրերի տեղեկություն', 'Сведения об учётных данных'], ['Credentials', 'Հավաստագրեր', 'Учётные данные'], ['Access', 'Մուտք', 'Доступ'], ['Apply Status', 'Կիրառման կարգավիճակ', 'Статус применения'], ['Issues', 'Խնդիրներ', 'Проблемы'],
  ['Activate', 'Ակտիվացնել', 'Активировать'], ['Retry Sync', 'Կրկնել համաժամացումը', 'Повторить синхронизацию'], ['Move', 'Տեղափոխել', 'Переместить'], ['Export', 'Արտահանել', 'Экспорт'], ['All activity', 'Բոլոր ակտիվությունները', 'Вся активность'], ['All sync states', 'Համաժամացման բոլոր վիճակները', 'Все состояния синхронизации'], ['No data.', 'Տվյալներ չկան։', 'Нет данных.'], ['person(s)', 'անձ', 'персон'], ['configured', 'կազմաձևված', 'настроено'], ['missing', 'բացակա', 'отсутствует'],
  ['Select an access level below, then assign or remove people. Changes automatically synchronize face, card, PIN and fingerprint credentials with its controllers.', 'Ստորև ընտրեք մուտքի մակարդակ, ապա նշանակեք կամ հեռացրեք անձանց։ Փոփոխություններն ավտոմատ համաժամացնում են դեմքի, քարտի, PIN-ի և մատնահետքի հավաստագրերը վերահսկիչների հետ։', 'Выберите ниже уровень доступа, затем назначьте или удалите персон. Изменения автоматически синхронизируют учётные данные лица, карты, PIN и отпечатка с контроллерами.'],
  ['Expected', 'Սպասվող', 'Ожидается'], ['Inside', 'Ներսում', 'Внутри'], ['Overdue', 'Ժամկետանց', 'Просрочено'], ['Present', 'Ներկա', 'Присутствует'], ['Absent', 'Բացակա', 'Отсутствует'], ['Late', 'Ուշացած', 'Опоздал'], ['Weekend', 'Հանգստյան օր', 'Выходной'], ['Holiday', 'Տոն', 'Праздник'],
  ['Time & Attendance Overview', 'Ժամանակի և հաճախումների ամփոփում', 'Обзор времени и посещаемости'], ['Attendance Records', 'Հաճախումների գրանցումներ', 'Записи посещаемости'], ['Work Rules', 'Աշխատանքի կանոններ', 'Правила работы'], ['Attendance Groups', 'Հաճախումների խմբեր', 'Группы посещаемости'], ['Shifts', 'Հերթափոխեր', 'Смены'], ['Schedule', 'Ժամանակացույց', 'Расписание'], ['Requests', 'Հարցումներ', 'Запросы'], ['Calculation', 'Հաշվարկ', 'Расчёт'],
  ['Bulk Import', 'Զանգվածային ներմուծում', 'Массовый импорт'], ['Template CSV', 'CSV ձևանմուշ', 'Шаблон CSV'], ['Import persons and optionally issue cards from a CSV or Excel file. Download the template to see the required columns.', 'Ներմուծեք անձանց և, ցանկության դեպքում, թողարկեք քարտեր CSV կամ Excel ֆայլից։ Ներբեռնեք ձևանմուշը՝ անհրաժեշտ սյունակները տեսնելու համար։', 'Импортируйте персон и при необходимости выдайте карты из CSV или Excel. Скачайте шаблон, чтобы увидеть необходимые столбцы.'],
  ['Select File', 'Ընտրել ֆայլ', 'Выбрать файл'], ['File (CSV or Excel)', 'Ֆայլ (CSV կամ Excel)', 'Файл (CSV или Excel)'], ['Issue cards to device (optional)', 'Թողարկել քարտեր սարքին (ընտրովի)', 'Выдать карты на устройство (необязательно)'], ['— no card issuance —', '— քարտ չի թողարկվում —', '— без выдачи карт —'], ['Update existing persons (match by employee_no)', 'Թարմացնել առկա անձանց (համընկնում՝ employee_no-ով)', 'Обновить существующих персон (сопоставлять по employee_no)'], ['Parsing…', 'Վերլուծվում է…', 'Обработка…'], ['Preview', 'Նախադիտում', 'Предпросмотр'], ['Total rows:', 'Ընդամենը տողեր՝', 'Всего строк:'], ['To create:', 'Ստեղծելու համար՝', 'Создать:'], ['To update:', 'Թարմացնելու համար՝', 'Обновить:'], ['Columns found:', 'Գտնված սյունակներ՝', 'Найдены столбцы:'], ['Row', 'Տող', 'Строка'], ['Emp #', 'Աշխատակցի №', '№ сотрудника'], ['Action', 'Գործողություն', 'Действие'], ['Importing…', 'Ներմուծվում է…', 'Импорт…'], ['Import Complete', 'Ներմուծումն ավարտված է', 'Импорт завершён'], ['Created:', 'Ստեղծված՝', 'Создано:'], ['Updated:', 'Թարմացված՝', 'Обновлено:'], ['Skipped:', 'Բաց թողնված՝', 'Пропущено:'], ['Errors:', 'Սխալներ՝', 'Ошибки:'], ['Error details:', 'Սխալների մանրամասներ՝', 'Сведения об ошибках:'], ['Import Another File', 'Ներմուծել այլ ֆայլ', 'Импортировать другой файл'], ['create', 'ստեղծել', 'создать'], ['update', 'թարմացնել', 'обновить'],
  ['Access Requests', 'Մուտքի հարցումներ', 'Запросы доступа'], ['New Request', 'Նոր հարցում', 'Новый запрос'], ['New Access Request', 'Նոր մուտքի հարցում', 'Новый запрос доступа'], ['— select person —', '— ընտրեք անձ —', '— выберите персону —'], ['— select level —', '— ընտրեք մակարդակ —', '— выберите уровень —'], ['Submitting…', 'Ուղարկվում է…', 'Отправка…'], ['Submit Request', 'Ուղարկել հարցումը', 'Отправить запрос'], ['No', 'Չկա', 'Нет'], ['requests', 'հարցումներ', 'запросов'], ['Access requests submitted by operators will appear here.', 'Օպերատորների ուղարկած մուտքի հարցումները կհայտնվեն այստեղ։', 'Запросы доступа, отправленные операторами, появятся здесь.'], ['Level:', 'Մակարդակ՝', 'Уровень:'], ['Valid:', 'Գործող՝', 'Действует:'], ['Submitted:', 'Ուղարկված՝', 'Отправлено:'], ['Review note:', 'Դիտարկման նշում՝', 'Примечание проверяющего:'], ['Approve', 'Հաստատել', 'Одобрить'], ['Reject', 'Մերժել', 'Отклонить'], ['approved', 'հաստատված', 'одобрено'], ['rejected', 'մերժված', 'отклонено'], ['pending', 'սպասման մեջ', 'ожидает'], ['local', 'տեղային', 'локально'], ['synced', 'համաժամացված', 'синхրոնно'], ['passive', 'պասիվ', 'пассивно'],
  ['Anti-Passback', 'Կրկնակի անցման արգելում', 'Антипассбэк'], ['Add Rule', 'Ավելացնել կանոն', 'Добавить правило'], ['Prevent credential re-use in the same direction without a matching exit.', 'Կանխում է նույն ուղղությամբ հավաստագրի կրկնակի օգտագործումը՝ առանց համապատասխան ելքի։', 'Предотвращает повторное использование учётных данных в одном направлении без соответствующего выхода.'], ['Soft', 'Թեթև', 'Мягкий'], ['Hard', 'Խիստ', 'Жёсткий'], ['Active Rules', 'Ակտիվ կանոններ', 'Активные правила'], ['Hard Mode', 'Խիստ ռեժիմ', 'Жёсткий режим'], ['Violations Logged', 'Գրանցված խախտումներ', 'Зарегистрированные нарушения'], ['Soft Mode', 'Թեթև ռեժիմ', 'Мягкий режим'], ['New Anti-Passback Rule', 'Կրկնակի անցման արգելման նոր կանոն', 'Новое правило антипассбэка'], ['— select controller —', '— ընտրեք վերահսկիչ —', '— выберите контроллер —'], ['IN Door #', 'ՄՈՒՏՔ դռան №', 'ВХОД дверь №'], ['OUT Door #', 'ԵԼՔ դռան №', 'ВЫХОД дверь №'], ['Enforcement Mode', 'Կիրառման ռեժիմ', 'Режим применения'], ['Soft — log only', 'Թեթև — միայն գրանցել', 'Мягкий — только журнал'], ['Hard — block access', 'Խիստ — արգելափակել մուտքը', 'Жёсткий — блокировать доступ'], ['State Reset (hours)', 'Վիճակի վերականգնում (ժամ)', 'Сброс состояния (часы)'], ['Create Rule', 'Ստեղծել կանոն', 'Создать правило'], ['Rules', 'Կանոններ', 'Правила'], ['Violations', 'Խախտումներ', 'Нарушения'], ['No anti-passback rules', 'Կրկնակի անցման արգելման կանոններ չկան', 'Правил антипассбэка нет'], ['Create rules to prevent credential re-use between entry and exit doors.', 'Ստեղծեք կանոններ՝ մուտքի և ելքի դռների միջև հավաստագրի կրկնակի օգտագործումը կանխելու համար։', 'Создайте правила, чтобы предотвратить повторное использование учётных данных между дверями входа и выхода.'], ['No violations recorded', 'Խախտումներ գրանցված չեն', 'Нарушений не зарегистрировано'], ['Violations appear here when a person re-uses a credential without a matching exit event.', 'Խախտումները կհայտնվեն այստեղ, երբ անձը կրկին օգտագործի հավաստագիրը առանց համապատասխան ելքի իրադարձության։', 'Нарушения появятся здесь, когда персона повторно использует учётные данные без соответствующего события выхода.'], ['Direction', 'Ուղղություն', 'Направление'], ['Reset', 'Վերակայել', 'Сбросить'], ['hard', 'խիստ', 'жёсткий'], ['soft', 'թեթև', 'мягкий'], ['in', 'մուտք', 'вход'], ['out', 'ելք', 'выход'],
  ['Dual Authentication', 'Երկակի նույնականացում', 'Двойная аутентификация'], ['Dual Auth', 'Երկակի հաստատում', 'Двойное подтверждение'], ['Tailgating', 'Հետևից անցում', 'Проход вслед'], ['Guard Tour', 'Պահակային երթուղի', 'Маршрут охраны'], ['Mustering', 'Անձնակազմի հավաք', 'Сбор персонала'], ['Audit Report', 'Աուդիտի հաշվետվություն', 'Аудиторский отчёт'], ['Zone Occupancy', 'Գոտիների զբաղվածություն', 'Занятость зон'], ['Event Retrieval', 'Իրադարձությունների բեռնում', 'Получение событий'], ['Holiday Calendar', 'Տոների օրացույց', 'Календарь праздников'], ['Lift Config', 'Վերելակի կարգավորում', 'Настройка лифта'], ['Policy Templates', 'Կանոնների ձևանմուշներ', 'Шаблоны политик'], ['Door Camera', 'Դռան տեսախցիկ', 'Камера двери'], ['Mobile Cards', 'Բջջային քարտեր', 'Мобильные карты'],
  ['Add Tour', 'Ավելացնել երթուղի', 'Добавить маршрут'], ['Add Config', 'Ավելացնել կազմաձև', 'Добавить конфигурацию'], ['Add Zone', 'Ավելացնել գոտի', 'Добавить зону'], ['Add Lift', 'Ավելացնել վերելակ', 'Добавить лифт'], ['Add Template', 'Ավելացնել ձևանմուշ', 'Добавить шаблон'], ['Issue Card', 'Թողարկել քարտ', 'Выдать карту'], ['Revoke', 'Հետ կանչել', 'Отозвать'], ['Show QR', 'Ցույց տալ QR-ը', 'Показать QR'], ['Run Report', 'Կազմել հաշվետվություն', 'Сформировать отчёт'], ['Export CSV', 'Արտահանել CSV', 'Экспорт CSV'], ['Export Excel', 'Արտահանել Excel', 'Экспорт Excel'], ['Loading…', 'Բեռնվում է…', 'Загрузка…'], ['Running…', 'Կատարվում է…', 'Выполняется…'], ['Syncing…', 'Համաժամացվում է…', 'Синхронизация…'], ['Issuing…', 'Թողարկվում է…', 'Выдача…'],
  ['Status', 'Կարգավիճակ', 'Статус'], ['Mode', 'Ռեժիմ', 'Режим'], ['Device', 'Սարք', 'Устройство'], ['Employee', 'Աշխատակից', 'Сотрудник'], ['Department', 'Բաժին', 'Отдел'], ['Note', 'Նշում', 'Примечание'], ['Reason', 'Պատճառ', 'Причина'], ['Host', 'Ընդունող', 'Принимающая сторона'], ['Organization', 'Կազմակերպություն', 'Организация'], ['Company', 'Ընկերություն', 'Компания'], ['Phone', 'Հեռախոս', 'Телефон'], ['Email', 'Էլ․ փոստ', 'Эл. почта'], ['Position', 'Պաշտոն', 'Должность'], ['Type', 'Տեսակ', 'Тип'], ['Check-in', 'Մուտք', 'Приход'], ['Check-out', 'Ելք', 'Уход'], ['Check In', 'Մուտք', 'Приход'], ['Check Out', 'Ելք', 'Уход'], ['Check-in', 'Մուտք', 'Приход'], ['Check-out', 'Ելք', 'Уход'], ['Approved', 'Հաստատված', 'Одобрено'], ['Rejected', 'Մերժված', 'Отклонено'], ['Cancelled', 'Չեղարկված', 'Отменено'], ['Expired', 'Ժամկետանց', 'Истекло'], ['Reserved', 'Ամրագրված', 'Забронировано'], ['Completed', 'Ավարտված', 'Завершено'], ['Pending approval', 'Սպասում է հաստատման', 'Ожидает одобрения'], ['Inactive', 'Պասիվ', 'Неактивно'], ['Enable', 'Միացնել', 'Включить'], ['Disable', 'Անջատել', 'Выключить'], ['Remove', 'Հեռացնել', 'Удалить'], ['Save', 'Պահպանել', 'Сохранить'], ['Close', 'Փակել', 'Закрыть'], ['Retry', 'Կրկնել', 'Повторить'], ['Unknown', 'Անհայտ', 'Неизвестно'], ['Manual', 'Ձեռքով', 'Вручную'], ['Optional', 'Ընտրովի', 'Необязательно'], ['No description', 'Նկարագրություն չկա', 'Нет описания'],
  ['Monday', 'Երկուշաբթի', 'Понедельник'], ['Tuesday', 'Երեքշաբթի', 'Вторник'], ['Wednesday', 'Չորեքշաբթի', 'Среда'], ['Thursday', 'Հինգշաբթի', 'Четверг'], ['Friday', 'Ուրբաթ', 'Пятница'], ['Saturday', 'Շաբաթ', 'Суббота'], ['Sunday', 'Կիրակի', 'Воскресенье'], ['Business Hours', 'Աշխատանքային ժամեր', 'Рабочие часы'], ['Weekdays', 'Աշխատանքային օրեր', 'Будние дни'], ['Custom Schedule', 'Անհատական ժամանակացույց', 'Пользовательское расписание'], ['All Day', 'Ամբողջ օրը', 'Весь день'],
  ['Sync failed', 'Համաժամացումը ձախողվել է', 'Синхронизация не удалась'], ['Schedule not mapped', 'Ժամանակացույցը քարտեզագրված չէ', 'Расписание не сопоставлено'], ['Schedule conflict', 'Ժամանակացույցի հակասություն', 'Конфликт расписания'], ['Provisioning failed', 'Տրամադրումը ձախողվել է', 'Настройка не удалась'], ['Credential health could not be loaded', 'Հավաստագրերի կարգավիճակը չհաջողվեց բեռնել', 'Не удалось загрузить состояние учётных данных'], ['Retry failed', 'Կրկնման փորձը ձախողվեց', 'Повтор не удался'], ['healthy', 'կարգին', 'исправно'], ['failed', 'ձախողված', 'ошибка'],
  ['Delete this guard tour?', 'Ջնջե՞լ պահակային երթուղին։', 'Удалить маршрут охраны?'], ['Ordered', 'Դասավորված', 'Упорядоченный'], ['Free', 'Ազատ', 'Свободный'], ['checkpoints', 'ստուգման կետեր', 'контрольные точки'], ['executions', 'կատարումներ', 'выполнения'], ['completed', 'ավարտված', 'завершено'],
  ['Revoke this mobile card?', 'Հետ կանչե՞լ այս բջջային քարտը։', 'Отозвать эту мобильную карту?'], ['revoked', 'հետ կանչված', 'отозвана'], ['expired', 'ժամկետանց', 'истекла'], ['Delete this zone?', 'Ջնջե՞լ այս գոտին։', 'Удалить эту зону?'], ['Reset all occupancy entries for this zone?', 'Վերակայե՞լ այս գոտու զբաղվածության բոլոր գրանցումները։', 'Сбросить все записи занятости для этой зоны?'], ['Delete this anti-passback rule?', 'Ջնջե՞լ կրկնակի անցման արգելման այս կանոնը։', 'Удалить это правило антипассбэка?'], ['Reset person state', 'Վերակայել անձի վիճակը', 'Сбросить состояние персоны'], ['Delete mapping?', 'Ջնջե՞լ կապակցումը։', 'Удалить сопоставление?'], ['Delete template?', 'Ջնջե՞լ ձևանմուշը։', 'Удалить шаблон?'], ['Delete this tailgating config?', 'Ջնջե՞լ հետևից անցման այս կազմաձևը։', 'Удалить эту конфигурацию прохода вслед?'], ['Delete this dual-auth rule?', 'Ջնջե՞լ երկակի նույնականացման այս կանոնը։', 'Удалить это правило двойной аутентификации?'], ['Delete this holiday?', 'Ջնջե՞լ այս տոնը։', 'Удалить этот праздник?'], ['Delete this lift?', 'Ջնջե՞լ այս վերելակը։', 'Удалить этот лифт?'],
  ['Search access records', 'Որոնել մուտքի գրառումներ', 'Поиск записей доступа'], ['All events', 'Բոլոր իրադարձությունները', 'Все события'], ['All', 'Բոլորը', 'Все'], ['Access events', 'Մուտքի իրադարձություններ', 'События доступа'], ['Total Events', 'Իրադարձությունների ընդհանուր քանակ', 'Всего событий'], ['Unique Persons', 'Եզակի անձինք', 'Уникальные персоны'], ['hour', 'ժամ', 'час'], ['count', 'քանակ', 'количество'], ['employee', 'աշխատակից', 'сотрудник'], ['vip', 'VIP', 'VIP'], ['blacklist', 'սև ցուցակ', 'чёрный список'], ['unknown', 'անհայտ', 'неизвестно'], ['unlock', 'ապակողպում', 'разблокировка'], ['alarm', 'ահազանգ', 'тревога'],
  ['Door unlocked.', 'Դուռը ապակողպված է։', 'Дверь разблокирована.'], ['Confirmation failed.', 'Հաստատումը ձախողվեց։', 'Подтверждение не удалось.'], ['Enter the second card number.', 'Մուտքագրեք երկրորդ քարտի համարը։', 'Введите номер второй карты.'], ['e.g. Server room dual card', 'օր․՝ սերվերային սենյակի երկակի քարտ', 'например: двойная карта серверной'], ['Second card number', 'Երկրորդ քարտի համար', 'Номер второй карты'],
  ['Armenian Holidays', 'Հայկական տոներ', 'Армянские праздники'], ['Independence Day', 'Անկախության օր', 'День независимости'], ['public', 'պետական', 'государственный'], ['custom', 'անհատական', 'пользовательский'], ['restricted', 'սահմանափակ', 'ограниченный'], ['Office Hours', 'Գրասենյակային ժամեր', 'Офисные часы'], ['Not mapped', 'Քարտեզագրված չէ', 'Не сопоставлено'], ['Plan verification failed', 'Պլանի ստուգումը ձախողվեց', 'Проверка плана не удалась'], ['Controller plan not mapped', 'Վերահսկիչի պլանը քարտեզագրված չէ', 'План контроллера не сопоставлен'], ['Adding…', 'Ավելացվում է…', 'Добавление…'], ['Unable to save access level', 'Չհաջողվեց պահպանել մուտքի մակարդակը', 'Не удалось сохранить уровень доступа'], ['Clone failed', 'Պատճենումը ձախողվեց', 'Клонирование не удалось'], ['Schedule deployed.', 'Ժամանակացույցը տեղակայված է։', 'Расписание развернуто.'], ['Schedule deployment failed.', 'Ժամանակացույցի տեղակայումը ձախողվեց։', 'Развертывание расписания не удалось.'],
  ['Could not load access control devices', 'Չհաջողվեց բեռնել մուտքի վերահսկման սարքերը', 'Не удалось загрузить устройства контроля доступа'], ['HCNetSDK connection failed', 'HCNetSDK կապը ձախողվեց', 'Подключение HCNetSDK не удалось'], ['Save failed', 'Պահպանումը ձախողվեց', 'Сохранение не удалось'], ['Delete failed', 'Ջնջումը ձախողվեց', 'Удаление не удалось'], ['Device disabled', 'Սարքն անջատված է', 'Устройство отключено'], ['Snapshot failed', 'Պատկերի ստացումը ձախողվեց', 'Снимок не получен'], ['Device snapshot', 'Սարքի պատկեր', 'Снимок устройства'],
  ['Effective Period start and end are required', 'Գործողության ժամկետի սկիզբն ու ավարտը պարտադիր են', 'Необходимо указать начало и конец срока действия'], ['Effective Period end must be later than its start', 'Գործողության ժամկետի ավարտը պետք է լինի սկզբից ուշ', 'Конец срока действия должен быть позже начала'], ['Unable to save person', 'Չհաջողվեց պահպանել անձին', 'Не удалось сохранить персону'], ['Once configured, the ID cannot be edited. Confirm the ID rule before setting an ID.', 'Կազմաձևումից հետո ID-ն չի կարող խմբագրվել։ Նախքան ID սահմանելը հաստատեք ID-ի կանոնը։', 'После настройки ID нельзя изменить. Подтвердите правило ID перед его установкой.'], ['During the validity period, the person has access to assigned doors and levels.', 'Գործողության ժամկետի ընթացքում անձը հասանելիություն ունի նշանակված դռներին և մակարդակներին։', 'В течение срока действия персона имеет доступ к назначенным дверям и уровням.'], ['Please select.', 'Խնդրում ենք ընտրել։', 'Пожалуйста, выберите.'], ['Please enter.', 'Խնդրում ենք մուտքագրել։', 'Пожалуйста, введите.'], ['Enter phone No.', 'Մուտքագրեք հեռախոսահամարը։', 'Введите номер телефона.'], ['Remark', 'Նշում', 'Примечание'], ['Unlimited', 'Անսահմանափակ', 'Неограниченно'], ['Controller sync is managed by access levels', 'Վերահսկիչի համաժամացումը կառավարվում է մուտքի մակարդակներով', 'Синхронизация контроллера управляется уровнями доступа'], ['This card is already added to the person.', 'Այս քարտն արդեն ավելացված է անձին։', 'Эта карта уже добавлена персоне.'], ['A person can have up to 5 cards.', 'Անձը կարող է ունենալ մինչև 5 քարտ։', 'У персоны может быть до 5 карт.'], ['No card was detected. Start enrollment again.', 'Քարտ չի հայտնաբերվել։ Կրկին սկսեք գրանցումը։', 'Карта не обнаружена. Начните регистрацию снова.'], ['Collect a face from an access terminal in Device Management', 'Ստացեք դեմք մուտքի տերմինալից՝ Սարքերի կառավարման բաժնում', 'Соберите лицо с терминала доступа в разделе управления устройствами'], ['Use a webcam connected to this server', 'Օգտագործեք այս սերվերին միացված վեբ-տեսախցիկ', 'Используйте веб-камеру, подключённую к этому серверу'], ['Synchronization failed', 'Համաժամացումը ձախողվեց', 'Синхронизация не удалась'], ['Unable to move person', 'Չհաջողվեց տեղափոխել անձին', 'Не удалось переместить персону'], ['Unable to delete department', 'Չհաջողվեց ջնջել բաժինը', 'Не удалось удалить отдел'], ['Unable to delete person', 'Չհաջողվեց ջնջել անձին', 'Не удалось удалить персону'], ['Unable to activate person', 'Չհաջողվեց ակտիվացնել անձին', 'Не удалось активировать персону'], ['Unable to synchronize person', 'Չհաջողվեց համաժամացնել անձին', 'Не удалось синхронизировать персону'], ['Retry synchronization', 'Կրկնել համաժամացումը', 'Повторить синхронизацию'], ['Cards', 'Քարտեր', 'Карты'], ['Faces', 'Դեմքեր', 'Лица'],
  ['Unknown access event', 'Անհայտ մուտքի իրադարձություն', 'Неизвестное событие доступа'], ['Command completed', 'Հրամանը կատարված է', 'Команда выполнена'], ['Command failed', 'Հրամանը ձախողվեց', 'Команда не удалась'], ['Emergency command failed', 'Արտակարգ հրամանը ձախողվեց', 'Экстренная команда не удалась'], ['OPEN ALL DOORS', 'ԲԱՑԵԼ ԲՈԼՈՐ ԴՌՆԵՐԸ', 'ОТКРЫТЬ ВСЕ ДВЕРИ'], ['LOCK DOWN ALL DOORS', 'ՓԱԿԵԼ ԲՈԼՈՐ ԴՌՆԵՐԸ', 'ЗАБЛОКИРОВАТЬ ВСЕ ДВЕРИ'],
  ['HikCentral sync failed', 'HikCentral համաժամացումը ձախողվեց', 'Синхронизация HikCentral не удалась'], ['Delete this visitor record?', 'Ջնջե՞լ այցելուի այս գրանցումը։', 'Удалить эту запись посетителя?'], ['Add HikCentral AppKey/AppSecret in backend .env', 'Ավելացրեք HikCentral AppKey/AppSecret-ը backend-ի .env-ում', 'Добавьте HikCentral AppKey/AppSecret в .env бэкенда'], ['Full Name *', 'Ամբողջական անուն *', 'Полное имя *'], ['ID Number', 'ID համար', 'Номер ID'], ['Create & Generate QR', 'Ստեղծել և գեներացնել QR', 'Создать и сгенерировать QR'], ['Valid From', 'Գործում է՝ սկսած', 'Действует с'], ['Valid To', 'Գործում է՝ մինչև', 'Действует до'], ['Reason, comment…', 'Պատճառ, մեկնաբանություն…', 'Причина, комментарий…'],
  ['Off', 'Անջատված', 'Выключено'], ['low', 'ցածր', 'низкий'], ['medium', 'միջին', 'средний'], ['high', 'բարձր', 'высокий'], ['Active', 'Ակտիվ', 'Активно'], ['Disabled', 'Անջատված', 'Отключено'], ['Inactive', 'Ոչ ակտիվ', 'Неактивно'], ['enabled', 'միացված', 'включено'], ['present', 'ներկա', 'присутствует'], ['absent', 'բացակա', 'отсутствует'], ['late', 'ուշացած', 'опоздал'], ['holiday', 'տոն', 'праздник'], ['today', 'այսօր', 'сегодня'],

  ['Access Control Retrieval', 'Մուտքի վերահսկման տվյալների ստացում', 'Получение данных контроля доступа'],
  ['Access Limit', 'Մուտքի սահմանափակում', 'Ограничение доступа'],
  ['Access Schedule', 'Մուտքի ժամանակացույց', 'Расписание доступа'],
  ['Active Monitors', 'Ակտիվ հսկիչներ', 'Активные контролёры'],
  ['Add a configuration to start monitoring doors for tailgating events.', 'Ավելացրեք կարգավորում՝ դռները ուղեկցման դեպքերի համար վերահսկելու համար։', 'Добавьте конфигурацию, чтобы отслеживать проход вслед за другим человеком.'],
  ['Add and Continue', 'Ավելացնել և շարունակել', 'Добавить и продолжить'],
  ['Add Checkpoint', 'Ավելացնել հսկիչ կետ', 'Добавить контрольную точку'],
  ['Add Holiday', 'Ավելացնել տոն', 'Добавить праздник'],
  ['Add Mapping', 'Ավելացնել կապակցում', 'Добавить сопоставление'],
  ['Add rules to require two card presentations on high-security doors.', 'Ավելացրեք կանոններ՝ բարձր անվտանգության դռների համար երկու քարտ պահանջելու նպատակով։', 'Добавьте правила, требующие две карты для дверей с повышенной безопасностью.'],
  ['Add to Watch List', 'Ավելացնել վերահսկման ցուցակ', 'Добавить в список наблюдения'],
  ['Add Watch Entry', 'Ավելացնել ցուցակի գրառում', 'Добавить запись в список наблюдения'],
  ['Alert Email', 'Զգուշացման էլ. հասցե', 'Электронная почта для оповещений'],
  ['Allow access', 'Թույլատրել մուտքը', 'Разрешить доступ'],
  ['Allowed Floors', 'Թույլատրված հարկեր', 'Разрешённые этажи'],
  ['Allowed floors:', 'Թույլատրված հարկեր՝', 'Разрешённые этажи:'],
  ['Apply preset', 'Կիրառել նախադրվածը', 'Применить готовую настройку'],
  ['Awaiting 2nd Card', 'Սպասում է երկրորդ քարտին', 'Ожидание второй карты'],
  ['Blocked', 'Արգելափակված', 'Заблокирован'],
  ['Cached cards', 'Քեշավորված քարտեր', 'Карты в кэше'],
  ['Camera', 'Տեսախցիկ', 'Камера'],
  ['Cameras', 'Տեսախցիկներ', 'Камеры'],
  ['Capture', 'Լուսանկարել', 'Сделать снимок'],
  ['Card #', 'Քարտ #', 'Карта №'],
  ['Card + face', 'Քարտ + դեմք', 'Карта + лицо'],
  ['Card captured successfully', 'Քարտը հաջողությամբ գրանցվեց', 'Карта успешно считана'],
  ['Change the retrieval filters or wait for controller activity.', 'Փոխեք ստացման զտիչները կամ սպասեք վերահսկիչի ակտիվությանը։', 'Измените фильтры получения данных или дождитесь активности контроллера.'],
  ['Check-In', 'Մուտք', 'Приход'],
  ['Check-Out', 'Ելք', 'Уход'],
  ['Checkpoints', 'Հսկիչ կետեր', 'Контрольные точки'],
  ['Choose a guard tour from the left to manage its checkpoints and executions.', 'Ձախից ընտրեք պահակային երթուղի՝ դրա կետերն ու անցումները կառավարելու համար։', 'Выберите слева маршрут обхода для управления его точками и выполнениями.'],
  ['Choose a lift from the left to manage its floor access rules.', 'Ձախից ընտրեք վերելակ՝ հարկերի մուտքի կանոնները կառավարելու համար։', 'Выберите слева лифт для управления правилами доступа к этажам.'],
  ['Choose a policy template to view its rules or apply it to an access level.', 'Ընտրեք քաղաքականության ձևանմուշ՝ կանոնները դիտելու կամ մուտքի մակարդակին կիրառելու համար։', 'Выберите шаблон политики, чтобы посмотреть его правила или применить к уровню доступа.'],
  ['Clone rules from an access level:', 'Պատճենել կանոնները մուտքի մակարդակից՝', 'Копировать правила из уровня доступа:'],
  ['Collecting fingerprint...', 'Մատնահետքի հավաքագրում...', 'Считывание отпечатка...'],
  ['Collecting...', 'Հավաքագրում...', 'Считывание...'],
  ['Color', 'Գույն', 'Цвет'],
  ['Controllers and doors are assigned automatically by each level', 'Վերահսկիչներն ու դռները ավտոմատ նշանակվում են յուրաքանչյուր մակարդակով', 'Контроллеры и двери назначаются автоматически для каждого уровня'],
  ['Create Tour', 'Ստեղծել երթուղի', 'Создать маршрут'],
  ['Create Zone', 'Ստեղծել գոտի', 'Создать зону'],
  ['Create zones and assign door rules to start tracking real-time headcounts.', 'Ստեղծեք գոտիներ և նշանակեք դռների կանոններ՝ իրական ժամանակում մարդկանց քանակը վերահսկելու համար։', 'Создайте зоны и задайте правила дверей, чтобы отслеживать количество людей в реальном времени.'],
  ['Credential Management', 'Հավաստագրերի կառավարում', 'Управление учётными данными'],
  ['Credential & Apply Health', 'Հավաստագրերի և կիրառման վիճակ', 'Состояние учётных данных и применения'],
  ['Person credentials, access assignment and controller provisioning', 'Անձի հավաստագրեր, մուտքի նշանակում և վերահսկիչի տրամադրում', 'Учётные данные человека, назначение доступа и настройка контроллера'],
  ['Currently Inside', 'Ներսում հիմա', 'Сейчас внутри'],
  ['Custom', 'Անհատական', 'Пользовательский'],
  ['Denied', 'Մերժված', 'Отказано'],
  ['Deny access', 'Արգելել մուտքը', 'Запретить доступ'],
  ['Description', 'Նկարագրություն', 'Описание'],
  ['Devices Covered', 'Ծածկված սարքեր', 'Охваченные устройства'],
  ['Dir', 'Ուղղ.', 'Напр.'],
  ['Documented', 'Փաստագրված', 'Задокументировано'],
  ['Door Camera Snapshot', 'Դռան տեսախցիկի լուսանկար', 'Снимок камеры двери'],
  ['Enroll Card', 'Գրանցել քարտ', 'Зарегистрировать карту'],
  ['Enroll Fingerprint', 'Գրանցել մատնահետք', 'Зарегистрировать отпечаток'],
  ['Enter a numeric PIN containing 4 to 8 digits', 'Մուտքագրեք 4-ից 8 նիշանոց թվային PIN', 'Введите цифровой PIN из 4–8 цифр'],
  ['Entered', 'Մտած', 'Вошли'],
  ['Entries', 'Մուտքեր', 'Входы'],
  ['Entries Today', 'Այսօրվա մուտքեր', 'Входы сегодня'],
  ['Evacuation Roster', 'Տարհանման ցուցակ', 'Список эвакуации'],
  ['Event', 'Իրադարձություն', 'Событие'],
  ['Events will appear here once controllers start recording activity.', 'Իրադարձությունները կհայտնվեն այստեղ, երբ վերահսկիչները սկսեն գրանցել ակտիվությունը։', 'События появятся здесь, когда контроллеры начнут записывать активность.'],
  ['Events will appear here when the detector triggers on a monitored door.', 'Իրադարձությունները կհայտնվեն այստեղ, երբ վերահսկվող դռան վրա աշխատի հայտնաբերիչը։', 'События появятся здесь, когда сработает детектор на контролируемой двери.'],
  ['Exits', 'Ելքեր', 'Выходы'],
  ['Exits Today', 'Այսօրվա ելքեր', 'Выходы сегодня'],
  ['Floors (comma-separated)', 'Հարկեր (ստորակետով առանձնացված)', 'Этажи (через запятую)'],
  ['Floors Covered', 'Ծածկված հարկեր', 'Охваченные этажи'],
  ['Follow weekly schedule', 'Հետևել շաբաթական ժամանակացույցին', 'Следовать недельному расписанию'],
  ['Free-form Tours', 'Ազատ երթուղիներ', 'Свободные маршруты'],
  ['From', 'Սկսած', 'От'],
  ['From Device', 'Սարքից', 'С устройства'],
  ['Gender', 'Սեռ', 'Пол'],
  ['Granted', 'Թույլատրված', 'Разрешено'],
  ['HCNetSDK (direct controller connection)', 'HCNetSDK (ուղիղ կապ վերահսկիչին)', 'HCNetSDK (прямое подключение к контроллеру)'],
  ['Healthy', 'Նորմալ', 'Исправно'],
  ['High', 'Բարձր', 'Высокая'],
  ['Hold the card on the selected terminal', 'Քարտը պահեք ընտրված տերմինալի վրա', 'Приложите карту к выбранному терминалу'],
  ['Hour', 'Ժամ', 'Час'],
  ['Hourly Flow — Today', 'Ժամային հոսք — այսօր', 'Почасовой поток — сегодня'],
  ['Important', 'Կարևոր', 'Важно'],
  ['IN Door', 'ՄՈՒՏՔ դուռ', 'Дверь ВХОД'],
  ['ISAPI (fallback)', 'ISAPI (պահուստային)', 'ISAPI (резервный вариант)'],
  ['Issue a mobile card to allow QR-based door access from a smartphone.', 'Տվեք բջջային քարտ՝ սմարթֆոնից QR-ով դռանը մուտք գործելու համար։', 'Выпустите мобильную карту для доступа к двери по QR-коду со смартфона.'],
  ['Issue Mobile Card', 'Տալ բջջային քարտ', 'Выпустить мобильную карту'],
  ['Keep your finger on the terminal reader', 'Մատը պահեք տերմինալի ընթերցիչի վրա', 'Держите палец на считывателе терминала'],
  ['Last 24h', 'Վերջին 24 ժ.', 'Последние 24 ч.'],
  ['Last 30 days', 'Վերջին 30 օր', 'Последние 30 дней'],
  ['Last 6h', 'Վերջին 6 ժ.', 'Последние 6 ч.'],
  ['Last 7 days', 'Վերջին 7 օր', 'Последние 7 дней'],
  ['Last Seen', 'Վերջին հայտնվելը', 'Последнее обнаружение'],
  ['Last Used', 'Վերջին օգտագործումը', 'Последнее использование'],
  ['level(s)', 'մակարդակ(ներ)', 'уровень(и)'],
  ['Lift & Floor Access', 'Վերելակի և հարկերի մուտք', 'Доступ к лифту и этажам'],
  ['Lift Name', 'Վերելակի անուն', 'Название лифта'],
  ['Lifts', 'Վերելակներ', 'Лифты'],
  ['Limit Access Times', 'Սահմանափակել մուտքի ժամերը', 'Ограничить время доступа'],
  ['Link ACS doors to cameras to automatically capture snapshots on access events.', 'Կապեք ACS դռները տեսախցիկներին՝ մուտքի իրադարձությունների ժամանակ լուսանկարներ ավտոմատ ստանալու համար։', 'Свяжите двери ACS с камерами для автоматических снимков при событиях доступа.'],
  ['Loading analytics…', 'Վերլուծության բեռնում…', 'Загрузка аналитики…'],
  ['Look directly at the access terminal and keep still.', 'Նայեք ուղիղ մուտքի տերմինալին և մի շարժվեք։', 'Смотрите прямо в терминал доступа и не двигайтесь.'],
  ['Low', 'Ցածր', 'Низкая'],
  ['Make sure ACS devices are recording events with IN/OUT direction.', 'Համոզվեք, որ ACS սարքերը գրանցում են ՄՈՒՏՔ/ԵԼՔ ուղղությամբ իրադարձություններ։', 'Убедитесь, что устройства ACS записывают события с направлением ВХОД/ВЫХОД.'],
  ['Manage fingerprint, card and PIN credentials', 'Կառավարեք մատնահետքի, քարտի և PIN հավաստագրերը', 'Управляйте отпечатками, картами и PIN-кодами'],
  ['Manual Attendance', 'Ձեռքով հաշվառում', 'Ручной учёт'],
  ['Manual unlock', 'Ձեռքով ապակողպում', 'Ручная разблокировка'],
  ['Max Capacity', 'Առավելագույն տարողություն', 'Максимальная вместимость'],
  ['Medium', 'Միջին', 'Средняя'],
  ['Members', 'Անդամներ', 'Участники'],
  ['Mobile Card QR Code', 'Բջջային քարտի QR կոդ', 'QR-код мобильной карты'],
  ['mode logs a warning;', 'ռեժիմը գրանցում է նախազգուշացում;', 'режим фиксирует предупреждение;'],
  ['Move to Department', 'Տեղափոխել բաժին', 'Переместить в отдел'],
  ['Mustering / Evacuation', 'Հավաքագրում / Տարհանում', 'Сбор / эвакуация'],
  ['Net', 'Մնացորդ', 'Итого'],
  ['New Door → Camera Mapping', 'Դուռ → տեսախցիկ նոր կապակցում', 'Новое сопоставление «дверь → камера»'],
  ['New Dual-Auth Rule', 'Երկակի հաստատման նոր կանոն', 'Новое правило двухфакторного доступа'],
  ['New Guard Tour', 'Նոր պահակային երթուղի', 'Новый маршрут обхода'],
  ['New Occupancy Zone', 'Նոր զբաղվածության գոտի', 'Новая зона занятости'],
  ['New Policy Template', 'Քաղաքականության նոր ձևանմուշ', 'Новый шаблон политики'],
  ['New Tailgating Config', 'Ուղեկցման հայտնաբերման նոր կարգավորում', 'Новая настройка обнаружения прохода вслед'],
  ['New Template', 'Նոր ձևանմուշ', 'Новый шаблон'],
  ['No access data.', 'Մուտքի տվյալներ չկան։', 'Нет данных доступа.'],
  ['No access events yet', 'Մուտքի իրադարձություններ դեռ չկան', 'Событий доступа пока нет'],
  ['No access levels configured.', 'Մուտքի մակարդակներ կազմաձևված չեն։', 'Уровни доступа не настроены.'],
  ['No access levels match the current filter.', 'Մուտքի ոչ մի մակարդակ չի համապատասխանում ներկայիս զտիչին։', 'Нет уровней доступа, подходящих текущему фильтру.'],
  ['No access rules yet. Add rules to define which levels can access which floors.', 'Մուտքի կանոններ դեռ չկան։ Ավելացրեք կանոններ՝ նշելու համար, թե որ մակարդակները որ հարկերն են հասանելի։', 'Правил доступа пока нет. Добавьте правила, чтобы указать, каким уровням доступны какие этажи.'],
  ['No active access terminals are available in Device Management.', 'Սարքերի կառավարման մեջ ակտիվ մուտքի տերմինալներ չկան։', 'В управлении устройствами нет доступных активных терминалов.'],
  ['No active ACS devices.', 'Ակտիվ ACS սարքեր չկան։', 'Нет активных устройств ACS.'],
  ['No checkpoints added yet.', 'Հսկիչ կետեր դեռ չեն ավելացվել։', 'Контрольные точки пока не добавлены.'],
  ['No denials in period.', 'Ժամանակահատվածում մերժումներ չկան։', 'Отказов за период нет.'],
  ['No door data available.', 'Դռների տվյալներ չկան։', 'Нет данных о дверях.'],
  ['No door rules defined in this template.', 'Այս ձևանմուշում դռների կանոններ չկան։', 'В этом шаблоне не определены правила дверей.'],
  ['No door-camera mappings', 'Դուռ-տեսախցիկ կապակցումներ չկան', 'Нет сопоставлений «дверь–камера»'],
  ['No dual-auth rules', 'Երկակի հաստատման կանոններ չկան', 'Нет правил двухфакторного доступа'],
  ['No events found for the selected filters.', 'Ընտրված զտիչների համար իրադարձություններ չեն գտնվել։', 'По выбранным фильтрам события не найдены.'],
  ['No executions recorded for this tour.', 'Այս երթուղու համար անցումներ չեն գրանցվել։', 'Для этого маршрута нет записанных выполнений.'],
  ['No lifts configured.', 'Վերելակներ կազմաձևված չեն։', 'Лифты не настроены.'],
  ['No matching access events', 'Համապատասխան մուտքի իրադարձություններ չկան', 'Нет подходящих событий доступа'],
  ['No members yet.', 'Անդամներ դեռ չկան։', 'Участников пока нет.'],
  ['No occupancy data', 'Զբաղվածության տվյալներ չկան', 'Нет данных о занятости'],
  ['No occupancy zones', 'Զբաղվածության գոտիներ չկան', 'Нет зон занятости'],
  ['No pending sessions', 'Սպասող նիստեր չկան', 'Нет ожидающих сеансов'],
  ['No records for this range.', 'Այս միջակայքում գրառումներ չկան։', 'Нет записей за этот период.'],
  ['No records found.', 'Գրառումներ չեն գտնվել։', 'Записи не найдены.'],
  ['No tailgating incidents', 'Ուղեկցման միջադեպեր չկան', 'Нет инцидентов прохода вслед'],
  ['No tailgating monitors', 'Ուղեկցման հսկիչներ չկան', 'Нет контролёров прохода вслед'],
  ['No templates yet.', 'Ձևանմուշներ դեռ չկան։', 'Шаблонов пока нет.'],
  ['No tours yet.', 'Երթուղիներ դեռ չկան։', 'Маршрутов пока нет.'],
  ['Nobody currently inside', 'Ներսում այժմ ոչ ոք չկա', 'Сейчас внутри никого нет'],
  ['Nobody tracked inside this zone right now.', 'Այս պահին այս գոտում ոչ ոք չի գրանցվում։', 'Сейчас в этой зоне никто не отслеживается.'],
  ['None', 'Չկա', 'Нет'],
  ['Offline cache:', 'Անցանց քեշ՝', 'Автономный кэш:'],
  ['Open Incidents', 'Բաց միջադեպեր', 'Открытые инциденты'],
  ['Incidents', 'Միջադեպեր', 'Инциденты'],
  ['Configurations', 'Կարգավորումներ', 'Конфигурации'],
  ['Ordered Tours', 'Կարգավորված երթուղիներ', 'Упорядоченные маршруты'],
  ['OUT Door', 'ԵԼՔ դուռ', 'Дверь ВЫХОД'],
  ['Over Capacity', 'Գերազանցված տարողություն', 'Превышена вместимость'],
  ['Passive', 'Պասիվ', 'Неактивен'],
  ['Person / Card', 'Անձ / քարտ', 'Человек / карта'],
  ['Person / Card / Employee ID', 'Անձ / քարտ / աշխատակցի ID', 'Человек / карта / ID сотрудника'],
  ['Person becomes passive when the limit is reached', 'Սահմանին հասնելիս անձը դառնում է պասիվ', 'При достижении лимита человек становится неактивным'],
  ['Persons will appear here when they scan IN at a monitored door.', 'Անձինք կհայտնվեն այստեղ, երբ վերահսկվող դռան մոտ ՄՈՒՏՔ գրանցեն։', 'Люди появятся здесь, когда отметят ВХОД на контролируемой двери.'],
  ['PIN Code', 'PIN կոդ', 'PIN-код'],
  ['PIN must contain at least 4 digits.', 'PIN-ը պետք է պարունակի առնվազն 4 նիշ։', 'PIN-код должен содержать не менее 4 цифр.'],
  ['Progress', 'Առաջընթաց', 'Выполнение'],
  ['Public Holiday', 'Պետական տոն', 'Государственный праздник'],
  ['Recurring', 'Կրկնվող', 'Повторяющийся'],
  ['Report Filters', 'Հաշվետվության զտիչներ', 'Фильтры отчёта'],
  ['Resolve Incident', 'Լուծել միջադեպը', 'Закрыть инцидент'],
  ['Resolved', 'Լուծված', 'Закрыто'],
  ['Restricted Access', 'Սահմանափակ մուտք', 'Ограниченный доступ'],
  ['Revoked', 'Չեղարկված', 'Отозвано'],
  ['Scan to check-in / check-out', 'Սկանավորեք մուտք/ելք գրանցելու համար', 'Отсканируйте для отметки прихода/ухода'],
  ['Select a lift', 'Ընտրեք վերելակ', 'Выберите лифт'],
  ['Select a template', 'Ընտրեք ձևանմուշ', 'Выберите шаблон'],
  ['Select a terminal', 'Ընտրեք տերմինալ', 'Выберите терминал'],
  ['Select a terminal and place a finger on its fingerprint reader', 'Ընտրեք տերմինալ և մատը դրեք դրա մատնահետքի ընթերցիչի վրա', 'Выберите терминал и приложите палец к его считывателю отпечатков'],
  ['Select a terminal, start enrollment, then hold the card on its reader', 'Ընտրեք տերմինալ, սկսեք գրանցումը, ապա քարտը պահեք դրա ընթերցիչի վրա', 'Выберите терминал, начните регистрацию и приложите карту к его считывателю'],
  ['Select access terminal', 'Ընտրեք մուտքի տերմինալ', 'Выберите терминал доступа'],
  ['Select host', 'Ընտրեք հյուրընկալողին', 'Выберите принимающего'],
  ['Select person…', 'Ընտրեք անձին…', 'Выберите человека…'],
  ['Sensitivity', 'Զգայունություն', 'Чувствительность'],
  ['Set Floor Access for Level', 'Կարգավորել մակարդակի հարկային մուտքը', 'Настроить доступ к этажам для уровня'],
  ['Total Persons', 'Անձանց ընդհանուր քանակ', 'Всего людей'],
  ['Total Incidents', 'Միջադեպերի ընդհանուր քանակ', 'Всего инцидентов'],
  ['Total Inside', 'Ներսում ընդհանուր', 'Всего внутри'],
  ['Total Issued', 'Տրվածների ընդհանուր քանակ', 'Всего выдано'],
  ['Total Links', 'Կապերի ընդհանուր քանակ', 'Всего связей'],
  ['Total Rules', 'Կանոնների ընդհանուր քանակ', 'Всего правил'],
  ['Total Tours', 'Երթուղիների ընդհանուր քանակ', 'Всего маршрутов'],
  ['Tracked Persons', 'Հետևվող անձինք', 'Отслеживаемые люди'],
  ['Trigger Events', 'Գործարկող իրադարձություններ', 'События запуска'],
  ['Trigger on events:', 'Գործարկել իրադարձությունների դեպքում՝', 'Срабатывать при событиях:'],
  ['Try another index if more than one USB camera is connected.', 'Փորձեք այլ ինդեքս, եթե միացված է մեկից ավելի USB տեսախցիկ։', 'Попробуйте другой индекс, если подключено более одной USB-камеры.'],
  ['Upload Picture', 'Վերբեռնել նկար', 'Загрузить изображение'],
  ['Use "Armenian Holidays" to auto-populate, or add entries manually.', 'Օգտագործեք «Հայկական տոներ»-ը ավտոմատ լրացնելու համար կամ ավելացրեք գրառումներ ձեռքով։', 'Используйте «Армянские праздники» для автозаполнения или добавьте записи вручную.'],
  ['Verify Mode', 'Ստուգման եղանակ', 'Способ проверки'],
  ['VISITOR PASS', 'ԱՅՑԵԼՈՒԻ ԱՆՑԱԳԻՐ', 'ПРОПУСК ПОСЕТИТЕЛЯ'],
  ['Waiting for a first card swipe on a dual-auth door.', 'Սպասվում է առաջին քարտի ընթերցումը երկակի հաստատման դռան վրա։', 'Ожидается первое считывание карты на двери двухфакторного доступа.'],
  ['Weekdays 08:00-20:00', 'Աշխատանքային օրեր 08:00-20:00', 'Будни 08:00–20:00'],
  ['Zone Name', 'Գոտու անուն', 'Название зоны'],
  ['— all devices —', '— բոլոր սարքերը —', '— все устройства —'],
  ['— device —', '— սարք —', '— устройство —'],
  ['access point(s)', 'մուտքի կետ(եր)', 'точка(и) доступа'],
  ['Card', 'Քարտ', 'Карта'],
  ['Device', 'Սարք', 'Устройство'],
  ['Door', 'Դուռ', 'Дверь'],
  ['Name', 'Անուն', 'Имя'],
  ['Started', 'Սկսվել է', 'Начато'],
  ['Status', 'Կարգավիճակ', 'Статус'],
  ['Time', 'Ժամ', 'Время'],
  ['Actions', 'Գործողություններ', 'Действия'],
  ['Cancel', 'Չեղարկել', 'Отмена'],
  ['Close', 'Փակել', 'Закрыть'],
  ['Previous', 'Նախորդ', 'Назад'],
  ['Next', 'Հաջորդ', 'Далее'],
  ['Remove', 'Հեռացնել', 'Удалить'],
  ['Search', 'Որոնել', 'Поиск'],
  ['Issue', 'Խնդիր', 'Проблема'],
  ['Active', 'Ակտիվ', 'Активен'],
  ['Online', 'Առցանց', 'В сети'],
  ['Offline', 'Անցանց', 'Не в сети'],
  ['All', 'Բոլորը', 'Все'],
  ['Today', 'Այսօր', 'Сегодня'],

  ['Access denied', 'Մուտքը մերժվեց', 'Доступ запрещён'],
  ['Access granted', 'Մուտքը թույլատրվեց', 'Доступ разрешён'],
  ['Beta', 'ԲԵՏԱ', 'БЕТА'],
  ['Devices', 'Սարքեր', 'Устройства'],
  ['Enter', 'Բացել', 'Открыть'],
  ['Esc', 'Փակել', 'Закрыть'],
  ['inactive', 'պասիվ', 'неактивен'],
  ['Open Door', 'Բացել դուռը', 'Открыть дверь'],
  ['Plan 1 is the controller\'s 24/7 template. Map custom schedules only after creating the same plan on the controller.', 'Պլան 1-ը վերահսկիչի 24/7 ձևանմուշն է։ Անհատական ժամանակացույցները կապեք միայն վերահսկիչում նույն պլանը ստեղծելուց հետո։', 'План 1 — это шаблон контроллера 24/7. Сопоставляйте пользовательские расписания только после создания такого же плана на контроллере.'],
  ['Public', 'Պետական', 'Государственный'],
  ['Select a tour', 'Ընտրեք երթուղի', 'Выберите маршрут'],
  ['Tagged', 'Պիտակավորված', 'С тегами'],
  ['Tags (comma-separated)', 'Պիտակներ (ստորակետով)', 'Теги (через запятую)'],
  ['Tailgating Detection', 'Ուղեկցման հայտնաբերում', 'Обнаружение прохода вслед'],
  ['Templates', 'Ձևանմուշներ', 'Шаблоны'],
  ['The next free fingerprint slot will be selected automatically.', 'Հաջորդ ազատ մատնահետքի տեղը կընտրվի ավտոմատ։', 'Следующий свободный слот отпечатка будет выбран автоматически.'],
  ['The terminal will be monitored for a new card swipe for 60 seconds.', 'Տերմինալը 60 վայրկյան կսպասի նոր քարտի ընթերցման։', 'Терминал будет ожидать нового считывания карты в течение 60 секунд.'],
  ['Timeout', 'Ժամկետի ավարտ', 'Тайм-аут'],
  ['To', 'Մինչև', 'До'],
  ['to', 'մինչև', 'до'],
  ['Today is a holiday:', 'Այսօր տոն է՝', 'Сегодня праздник:'],

  ['4-8 digits', '4-8 նիշ', '4–8 цифр'],
  ['Edit person', 'Խմբագրել անձին', 'Редактировать человека'],
  ['Main Elevator', 'Գլխավոր վերելակ', 'Главный лифт'],
  ['Main Entrance', 'Գլխավոր մուտք', 'Главный вход'],
  ['Night Round A', 'Գիշերային շրջայց A', 'Ночной обход A'],
  ['Office Floor 3', 'Գրասենյակի 3-րդ հարկ', 'Офисный этаж 3'],
  ['Send this person\'s credentials to assigned controllers again', 'Կրկին ուղարկել այս անձի հավաստագրերը նշանակված վերահսկիչներին', 'Повторно отправить учётные данные этого человека назначенным контроллерам'],
  ['e.g. HR Team, VIP Floor…', 'օր.` HR թիմ, VIP հարկ…', 'например: команда HR, VIP-этаж…'],
  ['office, standard', 'գրասենյակ, ստանդարտ', 'офис, стандартный'],
  ['optional', 'ըստ ցանկության', 'необязательно'],
  ['Please enter.', 'Խնդրում ենք մուտքագրել։', 'Пожалуйста, заполните.'],
  ['Enter phone No.', 'Մուտքագրեք հեռախոսահամարը։', 'Введите номер телефона.'],
  ['Please select.', 'Խնդրում ենք ընտրել։', 'Пожалуйста, выберите.'],
  ['Search access records', 'Որոնել մուտքի գրառումները', 'Поиск записей доступа'],
  ['Include sub-departments', 'Ներառել ենթաբաժինները', 'Включить подразделения'],
  ['Approve', 'Հաստատել', 'Одобрить'],
  ['Reject', 'Մերժել', 'Отклонить'],
  ['Mark Resolved', 'Նշել որպես լուծված', 'Отметить как решённый'],
  ['Reservations', 'Ամրագրումներ', 'Бронирования'],
  ['Watch List', 'Վերահսկման ցուցակ', 'Список наблюдения'],

  ['New Tour', 'Նոր երթուղի', 'Новый маршрут'],
  ['Tours', 'Երթուղիներ', 'Маршруты'],
  ['TOURS', 'ԵՐԹՈՒՂԻՆԵՐ', 'МАРШРУТЫ'],
  ['manual', 'ձեռքով', 'вручную'],
  ['manual lock', 'ձեռքով կողպում', 'ручная блокировка'],
  ['manual unlock', 'ձեռքով ապակողպում', 'ручная разблокировка'],
  ['configured /', 'կազմաձևված /', 'настроено /'],
  ['Choose File', 'Ընտրել ֆայլ', 'Выбрать файл'],
  ['No file selected', 'Ֆայլ ընտրված չէ', 'Файл не выбран'],
  ['Real-time headcount based on door IN/OUT events. Auto-refreshes every 20 seconds.', 'Իրական ժամանակում մարդկանց քանակը՝ ըստ դռան ՄՈՒՏՔ/ԵԼՔ իրադարձությունների։ Ավտոթարմացում՝ յուրաքանչյուր 20 վայրկյանը մեկ։', 'Количество людей в реальном времени по событиям ВХОД/ВЫХОД. Автообновление каждые 20 секунд.'],
  ['Real-time zone headcount based on IN/OUT door events. Auto-refreshes every 15 seconds.', 'Գոտու մարդկանց քանակն իրական ժամանակում՝ ըստ ՄՈՒՏՔ/ԵԼՔ դռան իրադարձությունների։ Ավտոթարմացում՝ յուրաքանչյուր 15 վայրկյանը մեկ։', 'Количество людей в зоне в реальном времени по событиям ВХОД/ВЫХОД. Автообновление каждые 15 секунд.'],
  ['Door Statistics', 'Դռների վիճակագրություն', 'Статистика дверей'],
  ['Denial Reasons', 'Մերժման պատճառներ', 'Причины отказов'],
  ['Top Persons by Access', 'Առաջատար անձինք՝ ըստ մուտքերի', 'Лидеры по количеству проходов'],
  ['Offline Card Cache', 'Անցանց քարտերի քեշ', 'Автономный кэш карт'],
  ['The offline cache stores all active card assignments locally. When an ACS device is unreachable, access decisions fall back to this cache. Sync regularly to keep it up-to-date.', 'Անցանց քեշը տեղային պահում է բոլոր ակտիվ քարտերի նշանակումները։ Երբ ACS սարքը անհասանելի է, մուտքի որոշումները օգտագործում են այս քեշը։ Պարբերաբար համաժամացրեք այն թարմ պահելու համար։', 'Автономный кэш локально хранит все активные назначения карт. Когда устройство ACS недоступно, решения о доступе берутся из этого кэша. Регулярно синхронизируйте его для актуальности.'],
  ['Synced', 'Համաժամացվել է', 'Синхронизировано'],
  ['Sync failed', 'Համաժամացումը ձախողվեց', 'Синхронизация не удалась'],
  ['device(s)', 'սարք(եր)', 'устройство(а)'],
  ['matching record(s)', 'համապատասխան գրառում(ներ)', 'подходящая запись(и)'],
  ['Showing', 'Ցուցադրվում է', 'Показано'],
  ['of', 'ը', 'из'],

  ['Select date and time', 'Ընտրեք ամսաթիվն ու ժամը', 'Выберите дату и время'],

  ['Link a door to a camera. When a card event occurs, a snapshot is automatically captured and stored alongside the access event.', 'Կապեք դուռը տեսախցիկին։ Քարտի իրադարձության դեպքում լուսանկարը ավտոմատ կստացվի և կպահվի մուտքի իրադարձության հետ։', 'Свяжите дверь с камерой. При событии карты снимок будет сделан автоматически и сохранён вместе с событием доступа.'],
  ['Create reusable door-rule templates. Apply them to access levels to clone the configuration instantly.', 'Ստեղծեք դռների կանոնների վերօգտագործվող ձևանմուշներ։ Կիրառեք դրանք մուտքի մակարդակների վրա՝ կարգավորումը ակնթարթորեն պատճենելու համար։', 'Создавайте повторно используемые шаблоны правил дверей. Применяйте их к уровням доступа, чтобы мгновенно копировать настройки.'],
  ['Monitor and alert when multiple people pass through a door on a single credential event.', 'Հսկեք և ծանուցեք, երբ մեկ հավաստագրի իրադարձությամբ մի քանի մարդ անցնում է դռնով։', 'Отслеживайте и оповещайте, когда несколько людей проходят через дверь по одному учётному событию.'],
  ['Require two different active credentials at a door within a configurable time window. Refreshes every 10 seconds.', 'Պահանջում է երկու տարբեր ակտիվ հավաստագիր դռան մոտ՝ կարգավորվող ժամանակային միջակայքում։ Թարմացվում է յուրաքանչյուր 10 վայրկյանը մեկ։', 'Требует две разные активные учётные данные у двери в настраиваемый промежуток времени. Обновляется каждые 10 секунд.'],
  ['mode blocks platform-triggered unlocks and records violations for grants already made by a controller.', 'ռեժիմը արգելափակում է հարթակի կողմից գործարկված ապակողպումները և գրանցում է վերահսկիչի արդեն տված թույլտվությունների խախտումները։', 'режим блокирует разблокировки, инициированные платформой, и записывает нарушения по уже выданным контроллером разрешениям.'],
  ['Work Schedule Rules', 'Աշխատանքային ժամանակացույցի կանոններ', 'Правила рабочего расписания'],
  ['New Rule', 'Նոր կանոն', 'Новое правило'],
  ['No rules yet. Create one to enable daily reports.', 'Կանոններ դեռ չկան։ Ստեղծեք մեկը՝ օրական հաշվետվությունները միացնելու համար։', 'Правил пока нет. Создайте правило, чтобы включить ежедневные отчёты.'],
  ['Daily Attendance Report', 'Օրական հաճախման հաշվետվություն', 'Ежедневный отчёт посещаемости'],
  ['No employees registered.', 'Աշխատակիցներ գրանցված չեն։', 'Сотрудники не зарегистрированы.'],
  ['Time and attendance configuration', 'Ժամանակի և հաճախման կարգավորում', 'Настройка времени и посещаемости'],
  ['Groups', 'Խմբեր', 'Группы'],
  ['groups', 'խմբեր', 'группы'],
  ['Shifts', 'Հերթափոխեր', 'Смены'],
  ['shifts', 'հերթափոխեր', 'смены'],
  ['Schedules', 'Ժամանակացույցեր', 'Расписания'],
  ['schedules', 'ժամանակացույցեր', 'расписания'],
  ['Requests', 'Հարցումներ', 'Запросы'],
  ['requests', 'հարցումներ', 'запросы'],
  ['Calculation', 'Հաշվարկ', 'Расчёт'],
  ['calculation', 'հաշվարկ', 'расчёт'],
  ['Calculate', 'Հաշվել', 'Рассчитать'],
  ['Recalculate Records', 'Վերահաշվել գրառումները', 'Пересчитать записи'],
  ['Attendance Records', 'Հաճախման գրառումներ', 'Записи посещаемости'],
  ['Total Work Hours', 'Աշխատանքային ժամերի ընդհանուր քանակ', 'Всего рабочих часов'],
  ['Pending Requests', 'Սպասող հարցումներ', 'Ожидающие запросы'],
  ['No shifts configured yet.', 'Հերթափոխեր դեռ կազմաձևված չեն։', 'Смены ещё не настроены.'],
  ['No groups configured yet.', 'Խմբեր դեռ կազմաձևված չեն։', 'Группы ещё не настроены.'],
  ['No schedules configured yet.', 'Ժամանակացույցեր դեռ կազմաձևված չեն։', 'Расписания ещё не настроены.'],
  ['No requests configured yet.', 'Հարցումներ դեռ կազմաձևված չեն։', 'Запросы ещё не настроены.'],
  ['Hourly Access Heatmap', 'Մուտքերի ժամային ջերմային քարտեզ', 'Почасовая тепловая карта проходов'],
  ['Daily Trend', 'Օրական միտում', 'Дневная динамика'],
  ['denial rate', 'մերժումների տոկոս', 'доля отказов'],
  ['Access events', 'Մուտքի իրադարձություններ', 'События доступа'],
  ['Work Start', 'Աշխատանքի սկիզբ', 'Начало работы'],
  ['Work End', 'Աշխատանքի ավարտ', 'Окончание работы'],
  ['Grace (min)', 'Թույլատրելի ուշացում (րոպե)', 'Допуск (мин.)'],
  ['Work Days', 'Աշխատանքային օրեր', 'Рабочие дни'],
  ['Edit Rule', 'Խմբագրել կանոնը', 'Редактировать правило'],
  ['Edit rule', 'Խմբագրել կանոնը', 'Редактировать правило'],
  ['Delete rule', 'Ջնջել կանոնը', 'Удалить правило'],
  ['First In', 'Առաջին մուտք', 'Первый вход'],
  ['Last Event', 'Վերջին իրադարձություն', 'Последнее событие'],
  ['Break', 'Ընդմիջում', 'Перерыв'],
  ['Minimum', 'Նվազագույն', 'Минимум'],
  ['Default shift:', 'Լռելյայն հերթափոխ՝', 'Смена по умолчанию:'],
  ['Not assigned', 'Նշանակված չէ', 'Не назначено'],
  ['scheduled people', 'նշանակված անձ', 'назначенных людей'],
  ['Open ended', 'Առանց ավարտի', 'Без окончания'],
  ['New Shift', 'Նոր հերթափոխ', 'Новая смена'],
  ['Start', 'Սկիզբ', 'Начало'],
  ['End', 'Ավարտ', 'Окончание'],
  ['Break minutes', 'Ընդմիջման րոպեներ', 'Минуты перерыва'],
  ['Grace minutes', 'Թույլատրելի ուշացման րոպեներ', 'Минуты допуска'],
  ['Minimum work minutes', 'Աշխատանքի նվազագույն րոպեներ', 'Минимальные рабочие минуты'],
  ['Male', 'Արական', 'Мужской'],
  ['Female', 'Իգական', 'Женский'],
  ['Unknown', 'Անհայտ', 'Неизвестно'],
  ['Independence Day', 'Անկախության օր', 'День независимости'],
  ['Recurring annually (MM-DD)', 'Կրկնվում է ամեն տարի (ԱԱ-ՕՕ)', 'Повторяется ежегодно (ММ-ДД)'],
  ['Total', 'Ընդհանուր', 'Всего'],
  ['No holidays for', 'Տոներ չկան՝', 'Нет праздников за'],
];

const ACS_UI_TEXT = {
  hy: Object.fromEntries(ACS_UI_ROWS.map(([source, hy]) => [source, hy])),
  ru: Object.fromEntries(ACS_UI_ROWS.map(([source, _hy, ru]) => [source, ru])),
};
const ACS_UI_SOURCE_SET = new Set(ACS_UI_ROWS.map(([source]) => source));
const ACS_UI_LOWER_SOURCE = Object.fromEntries(
  ACS_UI_ROWS.map(([source]) => [source.toLocaleLowerCase('en-US'), source]),
);
const ACS_UI_REVERSE = Object.fromEntries(
  ACS_UI_ROWS.flatMap(([source, hy, ru]) => [[hy, source], [ru, source]]),
);
const acsCanonicalSource = value => {
  if (ACS_UI_SOURCE_SET.has(value)) return value;
  return ACS_UI_LOWER_SOURCE[value.toLocaleLowerCase('en-US')] || ACS_UI_REVERSE[value] || null;
};
const ACS_UI_NODE_SOURCE = new WeakMap();
const ACS_UI_ATTR_SOURCE = new WeakMap();

function acsDynamicTranslation(source, lang) {
  const locale = lang === 'hy' ? 'hy' : lang === 'ru' ? 'ru' : 'en';
  if (locale === 'en') return source;
  const workingDay = source.match(/^Today \(([^)]+)\) is a regular working day\.$/);
  if (workingDay) return locale === 'hy'
    ? `Այսօր (${workingDay[1]}) սովորական աշխատանքային օր է։`
    : `Сегодня (${workingDay[1]}) обычный рабочий день.`;
  const totalForYear = source.match(/^Total \((\d{4})\)$/);
  if (totalForYear) return locale === 'hy' ? `Ընդհանուր (${totalForYear[1]})` : `Всего (${totalForYear[1]})`;
  const noHolidays = source.match(/^No holidays for (\d{4})$/);
  if (noHolidays) return locale === 'hy' ? `${noHolidays[1]} թ.` + ' տոներ չկան' : `За ${noHolidays[1]} г. праздников нет`;
  const denialRate = source.match(/^(\d+(?:\.\d+)?)% denial rate$/);
  if (denialRate) return locale === 'hy' ? `${denialRate[1]}% մերժումների տոկոս` : `${denialRate[1]}% доля отказов`;
  const syncedDevices = source.match(/^Synced (\d+) device\(s\)$/);
  if (syncedDevices) return locale === 'hy' ? `Համաժամացվել է ${syncedDevices[1]} սարք` : `Синхронизировано устройств: ${syncedDevices[1]}`;
  const emergencyCommand = source.match(/^Emergency (open_all|lockdown) sent to (\d+) device\(s\)$/);
  if (emergencyCommand) {
    const action = emergencyCommand[1] === 'open_all'
      ? (locale === 'hy' ? 'Արտակարգ բացում' : 'Экстренное открытие')
      : (locale === 'hy' ? 'Արտակարգ արգելափակում' : 'Экстренная блокировка');
    return locale === 'hy'
      ? `${action}. ուղարկվել է ${emergencyCommand[2]} սարքի`
      : `${action}: отправлено устройствам — ${emergencyCommand[2]}`;
  }
  const doorCommand = source.match(/^Door (\d+) command=([a-z_]+) on (.+) \(([^)]+)\) — ok=(True|False)$/i);
  if (doorCommand) {
    const command = {
      unlock: locale === 'hy' ? 'ապակողպում' : 'разблокировка',
      lock: locale === 'hy' ? 'կողպում' : 'блокировка',
      stay_open: locale === 'hy' ? 'բաց թողնել' : 'оставить открытой',
      stay_close: locale === 'hy' ? 'փակ թողնել' : 'оставить закрытой',
    }[doorCommand[2].toLowerCase()] || doorCommand[2];
    const result = doorCommand[5].toLowerCase() === 'true'
      ? (locale === 'hy' ? 'հաջող' : 'успешно')
      : (locale === 'hy' ? 'սխալ' : 'ошибка');
    return locale === 'hy'
      ? `Դուռ ${doorCommand[1]}․ ${command} — ${doorCommand[3]} (${doorCommand[4]}), արդյունք՝ ${result}`
      : `Дверь ${doorCommand[1]}: ${command} — ${doorCommand[3]} (${doorCommand[4]}), результат: ${result}`;
  }
  const door = source.match(/^Door (.+)$/);
  if (door) return locale === 'hy' ? `Դուռ ${door[1]}` : `Дверь ${door[1]}`;
  const device = source.match(/^Device (.+)$/);
  if (device) return locale === 'hy' ? `Սարք ${device[1]}` : `Устройство ${device[1]}`;
  const reader = source.match(/^Reader (Online|Offline)$/);
  if (reader) return locale === 'hy'
    ? `Ընթերցիչը ${reader[1] === 'Online' ? 'առցանց է' : 'անցանց է'}`
    : `Считыватель ${reader[1] === 'Online' ? 'онлайн' : 'офлайн'}`;
  const doors = source.match(/^(\d+) door(s)?$/);
  if (doors) return locale === 'hy' ? `${doors[1]} դուռ` : `${doors[1]} ${doors[2] ? 'дверей' : 'дверь'}`;
  const configured = source.match(/^(\d+) configured(?: \/ (\d+) missing)?$/);
  if (configured) {
    if (locale === 'hy') return configured[2] ? `${configured[1]} կազմաձևված / ${configured[2]} բացակա` : `${configured[1]} կազմաձևված`;
    return configured[2] ? `${configured[1]} настроено / ${configured[2]} отсутствует` : `${configured[1]} настроено`;
  }
  const ago = source.match(/^(\d+)(s|m|h|d) ago$/);
  if (ago) {
    const unit = locale === 'hy'
      ? { s: 'վրկ.', m: 'ր.', h: 'ժ.', d: 'օր' }[ago[2]]
      : { s: 'с', m: 'мин', h: 'ч', d: 'дн' }[ago[2]];
    return locale === 'hy' ? `${ago[1]} ${unit} առաջ` : `${ago[1]} ${unit} назад`;
  }
  return null;
}

export function AcsAutoTranslator() {
  const { lang } = React.useContext(I18nContext);

  React.useLayoutEffect(() => {
    const root = document.querySelector('.acs-app');
    if (!root) return undefined;
    const table = ACS_UI_TEXT[lang] || {};
    const translationFor = source => table[source] || acsDynamicTranslation(source, lang) || source;
    const isTranslatorControl = node => {
      const element = node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement;
      return Boolean(element?.closest?.('.acs-lang-selector'));
    };
    const processText = node => {
      if (isTranslatorControl(node)) return;
      const saved = ACS_UI_NODE_SOURCE.get(node);
      if (saved) {
        const next = `${saved.leading}${translationFor(saved.source)}${saved.trailing}`;
        if (node.nodeValue !== next) node.nodeValue = next;
        return;
      }
      const raw = node.nodeValue || '';
      const leading = raw.match(/^\s*/)?.[0] || '';
      const trailing = raw.match(/\s*$/)?.[0] || '';
      const source = raw.trim().replace(/\s+/g, ' ');
      const original = acsCanonicalSource(source);
      // In English, acsDynamicTranslation returns its input for display. Use a
      // translated locale only for pattern detection so arbitrary React text
      // is not captured and later forced back to English.
      const dynamic = !original && acsDynamicTranslation(source, lang === 'en' ? 'ru' : lang);
      if (!original && !dynamic) return;
      const record = { source: original || source, leading, trailing };
      ACS_UI_NODE_SOURCE.set(node, record);
      const next = `${leading}${translationFor(record.source)}${trailing}`;
      if (raw !== next) node.nodeValue = next;
    };
    const processElement = element => {
      if (isTranslatorControl(element)) return;
      ['placeholder', 'title', 'aria-label'].forEach(attribute => {
        const value = element.getAttribute(attribute);
        if (!value) return;
        let attributes = ACS_UI_ATTR_SOURCE.get(element);
        const saved = attributes?.[attribute];
        const source = saved || acsCanonicalSource(value);
        if (!source) return;
        if (!attributes) { attributes = {}; ACS_UI_ATTR_SOURCE.set(element, attributes); }
        attributes[attribute] = source;
        const next = translationFor(source);
        if (value !== next) element.setAttribute(attribute, next);
      });
    };
    const processTree = target => {
      if (isTranslatorControl(target)) return;
      if (target.nodeType === Node.TEXT_NODE) { processText(target); return; }
      if (target.nodeType !== Node.ELEMENT_NODE) return;
      processElement(target);
      const walker = document.createTreeWalker(target, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode())) {
        if (node.nodeType === Node.TEXT_NODE) processText(node);
        else processElement(node);
      }
    };
    processTree(root);
    const observer = new MutationObserver(records => {
      records.forEach(record => {
        if (record.type === 'characterData') processText(record.target);
        else if (record.type === 'attributes') processElement(record.target);
        else record.addedNodes.forEach(processTree);
      });
    });
    observer.observe(root, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['placeholder', 'title', 'aria-label'] });
    return () => observer.disconnect();
  }, [lang]);

  return null;
}

export function useAcsTr() {
  const { lang } = React.useContext(I18nContext);
  return React.useCallback(
    key => ACS_I18N[lang]?.[key]
      || ACS_DASH_I18N[lang]?.[key]
      || ACS_USABILITY_I18N[lang]?.[key]
      || ACS_UI_TEXT[lang]?.[key]
      || ACS_I18N.en[key]
      || ACS_DASH_I18N.en[key]
      || ACS_USABILITY_I18N.en[key]
      || ACS_UI_TEXT.en?.[key]
      || acsDynamicTranslation(key, lang)
      || I18N[lang]?.[key]
      || I18N.en[key]
      || key,
    [lang],
  );
}

export function LangSelector() {
  const { lang, setLang } = React.useContext(I18nContext);
  return (
    <div className="lang-box">
      <Languages size={16} />
      <select value={lang} onChange={e => setLang(e.target.value)}>
        <option value="hy">Հայ</option>
        <option value="ru">Рус</option>
        <option value="en">Eng</option>
      </select>
    </div>
  );
}

export function AcsLangSelector() {
  const { lang, setLang } = React.useContext(I18nContext);
  const [isOpen, setIsOpen] = React.useState(false);
  const rootRef = React.useRef(null);
  const options = [
    { value: 'hy', label: 'Հայ' },
    { value: 'ru', label: 'Рус' },
    { value: 'en', label: 'Eng' },
  ];
  const selected = options.find(option => option.value === lang) || options[2];

  React.useEffect(() => {
    const closeOnOutsidePress = event => {
      if (!rootRef.current?.contains(event.target)) setIsOpen(false);
    };
    document.addEventListener('pointerdown', closeOnOutsidePress);
    return () => document.removeEventListener('pointerdown', closeOnOutsidePress);
  }, []);

  const chooseLanguage = value => {
    document.documentElement.lang = value;
    // Apply the context update before closing the popup. The ACS automatic
    // translator observes the same DOM subtree and could otherwise process the
    // menu removal first, leaving the old language visible until a reload.
    flushSync(() => setLang(value));
    setIsOpen(false);
  };

  return (
    <div className="acs-lang-selector" ref={rootRef}>
      <button
        type="button"
        className="acs-lang-trigger"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        onClick={() => setIsOpen(open => !open)}
        onKeyDown={event => {
          if (event.key === 'Escape') setIsOpen(false);
        }}
      >
        <Languages size={16} aria-hidden="true" />
        <span>{selected.label}</span>
        <ChevronDown size={14} className={isOpen ? 'is-open' : ''} aria-hidden="true" />
      </button>
      {isOpen && (
        <div className="acs-lang-menu" role="listbox" aria-label="Language">
          {options.map(option => (
            <button
              key={option.value}
              type="button"
              role="option"
              aria-selected={option.value === lang}
              className={option.value === lang ? 'is-active' : ''}
              onClick={() => chooseLanguage(option.value)}
            >
              <span className="acs-lang-option-mark" aria-hidden="true" />
              <span>{option.label}</span>
              <span className="acs-lang-option-code">{option.value.toUpperCase()}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
