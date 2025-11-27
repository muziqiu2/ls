// ==========================================
// 拉屎记录器 (Bowel Movement Recorder) - 主脚本文件
// ==========================================

// ------------------------------------------
// 全局变量定义
// ------------------------------------------
// 记录列表，从本地存储加载或初始化为空数组
let records = [];
try {
    const encryptedRecords = localStorage.getItem('poopRecords');
    if (encryptedRecords) {
        // 尝试解密数据
        const decryptedRecords = decrypt(encryptedRecords);
        records = JSON.parse(decryptedRecords);
    }
} catch (error) {
    // 如果解密失败，可能是旧版本未加密的数据，尝试直接解析
    try {
        records = JSON.parse(localStorage.getItem('poopRecords')) || [];
        // 将旧数据转换为加密格式
        saveRecords();
    } catch (e) {
        records = [];
    }
}
// 当前选中的记录ID（用于删除操作）
let currentRecordId = null;
// 当前编辑的记录ID
let currentEditRecordId = null;
// 趋势图表实例
let trendChart = null;
// 当前选中的标签页索引
let currentTabIndex = 0;
// 滑动开始X坐标（用于触摸滑动）
let startX = 0;
// 是否正在滑动
let isScrolling = false;

// ------------------------------------------
// DOM元素引用
// ------------------------------------------
// 表单相关元素
let recordForm, recordTimeInput, locationSelect, otherLocationContainer, otherLocationInput, typeSelect, notesInput;
// 记录列表相关元素
let recordsList, emptyState, filterBtn, filterContainer, startDateInput, endDateInput;
let applyFilterBtn, resetFilterBtn, activeFilters, filterText, clearFiltersBtn;
// 搜索相关元素
let searchInput, clearSearchBtn;
// 数据导入导出相关元素
let exportBtn, importBtn, importFileInput, backupBtn;
// 删除模态框相关元素
let deleteModal, deleteRecordInfo, cancelDeleteBtn, confirmDeleteBtn;
// 提示组件相关元素
let toast, toastIcon, toastText;
// 统计信息相关元素
let avgIntervalElement, weeklyCountElement, commonLocationElement;
// 标签页和滑动相关元素
let tabBtns, swipeContainer, swipeWrapper, swipeCards;
// 编辑模态框相关元素
let editModal, editForm, editTimeInput, editLocation, editOtherLocationContainer, editOtherLocationInput, editType, editNotes;
let cancelEditBtn;
// 设置相关元素
let settingsBtn, settingsModal, themeRadios, notificationAdd, notificationDelete, notificationEdit;
let clearAllDataBtn, saveSettingsBtn, cancelSettingsBtn;
// 图表设置相关元素
let chartTypeSelect, timeRangeSelect;

// ------------------------------------------
// 初始化函数
// ------------------------------------------
/**
 * 应用初始化函数，在页面加载完成后调用
 * 负责初始化DOM元素、绑定事件、初始化UI等
 */
function init() {
    // 初始化DOM元素引用
    initDOM();
    
    // 设置时间输入框为当前时间
    setCurrentTime();
    
    // 绑定事件监听器
    bindEvents();
    
    // 加载用户设置
    loadSettings();
    
    // 初始化UI组件
    renderRecords();        // 渲染记录列表
    updateStatistics();     // 更新统计信息
    initChart();            // 初始化趋势图表
    initSwipeEvents();      // 初始化滑动事件
    
    // 设置默认日期范围
    setDefaultDates();
}

// ------------------------------------------
// DOM元素初始化
// ------------------------------------------
/**
 * 初始化DOM元素引用，将HTML元素与JavaScript变量关联
 */
function initDOM() {
    // 表单相关元素
    recordForm = document.getElementById('recordForm');
    recordTimeInput = document.getElementById('recordTime');
    locationSelect = document.getElementById('location');
    otherLocationContainer = document.getElementById('otherLocationContainer');
    otherLocationInput = document.getElementById('otherLocation');
    typeSelect = document.getElementById('type');
    notesInput = document.getElementById('notes');
    
    // 记录列表相关元素
    recordsList = document.getElementById('recordsList');
    emptyState = document.getElementById('emptyState');
    filterBtn = document.getElementById('filterBtn');
    filterContainer = document.getElementById('filterContainer');
    startDateInput = document.getElementById('startDate');
    endDateInput = document.getElementById('endDate');
    applyFilterBtn = document.getElementById('applyFilterBtn');
    resetFilterBtn = document.getElementById('resetFilterBtn');
    activeFilters = document.getElementById('activeFilters');
    filterText = document.getElementById('filterText');
    clearFiltersBtn = document.getElementById('clearFiltersBtn');
    
    // 搜索相关元素
    searchInput = document.getElementById('searchInput');
    clearSearchBtn = document.getElementById('clearSearchBtn');
    
    // 数据导入导出相关元素
    exportBtn = document.getElementById('exportBtn');
    importBtn = document.getElementById('importBtn');
    importFileInput = document.getElementById('importFile');
    backupBtn = document.getElementById('backupBtn');
    
    // 删除模态框相关元素
    deleteModal = document.getElementById('deleteModal');
    deleteRecordInfo = document.getElementById('deleteRecordInfo');
    cancelDeleteBtn = document.getElementById('cancelDeleteBtn');
    confirmDeleteBtn = document.getElementById('confirmDeleteBtn');
    
    // 提示组件相关元素
    toast = document.getElementById('toast');
    toastIcon = document.getElementById('toastIcon');
    toastText = document.getElementById('toastText');
    
    // 统计信息相关元素
    avgIntervalElement = document.getElementById('avgInterval');
    weeklyCountElement = document.getElementById('weeklyCount');
    commonLocationElement = document.getElementById('commonLocation');
    
    // 标签页和滑动相关元素
    tabBtns = document.querySelectorAll('.tab-btn');
    swipeContainer = document.querySelector('.swipe-container');
    swipeWrapper = document.querySelector('.swipe-wrapper');
    swipeCards = document.querySelectorAll('.swipe-card');
    
    // 编辑模态框相关元素
    editModal = document.getElementById('editModal');
    editForm = document.getElementById('editForm');
    editTimeInput = document.getElementById('editTime');
    editLocation = document.getElementById('editLocation');
    editOtherLocationContainer = document.getElementById('editOtherLocationContainer');
    editOtherLocationInput = document.getElementById('editOtherLocation');
    editType = document.getElementById('editType');
    editNotes = document.getElementById('editNotes');
    cancelEditBtn = document.getElementById('cancelEditBtn');
    
    // 设置相关元素
    settingsBtn = document.getElementById('settingsBtn');
    settingsModal = document.getElementById('settingsModal');
    themeRadios = document.querySelectorAll('input[name="theme"]');
    notificationAdd = document.getElementById('notificationAdd');
    notificationDelete = document.getElementById('notificationDelete');
    notificationEdit = document.getElementById('notificationEdit');
    clearAllDataBtn = document.getElementById('clearAllDataBtn');
    saveSettingsBtn = document.getElementById('saveSettingsBtn');
    cancelSettingsBtn = document.getElementById('cancelSettingsBtn');
    
    // 图表设置相关元素
    chartTypeSelect = document.getElementById('chartType');
    timeRangeSelect = document.getElementById('timeRange');
}

