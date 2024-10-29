// middleware/authenticate.js
const jwt = require('jsonwebtoken');

module.exports = (req, res, next) => {
    const token = req.header('Authorization');

    if (!token) {
        return res.status(401).json({ msg: 'Acceso denegado, no hay token' });
    }

    try {
        const verified = jwt.verify(token, process.env.JWT_SECRET);
        req.ejecutivoID = verified.id;
        next();
    } catch (err) {
        res.status(400).json({ msg: 'Token no válido' });
    }
};
