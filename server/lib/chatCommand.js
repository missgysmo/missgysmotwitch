// Extrait le premier mot d'un message de tchat, nettoyé, pour le comparer à une commande ("!son").
//
// Pourquoi pas une simple comparaison du message entier : quand un viewer renvoie le même message
// deux fois de suite, Twitch (et les extensions 7TV/Chatterino/BTTV) y ajoutent un caractère
// invisible pour contourner l'anti-doublon ("!son" devient "!son \u{E0000}") — la commande
// n'était alors plus reconnue une fois sur deux. Idem si le viewer ajoute du texte après.
const INVISIBLE_CHARS = /[\u{E0000}-\u{E007F}͏ᅟᅠ឴឵᠎​-‏‪-‮⁠-⁯ㅤ︀-️﻿ﾠ]/gu;

function firstWord(message) {
  return String(message || '').replace(INVISIBLE_CHARS, ' ').trim().split(/\s+/)[0].toLowerCase();
}

// Reste du message après la commande (ex. la cible de "!so @pseudo"), nettoyé de la même façon.
function argsAfterCommand(message) {
  return String(message || '').replace(INVISIBLE_CHARS, ' ').trim().split(/\s+/).slice(1);
}

module.exports = { firstWord, argsAfterCommand };