// ------------------------------------------
// 事件绑定
// ------------------------------------------
/**
 * 绑定所有事件监听器，将用户交互与相应的处理函数关联
 */
function bindEvents() {
    // 表单提交事件 - 添加新记录
    recordForm.addEventListener('submit', handleFormSubmit);
    
    // 地点选择事件 - 显示/隐藏其他地点输入框
    locationSelect.addEventListener('change', handleLocationChange);
    
    // 筛选按钮点击事件 - 显示/隐藏筛选容器
    filterBtn.addEventListener('click', toggleFilterContainer);
    
    // 应用筛选按钮点击事件 - 应用日期筛选
    applyFilterBtn.addEventListener('click', applyFilter);
    
    // 重置筛选按钮点击事件 - 重置筛选条件
    resetFilterBtn.addEventListener('click', resetFilter);
    
    // 清除筛选按钮点击事件 - 清除当前筛选
    clearFiltersBtn.addEventListener('click', clearFilters);
    
    // 搜索输入事件 - 实时搜索
    searchInput.addEventListener('input', handleSearch);
    
    // 清除搜索按钮点击事件 - 清除搜索条件
    clearSearchBtn.addEventListener('click', clearSearch);
    
    // 导出按钮点击事件 - 导出记录数据
    exportBtn.addEventListener('click', exportData);
    
    // 导入按钮点击事件 - 触发文件选择
    importBtn.addEventListener('click', triggerImport);
    
    // 导入文件变化事件 - 处理导入数据
    importFileInput.addEventListener('change', handleImportFile);
    
    // 备份按钮点击事件 - 手动创建备份
    backupBtn.addEventListener('click', createManualBackup);
    
    // 取消删除按钮点击事件 - 关闭删除模态框
    cancelDeleteBtn.addEventListener('click', cancelDelete);
    
    // 确认删除按钮点击事件 - 删除选中记录
    confirmDeleteBtn.addEventListener('click', confirmDelete);
    
    // 编辑表单提交事件 - 保存编辑后的记录
    editForm.addEventListener('submit', handleEditSubmit);
    
    // 取消编辑按钮点击事件 - 关闭编辑模态框
    cancelEditBtn.addEventListener('click', cancelEdit);
    
    // 编辑地点选择事件 - 显示/隐藏编辑时的其他地点输入框
    editLocation.addEventListener('change', handleEditLocationChange);
    
    // 设置按钮点击事件 - 打开设置模态框
    settingsBtn.addEventListener('click', openSettingsModal);
    
    // 保存设置按钮点击事件 - 保存用户设置
    saveSettingsBtn.addEventListener('click', saveSettings);
    
    // 取消设置按钮点击事件 - 关闭设置模态框
    cancelSettingsBtn.addEventListener('click', closeSettingsModal);
    
    // 清空所有数据按钮点击事件 - 清空所有记录
    clearAllDataBtn.addEventListener('click', clearAllData);
    
    // 图表类型选择事件 - 切换图表类型
    chartTypeSelect.addEventListener('change', updateChart);
    
    // 时间范围选择事件 - 切换时间范围
    timeRangeSelect.addEventListener('change', updateChart);
}

// ------------------------------------------
// 日期处理
// ------------------------------------------
/**
 * 设置默认日期范围
 * 结束日期设为今天，开始日期设为一周前
 */
function setDefaultDates() {
    // 设置默认日期为今天
    const today = new Date().toISOString().split('T')[0];
    endDateInput.value = today;
    
    // 设置开始日期为一周前
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    startDateInput.value = oneWeekAgo.toISOString().split('T')[0];
}

// ------------------------------------------
// 滑动事件处理
// ------------------------------------------
/**
 * 初始化滑动事件
 * 绑定标签按钮点击事件、触摸事件和鼠标事件（用于测试）
 */
function initSwipeEvents() {
    // 标签按钮点击事件
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const index = parseInt(btn.dataset.index);
            switchTab(index);
        });
    });

    // 触摸事件 - 用于移动端滑动
    swipeContainer.addEventListener('touchstart', handleTouchStart, false);
    swipeContainer.addEventListener('touchmove', handleTouchMove, false);
    swipeContainer.addEventListener('touchend', handleTouchEnd, false);

    // 鼠标事件 - 用于桌面端测试
    swipeContainer.addEventListener('mousedown', handleMouseDown, false);
    swipeContainer.addEventListener('mousemove', handleMouseMove, false);
    swipeContainer.addEventListener('mouseup', handleMouseUp, false);
    swipeContainer.addEventListener('mouseleave', handleMouseUp, false);
}

/**
 * 处理触摸开始事件
 * @param {TouchEvent} e - 触摸事件对象
 */
function handleTouchStart(e) {
    // 只处理单点触摸
    if (e.touches.length > 1) {
        startX = null;
        return;
    }
    
    startX = e.touches[0].clientX;
    isScrolling = false;
    swipeWrapper.style.transition = 'none';
}

/**
 * 处理触摸移动事件
 * @param {TouchEvent} e - 触摸事件对象
 */
function handleTouchMove(e) {
    if (!startX || e.touches.length > 1) return;

    const currentX = e.touches[0].clientX;
    const diffX = startX - currentX;
    
    // 判断是否为水平滑动
    if (Math.abs(diffX) > 5) {
        isScrolling = true;
        
        // 计算滑动距离，实时更新滑动容器位置
        const translateValue = -currentTabIndex * 100 + (diffX / swipeContainer.offsetWidth * 100);
        swipeWrapper.style.transform = `translateX(${translateValue}%)`;
        
        // 阻止默认行为，防止页面滚动
        e.preventDefault();
    }
}

/**
 * 处理触摸结束事件
 * @param {TouchEvent} e - 触摸事件对象
 */
