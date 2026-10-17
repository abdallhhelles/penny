const { contextBridge, ipcRenderer } = require('electron');
const inv = (c, a) => ipcRenderer.invoke(c, a);
contextBridge.exposeInMainWorld('native', {
  load: () => inv('data:load'), save: d => inv('data:save', d), snapshot: k => inv('data:snapshot', k), saveSync: d => ipcRenderer.sendSync('data:saveSync', d),
  log: (l, m) => ipcRenderer.invoke('log:write', l, m), openLogs: () => inv('app:openLogs'),
  i18nList: () => inv('i18n:list'), i18nGet: c => inv('i18n:get', c),
  listBackups: () => inv('backups:list'), readBackup: n => inv('backups:read', n),
  material: m => inv('win:material', m), theme: t => inv('win:theme', t), edit: c => inv('win:edit', c),
  attPick: () => inv('att:pick'), attSave: (name, bytes) => inv('att:save', { name, bytes }), attPreview: id => inv('att:preview', id),
  attOpen: id => inv('att:open', id), attSaveAs: id => inv('att:saveAs', id), attRemove: id => inv('att:remove', id), attGc: ids => inv('att:gc', ids), overlay: c => inv('win:overlay', c),
  exportFile: o => inv('file:export', o), savePdf: n => inv('file:pdf', n), importFile: o => inv('file:import', o),
  openDataFolder: () => inv('app:openData'), version: () => inv('app:version'), notify: o => inv('app:notify', o),
  platform: process.platform,
  sysGet: () => inv('sys:get'), sysSet: p => inv('sys:set', p), tooltip: t => inv('sys:tooltip', t), badge: n => inv('sys:badge', n),
  ready: () => inv('sys:ready'),
  onEvent: cb => ipcRenderer.on('app:event', (_e, name, arg) => cb(name, arg)),
  updGet: () => inv('upd:get'), updCheck: () => inv('upd:check'), updApply: () => inv('upd:apply'),
  vaultStatus: () => inv('vault:status'), vaultUnlock: p => inv('vault:unlock', p), vaultRecover: c => inv('vault:recover', c), vaultVerify: p => inv('vault:verify', p),
  vaultSetPasscode: p => inv('vault:setPasscode', p), vaultClearPasscode: () => inv('vault:clearPasscode'), vaultNewRecovery: () => inv('vault:newRecovery'), vaultSetAside: () => inv('vault:setAside'),
  licenseGet: () => inv('license:get'), licenseActivate: k => inv('license:activate', k), licenseRemove: () => inv('license:remove')
});

/* paint the first frame in the app's own theme (no dark flash for light-theme users) */
try { const t = ipcRenderer.sendSync('win:themeGet'); window.addEventListener('DOMContentLoaded', () => { const r = document.documentElement; if (!r.dataset.themeSet) { r.dataset.theme = t; r.dataset.style = 'clean'; } }); } catch {}
