import express from "express";
import mongoose from "mongoose";
import Folder from "../models/Folder.js";
import Note from "../models/Note.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = express.Router();

function toTree(folders) {
  const map = new Map();
  const roots = [];

  folders.forEach((folder) => {
    map.set(String(folder._id), { ...folder.toObject(), children: [] });
  });

  map.forEach((folder) => {
    if (folder.parent && map.has(String(folder.parent))) {
      map.get(String(folder.parent)).children.push(folder);
    } else {
      roots.push(folder);
    }
  });

  return roots;
}

async function getOwnedParent(user, parentId) {
  if (!parentId) return null;
  if (!mongoose.isValidObjectId(parentId)) return undefined;

  const parent = await Folder.findOne({ _id: parentId, user }).select("_id");
  return parent?._id;
}

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const folders = await Folder.find({ user: req.user._id }).sort({ sortOrder: 1, name: 1 });
    res.json(req.query.tree === "true" ? toTree(folders) : folders);
  })
);

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const parent = await getOwnedParent(req.user._id, req.body.parent);
    if (parent === undefined) {
      return res.status(400).json({ message: "Parent folder not found for this user" });
    }

    const folder = await Folder.create({
      name: req.body.name,
      user: req.user._id,
      parent,
      color: req.body.color || "#4f46e5"
    });
    res.status(201).json(folder);
  })
);

router.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const parent = await getOwnedParent(req.user._id, req.body.parent);
    if (parent === undefined || String(parent) === req.params.id) {
      return res.status(400).json({ message: "Parent folder not found for this user" });
    }

    const folder = await Folder.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id },
      {
        name: req.body.name,
        parent,
        color: req.body.color,
        sortOrder: req.body.sortOrder
      },
      { new: true }
    );
    if (!folder) return res.status(404).json({ message: "Folder not found" });
    res.json(folder);
  })
);

router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    await Note.updateMany({ folder: req.params.id, user: req.user._id }, { folder: null });
    await Folder.updateMany({ parent: req.params.id, user: req.user._id }, { parent: null });
    await Folder.findOneAndDelete({ _id: req.params.id, user: req.user._id });
    res.status(204).end();
  })
);

export default router;
