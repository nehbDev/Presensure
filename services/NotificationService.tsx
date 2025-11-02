// services/NotificationService.ts
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

let currentNotificationId: string | null = null;

export async function initializeNotificationService(): Promise<boolean> {
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("session-channel", {
      name: "Session Notifications",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#FF231F7C",
      sound: "default",
    });
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  return finalStatus === "granted";
}

// 🔹 Basic session notification (no timer)
export async function showSessionNotification({
  name,
  id,
}: {
  name: string;
  id: number | string;
}) {
  if (currentNotificationId) {
    try {
      await Notifications.cancelScheduledNotificationAsync(
        currentNotificationId
      );
    } catch {}
  }

  currentNotificationId = await Notifications.scheduleNotificationAsync({
    content: {
      title: "Attendance Session Started",
      body: `Session for ${name} is now active.`,
      sound: "default",
      priority: Notifications.AndroidNotificationPriority.HIGH,
      data: { sessionId: id },
    },
    trigger: null,
  });
}

// 🔹 Session notification with timer
export async function showSessionNotificationWithTimer(
  sessionName: string,
  sessionId: number | string,
  elapsedSeconds: number
) {
  // Only update every 60s (to prevent spam)
  if (elapsedSeconds % 60 !== 0) return;

  if (currentNotificationId) {
    try {
      await Notifications.cancelScheduledNotificationAsync(
        currentNotificationId
      );
    } catch {}
  }

  const minutes = Math.floor(elapsedSeconds / 60);
  const seconds = elapsedSeconds % 60;
  const timerText = `${minutes.toString().padStart(2, "0")}:${seconds
    .toString()
    .padStart(2, "0")}`;

  currentNotificationId = await Notifications.scheduleNotificationAsync({
    content: {
      title: "Attendance Session Active",
      body: `Session for ${sessionName} active. Duration: ${timerText}`,
      sound: "default",
      data: { sessionId, elapsedSeconds },
    },
    trigger: null, // immediate
  });
}

export async function showSessionNotificationWithTime(
  sessionName: string,
  sessionId: number | string,
  elapsedSeconds: number
) {
  if (currentNotificationId) {
    try {
      await Notifications.cancelScheduledNotificationAsync(
        currentNotificationId
      );
    } catch {}
  }

  const minutes = Math.floor(elapsedSeconds / 60);
  const seconds = elapsedSeconds % 60;
  const timerText = `${minutes.toString().padStart(2, "0")}:${seconds
    .toString()
    .padStart(2, "0")}`;

  currentNotificationId = await Notifications.scheduleNotificationAsync({
    content: {
      title: "Attendance Session Active",
      body: `Session for ${sessionName} active. Duration: ${timerText}.`,
      sound: "default",
      priority: Notifications.AndroidNotificationPriority.HIGH,
      data: { sessionId, elapsedSeconds },
    },
    trigger: null,
  });
}

export async function clearSessionNotification() {
  if (currentNotificationId) {
    try {
      await Notifications.cancelScheduledNotificationAsync(
        currentNotificationId
      );
    } catch {}
    currentNotificationId = null;
  }
}
