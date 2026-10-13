import type { Note } from "./types.js";

export interface NoteRepository {
  create(note: Note): Promise<Note>;
  list(ownerId: string, search?: string): Promise<Note[]>;
  findById(ownerId: string, id: string): Promise<Note | undefined>;
  update(ownerId: string, id: string, changes: Partial<Note>): Promise<Note | undefined>;
  delete(ownerId: string, id: string): Promise<boolean>;
}

export class InMemoryNoteRepository implements NoteRepository {
  private readonly notes = new Map<string, Note>();

  async create(note: Note) {
    this.notes.set(note.id, note);
    return note;
  }

  async list(ownerId: string, search?: string) {
    const query = search?.trim().toLowerCase();
    return [...this.notes.values()]
      .filter((note) => note.ownerId === ownerId)
      .filter((note) => !query || `${note.title} ${note.content}`.toLowerCase().includes(query))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async findById(ownerId: string, id: string) {
    const note = this.notes.get(id);
    return note?.ownerId === ownerId ? note : undefined;
  }

  async update(ownerId: string, id: string, changes: Partial<Note>) {
    const note = await this.findById(ownerId, id);
    if (!note) return undefined;
    const updated = { ...note, ...changes };
    this.notes.set(id, updated);
    return updated;
  }

  async delete(ownerId: string, id: string) {
    const note = await this.findById(ownerId, id);
    return Boolean(note && this.notes.delete(id));
  }
}
