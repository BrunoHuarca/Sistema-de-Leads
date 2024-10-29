// routes/leadRoutes.js
const express = require('express');
const router = express.Router();
const db = require('../config/db'); // Asegúrate de que esta conexión es correcta
const jwt = require('jsonwebtoken'); // Importar 

// Middleware para verificar el token
const verifyToken = (req, res, next) => {
    const token = req.headers['authorization'];
    if (!token) {
        return res.status(403).json({ message: 'No se proporcionó un token' });
    }

    // Quitar 'Bearer ' si está presente
    const bearerToken = token.startsWith('Bearer ') ? token.split(' ')[1] : token;

    jwt.verify(bearerToken, process.env.JWT_SECRET, (err, decoded) => {
        if (err) {
            return res.status(403).json({ message: 'Token inválido' });
        }
        req.user = { 
            id: decoded.id, 
            role: decoded.role }; // Guarda el ID del ejecutivo en la request
        next();
    });
};

// Obtener leads con el comentario más reciente
router.get('/leads', verifyToken, async (req, res) => {
    const ejecutivoId = req.query.ejecutivoId || req.user.id; // Obtener ejecutivoId de la query, o usar el del token si no se pasa
    try {
        const [results] = await db.execute(`
            SELECT 
                L.Cliente_ID,
                L.Nombre,
                L.Numero, 
                L.Ciudad, 
                C.Nombre AS CursoNombre, 
                C.Fecha AS Fecha,
                L.Interes, 
                COALESCE(LC.UltimoComentario, 'Sin Comentarios') AS UltimoComentario,
                LC.FechaComentario, -- Mostrar la fecha del comentario más reciente
                DATE(L.FechaCreacion) AS FechaCreacion -- Obtener solo la fecha sin la hora
            FROM 
                Leads L
            JOIN 
                Cursos C ON L.Curso_ID = C.Curso_ID
            LEFT JOIN (
                SELECT 
                    Comentarios.Cliente_ID, 
                    Comentarios.Comentario AS UltimoComentario, 
                    Comentarios.Fecha AS FechaComentario
                FROM 
                    Comentarios
                INNER JOIN (
                    SELECT 
                        Cliente_ID, 
                        MAX(Fecha) AS FechaMaxima -- Seleccionamos la fecha más reciente por cada Cliente_ID
                    FROM 
                        Comentarios
                    GROUP BY 
                        Cliente_ID
                ) AS MaxFechas 
                ON Comentarios.Cliente_ID = MaxFechas.Cliente_ID 
                AND Comentarios.Fecha = MaxFechas.FechaMaxima -- Aseguramos que tomamos el comentario más reciente
            ) LC ON L.Cliente_ID = LC.Cliente_ID
            WHERE 
                L.Ejecutivo_ID = ? AND
                L.Cliente_ID NOT IN (
                    SELECT Cliente_ID FROM Inscritos
                    UNION
                    SELECT Cliente_ID FROM Masivos
                    UNION
                    SELECT Cliente_ID FROM NoQuiere
                )
            ORDER BY 
                L.FechaCreacion DESC -- Ordenar por la fecha de creación de manera descendente
        `, [ejecutivoId]);

        res.json(results);
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Error al obtener leads' });
    }
});


// Obtener un lead por su ID
router.get('/leads/:id', verifyToken, async (req, res) => {
    const leadId = req.params.id; // Obtenemos el ID del lead desde los parámetros de la ruta
    const ejecutivoId = req.query.ejecutivoId || req.user.id; 
    try {
        const [lead] = await db.execute(`
            SELECT 
            L.Cliente_ID, 
            L.Nombre, L.Ciudad, 
            L.Numero, L.Interes, 
            C.Curso_ID,  
            C.Fecha AS Fecha,
            C.Nombre AS CursoNombre
            FROM Leads L
            JOIN Cursos C ON L.Curso_ID = C.Curso_ID
            WHERE L.Cliente_ID = ? AND L.Ejecutivo_ID = ?
        `, [leadId, ejecutivoId]);

        if (lead.length === 0) {
            return res.status(404).json({ message: 'Lead no encontrado.' });
        }

        res.json(lead[0]);
    } catch (error) {
        console.error('Error al obtener el lead:', error);
        res.status(500).json({ message: 'Error al obtener el lead.' });
    }
});

