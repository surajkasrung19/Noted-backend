import express from "express";
import multer from "multer";
import cloudinary, { configureCloudinary } from "../config/cloudinary.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

router.post(
  "/image",
  upload.single("image"),
  asyncHandler(async (req, res) => {
    if (!req.file) return res.status(400).json({ message: "Image file is required" });
    if (!configureCloudinary()) return res.status(503).json({ message: "Cloudinary is not configured" });

    const dataUri = `data:${req.file.mimetype};base64,${req.file.buffer.toString("base64")}`;
    const result = await cloudinary.uploader.upload(dataUri, {
      folder: `noted/${req.user._id}/notes`,
      resource_type: "image"
    });

    res.status(201).json({
      url: result.secure_url,
      publicId: result.public_id,
      width: result.width,
      height: result.height
    });
  })
);

export default router;
