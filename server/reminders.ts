import type { Request, Response } from "express";
import { cleanupExpiredTrendExportDownloads, deliverScheduledLearningReminder, deliverScheduledMonthlyCertificateAuditReport, deliverScheduledMonthlyComparisonReview } from "./db";
import { sdk } from "./_core/sdk";

export async function handleScheduledLearningReminder(req: Request, res: Response) {
  try {
    const user = await sdk.authenticateRequest(req);
    if (!user.isCron || !user.taskUid) return res.status(403).json({ error: "cron-only" });
    return res.json(await deliverScheduledLearningReminder(user.taskUid));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[Learning reminder] scheduled delivery failed", error);
    return res.status(500).json({ error: message, context: { url: req.originalUrl }, timestamp: new Date().toISOString() });
  }
}

export async function handleScheduledTrendExportRetention(req: Request, res: Response) {
  try {
    const user = await sdk.authenticateRequest(req);
    if (!user.isCron || !user.taskUid) return res.status(403).json({ error: "cron-only" });
    return res.json(await cleanupExpiredTrendExportDownloads(user.taskUid));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[Trend export retention] scheduled cleanup failed", error);
    return res.status(500).json({ error: message, context: { url: req.originalUrl }, timestamp: new Date().toISOString() });
  }
}

export async function handleScheduledMonthlyCertificateAudit(req: Request, res: Response) {
  try {
    const user = await sdk.authenticateRequest(req);
    if (!user.isCron || !user.taskUid) return res.status(403).json({ error: "cron-only" });
    return res.json(await deliverScheduledMonthlyCertificateAuditReport(user.taskUid));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[Monthly certificate audit] scheduled delivery failed", error);
    return res.status(500).json({ error: message, context: { url: req.originalUrl }, timestamp: new Date().toISOString() });
  }
}

export async function handleScheduledMonthlyComparisonReview(req: Request, res: Response) {
  try {
    const user = await sdk.authenticateRequest(req);
    if (!user.isCron || !user.taskUid) return res.status(403).json({ error: "cron-only" });
    return res.json(await deliverScheduledMonthlyComparisonReview(user.taskUid));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[Monthly comparison review] scheduled delivery failed", error);
    return res.status(500).json({ error: message, context: { url: req.originalUrl }, timestamp: new Date().toISOString() });
  }
}
