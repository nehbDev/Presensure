import BackgroundService from "react-native-background-actions";
import * as Notifications from "expo-notifications";
import { Platform, AppState } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { bleUtils } from "./bleUtils";
import { Device } from "react-native-ble-plx";
import API_URL from "../api/apiConfig";

const sleep = (time: number) =>
  new Promise<void>((resolve) => setTimeout(() => resolve(), time));

// Global state
let activeStudentTask: any = null;
let isTaskStarting = false;
let isScanningInProgress = false;
let appState = AppState.currentState;

// --- Detection Throttling ---
const DETECTION_COOLDOWN = 120000; // 2 minutes
const LAST_DETECTION_TIME_KEY = "lastDetectionTime";
const studentLastDetection: Record<number, number> = {}; // in-memory tracking

// App state listener
AppState.addEventListener("change", async (nextAppState) => {
  console.log(`🔄 App state changed: ${appState} -> ${nextAppState}`);
  appState = nextAppState;

  if (nextAppState === "background") {
    await ensureBackgroundServiceRunning();
  }
});

const ensureBackgroundServiceRunning = async () => {
  try {
    const storedTask = await AsyncStorage.getItem("activeStudentTask");
    const taskType = await AsyncStorage.getItem("backgroundTaskType");

    if (storedTask && !BackgroundService.isRunning()) {
      console.log("🔄 Restarting background service after app state change");
      const taskData = JSON.parse(storedTask);

      if (taskType === "instructor") {
        await startInstructorTask(taskData.subjectCode);
      } else if (
        taskType === "student" &&
        taskData.scheduleId &&
        taskData.studentId
      ) {
        await startStudentScanningTask(
          taskData.subjectCode,
          taskData.scheduleId,
          taskData.studentId
        );
      }
    }
  } catch (error) {
    console.error("Error ensuring background service:", error);
  }
};

const instructorTask = async (taskData: any) => {
  const { subjectCode } = taskData;

  try {
    await AsyncStorage.setItem("backgroundTaskType", "instructor");

    while (BackgroundService.isRunning()) {
      console.log(`📡 Attendance session active for: ${subjectCode}`);

      try {
        await BackgroundService.updateNotification({
          taskTitle: `📘 ${subjectCode} - Session Active`,
          taskDesc: "Attendance session is ongoing",
          progressBar: { max: 100, value: 100 },
        });
      } catch (e) {
        console.warn("Failed to update background notification:", e);
      }

      await sleep(30000); // Update every 30 seconds
    }
  } catch (error) {
    console.error("Background task error:", error);
  } finally {
    await AsyncStorage.removeItem("backgroundTaskType");
  }
};

