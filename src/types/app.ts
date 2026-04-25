import type { IngredientVerification, UploadedDocument } from "@/types/halal";

export type UserRole = "sme" | "supplier";
export type AuthMode = "login" | "register";
export type SmeSection = "upload" | "ingredients" | "export";
export type SupplierSection = "requests" | "certificates";

export type AuthUser = {
  role: UserRole;
  regNo: string;
  name: string;
};

export type SmeState = {
  documents: UploadedDocument[];
  ingredients: IngredientVerification[];
};

export type SupplierResolutionStatus = "Halal" | "Haram" | "Unknown";

export type SupplierRequest = {
  id: string;
  smeName: string;
  ingredientName: string;
  status: "pending" | "resolved";
  timestamp: string;
  resolutionStatus?: SupplierResolutionStatus;
  supportingEvidence?: string;
  uploadedCertificateName?: string;
};
