import express, { Request, Response } from "express";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import cors from "cors";
import dotenv from "dotenv";
import bcrypt from "bcrypt";

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
        res.status(400).json({ message: "Username and password are required" });
        return;
    }

    try {
        const existingUser = await UserModel.findOne({ username });
        if (existingUser) {
            res.status(409).json({ message: "Username already exists" });
            return;
        }

        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(password, saltRounds);

        await UserModel.create({
            username: username,
            password: hashedPassword,
        });
        
        res.status(201).json({ message: "User signed up successfully" });
        return;

    } catch (e) {
        console.error("Error during signup:", e);
        res.status(500).json({ message: "An internal server error occurred" });
        return;
    }
});

app.post("/api/v1/signin", async (req: Request, res: Response) => {
    const { username, password } = req.body;

    try {
        const existingUser = await UserModel.findOne({ username });

        if (!existingUser || !existingUser.password) {
            res.status(401).json({ message: "Invalid username or password" });
            return;
        }

        const passwordMatch = await bcrypt.compare(password, existingUser.password);

        if (passwordMatch) {
            const token = jwt.sign({ id: existingUser._id }, JWT_SECRET!); 
            res.json({ token });
            return;
        } else {
            res.status(401).json({ message: "Invalid username or password" });
            return;
        }
    } catch (e) {
        console.error("Error during signin:", e);
        res.status(500).json({ message: "An internal server error occurred" });
        return;
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
        res.json({ message: "Content added" });
        return;
    } catch (e) {
        console.error("Error adding content:", e);
        res.status(500).json({ message: "Failed to add content" });
        return;
    }
});

app.get("/api/v1/content", userMiddleware, async (req: Request, res: Response) => {
    try {
        const userId = req.userId;
        const content = await ContentModel.find({ userId: userId }).populate("userId", "username");
        res.json({ content });
        return;
    } catch (e) {
        console.error("Error fetching content:", e);
        res.status(500).json({ message: "Failed to fetch content" });
        return;
    }
});

app.delete("/api/v1/content", userMiddleware, async (req: Request, res: Response) => {
    try {
        const contentId = req.body.contentId;
        await ContentModel.deleteOne({
            _id: contentId,
            userId: req.userId,
        });
        res.json({ message: "Deleted" });
        return;
    } catch (e) {
        console.error("Error deleting content:", e);
        res.status(500).json({ message: "Failed to delete content" });
        return;
    }
});

// --- Sharing Routes ---

app.post("/api/v1/brain/share", userMiddleware, async (req: Request, res: Response) => {
    const share = req.body.share;

    try {
        if (share) {
            const existingLink = await LinkModel.findOne({ userId: req.userId });
            if (existingLink) {
                res.json({ hash: existingLink.hash });
                return;
            }
            const hash = random(10);
            await LinkModel.create({
                userId: req.userId,
                hash: hash,
            });
            res.json({ hash });
            return;
        } else {
            await LinkModel.deleteOne({ userId: req.userId });
            res.json({ message: "Removed link" });
            return;
        }
    } catch (e) {
        console.error("Error updating share link:", e);
        res.status(500).json({ message: "Failed to update share settings" });
        return;
    }
});

app.get("/api/v1/brain/:shareLink", async (req: Request, res: Response) => {
    try {
        const hash = req.params.shareLink;
        const link = await LinkModel.findOne({ hash });

        if (!link) {
            res.status(404).json({ message: "Share link not found" });
            return;
        }

        const user = await UserModel.findById(link.userId);
        if (!user) {
            res.status(404).json({ message: "Associated user not found" });
            return;
        }

        const content = await ContentModel.find({ userId: link.userId });
        res.json({
            username: user.username,
            content: content,
        });
        return;
    } catch (e) {
        console.error("Error fetching shared brain:", e);
        res.status(500).json({ message: "Failed to fetch shared content" });
        return;
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