const recordBackgroundDetection = async (
  studentId: number,
  scheduleId: number,
  rssi: number | null,
  subjectCode: string
) => {
  try {
    const now = Date.now();

    // Check in-memory cooldown first (fastest)
    if (studentLastDetection[studentId]) {
      const timeSinceLast = now - studentLastDetection[studentId];
      const timeSinceLastSeconds = Math.round(timeSinceLast / 1000);

      if (timeSinceLast < DETECTION_COOLDOWN) {
        if (timeSinceLastSeconds < 105) {
          console.log(
            `⏸️  Skipping detection for student ${studentId} — last was ${timeSinceLastSeconds}s ago (must wait 120s)`
          );
          return;
        } else {
          console.log(
            `🟡 Allowing detection despite ${timeSinceLastSeconds}s cooldown (within flexible range)`
          );
        }
      }
    }

    // Check persisted last detection (across app restarts)
    const lastDetectionTime = await AsyncStorage.getItem(
      `${LAST_DETECTION_TIME_KEY}_${studentId}`
    );
    if (lastDetectionTime) {
      const timeSinceLast = now - parseInt(lastDetectionTime);
      const timeSinceLastSeconds = Math.round(timeSinceLast / 1000);

      if (timeSinceLast < DETECTION_COOLDOWN) {
        if (timeSinceLastSeconds < 105) {
          console.log(
            `⏸️  Skipping detection (storage) — last was ${timeSinceLastSeconds}s ago`
          );
          return;
        } else {
          console.log(
            `🟡 Allowing detection (storage) despite ${timeSinceLastSeconds}s cooldown`
          );
        }
      }
    }

    console.log(
      `📝 Recording background BLE detection for student ${studentId}...`
    );

    // Fetch active session first
    const sessionResponse = await fetch(
      `${API_URL}/attendance-sessions/active?schedule_id=${scheduleId}`,
      {
        method: "GET",
        headers: { Accept: "application/json" },
      }
    );

    if (!sessionResponse.ok) {
      console.warn("⚠️ Could not fetch active session info");
      return;
    }

    const sessionData = await sessionResponse.json();
    console.log("📊 Session data received:", sessionData);

    const sessionId = sessionData.session?.attendance_session_id;

    if (sessionId) {
      console.log(`✅ Found active session: ${sessionId}`);

      // ✅ FIRST: Check if attendance record exists
      console.log("🔍 Checking for existing attendance record...");
      const attendanceCheckResponse = await fetch(
        `${API_URL}/attendance/check?student_id=${studentId}&session_id=${sessionId}`
      );

      let attendanceRecordExists = false;

      if (attendanceCheckResponse.ok) {
        const attendanceResult = await attendanceCheckResponse.json();
        console.log("📊 Attendance check result:", attendanceResult);
        attendanceRecordExists = attendanceResult.hasAttendance;
        console.log(`📊 Attendance record exists: ${attendanceRecordExists}`);
      } else {
        console.log(
          "❌ Failed to check attendance:",
          attendanceCheckResponse.status
        );
      }

      // ✅ If no attendance record exists, CREATE ONE first
      if (!attendanceRecordExists) {
        console.log(
          "📝 Creating new attendance record via background detection..."
        );

        const createAttendanceResponse = await fetch(
          `${API_URL}/attendance/ble-mark`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              student_id: studentId,
              subject_code: subjectCode,
              session_id: sessionId,
              ble_manufacturer_data: subjectCode,
              rssi_value: rssi,
            }),
          }
        );

        console.log(
          "📡 Create Attendance Response status:",
          createAttendanceResponse.status
        );

        if (createAttendanceResponse.ok) {
          const result = await createAttendanceResponse.json();
          console.log(
            "✅ Attendance record created via background detection:",
            result
          );
          // Now record the BLE detection
        } else if (createAttendanceResponse.status === 409) {
          console.log("✅ Attendance record already exists (duplicate)");
          // Continue to record BLE detection
        } else {
          const errorText = await createAttendanceResponse.text();
          console.warn("⚠️ Failed to create attendance record:", errorText);
          return;
        }
      }

      // ✅ NOW record the BLE detection (attendance record should exist)
      console.log("📡 Sending BLE detection request...");
      const detectionResponse = await fetch(
        `${API_URL}/attendance/ble-detection`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            student_id: studentId,
            session_id: sessionId,
            rssi_value: rssi,
          }),
        }
      );

      console.log(
        "📡 BLE Detection Response status:",
        detectionResponse.status
      );

      if (detectionResponse.ok) {
        const result = await detectionResponse.json();
        console.log(`✅ BLE detection recorded (RSSI: ${rssi})`, result);

        // ✅ Set timestamps for cooldown
        studentLastDetection[studentId] = now;
        await AsyncStorage.setItem(
          `${LAST_DETECTION_TIME_KEY}_${studentId}`,
          now.toString()
        );
      } else {
        const errorText = await detectionResponse.text();
        console.warn("⚠️ Detection not recorded (server rejected):", errorText);
      }
    } else {
      console.log("❌ No active session found for background detection");
    }
  } catch (error) {
    console.error("❌ Error recording background BLE detection:", error);
  }
};
const studentScanningTask = async (taskData: any) => {
  const { subjectCode, scheduleId, studentId } = taskData;

  try {
    console.log(
      `🎓 Starting persistent background scanning for: ${subjectCode}`
    );
    await AsyncStorage.setItem("backgroundTaskType", "student");

    const SCAN_INTERVAL = 120000; // 2 minutes - fixed interval
    const SCAN_DURATION = 15000; // 15 seconds scan duration

    while (BackgroundService.isRunning()) {
      const cycleStart = Date.now();

      console.log(
        `🔄 Background scan for: ${subjectCode} @ ${new Date().toLocaleTimeString()}`
      );

      // ✅ IMPROVED: Check if session time has passed before scanning
      let shouldStopScanning = false;
      
      try {
        const sessionResponse = await fetch(
          `${API_URL}/attendance-sessions/active?schedule_id=${scheduleId}`,
          {
            method: "GET",
            headers: { Accept: "application/json" },
          }
        );

        if (sessionResponse.ok) {
          const sessionData = await sessionResponse.json();
          
          console.log("⏰ Session check:", {
            time_expired: sessionData.time_expired,
            time_remaining_minutes: sessionData.time_remaining_minutes,
            message: sessionData.message,
            hasSession: !!sessionData.session
          });
          
          if (sessionData.time_expired) {
            console.log("⏰ Session time has passed (API) - stopping background scanning");
            shouldStopScanning = true;
          }

          if (!sessionData.session) {
            console.log("❌ No active session found - stopping background scanning");
            shouldStopScanning = true;
          }

          // ✅ ADD: Manual time check as backup
          if (sessionData.session) {
            const session = sessionData.session;
            const sessionEndTime = new Date(session.end_time);
            const currentTime = new Date();
            
            console.log("⏰ Manual time check:", {
              currentTime: currentTime.toLocaleString(),
              sessionEndTime: sessionEndTime.toLocaleString(),
              isPassed: currentTime > sessionEndTime,
              timeRemaining: Math.round((sessionEndTime.getTime() - currentTime.getTime()) / 60000) + " minutes"
            });

            if (currentTime > sessionEndTime) {
              console.log("⏰ Manual time check: Session ended - stopping background scanning");
              shouldStopScanning = true;
            } else {
              console.log(`✅ Session active - ends at ${sessionEndTime.toLocaleTimeString()} (${Math.round((sessionEndTime.getTime() - currentTime.getTime()) / 60000)} minutes remaining)`);
            }
          }
        } else {
          console.log("⚠️ Could not fetch session info - continuing scan");
        }
      } catch (sessionError) {
        console.error("❌ Error checking session status:", sessionError);
        // Continue scanning if we can't check session status
      }

      // ✅ STOP if session time has passed
      if (shouldStopScanning) {
        console.log("🛑 Stopping background scanning due to session end");
        await stopStudentScanningTask();
        return; // Exit the while loop completely
      }

      // Update notification with time remaining
      try {
        await BackgroundService.updateNotification({
          taskTitle: `📚 ${subjectCode}`,
          taskDesc: `Auto scanning...`,
        });
      } catch (e) {
        console.warn("Failed to update notification:", e);
      }

      // ✅ FIX: Prevent multiple simultaneous scans
      if (isScanningInProgress) {
        console.log("⏸️  Scan already in progress, skipping...");
        await sleep(SCAN_INTERVAL);
        continue;
      }

      try {
        isScanningInProgress = true;
        console.log(
          `🎯 Starting BLE scan for ${subjectCode} for ${SCAN_DURATION / 1000}s`
        );

        // Clear any previous callbacks
        bleUtils.clearBackgroundDeviceCallback();

        // Set up detection callback
        const detectionCallback = (device: Device) => {
          if (device.manufacturerData) {
            const manufacturer = bleUtils.decodeManufacturerData(
              device.manufacturerData
            );
            const normalizedManufacturer = manufacturer
              ?.replace(/[\s-]/g, "")
              .trim()
              .toLowerCase();
            const normalizedSubject = subjectCode
              .replace(/[\s-]/g, "")
              .trim()
              .toLowerCase();

            if (normalizedManufacturer === normalizedSubject) {
              console.log(
                `✅ Matched BLE: ${manufacturer}, RSSI: ${device.rssi}`
              );
              // ✅ Pass subjectCode to the detection function
              recordBackgroundDetection(
                studentId,
                scheduleId,
                device.rssi,
                subjectCode
              );
            }
          }
        };

        bleUtils.setBackgroundDeviceCallback(detectionCallback);

        // Start scan and wait for the duration
        await bleUtils.startDeviceScan({
          filterByManufacturer: subjectCode,
          timeout: SCAN_DURATION,
          autoConnect: false,
        });

        // Wait for the scan duration
        await sleep(SCAN_DURATION);
      } catch (err) {
        console.error("❌ BLE scan failed:", err);
      } finally {
        // ✅ FIX: Always cleanup scanning state
        bleUtils.stopDeviceScan();
        bleUtils.clearBackgroundDeviceCallback();
        isScanningInProgress = false;
      }

      const cycleTime = Date.now() - cycleStart;
      const sleepTime = Math.max(SCAN_INTERVAL - cycleTime, 0);

      // Save task state
      await AsyncStorage.setItem(
        "activeStudentTask",
        JSON.stringify({
          subjectCode,
          scheduleId,
          studentId,
          lastScanTime: new Date().toISOString(),
          nextScanTime: new Date(Date.now() + sleepTime).toLocaleTimeString(),
        })
      );

      console.log(
        `⏱️ Scan complete — next scan in ${Math.round(sleepTime / 1000)}s (at ${new Date(Date.now() + sleepTime).toLocaleTimeString()})`
      );

      // Wait for the remaining interval time
      if (sleepTime > 0) {
        await sleep(sleepTime);
      }
    }
  } catch (error) {
    console.error("Student background task error:", error);
  } finally {
    // ✅ FIX: Comprehensive cleanup
    isScanningInProgress = false;
    bleUtils.stopDeviceScan();
    bleUtils.clearBackgroundDeviceCallback();

    await AsyncStorage.multiRemove([
      "activeStudentTask",
      "backgroundTaskType",
    ]);
    activeStudentTask = null;
  }
};
// --- Background service configs ---
const getInstructorOptions = (subjectCode: string) => ({
  taskName: "AttendanceSession",
  taskTitle: `📘 ${subjectCode} - Session Active`,
  taskDesc: "Attendance session is ongoing",
  taskIcon: { name: "ic_launcher", type: "mipmap" },
  color: "#2563eb",
  parameters: { subjectCode },
});

