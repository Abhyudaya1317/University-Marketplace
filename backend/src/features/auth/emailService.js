// Create and reuse the configured SMTP mailer without printing private settings.
import nodemailer from "nodemailer";

let transporter;

// Wait until the owner configures an email provider in backend/.env.
export function isEmailDeliveryConfigured() {
    return Boolean(process.env.SMTP_HOST && process.env.SMTP_PORT && process.env.SMTP_USER
        && process.env.SMTP_PASSWORD && process.env.SMTP_FROM);
}

// Deliver a short-lived password-reset code without logging the code or address.
export async function sendPasswordResetCode(email, code) {
    if (!isEmailDeliveryConfigured()) throw new Error("Email delivery is not configured.");

    if (!transporter) {
        transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: Number(process.env.SMTP_PORT),
            secure: process.env.SMTP_SECURE === "true",
            auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
        });
    }

    await transporter.sendMail({
        from: process.env.SMTP_FROM,
        to: email,
        subject: "Reset your CampusX password",
        text: `Your CampusX password-reset code is ${code}. It expires in 10 minutes.`,
        html: `<p>Your CampusX password-reset code is <strong>${code}</strong>.</p><p>It expires in 10 minutes. If you did not request it, ignore this email.</p>`
    });
}
