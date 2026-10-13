import type { Contact } from "./types.js";

export interface ContactRepository {
  create(contact: Contact): Promise<Contact>;
  findById(ownerId: string, id: string): Promise<Contact | undefined>;
  list(ownerId: string, search?: string): Promise<Contact[]>;
  update(ownerId: string, id: string, changes: Partial<Contact>): Promise<Contact | undefined>;
  delete(ownerId: string, id: string): Promise<boolean>;
}

export class InMemoryContactRepository implements ContactRepository {
  private readonly contacts = new Map<string, Contact>();

  async create(contact: Contact): Promise<Contact> {
    this.contacts.set(contact.id, contact);
    return contact;
  }

  async findById(ownerId: string, id: string): Promise<Contact | undefined> {
    const contact = this.contacts.get(id);
    return contact?.ownerId === ownerId ? contact : undefined;
  }

  async list(ownerId: string, search?: string): Promise<Contact[]> {
    const query = search?.trim().toLowerCase();
    return [...this.contacts.values()]
      .filter((contact) => contact.ownerId === ownerId)
      .filter((contact) => !query || [contact.name, contact.company, contact.mobile, contact.email]
        .some((value) => value?.toLowerCase().includes(query)))
      .sort((left, right) => left.name.localeCompare(right.name));
  }

  async update(ownerId: string, id: string, changes: Partial<Contact>): Promise<Contact | undefined> {
    const current = await this.findById(ownerId, id);
    if (!current) return undefined;
    const updated = { ...current, ...changes, id: current.id, ownerId: current.ownerId };
    this.contacts.set(id, updated);
    return updated;
  }

  async delete(ownerId: string, id: string): Promise<boolean> {
    const contact = await this.findById(ownerId, id);
    return contact ? this.contacts.delete(id) : false;
  }
}
