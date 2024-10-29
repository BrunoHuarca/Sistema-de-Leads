// models/Lead.js
const connection = require('../config/db');

exports.findByEjecutivo = (ejecutivoID, callback) => {
    connection.query('SELECT * FROM Leads WHERE Ejecutivo_ID = ?', [ejecutivoID], callback);
};
