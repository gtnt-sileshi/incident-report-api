import { examFieldRepository } from './exam-field.repository';
import { AppError } from '../middleware/errorHandler';
import { ExamField, NewExamField } from '../db/schema';

export interface CreateExamFieldData {
  name: string;
  location?: string;
  latitude?: string;
  longitude?: string;
}

export interface UpdateExamFieldData {
  name?: string;
  location?: string;
  latitude?: string;
  longitude?: string;
  isActive?: boolean;
}

export class ExamFieldService {
  /**
   * Creates a new exam field.
   * Requirements: 3.2
   */
  async createExamField(data: CreateExamFieldData): Promise<ExamField> {
    const newField: NewExamField = {
      name: data.name,
      location: data.location ?? null,
      latitude: data.latitude ?? null,
      longitude: data.longitude ?? null,
      isActive: true,
    };

    return examFieldRepository.create(newField);
  }

  /**
   * Updates an existing exam field's fields.
   * Requirements: 3.6
   */
  async updateExamField(id: string, data: UpdateExamFieldData): Promise<ExamField> {
    const existing = await examFieldRepository.findById(id);
    if (!existing) {
      throw new AppError(404, 'EXAM_FIELD_NOT_FOUND', `Exam field ${id} not found`);
    }

    const updateData: Partial<NewExamField> = {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.location !== undefined && { location: data.location }),
      ...(data.latitude !== undefined && { latitude: data.latitude }),
      ...(data.longitude !== undefined && { longitude: data.longitude }),
      ...(data.isActive !== undefined && { isActive: data.isActive }),
    };

    const updated = await examFieldRepository.update(id, updateData);
    if (!updated) {
      throw new AppError(404, 'EXAM_FIELD_NOT_FOUND', `Exam field ${id} not found`);
    }

    return updated;
  }

  /**
   * Soft-deletes an exam field by setting is_active = false.
   * Requirements: 3.6
   */
  async deleteExamField(id: string): Promise<ExamField> {
    const existing = await examFieldRepository.findById(id);
    if (!existing) {
      throw new AppError(404, 'EXAM_FIELD_NOT_FOUND', `Exam field ${id} not found`);
    }

    if (!existing.isActive) {
      throw new AppError(409, 'EXAM_FIELD_ALREADY_INACTIVE', `Exam field ${id} is already inactive`);
    }

    const updated = await examFieldRepository.update(id, { isActive: false });
    if (!updated) {
      throw new AppError(404, 'EXAM_FIELD_NOT_FOUND', `Exam field ${id} not found`);
    }

    return updated;
  }

  /**
   * Lists all active exam fields.
   * Requirements: 3.2, 3.3
   */
  async listExamFields(): Promise<ExamField[]> {
    return examFieldRepository.findAll(false);
  }

  /**
   * Fetches a single exam field by ID.
   * Requirements: 3.2
   */
  async getExamField(id: string): Promise<ExamField> {
    const field = await examFieldRepository.findById(id);
    if (!field) {
      throw new AppError(404, 'EXAM_FIELD_NOT_FOUND', `Exam field ${id} not found`);
    }
    return field;
  }
}

export const examFieldService = new ExamFieldService();
export default ExamFieldService;
