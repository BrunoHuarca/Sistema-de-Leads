// config/db.js
const mysql = require('mysql2/promise'); // Cambiar a mysql2/promise
require('dotenv').config();

// Crear un pool de conexiones
const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME
  });
  
  // Exportar el pool de conexiones
  module.exports = pool; // Exportar el pool, no una conexión simple
