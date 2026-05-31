import express from "express";
import mongoose from "mongoose";
import Folder from "../models/Folder.js";
import Note from "../models/Note.js";
import NoteVersion from "../models/NoteVersion.js";
import Reminder from "../models/Reminder.js";
import Tag from "../models/Tag.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { slugify, stripHtml } from "../utils/text.js";
import { createVersion } from "../services/versioning.js";

const router = express.Router();

async function syncTags(user, tags = []) {
  const cleanTags = [...new Set(tags.map((tag) => tag.trim()).filter(Boolean))];

  await Promise.all(
    cleanTags.map((tag) =>
      Tag.updateOne(
        { user, slug: slugify(tag) },
        { $setOnInsert: { user, name: tag, slug: slugify(tag) } },
        { upsert: true }
      )
    )
  );

  return cleanTags;
}

async function getOwnedFolder(user, folderId) {
  if (!folderId) return null;
  if (!mongoose.isValidObjectId(folderId)) return undefined;

  const folder = await Folder.findOne({ _id: folderId, user }).select("_id");
  return folder?._id;
}

function normalizeChecklist(checklist = []) {
  if (!Array.isArray(checklist)) return [];

  return checklist.map((item) => ({
    text: String(item?.text ?? ""),
    checked: Boolean(item?.checked)
  }));
}

function notePayload(body) {
  const content = body.content ?? "";
  return {
    title: body.title || "Untitled note",
    content,
    markdown: body.markdown ?? "",
    plainText: body.plainText || stripHtml(content),
    color: body.color || "#ffffff",
    folder: body.folder || null,
    tags: body.tags || [],
    checklist: normalizeChecklist(body.checklist),
    imageUrls: body.imageUrls || [],
    reminderAt: body.reminderAt || null,
    reminderEmail: body.reminderEmail || "",
    saveState: body.saveState || "saved",
    lastEditedAt: new Date()
  };
}

function isEmptyUntitledDraft(note) {
  const title = (note.title || "").trim().toLowerCase();
  const text = (note.plainText || stripHtml(note.content || "") || note.markdown || "").trim();
  const hasChecklist = (note.checklist || []).some((item) => item?.text?.trim());

  return (
    (!title || title === "untitled note") &&
    !text &&
    !hasChecklist &&
    !(note.tags || []).length &&
    !(note.imageUrls || []).length
  );
}

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const { q, folder, tag, status = "active", pinned } = req.query;
    const filter = { user: req.user._id };

    if (status === "trash") filter.trashedAt = { $ne: null };
    else filter.trashedAt = null;

    if (status === "archive") filter.isArchived = true;
    if (status === "active") filter.isArchived = false;
    if (folder) filter.folder = folder === "none" ? null : folder;
    if (tag) filter.tags = tag;
    if (pinned !== undefined) filter.isPinned = pinned === "true";
    if (q) filter.$text = { $search: q };

    const notes = await Note.find(filter)
      .sort(q ? { score: { $meta: "textScore" }, isPinned: -1, updatedAt: -1 } : { isPinned: -1, updatedAt: -1 })
      .populate("folder", "name color parent");

    res.json(notes);
  })
);

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const payload = notePayload(req.body);
    const folder = await getOwnedFolder(req.user._id, payload.folder);
    if (folder === undefined) {
      return res.status(400).json({ message: "Folder not found for this user" });
    }

    payload.user = req.user._id;
    payload.folder = folder;
    payload.tags = await syncTags(req.user._id, payload.tags);
    const note = await Note.create(payload);
    await createVersion(note, "created");
    res.status(201).json(note);
  })
);

router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const note = await Note.findOne({ _id: req.params.id, user: req.user._id }).populate("folder", "name color parent");
    if (!note) return res.status(404).json({ message: "Note not found" });
    res.json(note);
  })
);

router.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const note = await Note.findOne({ _id: req.params.id, user: req.user._id });
    if (!note) return res.status(404).json({ message: "Note not found" });

    const payload = notePayload(req.body);
    const folder = await getOwnedFolder(req.user._id, payload.folder);
    if (folder === undefined) {
      return res.status(400).json({ message: "Folder not found for this user" });
    }

    payload.folder = folder;
    Object.assign(note, payload);
    note.tags = await syncTags(req.user._id, note.tags);
    await note.save();

    if (req.body.createVersion !== false) {
      await createVersion(note, req.body.reason || "autosave");
    }

    res.json(note);
  })
);

router.patch(
  "/:id/pin",
  asyncHandler(async (req, res) => {
    const note = await Note.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id },
      { isPinned: req.body.isPinned },
      { new: true }
    );
    res.json(note);
  })
);

router.patch(
  "/:id/archive",
  asyncHandler(async (req, res) => {
    const note = await Note.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id },
      { isArchived: req.body.isArchived, trashedAt: null },
      { new: true }
    );
    res.json(note);
  })
);

router.patch(
  "/:id/move",
  asyncHandler(async (req, res) => {
    const folder = await getOwnedFolder(req.user._id, req.body.folder);
    if (folder === undefined) {
      return res.status(400).json({ message: "Folder not found for this user" });
    }

    const note = await Note.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id },
      { folder },
      { new: true }
    );
    if (!note) return res.status(404).json({ message: "Note not found" });
    res.json(note);
  })
);

router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const note = await Note.findOne({ _id: req.params.id, user: req.user._id });
    if (!note) return res.status(404).json({ message: "Note not found" });

    if (isEmptyUntitledDraft(note)) {
      await Note.deleteOne({ _id: note._id, user: req.user._id });
      await NoteVersion.deleteMany({ note: note._id, user: req.user._id });
      await Reminder.deleteMany({ note: note._id, user: req.user._id });
      return res.json({ _id: note._id, deleted: true });
    }

    note.trashedAt = new Date();
    note.isArchived = false;
    await note.save();
    res.json(note);
  })
);

router.delete(
  "/:id/permanent",
  asyncHandler(async (req, res) => {
    await Note.findOneAndDelete({ _id: req.params.id, user: req.user._id });
    await NoteVersion.deleteMany({ note: req.params.id, user: req.user._id });
    await Reminder.deleteMany({ note: req.params.id, user: req.user._id });
    res.status(204).end();
  })
);

router.patch(
  "/:id/restore",
  asyncHandler(async (req, res) => {
    const note = await Note.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id },
      { trashedAt: null },
      { new: true }
    );
    res.json(note);
  })
);

router.get(
  "/:id/versions",
  asyncHandler(async (req, res) => {
    const versions = await NoteVersion.find({ note: req.params.id, user: req.user._id }).sort({ createdAt: -1 });
    res.json(versions);
  })
);

router.post(
  "/:id/versions/:versionId/restore",
  asyncHandler(async (req, res) => {
    const version = await NoteVersion.findOne({
      _id: req.params.versionId,
      note: req.params.id,
      user: req.user._id
    });
    if (!version) return res.status(404).json({ message: "Version not found" });

    const note = await Note.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id },
      {
        title: version.title,
        content: version.content,
        markdown: version.markdown,
        plainText: version.plainText,
        color: version.color || "#ffffff",
        folder: version.folder,
        tags: version.tags,
        checklist: version.checklist,
        lastEditedAt: new Date()
      },
      { new: true }
    );

    await createVersion(note, "version-restored");
    res.json(note);
  })
);

export default router;
