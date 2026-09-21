#!/usr/bin/env node
// Signal-Testnachricht ueber denselben Code wie die Website schicken
// (src/lib/server/signal.js). Konfiguration aus website/.env (SIGNAL_*).
//
//   node scripts/signal-send.js "Testnachricht"
//   SIGNAL_API_URL=http://127.0.0.1:8180 node scripts/signal-send.js "..."   (direkt auf s1)
import { fileURLToPath } from 'node:url';
import { loadEnv } from 'vite';
import { signalConfigFromEnv, sendSignal } from '../src/lib/server/signal.js';

const text = process.argv.slice(2).join(' ').trim();
if (!text) {
    console.error('Aufruf: signal-send.js <text>');
    process.exit(1);
}
const root = fileURLToPath(new URL('..', import.meta.url));
const env = { ...loadEnv('production', root, ''), ...process.env };
const config = signalConfigFromEnv(env);
if (!config) {
    console.error('SIGNAL_API_URL / SIGNAL_NUMBER nicht gesetzt');
    process.exit(1);
}
console.log(`Sende ueber ${config.apiUrl} als ${config.number} an ${config.recipients.join(', ')}`);
await sendSignal(config, text);
console.log('verschickt');
