const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 5000;

// ===============================
// DATABASE
// ===============================

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

// ===============================
// MIDDLEWARE
// ===============================

app.use(cors({
    origin: "https://navkarjain21.github.io"
}));

app.use(express.json());

const JWT_SECRET = process.env.JWT_SECRET;

// ===============================
// AUTHENTICATION MIDDLEWARE
// ===============================

function authenticateToken(req, res, next) {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({
            error: "Authentication required"
        });
    }

    const token = authHeader.split(" ")[1];

    try {
        const decoded = jwt.verify(
            token,
            JWT_SECRET
        );

        req.user = decoded;

        next();

    } catch (error) {
        return res.status(401).json({
            error: "Invalid or expired token"
        });
    }
}

// ===============================
// ROOT
// ===============================

app.get("/", (req, res) => {
    res.json({
        message: "Deadline App backend is running!"
    });
});

// ===============================
// HEALTH CHECK
// ===============================

app.get("/api/health", async (req, res) => {
    try {
        const result = await pool.query(
            "SELECT NOW()"
        );

        res.json({
            status: "OK",
            database: "Connected",
            time: result.rows[0].now
        });

    } catch (error) {
        console.error(
            "Database connection error:",
            error
        );

        res.status(500).json({
            status: "ERROR",
            database: "Not connected"
        });
    }
});

// ===============================
// REGISTER
// ===============================

app.post("/api/auth/register", async (req, res) => {
    try {
        const {
            name,
            email,
            password
        } = req.body;

        if (!name || !email || !password) {
            return res.status(400).json({
                error:
                    "Name, email, and password are required"
            });
        }

        if (name.trim().length < 2) {
            return res.status(400).json({
                error:
                    "Name must contain at least 2 characters"
            });
        }

        if (password.length < 6) {
            return res.status(400).json({
                error:
                    "Password must be at least 6 characters"
            });
        }

        const normalizedEmail =
            email.trim().toLowerCase();

        const existingUser =
            await pool.query(
                `
                SELECT id
                FROM users
                WHERE email = $1
                `,
                [normalizedEmail]
            );

        if (existingUser.rows.length > 0) {
            return res.status(409).json({
                error:
                    "An account with this email already exists"
            });
        }

        const passwordHash =
            await bcrypt.hash(
                password,
                12
            );

        const result =
            await pool.query(
                `
                INSERT INTO users
                (
                    name,
                    email,
                    password_hash
                )
                VALUES
                ($1, $2, $3)
                RETURNING
                    id,
                    name,
                    email,
                    created_at
                `,
                [
                    name.trim(),
                    normalizedEmail,
                    passwordHash
                ]
            );

        const user = result.rows[0];

        const token =
            jwt.sign(
                {
                    userId: user.id,
                    email: user.email
                },
                JWT_SECRET,
                {
                    expiresIn: "7d"
                }
            );

        res.status(201).json({
            message:
                "Account created successfully",
            token,
            user
        });

    } catch (error) {
        console.error(
            "Registration error:",
            error
        );

        res.status(500).json({
            error:
                "Failed to create account"
        });
    }
});

// ===============================
// LOGIN
// ===============================

app.post("/api/auth/login", async (req, res) => {
    try {
        const {
            email,
            password
        } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                error:
                    "Email and password are required"
            });
        }

        const normalizedEmail =
            email.trim().toLowerCase();

        const result =
            await pool.query(
                `
                SELECT
                    id,
                    name,
                    email,
                    password_hash,
                    created_at
                FROM users
                WHERE email = $1
                `,
                [normalizedEmail]
            );

        if (result.rows.length === 0) {
            return res.status(401).json({
                error:
                    "Invalid email or password"
            });
        }

        const user = result.rows[0];

        const passwordMatches =
            await bcrypt.compare(
                password,
                user.password_hash
            );

        if (!passwordMatches) {
            return res.status(401).json({
                error:
                    "Invalid email or password"
            });
        }

        const token =
            jwt.sign(
                {
                    userId: user.id,
                    email: user.email
                },
                JWT_SECRET,
                {
                    expiresIn: "7d"
                }
            );

        res.json({
            message:
                "Login successful",

            token,

            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                created_at: user.created_at
            }
        });

    } catch (error) {
        console.error(
            "Login error:",
            error
        );

        res.status(500).json({
            error:
                "Failed to login"
        });
    }
});

// ===============================
// GET DEADLINES
// ===============================

app.get(
    "/api/deadlines",
    authenticateToken,
    async (req, res) => {
        try {
            const result =
                await pool.query(
                    `
                    SELECT
                        id,
                        title,
                        TO_CHAR(
                            deadline_date,
                            'YYYY-MM-DD'
                        ) AS date,
                        TO_CHAR(
                            deadline_time,
                            'HH24:MI'
                        ) AS time,
                        LOWER(priority)
                            AS priority,
                        notes,
                        completed,
                        created_at
                    FROM deadlines
                    WHERE user_id = $1
                    ORDER BY
                        deadline_date ASC,
                        deadline_time ASC
                    `,
                    [req.user.userId]
                );

            res.json(result.rows);

        } catch (error) {
            console.error(
                "Error fetching deadlines:",
                error
            );

            res.status(500).json({
                error:
                    "Failed to fetch deadlines"
            });
        }
    }
);

