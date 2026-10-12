# Datenbank-Zertifikat von s1

`s1-postgres-chain.pem` ist die Zertifikatskette, die PostgreSQL auf s1
serviert (`ssl_cert_file`, Let's Encrypt fuer `s1.ischlstrom.org`, Stand
2026-10-12). Sie dient nur der Dokumentation: die Website prueft gegen die
oeffentlichen Wurzeln (`DB_SSL_SERVERNAME` in der `.env`, siehe
`src/lib/server/db/db.js`), weil das Blattzertifikat alle ~60 Tage wechselt.
