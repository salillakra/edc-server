import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { config } from "dotenv";
import { v2 as cloudinary } from "cloudinary";
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

// Cloudinary config
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME!,
  api_key: process.env.CLOUDINARY_API_KEY!,
  api_secret: process.env.CLOUDINARY_API_SECRET!,
});

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
      .expression("folder:Home/slider AND resource_type:image AND type:upload")
      .sort_by("created_at", "desc")
      .max_results(100)
      .execute();

    const images = result.resources.map((img: any) => ({
      public_id: img.public_id,
      url: img.secure_url,
      width: img.width,
      height: img.height,
    }));

    await redis.set(cacheKey, images, { ex: 3600 }); // 60 mins cache

    return c.json(images);
  } catch (err) {
    console.error("Redis or Cloudinary error:", err);
    return c.json({ error: "Failed to fetch slider images" }, 500);
  }
});

app.get("/data/*", async (c) => {
  const folderPath = c.req.path.split("/data/")[1];

  try {
    const result = await cloudinary.search
      .expression(
        `folder:${folderPath} AND resource_type:image AND type:upload`
      )
      .sort_by("created_at", "desc")
      .max_results(100)
      .execute();

    const images = result.resources.map((img: any) => ({
      publicId: img.public_id,
      url: img.secure_url,
      alt: img.public_id.split("/").pop()?.replace(/_/g, " ") || "",
      width: img.width,
      height: img.height,
    }));

    return c.json(images);
  } catch (err) {
    console.error("Redis or Cloudinary error:", err);
    return c.json({ error: "Failed to fetch slider images" }, 500);
  }
});

// Start the server
serve(
  {
    fetch: app.fetch,
    port: parseInt(process.env.PORT || "4000", 10),
  },
  () => {
    console.log(`🚀 Server running on port ${process.env.PORT || "4000"}`);
  }
);
