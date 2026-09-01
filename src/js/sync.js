// ==========================================
// 坚果云同步（上传 / 下载 / 测试连接）
// ==========================================
import { state } from './state.js';
import { encryptWithPassword, decryptWithPassword } from './crypto.js';
import { webdavProbe, webdavUpload, webdavDownload } from './dav.js';
import { getSettings } from './settings.js';
import { saveRecords } from './storage.js';
import { renderRecords } from './records.js';
import { updateStatistics } from './stats.js';
import { updateChart } from './chart.js';
import { showToast } from './ui.js';

function getConfig() {
  const s = getSettings().sync || {};
  return {
    server: String(s.server || '').trim(),
    username: String(s.username || '').trim(),
    appPassword: String(s.appPassword || ''),
    passphrase: String(s.passphrase || ''),
  };
}

function requireConfig() {
  const c = getConfig();
  if (!c.server || !c.username || !c.appPassword) {
    throw new Error('请先填写坚果云服务器、账号和应用密码（坚果云设置页生成）');
  }
  if (!c.passphrase) {
    throw new Error('请设置同步口令（用于云端数据加密，多设备用同一口令）');
  }
  return c;
}

/**
 * 测试连接：能否连上、云端是否已有备份
 */
export async function testCloudConnection() {
  try {
    const c = requireConfig();
    const probe = await webdavProbe(c.server, c.username, c.appPassword);
    if (!probe.ok) {
      throw new Error(`连接失败（HTTP ${probe.status}），请检查服务器/账号/密码或网络`);
    }
    showToast(probe.hasRemote ? '连接正常，云端已有备份' : '连接正常，云端暂无备份', 'success');
  } catch (e) {
    showToast('测试失败：' + e.message, 'error');
  }
}

/**
 * 上传：把当前记录加密后写入云端
 */
export async function uploadToCloud() {
  try {
    const c = requireConfig();
    const encryptedBody = await encryptWithPassword(JSON.stringify(state.records), c.passphrase);
    await webdavUpload(c.server, c.username, c.appPassword, encryptedBody);
    showToast(`已上传 ${state.records.length} 条记录到云端`, 'success');
  } catch (e) {
    showToast('上传失败：' + e.message, 'error');
  }
}

/**
 * 下载：从云端拉取并用口令解密，按 id 去重合并到本地
 */
export async function downloadFromCloud() {
  try {
    const c = requireConfig();
    const encryptedBody = await webdavDownload(c.server, c.username, c.appPassword);
    if (!encryptedBody) {
      showToast('云端暂无备份，请先上传', 'info');
      return;
    }

    let cloudRecords;
    try {
      const plain = await decryptWithPassword(encryptedBody, c.passphrase);
      cloudRecords = JSON.parse(plain);
    } catch (e) {
      showToast('解密失败：同步口令不正确或数据已损坏', 'error');
      return;
    }

    if (!Array.isArray(cloudRecords)) {
      showToast('云端数据格式不正确', 'error');
      return;
    }

    const existingIds = new Set(state.records.map(r => r.id));
    const newOnes = cloudRecords.filter(r => r && r.id != null && !existingIds.has(r.id));

    if (newOnes.length === 0) {
      showToast('已是最新，无需合并', 'info');
      return;
    }

    state.records = [...newOnes, ...state.records];
    await saveRecords();

    renderRecords();
    updateStatistics();
    updateChart();
    showToast(`已从云端合并 ${newOnes.length} 条记录`, 'success');
  } catch (e) {
    showToast('下载失败：' + e.message, 'error');
  }
}