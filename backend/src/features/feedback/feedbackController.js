// Save signed-in feedback and reports, with all attachments visible only to administrators.
import { prisma } from "../../lib/prisma.js";
import { feedbackPhotoContentType, readFeedbackPhoto, removeFeedbackPhoto, storeFeedbackPhoto } from "./feedbackPhotoUpload.js";

const allowedKinds = new Set(["FEEDBACK", "REPORT_USER", "REPORT_LISTING", "OTHER_ISSUE"]);

function parseOptionalId(value) {
    if (value === undefined || value === null || value === "") return null;
    const id = Number(value);
    return Number.isSafeInteger(id) && id > 0 ? id : NaN;
}

export async function createFeedbackReport(request, response) {
    const kind = typeof request.body?.kind === "string" ? request.body.kind : "";
    const details = typeof request.body?.details === "string" ? request.body.details.trim() : "";
    const targetUserId = parseOptionalId(request.body?.targetUserId);
    const targetListingId = parseOptionalId(request.body?.targetListingId);
    if (!allowedKinds.has(kind)) return response.status(400).json({ success: false, message: "Choose a feedback or report type." });
    if (details.length < 10 || details.length > 2000) return response.status(400).json({ success: false, message: "Describe the issue in 10 to 2,000 characters." });
    if (Number.isNaN(targetUserId) || Number.isNaN(targetListingId)) return response.status(400).json({ success: false, message: "Enter a valid user or listing ID." });
    if (kind === "REPORT_USER" && !targetUserId) return response.status(400).json({ success: false, message: "Enter the user ID you are reporting." });
    if (kind === "REPORT_LISTING" && !targetListingId) return response.status(400).json({ success: false, message: "Enter the listing ID you are reporting." });

    const photoKeys = [];
    let report;
    try {
        report = await prisma.feedbackReport.create({
            data: { kind, details, reporterId: request.user.id, targetUserId, targetListingId, photoKeys: [] },
            select: { id: true },
        });
        for (const file of request.files) photoKeys.push(await storeFeedbackPhoto(file, report.id));
        await prisma.feedbackReport.update({ where: { id: report.id }, data: { photoKeys } });
        return response.status(201).json({ success: true, message: "Thanks. Your feedback or report was sent to the CampusX admin team." });
    } catch (error) {
        await Promise.allSettled(photoKeys.map(removeFeedbackPhoto));
        if (report) await prisma.feedbackReport.deleteMany({ where: { id: report.id } }).catch(() => {});
        console.error("Feedback submission failed:", error?.code ?? error?.name ?? "UNKNOWN");
        const storageUnavailable = error?.message === "FEEDBACK_STORAGE_NOT_CONFIGURED";
        return response.status(500).json({ success: false, message: storageUnavailable
            ? "Photo storage is not configured on the server yet."
            : "We could not send your report. Please try again." });
    }
}

export async function getAdminFeedbackReports(_request, response) {
    try {
        const reports = await prisma.feedbackReport.findMany({
            orderBy: { createdAt: "desc" },
            take: 200,
            include: {
                reporter: { select: { id: true, fullName: true, email: true } },
                targetUser: { select: { id: true, fullName: true, email: true } },
                targetListing: { select: { id: true, title: true } },
            },
        });
        return response.json({ success: true, reports: reports.map(({ photoKeys, ...report }) => ({
            ...report, photos: photoKeys.map((_key, index) => `/api/admin/feedback/${report.id}/photos/${index}`),
        })) });
    } catch (error) {
        console.error("Admin feedback load failed:", error?.code ?? error?.name ?? "UNKNOWN");
        return response.status(500).json({ success: false, message: "Feedback and reports could not be loaded." });
    }
}

export async function getAdminFeedbackPhoto(request, response) {
    const reportId = Number(request.params.reportId);
    const photoIndex = Number(request.params.photoIndex);
    if (!Number.isSafeInteger(reportId) || reportId < 1 || !Number.isSafeInteger(photoIndex) || photoIndex < 0 || photoIndex > 3) {
        return response.status(400).json({ success: false, message: "That photo was not found." });
    }
    try {
        const report = await prisma.feedbackReport.findUnique({ where: { id: reportId }, select: { photoKeys: true } });
        const photoKey = report?.photoKeys[photoIndex];
        if (!photoKey) return response.status(404).json({ success: false, message: "That photo was not found." });
        const bytes = await readFeedbackPhoto(photoKey);
        response.setHeader("Content-Type", feedbackPhotoContentType(photoKey));
        response.setHeader("Cache-Control", "private, no-store");
        response.setHeader("X-Content-Type-Options", "nosniff");
        return response.send(bytes);
    } catch (error) {
        console.error("Admin feedback photo load failed:", error?.code ?? error?.name ?? "UNKNOWN");
        return response.status(404).json({ success: false, message: "That photo could not be loaded." });
    }
}
