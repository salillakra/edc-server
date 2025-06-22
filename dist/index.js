import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { config } from "dotenv";
import { v2 as cloudinary } from "cloudinary";
import { Redis } from "@upstash/redis";
import { cors } from "hono/cors";
// Load .env config
config();
// Initialize CORS middleware
const corsOptions = {
    origin: "*", // Allow all origins
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"], // Allowed HTTP methods
    allowHeaders: ["Content-Type", "Authorization"], // Allowed headers
};
// Initialize CORS in Hono app
const app = new Hono();
app.use("*", cors(corsOptions));
const redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
});
// Cloudinary config
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});
// Root route
app.get("/", (c) => {
    return c.text("Hono server is up!");
});
app.get("/slider-images", async (c) => {
    const cacheKey = "slider-images";
    try {
        const cached = await redis.get(cacheKey);
        if (cached) {
            return c.json(cached);
        }
        const result = await cloudinary.search
            .expression("asset_folder:slider AND resource_type:image AND type:upload")
            .sort_by("created_at", "desc")
            .max_results(100)
            .execute();
        const images = result.resources.map((img) => ({
            public_id: img.public_id,
            url: img.secure_url,
            width: img.width,
            height: img.height,
        }));
        await redis.set(cacheKey, images, { ex: 3600 }); // 60 mins cache
        return c.json(images);
    }
    catch (err) {
        console.error("Redis or Cloudinary error:", err);
        return c.json({ error: "Failed to fetch slider images" }, 500);
    }
});
// In-memory cache
const memoryCache = {};
app.get("/past-speakers-images", async (c) => {
    const cacheKey = "past-speakers-images";
    const now = Date.now();
    // Check in-memory cache first
    if (memoryCache[cacheKey] && memoryCache[cacheKey].expiry > now) {
        console.log("Memory cache hit for past speakers images");
        return c.json(memoryCache[cacheKey].data);
    }
    try {
        // Check Redis cache
        const cached = await redis.get(cacheKey);
        if (cached) {
            console.log("Redis cache hit for past speakers images");
            // Update memory cache from Redis
            memoryCache[cacheKey] = {
                data: cached,
                expiry: now + 3600000, // 60 minutes in milliseconds
            };
            return c.json(cached);
        }
        const result = await cloudinary.search
            .expression("asset_folder:past_speakers AND resource_type:image AND type:upload")
            .sort_by("created_at", "desc")
            .max_results(100)
            .execute();
        // Map of names (from public_id) to their details
        const speakerDetails = {
            karan: { name: "Karan Bajaj", desc: "Founder - WhiteHat Jr" },
            amit: { name: "Amit Choudhary", desc: "Founder - Lenskart" },
            aman: { name: "Aman Dhattarwal", desc: "Founder - Apni Kaksha" },
            ravi: { name: "Ravi K Ranjan", desc: "Ex Shark Tank" },
            rishabh: { name: "Rishabh Jain", desc: "Labour Law Advisor" },
            vijendra: { name: "Dr. Vijendra Chauhan", desc: "Public Speaker" },
        };
        const images = result.resources.map((img) => {
            // Extract the name part from public_id (before the underscore)
            const nameMatch = img.public_id
                .split("/")
                .pop()
                ?.match(/^([^_]+)/);
            const speakerKey = nameMatch ? nameMatch[1].toLowerCase() : "";
            const details = speakerDetails[speakerKey] || { name: "", desc: "" };
            return {
                public_id: img.public_id,
                url: img.secure_url,
                width: img.width,
                height: img.height,
                name: details.name,
                description: details.desc,
            };
        });
        // Update both Redis and memory cache
        await redis.set(cacheKey, images, { ex: 3600 }); // 60 mins Redis cache
        memoryCache[cacheKey] = {
            data: images,
            expiry: now + 3600000, // 60 minutes in milliseconds
        };
        return c.json(images);
    }
    catch (err) {
        console.error("Redis or Cloudinary error:", err);
        return c.json({ error: "Failed to fetch past speakers images" }, 500);
    }
});
// Start the server
export default app.fetch;
