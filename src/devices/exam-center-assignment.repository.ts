import { eq, and } from 'drizzle-orm';
import { getDb } from '../db/index';
import { examCenterAssignments, ExamCenterAssignment } from '../db/schema';
// ExamCenterAssignment type is inferred from the schema table

export class ExamCenterAssignmentRepository {
  private get db() {
    return getDb();
  }

  async findByUser(userId: string): Promise<ExamCenterAssignment[]> {
    return this.db
      .select()
      .from(examCenterAssignments)
      .where(eq(examCenterAssignments.userId, userId));
  }

  async findByExamField(examFieldId: string): Promise<ExamCenterAssignment[]> {
    return this.db
      .select()
      .from(examCenterAssignments)
      .where(eq(examCenterAssignments.examFieldId, examFieldId));
  }

  async assign(userId: string, examFieldId: string): Promise<ExamCenterAssignment> {
    const rows = await this.db
      .insert(examCenterAssignments)
      .values({ userId, examFieldId })
      .returning();
    return rows[0];
  }

  async unassign(userId: string, examFieldId: string): Promise<void> {
    await this.db
      .delete(examCenterAssignments)
      .where(
        and(
          eq(examCenterAssignments.userId, userId),
          eq(examCenterAssignments.examFieldId, examFieldId),
        ),
      );
  }

  async replaceAssignments(userId: string, examFieldIds: string[]): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx
        .delete(examCenterAssignments)
        .where(eq(examCenterAssignments.userId, userId));

      if (examFieldIds.length > 0) {
        await tx.insert(examCenterAssignments).values(
          examFieldIds.map((examFieldId) => ({ userId, examFieldId })),
        );
      }
    });
  }
}

export const examCenterAssignmentRepository = new ExamCenterAssignmentRepository();
export default ExamCenterAssignmentRepository;
