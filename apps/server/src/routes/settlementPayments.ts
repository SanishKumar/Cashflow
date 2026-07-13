import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { validate } from "../middleware/validate.js";
import { auditLogService } from "../services/auditLogService.js";
import { settlementPaymentService } from "../services/settlementPaymentService.js";
import { CreateSettlementPaymentSchema, DecideSettlementPaymentSchema } from "../types/api.js";

const router = Router();
const StatusQuerySchema = z.object({
  status: z.enum(["PENDING", "CONFIRMED", "REJECTED", "CANCELLED"]).optional(),
});

router.use(requireAuth);

router.get(
  "/:groupId/settlement-payments",
  asyncHandler(async (req, res) => {
    const query = StatusQuerySchema.parse(req.query);
    const payments = await settlementPaymentService.list(
      req.params.groupId as string,
      req.userId!,
      query.status
    );
    res.json({ success: true, data: payments });
  })
);

router.post(
  "/:groupId/settlement-payments",
  validate(CreateSettlementPaymentSchema),
  asyncHandler(async (req, res) => {
    const payment = await settlementPaymentService.create(
      req.params.groupId as string,
      req.body,
      req.userId!
    );
    await auditLogService.log({
      userId: req.userId!,
      groupId: req.params.groupId as string,
      action: "SETTLEMENT_SENT",
      details: `Marked a ${payment.currency} ${payment.amount.toFixed(2)} settlement payment as sent`,
      metadata: { paymentId: payment.id, toUserId: payment.toUserId, amount: payment.amount },
    });
    res.status(201).json({ success: true, data: payment });
  })
);

function decisionRoute(action: "confirm" | "reject" | "cancel") {
  return asyncHandler(async (req, res) => {
    const payment = await settlementPaymentService[action](
      req.params.groupId as string,
      req.params.paymentId as string,
      req.userId!,
      req.body.note
    );
    const auditAction = {
      confirm: "SETTLEMENT_CONFIRMED",
      reject: "SETTLEMENT_REJECTED",
      cancel: "SETTLEMENT_CANCELLED",
    }[action];
    await auditLogService.log({
      userId: req.userId!,
      groupId: req.params.groupId as string,
      action: auditAction,
      details: `${action === "confirm" ? "Confirmed" : action === "reject" ? "Rejected" : "Cancelled"} a settlement payment`,
      metadata: { paymentId: payment.id, amount: payment.amount },
    });
    res.json({ success: true, data: payment });
  });
}

router.patch(
  "/:groupId/settlement-payments/:paymentId/confirm",
  validate(DecideSettlementPaymentSchema),
  decisionRoute("confirm")
);
router.patch(
  "/:groupId/settlement-payments/:paymentId/reject",
  validate(DecideSettlementPaymentSchema),
  decisionRoute("reject")
);
router.patch(
  "/:groupId/settlement-payments/:paymentId/cancel",
  validate(DecideSettlementPaymentSchema),
  decisionRoute("cancel")
);

export default router;
