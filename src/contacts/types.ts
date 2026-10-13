export const relationshipTypes = ["customer", "vendor", "lead", "partner", "employee", "other"] as const;
export type RelationshipType = (typeof relationshipTypes)[number];

export interface Contact {
  id: string;
  ownerId: string;
  name: string;
  company?: string;
  mobile?: string;
  email?: string;
  relationship: RelationshipType;
  notes?: string;
  nextFollowUpAt?: string;
  createdAt: string;
  updatedAt: string;
}
