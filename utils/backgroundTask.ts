import BackgroundService from "react-native-background-actions";
import * as Notifications from "expo-notifications";
import { Platform, AppState, Linking, Alert } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { bleUtils } from "./bleUtils";
import { Device } from "react-native-ble-plx";
import { API_URL } from "../api/apiConfig";

const sleep = (time: number) =>
  new Promise<void>((resolve) => setTimeout(() => resolve(), time));

// Global state
let activeStudentTask: any = null;
let isTaskStarting = false;
let isScanningInProgress = false;
let appState = AppState.currentState;

// --- Detection Throttling & Locking ---
const DETECTION_COOLDOWN = 60000; // 1 minute cooldown
const LAST_DETECTION_TIME_KEY = "lastDetectionTime";
const PRESENSURE_SERVICE_UUID = "4fafc201-1fb5-459e-8fcc-c5c9c331914b";
const SCAN_MODE_LOW_LATENCY = 2; 

// In-memory trackers
const studentLastDetection: Record<number, number> = {};
const processingMap: Record<number, boolean> = {}; 

// --- App State Listener ---
AppState.addEventListener("change", async (nextAppState) => {
  console.log(`🔄 App state changed: ${appState} -> ${nextAppState}`);
  appState = nextAppState;

  if (nextAppState === "background") {
    await ensureBackgroundServiceRunning();
  }
});

// --- Helper: Ensure Service is Alive ---
const ensureBackgroundServiceRunning = async () => {
  try {
    const storedTask = await AsyncStorage.getItem("activeStudentTask");
    const taskType = await AsyncStorage.getItem("backgroundTaskType");

    if (storedTask && !BackgroundService.isRunning()) {
      console.log("🔄 Restarting background service after app state change");
      const taskData = JSON.parse(storedTask);

      if (taskType === "instructor") {
        const scheduleId = taskData.scheduleId || 0;
        await startInstructorTask(taskData.subjectCode, scheduleId);
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

// --- Helper: Battery Optimization Request ---
export const requestBatteryExemption = () => {
  if (Platform.OS === 'android') {
    Alert.alert(
      "Background Permission Needed",
      "To keep scanning while the screen is off (Android 15+), please ensure this app is set to 'Unrestricted' in battery settings.",
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Open Settings", 
          onPress: () => Linking.openSettings() 
        }
      ]
    );
  }
};

const recordBackgroundDetection = async (
  studentId: number,
  scheduleId: number,
  rssi: number | null,
  subjectCode: string
) => {
  if (processingMap[studentId]) return;

  const now = Date.now();

  if (studentLastDetection[studentId]) {
    const timeSinceLast = now - studentLastDetection[studentId];
    if (timeSinceLast < DETECTION_COOLDOWN) return;
  }

  processingMap[studentId] = true;
  const previousDetectionTime = studentLastDetection[studentId];
  studentLastDetection[studentId] = now; 

  try {
    const lastDetectionTime = await AsyncStorage.getItem(
      `${LAST_DETECTION_TIME_KEY}_${studentId}`
    );
    if (lastDetectionTime) {
      const timeSinceLast = now - parseInt(lastDetectionTime);
      if (timeSinceLast < DETECTION_COOLDOWN) {
        console.log(`⏸️ Skipping detection (storage cooldown)`);
        return;
      }
    }

    console.log(`📝 Recording background BLE detection for student ${studentId}...`);

    const sessionResponse = await fetch(
      `${API_URL}/attendance-sessions/active?schedule_id=${scheduleId}`,
      { headers: { Accept: "application/json" } }
    );

    if (!sessionResponse.ok) return;

    const sessionData = await sessionResponse.json();
    const sessionId = sessionData.session?.attendance_session_id;

    if (sessionId) {
      const attendanceCheckResponse = await fetch(
        `${API_URL}/attendance/check?student_id=${studentId}&session_id=${sessionId}`
      );

      let attendanceRecordExists = false;
      let isExcused = false; // ✅ NEW STATE TO TRACK

      if (attendanceCheckResponse.ok) {
        const attendanceResult = await attendanceCheckResponse.json();
        attendanceRecordExists = attendanceResult.hasAttendance;
        // ✅ CHECK IF STATUS IS EXCUSED
        if (attendanceRecordExists && attendanceResult.attendance?.status?.toLowerCase() === 'excused') {
           isExcused = true;
        }
      }

      // ✅ DO NOTHING IF EXCUSED
      if (isExcused) {
        console.log("🛑 Student is excused. Ignoring BLE detection.");
        // We also want to kill the task to save battery since they are excused
        await stopStudentScanningTask();
        return;
      }

      if (!attendanceRecordExists) {
        await fetch(`${API_URL}/attendance/ble-mark`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            student_id: studentId,
            subject_code: subjectCode,
            session_id: sessionId,
            ble_manufacturer_data: subjectCode,
            rssi_value: rssi,
          }),
        });
        await notifyStudentAttendance(subjectCode);
      }

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

      if (detectionResponse.ok) {
        console.log(`✅ BLE detection recorded (RSSI: ${rssi})`);
        await AsyncStorage.setItem(
          `${LAST_DETECTION_TIME_KEY}_${studentId}`,
          Date.now().toString()
        );
      }
    }
  } catch (error) {
    console.error("❌ Error recording background BLE detection:", error);
    if (previousDetectionTime) {
      studentLastDetection[studentId] = previousDetectionTime;
    } else {
      delete studentLastDetection[studentId];
    }
  } finally {
    processingMap[studentId] = false;
  }
};

