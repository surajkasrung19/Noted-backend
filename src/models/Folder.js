import mongoose from "mongoose";

const folderSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    name: { type: String, required: true, trim: true },
    parent: { type: mongoose.Schema.Types.ObjectId, ref: "Folder", default: null },
    color: { type: String, default: "#4f46e5" },
    sortOrder: { type: Number, default: 0 }
  },
  { timestamps: true }
);

folderSchema.index({ user: 1, parent: 1, name: 1 }, { unique: true });

export default mongoose.model("Folder", folderSchema);
