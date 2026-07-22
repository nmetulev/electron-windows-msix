const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');

// Keep the app resilient on headless CI runners: no GPU/session is guaranteed
// there, so disable hardware acceleration and the sandbox before the app is ready.
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-software-rasterizer');

// Drop a marker so the end-to-end test can confirm that Electron's main process
// actually executed our code (not just that a process with the right name exists).
// Inside an MSIX container this write is redirected under the package's LocalCache,
// which the workflow knows how to find. Best-effort: never crash over the marker.
const writeMarker = () => {
  const line = `HelloElectron started ${new Date().toISOString()} v${app.getVersion()} pid=${process.pid}`;
  console.log(line);
  try {
    fs.writeFileSync(path.join(os.tmpdir(), 'electron-msix-smoke.marker'), `${line}\n`);
  } catch {
    // ignore
  }
};

app.whenReady().then(() => {
  writeMarker();

  const win = new BrowserWindow({
    width: 480,
    height: 320,
    show: false,
    webPreferences: { nodeIntegration: false, contextIsolation: true },
  });
  win.loadFile(path.join(__dirname, 'index.html'));

  // Keep the main process alive so the smoke test can observe it running,
  // independent of window/renderer state on a headless runner.
  setInterval(() => {}, 60 * 1000);
});

// Never self-terminate; the smoke test stops the process explicitly.
app.on('window-all-closed', () => {});
