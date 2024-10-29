// controllers/authController.js
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const connection = require('../config/db');

// Iniciar sesión
exports.login = (req, res) => {
    const { correo, contraseña } = req.body;

    if (!correo || !contraseña) {
        return res.status(400).json({ msg: "Por favor ingrese correo y contraseña" });
    }

    // Verificar si el correo existe
    connection.query('SELECT * FROM Ejecutivos WHERE Correo = ?', [correo], (err, results) => {
        if (err) throw err;

        if (results.length === 0) {
            return res.status(401).json({ msg: "Correo no encontrado" });
        }

        const ejecutivo = results[0];

        // Verificar la contraseña
        bcrypt.compare(contraseña, ejecutivo.Contraseña, (err, isMatch) => {
            if (err) throw err;

            if (!isMatch) {
                return res.status(401).json({ msg: "Contraseña incorrecta" });
            }

            // Crear token de autenticación
            const token = jwt.sign(
                {
                    id: usuario.Ejecutivo_ID,
                    role: usuario.role // Asegúrate de que el rol esté incluido
                },
                process.env.JWT_SECRET
                // O elimina expiresIn si no quieres que expire
            );
            

            res.json({ token });
        });
    });
};