const studentScanningTask = async (taskData: any) => {
  const { subjectCode, scheduleId, studentId } = taskData;

  try {
    console.log(`🎓 Starting persistent background scanning for: ${subjectCode}`);
    await AsyncStorage.setItem("backgroundTaskType", "student");

    const SCAN_INTERVAL = 120000; 
    const SCAN_DURATION = 15000; 
    const HEARTBEAT_RATE = 2000; // 2s Heartbeat for CPU Wake

    while (BackgroundService.isRunning()) {
      const cycleStart = Date.now();
      let deviceFoundInCycle = false;

      console.log(`🔄 [${new Date().toLocaleTimeString()}] Waking up for scan: ${subjectCode}`);

      let shouldStopScanning = false;
      let activeSessionId = null; // Track session ID for the status check

      // 1. Check if Session is Active
      try {
        const sessionResponse = await fetch(
          `${API_URL}/attendance-sessions/active?schedule_id=${scheduleId}`,
          { headers: { Accept: "application/json" } }
        );

        if (sessionResponse.ok) {
          const sessionData = await sessionResponse.json();
          if (sessionData.time_expired || !sessionData.session) {
            shouldStopScanning = true;
          } else {
             const endTime = new Date(sessionData.session.end_time);
             if (new Date() > endTime) shouldStopScanning = true;
             else activeSessionId = sessionData.session.attendance_session_id;
          }
        }
      } catch (sessionError) {
        console.error("❌ Session check error (network might be dozing):", sessionError);
      }

      // 2. ✅ NEW: Check if Student is Excused before attempting a scan
      if (!shouldStopScanning && activeSessionId) {
        try {
          const statusResponse = await fetch(
            `${API_URL}/attendance/check?student_id=${studentId}&session_id=${activeSessionId}`
          );
          if (statusResponse.ok) {
            const statusData = await statusResponse.json();
            if (statusData.hasAttendance && statusData.attendance?.status?.toLowerCase() === 'excused') {
              console.log("🛑 Student is excused. Aborting background scan loop.");
              shouldStopScanning = true;
            }
          }
        } catch (statusError) {
          console.error("❌ Status check error:", statusError);
        }
      }

      if (shouldStopScanning) {
        console.log("🛑 Stopping background scanning due to session end or excused status");
        await stopStudentScanningTask();
        return; 
      }

      try {
        await BackgroundService.updateNotification({
          taskTitle: `📚 ${subjectCode}`,
          taskDesc: `Scanning... [${new Date().toLocaleTimeString()}]`,
          progressBar: { max: 100, value: 50, indeterminate: true },
        });
      } catch (e) {}

      if (!isScanningInProgress) {
        try {
          isScanningInProgress = true;
          bleUtils.clearBackgroundDeviceCallback();

          const state = await bleUtils.getBluetoothState();
          if (state !== 'PoweredOn') {
             console.log("⚠️ Bluetooth sleeping or off, trying to wake...");
          }

          const detectionCallback = (device: Device) => {
            if (deviceFoundInCycle) return;

            if (device.manufacturerData) {
              const manufacturer = bleUtils.decodeManufacturerData(device.manufacturerData);
              const normalizedManufacturer = manufacturer?.replace(/[\s-]/g, "").trim().toLowerCase();
              const normalizedSubject = subjectCode.replace(/[\s-]/g, "").trim().toLowerCase();

              if (normalizedManufacturer === normalizedSubject) {
                console.log(`✅ MATCH FOUND: ${manufacturer}`);
                
                deviceFoundInCycle = true;
                bleUtils.stopDeviceScan(); 
                
                recordBackgroundDetection(
                  studentId,
                  scheduleId,
                  device.rssi,
                  subjectCode
                ).catch(e => console.error("Record Error", e));
              }
            }
          };

          bleUtils.setBackgroundDeviceCallback(detectionCallback);

          // Force Low Latency Scan for Android 15
          await bleUtils.startDeviceScan({
            serviceUUIDs: [PRESENSURE_SERVICE_UUID], 
            filterByManufacturer: subjectCode,
            timeout: SCAN_DURATION,
            autoConnect: false,
            scanMode: SCAN_MODE_LOW_LATENCY,
            allowDuplicates: true,
          } as any);

          let elapsed = 0;
          while (elapsed < SCAN_DURATION && !deviceFoundInCycle && BackgroundService.isRunning()) {
            await sleep(1000);
            elapsed += 1000;
          }

        } catch (err) {
          console.error("❌ BLE scan failed:", err);
        } finally {
          bleUtils.stopDeviceScan();
          bleUtils.clearBackgroundDeviceCallback();
          isScanningInProgress = false;
        }
      }

      const cycleTime = Date.now() - cycleStart;
      let remainingSleep = Math.max(SCAN_INTERVAL - cycleTime, 5000); 
      const nextScanTime = new Date(Date.now() + remainingSleep).toLocaleTimeString();

      try {
        await BackgroundService.updateNotification({
          taskTitle: `📚 ${subjectCode}`,
          taskDesc: `Next scan: ${nextScanTime}`,
          progressBar: { max: 100, value: 0, indeterminate: false },
        });
      } catch (e) {}

      await AsyncStorage.setItem(
        "activeStudentTask",
        JSON.stringify({
          subjectCode,
          scheduleId,
          studentId,
          lastScanTime: new Date().toISOString(),
          nextScanTime: nextScanTime,
        })
      );

      // Busy-Wait Loop to keep Thread Alive
      while (remainingSleep > 0 && BackgroundService.isRunning()) {
        const sleepChunk = Math.min(remainingSleep, HEARTBEAT_RATE);
        await sleep(sleepChunk);
        remainingSleep -= sleepChunk;
      }
    }
  } catch (error) {
    console.error("Student background task error:", error);
  } finally {
    isScanningInProgress = false;
    bleUtils.stopDeviceScan();
    await AsyncStorage.multiRemove(["activeStudentTask", "backgroundTaskType"]);
  }
};

