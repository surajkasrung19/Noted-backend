import jwt from "jsonwebtoken";
import User from "../models/User.js";

export async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";

    if (!token) return res.status(401).json({ message: "Authentication required" });

    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(payload.sub).select("_id name email emailVerified authProvider emailVerificationTokenHash");

    if (!user) return res.status(401).json({ message: "Invalid session" });
    if (!user.emailVerified && user.emailVerificationTokenHash) {
      return res.status(403).json({ message: "Please verify your email before opening this workspace" });
    }

    req.user = user;
    next();
  } catch {
    res.status(401).json({ message: "Invalid or expired session" });
  }
}
