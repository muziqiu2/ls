// ==========================================
// 设置（主题 + 提示开关 + 云同步配置）与数据清空
// ==========================================
import { el, state } from './state.js';
import { encrypt, decrypt } from './crypto.js';
import { showToast, showConfirmModal, setLayerOpen } from './ui.js';
import { saveRecords, clearStoredBackups, resetStorageError } from './storage.js';
import { renderRecords } from './records.js';
import { updateStatistics } from './stats.js';
import { updateChart, applyChartTheme } from './chart.js';

const SETTINGS_KEY = 'poopSettings';

const DEFAULT_SETTINGS = {
  theme: 'light',
  notifications: { add: true, edit: true },
  sync: { server: '', username: '', appPassword: '', passphrase: '' }
};

function createDefaults() {
  return {
    theme: DEFAULT_SETTINGS.theme,
    notifications: { ...DEFAULT_SETTINGS.notifications },
    sync: { ...DEFAULT_SETTINGS.sync },
  };
}

// 模块级缓存：加载设置后写入，供同步逻辑读取
let currentSettings = createDefaults();

// 主题对应的状态栏颜色，随主题切换
const THEME_COLOR = { light: '#f0fdf4', dark: '#1f2937' };

/**
 * 获取当前设置（同步等模块使用）
 */
export function getSettings() {
  return currentSettings;
}

/**
 * 打开设置模态框
 */
export function openSettingsModal() {
  loadSettings();
  el.settingsModal.classList.remove('hidden');
  setLayerOpen(true);
}

/**
 * 关闭设置模态框
 */
export function closeSettingsModal() {
  if (el.settingsModal.classList.contains('hidden')) return;
  el.settingsModal.classList.add('hidden');
  setLayerOpen(false);
}

/**
 * 保存用户设置
 */
export async function saveSettings() {
  // 单选组可能一个都没选中（例如 HTML 初始未勾选且加载失败），
  // 直接取 .value 会抛 TypeError，导致「点了没反应」。
  const checkedTheme = document.querySelector('input[name="theme"]:checked');

  const settings = {
    theme: checkedTheme ? checkedTheme.value : currentSettings.theme,
    notifications: {
      add: el.notificationAdd ? el.notificationAdd.checked : true,
      edit: el.notificationEdit ? el.notificationEdit.checked : true,
    },
    sync: {
      server: el.syncServer.value.trim(),
      username: el.syncUsername.value.trim(),
      appPassword: el.syncAppPassword.value.trim(),
      passphrase: el.syncPassphrase.value.trim()
    }
  };

  currentSettings = settings;
  state.notifications = { ...settings.notifications };

  try {
    const encryptedSettings = await encrypt(JSON.stringify(settings));
    localStorage.setItem(SETTINGS_KEY, encryptedSettings);
  } catch (error) {
    showToast('设置保存失败：' + error.message, 'error');
    return;
  }

  applyTheme(settings.theme);
  showToast('设置已保存！');
  closeSettingsModal();
}

/**
 * 加载用户设置
 */
export async function loadSettings() {
  let settings = createDefaults();

  try {
    const encryptedSettings = localStorage.getItem(SETTINGS_KEY);
    if (encryptedSettings) {
      const decryptedSettings = await decrypt(encryptedSettings);
      const parsed = JSON.parse(decryptedSettings);
      settings = {
        ...settings,
        ...parsed,
        notifications: { ...settings.notifications, ...(parsed.notifications || {}) },
        sync: { ...settings.sync, ...(parsed.sync || {}) }
      };
    }
  } catch (error) {
    // 设置损坏不应导致整页初始化中断（图表、事件绑定都还在后面）
    console.error('设置加载失败，使用默认值：', error);
    settings = createDefaults();
  }

  currentSettings = settings;
  state.notifications = { ...settings.notifications };

  applyTheme(settings.theme);

  el.themeRadios.forEach(radio => {
    radio.checked = radio.value === settings.theme;
  });

  if (el.notificationAdd) el.notificationAdd.checked = settings.notifications.add;
  if (el.notificationEdit) el.notificationEdit.checked = settings.notifications.edit;

  // 坚果云同步配置
  el.syncServer.value = settings.sync.server;
  el.syncUsername.value = settings.sync.username;
  el.syncAppPassword.value = settings.sync.appPassword;
  el.syncPassphrase.value = settings.sync.passphrase;
}

/**
 * 应用主题
 * @param {string} theme - light | dark | auto
 */
export function applyTheme(theme) {
  document.body.classList.remove('dark', 'light');

  let isDark;
  if (theme === 'dark') {
    isDark = true;
  } else if (theme === 'light') {
    isDark = false;
  } else {
    // 跟随系统主题
    isDark = !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  }

  document.body.classList.add(isDark ? 'dark' : 'light');
  document.body.style.backgroundColor = isDark ? '#1f2937' : '#f0f9ff';
  document.body.style.color = isDark ? '#f9fafb' : '#1f2937';

  // body 上的 Tailwind 渐变是 background-image，只改 background-color 盖不住，
  // 深色下会残留浅绿渐变导致标题看不清 —— 这里显式清掉。
  document.body.style.backgroundImage = isDark ? 'none' : '';

  // 状态栏颜色跟随主题（否则深色模式下状态栏仍是浅绿）
  const themeColorMeta = document.querySelector('meta[name="theme-color"]');
  if (themeColorMeta) {
    themeColorMeta.setAttribute('content', isDark ? THEME_COLOR.dark : THEME_COLOR.light);
  }

  // 图表的图例 / 刻度 / 网格画在 canvas 里，CSS 的 .dark 规则管不到它们，
  // 必须显式重绘，否则深色下仍是默认 #666（约 1.8:1）。
  applyChartTheme();
}

/**
 * 清空所有数据（记录 + 备份）
 */
export function clearAllData() {
  showConfirmModal({
    title: '确认清空',
    message: '您确定要清空所有数据吗？此操作无法撤销！',
    icon: 'fa-solid fa-trash',
    iconColor: '#ef4444',
    danger: true,
    onConfirm: async () => {
      state.records = [];
      // 清空是用户对「数据读不出来」的最终处置手段，需要先解除写入封锁
      resetStorageError();
      await saveRecords();
      await clearStoredBackups();

      renderRecords();
      updateStatistics();
      updateChart();
      showToast('所有数据已清空！');
    }
  });
}
