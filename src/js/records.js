// ==========================================
// 记录管理：表单、列表渲染、搜索筛选、编辑删除
// ==========================================
import { el, state } from './state.js';
import { saveRecords } from './storage.js';
import { formatDate, formatTime, escapeHtml } from './utils.js';
import { showToast } from './ui.js';
import { updateStatistics } from './stats.js';
import { updateChart } from './chart.js';

// ---------- 表单 ----------

/**
 * 设置时间输入框为当前时间（datetime-local 格式）
 */
export function setCurrentTime() {
  const now = new Date();
  el.recordTimeInput.value = now.toISOString().slice(0, 16);
}

/**
 * 处理地点选择变化，显示/隐藏自定义地点输入框
 */
export function handleLocationChange() {
  if (el.locationSelect.value === '其他') {
    el.otherLocationContainer.classList.remove('hidden');
  } else {
    el.otherLocationContainer.classList.add('hidden');
  }
}

/**
 * 表单验证
 * @returns {{isValid: boolean, message: string}}
 */
function validateForm() {
  if (el.recordTimeInput.value) {
    const inputDate = new Date(el.recordTimeInput.value);
    const now = new Date();

    if (isNaN(inputDate.getTime())) {
      return { isValid: false, message: '请输入有效的时间' };
    }
    if (inputDate > now) {
      return { isValid: false, message: '时间不能设置为未来' };
    }
  }

  if (el.locationSelect.value === '其他') {
    const otherLocation = el.otherLocationInput.value.trim();
    if (!otherLocation) {
      return { isValid: false, message: '请输入其他地点名称' };
    }
    if (otherLocation.length > 50) {
      return { isValid: false, message: '地点名称不能超过50个字符' };
    }
  }

  return { isValid: true, message: '' };
}

/**
 * 重置表单为默认值
 */
function resetForm() {
  setCurrentTime();
  el.locationSelect.value = '家里';
  el.typeSelect.value = '';
  el.notesInput.value = '';
  el.otherLocationInput.value = '';
  el.otherLocationContainer.classList.add('hidden');
}

/**
 * 显示提交成功动画
 */
function showSuccessAnimation() {
  const submitBtn = el.recordForm.querySelector('button[type="submit"]');
  const originalText = submitBtn.innerHTML;
  submitBtn.innerHTML = '<i class="fa-solid fa-check mr-2"></i> 成功！';
  submitBtn.classList.add('bg-green-500');

  setTimeout(() => {
    submitBtn.innerHTML = originalText;
    submitBtn.classList.remove('bg-green-500');
  }, 1500);
}

/**
 * 处理表单提交，添加新记录
 */
export async function handleFormSubmit(e) {
  e.preventDefault();

  const validationResult = validateForm();
  if (!validationResult.isValid) {
    showToast(validationResult.message, 'error');
    return;
  }

  const location = el.locationSelect.value === '其他'
    ? el.otherLocationInput.value.trim() || '其他'
    : el.locationSelect.value;
  const type = el.typeSelect.value;
  const notes = el.notesInput.value.trim();

  let recordTime;
  if (el.recordTimeInput.value) {
    recordTime = new Date(el.recordTimeInput.value).toISOString();
  } else {
    recordTime = new Date().toISOString();
  }

  const newRecord = { id: Date.now(), timestamp: recordTime, location, type, notes };

  state.records.unshift(newRecord);
  await saveRecords();

  resetForm();
  refreshAfterDataChange();
  showSuccessAnimation();
}

// ---------- 搜索 / 筛选 ----------

export function toggleFilterContainer() {
  el.filterContainer.classList.toggle('hidden');
}

export function applyFilter() {
  renderRecords();
  el.filterContainer.classList.add('hidden');
  updateActiveFilters();
}

export function resetFilter() {
  el.startDateInput.value = '';
  el.endDateInput.value = '';
  renderRecords();
  updateActiveFilters();
}

export function handleSearch() {
  const searchTerm = el.searchInput.value.trim();

  if (searchTerm) {
    el.clearSearchBtn.classList.remove('hidden');
  } else {
    el.clearSearchBtn.classList.add('hidden');
  }

  renderRecords();
}

export function clearSearch() {
  el.searchInput.value = '';
  el.clearSearchBtn.classList.add('hidden');
  renderRecords();
}

export function clearFilters() {
  el.startDateInput.value = '';
  el.endDateInput.value = '';
  renderRecords();
  updateActiveFilters();
}

