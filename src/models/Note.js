import mongoose from "mongoose";

const checklistItemSchema = new mongoose.Schema(
  {
    text: { type: String, default: "" },
    checked: { type: Boolean, default: false }
  },
  { _id: true }
);

const noteSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    title: { type: String, default: "Untitled note", trim: true },
    content: { type: String, default: "" },
    markdown: { type: String, default: "" },
    plainText: { type: String, default: "" },
    color: { type: String, default: "#ffffff" },
    folder: { type: mongoose.Schema.Types.ObjectId, ref: "Folder", default: null },
    tags: [{ type: String, trim: true }],
    checklist: [checklistItemSchema],
    imageUrls: [{ type: String }],
    isPinned: { type: Boolean, default: false },
    isArchived: { type: Boolean, default: false },
    trashedAt: { type: Date, default: null },
    reminderAt: { type: Date, default: null },
    reminderEmail: { type: String, default: "" },
    saveState: {
      type: String,
      enum: ["draft", "saved", "unsaved"],
      default: "draft"
    },
    lastEditedAt: { type: Date, default: Date.now }
  },
  { timestamps: true }
);

noteSchema.index({
  title: "text",
  content: "text",
  markdown: "text",
  plainText: "text",
  tags: "text"
});
noteSchema.index({ user: 1, folder: 1, isArchived: 1, trashedAt: 1, isPinned: -1, updatedAt: -1 });

export default mongoose.model("Note", noteSchema);