function handleTouchEnd(e) {
    if (!startX || !isScrolling) {
        startX = null;
        return;
    }

    const currentX = e.changedTouches[0].clientX;
    const diffX = startX - currentX;
    const containerWidth = swipeContainer.offsetWidth;
    
    // 判断是否切换标签（滑动距离超过容器宽度的15%或滑动速度超过阈值）
    const swipeThreshold = containerWidth * 0.15;
    
    if (Math.abs(diffX) > swipeThreshold) {
        if (diffX > 0 && currentTabIndex < swipeCards.length - 1) {
            // 向右滑动，显示下一个标签
            switchTab(currentTabIndex + 1);
        } else if (diffX < 0 && currentTabIndex > 0) {
            // 向左滑动，显示上一个标签
            switchTab(currentTabIndex - 1);
        } else {
            // 滑动距离不足，恢复原位
            switchTab(currentTabIndex);
        }
    } else {
        // 滑动距离不足，恢复原位
        switchTab(currentTabIndex);
    }

    startX = null;
    isScrolling = false;
}

/**
 * 处理鼠标按下事件（用于测试）
 * @param {MouseEvent} e - 鼠标事件对象
 */
function handleMouseDown(e) {
    startX = e.clientX;
    isScrolling = false;
    swipeWrapper.style.transition = 'none';
    swipeContainer.style.cursor = 'grabbing';
}

/**
 * 处理鼠标移动事件（用于测试）
 * @param {MouseEvent} e - 鼠标事件对象
 */
function handleMouseMove(e) {
    if (!startX) return;

    const currentX = e.clientX;
    const diffX = startX - currentX;
    
    // 判断是否为滑动操作（移动距离超过10px）
    if (Math.abs(diffX) > 10) {
        isScrolling = true;
        
        // 计算滑动距离，实时更新滑动容器位置
        const translateValue = -currentTabIndex * 100 + (diffX / swipeContainer.offsetWidth * 100);
        swipeWrapper.style.transform = `translateX(${translateValue}%)`;
    }
}

/**
 * 处理鼠标释放事件（用于测试）
 * @param {MouseEvent} e - 鼠标事件对象
 */
function handleMouseUp(e) {
    if (!startX || !isScrolling) {
        startX = 0;
        swipeContainer.style.cursor = 'grab';
        return;
    }

    const currentX = e.clientX;
    const diffX = startX - currentX;
    
    // 判断是否切换标签（滑动距离超过容器宽度的20%）
    if (Math.abs(diffX) > swipeContainer.offsetWidth * 0.2) {
        if (diffX > 0 && currentTabIndex < swipeCards.length - 1) {
            // 向右滑动，显示下一个标签
            switchTab(currentTabIndex + 1);
        } else if (diffX < 0 && currentTabIndex > 0) {
            // 向左滑动，显示上一个标签
            switchTab(currentTabIndex - 1);
        } else {
            // 滑动距离不足，恢复原位
            switchTab(currentTabIndex);
        }
    } else {
        // 滑动距离不足，恢复原位
        switchTab(currentTabIndex);
    }

    startX = 0;
    isScrolling = false;
    swipeContainer.style.cursor = 'grab';
}

/**
 * 切换标签页
 * @param {number} index - 目标标签页索引
 */
function switchTab(index) {
    if (index < 0 || index >= swipeCards.length) return;
    
    currentTabIndex = index;
    
    // 更新滑动容器位置
    swipeWrapper.style.transition = 'transform 0.3s ease';
    swipeWrapper.style.transform = `translateX(-${index * 100}%)`;
    
    // 更新标签按钮样式和指示器
    tabBtns.forEach((btn, i) => {
        const indicator = btn.querySelector('.tab-indicator');
        
        // 先移除所有可能的颜色类
        indicator.classList.remove('bg-primary', 'bg-secondary', 'bg-accent');
        
        if (i === index) {
            btn.classList.remove('text-gray-500');
            indicator.classList.add('w-full');
            
            // 设置对应颜色
            if (i === 0) indicator.classList.add('bg-primary');
            else if (i === 1) indicator.classList.add('bg-secondary');
            else if (i === 2) indicator.classList.add('bg-accent');
        } else {
            btn.classList.add('text-gray-500');
            indicator.classList.remove('w-full');
        }
    });
}

// ------------------------------------------
// 记录管理功能
// ------------------------------------------
/**
 * 处理地点选择变化
 * 当选择"其他"时显示自定义地点输入框
 */
function handleLocationChange() {
    if (locationSelect.value === '其他') {
        otherLocationContainer.classList.remove('hidden');
    } else {
        otherLocationContainer.classList.add('hidden');
    }
}

/**
 * 处理表单提交事件，添加新记录
 * @param {SubmitEvent} e - 表单提交事件对象
 */
function handleFormSubmit(e) {
    e.preventDefault();
    
    // 获取表单数据
    const location = locationSelect.value === '其他' 
        ? otherLocationInput.value.trim() || '其他'
        : locationSelect.value;
    const type = typeSelect.value;
    const notes = notesInput.value.trim();
    
    // 获取时间，使用用户选择的时间或当前时间
    let recordTime;
    if (recordTimeInput.value) {
        recordTime = new Date(recordTimeInput.value).toISOString();
    } else {
        recordTime = new Date().toISOString();
    }
    
    // 创建新记录
    const newRecord = {
        id: Date.now(), // 使用时间戳作为唯一ID
        timestamp: recordTime, // 保存完整时间戳
        location,
        type,
        notes
    };
    
    // 添加到记录列表（添加到开头）
    records.unshift(newRecord);
    
    // 保存到本地存储
    saveRecords();
    
    // 重置表单
    resetForm();
    
    // 更新UI
    renderRecords();
    updateStatistics();
    updateChart();
    
    // 显示成功动画
    showSuccessAnimation();
}

/**
 * 设置时间输入框为当前时间
 */
function setCurrentTime() {
    // 获取当前时间并转换为datetime-local格式（YYYY-MM-DDTHH:MM）
    const now = new Date();
    const localDateTime = now.toISOString().slice(0, 16);
    recordTimeInput.value = localDateTime;
}

/**
 * 重置表单
 * 恢复默认值并隐藏其他地点输入框
 */
function resetForm() {
    // 设置时间输入框为当前时间
    setCurrentTime();
    // 重置地点选择
    locationSelect.value = '家里';
    // 重置类型选择
    typeSelect.value = '';
    // 清空备注
    notesInput.value = '';
    // 清空其他地点输入框并隐藏
    otherLocationInput.value = '';
    otherLocationContainer.classList.add('hidden');
}

