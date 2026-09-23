// ==========================================
// 坚果云同步（上传 / 下载 / 测试连接）
// ==========================================
import { state } from './state.js';
import { encryptWithPassword, decryptWithPassword } from './crypto.js';
import { webdavProbe, webdavUpload, webdavDownload } from './dav.js';
import { getSettings } from './settings.js';
import { saveRecords } from './storage.js';
import { renderRecords, refreshTodayCount } from './records.js';
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
 * 同步按钮忙碌态：避免网络挂起时用户重复点击
 */
function setSyncBusy(busy) {
  ['syncTestBtn', 'syncUploadBtn', 'syncDownloadBtn'].forEach(id => {
    const btn = document.getElementById(id);
    if (!btn) return;
    btn.disabled = busy;
    btn.classList.toggle('opacity-50', busy);
    btn.classList.toggle('pointer-events-none', busy);
  });
}

/**
 * 按 id 合并两组记录（保持时间倒序）
 * 冲突时以第一组（本地）为准。
 */
function mergeById(primary, secondary) {
  const map = new Map();
  [...primary, ...secondary].forEach(record => {
    if (!record || record.id == null) return;
    const key = String(record.id);
    if (!map.has(key)) map.set(key, record);
  });
  return [...map.values()].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
}

function refreshAfterSync() {
  renderRecords();
  updateStatistics();
  updateChart();
  refreshTodayCount();
}

/**
 * 测试连接：能否连上、云端是否已有备份
 */
export async function testCloudConnection() {
  setSyncBusy(true);
  try {
    const c = requireConfig();
    const probe = await webdavProbe(c.server, c.username, c.appPassword);
    if (!probe.ok) {
      throw new Error(`连接失败（HTTP ${probe.status}），请检查服务器/账号/密码或网络`);
    }
    showToast(probe.hasRemote ? '连接正常，云端已有备份' : '连接正常，云端暂无备份', 'success');
  } catch (e) {
    showToast('测试失败：' + e.message, 'error');
  } finally {
    setSyncBusy(false);
  }
}

/**
 * 上传：把「本地 + 云端」合并后的记录加密写入云端
 *
 * 直接 PUT 覆盖会让较旧的设备把云端更新的记录抹掉（多设备场景下丢数据且
 * 本机看不出来）。这里改为先下载合并再上传，属于非破坏性操作：
 * 只增不减 —— 删除操作不会同步到云端，如需真正删除请在各设备分别操作。
 */
export async function uploadToCloud() {
  setSyncBusy(true);
  try {
    const c = requireConfig();
    const localCount = state.records.length;

    let merged = state.records;
    let remoteCount = 0;

    const remoteEncrypted = await webdavDownload(c.server, c.username, c.appPassword);
    if (remoteEncrypted) {
      let remoteRecords;
      try {
        const plain = await decryptWithPassword(remoteEncrypted, c.passphrase);
        remoteRecords = JSON.parse(plain);
      } catch (e) {
        throw new Error('无法读取云端已有数据（同步口令不一致？）。为避免覆盖，已中止上传');
      }
      if (Array.isArray(remoteRecords)) {
        remoteCount = remoteRecords.length;
        merged = mergeById(state.records, remoteRecords);
      }
    }

    const encryptedBody = await encryptWithPassword(JSON.stringify(merged), c.passphrase);
    await webdavUpload(c.server, c.username, c.appPassword, encryptedBody);

    if (merged.length !== localCount) {
      state.records = merged;
      await saveRecords();
      refreshAfterSync();
    }

    showToast(
      remoteEncrypted
        ? `已合并上传：本地 ${localCount} 条 + 云端 ${remoteCount} 条 → ${merged.length} 条`
        : `已上传 ${merged.length} 条记录到云端`,
      'success'
    );
  } catch (e) {
    showToast('上传失败：' + e.message, 'error');
  } finally {
    setSyncBusy(false);
  }
}

/**
 * 下载：从云端拉取并用口令解密，按 id 去重合并到本地
 */
export async function downloadFromCloud() {
  setSyncBusy(true);
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

    const before = state.records.length;
    state.records = mergeById(state.records, cloudRecords);
    const added = state.records.length - before;

    if (added === 0) {
      showToast('已是最新，无需合并', 'info');
      return;
    }

    await saveRecords();
    refreshAfterSync();
    showToast(`已从云端合并 ${added} 条记录`, 'success');
  } catch (e) {
    showToast('下载失败：' + e.message, 'error');
  } finally {
    setSyncBusy(false);
  }
}
