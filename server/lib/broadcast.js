// Registre partagé des overlays connectés en WebSocket, et les deux façons de leur parler.
// Module à part (plutôt que des variables dans index.js) pour que chaque routeur de fonctionnalité
// puisse diffuser des messages sans dépendre du fichier principal — un seul Set, une seule vérité.
const overlayClients = new Set();

function broadcast(message) {
  const data = JSON.stringify(message);
  for (const client of overlayClients) {
    if (client.readyState === client.OPEN) client.send(data);
  }
}

// Envoie uniquement aux overlays ouverts en mode aperçu (/overlay/?preview=1) : sert aux boutons
// "Tester" du panel, pour que rien ne s'affiche jamais sur le stream principal pendant les essais.
function broadcastToPreview(message) {
  const data = JSON.stringify(message);
  for (const client of overlayClients) {
    if (client.isPreview && client.readyState === client.OPEN) client.send(data);
  }
}

module.exports = { overlayClients, broadcast, broadcastToPreview };