const getStudentOptions = (
  subjectCode: string,
  scheduleId: number,
  studentId: number
) => ({
  taskName: "StudentScanning",
  taskTitle: `📚 ${subjectCode}`,
  taskDesc: "Auto attendance scanning in progress",
  taskIcon: { name: "ic_launcher", type: "mipmap" },
  color: "#10b981",
  parameters: { subjectCode, scheduleId, studentId },
});

// --- ✅ FIXED: Task start/stop functions with better state management ---
export const startInstructorTask = async (subjectCode: string) => {
  try {
    const options = getInstructorOptions(subjectCode);

    if (BackgroundService.isRunning()) {
      console.log("🔄 Instructor background task already running — updating");
      await BackgroundService.updateNotification({
        taskTitle: `📘 ${subjectCode} - Session Active`,
        taskDesc: "Attendance session is ongoing",
      });
      return;
    }

    await AsyncStorage.setItem(
      "activeStudentTask",
      JSON.stringify({ subjectCode, startedAt: new Date().toISOString() })
    );

    await BackgroundService.start(instructorTask, options);
    console.log(
      "✅ Instructor background task started - notification should appear"
    );
  } catch (error) {
    console.error("❌ Failed to start instructor background task:", error);
  }
};
export const stopInstructorTask = async () => {
  try {
    if (BackgroundService.isRunning()) {
      await BackgroundService.stop();
      console.log("🛑 Instructor background task stopped");
    }

    // Clear all related storage to ensure clean state
    const keys = await AsyncStorage.getAllKeys();
    const taskKeys = keys.filter(
      (key) =>
        key.includes("activeStudentTask") || key.includes("backgroundTaskType")
    );

    if (taskKeys.length > 0) {
      await AsyncStorage.multiRemove(taskKeys);
    }

    console.log("✅ Background service fully stopped and cleaned up");
  } catch (error) {
    console.error("Error stopping instructor task:", error);
  }
};

