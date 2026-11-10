
export type MaintenanceAnnouncement = {
  title: string;
  message: string;
  startsAt: string;
  endsAt: string;
};

const STORAGE_KEY = "medlink-maintenance-demo";

export function saveMaintenanceDemo(
  announcement: MaintenanceAnnouncement
) {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(announcement)
  );

  window.dispatchEvent(new Event("maintenance-demo-updated"));
}

export function getMaintenanceDemo(): MaintenanceAnnouncement | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);

    if (!stored) return null;

    const data: unknown = JSON.parse(stored);

    if (
      typeof data !== "object" ||
      data === null ||
      !("title" in data) ||
      !("message" in data) ||
      !("startsAt" in data) ||
      !("endsAt" in data) ||
      typeof data.title !== "string" ||
      typeof data.message !== "string" ||
      typeof data.startsAt !== "string" ||
      typeof data.endsAt !== "string"
    ) {
      return null;
    }

    return {
      title: data.title,
      message: data.message,
      startsAt: data.startsAt,
      endsAt: data.endsAt,
    };
  } catch {
    return null;
  }
}
