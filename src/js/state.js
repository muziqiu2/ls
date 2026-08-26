// ==========================================
// 共享状态与 DOM 引用
// ==========================================
// 所有模块通过导入此模块共享可变状态，避免全局变量污染。

export const state = {
  records: [],                // 记录列表
  currentRecordId: null,      // 当前选中要删除的记录 ID
  currentEditRecordId: null,  // 当前编辑的记录 ID
  trendChart: null,           // 图表实例
  currentTabIndex: 0,         // 当前标签页索引
  confirmCallback: null,      // 通用确认模态框回调
};

// DOM 元素引用容器（initDom 时填充），保证运行时缓存统一
export const el = {};

/**
 * 初始化 DOM 元素引用，将 HTML 元素与 JS 变量关联
 */
export function initDom() {
  // 表单单元素
  el.recordForm = document.getElementById('recordForm');
  el.recordTimeInput = document.getElementById('recordTime');
  el.locationSelect = document.getElementById('location');
  el.otherLocationContainer = document.getElementById('otherLocationContainer');
  el.otherLocationInput = document.getElementById('otherLocation');
  el.typeSelect = document.getElementById('type');
  el.notesInput = document.getElementById('notes');

  // 记录列表相关
  el.recordsList = document.getElementById('recordsList');
  el.emptyState = document.getElementById('emptyState');
  el.filterBtn = document.getElementById('filterBtn');
  el.filterContainer = document.getElementById('filterContainer');
  el.startDateInput = document.getElementById('startDate');
  el.endDateInput = document.getElementById('endDate');
  el.applyFilterBtn = document.getElementById('applyFilterBtn');
  el.resetFilterBtn = document.getElementById('resetFilterBtn');
  el.activeFilters = document.getElementById('activeFilters');
  el.filterText = document.getElementById('filterText');
  el.clearFiltersBtn = document.getElementById('clearFiltersBtn');

  // 搜索相关
  el.searchInput = document.getElementById('searchInput');
  el.clearSearchBtn = document.getElementById('clearSearchBtn');

  // 数据导入导出相关
  el.exportBtn = document.getElementById('exportBtn');
  el.importBtn = document.getElementById('importBtn');
  el.importFileInput = document.getElementById('importFile');
  el.backupBtn = document.getElementById('backupBtn');

  // 提示组件相关
  el.toast = document.getElementById('toast');
  el.toastIcon = document.getElementById('toastIcon');
  el.toastText = document.getElementById('toastText');
  el.toastAction = document.getElementById('toastAction');

  // 快速录入相关
  el.fabAddBtn = document.getElementById('fabAddBtn');

  // 统计信息相关
  el.avgIntervalElement = document.getElementById('avgInterval');
  el.weeklyCountElement = document.getElementById('weeklyCount');
  el.commonLocationElement = document.getElementById('commonLocation');

  // 规律洞察相关
  el.streakCountElement = document.getElementById('streakCount');
  el.weekCompareElement = document.getElementById('weekCompare');
  el.weekCompareMetaElement = document.getElementById('weekCompareMeta');
  el.regularityBoxElement = document.getElementById('regularityBox');
  el.regularityTextElement = document.getElementById('regularityText');

  // 标签页与滑动相关
  el.tabBtns = document.querySelectorAll('.tab-btn');
  el.swipeContainer = document.querySelector('.swipe-container');
  el.swipeWrapper = document.querySelector('.swipe-wrapper');
  el.swipeCards = document.querySelectorAll('.swipe-card');

  // 设置相关
  el.settingsBtn = document.getElementById('settingsBtn');
  el.settingsModal = document.getElementById('settingsModal');
  el.themeRadios = document.querySelectorAll('input[name="theme"]');
  el.notificationAdd = document.getElementById('notificationAdd');
  el.notificationDelete = document.getElementById('notificationDelete');
  el.notificationEdit = document.getElementById('notificationEdit');
  el.clearAllDataBtn = document.getElementById('clearAllDataBtn');
  el.saveSettingsBtn = document.getElementById('saveSettingsBtn');
  el.cancelSettingsBtn = document.getElementById('cancelSettingsBtn');

  // 图表设置相关
  el.chartTypeSelect = document.getElementById('chartType');
  el.timeRangeSelect = document.getElementById('timeRange');

  // 备份恢复相关
  el.restoreBtn = document.getElementById('restoreBtn');
  el.restoreModal = document.getElementById('restoreModal');
  el.backupsList = document.getElementById('backupsList');
  el.emptyBackupsState = document.getElementById('emptyBackupsState');
  el.cancelRestoreBtn = document.getElementById('cancelRestoreBtn');

  // 通用确认模态框相关
  el.confirmModal = document.getElementById('confirmModal');
  el.confirmTitle = document.getElementById('confirmTitle');
  el.confirmMessage = document.getElementById('confirmMessage');
  el.confirmIcon = document.getElementById('confirmIcon');
  el.confirmCancelBtn = document.getElementById('confirmCancelBtn');
  el.confirmOkBtn = document.getElementById('confirmOkBtn');
}