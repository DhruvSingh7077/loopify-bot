export interface Note {
  id: string;
  ownerId: string;
  title: string;
  content: string;
  contactId?: string;
  notedAt?: string;
  createdAt: string;
  updatedAt: string;
}
