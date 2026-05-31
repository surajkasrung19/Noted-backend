import express from "express";
import Tag from "../models/Tag.js";
import Note from "../models/Note.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { slugify } from "../utils/text.js";

const router = express.Router();

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const usedNames = await Note.distinct("tags", { user: req.user._id, trashedAt: null });
    await Tag.deleteMany({ user: req.user._id, name: { $nin: usedNames } });

    const tags = await Tag.find({ user: req.user._id, name: { $in: usedNames } }).sort({ name: 1 });
    res.json(tags);
  })
);

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const tag = await Tag.create({
      name: req.body.name,
      user: req.user._id,
      slug: slugify(req.body.name),
      color: req.body.color || "#14b8a6"
    });
    res.status(201).json(tag);
  })
);

router.delete(
  "/:slug",
  asyncHandler(async (req, res) => {
    const tag = await Tag.findOneAndDelete({ slug: req.params.slug, user: req.user._id });
    if (tag) {
      await Note.updateMany({ user: req.user._id }, { $pull: { tags: tag.name } });
    }
    res.status(204).end();
  })
);

export default router;
