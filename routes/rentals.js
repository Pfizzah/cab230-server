const express = require("express");
const jwt = require("jsonwebtoken");
const router = express.Router();
const db = require("../db");

function creatingInvalidQueryMessage(param) {
    return `Invalid query parameters: ${param}`;
}

function creatingInvalidNumberMessage(param) {
    return `Invalid ${param} parameter. Must be a non-negative integer.`;
}

function sendingAuthenticationError(res, message) {
    return res.status(401).json({ error: true, message });
}

function authenticatingUser(req, res) {
    const auth = req.headers.authorization;

    if (!auth || !auth.startsWith("Bearer ")) {
        sendingAuthenticationError(res, "Authorization header ('Bearer token') not found");
        return null;
    }

    const token = auth.split(" ")[1];

    try {
        return jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
        if (err.name === "TokenExpiredError") {
            sendingAuthenticationError(res, "JWT token has expired");
        } else {
            sendingAuthenticationError(res, "Invalid JWT token");
        }
        return null;
    }
}

// Applying filters to rentals search query done by user
function applyingRentalFilters(query, req) {
    if (req.query.state) query.where("state", req.query.state);
    if (req.query.suburb) query.where("suburb", req.query.suburb);
    if (req.query.postcode) query.where("postcode", req.query.postcode);
    if (req.query.propertyType) query.where("propertyType", req.query.propertyType);

    if (req.query.minimumRent) query.where("rent", ">=", Number(req.query.minimumRent));
    if (req.query.maximumRent) query.where("rent", "<=", Number(req.query.maximumRent));
    if (req.query.minimumBedrooms) query.where("bedrooms", ">=", Number(req.query.minimumBedrooms));
    if (req.query.maximumBedrooms) query.where("bedrooms", "<=", Number(req.query.maximumBedrooms));
    if (req.query.minimumBathrooms) query.where("bathrooms", ">=", Number(req.query.minimumBathrooms));
    if (req.query.maximumBathrooms) query.where("bathrooms", "<=", Number(req.query.maximumBathrooms));
    if (req.query.minimumParking) query.where("parkingSpaces", ">=", Number(req.query.minimumParking));
    if (req.query.maximumParking) query.where("parkingSpaces", "<=", Number(req.query.maximumParking));

    if (req.query.propertyTypes) {
        const rawTypes = Array.isArray(req.query.propertyTypes)
            ? req.query.propertyTypes
            : [req.query.propertyTypes];

        const types = rawTypes
            .flatMap(t => String(t).split(","))
            .map(t => t.trim())
            .filter(t => t.length > 0);

        query.whereIn("propertyType", types);
    }
}

// Getting all the available states
router.get("/states", async (req, res) => {
    try {
        if (Object.keys(req.query).length > 0) {
            const invalidParam = Object.keys(req.query)[0];
            return res.status(400).json({ error: true, message: creatingInvalidQueryMessage(invalidParam) });
        }

        const states = await db("data")
            .distinct("state")
            .whereNotNull("state")
            .orderBy("state");

        res.json(states.map(row => row.state));
    } catch (error) {
        res.status(500).json({ error: true, message: error.message });
    }
});

router.get("/property-types", async (req, res) => {
    try {
        if (Object.keys(req.query).length > 0) {
            const invalidParam = Object.keys(req.query)[0];
            return res.status(400).json({ error: true, message: creatingInvalidQueryMessage(invalidParam) });
        }

        const types = await db("data")
            .distinct("propertyType")
            .whereNotNull("propertyType")
            .orderBy("propertyType");

        res.json(types.map(row => row.propertyType));
    } catch (error) {
        res.status(500).json({ error: true, message: error.message });
    }
});