// ... [Keep Instructor Task & Helper functions] ...

const instructorTask = async (taskData: any) => {
  const { subjectCode, scheduleId } = taskData;
  try {
    await AsyncStorage.setItem("backgroundTaskType", "instructor");
    while (BackgroundService.isRunning()) {
      let shouldStopSession = false;
      try {
        const sessionResponse = await fetch(
          `${API_URL}/attendance-sessions/active?schedule_id=${scheduleId}`
        );
        if (sessionResponse.ok) {
          const sessionData = await sessionResponse.json();
          if (sessionData.time_expired || !sessionData.session) {
            shouldStopSession = true;
          }
        }
      } catch (e) {
        console.error("❌ Instructor check failed", e);
      }
      if (shouldStopSession) {
        await stopInstructorTask();
        return;
      }
      try {
        await BackgroundService.updateNotification({
          taskTitle: `📘 ${subjectCode} - Active`,
          taskDesc: "Broadcasting attendance session...",
        });
      } catch (e) {}
      await sleep(30000);
    }
  } catch (e) {
    console.error(e);
  } finally {
    await AsyncStorage.multiRemove(["activeStudentTask", "backgroundTaskType"]);
  }
};

const getInstructorOptions = (subjectCode: string) => ({
  taskName: "AttendanceSession",
  taskTitle: `📘 ${subjectCode}`,
  taskDesc: "Session Active",
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
  taskDesc: "Auto scanning active",
  taskIcon: { name: "ic_launcher", type: "mipmap" },
  color: "#10b981",
  parameters: { subjectCode, scheduleId, studentId },
});

export const startInstructorTask = async (subjectCode: string, scheduleId: number) => {
  try {
    const options = getInstructorOptions(subjectCode);
    if (BackgroundService.isRunning()) return;
    await AsyncStorage.setItem(
      "activeStudentTask",
      JSON.stringify({ subjectCode, scheduleId })
    );
    await BackgroundService.start(instructorTask, options);
    console.log("✅ Instructor background task started");
  } catch (error) {
    console.error("❌ Failed to start instructor task:", error);
  }
};

export const stopInstructorTask = async () => {
  try {
    if (BackgroundService.isRunning()) await BackgroundService.stop();
    console.log("✅ Instructor task stopped");
  } catch (error) {
    console.error("Error stopping instructor task:", error);
  }
};

export const startStudentScanningTask = async (
  subjectCode: string,
  scheduleId: number,
  studentId: number
) => {
  if (isTaskStarting) return;
  isTaskStarting = true;
  try {
    const currentTask = await getCurrentStudentTask();
    if (currentTask && currentTask.scheduleId === scheduleId && BackgroundService.isRunning()) {
      return;
    }
    const options = getStudentOptions(subjectCode, scheduleId, studentId);
    if (BackgroundService.isRunning()) {
      await BackgroundService.stop();
      await sleep(1000);
    }
    await AsyncStorage.setItem(
      "activeStudentTask",
      JSON.stringify({ subjectCode, scheduleId, studentId })
    );
    await BackgroundService.start(studentScanningTask, options);
    console.log("✅ Student background scanning task started");
    activeStudentTask = { subjectCode, scheduleId, studentId };
  } catch (e) {
    console.error("❌ Failed to start student task:", e);
  } finally {
    isTaskStarting = false;
  }
};

export const stopStudentScanningTask = async () => {
  try {
    if (BackgroundService.isRunning()) await BackgroundService.stop();
    activeStudentTask = null;
    isScanningInProgress = false;
    console.log("✅ Student task stopped");
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
  } catch (e) {
    console.error("❌ Failed to send notification:", e);
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
    return null;
  }
};