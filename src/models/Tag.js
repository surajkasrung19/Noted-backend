import mongoose from "mongoose";

const tagSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, trim: true },
    color: { type: String, default: "#14b8a6" }
  },
  { timestamps: true }
);

tagSchema.index({ user: 1, slug: 1 }, { unique: true });

export default mongoose.model("Tag", tagSchema);
