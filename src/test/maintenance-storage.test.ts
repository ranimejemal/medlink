
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getMaintenanceDemo,
  saveMaintenanceDemo,
} from "@/lib/maintenance-demo";

describe("US-38 — Stockage local des annonces", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("retourne null si aucune annonce n'existe", () => {
    expect(getMaintenanceDemo()).toBeNull();
  });

  it("enregistre et récupère une annonce", () => {
    const announcement = {
      title: "Maintenance programmée",
      message: "Intervention technique prévue.",
      startsAt: "2026-11-15T22:00",
      endsAt: "2026-11-15T23:00",
    };

    saveMaintenanceDemo(announcement);

    expect(getMaintenanceDemo()).toEqual(announcement);
  });

  it("retourne null si les données sont invalides", () => {
    localStorage.setItem(
      "medlink-maintenance-demo",
      "données-invalides"
    );

    expect(getMaintenanceDemo()).toBeNull();
  });

  it("notifie l'interface après un enregistrement", () => {
    const listener = vi.fn();

    window.addEventListener("maintenance-demo-updated", listener);

    try {
      saveMaintenanceDemo({
        title: "Maintenance",
        message: "Test",
        startsAt: "2026-11-15T22:00",
        endsAt: "2026-11-15T23:00",
      });

      expect(listener).toHaveBeenCalledOnce();
    } finally {
      window.removeEventListener("maintenance-demo-updated", listener);
    }
  });
});