// Agregar un nuevo lead y un nuevo curso
router.post('/leads', verifyToken, async (req, res) => {
    console.log(req.body); // Esto te mostrará los datos que estás enviando
    const { nombre, ciudad, cursoId, interes, numero } = req.body; // Cambia aquí para recibir solo 'cursoId'

    const ejecutivoId = req.query.ejecutivoId || req.user.id; // Obtener ejecutivoId de la query, o usar el del token si no se pasa
    console.log("Se agrego para el cliente: " + ejecutivoId);
    try {
        // Ahora, crea el nuevo lead usando el ID del curso
        const [leadResult] = await db.execute(
            'INSERT INTO Leads (Nombre, Ciudad, Curso_ID, Interes, Numero, Ejecutivo_ID) VALUES (?, ?, ?, ?, ?, ?)',
            [nombre, ciudad, cursoId, interes, numero, ejecutivoId]
        );

        res.status(201).json({ message: 'Lead agregado exitosamente', leadId: leadResult.insertId });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error al agregar el lead.' });
    }
});
// Agregar leads masivos
router.post('/leadsmasivo', verifyToken, async (req, res) => {
    const { leads } = req.body; // El array de leads
    const ejecutivoId = req.query.ejecutivoId || req.user.id; // Obtener el ejecutivoId de la query, o usar el del token si no se pasa

    if (!Array.isArray(leads) || leads.length === 0) {
        return res.status(400).json({ message: 'Debe proporcionar al menos un lead.' });
    }

    try {
        // Insertar todos los leads en la base de datos en una sola consulta
        const values = leads.map(({ nombre, ciudad, cursoId, interes, numero }) => [
            nombre || "", // Asigna un valor predeterminado si `nombre` es undefined
            ciudad || "",
            cursoId || null, // O bien null para campos numéricos
            interes || 0,    // Si `interes` debe ser un número, puedes usar 0 como predeterminado
            numero || "",
            ejecutivoId
        ]);

        const placeholders = values.map(() => '(?, ?, ?, ?, ?, ?)').join(', ');

        const query = `
            INSERT INTO Leads (Nombre, Ciudad, Curso_ID, Interes, Numero, Ejecutivo_ID) 
            VALUES ${placeholders}
        `;

        const [result] = await db.execute(query, values.flat());

        res.status(201).json({ message: `${leads.length} Leads agregados exitosamente` });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error al agregar los leads.' });
    }
});


// Obtener todas las ciudades del ejecutivo logueado
router.get('/ciudades', verifyToken, async (req, res) => {
    const ejecutivoId = req.query.ejecutivoId || req.user.id; 
    console.log("(Leads)Este es el ID del ejecutivo para la consulta de ciudades: " + ejecutivoId);
    
    try {
        const [results] = await db.execute(`
            SELECT DISTINCT Leads.Ciudad 
            FROM Leads 
            LEFT JOIN Inscritos ON Leads.Cliente_ID = Inscritos.Cliente_ID
            LEFT JOIN Masivos ON Leads.Cliente_ID = Masivos.Cliente_ID
            LEFT JOIN NoQuiere ON Leads.Cliente_ID = NoQuiere.Cliente_ID
            WHERE Leads.Ejecutivo_ID = ?
            AND Inscritos.Cliente_ID IS NULL
            AND Masivos.Cliente_ID IS NULL
            AND NoQuiere.Cliente_ID IS NULL
        `, [ejecutivoId]);

        res.json(results.map(row => row.Ciudad)); // Devuelve solo los nombres de las ciudades
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Error al obtener las ciudades.' });
    }
});






// routes/leadRoutes.js
router.post('/cursos', verifyToken, async (req, res) => {
    const { nombre, fecha  } = req.body;

    // Validar los datos
    // if (!nombre || !fecha) {
    //     return res.status(400).json({ message: 'Nombre y fecha son requeridos.' });
    // }

    try {
        // Si no se proporciona fecha, usar la fecha actual
        const fechaCurso = fecha ? fecha : new Date().toISOString().slice(0, 10); // Formato YYYY-MM-DD

        const [result] = await db.execute(
            'INSERT INTO Cursos (Nombre, Fecha) VALUES (?, ?)',
            [nombre, fechaCurso]
        );
        res.status(201).json({ message: 'Curso agregado exitosamente', cursoId: result.insertId });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error al agregar el curso.' });
    }
});

// Obtener todos los cursos
router.get('/cursos', verifyToken, async (req, res) => {
    try {
        const [cursos] = await db.execute(`SELECT * FROM Cursos`);

        // Formatear las fechas en el array de cursos
        const cursosFormateados = cursos.map(curso => {
            return {
                ...curso,
                Fecha: curso.Fecha ? curso.Fecha.toLocaleDateString('en-ES') : null // Formato yyyy-mm-dd sin desfase
            };     
        });

        res.json(cursosFormateados); // Devuelve los cursos con la fecha formateada

    } catch (error) {
        
        console.error('Error al obtener los cursos:', error);
        res.status(500).json({ message: 'Error al obtener los cursos' });
    }
});
// 3. Editar un curso por ID
router.put('/cursos/:id', verifyToken, async (req, res) => {
    const cursoId = req.params.id;
    const { nombre, fecha } = req.body;

    // Validar los datos
    if (!nombre || !fecha) {
        return res.status(400).json({ message: 'Nombre y fecha son requeridos.' });
    }

    try {
        const [result] = await db.execute(
            'UPDATE Cursos SET Nombre = ?, Fecha = ? WHERE Curso_ID = ?',
            [nombre, fecha, cursoId]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Curso no encontrado.' });
        }

        res.status(200).json({ message: 'Curso actualizado exitosamente.' });
    } catch (error) {
        console.error('Error al actualizar el curso:', error);
        res.status(500).json({ message: 'Error al actualizar el curso.' });
    }
});

// 4. Eliminar un curso por ID
router.delete('/cursos/:id', verifyToken, async (req, res) => {
    const cursoId = req.params.id;

    try {
        const [result] = await db.execute('DELETE FROM Cursos WHERE Curso_ID = ?', [cursoId]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Curso no encontrado.' });
        }

        res.status(200).json({ message: 'Curso eliminado exitosamente.' });
    } catch (error) {
        console.error('Error al eliminar el curso:', error);
        res.status(500).json({ message: 'Error al eliminar el curso, recuerda que nadie debe estar relacionado con este curso. ' });
    }
});