/**
 * 显示成功动画
 * 临时改变提交按钮的文本和颜色
 */
function showSuccessAnimation() {
    const submitBtn = recordForm.querySelector('button[type="submit"]');
    const originalText = submitBtn.innerHTML;
    submitBtn.innerHTML = '<i class="fa-solid fa-check mr-2"></i> 成功！';
    submitBtn.classList.add('bg-green-500');
    
    // 1.5秒后恢复原状
    setTimeout(() => {
        submitBtn.innerHTML = originalText;
        submitBtn.classList.remove('bg-green-500');
    }, 1500);
}

// ------------------------------------------
// 筛选功能
// ------------------------------------------
/**
 * 切换筛选容器的显示/隐藏状态
 */
function toggleFilterContainer() {
    filterContainer.classList.toggle('hidden');
}

/**
 * 应用筛选条件
 * 重新渲染记录列表并更新筛选条件显示
 */
function applyFilter() {
    renderRecords();
    filterContainer.classList.add('hidden');
    updateActiveFilters();
}

/**
 * 更新筛选条件显示
 * 显示当前应用的筛选条件或隐藏筛选条件栏
 */
function updateActiveFilters() {
    const startDate = startDateInput.value;
    const endDate = endDateInput.value;
    
    if (startDate || endDate) {
        // 显示筛选条件
        activeFilters.classList.remove('hidden');
        
        let filterString = '';
        if (startDate && endDate) {
            filterString = `${startDate} 至 ${endDate}`;
        } else if (startDate) {
            filterString = `从 ${startDate} 开始`;
        } else if (endDate) {
            filterString = `到 ${endDate} 结束`;
        }
        
        filterText.textContent = filterString;
    } else {
        // 隐藏筛选条件
        activeFilters.classList.add('hidden');
    }
}

/**
 * 重置筛选条件
 * 清空日期输入并重新渲染记录列表
 */
function resetFilter() {
    startDateInput.value = '';
    endDateInput.value = '';
    renderRecords();
    updateActiveFilters();
}

/**
 * 处理搜索输入
 * 实时更新搜索结果
 */
function handleSearch() {
    const searchTerm = searchInput.value.trim();
    
    // 显示/隐藏清除搜索按钮
    if (searchTerm) {
        clearSearchBtn.classList.remove('hidden');
    } else {
        clearSearchBtn.classList.add('hidden');
    }
    
    // 重新渲染记录列表
    renderRecords();
}

/**
 * 清除搜索条件
 * 清空搜索输入并重新渲染记录列表
 */
function clearSearch() {
    searchInput.value = '';
    clearSearchBtn.classList.add('hidden');
    renderRecords();
}

/**
 * 清除筛选条件
 * 清空日期输入并重新渲染记录列表
 */
function clearFilters() {
    startDateInput.value = '';
    endDateInput.value = '';
    renderRecords();
    updateActiveFilters();
}

// ------------------------------------------
// 数据导入导出
// ------------------------------------------
/**
 * 导出记录数据
 * 将记录列表导出为JSON文件
 */
function exportData() {
    if (records.length === 0) {
        showToast('没有记录可导出', 'error');
        return;
    }
    
    // 将记录转换为JSON字符串
    const dataStr = JSON.stringify(records, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
    
    // 生成文件名
    const exportFileDefaultName = `poop_records_${new Date().toISOString().split('T')[0]}.json`;
    
    // 创建下载链接并触发下载
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
    
    // 显示导出成功提示
    showToast(`成功导出 ${records.length} 条记录！`);
}

/**
 * 触发文件导入
 * 点击隐藏的文件输入框
 */
function triggerImport() {
    importFileInput.click();
}

/**
 * 处理导入文件
 * 读取并验证导入的JSON文件，然后合并到现有记录中
 * @param {Event} e - 文件输入变化事件
 */
function handleImportFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (event) => {
        try {
            const importedRecords = JSON.parse(event.target.result);
            
            // 验证导入的数据格式
            if (!Array.isArray(importedRecords)) {
                throw new Error('导入的数据格式不正确，必须是数组');
            }
            
            // 验证每个记录的结构
            const validRecords = [];
            for (const record of importedRecords) {
                // 检查必要字段
                if (!record || typeof record !== 'object') {
                    continue; // 跳过无效记录
                }
                
                // 验证必要字段
                if (typeof record.id !== 'number' || 
                    typeof record.timestamp !== 'string' || 
                    typeof record.location !== 'string') {
                    continue; // 跳过缺少必要字段或字段类型不正确的记录
                }
                
                // 验证timestamp格式
                const timestampDate = new Date(record.timestamp);
                if (isNaN(timestampDate.getTime())) {
                    continue; // 跳过无效的时间戳
                }
                
                // 验证notes字段（可选）
                if (record.notes !== undefined && typeof record.notes !== 'string') {
                    continue; // 跳过notes字段类型不正确的记录
                }
                
                validRecords.push(record);
            }
            
            if (validRecords.length === 0) {
                throw new Error('导入的数据中没有有效的记录');
            }
            
            // 合并记录（避免重复）
            const existingIds = new Set(records.map(record => record.id));
            const newRecords = validRecords.filter(record => !existingIds.has(record.id));
            
            if (newRecords.length === 0) {
                showToast('没有导入新的记录', 'info');
                return;
            }
            
            // 添加新记录到开头
            records = [...newRecords, ...records];
            saveRecords();
            
            // 更新UI
            renderRecords();
            updateStatistics();
            updateChart();
            
            // 显示导入成功提示
            showToast(`成功导入 ${newRecords.length} 条记录！`);
            
        } catch (error) {
            showToast('导入失败：' + error.message, 'error');
        } finally {
            // 重置文件输入
            importFileInput.value = '';
        }
    };
    reader.readAsText(file);
}

// ------------------------------------------
// 数据备份和恢复功能
// ------------------------------------------
/**
 * 创建自动备份
 * 在每次数据修改时自动创建备份
 */
