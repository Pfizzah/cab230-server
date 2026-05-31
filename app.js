require("dotenv").config();

// Importing all the required packages
const express = require("express");
const cors = require("cors");

// Importing route handlers
const rentalsRouter = require("./routes/rentals");
const userRouter = require("./routes/user");

const swaggerUi = require("swagger-ui-express");

const app = express();

app.use(cors());
app.use(express.json());

// Defines swagger documentation for all the API endpoints
const swaggerDocument = {
    openapi: "3.0.0",
    info: {
        title: "CAB230 Rentals API",
        version: "1.0.0"
    },
    paths: {
        "/rentals/states": {
            get: {
                description: "Get all rental states",
                responses: {
                    200: { description: "Successful response" }
                }
            }
        },
        "/rentals/property-types": {
            get: {
                description: "Get all property types",
                responses: {
                    200: { description: "Successful response" }
                }
            }
        },
        "/rentals/search": {
            get: {
                description: "Search rentals",
                responses: {
                    200: { description: "Successful response" },
                    400: { description: "Invalid query parameter" }
                }
            }
        },
        "/rentals/{id}": {
            get: {
                description: "Get rental by ID",
                responses: {
                    200: { description: "Successful response" },
                    404: { description: "Rental not found" }
                }
            }
        },
        "/user/register": {
            post: {
                description: "Register user",
                
                requestBody: {
                    required: true,
                    content: {
                        "application/json": {
                            schema: {
                                type: "object",
                                properties: {
                                    email: {
                                        type: "string",
                                        example: "test@email.com"
                                    },
                                    password: {
                                        type: "string",
                                        example: "password123"
                                    }
                                }
                            }
                        }
                    }
                },
                
                responses: {
                    201: { description: "User created" },
                    409: { description: "User already exists" }
                }
            }
        },
        "/user/login": {
            post: {
                description: "Login user",
                
                requestBody: {
                    required: true,
                    content: {
                        "application/json": {
                            schema: {
                                type: "object",
                                properties: {
                                    email: {
                                        type: "string",
                                        example: "test@email.com"
                                    },
                                    password: {
                                        type: "string",
                                        example: "password123"
                                    }
                                }
                            }
                        }
                    }
                },
                
                responses: {
                    200: { description: "Successful login" },
                    401: { description: "Incorrect email or password" }
                }
            }
        },

        "/user/{email}/profile": {
            get: {
                description: "Get user profile",
                responses: {
                    200: { description : "Profile returned" },
                    401: { description: "Unauthorized" },
                    403: { description: "Forbidden" },
                    404: { description: "User not found" }
                }
            },

            put: {
                description: "Update user profile",
                
                requestBody: {
                    required: true,
                    content: {
                        "application/json": {
                            schema: {
                                type: "object",
                                properties: {
                                    firstName: {
                                        type: "string",
                                        example: "Pfizzah"
                                    },
                                    lastName: {
                                        type: "string",
                                        example: "Khokhar"
                                    },
                                    dob: {
                                        type: "string",
                                        example: "2002-09-17"
                                    },
                                    address: {
                                        type: "string",
                                        example: "Brisbane, QLD"
                                    }
                                }
                            }
                        }
                    }
                },
                responses: {
                    200: { description: "Profile updated" },
                    400: { description: "Invalid input" },
                    401: { description: "Unauthorized" },
                    403: { description: "Forbidden" },
                    404: { description: "User not found" }
                }
            }
        }
    }
};

app.post("/ratings/debugEraseRatings", async (req, res) => {
    try {
        const db = require("./db");
        await db("ratings").del();
        res.json({ message: "Ratings erased" });
    } catch (error) {
        res.status(500).json({ error: true, message: error.message });
    }
});

app.get("/ratings/rentals/:id", (req, res, next) => {
    req.url = `/${req.params.id}/rating`;
    rentalsRouter(req, res, next);
});

app.post("/ratings/rentals/:id", (req, res, next) => {
    req.url = `/${req.params.id}/rating`;
    rentalsRouter(req, res, next);
});

// Route for rental related endpoints
app.use("/rentals", rentalsRouter);

// Route for user authentication endpoints
app.use("/user", userRouter);

const db = require("./db");

// Swagger API documentation setup
app.use("/", swaggerUi.serve, swaggerUi.setup(swaggerDocument));

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});