// Obtener comentarios por Lead
router.get('/comments/:leadId', verifyToken, async (req, res) => {
    const leadId = req.params.leadId;

    try {
        const [comments] = await db.execute(
            'SELECT Comentario_ID, Comentario, Fecha FROM Comentarios WHERE Cliente_ID = ? ORDER BY Fecha DESC', [leadId]
        );
        res.json(comments);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error al obtener los comentarios.' });
    }
});

// Agregar comentario y actualizar el Lead
router.post('/comments', verifyToken, async (req, res) => {
    try {
        const { commentText, leadId } = req.body;

        // Consulta para insertar el comentario
        const query = 'INSERT INTO Comentarios (Comentario, Cliente_ID) VALUES (?, ?)';
        const values = [commentText, leadId];

        await db.query(query, values);
        res.status(201).json({ message: 'Comentario agregado exitosamente.' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error al agregar el comentario.' });
    }
});

// Eliminar un comentario
router.delete('/comments/:id', verifyToken, async (req, res) => {
    const commentId = req.params.id; // Obtenemos el ID del comentario desde los parámetros de la ruta

    try {
        // Consulta para eliminar el comentario
        const query = 'DELETE FROM Comentarios WHERE Comentario_ID = ?';
        const values = [commentId];

        const [result] = await db.query(query, values);

        // Comprobar si se eliminó algún comentario
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Comentario no encontrado.' });
        }

        res.status(200).json({ message: 'Comentario eliminado exitosamente.' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error al eliminar el comentario.' });
    }
});
// Ruta para agregar a Inscritos
router.post('/inscritos', verifyToken, async (req, res) => {
    const { Cliente_ID } = req.body;

    if (!Cliente_ID) {
        return res.status(400).json({ message: 'Cliente_ID es requerido.' });
    }

    try {
        // Asegúrate de tener la estructura de la tabla y los nombres de columnas correctos
        await db.query('INSERT INTO Inscritos (Cliente_ID) VALUES (?)', [Cliente_ID]);
        res.status(201).json({ message: 'Cliente agregado a Inscritos.' });
    } catch (error) {
        console.error('Error al agregar a Inscritos:', error);
        res.status(500).json({ message: 'Error al agregar a Inscritos.' });
    }
});
// Ruta para agregar a Masivos
router.post('/masivos', verifyToken, async (req, res) => {
    const { Cliente_ID } = req.body;

    if (!Cliente_ID) {
        return res.status(400).json({ message: 'Cliente_ID es requerido.' });
    }

    try {
        // Asegúrate de tener la estructura de la tabla y los nombres de columnas correctos
        await db.query('INSERT INTO Masivos (Cliente_ID) VALUES (?)', [Cliente_ID]);
        res.status(201).json({ message: 'Cliente agregado a Masivos.' });
    } catch (error) {
        console.error('Error al agregar a Masivos:', error);
        res.status(500).json({ message: 'Error al agregar a Masivos.' });
    }
});

// Ruta para agregar a NoQuiere
router.post('/noquiere', verifyToken, async (req, res) => {
    const { Cliente_ID } = req.body;

    if (!Cliente_ID) {
        return res.status(400).json({ message: 'Cliente_ID es requerido.' });
    }

    try {
        // Asegúrate de tener la estructura de la tabla y los nombres de columnas correctos
        await db.query('INSERT INTO NoQuiere (Cliente_ID) VALUES (?)', [Cliente_ID]);
        res.status(201).json({ message: 'Cliente agregado a Masivos.' });
    } catch (error) {
        console.error('Error al agregar a Masivos:', error);
        res.status(500).json({ message: 'Error al agregar a Masivos.' });
    }
});

// EDITAR un lead por su ID
router.put('/leads/:id', verifyToken, async (req, res) => {
    const leadId = req.params.id; // Obtenemos el ID del lead desde los parámetros de la ruta
    const ejecutivoId = req.query.ejecutivoId || req.user.id;
    const { nombre, ciudad, cursoId, interes,  numero } = req.body;

    // Validar los datos del lead
    // if (!nombre || !ciudad || !interes || !numero || !cursoId) {
    //     return res.status(400).json({ message: 'Todos los campos son requeridos para editar el lead.' });
    // }

    try {
        // Consulta para actualizar el lead
        const query = `
            UPDATE Leads 
            SET Nombre = ?, Ciudad = ?, Curso_ID = ?, Interes = ?, Numero = ? 
            WHERE Cliente_ID = ? AND Ejecutivo_ID = ?
        `;
        const values = [nombre, ciudad, cursoId, interes || 0, numero, leadId, ejecutivoId];

        const [result] = await db.execute(query, values);

        // Verificar si se actualizó algún lead
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Lead no encontrado o no autorizado para editar.' });
        }

        // Retornar el lead actualizado
        const updatedLeadQuery = `
            SELECT L.Cliente_ID, L.Nombre, L.Ciudad, L.Numero, L.Interes, C.Nombre AS CursoNombre
            FROM Leads L
            JOIN Cursos C ON L.Curso_ID = C.Curso_ID
            WHERE L.Cliente_ID = ? AND L.Ejecutivo_ID = ?
        `;
        const [updatedLead] = await db.execute(updatedLeadQuery, [leadId, req.user.id]);
        
        res.status(200).json(updatedLead[0]); // Retorna el lead actualizado con el nombre del curso
    } catch (error) {
        console.error('Error al actualizar el lead:', error);
        res.status(500).json({ message: 'Error al actualizar el lead.' });
    }
});

// para cambiar de ejecutivo 
router.put('/leads/:id/change-executive', verifyToken, async (req, res) => {
    const leadId = req.params.id;
    const { ejecutivoId } = req.body;

    if (!ejecutivoId) {
        return res.status(400).json({ message: 'El ID del ejecutivo es requerido.' });
    }

    try {
        // Verificar que el ejecutivo existe antes de hacer la actualización
        const executiveCheckQuery = `SELECT * FROM Ejecutivos WHERE Ejecutivo_ID = ?`;
        const [executiveResult] = await db.execute(executiveCheckQuery, [ejecutivoId]);

        if (executiveResult.length === 0) {
            return res.status(400).json({ message: 'El ID del ejecutivo no existe.' });
        }

        const query = `UPDATE Leads SET Ejecutivo_ID = ? WHERE Cliente_ID = ?`;
        const values = [ejecutivoId, leadId];

        const [result] = await db.execute(query, values);

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Lead no encontrado o no autorizado para editar.' });
        }

        res.status(200).json({ message: 'Ejecutivo cambiado con éxito' });
    } catch (error) {
        console.error('Error al cambiar el ejecutivo:', error);
        res.status(500).json({ message: 'Error al cambiar el ejecutivo.' });
    }
});




// Obtener todos los ejecutivos
router.get('/ejecutivos', verifyToken, async (req, res) => {
    try {
        const query = 'SELECT Ejecutivo_ID, Nombre FROM Ejecutivos'; // Asegúrate de que la consulta sea correcta
        const [executives] = await db.execute(query);
        res.status(200).json(executives);
    } catch (error) {
        console.error('Error al obtener los ejecutivos:', error);
        res.status(500).json({ message: 'Error al obtener los ejecutivos.' });
    }
});
// ELIMINAR un lead por su ID
router.delete('/leads/:id', verifyToken, async (req, res) => {
    const leadId = req.params.id; // Obtenemos el ID del lead desde los parámetros de la ruta
    const ejecutivoId = req.query.ejecutivoId || req.user.id;
    try {
        // Primero, elimina los comentarios asociados al lead
        await db.execute('DELETE FROM Comentarios WHERE Cliente_ID = ?', [leadId]);

        // Ahora, elimina el lead
        const query = 'DELETE FROM Leads WHERE Cliente_ID = ? AND Ejecutivo_ID = ?';
        const values = [leadId, ejecutivoId];

        const [result] = await db.execute(query, values);

        // Comprobar si se eliminó algún lead
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Lead no encontrado o no autorizado para eliminar.' });
        }

        res.status(200).json({ message: 'Lead eliminado exitosamente.' });
    } catch (error) {
        console.error('Error al eliminar el lead:', error);
        res.status(500).json({ message: 'Error al eliminar el lead.' });
    }
});