function createAutoBackup() {
    // 获取现有备份（支持解密）
    let backups = [];
    try {
        const encryptedBackups = localStorage.getItem('poopBackups');
        if (encryptedBackups) {
            const decryptedBackups = decrypt(encryptedBackups);
            backups = JSON.parse(decryptedBackups);
        }
    } catch (error) {
        // 如果解密失败，可能是旧版本未加密的数据，尝试直接解析
        try {
            backups = JSON.parse(localStorage.getItem('poopBackups')) || [];
        } catch (e) {
            backups = [];
        }
    }
    
    // 创建新备份
    const backup = {
        id: Date.now(),
        timestamp: new Date().toISOString(),
        records: [...records] // 深拷贝当前记录
    };
    
    // 添加到备份列表开头
    backups.unshift(backup);
    
    // 限制备份数量（最多保存10个备份）
    if (backups.length > 10) {
        backups.splice(10);
    }
    
    // 序列化并加密备份数据
    const serializedBackups = JSON.stringify(backups);
    const encryptedBackups = encrypt(serializedBackups);
    
    // 保存备份
    localStorage.setItem('poopBackups', encryptedBackups);
}

/**
 * 创建手动备份
 * 允许用户手动创建备份
 */
function createManualBackup() {
    createAutoBackup();
    showToast('备份创建成功！');
}

/**
 * 保存记录到本地存储
 * 将记录列表序列化并加密后保存到localStorage
 * 优化：添加自动备份功能
 */
function saveRecords() {
    // 序列化并加密数据
    const serializedRecords = JSON.stringify(records);
    const encryptedRecords = encrypt(serializedRecords);
    localStorage.setItem('poopRecords', encryptedRecords);
    // 创建自动备份
    createAutoBackup();
}

// ------------------------------------------
// 删除记录功能
// ------------------------------------------
/**
 * 取消删除操作
 * 关闭删除模态框并重置当前记录ID
 */
function cancelDelete() {
    deleteModal.classList.add('hidden');
    currentRecordId = null;
}

/**
 * 确认删除记录
 * 从记录列表中删除当前选中的记录
 */
function confirmDelete() {
    if (currentRecordId !== null) {
        // 过滤掉要删除的记录
        records = records.filter(record => record.id !== currentRecordId);
        saveRecords();
        
        // 更新UI
        renderRecords();
        updateStatistics();
        updateChart();
        
        // 关闭模态框
        deleteModal.classList.add('hidden');
        currentRecordId = null;
    }
}

// ------------------------------------------
// 记录列表渲染
// ------------------------------------------
/**
 * 渲染记录列表
 * 根据筛选条件和搜索条件过滤记录并渲染到页面上
 * 优化：仅更新变化的记录，减少DOM操作
 */
function renderRecords() {
    // 获取筛选日期
    const startDate = startDateInput.value ? new Date(startDateInput.value) : null;
    const endDate = endDateInput.value ? new Date(endDateInput.value) : null;
    // 获取搜索词
    const searchTerm = searchInput.value.trim().toLowerCase();
    
    // 筛选记录
    let filteredRecords = records.filter(record => {
        // 日期筛选
        const recordDate = new Date(record.timestamp);
        recordDate.setHours(0, 0, 0, 0);
        
        const matchesStart = !startDate || recordDate >= startDate;
        const matchesEnd = !endDate || recordDate <= endDate;
        
        // 搜索筛选
        const matchesSearch = !searchTerm || 
            record.location.toLowerCase().includes(searchTerm) || 
            (record.notes && record.notes.toLowerCase().includes(searchTerm)) || 
            (record.type && record.type.toLowerCase().includes(searchTerm));
        
        return matchesStart && matchesEnd && matchesSearch;
    });
    
    // 显示空状态或记录
    if (filteredRecords.length === 0) {
        // 清空列表
        recordsList.innerHTML = '';
        emptyState.classList.remove('hidden');
        recordsList.appendChild(emptyState);
        return;
    }
    
    emptyState.classList.add('hidden');
    
    // 优化：仅更新变化的记录
    const existingRecordIds = new Set();
    const newRecordIds = new Set(filteredRecords.map(record => record.id));
    
    // 1. 移除不再需要的记录
    const recordElements = recordsList.querySelectorAll('.record-item');
    recordElements.forEach(element => {
        const recordId = parseInt(element.dataset.id);
        existingRecordIds.add(recordId);
        
        if (!newRecordIds.has(recordId)) {
            element.remove();
        }
    });
    
    // 2. 更新或添加记录
    filteredRecords.forEach((record, index) => {
        const recordId = record.id;
        let recordElement = recordsList.querySelector(`[data-id="${recordId}"]`);
        
        if (recordElement) {
            // 更新现有记录
            const newRecordElement = createRecordElement(record);
            recordElement.replaceWith(newRecordElement);
        } else {
            // 添加新记录
            const newRecordElement = createRecordElement(record);
            // 找到插入位置
            const nextRecord = filteredRecords[index + 1];
            if (nextRecord) {
                const nextElement = recordsList.querySelector(`[data-id="${nextRecord.id}"]`);
                if (nextElement) {
                    recordsList.insertBefore(newRecordElement, nextElement);
                } else {
                    recordsList.appendChild(newRecordElement);
                }
            } else {
                recordsList.appendChild(newRecordElement);
            }
        }
    });
}

/**
 * 创建记录元素
 * 根据记录数据创建HTML元素
 * @param {Object} record - 记录对象
 * @returns {HTMLElement} - 记录HTML元素
 */
