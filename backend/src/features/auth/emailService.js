// Create and reuse the configured SMTP mailer without printing private settings.
import nodemailer from "nodemailer";

let transporter;

function getTransporter() {
    if (!transporter) {
        transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: Number(process.env.SMTP_PORT),
            secure: process.env.SMTP_SECURE === "true",
            auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
        });
    }
    return transporter;
}

// Wait until the owner configures an email provider in backend/.env.
export function isEmailDeliveryConfigured() {
    return Boolean(process.env.SMTP_HOST && process.env.SMTP_PORT && process.env.SMTP_USER
        && process.env.SMTP_PASSWORD && process.env.SMTP_FROM);
}

// Deliver a short-lived password-reset code without logging the code or address.
export async function sendPasswordResetCode(email, code) {
    if (!isEmailDeliveryConfigured()) throw new Error("Email delivery is not configured.");

    await getTransporter().sendMail({
        from: process.env.SMTP_FROM,
        to: email,
        subject: "Reset your CampusX password",
        text: `Your CampusX password-reset code is ${code}. It expires in 10 minutes.`,
        html: `<p>Your CampusX password-reset code is <strong>${code}</strong>.</p><p>It expires in 10 minutes. If you did not request it, ignore this email.</p>`
    });
}

// Notify the configured administrators with the report details and its selected photos.
export async function sendFeedbackReportNotification({ reportId, kind, details, reporterEmail, targetUserName, targetListingUrl, photos }) {
    const recipients = (process.env.ADMIN_EMAILS ?? "").split(",").map((email) => email.trim()).filter(Boolean);
    if (!isEmailDeliveryConfigured() || recipients.length === 0) throw new Error("FEEDBACK_EMAIL_NOT_CONFIGURED");

    const attachments = photos.map((photo, index) => ({
        filename: `report-${reportId}-photo-${index + 1}${photo.detectedExtension}`,
        content: photo.buffer,
        contentType: photo.detectedMimeType,
        contentDisposition: "attachment",
    }));
    const targetLines = [
        targetUserName ? `Reported user: ${targetUserName}` : null,
        targetListingUrl ? `Listing link: ${targetListingUrl}` : null,
    ].filter(Boolean);
    await getTransporter().sendMail({
        from: process.env.SMTP_FROM,
        to: recipients,
        subject: `CampusX ${kind.replaceAll("_", " ").toLowerCase()} #${reportId}`,
        text: [
            `A CampusX ${kind.replaceAll("_", " ").toLowerCase()} was submitted.`,
            `Report: #${reportId}`,
            `From: ${reporterEmail}`,
            ...targetLines,
            "",
            "Details:",
            details,
            "",
            `${photos.length} photo(s) are attached. The report is also available in the Admin Console → Feedback & Reports.`,
        ].join("\n"),
        attachments,
    });
}
