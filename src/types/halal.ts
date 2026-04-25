export type DocumentType =
  | "company-registration"
  | "premises-license"
  | "ingredient-list"
  | "process-flow";

export type IngredientStatus = "Halal" | "Haram" | "Ambiguous";

export type UploadedDocument = {
  id: string;
  name: string;
  documentType: DocumentType;
  confidence: number;
  text: string;
  uploadedAt: string;
};

export type IngredientVerification = {
  id: string;
  ingredientName: string;
  normalizedName: string;
  status: IngredientStatus;
  confidence: number;
  reasoning: string;
  sourceDocumentId: string;
  sourceDocumentName: string;
  isOverridden?: boolean;
  supplierCertificateUploaded?: boolean;
};