export const startStudentScanningTask = async (
  subjectCode: string,
  scheduleId: number,
  studentId: number
) => {
  if (isTaskStarting) {
    console.log("⏸️  Task start already in progress, skipping...");
    return;
  }

  isTaskStarting = true;

  try {
    // ✅ FIX: Check if already running for the same schedule
    const currentTask = await getCurrentStudentTask();
    if (
      currentTask &&
      currentTask.scheduleId === scheduleId &&
      BackgroundService.isRunning()
    ) {
      console.log(
        "✅ Student background task already running for this schedule"
      );
      return;
    }

    const options = getStudentOptions(subjectCode, scheduleId, studentId);

    // Stop any existing background service
    if (BackgroundService.isRunning()) {
      console.log("🛑 Stopping existing background service...");
      await BackgroundService.stop();
      await sleep(2000); // Give time for proper cleanup
    }

    await AsyncStorage.setItem(
      "activeStudentTask",
      JSON.stringify({ subjectCode, scheduleId, studentId })
    );

    await BackgroundService.start(studentScanningTask, options);
    console.log("✅ Student background scanning task started");
    activeStudentTask = { subjectCode, scheduleId, studentId };
  } catch (e) {
    console.error("❌ Failed to start student background task:", e);
  } finally {
    isTaskStarting = false;
  }
};

