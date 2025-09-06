import express, { Request, Response } from "express"; // Added Request, Response types
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import cors from "cors";
import dotenv from "dotenv";
import bcrypt from "bcrypt"; // Added for password hashing

import { ContentModel, LinkModel, UserModel } from "./db";
import { userMiddleware } from "./middleware";
import { random } from "./utils";

dotenv.config();

// --- Environment Variable Setup & Validation ---
const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI;
const JWT_SECRET = process.env.JWT_SECRET;

if (!MONGO_URI || !JWT_SECRET) {
    console.error("❌ Fatal Error: MONGO_URI or JWT_SECRET is not defined in .env file.");
    process.exit(1);
}

const app = express();
app.use(express.json());
app.use(cors());

// --- Authentication Routes ---

app.post("/api/v1/signup", async (req: Request, res: Response) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ message: "Username and password are required" });
    }

    try {
        const existingUser = await UserModel.findOne({ username });

        if (existingUser) {
            return res.status(409).json({ message: "Username already exists" });
        }

        // --- Added password hashing ---
        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(password, saltRounds);

        await UserModel.create({
            username: username,
            password: hashedPassword,
        });

        // --- Added 'return' to fix the TypeScript build error ---
        return res.status(201).json({ message: "User signed up successfully" });

    } catch (e) {
        console.error("Error during signup:", e);
        return res.status(500).json({ message: "An internal server error occurred" });
    }
});

app.post("/api/v1/signin", async (req: Request, res: Response) => {
    const { username, password } = req.body;

    try {
        const existingUser = await UserModel.findOne({ username });

        // --- Using bcrypt.compare for secure password checking ---
        if (existingUser && await bcrypt.compare(password, existingUser.password)) {
            const token = jwt.sign({ id: existingUser._id }, JWT_SECRET);
            return res.json({ token });
        } else {
            // --- Changed status code to 401 for better security ---
            return res.status(401).json({ message: "Invalid username or password" });
        }
    } catch (e) {
        console.error("Error during signin:", e);
        return res.status(500).json({ message: "An internal server error occurred" });
    }
});

// --- Content Routes ---

app.post("/api/v1/content", userMiddleware, async (req: Request, res: Response) => {
    try {
        await ContentModel.create({
            link: req.body.link,
            type: req.body.type,
            title: req.body.title,
            userId: req.userId,
            tags: [],
        });
        return res.json({ message: "Content added" });
    } catch (e) {
        console.error("Error adding content:", e);
        return res.status(500).json({ message: "Failed to add content" });
    }
});

app.get("/api/v1/content", userMiddleware, async (req: Request, res: Response) => {
    try {
        const userId = req.userId;
        const content = await ContentModel.find({ userId: userId }).populate("userId", "username");
        return res.json({ content });
    } catch (e) {
        console.error("Error fetching content:", e);
        return res.status(500).json({ message: "Failed to fetch content" });
    }
});

app.delete("/api/v1/content", userMiddleware, async (req: Request, res: Response) => {
    try {
        const contentId = req.body.contentId;
        await ContentModel.deleteOne({ // Using deleteOne is more semantic for a single item
            _id: contentId,
            userId: req.userId,
        });
        return res.json({ message: "Deleted" });
    } catch (e) {
        console.error("Error deleting content:", e);
        return res.status(500).json({ message: "Failed to delete content" });
    }
});

// --- Sharing Routes ---

app.post("/api/v1/brain/share", userMiddleware, async (req: Request, res: Response) => {
    const share = req.body.share;

    try {
        if (share) {
            const existingLink = await LinkModel.findOne({ userId: req.userId });
            if (existingLink) {
                return res.json({ hash: existingLink.hash });
            }
            const hash = random(10);
            await LinkModel.create({
                userId: req.userId,
                hash: hash,
            });
            return res.json({ hash });
        } else {
            await LinkModel.deleteOne({ userId: req.userId });
            return res.json({ message: "Removed link" });
        }
    } catch (e) {
        console.error("Error updating share link:", e);
        return res.status(500).json({ message: "Failed to update share settings" });
    }
});

app.get("/api/v1/brain/:shareLink", async (req: Request, res: Response) => {
    try {
        const hash = req.params.shareLink;
        const link = await LinkModel.findOne({ hash });

        if (!link) {
            // --- Changed status code to 404 Not Found for better semantics ---
            return res.status(404).json({ message: "Share link not found" });
        }

        const user = await UserModel.findById(link.userId);

        if (!user) {
            return res.status(404).json({ message: "Associated user not found" });
        }

        const content = await ContentModel.find({ userId: link.userId });
        return res.json({
            username: user.username,
            content: content,
        });

    } catch (e) {
        console.error("Error fetching shared brain:", e);
        return res.status(500).json({ message: "Failed to fetch shared content" });
    }
});

// --- Database Connection and Server Startup ---

mongoose
    .connect(MONGO_URI)
    .then(() => {
        console.log("✅ Connected to MongoDB");
        app.listen(PORT, () => {
            console.log(`🚀 Server running on port ${PORT}`);
        });
    })
    .catch((err: unknown) => {
        console.error("❌ Error connecting to MongoDB:", err);
        process.exit(1);
    });