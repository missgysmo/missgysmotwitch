// Point d'entrée de l'application Windows : lance le serveur Express (bot Twitch + dashboard)
// en arrière-plan, exactement comme `npm start`, puis ouvre une fenêtre native dessus.
const { app, BrowserWindow } = require('electron');
const path = require('path');
const net = require('net');

// En version portable, electron-builder place le dossier contenant le vrai .exe dans
// PORTABLE_EXECUTABLE_DIR — __dirname pointerait sinon dans l'archive asar en lecture seule.
const BASE_DIR = process.env.PORTABLE_EXECUTABLE_DIR || __dirname;

require('dotenv').config({ path: path.join(BASE_DIR, '.env') });
if (!process.env.DATA_DIR) {
  process.env.DATA_DIR = path.join(BASE_DIR, 'data');
}

const PORT = process.env.PORT || 3000;

function portOuvert(port) {
  return new Promise((resolve) => {
    const socket = net.createConnection(port, '127.0.0.1');
    socket.once('connect', () => { socket.destroy(); resolve(true); });
    socket.once('error', () => { resolve(false); });
  });
}

async function attendreServeur(port, tentativesMax = 60) {
  for (let i = 0; i < tentativesMax; i++) {
    if (await portOuvert(port)) return true;
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}

async function creerFenetre() {
  const ok = await attendreServeur(PORT);
  if (!ok) {
    console.error(`Le serveur n'a pas démarré après 60s sur le port ${PORT} — vérifie ton .env.`);
  }

  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    autoHideMenuBar: true,
    icon: path.join(__dirname, 'app_icon.ico'),
    webPreferences: {
      contextIsolation: true,
    },
  });

  // Twitch (et d'autres pages d'auth) peuvent refuser de s'afficher correctement si le user-agent
  // laisse deviner qu'il s'agit d'Electron plutôt qu'un vrai navigateur.
  win.webContents.setUserAgent(
    win.webContents.getUserAgent().replace(/\s*Electron\/\S+/, '')
  );

  win.loadURL(`http://localhost:${PORT}/settings/`);
}

const fs = require('fs');

function logCrash(err) {
  try {
    fs.appendFileSync(
      path.join(BASE_DIR, 'crash.log'),
      `${new Date().toISOString()} : ${err && err.stack ? err.stack : err}\n`
    );
  } catch (_) { /* rien de plus à faire si même ça échoue */ }
}

process.on('uncaughtException', logCrash);

app.whenReady().then(() => {
  try {
    require(path.join(__dirname, 'server', 'index.js'));
  } catch (err) {
    logCrash(err);
    app.quit();
    return;
  }
  creerFenetre();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) creerFenetre();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