export const stopStudentScanningTask = async () => {
  try {
    if (BackgroundService.isRunning()) {
      await BackgroundService.stop();
      console.log("🛑 Student background scanning task stopped");
    }

    // ✅ FIX: Clear all related storage
    const keys = await AsyncStorage.getAllKeys();
    const taskKeys = keys.filter(
      (key) =>
        key.includes("activeStudentTask") ||
        key.includes("backgroundTaskType") ||
        key.includes(LAST_DETECTION_TIME_KEY)
    );

    if (taskKeys.length > 0) {
      await AsyncStorage.multiRemove(taskKeys);
    }

    activeStudentTask = null;
    isScanningInProgress = false;
  } catch (error) {
    console.error("Error stopping student task:", error);
  }
};

export const notifyStudentAttendance = async (subjectCode: string) => {
  try {
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("attendance", {
        name: "Attendance Notifications",
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: "#FF231F7C",
      });
    }

    await Notifications.scheduleNotificationAsync({
      content: {
        title: "✅ Attendance Recorded",
        body: `Your attendance for ${subjectCode} has been saved.`,
        sound: true,
        priority: Notifications.AndroidNotificationPriority.HIGH,
      },
      trigger: null,
    });

    console.log("🎉 Student attendance notification sent");
  } catch (e) {
    console.error("❌ Failed to send student notification:", e);
  }
};

export const isStudentTaskRunning = async (): Promise<boolean> => {
  return BackgroundService.isRunning();
};

export const getCurrentStudentTask = async () => {
  try {
    const taskData = await AsyncStorage.getItem("activeStudentTask");
    return taskData ? JSON.parse(taskData) : null;
  } catch (error) {
    console.error("Error getting current student task:", error);
    return null;
  }
};

export const initializeBackgroundServices = async () => {
  console.log("🔄 Initializing background service recovery...");
  await ensureBackgroundServiceRunning();
}