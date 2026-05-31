import express from "express";
import Reminder from "../models/Reminder.js";
import Note from "../models/Note.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = express.Router();

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const reminders = await Reminder.find({ user: req.user._id }).populate("note", "title").sort({ remindAt: 1 });
    res.json(reminders);
  })
);

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const note = await Note.findOne({ _id: req.body.note, user: req.user._id });
    if (!note) return res.status(404).json({ message: "Note not found" });

    const reminder = await Reminder.create({
      user: req.user._id,
      note: req.body.note,
      remindAt: req.body.remindAt,
      email: req.body.email || "",
      browser: req.body.browser !== false
    });

    await Note.findOneAndUpdate({ _id: req.body.note, user: req.user._id }, {
      reminderAt: req.body.remindAt,
      reminderEmail: req.body.email || ""
    });

    res.status(201).json(reminder);
  })
);

router.patch(
  "/:id/sent",
  asyncHandler(async (req, res) => {
    const reminder = await Reminder.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id },
      { sentAt: new Date() },
      { new: true }
    );
    res.json(reminder);
  })
);

router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    await Reminder.findOneAndDelete({ _id: req.params.id, user: req.user._id });
    res.status(204).end();
  })
);

export default router;
