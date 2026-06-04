import express from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import { requireAuth } from "../middleware/auth.js";
import { sendPasswordResetEmail, sendVerificationEmail } from "../services/authEmail.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = express.Router();
const verificationTtlMs = 1000 * 60 * 60 * 24;
const passwordResetTtlMs = 1000 * 60 * 30;

function signToken(user) {
  if (!process.env.JWT_SECRET) {
    const error = new Error("JWT_SECRET is required");
    error.status = 500;
    throw error;
  }

  return jwt.sign({ sub: user._id.toString() }, process.env.JWT_SECRET, { expiresIn: "7d" });
}

function authResponse(user) {
  return {
    token: signToken(user),
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      emailVerified: user.emailVerified,
      authProvider: user.authProvider
    }
  };
}

function hasPendingEmailVerification(user) {
  return !user.emailVerified && Boolean(user.emailVerificationTokenHash);
}

function createPlainToken() {
  return crypto.randomBytes(32).toString("hex");
}

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function applyVerificationToken(user) {
  const token = createPlainToken();
  user.emailVerificationTokenHash = hashToken(token);
  user.emailVerificationExpiresAt = new Date(Date.now() + verificationTtlMs);
  return token;
}

function applyPasswordResetToken(user) {
  const token = createPlainToken();
  user.passwordResetTokenHash = hashToken(token);
  user.passwordResetExpiresAt = new Date(Date.now() + passwordResetTtlMs);
  return token;
}

function emailDeliveryMessage(successMessage, failurePrefix, emailResult) {
  if (emailResult.sent) return successMessage;
  return `${failurePrefix}: ${emailResult.reason || "Email provider is not configured."}`;
}

router.post(
  "/signup",
  asyncHandler(async (req, res) => {
    const name = req.body.name?.trim();
    const email = req.body.email?.trim().toLowerCase();
    const password = req.body.password || "";

    if (!name || !email || password.length < 8) {
      return res.status(400).json({ message: "Name, email, and an 8+ character password are required" });
    }

    const existing = await User.findOne({ email });
    if (existing) return res.status(409).json({ message: "An account with this email already exists" });

    const passwordHash = await bcrypt.hash(password, 12);
    const user = new User({ name, email, passwordHash, authProvider: "local" });
    const verificationToken = applyVerificationToken(user);
    await user.save();

    const emailResult = await sendVerificationEmail(user, verificationToken);
    res.status(201).json({
      signupPending: true,
      emailSent: emailResult.sent,
      emailProvider: emailResult.provider || null,
      message: emailDeliveryMessage(
        "Account created. Please check your email to verify your account.",
        "Account created, but the verification email could not be sent",
        emailResult
      )
    });
  })
);

router.post(
  "/login",
  asyncHandler(async (req, res) => {
    const email = req.body.email?.trim().toLowerCase();
    const password = req.body.password || "";
    const user = await User.findOne({ email });

    if (!user || !user.passwordHash || !(await bcrypt.compare(password, user.passwordHash))) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    if (hasPendingEmailVerification(user)) {
      return res.status(403).json({ message: "Please verify your email before logging in." });
    }

    user.lastLoginAt = new Date();
    await user.save();
    res.json(authResponse(user));
  })
);

router.post(
  "/verify-email",
  asyncHandler(async (req, res) => {
    const token = req.body.token || "";
    const user = await User.findOne({
      emailVerificationTokenHash: hashToken(token),
      emailVerificationExpiresAt: { $gt: new Date() }
    });

    if (!user) return res.status(400).json({ message: "Verification link is invalid or expired" });

    user.emailVerified = true;
    user.emailVerificationTokenHash = "";
    user.emailVerificationExpiresAt = null;
    await user.save();

    res.json({ ...authResponse(user), message: "Email verified" });
  })
);

router.post(
  "/resend-verification",
  asyncHandler(async (req, res) => {
    const email = req.body.email?.trim().toLowerCase();
    const user = email ? await User.findOne({ email }) : null;

    if (!user || user.emailVerified) {
      return res.json({ message: "If verification is needed, a new email will be sent." });
    }

    const token = applyVerificationToken(user);
    await user.save();
    const emailResult = await sendVerificationEmail(user, token);

    res.json({
      emailSent: emailResult.sent,
      emailProvider: emailResult.provider || null,
      message: emailDeliveryMessage(
        "Verification email sent. Please check your inbox.",
        "Verification email could not be sent",
        emailResult
      )
    });
  })
);

router.post(
  "/forgot-password",
  asyncHandler(async (req, res) => {
    const email = req.body.email?.trim().toLowerCase();
    if (!email) return res.status(400).json({ message: "Email is required" });

    const user = await User.findOne({ email });
    if (!user) {
      return res.json({ message: "If an account exists, a password reset link will be sent." });
    }

    const token = applyPasswordResetToken(user);
    await user.save();

    const emailResult = await sendPasswordResetEmail(user, token);
    if (!emailResult.sent) {
      return res.status(502).json({
        message: `Reset email could not be sent: ${emailResult.reason}`
      });
    }

    res.json({ message: "Password reset link sent. Please check your inbox." });
  })
);

router.post(
  "/reset-password",
  asyncHandler(async (req, res) => {
    const token = req.body.token || "";
    const password = req.body.password || "";

    if (password.length < 8) {
      return res.status(400).json({ message: "Password must be at least 8 characters" });
    }

    const user = await User.findOne({
      passwordResetTokenHash: hashToken(token),
      passwordResetExpiresAt: { $gt: new Date() }
    });

    if (!user) return res.status(400).json({ message: "Reset link is invalid or expired" });

    user.passwordHash = await bcrypt.hash(password, 12);
    user.passwordResetTokenHash = "";
    user.passwordResetExpiresAt = null;
    user.emailVerified = true;
    user.authProvider = "local";
    await user.save();

    res.json({ ...authResponse(user), message: "Password updated" });
  })
);

router.get(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json({
      id: req.user._id,
      name: req.user.name,
      email: req.user.email,
      emailVerified: req.user.emailVerified,
      authProvider: req.user.authProvider
    });
  })
);

export default router;