// Searching rentals using filters and pagination
router.get("/search", async (req, res) => {
    try {
        const validParams = [
            "state", "suburb", "postcode", "propertyType", "propertyTypes",
            "minimumRent", "maximumRent",
            "minimumBedrooms", "maximumBedrooms",
            "minimumBathrooms", "maximumBathrooms",
            "minimumParking", "maximumParking",
            "page", "limit", "sortBy", "sortOrder"
        ];

        const invalidParam = Object.keys(req.query).find(param => !validParams.includes(param));
        if (invalidParam) {
            return res.status(400).json({ error: true, message: creatingInvalidQueryMessage(invalidParam) });
        }

        if (req.query.postcode !== undefined && !/^\d{4}$/.test(req.query.postcode)) {
            return res.status(400).json({
                error: true,
                message: "Invalid postcode parameter. Must be an integer in the range of 0000-9999."
            });
        }

        const numericParams = [
            "minimumRent", "maximumRent",
            "minimumBedrooms", "maximumBedrooms",
            "minimumBathrooms", "maximumBathrooms",
            "minimumParking", "maximumParking"
        ];

        for (const param of numericParams) {
            if (req.query[param] !== undefined) {
                const value = req.query[param];
                const num = Number(value);

                if (!/^\d+$/.test(value) || Number.isNaN(num) || num < 0) {
                    return res.status(400).json({
                        error: true,
                        message: creatingInvalidNumberMessage(param)
                    });
                }
            }
        }

        const page = req.query.page === undefined ? 1 : Number(req.query.page);
        const limit = req.query.limit === undefined ? 10 : Number(req.query.limit);

        if (!Number.isInteger(page) || page < 1) {
            return res.status(400).json({
                error: true,
                message: "Invalid page parameter. Must be an integer greater than or equal to 1."
            });
        }

        if (!Number.isInteger(limit) || limit < 1) {
            return res.status(400).json({
                error: true,
                message: creatingInvalidNumberMessage("limit")
            });
        }

        const validSortFields = [
            "rent", "bathrooms", "suburb", "postcode",
            "bedrooms", "parkingSpaces", "latitude", "longitude"
        ];

        if (req.query.sortBy && !validSortFields.includes(req.query.sortBy)) {
            return res.status(400).json({
                error: true,
                message: "Invalid sortBy parameter. Must refer to a valid sortable property."
            });
        }

        if (req.query.sortOrder && !["asc", "desc"].includes(req.query.sortOrder)) {
            return res.status(400).json({
                error: true,
                message: "Invalid sortOrder parameter. Must be 'asc' or 'desc'."
            });
        }

        if (req.query.sortOrder && !req.query.sortBy) {
            return res.status(400).json({
                error: true,
                message: "Invalid sortOrder parameter. sortBy must be specified."
            });
        }

        const offset = (page - 1) * limit;

        let query = db("data")
            .select(
                "data.*",
                db.raw("AVG(ratings.rating) as averageRating"),
                db.raw("COUNT(ratings.id) as numRatings")
            )
            .leftJoin("ratings", "data.id", "ratings.rentalId")
            .groupBy("data.id");

        applyingRentalFilters(query, req);

        if (req.query.sortBy) {
            query.orderBy(req.query.sortBy, req.query.sortOrder || "asc");
        } else {
            query.orderBy("data.id", "asc");
        }

        let countQuery = db("data");
        applyingRentalFilters(countQuery, req);

        const countResult = await countQuery.count("* as total").first();
        const total = Number(countResult.total);
        const lastPage = Math.ceil(total / limit);

        const results = await query.limit(limit).offset(offset);

        results.forEach(r => {
            r.latitude = Number(r.latitude);
            r.longitude = Number(r.longitude);
            r.numRatings = Number(r.numRatings);
            if (r.averageRating !== null) r.averageRating = Number(r.averageRating);
        });

        res.json({
            data: results,
            pagination: {
                total,
                lastPage,
                prevPage: page > 1 ? page - 1 : null,
                nextPage: page < lastPage ? page + 1 : null,
                perPage: limit,
                currentPage: page,
                from: total === 0 ? 0 : offset,
                to: total === 0 ? 0 : offset + results.length
            }
        });
    } catch (error) {
        res.status(500).json({ error: true, message: error.message });
    }
});

