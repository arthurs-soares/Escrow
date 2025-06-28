const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, 'tickets.db');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
    db.run(`
        CREATE TABLE IF NOT EXISTS tickets (
            ticket_id TEXT PRIMARY KEY,
            status TEXT NOT NULL,
            creator_id TEXT NOT NULL,
            other_user_id TEXT NOT NULL,
            buyer_id TEXT,
            seller_id TEXT,
            value REAL,
            fee_payer TEXT,
            seller_pix_key TEXT,
            payment_id TEXT,
            message_id TEXT
        )
    `);

    // Migration to add the confirmed_users column if it doesn't exist
    db.all("PRAGMA table_info(tickets)", (err, columns) => {
        if (err) {
            console.error("Erro ao verificar a estrutura da tabela:", err);
            return;
        }

        const hasConfirmedUsers = columns.some(col => col.name === 'confirmed_users');
        if (!hasConfirmedUsers) {
            db.run("ALTER TABLE tickets ADD COLUMN confirmed_users TEXT", (err) => {
                if (err) {
                    console.error("Erro ao adicionar a coluna 'confirmed_users':", err);
                } else {
                    console.log("Coluna 'confirmed_users' adicionada com sucesso.");
                }
            });
        }
    });
});

module.exports = db;
