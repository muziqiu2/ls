// ==========================================
// 应用入口：初始化 + 事件绑定
// ==========================================
import { initDom, el, state } from './state.js';
import { loadRecords, getStorageError } from './storage.js';
import { initChart, updateChart } from './chart.js';
import { updateStatistics } from './stats.js';
import { initSwipeEvents, switchTab } from './swipe.js';
import {
  handleToastAction,
  closeConfirmModal,
  handleConfirmOk,
  handleModalOverlayClick,
  registerModal,
  showToast,
} from './ui.js';
import {
  renderRecords,
  setCurrentTime,
  setDefaultDates,
  handleFormSubmit,
  quickLog,
  handleLocationChange,
  toggleSupplement,
  closeSupplement,
  toggleFilterContainer,
  applyFilter,
  resetFilter,
  clearFilters,
  handleSearchDebounced,
  clearSearch,
  onChartDayClick,
  refreshTodayCount,
} from './records.js';
import {
  toggleExportDropdown,
  handleExportOption,
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
import { initAiInsights, populateAiProviders, refreshAiInsight } from './ai-insights.js';
import {
  testCloudConnection,
  uploadToCloud,
  downloadFromCloud,
} from './sync.js';

// ---------- 事件绑定 ----------

function bindEvents() {
  // 添加表单
  document.getElementById('recordForm').addEventListener('submit', handleFormSubmit);
  document.getElementById('location').addEventListener('change', handleLocationChange);
  document.getElementById('supplementToggle').addEventListener('click', toggleSupplement);
  document.querySelectorAll('[data-close-supplement]').forEach(btn => btn.addEventListener('click', closeSupplement));

  // 筛选与搜索
  document.getElementById('filterBtn').addEventListener('click', toggleFilterContainer);
  document.getElementById('applyFilterBtn').addEventListener('click', applyFilter);
  document.getElementById('resetFilterBtn').addEventListener('click', resetFilter);
  document.getElementById('clearFiltersBtn').addEventListener('click', clearFilters);
  // 搜索加 200ms 防抖：否则每敲一个字符都会全量重渲染列表
  document.getElementById('searchInput').addEventListener('input', handleSearchDebounced);
  document.getElementById('clearSearchBtn').addEventListener('click', clearSearch);

  // 数据导入导出 / 备份
  el.exportBtn.addEventListener('click', toggleExportDropdown);
  document.querySelectorAll('.export-opt').forEach(opt => opt.addEventListener('click', handleExportOption));
  document.querySelectorAll('.export-opt').forEach(opt => opt.addEventListener('click', e => e.stopPropagation()));
  document.getElementById('importBtn').addEventListener('click', triggerImport);
  document.getElementById('importFile').addEventListener('change', handleImportFile);
  document.getElementById('backupBtn').addEventListener('click', createManualBackup);
  document.getElementById('restoreBtn').addEventListener('click', openRestoreModal);
  document.getElementById('cancelRestoreBtn').addEventListener('click', closeRestoreModal);
  document.getElementById('restoreModal').addEventListener('click', handleModalOverlayClick);

  // 设置
  document.getElementById('settingsBtn').addEventListener('click', openSettingsModal);
  // 保存后要让统计页的 AI 卡片立刻反映新的开关/配置状态
  document.getElementById('saveSettingsBtn').addEventListener('click', async () => {
    await saveSettings();
    refreshAiInsight();
  });
  document.getElementById('cancelSettingsBtn').addEventListener('click', closeSettingsModal);
  document.getElementById('settingsModal').addEventListener('click', handleModalOverlayClick);
  document.getElementById('clearAllDataBtn').addEventListener('click', clearAllData);

  // 坚果云同步
  document.getElementById('syncTestBtn').addEventListener('click', testCloudConnection);
  document.getElementById('syncUploadBtn').addEventListener('click', uploadToCloud);
  document.getElementById('syncDownloadBtn').addEventListener('click', downloadFromCloud);

  // 图表
  document.getElementById('chartType').addEventListener('change', updateChart);
  document.getElementById('timeRange').addEventListener('change', updateChart);

  // 通用确认模态框
  document.getElementById('confirmCancelBtn').addEventListener('click', closeConfirmModal);
  document.getElementById('confirmOkBtn').addEventListener('click', handleConfirmOk);
  document.getElementById('confirmModal').addEventListener('click', handleModalOverlayClick);

  // 各浮层统一注册关闭函数：遮罩点击与 Esc 都走同一条路径，
  // 避免直接改 classList 导致回调等状态残留
  registerModal(el.settingsModal, closeSettingsModal);
  registerModal(el.restoreModal, closeRestoreModal);
  registerModal(el.confirmModal, closeConfirmModal);

  // Toast 动作按钮（如删除撤销）
  el.toastAction.addEventListener('click', handleToastAction);

  // 一键打卡
  document.getElementById('bigLogBtn').addEventListener('click', quickLog);

  // 键盘快捷键
  document.addEventListener('keydown', handleKeydown);

  // 点击导出下拉菜单外部时收起
  document.addEventListener('click', (e) => {
    if (el.exportMenu && !el.exportMenu.contains(e.target)) {
      el.exportDropdown.classList.add('hidden');
    }
  });
}

/**
 * 快速新建：跳到「打卡」标签页，准备录入
 */
function handleQuickAdd() {
  switchTab(1);
}

/**
 * 全局键盘快捷键
 * - N：切到「打卡」页
 * - 1/2/3：切换标签页
 * - Esc：关闭打开的浮层（输入框聚焦时仅失焦）
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
    // 走各模块自己的关闭函数，保证回调与滚动锁一并复位
    closeSettingsModal();
    closeRestoreModal();
    closeConfirmModal();
    closeSupplement();
  }
}

// ---------- 初始化 ----------

/**
 * 单个初始化步骤失败不应让整页瘫痪（例如图表库没加载上，
 * 不该连带导致标签切换、打卡按钮全部失效）。
 */
function runStep(name, fn) {
  try {
    const result = fn();
    if (result && typeof result.catch === 'function') {
      result.catch(error => console.error(`初始化步骤「${name}」失败：`, error));
    }
    return result;
  } catch (error) {
    console.error(`初始化步骤「${name}」失败：`, error);
    return undefined;
  }
}

async function init() {
  await runStep('加载记录', loadRecords);
  const storageError = getStorageError();

  runStep('缓存 DOM 引用', initDom);
  runStep('设置默认时间', setCurrentTime);
  runStep('绑定事件', bindEvents);
  // 服务商下拉必须先于 loadSettings 建好，否则 loadSettings 赋的 value 会丢失
  runStep('填充 AI 服务商', populateAiProviders);
  await runStep('加载设置', loadSettings);
  runStep('初始化 AI 洞察', initAiInsights);

  // 顺序要紧：默认日期必须先写入输入框并同步筛选提示，
  // 否则首屏显示全部记录、输入框却已埋好「近 7 天」，
  // 用户一搜索就会看到一周前的记录成批消失且没有任何提示。
  runStep('设置默认日期范围', setDefaultDates);
  runStep('渲染记录列表', renderRecords);
  runStep('刷新统计', updateStatistics);
  runStep('刷新今日计数', refreshTodayCount);
  // 事件监听先于图表初始化注册，避免图表初始化失败时联动一起失效
  window.addEventListener('chart-day-click', onChartDayClick);
  runStep('初始化图表', initChart);
  runStep('初始化滑动', initSwipeEvents);
  runStep('切换初始标签页', () => switchTab(state.currentTabIndex));

  if (storageError) {
    showToast(
      '数据加载失败：' + storageError.message + '。已暂停写入以保护原有数据。',
      'error',
      null,
      null,
      9000
    );
  }
}

document.addEventListener('DOMContentLoaded', init);
