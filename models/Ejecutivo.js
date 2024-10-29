// models/Ejecutivo.js
const connection = require('../config/db');

exports.findByEmail = (email, callback) => {
    connection.query('SELECT * FROM Ejecutivos WHERE Correo = ?', [email], callback);
};
