const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 5000;

// PostgreSQL connection
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

// Middleware
app.use(cors());
app.use(express.json());

// Root route
app.get("/", (req, res) => {
    res.json({
        message: "Deadline App backend is running!"
    });
});

// Database health check
app.get("/api/health", async (req, res) => {
    try {
        const result = await pool.query("SELECT NOW()");

        res.json({
            status: "OK",
            database: "Connected",
            time: result.rows[0].now
        });
    } catch (error) {
        console.error("Database connection error:", error);

        res.status(500).json({
            status: "ERROR",
            database: "Not connected"
        });
    }
});

// Get all deadlines
app.get("/api/deadlines", async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT
                id,
                title,
                TO_CHAR(deadline_date, 'YYYY-MM-DD') AS date,
                TO_CHAR(deadline_time, 'HH24:MI') AS time,
                LOWER(priority) AS priority,
                notes,
                completed,
                created_at
            FROM deadlines
            ORDER BY deadline_date ASC, deadline_time ASC
        `);

        res.json(result.rows);

    } catch (error) {
        console.error("Error fetching deadlines:", error);

        res.status(500).json({
            error: "Failed to fetch deadlines"
        });
    }
});

// Create a new deadline
app.post("/api/deadlines", async (req, res) => {
    try {
        const {
            title,
            date,
            time,
            priority,
            notes,
            completed
        } = req.body;

        if (!title || !date) {
            return res.status(400).json({
                error: "Title and date are required"
            });
        }

        const result = await pool.query(
            `
            INSERT INTO deadlines
            (title, deadline_date, deadline_time, priority, notes, completed)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING
                id,
                title,
                TO_CHAR(deadline_date, 'YYYY-MM-DD') AS date,
                TO_CHAR(deadline_time, 'HH24:MI') AS time,
                LOWER(priority) AS priority,
                notes,
                completed,
                created_at
            `,
            [
                title,
                date,
                time || null,
                priority || "medium",
                notes || "",
                completed || false
            ]
        );

        res.status(201).json(result.rows[0]);

    } catch (error) {
        console.error("Error creating deadline:", error);

        res.status(500).json({
            error: "Failed to create deadline"
        });
    }
});

// Update a deadline
app.put("/api/deadlines/:id", async (req, res) => {
    try {
        const { id } = req.params;

        const {
            title,
            date,
            time,
            priority,
            notes,
            completed
        } = req.body;

        const result = await pool.query(
            `
            UPDATE deadlines
            SET
                title = $1,
                deadline_date = $2,
                deadline_time = $3,
                priority = $4,
                notes = $5,
                completed = $6
            WHERE id = $7
            RETURNING
                id,
                title,
                TO_CHAR(deadline_date, 'YYYY-MM-DD') AS date,
                TO_CHAR(deadline_time, 'HH24:MI') AS time,
                LOWER(priority) AS priority,
                notes,
                completed,
                created_at
            `,
            [
                title,
                date,
                time || null,
                priority || "medium",
                notes || "",
                completed || false,
                id
            ]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                error: "Deadline not found"
            });
        }

        res.json(result.rows[0]);

    } catch (error) {
        console.error("Error updating deadline:", error);

        res.status(500).json({
            error: "Failed to update deadline"
        });
    }
});

// Delete a deadline
app.delete("/api/deadlines/:id", async (req, res) => {
    try {
        const { id } = req.params;

        const result = await pool.query(
            `
            DELETE FROM deadlines
            WHERE id = $1
            RETURNING id
            `,
            [id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                error: "Deadline not found"
            });
        }

        res.json({
            message: "Deadline deleted successfully",
            id: Number(id)
        });

    } catch (error) {
        console.error("Error deleting deadline:", error);

        res.status(500).json({
            error: "Failed to delete deadline"
        });
    }
});

// Start server
app.listen(PORT, () => {
    console.log(`Backend running on http://localhost:${PORT}`);
});