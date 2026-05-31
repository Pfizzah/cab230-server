const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const router = express.Router();
const db = require("../db");

// Registering a new user
router.post("/register", async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                error: true,
                message: "Request body incomplete, both email and password are required"
            });
        }

        const existingUser = await db("users").where("email", email).first();

        if (existingUser) {
            return res.status(409).json({
                error: true,
                message: "User already exists"
            });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        await db("users").insert({
            email,
            password: hashedPassword
        });

        res.status(201).json({
            message: "User created"
        });
    } catch (error) {
        res.status(500).json({ error: true, message: error.message });
    }
});

// Logging existing user and generating the JWT token
router.post("/login", async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                error: true,
                message: "Request body incomplete, both email and password are required"
            });
        }

        const user = await db("users").where("email", email).first();

        if (!user) {
            return res.status(401).json({
                error: true,
                message: "Incorrect email or password"
            });
        }

        const validPassword = await bcrypt.compare(password, user.password);

        if (!validPassword) {
            return res.status(401).json({
                error: true,
                message: "Incorrect email or password"
            });
        }

        const expiresIn = 86400;

        const token = jwt.sign(
            { email },
            process.env.JWT_SECRET,
            { expiresIn }
        );

        res.json({
            token,
            tokenType: "Bearer",
            expiresIn
        });
    } catch (error) {
        res.status(500).json({ error: true, message: error.message });
    }
});

router.post("/debugLogin", async (req, res) => {
    try {
        const { email, password } = req.body;

        const user = await db("users").where("email", email).first();

        if (!user) {
            return res.status(401).json({
                error: true,
                message: "Incorrect email or password"
            });
        }

        const validPassword = await bcrypt.compare(password, user.password);

        if (!validPassword) {
            return res.status(401).json({
                error: true,
                message: "Incorrect email or password"
            });
        }

        const token = jwt.sign(
            { email },
            process.env.JWT_SECRET,
            { expiresIn: 1 }
        );

        res.json({
            token,
            tokenType: "Bearer",
            expiresIn: 1
        });
    } catch (error) {
        res.status(500).json({ error: true, message: error.message });
    }
});

// The following code is for the profile route

function checkingToken(req, res, next) {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
        return res.status(401).json({
            error: true,
            message: "Authorization header ('Bearer token') not found"
        });
    }

    if (!authHeader.startsWith("Bearer ")) {
        return res.status(401).json({
            error: true,
            message: "Authorization header is malformed"
        });
    }

    const token = authHeader.split(" ")[1];

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;
        next();
    } catch (error) {
        if (error.name === "TokenExpiredError") {
            return res.status(401).json({
                error: true,
                message: "JWT token has expired"
            });
        }

        return res.status(401).json({
            error: true,
            message: "Invalid JWT token"
        });
    }
}

// Getting authenticated user profile
router.get("/:email/profile", async (req, res) => {
    try {
        const user = await db("users")
        .where("email", req.params.email)
        .first();

        if (!user) {
            return res.status(404).json ({
                error: true,
                message: "User not found"
            });
        }

        let isOwner = false;

        const authHeader = req.headers.authorization;

        if (authHeader) {
            if (!authHeader.startsWith("Bearer ")) {
                return res.status(401).json({
                    error: true,
                    message: "Authorization header is malformed"
                });
            }

            try {
                const token = authHeader.split(" ")[1];
                const decoded = jwt.verify(token, process.env.JWT_SECRET);
                isOwner = decoded.email === req.params.email;
            } catch (error) {
                if (error.name === "TokenExpiredError") {
                    return res.status(401).json({
                        error: true,
                        message: "JWT token has expired"
                    });
                }

                return res.status(401).json({
                    error: true,
                    message: "Invalid JWT token"
                });
            }
        }

        const profile = {
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName
        };

        if (isOwner) {
            profile.dob = user.dob
            ? new Date(user.dob.getTime() - user.dob.getTimezoneOffset() * 60000)
            .toISOString()
            .slice(0, 10)
            : null;
            
            profile.address = user.address;
        }

        res.json(profile);
    } catch (error) {
        res.status(500).json({error: true, message: error.message })
    }
});

// Next updating the authenticated user profile
router.put("/:email/profile", checkingToken, async (req, res) => {
    try {
        const { firstName, lastName, dob, address } = req.body;

        if (
            firstName === undefined ||
            lastName === undefined ||
            dob === undefined ||
            address === undefined
        ) {
            return res.status(400).json({
                error: true,
                message: "Request body incomplete: firstName, lastName, dob and address are required."
            });
        }

        if (
            typeof firstName !== "string" ||
            typeof lastName !== "string" ||
            typeof address !== "string"
        ) {
            return res.status(400).json({
                error: true,
                message: "Request body invalid: firstName, lastName and address must be strings only."
            });
        }

        if (req.user.email !== req.params.email) {
            return res.status(403).json({
                error: true,
                message: "Forbidden"
            });
        }

        const user = await db("users")
            .where("email", req.params.email)
            .first();

        if (!user) {
            return res.status(404).json({
                error: true,
                message: "User not found"
            });
        }

        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

        if (!dateRegex.test(dob)) {
            return res.status(400).json({
                error: true,
                message: "Invalid input: dob must be a real date in format YYYY-MM-DD."
            });
        }

        const dobDate = new Date(dob);
        
        if (isNaN(dobDate.getTime())) {
            return res.status(400).json({
            error: true,
            message: "Invalid input: dob must be a real date in format YYYY-MM-DD."
        });
        }

const dobValid =
    dobDate.toISOString().slice(0, 10) === dob;

        if (!dobValid) {
            return res.status(400).json({
                error: true,
                message: "Invalid input: dob must be a real date in format YYYY-MM-DD."
            });
        }

        if (dobDate >= new Date()) {
            return res.status(400).json({
                error: true,
                message: "Invalid input: dob must be a date in the past."
            });
        }

        await db("users")
            .where("email", req.params.email)
            .update({
                firstName,
                lastName,
                dob,
                address
            });

        res.json({
            email: req.params.email,
            firstName,
            lastName,
            dob,
            address
        });
    } catch (error) {
        res.status(500).json({ error: true, message: error.message });
    }
});

module.exports = router;