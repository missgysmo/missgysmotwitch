const fs = require('fs');
const path = require('path');
const store = require('../store');

const DEBUG_LOG_PATH = path.join(store.DATA_DIR, 'debug.log');

// Séparateur entre deux entrées de log : une stack trace contient elle-même plusieurs lignes,
// donc découper le fichier par simple "\n" casserait une seule erreur en plusieurs fragments
// (c'est ce qui rendait le panel "Santé du bot" illisible — jamais le message, juste la fin de la trace).
const DEBUG_LOG_SEPARATOR = '\n---\n';

// Au lieu de crasher le process sur une erreur inattendue, on la consigne avec l'heure exacte et on continue.
function logError(label, err) {
  const line = `[${new Date().toISOString()}] ${label}: ${err?.stack || err}`;
  console.error(line);
  fs.appendFile(DEBUG_LOG_PATH, line + DEBUG_LOG_SEPARATOR, () => {});
}

function readRecentErrors(limit = 10) {
  try {
    const raw = fs.readFileSync(DEBUG_LOG_PATH, 'utf8');
    return raw.split(DEBUG_LOG_SEPARATOR).map((e) => e.trim()).filter(Boolean).slice(-limit).reverse();
  } catch {
    return [];
  }
}

function clearLog() {
  fs.rm(DEBUG_LOG_PATH, { force: true }, () => {});
}

process.on('uncaughtException', (err) => logError('uncaughtException', err));
process.on('unhandledRejection', (err) => logError('unhandledRejection', err));

module.exports = { logError, readRecentErrors, clearLog, DEBUG_LOG_PATH, DEBUG_LOG_SEPARATOR };
