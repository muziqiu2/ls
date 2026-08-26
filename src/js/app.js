// ==========================================
// 应用入口：初始化 + 事件绑定
// ==========================================
import { initDom, el } from './state.js';
import { loadRecords } from './storage.js';
import { initChart, updateChart } from './chart.js';
import { updateStatistics } from './stats.js';
import { initSwipeEvents, switchTab } from './swipe.js';
import {
  handleToastAction,
  closeConfirmModal,
  handleConfirmOk,
  handleModalOverlayClick,
} from './ui.js';
import {
  renderRecords,
  setCurrentTime,
  setDefaultDates,
  handleFormSubmit,
  handleLocationChange,
  toggleFilterContainer,
  applyFilter,
  resetFilter,
  clearFilters,
  handleSearch,
  clearSearch,
  onChartDayClick,
} from './records.js';
import {
  exportData,
  triggerImport,
  handleImportFile,
  createManualBackup,
  openRestoreModal,
  closeRestoreModal,
} from './dataio.js';
import {
  loadSettings,
  openSettingsModal,
  closeSettingsModal,
  saveSettings,
  clearAllData,
} from './settings.js';

// ---------- 事件绑定 ----------

function bindEvents() {
  // 添加表单
  document.getElementById('recordForm').addEventListener('submit', handleFormSubmit);
  document.getElementById('location').addEventListener('change', handleLocationChange);

  // 筛选与搜索
  document.getElementById('filterBtn').addEventListener('click', toggleFilterContainer);
  document.getElementById('applyFilterBtn').addEventListener('click', applyFilter);
  document.getElementById('resetFilterBtn').addEventListener('click', resetFilter);
  document.getElementById('clearFiltersBtn').addEventListener('click', clearFilters);
  document.getElementById('searchInput').addEventListener('input', handleSearch);
  document.getElementById('clearSearchBtn').addEventListener('click', clearSearch);

  // 数据导入导出 / 备份
  document.getElementById('exportBtn').addEventListener('click', exportData);
  document.getElementById('importBtn').addEventListener('click', triggerImport);
  document.getElementById('importFile').addEventListener('change', handleImportFile);
  document.getElementById('backupBtn').addEventListener('click', createManualBackup);
  document.getElementById('restoreBtn').addEventListener('click', openRestoreModal);
  document.getElementById('cancelRestoreBtn').addEventListener('click', closeRestoreModal);
  document.getElementById('restoreModal').addEventListener('click', handleModalOverlayClick);

  // 设置
  document.getElementById('settingsBtn').addEventListener('click', openSettingsModal);
  document.getElementById('saveSettingsBtn').addEventListener('click', saveSettings);
  document.getElementById('cancelSettingsBtn').addEventListener('click', closeSettingsModal);
  document.getElementById('settingsModal').addEventListener('click', handleModalOverlayClick);
  document.getElementById('clearAllDataBtn').addEventListener('click', clearAllData);

  // 图表
  document.getElementById('chartType').addEventListener('change', updateChart);
  document.getElementById('timeRange').addEventListener('change', updateChart);

  // 通用确认模态框
  document.getElementById('confirmCancelBtn').addEventListener('click', closeConfirmModal);
  document.getElementById('confirmOkBtn').addEventListener('click', handleConfirmOk);
  document.getElementById('confirmModal').addEventListener('click', handleModalOverlayClick);

  // Toast 动作按钮（如删除撤销）
  el.toastAction.addEventListener('click', handleToastAction);

  // 快速录入悬浮按钮
  el.fabAddBtn.addEventListener('click', handleQuickAdd);

  // 键盘快捷键
  document.addEventListener('keydown', handleKeydown);
}

/**
 * 快速新建：切到「添加」标签并聚焦时间输入框
 */
function handleQuickAdd() {
  switchTab(0);
  if (el.recordTimeInput) {
    el.recordTimeInput.focus({ preventScroll: true });
  }
}

/**
 * 全局键盘快捷键
 * - N：切到「添加」并聚焦
 * - 1/2/3：切换标签页
 * - Esc：关闭打开的模态框（输入框聚焦时仅失焦）
 */
function handleKeydown(e) {
  const tag = (e.target && e.target.tagName ? e.target.tagName.toLowerCase() : '');
  const isTyping = ['input', 'textarea', 'select'].includes(tag);

  if (isTyping) {
    if (e.key === 'Escape') e.target.blur();
    return;
  }

  if (e.key === 'n' || e.key === 'N') {
    e.preventDefault();
    handleQuickAdd();
  } else if (['1', '2', '3'].includes(e.key)) {
    switchTab(parseInt(e.key, 10) - 1);
  } else if (e.key === 'Escape') {
    [el.settingsModal, el.restoreModal, el.confirmModal].forEach(m => {
      if (m) m.classList.add('hidden');
    });
  }
}

// ---------- 初始化 ----------

async function init() {
  await loadRecords();
  initDom();
  setCurrentTime();
  bindEvents();
  await loadSettings();
  renderRecords();
  updateStatistics();
  initChart();
  initSwipeEvents();
  setDefaultDates();
  window.addEventListener('chart-day-click', onChartDayClick);
}

document.addEventListener('DOMContentLoaded', init);