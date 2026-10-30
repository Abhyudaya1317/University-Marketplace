import express from "express";

// Use a router so health endpoints stay separate from server setup.
const router = express.Router();

// Report that the API process is running without revealing system information.
router.get("/", (request, response) => {
    response.json({
        success: true,
        message: "CampusX backend is running!"
    });
});

export default router;
