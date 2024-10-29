// routes/authRoutes.js
const express = require('express');
const router = express.Router();
const db = require('../config/db');
const jwt = require('jsonwebtoken');

// Middleware para verificar el token
const verifyToken = (req, res, next) => {
    const token = req.headers['authorization'];
    if (!token) return res.sendStatus(403); // Forbidden

    // Verificar el token
    jwt.verify(token.split(' ')[1], process.env.JWT_SECRET, (err, decoded) => {
        if (err) return res.sendStatus(403);
        req.user = { // Almacena tanto el ID como el rol en el objeto de la solicitud
            id: decoded.id,
            role: decoded.role
        };
        next();
    });
};



// Ruta para crear un nuevo ejecutivo
router.post('/ejecutivos', async (req, res) => {
    const { nombre, correo, contraseña } = req.body;

    // Validación básica
    if (!nombre || !correo || !contraseña) {
        return res.status(400).json({ message: 'Todos los campos son requeridos.' });
    }

    try {
        // Intentar insertar el nuevo ejecutivo en la base de datos
        const [result] = await db.execute('INSERT INTO Ejecutivos (Nombre, Correo, Contraseña) VALUES (?, ?, ?)', [nombre, correo, contraseña]);

        // Verificar si la inserción fue exitosa
        if (result.affectedRows > 0) {
            res.status(201).json({ message: 'Ejecutivo creado exitosamente', ejecutivoId: result.insertId });
        } else {
            res.status(500).json({ message: 'Error al crear el ejecutivo. Intente de nuevo.' });
        }
    } catch (error) {
        console.error(error); // Imprimir el error en la consola para fines de depuración
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ message: 'Ya existe un ejecutivo con ese correo.' });
        }
        res.status(500).json({ message: 'Error al crear el ejecutivo.' });
    }
});

// Ruta para login
router.post('/login', async (req, res) => {
    const { correo, contraseña } = req.body;

    // Validación básica
    if (!correo || !contraseña) {
        return res.status(400).json({ message: 'Todos los campos son requeridos.' });
    }

    try {
        const [ejecutivo] = await db.execute('SELECT * FROM Ejecutivos WHERE Correo = ?', [correo]);

        if (ejecutivo.length === 0) {
            return res.status(401).json({ message: 'Credenciales inválidas.' });
        }

        // Comparar contraseñas (sin encriptación)
        if (contraseña !== ejecutivo[0].Contraseña) {
            return res.status(401).json({ message: 'Credenciales inválidas.' });
        }

        // Generar un token JWT
        const token = jwt.sign(
            { 
                id: ejecutivo[0].Ejecutivo_ID,
                role: ejecutivo[0].role // Obtener el rol del ejecutivo de la base de datos
            }, 
            process.env.JWT_SECRET
        );

        res.status(200).json({
             message: 'Login exitoso',
              token,
              ejecutivoId: ejecutivo[0].Ejecutivo_ID  // Devolver el ID del ejecutivo
            }); // Enviar el token al cliente
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error al iniciar sesión.' });
    }
});

// Ejemplo de ruta protegida (puedes cambiar el nombre de la ruta y lo que haga)
router.get('/protected', verifyToken, (req, res) => {
    res.json({ message: 'Acceso concedido a la ruta protegida', ejecutivoId: req.ejecutivoId });
});

module.exports = router;
