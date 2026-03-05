const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('sinnthoid', {
  platform: process.platform
});
