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


///------------------------------
router.post('/purchases', async (req, res, next) => {
  const conn = await db.getConnection(); // ใช้ db.getConnection()
  try {
    const { user_id, ticketId } = req.body;

    if (!user_id || !ticketId) {
      return res.status(400).json({ message: 'user_id และ ticketId จำเป็น' });
    }

    await conn.beginTransaction();

    // ล็อคตั๋ว
    const [[ticket]] = await conn.query(
      'SELECT * FROM ticket WHERE id=? FOR UPDATE',
      [ticketId]
    );
    if (!ticket) throw new Error('Ticket not found');
    if (ticket.status !== 'available') throw new Error('Ticket not available');

    // เช็คยอดเงินใน wallet
    const [last] = await conn.query(
      'SELECT balance_after FROM wallet_txn WHERE user_id=? ORDER BY created_at DESC, id DESC LIMIT 1',
      [user_id]
    );
    const bal = last.length ? Number(last[0].balance_after) : 0;
    if (bal < Number(ticket.price)) throw new Error('Insufficient balance');

    // บันทึกการซื้อ
    const [pr] = await conn.query(
      'INSERT INTO purchase(user_id, ticket_id, round_date, purchase_price) VALUES (?,?,?,?)',
      [user_id, ticket.id, ticket.round_date, ticket.price]
    );

    // อัปเดตสถานะตั๋ว
    await conn.query(
      'UPDATE ticket SET status="sold", updated_at=NOW() WHERE id=?',
      [ticket.id]
    );

    // อัปเดต wallet
    const newBal = bal - Number(ticket.price);
    await conn.query(
      'INSERT INTO wallet_txn(user_id,type,amount,balance_after,purchase_id,note) VALUES (?,?,?,?,?,?)',
      [
        user_id,
        'purchase',
        -Number(ticket.price),
        newBal,
        pr.insertId,
        `Buy ticket ${ticket.number_6}`, // ใช้ backtick
      ]
    );

    await conn.commit();
    res.json({
      ok: true,
      purchase_id: pr.insertId,
      round_date: ticket.round_date,
    });
  } catch (e) {
    await conn.rollback();
    console.error(e);
    res.status(500).json({ message: e.message || 'Server error' });
  } finally {
    conn.release();
  }
});




//---------------------
router.get('/purchases/:user_id', async (req, res) => {
  const { user_id } = req.params;
  try {
    const [rows] = await db.execute(
      `SELECT p.id AS purchase_id, p.purchase_price, p.purchased_at,
              t.id AS ticket_id, t.number_6, t.price, t.status, t.round_date
       FROM purchase p
       JOIN ticket t ON p.ticket_id = t.id
       WHERE p.user_id = ?
       ORDER BY p.purchased_at DESC`,
      [user_id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: 'ยังไม่มีการซื้อตั๋ว' });
    }

    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' });
  }
});


//--------------------------
// GET /prize-tiers

router.get("/prize-tiers", async (req, res, next) => {
  try {
    const [rows] = await db.query(
      "SELECT id, tier_rank, name, prize_amount FROM prize_tier ORDER BY tier_rank"
    );
    res.json(rows);
  } catch (e) { 
    console.error(e);
    res.status(500).json({ message: e.message || "Server error" });
  }
});



module.exports = router;


