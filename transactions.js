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

// GET /transactions/wallet/:user_id
router.get('/wallet/:user_id', async (req, res, next) => {
  try {
    const userId = req.params.user_id; // <-- ใช้ params แทน
    if (!userId) return res.status(400).json({ message: 'Missing user_id' });

    const [rows] = await db.query(
      'SELECT id, type, amount, balance_after, created_at, purchase_id, redemption_id, draw_id, note FROM wallet_txn WHERE user_id=? ORDER BY created_at DESC, id DESC LIMIT 200',
      [userId]
    );

    res.json(rows);
  } catch (e) {
    next(e);
  }
});
module.exports = router;
