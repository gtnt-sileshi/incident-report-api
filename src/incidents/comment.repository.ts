import { eq, asc } from 'drizzle-orm';
import { getDb } from '../db/index';
import { comments, Comment, NewComment } from '../db/schema';

export class CommentRepository {
  private get db() {
    return getDb();
  }

  async findByIncident(incidentId: string): Promise<Comment[]> {
    return this.db
      .select()
      .from(comments)
      .where(eq(comments.incidentId, incidentId))
      .orderBy(asc(comments.createdAt));
  }

  async create(data: NewComment): Promise<Comment> {
    const rows = await this.db
      .insert(comments)
      .values(data)
      .returning();
    return rows[0];
  }
}

export const commentRepository = new CommentRepository();
export default CommentRepository;
