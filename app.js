// app.js
const express = require('express');
const path = require('path');
const app = express();
require('dotenv').config();
const db = require('./config/db');
const authRoutes = require('./routes/authRoutes');
const leadRoutes = require('./routes/leadRoutes');

// Middlewares
app.use(express.json());  // Para leer JSON en las peticiones

// Sirviendo archivos estáticos (HTML, CSS, JS)
app.use(express.static(path.join(__dirname, 'views')));

// Servir login.html en la ruta raíz '/'
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'login.html'));  // Enviar archivo login.html al acceder a '/'
});

// Rutas API
app.use('/api/auth', authRoutes);
app.use('/api', leadRoutes);

// Configurar el puerto y escuchar
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor corriendo en puerto ${PORT}`);
});
