"use client";

import type { SupplierRequest, SupplierResolutionStatus } from "@/types/app";

const REQUESTS_KEY = "halalchain_requests";
const REQUESTS_UPDATED_EVENT = "halalchain_requests_updated";

function emitRequestsUpdated() {
  window.dispatchEvent(new CustomEvent(REQUESTS_UPDATED_EVENT));
}

export function getSupplierRequests(): SupplierRequest[] {
  const raw = localStorage.getItem(REQUESTS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as SupplierRequest[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    localStorage.removeItem(REQUESTS_KEY);
    return [];
  }
}

export function setSupplierRequests(requests: SupplierRequest[]) {
  localStorage.setItem(REQUESTS_KEY, JSON.stringify(requests));
  emitRequestsUpdated();
}

export function createSupplierRequest(input: { smeName: string; ingredientName: string }) {
  const requests = getSupplierRequests();
  const duplicatePending = requests.find(
    (item) =>
      item.status === "pending" &&
      item.smeName === input.smeName &&
      item.ingredientName.toLowerCase() === input.ingredientName.toLowerCase()
  );

  if (duplicatePending) return duplicatePending;

  const next: SupplierRequest = {
    id: crypto.randomUUID(),
    smeName: input.smeName,
    ingredientName: input.ingredientName,
    status: "pending",
    timestamp: new Date().toISOString(),
  };
  setSupplierRequests([next, ...requests]);
  return next;
}

export function resolveSupplierRequest(input: {
  id: string;
  resolutionStatus: SupplierResolutionStatus;
  supportingEvidence?: string;
  uploadedCertificateName?: string;
}) {
  const requests = getSupplierRequests();
  const updated = requests.map((item) =>
    item.id === input.id
      ? {
          ...item,
          status: "resolved" as const,
          resolutionStatus: input.resolutionStatus,
          supportingEvidence: input.supportingEvidence,
          uploadedCertificateName: input.uploadedCertificateName,
        }
      : item
  );
  setSupplierRequests(updated);
}

export function subscribeSupplierRequests(listener: () => void) {
  const storageListener = (event: StorageEvent) => {
    if (event.key === REQUESTS_KEY) listener();
  };
  const eventListener = () => listener();

  window.addEventListener("storage", storageListener);
  window.addEventListener(REQUESTS_UPDATED_EVENT, eventListener);

  return () => {
    window.removeEventListener("storage", storageListener);
    window.removeEventListener(REQUESTS_UPDATED_EVENT, eventListener);
  };
}
