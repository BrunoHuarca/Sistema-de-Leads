// controllers/leadController.js
const connection = require('../config/db');

exports.getLeads = (req, res) => {
    const ejecutivoID = req.ejecutivoID;

    connection.query('SELECT * FROM Leads WHERE Ejecutivo_ID = ?', [ejecutivoID], (err, results) => {
        if (err) throw err;
        res.json(results);
    });
};
