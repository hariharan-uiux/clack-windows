'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('clack', {
  getState: () => ipcRenderer.invoke('state:get'),
  setSettings: (patch) => ipcRenderer.invoke('settings:set', patch),
  loadSounds: () => ipcRenderer.invoke('sounds:load'),
  windowAction: (action) => ipcRenderer.invoke('window:action', action),
  openExternal: (url) => ipcRenderer.invoke('open:external', url),
  onKey: (callback) => {
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on('key:event', handler);
    return () => ipcRenderer.removeListener('key:event', handler);
  },
  onState: (callback) => {
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on('state:changed', handler);
    return () => ipcRenderer.removeListener('state:changed', handler);
  },
  onDemo: (callback) => {
    const handler = (_event, payload) => callback(payload || {});
    ipcRenderer.on('sound:demo', handler);
    return () => ipcRenderer.removeListener('sound:demo', handler);
  },
  onMouse: (callback) => {
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on('mouse:event', handler);
    return () => ipcRenderer.removeListener('mouse:event', handler);
  },
  onWheel: (callback) => {
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on('mouse:wheel', handler);
    return () => ipcRenderer.removeListener('mouse:wheel', handler);
  },
});
