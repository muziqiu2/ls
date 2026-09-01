// ==========================================
// 设置（主题 + 通知）与数据清空
// ==========================================
import { el, state } from './state.js';
import { encrypt, decrypt } from './crypto.js';
import { showToast, showConfirmModal } from './ui.js';
import { saveRecords, clearStoredBackups } from './storage.js';
import { renderRecords } from './records.js';
import { updateStatistics } from './stats.js';
import { updateChart } from './chart.js';

const SETTINGS_KEY = 'poopSettings';

const DEFAULT_SETTINGS = {
  theme: 'light',
  notifications: { add: true, delete: true, edit: true },
  sync: { server: '', username: '', appPassword: '', passphrase: '' }
};

// 模块级缓存：加载设置后写入，供同步逻辑读取
let currentSettings = { ...DEFAULT_SETTINGS, notifications: { ...DEFAULT_SETTINGS.notifications }, sync: { ...DEFAULT_SETTINGS.sync } };

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
}

/**
 * 关闭设置模态框
 */
export function closeSettingsModal() {
  el.settingsModal.classList.add('hidden');
}

/**
 * 保存用户设置
 */
export async function saveSettings() {
  const theme = document.querySelector('input[name="theme"]:checked').value;

  const settings = {
    theme,
    notifications: {
      add: el.notificationAdd.checked,
      delete: el.notificationDelete.checked,
      edit: el.notificationEdit.checked
    },
    sync: {
      server: el.syncServer.value.trim(),
      username: el.syncUsername.value.trim(),
      appPassword: el.syncAppPassword.value.trim(),
      passphrase: el.syncPassphrase.value.trim()
    }
  };

  currentSettings = settings;

  const encryptedSettings = await encrypt(JSON.stringify(settings));
  localStorage.setItem(SETTINGS_KEY, encryptedSettings);

  applyTheme(theme);
  showToast('设置已保存！');
  closeSettingsModal();
}

/**
 * 加载用户设置
 */
export async function loadSettings() {
  let settings = { ...DEFAULT_SETTINGS, notifications: { ...DEFAULT_SETTINGS.notifications }, sync: { ...DEFAULT_SETTINGS.sync } };

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
    console.error('Failed to load settings:', error);
  }

  currentSettings = settings;

  applyTheme(settings.theme);

  el.themeRadios.forEach(radio => {
    radio.checked = radio.value === settings.theme;
  });

  el.notificationAdd.checked = settings.notifications.add;
  el.notificationDelete.checked = settings.notifications.delete;
  el.notificationEdit.checked = settings.notifications.edit;

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

  if (theme === 'dark') {
    document.body.classList.add('dark');
    document.body.style.backgroundColor = '#1f2937';
    document.body.style.color = '#f9fafb';
  } else if (theme === 'light') {
    document.body.classList.add('light');
    document.body.style.backgroundColor = '#f0f9ff';
    document.body.style.color = '#1f2937';
  } else {
    // 跟随系统主题
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.body.classList.add(prefersDark ? 'dark' : 'light');
    document.body.style.backgroundColor = prefersDark ? '#1f2937' : '#f0f9ff';
    document.body.style.color = prefersDark ? '#f9fafb' : '#1f2937';
  }
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
      await saveRecords();
      await clearStoredBackups();

      renderRecords();
      updateStatistics();
      updateChart();
      showToast('所有数据已清空！');
    }
  });
}