//-------------------------------------------- para inscritos --------------------------------------------

router.get('/inscritos', verifyToken, async (req, res) => {
    const ejecutivoId = req.query.ejecutivoId || req.user.id; // Obtener ejecutivoId de la query, o usar el del token si no se pasa
    try {
        const [results] = await db.execute(`
            SELECT 
                L.Cliente_ID,
                L.Nombre,
                L.Numero, 
                L.Ciudad, 
                C.Nombre AS CursoNombre, 
                C.Fecha AS Fecha,
                L.Interes, 
                COALESCE(LC.UltimoComentario, 'Sin Comentarios') AS UltimoComentario,
                LC.FechaComentario, -- Mostrar la fecha del comentario más reciente
                DATE(L.FechaCreacion) AS FechaCreacion -- Obtener solo la fecha sin la hora
            FROM 
                Leads L
            JOIN 
                Cursos C ON L.Curso_ID = C.Curso_ID
            LEFT JOIN (
                SELECT 
                    Comentarios.Cliente_ID, 
                    Comentarios.Comentario AS UltimoComentario, 
                    Comentarios.Fecha AS FechaComentario
                FROM 
                    Comentarios
                INNER JOIN (
                    SELECT 
                        Cliente_ID, 
                        MAX(Fecha) AS FechaMaxima -- Seleccionamos la fecha más reciente por cada Cliente_ID
                    FROM 
                        Comentarios
                    GROUP BY 
                        Cliente_ID
                ) AS MaxFechas 
                ON Comentarios.Cliente_ID = MaxFechas.Cliente_ID 
                AND Comentarios.Fecha = MaxFechas.FechaMaxima -- Aseguramos que tomamos el comentario más reciente
            ) LC ON L.Cliente_ID = LC.Cliente_ID
            WHERE 
                L.Cliente_ID IN (SELECT Cliente_ID FROM Inscritos) -- Solo incluir clientes en la tabla Inscritos
                AND L.Ejecutivo_ID = ?
            ORDER BY 
                L.FechaCreacion DESC -- Ordenar por la fecha de creación de manera descendente
        `, [ejecutivoId]);

        res.json(results);
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Error al obtener leads' });
    }
});