// Returns authenticated users rating for rentals
router.get("/:id/rating", async (req, res) => {
    const user = authenticatingUser(req, res);
    if (!user) return;

    try {
        const rating = await db("ratings")
            .where("rentalId", req.params.id)
            .where("email", user.email)
            .first();

        if (!rating) {
            return res.status(404).json({
                error: true,
                message: "No rating exists with this rental ID."
            });
        }

        res.json(rating);
    } catch (error) {
        res.status(500).json({
            error: true,
            message: error.message
        });
    }
});

// Creating a rating for a rental
router.post("/:id/rating", async (req, res) => {
    const user = authenticatingUser(req, res);
    if (!user) return;

    try {
        const rental = await db("data")
            .where("id", req.params.id)
            .first();

        if (!rental) {
            return res.status(404).json({
                error: true,
                message: "No rental exists with this ID."
            });
        }

        const { rating, comment } = req.body;
        const review = comment;

        if (comment !== undefined && (typeof comment !== "string" || comment.length < 1 || comment.length > 2000)) {
            return res.status(400).json({
                error: true,
                message: "Invalid comment parameter. Comment must be a string 1-2000 characters long."
            });
        }

        if (rating === undefined) {
            return res.status(400).json({
                error: true,
                message: "Request body incomplete."
            });
        }

        const existing = await db("ratings")
            .where({
                rentalId: req.params.id,
                email: user.email
            })
            .first();

        if (existing) {
            await db("ratings")
                .where({
                    rentalId: req.params.id,
                    email: user.email
                })
                .update({
                    rating,
                    review,
                    dateTime: db.fn.now()
                });
        } else {
            await db("ratings").insert({
                rentalId: req.params.id,
                email: user.email,
                rating,
                review
            });
        }
        
        const savedRating = await db("ratings")
        .where({
            rentalId: req.params.id,
            email: user.email
        })
        .first();
        
        const responseBody = {
            rating: Number(savedRating.rating),
            dateTime: savedRating.dateTime
        };

        if (savedRating.review) {
            responseBody.comment = savedRating.review;
        }

        res.status(201).json(responseBody);

    } catch (error) {
        res.status(500).json({
            error: true,
            message: error.message
        });
    }
});

// Deletes users rating for a rental
router.delete("/:id/rating/:email", async (req, res) => {
    try {
        const user = authenticatingUser(req, res);
        if (!user) return;

        const deleted = await db("ratings")
            .where({
                rentalId: req.params.id,
                email: req.params.email
            })
            .del();

        if (deleted === 0) {
            return res.status(404).json({
                error: true,
                message: "No rating exists with this rental ID and email address."
            });
        }

        res.json({ message: "Rating deleted" });
    } catch (error) {
        res.status(500).json({ error: true, message: error.message });
    }
});

// Getting rentals details by its ID
router.get("/:id", async (req, res) => {
    
    if (Object.keys(req.query).length > 0) {
        const invalidParam = Object.keys(req.query)[0];
        return res.status(400).json({
            error: true,
            message: creatingInvalidQueryMessage(invalidParam)
        });
    }
    try {
        const rental = await db("data")
            .select(
                "data.*",
                db.raw("AVG(ratings.rating) as averageRating"),
                db.raw("COUNT(ratings.id) as numRatings")
            )
            .leftJoin("ratings", "data.id", "ratings.rentalId")
            .where("data.id", req.params.id)
            .groupBy("data.id")
            .first();

        if (!rental) {
            return res.status(404).json({ error: true, message: "No rental exists with this ID." });
        }

        rental.latitude = Number(rental.latitude);
        rental.longitude = Number(rental.longitude);
        rental.numRatings = Number(rental.numRatings);
        if (rental.averageRating !== null) rental.averageRating = Number(rental.averageRating);

        const reviews = await db("ratings")
        .select("email", "rating", "review", "dateTime")
        .where("rentalId", req.params.id);
        
        rental.reviews = reviews.map(review => {
        const formatted = {
            user: review.email,
            rating: Number(review.rating),
            dateTime: review.dateTime
        };

        if (review.review) {
            formatted.comment = review.review;
        }
        
        return formatted;
});

        res.json(rental);
    } catch (error) {
        res.status(500).json({ error: true, message: error.message });
    }
});

module.exports = router;