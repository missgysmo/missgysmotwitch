// Point d'entrée de l'application Windows : lance le serveur Express (bot Twitch + dashboard)
// en arrière-plan, exactement comme `npm start`, puis ouvre une fenêtre native dessus.
const { app, BrowserWindow } = require('electron');
const path = require('path');
const net = require('net');

require('dotenv').config({ path: path.join(__dirname, '.env') });

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

  win.loadURL(`http://localhost:${PORT}/settings/`);
}

app.whenReady().then(() => {
  require(path.join(__dirname, 'server', 'index.js'));
  creerFenetre();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) creerFenetre();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