// Agregar un nuevo lead y un nuevo curso
router.post('/newinscritos', verifyToken, async (req, res) => {
    console.log(req.body); // Muestra los datos que estás enviando

    const { nombre, ciudad, cursoId, interes, numero } = req.body;

    const ejecutivoId = req.query.ejecutivoId || req.user.id; // Obtener ejecutivoId de la query, o usar el del token si no se pasa

    try {
        // Crear el nuevo lead usando el ID del curso
        const [leadResult] = await db.execute(
            'INSERT INTO Leads (Nombre, Ciudad, Curso_ID, Interes, Numero, Ejecutivo_ID) VALUES (?, ?, ?, ?, ?, ?)',
            [nombre, ciudad, cursoId, interes, numero, ejecutivoId]
        );

        const clienteId = leadResult.insertId; // Obtener el ID del nuevo lead creado
        console.log('Nuevo Cliente_ID:', clienteId); // Verifica que obtienes el clienteId

        // Insertar el Cliente_ID en la tabla Inscritos
        const [inscritosResult] = await db.execute(
            'INSERT INTO Inscritos (Cliente_ID) VALUES (?)',
            [clienteId]
        );

        res.status(201).json({ message: 'Lead agregado exitosamente y Cliente_ID insertado en Inscritos', leadId: clienteId });
    } catch (error) {
        console.error('Error en la inserción:', error); // Muestra el error
        res.status(500).json({ message: 'Error al agregar el lead.', error: error.message });
    }
});


