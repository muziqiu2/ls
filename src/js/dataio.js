// ==========================================
// 数据导入 / 导出 / 备份 / 恢复（UI 交互层）
// ==========================================
import { el, state } from './state.js';
import { saveRecords, createAutoBackup, loadBackupList } from './storage.js';
import { formatDate, formatTime } from './utils.js';
import { showToast, showConfirmModal, setLayerOpen } from './ui.js';
import { renderRecords, refreshTodayCount } from './records.js';
import { updateStatistics } from './stats.js';
import { updateChart } from './chart.js';

const MAX_IMPORT_BYTES = 20 * 1024 * 1024; // 20MB，超出直接拒绝，避免解析超大文件卡死页面

/**
 * 用 Blob + objectURL 触发下载
 *
 * 不用 data: URI —— 数据量大时 URL 会超出浏览器长度上限并静默失败
 * （用户点了导出没有任何反应）。
 */
function downloadBlob(content, mimeType, fileName) {
  const url = URL.createObjectURL(new Blob([content], { type: mimeType }));
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', fileName);
  document.body.appendChild(link);
  link.click();
  link.remove();
  // 释放内存，稍作延迟以确保下载已开始
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * 导出记录数据为 JSON 文件
 */
export function exportData() {
  if (state.records.length === 0) {
    showToast('没有记录可导出', 'error');
    return;
  }

  const dataStr = JSON.stringify(state.records, null, 2);
  // 文件名用本地日期（toISOString 是 UTC，东八区凌晨会导出成"昨天"）
  downloadBlob(dataStr, 'application/json;charset=utf-8', `poop_records_${formatDate(new Date())}.json`);

  showToast(`成功导出 ${state.records.length} 条记录！`);
}

/**
 * 切换导出下拉菜单显隐
 */
export function toggleExportDropdown() {
  el.exportDropdown.classList.toggle('hidden');
}

/**
 * 收起导出下拉菜单
 */
function closeExportDropdown() {
  el.exportDropdown.classList.add('hidden');
}

/**
 * 根据选择的格式导出数据
 */
export function handleExportOption(e) {
  const format = e.currentTarget.dataset.format;
  closeExportDropdown();
  if (format === 'csv') {
    exportCsv();
  } else {
    exportData();
  }
}

/**
 * 导出记录为 CSV（含 UTF-8 BOM，Excel 可直接打开中文不乱码）
 */
export function exportCsv() {
  if (state.records.length === 0) {
    showToast('没有记录可导出', 'error');
    return;
  }

  const escapeCsv = (value) => {
    const str = value == null ? '' : String(value);
    // 单独的 \r 也要转义，否则在部分解析器里会截断该行
    return /[\r\n",]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
  };

  const header = ['时间', '地点', '类型', '备注'];
  const rows = [...state.records]
    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
    .map(r => [
      new Date(r.timestamp).toLocaleString('zh-CN', { hour12: false }),
      r.location || '',
      r.type || '',
      r.notes || ''
    ].map(escapeCsv).join(','));

  const csv = '\ufeff' + [header.join(','), ...rows].join('\r\n');
  downloadBlob(csv, 'text/csv;charset=utf-8', `poop_records_${formatDate(new Date())}.csv`);

  showToast(`成功导出 ${state.records.length} 条记录！`);
}

/**
 * 触发文件导入（点击隐藏的 file input）
 */
export function triggerImport() {
  el.importFileInput.click();
}

/**
 * 校验单条记录结构是否合法
 */
function isValidRecord(record) {
  if (!record || typeof record !== 'object') return false;
  if (record.id == null) return false;                                  // 兼容旧数据的数字 id 与新数据的 uuid
  if (typeof record.timestamp !== 'string') return false;
  if (typeof record.location !== 'string') return false;
  if (isNaN(new Date(record.timestamp).getTime())) return false;
  if (record.notes !== undefined && typeof record.notes !== 'string') return false;
  // type 之前漏了校验：若是对象，列表里会显示 [object Object]
  if (record.type !== undefined && record.type !== null && typeof record.type !== 'string') return false;
  return true;
}

/**
 * 处理导入文件，读取并校验后合并到现有记录
 */
export function handleImportFile(e) {
  const file = e.target.files[0];
  if (!file) return;

  if (file.size > MAX_IMPORT_BYTES) {
    showToast('文件过大（超过 20MB），已取消导入', 'error');
    el.importFileInput.value = '';
    return;
  }

  const reader = new FileReader();

  reader.onerror = () => {
    showToast('文件读取失败，请重试', 'error');
    el.importFileInput.value = '';
  };

  reader.onload = async (event) => {
    try {
      const importedRecords = JSON.parse(event.target.result);

      if (!Array.isArray(importedRecords)) {
        throw new Error('导入的数据格式不正确，必须是数组');
      }

      const validRecords = importedRecords.filter(isValidRecord);

      if (validRecords.length === 0) {
        throw new Error('导入的数据中没有有效的记录');
      }

      // 合并记录（按 id 去重）
      const existingIds = new Set(state.records.map(r => String(r.id)));
      const newRecords = validRecords.filter(r => !existingIds.has(String(r.id)));

      if (newRecords.length === 0) {
        showToast('没有导入新的记录', 'info');
        return;
      }

      // 合并后按时间倒序，否则会出现「导入的新→旧 + 原有的新→旧」两段时间线
      state.records = [...newRecords, ...state.records]
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      await saveRecords();

      refreshUI();
      showToast(`成功导入 ${newRecords.length} 条记录！`);

    } catch (error) {
      showToast('导入失败：' + error.message, 'error');
    } finally {
      el.importFileInput.value = '';
    }
  };
  reader.readAsText(file);
}

/**
 * 创建手动备份
 *
 * 必须 await 并捕获异常：备份失败却提示"成功"，会让用户误以为自己有兜底。
 */
export async function createManualBackup() {
  try {
    await createAutoBackup();
    showToast('备份创建成功！');
  } catch (error) {
    showToast('备份失败：' + error.message, 'error');
  }
}

/**
 * 打开备份恢复模态框
 */
export async function openRestoreModal() {
  el.restoreModal.classList.remove('hidden');
  setLayerOpen(true);
  await loadBackups();
}

/**
 * 关闭备份恢复模态框
 */
export function closeRestoreModal() {
  if (el.restoreModal.classList.contains('hidden')) return;
  el.restoreModal.classList.add('hidden');
  setLayerOpen(false);
}

/**
 * 加载备份列表并渲染到模态框中
 */
async function loadBackups() {
  let backups = [];

  try {
    backups = await loadBackupList();
  } catch (error) {
    el.backupsList.innerHTML = '';
    const tip = document.createElement('div');
    tip.className = 'text-center text-gray-400 py-6 text-sm';
    tip.textContent = '备份读取失败：' + error.message;
    el.backupsList.appendChild(tip);
    return;
  }

  el.backupsList.innerHTML = '';

  if (backups.length === 0) {
    el.backupsList.appendChild(el.emptyBackupsState);
    el.emptyBackupsState.classList.remove('hidden');
    return;
  }

  el.emptyBackupsState.classList.add('hidden');

  backups.forEach(backup => {
    const backupElement = document.createElement('div');
    backupElement.className = 'record-item cursor-pointer';
    backupElement.dataset.id = backup.id;

    const backupDate = new Date(backup.timestamp);
    const formattedDate = formatDate(backupDate);
    const formattedTime = formatTime(backupDate);
    const recordCount = Array.isArray(backup.records) ? backup.records.length : 0;

    backupElement.innerHTML = `
      <div class="flex justify-between items-center">
        <div>
          <div class="flex items-center">
            <span class="font-bold text-neutral-dark text-base">${formattedDate}</span>
            <span class="text-gray-500 ml-2 text-sm">${formattedTime}</span>
          </div>
          <div class="mt-1 text-gray-500 text-sm">
            <i class="fa-solid fa-file-text mr-1"></i>
            ${recordCount} 条记录
          </div>
        </div>
        <button class="btn-primary btn-sm">
          <i class="fa-solid fa-rotate-right mr-1"></i> 恢复
        </button>
      </div>
    `;

    backupElement.querySelector('button').addEventListener('click', () => {
      restoreFromBackup(backup);
    });

    el.backupsList.appendChild(backupElement);
  });
}

/**
 * 从备份恢复数据
 */
function restoreFromBackup(backup) {
  // 备份来自解密后的 JSON，结构不可信；不校验直接展开会抛错并静默失败
  if (!backup || !Array.isArray(backup.records)) {
    showToast('该备份已损坏，无法恢复', 'error');
    return;
  }

  showConfirmModal({
    title: '确认恢复',
    message: `确定要恢复此备份吗？当前 ${state.records.length} 条记录将被替换为备份中的 ${backup.records.length} 条记录。`,
    icon: 'fa-solid fa-rotate-right',
    iconColor: '#3b82f6',
    danger: false,
    onConfirm: async () => {
      state.records = backup.records.filter(isValidRecord)
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      await saveRecords();

      refreshUI();
      closeRestoreModal();
      showToast(`成功恢复 ${state.records.length} 条记录！`);
    }
  });
}

/**
 * 记录数据变更后刷新列表、统计与图表
 */
function refreshUI() {
  renderRecords();
  updateStatistics();
  updateChart();
  refreshTodayCount();
}