function createRecordElement(record) {
    // 格式化日期和时间
    const recordDate = new Date(record.timestamp);
    const formattedDate = formatDate(recordDate);
    const formattedTime = formatTime(recordDate);
    
    // 创建记录元素
    const recordElement = document.createElement('div');
    recordElement.className = 'record-item';
    recordElement.dataset.id = record.id; // 添加唯一ID，用于定位和更新
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
    
    // 添加编辑按钮事件
    const editBtn = recordElement.querySelector('.edit-btn');
    editBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        currentEditRecordId = parseInt(e.currentTarget.dataset.id);
        openEditModal();
    });
    
    // 添加删除按钮事件
    const deleteBtn = recordElement.querySelector('.delete-btn');
    deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        currentRecordId = parseInt(e.currentTarget.dataset.id);
        
        // 显示被删除记录的信息
        const record = records.find(r => r.id === currentRecordId);
        if (record) {
            const recordDate = new Date(record.timestamp);
            const formattedDate = formatDate(recordDate);
            const formattedTime = formatTime(recordDate);
            
            deleteRecordInfo.innerHTML = `
                <div class="flex items-center mb-2">
                    <span class="font-bold text-neutral-dark text-base">${formattedDate}</span>
                    <span class="text-gray-500 ml-2 text-sm">${formattedTime}</span>
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
            deleteRecordInfo.innerHTML = '<p class="text-gray-600 text-sm">无法获取记录信息</p>';
        }
        
        deleteModal.classList.remove('hidden');
    });
    
    return recordElement;
}

/**
 * 保存记录到本地存储
 * 将记录列表序列化并保存到localStorage
 */
function saveRecords() {
    localStorage.setItem('poopRecords', JSON.stringify(records));
}

// ------------------------------------------
// 统计信息更新
// ------------------------------------------
/**
 * 更新统计信息
 * 计算并显示平均间隔、本周次数和常用地点
 */
function updateStatistics() {
    if (records.length === 0) {
        // 没有记录时显示默认值
        avgIntervalElement.innerHTML = '<span class="text-gray-400">--</span>';
        weeklyCountElement.innerHTML = '<span class="text-gray-400">--</span>';
        commonLocationElement.innerHTML = '<span class="text-gray-400">--</span>';
        return;
    }
    
    // 计算平均间隔（仅当有2条以上记录时）
    if (records.length > 1) {
        // 按时间排序
        const sortedRecords = [...records].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
        
        // 计算间隔总和
        let totalInterval = 0;
        for (let i = 1; i < sortedRecords.length; i++) {
            const prevTime = new Date(sortedRecords[i-1].timestamp).getTime();
            const currTime = new Date(sortedRecords[i].timestamp).getTime();
            totalInterval += (currTime - prevTime) / (1000 * 60 * 60); // 转换为小时
        }
        
        const avgInterval = totalInterval / (sortedRecords.length - 1);
        avgIntervalElement.textContent = avgInterval.toFixed(1);
    } else {
        avgIntervalElement.textContent = '--';
    }
    
    // 计算本周次数
    const today = new Date();
    const weekStart = new Date(today);
    // 调整为周一作为本周第一天
    const dayOfWeek = today.getDay();
    const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek; // 如果是周日，减去6天得到周一；否则减去(dayOfWeek-1)天
    weekStart.setDate(today.getDate() + diff);
    weekStart.setHours(0, 0, 0, 0);
    
    const weeklyRecords = records.filter(record => {
        const recordDate = new Date(record.timestamp);
        return recordDate >= weekStart;
    });
    
    weeklyCountElement.textContent = weeklyRecords.length;
    
    // 计算常用地点
    const locationCounts = {};
    records.forEach(record => {
        const location = record.location;
        locationCounts[location] = (locationCounts[location] || 0) + 1;
    });
    
    let maxCount = 0;
    let commonLocation = '--';
    
    for (const location in locationCounts) {
        if (locationCounts[location] > maxCount) {
            maxCount = locationCounts[location];
            commonLocation = location;
        }
    }
    
    commonLocationElement.textContent = commonLocation;
}

// ------------------------------------------
// 图表功能
// ------------------------------------------
/**
 * 初始化图表
 * 创建Chart.js实例并设置初始配置
 */
function initChart() {
    const ctx = document.getElementById('trendChart').getContext('2d');
    
    trendChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: '排便次数',
                data: [],
                backgroundColor: 'rgba(74, 222, 128, 0.2)',
                borderColor: 'rgba(74, 222, 128, 1)',
                borderWidth: 2,
                pointBackgroundColor: 'rgba(74, 222, 128, 1)',
                pointRadius: 4,
                tension: 0.3,
                fill: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: true,
                    position: 'top'
                },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    callbacks: {
                        title: function(tooltipItems) {
                            return tooltipItems[0].label;
                        },
                        label: function(context) {
                            return `排便次数: ${context.raw}`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: {
                        display: false // 隐藏X轴网格线
                    }
                },
                y: {
                    beginAtZero: true,
                    ticks: {
                        stepSize: 1 // Y轴刻度间隔为1
                    }
                }
            }
        }
    });
    
    // 初始更新图表数据
    updateChart();
}

/**
 * 更新图表
 * 根据选择的图表类型和时间范围动态生成图表数据
 */
function updateChart() {
    if (records.length === 0) {
        // 没有记录时清空图表
        trendChart.data.labels = [];
        trendChart.data.datasets = [];
        trendChart.update();
        return;
    }
    
    // 获取用户选择的图表类型和时间范围
    const chartType = chartTypeSelect.value;
    const timeRange = timeRangeSelect.value;
    
    // 根据时间范围确定开始日期
    const today = new Date();
    let startDate = null;
    
    if (timeRange !== 'all') {
        startDate = new Date(today);
        startDate.setDate(today.getDate() - parseInt(timeRange) + 1);
        startDate.setHours(0, 0, 0, 0);
    }
    
    // 过滤记录
    const filteredRecords = startDate 
        ? records.filter(record => new Date(record.timestamp) >= startDate)
        : records;
    
    // 根据图表类型生成不同的数据格式
    if (chartType === 'line' || chartType === 'bar') {
        // 生成折线图或柱状图数据
        generateLineBarChartData(filteredRecords, chartType);
    } else if (chartType === 'pie') {
        // 生成饼图数据（按地点统计）
        generatePieChartData(filteredRecords);
    }
    
    // 更新图表类型
    trendChart.config.type = chartType;
    
    // 更新图表
    trendChart.update();
}

/**
 * 生成折线图或柱状图数据
 * @param {Array} records - 过滤后的记录数组
 * @param {string} chartType - 图表类型（line或bar）
 */
function generateLineBarChartData(records, chartType) {
    // 按日期分组统计
    const dateCounts = {};
    const labels = [];
    const counts = [];
    
    // 初始化日期范围
    const today = new Date();
    const timeRange = timeRangeSelect.value;
    let startDate = null;
    
    if (timeRange !== 'all') {
        startDate = new Date(today);
        startDate.setDate(today.getDate() - parseInt(timeRange) + 1);
        startDate.setHours(0, 0, 0, 0);
    } else {
        // 如果是全部记录，找到最早的记录日期
        startDate = new Date(Math.min(...records.map(r => new Date(r.timestamp))));
        startDate.setHours(0, 0, 0, 0);
    }
    
    // 生成日期标签和初始化计数
    const currentDate = new Date(startDate);
    while (currentDate <= today) {
        const dateStr = formatDateShort(currentDate);
        labels.push(dateStr);
        dateCounts[dateStr] = 0;
        
        // 增加一天
        currentDate.setDate(currentDate.getDate() + 1);
    }
    
    // 统计每天的排便次数
    records.forEach(record => {
        const recordDate = new Date(record.timestamp);
        const dateStr = formatDateShort(recordDate);
        if (dateCounts.hasOwnProperty(dateStr)) {
            dateCounts[dateStr]++;
        }
    });
    
    // 转换为数组格式
    for (const dateStr of labels) {
        counts.push(dateCounts[dateStr]);
    }
    
    // 设置图表数据
    trendChart.data.labels = labels;
    trendChart.data.datasets = [{
        label: '排便次数',
        data: counts,
        backgroundColor: chartType === 'line' ? 'rgba(74, 222, 128, 0.2)' : 'rgba(74, 222, 128, 0.6)',
        borderColor: 'rgba(74, 222, 128, 1)',
        borderWidth: 2,
        pointBackgroundColor: 'rgba(74, 222, 128, 1)',
        pointRadius: 4,
        tension: chartType === 'line' ? 0.3 : 0,
        fill: chartType === 'line' ? true : false
    }];
    
    // 更新图表配置
    trendChart.options.plugins.tooltip.callbacks.label = function(context) {
        return `排便次数: ${context.raw}`;
    };
    
    // 显示Y轴（折线图和柱状图需要）
    trendChart.options.scales = {
        x: {
            grid: {
                display: false
            }
        },
        y: {
            beginAtZero: true,
            ticks: {
                stepSize: 1
            }
        }
    };
}

/**
 * 生成饼图数据（按地点统计）
 * @param {Array} records - 过滤后的记录数组
 */
function generatePieChartData(records) {
    // 按地点分组统计
    const locationCounts = {};
    
    records.forEach(record => {
        const location = record.location;
        locationCounts[location] = (locationCounts[location] || 0) + 1;
    });
    
    // 转换为数组格式
    const labels = Object.keys(locationCounts);
    const counts = Object.values(locationCounts);
    
    // 生成随机颜色
    const colors = generateRandomColors(labels.length);
    
    // 设置图表数据
    trendChart.data.labels = labels;
    trendChart.data.datasets = [{
        label: '排便地点分布',
        data: counts,
        backgroundColor: colors.map(color => color + '80'), // 添加透明度
        borderColor: colors,
        borderWidth: 1
    }];
    
    // 更新图表配置
    trendChart.options.plugins.tooltip.callbacks.label = function(context) {
        const total = counts.reduce((sum, count) => sum + count, 0);
        const percentage = ((context.raw / total) * 100).toFixed(1);
        return `${context.label}: ${context.raw}次 (${percentage}%)`;
    };
    
    // 隐藏Y轴（饼图不需要）
    trendChart.options.scales = {
        x: {
            display: false
        },
        y: {
            display: false
        }
    };
}

/**
 * 生成随机颜色数组
 * @param {number} count - 需要生成的颜色数量
 * @returns {Array} - 随机颜色数组
 */
function generateRandomColors(count) {
    const colors = [
        '#4ade80', // 绿色
        '#60a5fa', // 蓝色
        '#fbbf24', // 黄色
        '#f472b6', // 粉色
        '#a78bfa', // 紫色
        '#fb923c', // 橙色
        '#ef4444', // 红色
        '#06b6d4', // 青色
        '#84cc16', // 浅绿色
        '#ec4899'  // 玫红色
    ];
    
    // 如果需要的颜色数量超过预定义颜色，生成随机颜色
    while (colors.length < count) {
        const randomColor = '#' + Math.floor(Math.random()*16777215).toString(16);
        colors.push(randomColor);
    }
    
    return colors.slice(0, count);
}

// ------------------------------------------
// 提示功能
// ------------------------------------------
/**
 * 显示通用提示
 * @param {string} message - 提示信息
 * @param {string} type - 提示类型：success, error, info
 */
function showToast(message, type = 'success') {
    // 设置提示内容
    toastText.textContent = message;
    
    // 设置图标和背景颜色
    if (type === 'success') {
        toastIcon.className = 'fa-solid fa-check-circle';
        toast.style.backgroundColor = '#10b981'; // 绿色
    } else if (type === 'error') {
        toastIcon.className = 'fa-solid fa-exclamation-circle';
        toast.style.backgroundColor = '#ef4444'; // 红色
    } else if (type === 'info') {
        toastIcon.className = 'fa-solid fa-info-circle';
        toast.style.backgroundColor = '#3b82f6'; // 蓝色
    }
    
    // 显示提示
    toast.classList.remove('translate-y-20', 'opacity-0');
    
    // 3秒后隐藏提示
    setTimeout(() => {
        toast.classList.add('translate-y-20', 'opacity-0');
    }, 3000);
}

// ------------------------------------------
// 辅助函数
// ------------------------------------------
/**
 * 简单的加密函数（基于异或算法）
 * @param {string} text - 要加密的文本
 * @returns {string} - 加密后的文本
 */
function encrypt(text) {
    // 使用固定密钥进行加密
    const key = 'poop_recorder_secret_key';
    let result = '';
    for (let i = 0; i < text.length; i++) {
        result += String.fromCharCode(text.charCodeAt(i) ^ key.charCodeAt(i % key.length));
    }
    // 将结果转换为Base64，以便在localStorage中安全存储
    return btoa(result);
}

/**
 * 简单的解密函数（基于异或算法）
 * @param {string} encryptedText - 要解密的文本
 * @returns {string} - 解密后的文本
 */
function decrypt(encryptedText) {
    // 使用固定密钥进行解密
    const key = 'poop_recorder_secret_key';
    let result = '';
    // 先从Base64转换回原始加密文本
    const text = atob(encryptedText);
    for (let i = 0; i < text.length; i++) {
        result += String.fromCharCode(text.charCodeAt(i) ^ key.charCodeAt(i % key.length));
    }
    return result;
}

/**
 * 格式化日期（完整格式）
 * @param {Date} date - 日期对象
 * @returns {string} - 格式化后的日期字符串（YYYY-MM-DD）
 */
function formatDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    
    return `${year}-${month}-${day}`;
}

/**
 * 格式化日期（简短格式）
 * @param {Date} date - 日期对象
 * @returns {string} - 格式化后的日期字符串（MM-DD）
 */
function formatDateShort(date) {
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    
    return `${month}-${day}`;
}

/**
 * HTML转义函数，防止XSS攻击
 * @param {string} text - 要转义的文本
 * @returns {string} - 转义后的文本
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * 格式化时间
 * @param {Date} date - 日期对象
 * @returns {string} - 格式化后的时间字符串（HH:MM）
 */
function formatTime(date) {
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    
    return `${hours}:${minutes}`;
}

// ------------------------------------------
// 编辑记录功能
// ------------------------------------------
/**
 * 打开编辑模态框
 * 填充表单数据并显示编辑模态框
 */
function openEditModal() {
    const record = records.find(r => r.id === currentEditRecordId);
    if (!record) return;
    
    // 填充表单数据
    // 设置时间
    const recordDate = new Date(record.timestamp);
    // 转换为datetime-local格式（YYYY-MM-DDTHH:MM）
    const localDateTime = recordDate.toISOString().slice(0, 16);
    editTimeInput.value = localDateTime;
    
    // 检查地点是否为预设选项
    const presetLocations = ['家里', '公司', '学校', '公共场所', '其他'];
    if (presetLocations.includes(record.location)) {
        editLocation.value = record.location;
        editOtherLocationContainer.classList.add('hidden');
        editOtherLocationInput.value = '';
    } else {
        editLocation.value = '其他';
        editOtherLocationContainer.classList.remove('hidden');
        editOtherLocationInput.value = record.location;
    }
    
    // 设置类型
    editType.value = record.type || '';
    
    // 设置备注
    editNotes.value = record.notes || '';
    
    // 显示编辑模态框
    editModal.classList.remove('hidden');
}

/**
 * 处理编辑表单提交
 * 更新记录并保存到本地存储
 * @param {SubmitEvent} e - 表单提交事件
 */
function handleEditSubmit(e) {
    e.preventDefault();
    
    // 获取表单数据
    const location = editLocation.value === '其他' 
        ? editOtherLocationInput.value.trim() || '其他'
        : editLocation.value;
    const type = editType.value;
    const notes = editNotes.value.trim();
    
    // 获取编辑后的时间
    let updatedTime;
    if (editTimeInput.value) {
        updatedTime = new Date(editTimeInput.value).toISOString();
    } else {
        updatedTime = records.find(r => r.id === currentEditRecordId).timestamp;
    }
    
    // 更新记录
    const recordIndex = records.findIndex(r => r.id === currentEditRecordId);
    if (recordIndex !== -1) {
        records[recordIndex] = {
            ...records[recordIndex],
            timestamp: updatedTime,
            location,
            type,
            notes
        };
        
        // 保存到本地存储
        saveRecords();
        
        // 更新UI
        renderRecords();
        updateStatistics();
        updateChart();
        
        // 关闭编辑模态框
        editModal.classList.add('hidden');
        currentEditRecordId = null;
        
        // 显示成功提示
        showToast('记录已成功更新！');
    }
}

/**
 * 取消编辑操作
 * 关闭编辑模态框并重置当前编辑记录ID
 */
function cancelEdit() {
    editModal.classList.add('hidden');
    currentEditRecordId = null;
}

/**
 * 处理编辑地点选择变化
 * 显示/隐藏编辑时的其他地点输入框
 */
function handleEditLocationChange() {
    if (editLocation.value === '其他') {
        editOtherLocationContainer.classList.remove('hidden');
    } else {
        editOtherLocationContainer.classList.add('hidden');
    }
}

// ------------------------------------------
// 设置功能
// ------------------------------------------
/**
 * 打开设置模态框
 * 加载当前设置并显示设置模态框
 */
function openSettingsModal() {
    // 加载当前设置
    loadSettings();
    // 显示设置模态框
    settingsModal.classList.remove('hidden');
}

/**
 * 关闭设置模态框
 */
function closeSettingsModal() {
    settingsModal.classList.add('hidden');
}

/**
 * 保存用户设置
 */
function saveSettings() {
    // 获取主题设置
    const theme = document.querySelector('input[name="theme"]:checked').value;
    
    // 获取通知设置
    const notifications = {
        add: notificationAdd.checked,
        delete: notificationDelete.checked,
        edit: notificationEdit.checked
    };
    
    // 创建设置对象
    const settings = {
        theme,
        notifications
    };
    
    // 加密并保存设置
    const serializedSettings = JSON.stringify(settings);
    const encryptedSettings = encrypt(serializedSettings);
    localStorage.setItem('poopSettings', encryptedSettings);
    
    // 应用设置
    applyTheme(theme);
    
    // 显示成功提示
    showToast('设置已保存！');
    
    // 关闭设置模态框
    closeSettingsModal();
}

/**
 * 加载用户设置
 */
function loadSettings() {
    let settings = {
        theme: 'light',
        notifications: {
            add: true,
            delete: true,
            edit: true
        }
    };
    
    try {
        // 尝试从本地存储加载设置
        const encryptedSettings = localStorage.getItem('poopSettings');
        if (encryptedSettings) {
            const decryptedSettings = decrypt(encryptedSettings);
            settings = JSON.parse(decryptedSettings);
        }
    } catch (error) {
        // 如果加载失败，使用默认设置
        console.error('Failed to load settings:', error);
    }
    
    // 应用主题设置
    applyTheme(settings.theme);
    
    // 更新主题单选按钮
    themeRadios.forEach(radio => {
        radio.checked = radio.value === settings.theme;
    });
    
    // 更新通知设置
    notificationAdd.checked = settings.notifications.add;
    notificationDelete.checked = settings.notifications.delete;
    notificationEdit.checked = settings.notifications.edit;
}

/**
 * 应用主题
 * @param {string} theme - 主题名称：light, dark, auto
 */
function applyTheme(theme) {
    // 移除所有主题类
    document.body.classList.remove('dark', 'light');
    
    if (theme === 'dark') {
        // 应用深色主题
        document.body.classList.add('dark');
        document.body.style.backgroundColor = '#1f2937';
        document.body.style.color = '#f9fafb';
    } else if (theme === 'light') {
        // 应用浅色主题
        document.body.classList.add('light');
        document.body.style.backgroundColor = '#f0f9ff';
        document.body.style.color = '#1f2937';
    } else {
        // 跟随系统主题
        if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
            document.body.classList.add('dark');
            document.body.style.backgroundColor = '#1f2937';
            document.body.style.color = '#f9fafb';
        } else {
            document.body.classList.add('light');
            document.body.style.backgroundColor = '#f0f9ff';
            document.body.style.color = '#1f2937';
        }
    }
}

/**
 * 清空所有数据
 * 删除所有记录和备份
 */
function clearAllData() {
    if (confirm('您确定要清空所有数据吗？此操作无法撤销！')) {
        // 清空记录
        records = [];
        saveRecords();
        
        // 清空备份
        localStorage.removeItem('poopBackups');
        
        // 更新UI
        renderRecords();
        updateStatistics();
        updateChart();
        
        // 显示成功提示
        showToast('所有数据已清空！');
    }
}

// ------------------------------------------
// 页面初始化
// ------------------------------------------
/**
 * 页面加载完成后初始化应用
 */
document.addEventListener('DOMContentLoaded', init);