// Eliminar un lead de la tabla Inscritos por Cliente_ID
router.delete('/inscritos/:clienteId', verifyToken, async (req, res) => {
    const clienteId = req.params.clienteId;

    try {
        const [result] = await db.execute('DELETE FROM Inscritos WHERE Cliente_ID = ?', [clienteId]);

        if (result.affectedRows > 0) {
            res.json({ message: 'Lead eliminado de Inscritos correctamente' });
        } else {
            res.status(404).json({ message: 'Lead no encontrado en Inscritos' });
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error al eliminar el lead de Inscritos' });
    }
});

// Obtener todas las ciudades del ejecutivo logueado cuyos Cliente_ID estén en la tabla Masivos
router.get('/ciudadesinscritos', verifyToken, async (req, res) => {
    const ejecutivoId = req.query.ejecutivoId || req.user.id; 
    console.log("(inscritos )Este es el ID del ejecutivo para la consulta de ciudades: " + ejecutivoId);
    try {
        const [results] = await db.execute(`
            SELECT DISTINCT Leads.Ciudad 
            FROM Leads 
            INNER JOIN Inscritos ON Leads.Cliente_ID = Inscritos.Cliente_ID
            WHERE Leads.Ejecutivo_ID = ?
        `, [ejecutivoId]);

        // Devuelve solo los nombres de las ciudades
        res.json(results.map(row => row.Ciudad));
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Error al obtener las ciudades.' });
    }
});
// Obtener estadísticas de inscritos por curso para un ejecutivo específico
router.get('/estadisticas/:ejecutivoId', verifyToken, async (req, res) => {
    const { ejecutivoId } = req.params; // Obtén el ID del ejecutivo desde los parámetros

    try {
        const query = `
            SELECT 
                c.Nombre AS CursoNombre, 
                COUNT(l.Curso_ID) AS CantidadInscritos,
                DATE(c.Fecha) AS Fecha
            FROM 
                Leads l
            JOIN 
                Cursos c ON l.Curso_ID = c.Curso_ID
            JOIN 
                Inscritos i ON i.Cliente_ID = l.Cliente_ID 
            WHERE 
                l.Ejecutivo_ID = ?
            GROUP BY 
                l.Curso_ID
            ORDER BY 
                Fecha DESC;
        `;
        
        const [rows] = await db.execute(query, [ejecutivoId]); // Ejecutar la consulta
        res.status(200).json(rows); // Enviar los resultados como respuesta
    } catch (error) {
        console.error('Error al obtener las estadísticas de inscritos por curso:', error);
        res.status(500).json({ message: 'Error al obtener estadísticas de inscritos por curso.' });
    }
});



//-------------------------------------------- para masivos --------------------------------------------

router.get('/masivos', verifyToken, async (req, res) => {
    const ejecutivoId = req.query.ejecutivoId || req.user.id; // Obtener ejecutivoId de la query, o usar el del token si no se pasa
    try {
        const [results] = await db.execute(`
            SELECT 
                L.Cliente_ID,
                L.Nombre,
                L.Numero, 
                L.Ciudad, 
                C.Nombre AS CursoNombre, 
                C.Fecha AS Fecha,
                L.Interes, 
                COALESCE(LC.UltimoComentario, 'Sin Comentarios') AS UltimoComentario,
                LC.FechaComentario, -- Mostrar la fecha del comentario más reciente
                DATE(L.FechaCreacion) AS FechaCreacion -- Obtener solo la fecha sin la hora
            FROM 
                Leads L
            JOIN 
                Cursos C ON L.Curso_ID = C.Curso_ID
            LEFT JOIN (
                SELECT 
                    Comentarios.Cliente_ID, 
                    Comentarios.Comentario AS UltimoComentario, 
                    Comentarios.Fecha AS FechaComentario
                FROM 
                    Comentarios
                INNER JOIN (
                    SELECT 
                        Cliente_ID, 
                        MAX(Fecha) AS FechaMaxima -- Seleccionamos la fecha más reciente por cada Cliente_ID
                    FROM 
                        Comentarios
                    GROUP BY 
                        Cliente_ID
                ) AS MaxFechas 
                ON Comentarios.Cliente_ID = MaxFechas.Cliente_ID 
                AND Comentarios.Fecha = MaxFechas.FechaMaxima -- Aseguramos que tomamos el comentario más reciente
            ) LC ON L.Cliente_ID = LC.Cliente_ID
            WHERE 
                L.Cliente_ID IN (SELECT Cliente_ID FROM Masivos) -- Solo incluir clientes en la tabla Inscritos
                AND L.Ejecutivo_ID = ?
            ORDER BY 
                L.FechaCreacion DESC -- Ordenar por la fecha de creación de manera descendente
        `, [ejecutivoId]);

        res.json(results);
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Error al obtener leads' });
    }
});

// Agregar un nuevo lead y un nuevo curso
router.post('/newmasivos', verifyToken, async (req, res) => {
    console.log(req.body); // Muestra los datos que estás enviando

    const { nombre, ciudad, cursoId, interes, numero } = req.body;

    const ejecutivoId = req.query.ejecutivoId || req.user.id; // Obtener ejecutivoId de la query, o usar el del token si no se pasa

    try {
        // Crear el nuevo lead usando el ID del curso
        const [leadResult] = await db.execute(
            'INSERT INTO Leads (Nombre, Ciudad, Curso_ID, Interes, Numero, Ejecutivo_ID) VALUES (?, ?, ?, ?, ?, ?)',
            [nombre, ciudad, cursoId, interes, numero, ejecutivoId]
        );

        const clienteId = leadResult.insertId; // Obtener el ID del nuevo lead creado
        console.log('Nuevo Cliente_ID:', clienteId); // Verifica que obtienes el clienteId

        // Insertar el Cliente_ID en la tabla Masivos
        const [masivosResult] = await db.execute(
            'INSERT INTO Masivos (Cliente_ID) VALUES (?)',
            [clienteId]
        );

        res.status(201).json({ message: 'Lead agregado exitosamente y Cliente_ID insertado en Masivos', leadId: clienteId });
    } catch (error) {
        console.error('Error en la inserción:', error); // Muestra el error
        res.status(500).json({ message: 'Error al agregar el lead.', error: error.message });
    }
});


// Eliminar un lead de la tabla Masivos por Cliente_ID
router.delete('/masivos/:clienteId', verifyToken, async (req, res) => {
    const clienteId = req.params.clienteId;

    try {
        const [result] = await db.execute('DELETE FROM Masivos WHERE Cliente_ID = ?', [clienteId]);

        if (result.affectedRows > 0) {
            res.json({ message: 'Lead eliminado de Masivos correctamente' });
        } else {
            res.status(404).json({ message: 'Lead no encontrado en Masivos' });
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error al eliminar el lead de Masivos' });
    }
});

// Obtener todas las ciudades del ejecutivo logueado cuyos Cliente_ID estén en la tabla Masivos
router.get('/ciudadesmasivos', verifyToken, async (req, res) => {
    const ejecutivoId = req.query.ejecutivoId || req.user.id; 
    console.log("(Masivos )Este es el ID del ejecutivo para la consulta de ciudades: " + ejecutivoId);
    try {
        const [results] = await db.execute(`
            SELECT DISTINCT Leads.Ciudad 
            FROM Leads 
            INNER JOIN Masivos ON Leads.Cliente_ID = Masivos.Cliente_ID
            WHERE Leads.Ejecutivo_ID = ?
        `, [ejecutivoId]);

        // Devuelve solo los nombres de las ciudades
        res.json(results.map(row => row.Ciudad));
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Error al obtener las ciudades.' });
    }
});

// Obtener estadísticas de inscritos por curso para un ejecutivo específico
router.get('/estadisticasmasivos/:ejecutivoId', verifyToken, async (req, res) => {
    const { ejecutivoId } = req.params; // Obtén el ID del ejecutivo desde los parámetros

    try {
        const query = `
            SELECT 
                l.Ciudad AS Ciudad, 
                COUNT(m.Cliente_ID) AS CantidadInscritos
            FROM 
                Leads l
            JOIN 
                Masivos m ON m.Cliente_ID = l.Cliente_ID 
            WHERE 
                l.Ejecutivo_ID = ?
            GROUP BY 
                l.Ciudad

        `;
        
        const [rows] = await db.execute(query, [ejecutivoId]); // Ejecutar la consulta
        res.status(200).json(rows); // Enviar los resultados como respuesta
    } catch (error) {
        console.error('Error al obtener las estadísticas de inscritos por curso:', error);
        res.status(500).json({ message: 'Error al obtener estadísticas de inscritos por curso.' });
    }
});


//-------------------------------------------- para noquiere --------------------------------------------

router.get('/noquiere', verifyToken, async (req, res) => {
    const ejecutivoId = req.query.ejecutivoId || req.user.id; // Obtener ejecutivoId de la query, o usar el del token si no se pasa
    try {
        const [results] = await db.execute(`
            SELECT 
                L.Cliente_ID,
                L.Nombre,
                L.Numero, 
                L.Ciudad, 
                C.Nombre AS CursoNombre, 
                C.Fecha AS Fecha,
                L.Interes, 
                COALESCE(LC.UltimoComentario, 'Sin Comentarios') AS UltimoComentario,
                LC.FechaComentario, -- Mostrar la fecha del comentario más reciente
                DATE(L.FechaCreacion) AS FechaCreacion -- Obtener solo la fecha sin la hora
            FROM 
                Leads L
            JOIN 
                Cursos C ON L.Curso_ID = C.Curso_ID
            LEFT JOIN (
                SELECT 
                    Comentarios.Cliente_ID, 
                    Comentarios.Comentario AS UltimoComentario, 
                    Comentarios.Fecha AS FechaComentario
                FROM 
                    Comentarios
                INNER JOIN (
                    SELECT 
                        Cliente_ID, 
                        MAX(Fecha) AS FechaMaxima -- Seleccionamos la fecha más reciente por cada Cliente_ID
                    FROM 
                        Comentarios
                    GROUP BY 
                        Cliente_ID
                ) AS MaxFechas 
                ON Comentarios.Cliente_ID = MaxFechas.Cliente_ID 
                AND Comentarios.Fecha = MaxFechas.FechaMaxima -- Aseguramos que tomamos el comentario más reciente
            ) LC ON L.Cliente_ID = LC.Cliente_ID
            WHERE 
                L.Cliente_ID IN (SELECT Cliente_ID FROM NoQuiere) -- Solo incluir clientes en la tabla Inscritos
                AND L.Ejecutivo_ID = ?
            ORDER BY 
                L.FechaCreacion DESC -- Ordenar por la fecha de creación de manera descendente
        `, [ejecutivoId]);

        res.json(results);
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Error al obtener leads' });
    }
});

// Agregar un nuevo lead y un nuevo curso
router.post('/newnoquiere', verifyToken, async (req, res) => {
    console.log(req.body); // Muestra los datos que estás enviando

    const { nombre, ciudad, cursoId, interes, numero } = req.body;
    const ejecutivoId = req.query.ejecutivoId || req.user.id; // Obtener ejecutivoId de la query, o usar el del token si no se pasa
    console.log("Se agrego para el cliente: " + ejecutivoId);
    try {
        // Crear el nuevo lead usando el ID del curso
        const [leadResult] = await db.execute(
            'INSERT INTO Leads (Nombre, Ciudad, Curso_ID, Interes, Numero, Ejecutivo_ID) VALUES (?, ?, ?, ?, ?, ?)',
            [nombre, ciudad, cursoId, interes, numero, ejecutivoId]
        );

        const clienteId = leadResult.insertId; // Obtener el ID del nuevo lead creado
        console.log('Nuevo Cliente_ID:', clienteId); // Verifica que obtienes el clienteId

        // Insertar el Cliente_ID en la tabla NoQuiere
        const [noquiereResult] = await db.execute(
            'INSERT INTO NoQuiere (Cliente_ID) VALUES (?)',
            [clienteId]
        );

        res.status(201).json({ message: 'Lead agregado exitosamente y Cliente_ID insertado en NoQuiere', leadId: clienteId });
    } catch (error) {
        console.error('Error en la inserción:', error); // Muestra el error
        res.status(500).json({ message: 'Error al agregar el lead.', error: error.message });
    }
});


// Eliminar un lead de la tabla NoQuiere por Cliente_ID
router.delete('/noquiere/:clienteId', verifyToken, async (req, res) => {
    const clienteId = req.params.clienteId;

    try {
        const [result] = await db.execute('DELETE FROM NoQuiere WHERE Cliente_ID = ?', [clienteId]);

        if (result.affectedRows > 0) {
            res.json({ message: 'Lead eliminado de NoQuiere correctamente' });
        } else {
            res.status(404).json({ message: 'Lead no encontrado en NoQuiere' });
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error al eliminar el lead de NoQuiere' });
    }
});

// Obtener todas las ciudades del ejecutivo logueado cuyos Cliente_ID estén en la tabla NoQuiere
router.get('/ciudadesnoquiere', verifyToken, async (req, res) => {
    const ejecutivoId = req.query.ejecutivoId || req.user.id; 
    console.log("(No quiere )Este es el ID del ejecutivo para la consulta de ciudades: " + ejecutivoId);
    try {
        const [results] = await db.execute(`
            SELECT DISTINCT Leads.Ciudad 
            FROM Leads 
            INNER JOIN NoQuiere ON Leads.Cliente_ID = NoQuiere.Cliente_ID
            WHERE Leads.Ejecutivo_ID = ?
        `, [ejecutivoId]);

        // Devuelve solo los nombres de las ciudades
        res.json(results.map(row => row.Ciudad));
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Error al obtener las ciudades.' });
    }
});


// Obtener estadísticas de inscritos por curso para un ejecutivo específico
router.get('/estadisticasnoquiere/:ejecutivoId', verifyToken, async (req, res) => {
    const { ejecutivoId } = req.params; // Obtén el ID del ejecutivo desde los parámetros

    try {
        const query = `
            SELECT 
                l.Ciudad AS Ciudad, 
                COUNT(m.Cliente_ID) AS CantidadInscritos
            FROM 
                Leads l
            JOIN 
                NoQuiere m ON m.Cliente_ID = l.Cliente_ID 
            WHERE 
                l.Ejecutivo_ID = ?
            GROUP BY 
                l.Ciudad

        `;
        
        const [rows] = await db.execute(query, [ejecutivoId]); // Ejecutar la consulta
        res.status(200).json(rows); // Enviar los resultados como respuesta
    } catch (error) {
        console.error('Error al obtener las estadísticas de inscritos por curso:', error);
        res.status(500).json({ message: 'Error al obtener estadísticas de inscritos por curso.' });
    }
});


//-------------------------------------------- para cambiar de cuenta (solo para admis) --------------------------------------------

// Obtener la lista de todos los ejecutivos (solo para administradores)
router.get('/admiejecutivos', verifyToken, async (req, res) => {
    console.log("este es ele admi?: "+req.user.role);
    try {
        // Asegurarse de que el usuario sea administrador
        if (req.user.role !== 'admin') {
            return res.status(403).json({ message: 'Acceso denegado. Solo para administradores.' });
        }

        const [results] = await db.execute(`SELECT Ejecutivo_ID, Nombre FROM Ejecutivos`);

        res.json(results); // Devuelve la lista de ejecutivos
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Error al obtener los ejecutivos.' });
    }
});

// Obtener los detalles de un ejecutivo por su ID
router.get('/ejecutivo/:id', verifyToken, async (req, res) => {
    const ejecutivoId = req.params.id;

    try {
        const [results] = await db.execute(`
            SELECT Nombre FROM Ejecutivos WHERE Ejecutivo_ID = ?
        `, [ejecutivoId]);

        if (results.length > 0) {
            res.json({ nombre: results[0].Nombre });
        } else {
            res.status(404).json({ message: 'Ejecutivo no encontrado.' });
        }
    } catch (error) {
        console.error('Error al obtener el ejecutivo:', error);
        res.status(500).json({ message: 'Error al obtener el ejecutivo.' });
    }
});


// ------------------para exportar -------------

// Filtrar leads
// API para filtrar leads según criterios específicos
// Obtener leads filtrados
router.post('/filtrar', verifyToken, async (req, res) => {
    const { ciudad, cursoId, interes, fechaDesde, fechaHasta, status, ejecutivoId } = req.body;

    let query = `
        SELECT 
            Leads.Nombre, 
            Leads.Numero, 
            Leads.Ciudad, 
            Cursos.Nombre AS Curso, 
            Leads.Interes, 
            DATE(Leads.FechaCreacion) AS FechaCreacion,
            (SELECT Comentario FROM Comentarios WHERE Cliente_ID = Leads.Cliente_ID ORDER BY Fecha DESC LIMIT 1) AS UltimoComentario
        FROM Leads
        JOIN Cursos ON Leads.Curso_ID = Cursos.Curso_ID
        LEFT JOIN Inscritos ON Leads.Cliente_ID = Inscritos.Cliente_ID
        LEFT JOIN Masivos ON Leads.Cliente_ID = Masivos.Cliente_ID
        LEFT JOIN NoQuiere ON Leads.Cliente_ID = NoQuiere.Cliente_ID
        WHERE Leads.Ejecutivo_ID = ?
    `;

    const params = [ejecutivoId];

    // Aplicar filtros
    if (ciudad) {
        query += " AND Leads.Ciudad = ?";
        params.push(ciudad);
    }
    if (cursoId) {
        query += " AND Leads.Curso_ID = ?";
        params.push(cursoId);
    }
    if (interes) {
        query += " AND Leads.Interes = ?";
        params.push(interes);
    }
    if (fechaDesde) {
        query += " AND Leads.FechaCreacion >= ?";
        params.push(fechaDesde);
    }
    if (fechaHasta) {
        query += " AND Leads.FechaCreacion <= ?";
        params.push(fechaHasta);
    }

    // Filtrar según el estado seleccionado
    if (status === 'Leads') {
        query += " AND Inscritos.Cliente_ID IS NULL AND Masivos.Cliente_ID IS NULL AND NoQuiere.Cliente_ID IS NULL";
    } else if (status === 'Inscritos') {
        query += " AND Inscritos.Cliente_ID IS NOT NULL";
    } else if (status === 'Masivos') {
        query += " AND Masivos.Cliente_ID IS NOT NULL";
    } else if (status === 'NoQuiere') {
        query += " AND NoQuiere.Cliente_ID IS NOT NULL";
    }

    try {
        const [results] = await db.execute(query, params);
        res.json(results);
    } catch (error) {
        console.error('Error al obtener los leads filtrados:', error);
        res.status(500).json({ message: 'Error al obtener los leads filtrados' });
    }
});


// Obtener todas las ciudades del ejecutivo logueado
router.get('/ciudadesfiltro', verifyToken, async (req, res) => {
    const ejecutivoId = req.query.ejecutivoId || req.user.id; 
    console.log("(Leads)Este es el ID del ejecutivo para la consulta de ciudades: " + ejecutivoId);
    
    try {
        const [results] = await db.execute(`
            SELECT DISTINCT Leads.Ciudad 
            FROM Leads 
            WHERE Leads.Ejecutivo_ID = ?
        `, [ejecutivoId]);

        res.json(results.map(row => row.Ciudad)); // Devuelve solo los nombres de las ciudades
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Error al obtener las ciudades.' });
    }
});




module.exports = router;
