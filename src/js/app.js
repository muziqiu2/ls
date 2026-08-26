// ==========================================
// 应用入口：初始化 + 事件绑定
// ==========================================
import { initDom } from './state.js';
import { loadRecords } from './storage.js';
import { initChart, updateChart } from './chart.js';
import { updateStatistics } from './stats.js';
import { initSwipeEvents } from './swipe.js';
import {
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
  handleEditSubmit,
  cancelEdit,
  handleEditLocationChange,
  cancelDelete,
  confirmDelete,
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
  document.getElementById('recordForm').addEventListener('submit', handleFormSubmit);
  document.getElementById('location').addEventListener('change', handleLocationChange);

  document.getElementById('filterBtn').addEventListener('click', toggleFilterContainer);
  document.getElementById('applyFilterBtn').addEventListener('click', applyFilter);
  document.getElementById('resetFilterBtn').addEventListener('click', resetFilter);
  document.getElementById('clearFiltersBtn').addEventListener('click', clearFilters);

  document.getElementById('searchInput').addEventListener('input', handleSearch);
  document.getElementById('clearSearchBtn').addEventListener('click', clearSearch);

  document.getElementById('exportBtn').addEventListener('click', exportData);
  document.getElementById('importBtn').addEventListener('click', triggerImport);
  document.getElementById('importFile').addEventListener('change', handleImportFile);
  document.getElementById('backupBtn').addEventListener('click', createManualBackup);

  document.getElementById('cancelDeleteBtn').addEventListener('click', cancelDelete);
  document.getElementById('confirmDeleteBtn').addEventListener('click', confirmDelete);
  document.getElementById('deleteModal').addEventListener('click', handleModalOverlayClick);

  document.getElementById('editForm').addEventListener('submit', handleEditSubmit);
  document.getElementById('cancelEditBtn').addEventListener('click', cancelEdit);
  document.getElementById('editModal').addEventListener('click', handleModalOverlayClick);
  document.getElementById('editLocation').addEventListener('change', handleEditLocationChange);

  document.getElementById('settingsBtn').addEventListener('click', openSettingsModal);
  document.getElementById('saveSettingsBtn').addEventListener('click', saveSettings);
  document.getElementById('cancelSettingsBtn').addEventListener('click', closeSettingsModal);
  document.getElementById('settingsModal').addEventListener('click', handleModalOverlayClick);
  document.getElementById('clearAllDataBtn').addEventListener('click', clearAllData);

  document.getElementById('chartType').addEventListener('change', updateChart);
  document.getElementById('timeRange').addEventListener('change', updateChart);

  document.getElementById('restoreBtn').addEventListener('click', openRestoreModal);
  document.getElementById('cancelRestoreBtn').addEventListener('click', closeRestoreModal);
  document.getElementById('restoreModal').addEventListener('click', handleModalOverlayClick);

  document.getElementById('confirmCancelBtn').addEventListener('click', closeConfirmModal);
  document.getElementById('confirmOkBtn').addEventListener('click', handleConfirmOk);
  document.getElementById('confirmModal').addEventListener('click', handleModalOverlayClick);
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
}

document.addEventListener('DOMContentLoaded', init);