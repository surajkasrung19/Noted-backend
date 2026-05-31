import mongoose from "mongoose";

const noteVersionSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    note: { type: mongoose.Schema.Types.ObjectId, ref: "Note", required: true, index: true },
    title: String,
    content: String,
    markdown: String,
    plainText: String,
    color: String,
    folder: { type: mongoose.Schema.Types.ObjectId, ref: "Folder", default: null },
    tags: [String],
    checklist: Array,
    reason: { type: String, default: "autosave" }
  },
  { timestamps: true }
);

export default mongoose.model("NoteVersion", noteVersionSchema);