// ===============================
// CREATE DEADLINE
// ===============================

app.post(
    "/api/deadlines",
    authenticateToken,
    async (req, res) => {
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
                    error:
                        "Title and date are required"
                });
            }

            if (
                ![
                    "high",
                    "medium",
                    "low"
                ].includes(
                    priority?.toLowerCase()
                )
            ) {
                return res.status(400).json({
                    error:
                        "Priority must be high, medium, or low"
                });
            }

            const today =
                new Date()
                    .toISOString()
                    .split("T")[0];

            if (date < today) {
                return res.status(400).json({
                    error:
                        "Deadline date cannot be in the past"
                });
            }

            const result =
                await pool.query(
                    `
                    INSERT INTO deadlines
                    (
                        user_id,
                        title,
                        deadline_date,
                        deadline_time,
                        priority,
                        notes,
                        completed
                    )
                    VALUES
                    (
                        $1,
                        $2,
                        $3,
                        $4,
                        $5,
                        $6,
                        $7
                    )
                    RETURNING
                        id,
                        title,
                        TO_CHAR(
                            deadline_date,
                            'YYYY-MM-DD'
                        ) AS date,
                        TO_CHAR(
                            deadline_time,
                            'HH24:MI'
                        ) AS time,
                        LOWER(priority)
                            AS priority,
                        notes,
                        completed,
                        created_at
                    `,
                    [
                        req.user.userId,
                        title.trim(),
                        date,
                        time || null,
                        priority.toLowerCase(),
                        notes || "",
                        completed || false
                    ]
                );

            res.status(201).json(
                result.rows[0]
            );

        } catch (error) {
            console.error(
                "Error creating deadline:",
                error
            );

            res.status(500).json({
                error:
                    "Failed to create deadline"
            });
        }
    }
);

// ===============================
// UPDATE DEADLINE
// ===============================

app.put(
    "/api/deadlines/:id",
    authenticateToken,
    async (req, res) => {
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

            if (!title || !date) {
                return res.status(400).json({
                    error:
                        "Title and date are required"
                });
            }

            if (
                ![
                    "high",
                    "medium",
                    "low"
                ].includes(
                    priority?.toLowerCase()
                )
            ) {
                return res.status(400).json({
                    error:
                        "Priority must be high, medium, or low"
                });
            }

            const today =
                new Date()
                    .toISOString()
                    .split("T")[0];

            if (date < today) {
                return res.status(400).json({
                    error:
                        "Deadline date cannot be in the past"
                });
            }

            const result =
                await pool.query(
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
                    AND user_id = $8
                    RETURNING
                        id,
                        title,
                        TO_CHAR(
                            deadline_date,
                            'YYYY-MM-DD'
                        ) AS date,
                        TO_CHAR(
                            deadline_time,
                            'HH24:MI'
                        ) AS time,
                        LOWER(priority)
                            AS priority,
                        notes,
                        completed,
                        created_at
                    `,
                    [
                        title.trim(),
                        date,
                        time || null,
                        priority.toLowerCase(),
                        notes || "",
                        completed || false,
                        id,
                        req.user.userId
                    ]
                );

            if (result.rows.length === 0) {
                return res.status(404).json({
                    error:
                        "Deadline not found"
                });
            }

            res.json(
                result.rows[0]
            );

        } catch (error) {
            console.error(
                "Error updating deadline:",
                error
            );

            res.status(500).json({
                error:
                    "Failed to update deadline"
            });
        }
    }
);

// ===============================
// DELETE DEADLINE
// ===============================

app.delete(
    "/api/deadlines/:id",
    authenticateToken,
    async (req, res) => {
        try {
            const { id } = req.params;

            const result =
                await pool.query(
                    `
                    DELETE FROM deadlines
                    WHERE id = $1
                    AND user_id = $2
                    RETURNING id
                    `,
                    [
                        id,
                        req.user.userId
                    ]
                );

            if (result.rows.length === 0) {
                return res.status(404).json({
                    error:
                        "Deadline not found"
                });
            }

            res.json({
                message:
                    "Deadline deleted successfully",
                id: Number(id)
            });

        } catch (error) {
            console.error(
                "Error deleting deadline:",
                error
            );

            res.status(500).json({
                error:
                    "Failed to delete deadline"
            });
        }
    }
);

// ===============================
// START SERVER
// ===============================

app.listen(PORT, () => {
    console.log(
        `Backend running on http://localhost:${PORT}`
    );
});