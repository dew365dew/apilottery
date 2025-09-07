// transactions.js
const express = require('express');
const router = express.Router();
const db = require('./db');

// Add transaction
router.post('/add', async (req, res) => {
    try {
        const { user_id, type, amount, note } = req.body;
        if (!user_id || !type || amount == null) return res.status(400).json({ message: 'Missing required fields' });

        // Last balance
        const [rows] = await db.execute(
            `SELECT balance_after FROM transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT 1`,
            [user_id]
        );

        let last_balance = rows.length ? parseFloat(rows[0].balance_after) : 0;
        let balance_after = last_balance + parseFloat(amount);

        const [result] = await db.execute(
            `INSERT INTO transactions (user_id, type, amount, balance_after, note)
             VALUES (?, ?, ?, ?, ?)`,
            [user_id, type, amount, balance_after, note || null]
        );

        res.status(201).json({ message: 'Transaction added', transaction_id: result.insertId, balance_after });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});

// Get user's transactions
router.get('/:user_id', async (req, res) => {
    try {
        const { user_id } = req.params;
        const [rows] = await db.execute(
            `SELECT * FROM transactions WHERE user_id = ? ORDER BY created_at DESC`,
            [user_id]
        );
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;
