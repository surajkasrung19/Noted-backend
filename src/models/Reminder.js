import mongoose from "mongoose";

const reminderSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    note: { type: mongoose.Schema.Types.ObjectId, ref: "Note", required: true },
    remindAt: { type: Date, required: true, index: true },
    email: { type: String, default: "" },
    browser: { type: Boolean, default: true },
    sentAt: { type: Date, default: null }
  },
  { timestamps: true }
);

export default mongoose.model("Reminder", reminderSchema);