function updateActiveFilters() {
  const startDate = el.startDateInput.value;
  const endDate = el.endDateInput.value;

  if (startDate || endDate) {
    el.activeFilters.classList.remove('hidden');

    let filterString = '';
    if (startDate && endDate) filterString = `${startDate} 至 ${endDate}`;
    else if (startDate) filterString = `从 ${startDate} 开始`;
    else if (endDate) filterString = `到 ${endDate} 结束`;

    el.filterText.textContent = filterString;
  } else {
    el.activeFilters.classList.add('hidden');
  }
}

/**
 * 设置默认日期范围（结束为今天，开始为一周前）
 */
export function setDefaultDates() {
  el.endDateInput.value = new Date().toISOString().split('T')[0];

  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
  el.startDateInput.value = oneWeekAgo.toISOString().split('T')[0];
}

// ---------- 列表渲染 ----------

/**
 * 渲染记录列表（依据筛选与搜索条件）
 */
export function renderRecords() {
  const startDate = el.startDateInput.value ? new Date(el.startDateInput.value) : null;
  const endDate = el.endDateInput.value ? new Date(el.endDateInput.value) : null;
  const searchTerm = el.searchInput.value.trim().toLowerCase();

  const filteredRecords = state.records.filter(record => {
    const recordDate = new Date(record.timestamp);
    recordDate.setHours(0, 0, 0, 0);

    const matchesStart = !startDate || recordDate >= startDate;
    const matchesEnd = !endDate || recordDate <= endDate;
    const matchesSearch = !searchTerm ||
      record.location.toLowerCase().includes(searchTerm) ||
      (record.notes && record.notes.toLowerCase().includes(searchTerm)) ||
      (record.type && record.type.toLowerCase().includes(searchTerm));

    return matchesStart && matchesEnd && matchesSearch;
  });

  // 空状态
  if (filteredRecords.length === 0) {
    el.recordsList.innerHTML = '';
    el.emptyState.classList.remove('hidden');
    el.recordsList.appendChild(el.emptyState);
    return;
  }

  el.emptyState.classList.add('hidden');

  // 增量更新：移除不再需要的记录
  const newRecordIds = new Set(filteredRecords.map(record => record.id));
  const recordElements = el.recordsList.querySelectorAll('.record-item');
  recordElements.forEach(element => {
    const recordId = parseInt(element.dataset.id);
    if (!newRecordIds.has(recordId)) {
      element.remove();
    }
  });

  // 更新或添加记录
  filteredRecords.forEach((record, index) => {
    let recordElement = el.recordsList.querySelector(`[data-id="${record.id}"]`);

    if (recordElement) {
      recordElement.replaceWith(createRecordElement(record));
    } else {
      const newRecordElement = createRecordElement(record);
      const nextRecord = filteredRecords[index + 1];
      if (nextRecord) {
        const nextElement = el.recordsList.querySelector(`[data-id="${nextRecord.id}"]`);
        if (nextElement) {
          el.recordsList.insertBefore(newRecordElement, nextElement);
        } else {
          el.recordsList.appendChild(newRecordElement);
        }
      } else {
        el.recordsList.appendChild(newRecordElement);
      }
    }
  });
}

/**
 * 创建单个记录 DOM 元素
 * @param {Object} record 记录对象
 * @returns {HTMLElement}
 */
