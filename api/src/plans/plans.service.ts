import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  canTransition,
  type CreatePlanInput,
  type CreateRecommendationInput,
  type ApprovalDecisionInput,
} from '@drilliq/shared';

import { PrismaService } from '../prisma/prisma.service';
import type { JwtUser } from '../auth/jwt.strategy';

@Injectable()
export class PlansService {
  constructor(private readonly prisma: PrismaService) {}

  private async audit(
    db: Prisma.TransactionClient,
    user: JwtUser,
    action: 'CREATE' | 'UPDATE' | 'APPROVE' | 'REJECT',
    entityType: string,
    entityId: string,
    diff: unknown,
  ): Promise<void> {
    await db.auditLog.create({
      data: {
        clientId: user.clientId,
        actorUserId: user.userId,
        action,
        entityType,
        entityId,
        diff: diff as Prisma.InputJsonValue,
      },
    });
  }

  async createPlan(user: JwtUser, input: CreatePlanInput) {
    return this.prisma.tenant(async (db) => {
      const plan = await db.plan.create({
        data: {
          clientId: user.clientId,
          wellId: input.wellId,
          title: input.title,
          kind: input.kind,
          status: 'DRAFT',
          createdById: user.userId,
        },
      });
      await this.audit(db, user, 'CREATE', 'Plan', plan.id, input);
      return plan;
    });
  }

  async listPlans() {
    return this.prisma.tenant((db) =>
      db.plan.findMany({
        orderBy: { createdAt: 'desc' },
        take: 200,
        include: { well: { select: { name: true } }, _count: { select: { recommendations: true } } },
      }),
    );
  }

  async getPlan(id: string) {
    return this.prisma.tenant(async (db) => {
      const plan = await db.plan.findUnique({
        where: { id },
        include: {
          well: { select: { name: true } },
          recommendations: { include: { bitMaster: true } },
        },
      });
      if (!plan) throw new NotFoundException('Plan not found');
      const approvals = await db.approval.findMany({
        where: { subjectType: 'PLAN', subjectId: id },
        orderBy: { createdAt: 'desc' },
      });
      return { ...plan, approvals };
    });
  }

  async addRecommendation(user: JwtUser, planId: string, input: CreateRecommendationInput) {
    return this.prisma.tenant(async (db) => {
      const plan = await db.plan.findUnique({ where: { id: planId } });
      if (!plan) throw new NotFoundException('Plan not found');
      const rec = await db.recommendation.create({
        data: {
          clientId: user.clientId,
          planId,
          wellSectionId: input.wellSectionId ?? null,
          bitMasterId: input.bitMasterId ?? null,
          targetWob: input.targetWob ?? null,
          targetRpm: input.targetRpm ?? null,
          targetFlow: input.targetFlow ?? null,
          predictedRop: input.predictedRop ?? null,
          predictedMse: input.predictedMse ?? null,
          rationale: input.rationale ?? null,
        },
      });
      await this.audit(db, user, 'UPDATE', 'Plan', planId, { addedRecommendation: rec.id });
      return rec;
    });
  }

  /** DRAFT|REJECTED → PROPOSED, opening a PENDING approval. */
  async submit(user: JwtUser, planId: string) {
    return this.transition(user, planId, 'PROPOSED', async (db, plan) => {
      await db.approval.create({
        data: {
          clientId: user.clientId,
          subjectType: 'PLAN',
          subjectId: plan.id,
          requestedById: user.userId,
          status: 'PENDING',
        },
      });
      await this.audit(db, user, 'UPDATE', 'Plan', plan.id, { submit: true });
    });
  }

  /** PROPOSED → APPROVED / REJECTED, deciding the open approval. */
  async decide(user: JwtUser, planId: string, approve: boolean, decision: ApprovalDecisionInput) {
    const to = approve ? 'APPROVED' : 'REJECTED';
    return this.transition(user, planId, to, async (db, plan) => {
      const open = await db.approval.findFirst({
        where: { subjectType: 'PLAN', subjectId: plan.id, status: 'PENDING' },
        orderBy: { createdAt: 'desc' },
      });
      if (open) {
        await db.approval.update({
          where: { id: open.id },
          data: {
            status: approve ? 'APPROVED' : 'REJECTED',
            decidedById: user.userId,
            decidedAt: new Date(),
            comment: decision.comment ?? null,
          },
        });
      }
      await this.audit(db, user, approve ? 'APPROVE' : 'REJECT', 'Plan', plan.id, { comment: decision.comment ?? null });
    });
  }

  private async transition(
    user: JwtUser,
    planId: string,
    to: string,
    onOk: (db: Prisma.TransactionClient, plan: { id: string; status: string }) => Promise<void>,
  ) {
    return this.prisma.tenant(async (db) => {
      const plan = await db.plan.findUnique({ where: { id: planId } });
      if (!plan) throw new NotFoundException('Plan not found');
      if (!canTransition(plan.status, to)) {
        throw new BadRequestException(`Cannot transition plan from ${plan.status} to ${to}`);
      }
      await onOk(db, plan);
      return db.plan.update({ where: { id: planId }, data: { status: to as never } });
    });
  }
}
