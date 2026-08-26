// ==========================================
// 数据导入 / 导出 / 备份 / 恢复（UI 交互层）
// ==========================================
import { el, state } from './state.js';
import { saveRecords, createAutoBackup, loadBackupList } from './storage.js';
import { formatDate, formatTime } from './utils.js';
import { showToast, showConfirmModal } from './ui.js';
import { renderRecords } from './records.js';
import { updateStatistics } from './stats.js';
import { updateChart } from './chart.js';

/**
 * 导出记录数据为 JSON 文件
 */
export function exportData() {
  if (state.records.length === 0) {
    showToast('没有记录可导出', 'error');
    return;
  }

  const dataStr = JSON.stringify(state.records, null, 2);
  const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);
  const exportFileDefaultName = `poop_records_${new Date().toISOString().split('T')[0]}.json`;

  const linkElement = document.createElement('a');
  linkElement.setAttribute('href', dataUri);
  linkElement.setAttribute('download', exportFileDefaultName);
  linkElement.click();

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
    return /\n|"|,/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
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
  const dataUri = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
  const exportFileDefaultName = `poop_records_${new Date().toISOString().split('T')[0]}.csv`;

  const linkElement = document.createElement('a');
  linkElement.setAttribute('href', dataUri);
  linkElement.setAttribute('download', exportFileDefaultName);
  linkElement.click();

  showToast(`成功导出 ${state.records.length} 条记录！`);
}

/**
 * 触发文件导入（点击隐藏的 file input）
 */
export function triggerImport() {
  el.importFileInput.click();
}

/**
 * 处理导入文件，读取并校验后合并到现有记录
 */
export function handleImportFile(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async (event) => {
    try {
      const importedRecords = JSON.parse(event.target.result);

      if (!Array.isArray(importedRecords)) {
        throw new Error('导入的数据格式不正确，必须是数组');
      }

      // 校验记录结构
      const validRecords = [];
      for (const record of importedRecords) {
        if (!record || typeof record !== 'object') continue;

        if (typeof record.id !== 'number' ||
          typeof record.timestamp !== 'string' ||
          typeof record.location !== 'string') {
          continue;
        }

        if (isNaN(new Date(record.timestamp).getTime())) continue;

        if (record.notes !== undefined && typeof record.notes !== 'string') continue;

        validRecords.push(record);
      }

      if (validRecords.length === 0) {
        throw new Error('导入的数据中没有有效的记录');
      }

      // 合并记录（避免重复）
      const existingIds = new Set(state.records.map(r => r.id));
      const newRecords = validRecords.filter(r => !existingIds.has(r.id));

      if (newRecords.length === 0) {
        showToast('没有导入新的记录', 'info');
        return;
      }

      state.records = [...newRecords, ...state.records];
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
 */
export function createManualBackup() {
  createAutoBackup();
  showToast('备份创建成功！');
}

/**
 * 打开备份恢复模态框
 */
export async function openRestoreModal() {
  await loadBackups();
  el.restoreModal.classList.remove('hidden');
}

/**
 * 关闭备份恢复模态框
 */
export function closeRestoreModal() {
  el.restoreModal.classList.add('hidden');
}

/**
 * 加载备份列表并渲染到模态框中
 */
async function loadBackups() {
  const backups = await loadBackupList();

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

    backupElement.innerHTML = `
      <div class="flex justify-between items-center">
        <div>
          <div class="flex items-center">
            <span class="font-bold text-neutral-dark text-base">${formattedDate}</span>
            <span class="text-gray-500 ml-2 text-sm">${formattedTime}</span>
          </div>
          <div class="mt-1 text-gray-500 text-sm">
            <i class="fa-solid fa-file-text mr-1"></i>
            ${backup.records.length} 条记录
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
  showConfirmModal({
    title: '确认恢复',
    message: `确定要恢复此备份吗？当前 ${state.records.length} 条记录将被替换为备份中的 ${backup.records.length} 条记录。`,
    icon: 'fa-solid fa-rotate-right',
    iconColor: '#3b82f6',
    danger: false,
    onConfirm: async () => {
      state.records = [...backup.records];
      await saveRecords();

      refreshUI();
      closeRestoreModal();
      showToast(`成功恢复 ${backup.records.length} 条记录！`);
    }
  });
}

/**
 * 记录数据变更后刷新统计与图表
 */
function refreshUI() {
  renderRecords();
  updateStatistics();
  updateChart();
}