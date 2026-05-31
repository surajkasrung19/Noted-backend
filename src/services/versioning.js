import NoteVersion from "../models/NoteVersion.js";

export async function createVersion(note, reason = "autosave") {
  return NoteVersion.create({
    note: note._id,
    user: note.user,
    title: note.title,
    content: note.content,
    markdown: note.markdown,
    plainText: note.plainText,
    color: note.color,
    folder: note.folder,
    tags: note.tags,
    checklist: note.checklist,
    reason
  });
}
