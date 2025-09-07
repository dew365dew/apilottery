const express = require('express');
const app = express();
const cors = require('cors');
app.use(express.json());
app.use(cors());
const usersRouter = require('./users');
const transactionsRouter = require('./transactions');
const ticketsRouter = require('./tickets');
app.use('/users', usersRouter);
app.use('/transactions', transactionsRouter);
app.use('/tickets', ticketsRouter);

app.listen(3000, () => console.log('Server running on http://localhost:3000'));
