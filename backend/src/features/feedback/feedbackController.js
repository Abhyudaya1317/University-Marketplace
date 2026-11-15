// Save signed-in feedback and reports, with all attachments visible only to administrators.
import { prisma } from "../../lib/prisma.js";
import { feedbackPhotoContentType, readFeedbackPhoto, removeFeedbackPhoto, storeFeedbackPhoto } from "./feedbackPhotoUpload.js";

const allowedKinds = new Set(["FEEDBACK", "REPORT_USER", "REPORT_LISTING", "OTHER_ISSUE"]);

function findListingId(value) {
    if (typeof value !== "string" || !value.trim() || value.trim().length > 500) return null;
    try {
        const url = new URL(value.trim(), process.env.FRONTEND_URL || "https://unibee.in");
        if (url.protocol !== "https:" && url.protocol !== "http:") return null;
        const match = url.pathname.match(/^\/products\/(\d+)\/?$/);
        if (!match) return null;
        const id = Number(match[1]);
        return Number.isSafeInteger(id) && id > 0 ? id : null;
    } catch { return null; }
}

export async function createFeedbackReport(request, response) {
    const kind = typeof request.body?.kind === "string" ? request.body.kind : "";
    const details = typeof request.body?.details === "string" ? request.body.details.trim() : "";
    const targetUserName = typeof request.body?.targetUserName === "string" ? request.body.targetUserName.trim().replace(/\s+/g, " ") : "";
    const targetListingUrl = typeof request.body?.targetListingUrl === "string" ? request.body.targetListingUrl.trim() : "";
    const targetListingId = targetListingUrl ? findListingId(targetListingUrl) : null;
    if (!allowedKinds.has(kind)) return response.status(400).json({ success: false, message: "Choose a feedback or report type." });
    if (details.length < 10 || details.length > 2000) return response.status(400).json({ success: false, message: "Describe the issue in 10 to 2,000 characters." });
    if (kind === "REPORT_USER" && (targetUserName.length < 2 || targetUserName.length > 100)) return response.status(400).json({ success: false, message: "Enter the name of the user you are reporting." });
    if (kind === "REPORT_LISTING" && (!targetListingId || targetListingUrl.length > 500)) return response.status(400).json({ success: false, message: "Enter a valid listing link, such as /products/123." });

    const photoKeys = [];
    let report;
    try {
        let targetUserId = null;
        let linkedListingId = null;
        if (kind === "REPORT_USER") {
            const matchingUsers = await prisma.user.findMany({
                where: { fullName: { equals: targetUserName, mode: "insensitive" } },
                select: { id: true },
                take: 2,
            });
            if (matchingUsers.length === 1) targetUserId = matchingUsers[0].id;
        }
        if (kind === "REPORT_LISTING" && targetListingId) {
            const listing = await prisma.listing.findUnique({ where: { id: targetListingId }, select: { id: true } });
            linkedListingId = listing?.id ?? null;
        }
        report = await prisma.feedbackReport.create({
            data: { kind, details, reporterId: request.user.id,
                targetUserName: kind === "REPORT_USER" ? targetUserName : null,
                targetListingUrl: kind === "REPORT_LISTING" ? targetListingUrl : null,
                targetUserId, targetListingId: linkedListingId, photoKeys: [] },
            select: { id: true },
        });
        for (const file of request.files) photoKeys.push(await storeFeedbackPhoto(file, report.id));
        await prisma.feedbackReport.update({ where: { id: report.id }, data: { photoKeys } });
        return response.status(201).json({ success: true, message: "Thanks. Your feedback or report was sent to the CampusX admin team." });
    } catch (error) {
        await Promise.allSettled(photoKeys.map(removeFeedbackPhoto));
        if (report) await prisma.feedbackReport.deleteMany({ where: { id: report.id } }).catch(() => {});
        const storageHttpFailure = typeof error?.message === "string" && error.message.startsWith("SUPABASE_STORAGE_HTTP_");
        console.error("Feedback submission failed:", error?.code ?? (storageHttpFailure ? error.message : error?.name) ?? "UNKNOWN");
        const storageUnavailable = error?.message === "FEEDBACK_STORAGE_NOT_CONFIGURED";
        const migrationRequired = error?.code === "P2021" || error?.code === "P2022";
        return response.status(500).json({ success: false, message: storageUnavailable
            ? "Photo storage is not configured on the server yet."
            : migrationRequired ? "Feedback storage is not ready yet. Apply the latest database migration, then try again."
            : storageHttpFailure ? "Photo storage is unavailable. Check that the Supabase message-attachments bucket is set up."
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