function createRecordElement(record) {
  const recordDate = new Date(record.timestamp);
  const formattedDate = formatDate(recordDate);
  const formattedTime = formatTime(recordDate);

  const recordElement = document.createElement('div');
  recordElement.className = 'record-item';
  recordElement.dataset.id = record.id;
  recordElement.innerHTML = `
    <div class="flex justify-between items-start">
      <div>
        <div class="flex items-center">
          <span class="font-bold text-neutral-dark text-lg">${formattedDate}</span>
          <span class="text-gray-500 ml-2 text-base">${formattedTime}</span>
        </div>
        <div class="mt-2 flex items-center">
          <i class="fa-solid fa-map-marker text-secondary mr-2 text-lg"></i>
          <span class="text-lg">${escapeHtml(record.location)}</span>
        </div>
        ${record.type ? `
          <div class="mt-2 flex items-center">
            <i class="fa-solid fa-tag text-accent mr-2 text-lg"></i>
            <span class="text-lg">${escapeHtml(record.type)}</span>
          </div>
        ` : ''}
        ${record.notes ? `
          <div class="mt-2 flex items-start">
            <i class="fa-solid fa-comment text-gray-400 mr-2 mt-1 text-lg"></i>
            <span class="text-gray-600 text-base">${escapeHtml(record.notes)}</span>
          </div>
        ` : ''}
      </div>
      <div class="flex space-x-2">
        <button class="edit-btn text-gray-400 hover:text-primary transition-colors p-2 rounded-full hover:bg-gray-100" data-id="${record.id}">
          <i class="fa-solid fa-pencil text-xl"></i>
        </button>
        <button class="delete-btn text-gray-400 hover:text-danger transition-colors p-2 rounded-full hover:bg-gray-100" data-id="${record.id}">
          <i class="fa-solid fa-trash text-xl"></i>
        </button>
      </div>
    </div>
  `;

  recordElement.querySelector('.edit-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    state.currentEditRecordId = parseInt(e.currentTarget.dataset.id);
    openEditModal();
  });

  recordElement.querySelector('.delete-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    state.currentRecordId = parseInt(e.currentTarget.dataset.id);

    const record = state.records.find(r => r.id === state.currentRecordId);
    if (record) {
      const recordDate = new Date(record.timestamp);
      el.deleteRecordInfo.innerHTML = `
        <div class="flex items-center mb-2">
          <span class="font-bold text-neutral-dark text-base">${formatDate(recordDate)}</span>
          <span class="text-gray-500 ml-2 text-sm">${formatTime(recordDate)}</span>
        </div>
        <div class="flex items-center mb-2">
          <i class="fa-solid fa-map-marker text-secondary mr-2 text-sm"></i>
          <span class="text-sm">${escapeHtml(record.location)}</span>
        </div>
        ${record.notes ? `
          <div class="flex items-start">
            <i class="fa-solid fa-comment text-gray-400 mr-2 mt-0.5 text-sm"></i>
            <span class="text-gray-600 text-sm">${escapeHtml(record.notes)}</span>
          </div>
        ` : ''}
      `;
    } else {
      el.deleteRecordInfo.innerHTML = '<p class="text-gray-600 text-sm">无法获取记录信息</p>';
    }

    el.deleteModal.classList.remove('hidden');
  });

  return recordElement;
}

// ---------- 编辑记录 ----------

export function openEditModal() {
  const record = state.records.find(r => r.id === state.currentEditRecordId);
  if (!record) return;

  const recordDate = new Date(record.timestamp);
  el.editTimeInput.value = recordDate.toISOString().slice(0, 16);

  const presetLocations = ['家里', '公司', '学校', '公共场所', '其他'];
  if (presetLocations.includes(record.location)) {
    el.editLocation.value = record.location;
    el.editOtherLocationContainer.classList.add('hidden');
    el.editOtherLocationInput.value = '';
  } else {
    el.editLocation.value = '其他';
    el.editOtherLocationContainer.classList.remove('hidden');
    el.editOtherLocationInput.value = record.location;
  }

  el.editType.value = record.type || '';
  el.editNotes.value = record.notes || '';

  el.editModal.classList.remove('hidden');
}

export async function handleEditSubmit(e) {
  e.preventDefault();

  const location = el.editLocation.value === '其他'
    ? el.editOtherLocationInput.value.trim() || '其他'
    : el.editLocation.value;
  const type = el.editType.value;
  const notes = el.editNotes.value.trim();

  let updatedTime;
  if (el.editTimeInput.value) {
    updatedTime = new Date(el.editTimeInput.value).toISOString();
  } else {
    updatedTime = state.records.find(r => r.id === state.currentEditRecordId).timestamp;
  }

  const recordIndex = state.records.findIndex(r => r.id === state.currentEditRecordId);
  if (recordIndex !== -1) {
    state.records[recordIndex] = {
      ...state.records[recordIndex],
      timestamp: updatedTime,
      location,
      type,
      notes
    };

    await saveRecords();
    refreshAfterDataChange();

    el.editModal.classList.add('hidden');
    state.currentEditRecordId = null;
    showToast('记录已成功更新！');
  }
}

export function cancelEdit() {
  el.editModal.classList.add('hidden');
  state.currentEditRecordId = null;
}

export function handleEditLocationChange() {
  if (el.editLocation.value === '其他') {
    el.editOtherLocationContainer.classList.remove('hidden');
  } else {
    el.editOtherLocationContainer.classList.add('hidden');
  }
}

// ---------- 删除记录 ----------

export function cancelDelete() {
  el.deleteModal.classList.add('hidden');
  state.currentRecordId = null;
}

export async function confirmDelete() {
  if (state.currentRecordId === null) return;

  state.records = state.records.filter(record => record.id !== state.currentRecordId);
  await saveRecords();
  refreshAfterDataChange();

  el.deleteModal.classList.add('hidden');
  state.currentRecordId = null;
}

// ---------- 内部辅助 ----------

/**
 * 数据变更后刷新列表、统计与图表
 */
function refreshAfterDataChange() {
  renderRecords();
  updateStatistics();
  updateChart();
}