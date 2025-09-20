// tickets.js
const express = require('express');
const router = express.Router();
const db = require('./db');

// ดึง ticket ทั้งหมด
router.get('/', async (req, res) => {
    try {
        const [rows] = await db.execute(`SELECT * FROM ticket ORDER BY created_at DESC`);
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});

// ค้นหา ticket ตาม number_6 และ round_date (ใช้ params)
router.get('/search/:number_6', async (req, res) => {
    try {
        const { number_6 } = req.params;

        const [rows] = await db.execute(
            `SELECT * FROM ticket WHERE number_6 = ? AND round_date = ? ORDER BY created_at DESC`,
            [number_6, '2025-09-04']
        );

        if (rows.length === 0) {
            return res.status(404).json({ message: 'Ticket not found' });
        }

        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});

// ค้นหา ticket ตาม status
router.get('/status/:status', async (req, res) => {
    try {
        const { status } = req.params;
        const [rows] = await db.execute(
            `SELECT * FROM ticket WHERE status = ? AND round_date = ?`,
            [status, '2025-09-04']
        );
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});




module.exports = router;
