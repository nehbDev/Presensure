import React, {
  useEffect,
  useState,
  useRef,
  useCallback,
  useMemo,
} from "react";
import {
  View,
  Text,
  FlatList,
  ActivityIndicator,
  TouchableOpacity,
  RefreshControl,
  AppState,
  Image,
  SectionList,
} from "react-native";
import { Device, State } from "react-native-ble-plx";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons, FontAwesome5 } from "@expo/vector-icons";
import { useNavigation, NavigationProp } from "@react-navigation/native";
import API_URL from "../api/apiConfig";
import { bleUtils, bleManager } from "../utils/bleUtils";
import { useBLEConnection } from "../contexts/BLEConnectionContext";
import {
  startInstructorTask,
  stopInstructorTask,
  startStudentScanningTask,
  stopStudentScanningTask,
  isStudentTaskRunning,
  getCurrentStudentTask,
} from "../utils/backgroundTask";
import InstructorView from "../components/InstructorView";
import StudentView from "../components/StudentView";
import { useAlertHandler } from "../components/useAlertHandler";
import InstructorStudentListView from "../components/InstructorStudentListView";

// Types
interface Schedule {
  schedule_id: number;
  subject_code: string;
  subject_description: string;
  room: string;
  days: string;
  start_time: string;
  end_time: string;
  schedule_type: string;
  instructor_name?: string;
}

interface Student {
  user_id: string;
  firstname: string;
  lastname: string;
  middle_initial?: string;
  suffix?: string;
  sex: string;
  role: string;
  attendance_status?: string;
  marked_at?: string;
  image_link?: string;
}

type RootStackParamList = {
  FaceVerify: {
    schedule: Schedule;
    onVerificationSuccess: (verificationResult: boolean) => Promise<void>;
  };
};

// Constants
const SCAN_COOLDOWN_DURATION = 60000;
const SCAN_TIMEOUT = 30000;
const SCHEDULE_CHECK_INTERVAL = 60000;

// Helper Functions
const parseDayCodes = (days: string): string[] => {
  const codes: string[] = [];
  let i = 0;

  while (i < days.length) {
    if (days.substring(i, i + 2) === "Th") {
      codes.push("Th");
      i += 2;
    } else if (days.substring(i, i + 2) === "Su") {
      codes.push("Su");
      i += 2;
    } else {
      codes.push(days[i]);
      i += 1;
    }
  }
  return codes;
};

const dayMap: Record<string, number> = {
  M: 1,
  T: 2,
  W: 3,
  Th: 4,
  F: 5,
  S: 6,
  Su: 0,
};

const parseTimeToMinutes = (timeStr: string) => {
  const [hoursStr, minutesStr] = timeStr.split(":");
  return parseInt(hoursStr, 10) * 60 + parseInt(minutesStr, 10);
};

const isScheduleActiveNow = (schedule: Schedule): boolean => {
  const now = new Date();
  const currentDay = now.getDay();
  const currentTimeMinutes = now.getHours() * 60 + now.getMinutes();
  const scheduleCodes = parseDayCodes(schedule.days || "");

  if (!scheduleCodes.some((code) => dayMap[code] === currentDay)) {
    return false;
  }

  const startMinutes = parseTimeToMinutes(schedule.start_time);
  const endMinutes = parseTimeToMinutes(schedule.end_time);

  if (endMinutes < startMinutes) {
    return (
      currentTimeMinutes >= startMinutes || currentTimeMinutes <= endMinutes
    );
  }

  return currentTimeMinutes >= startMinutes && currentTimeMinutes <= endMinutes;
};

const getTimeUntilSchedule = (schedule: Schedule): string => {
  const now = new Date();
  const currentDay = now.getDay();
  const scheduleCodes = parseDayCodes(schedule.days);

  let daysUntilNext = 0;
  let found = false;

  for (let i = 0; i < 7; i++) {
    const checkDay = (currentDay + i) % 7;
    if (scheduleCodes.some((code) => dayMap[code] === checkDay)) {
      daysUntilNext = i;
      found = true;
      break;
    }
  }

  if (!found) return "Not scheduled this week";

  const startMinutes = parseTimeToMinutes(schedule.start_time);
  let minutesUntil = 0;

  if (daysUntilNext === 0) {
    const currentTimeMinutes = now.getHours() * 60 + now.getMinutes();
    if (currentTimeMinutes < startMinutes) {
      minutesUntil = startMinutes - currentTimeMinutes;
    } else {
      return "Already passed for today";
    }
  } else {
    minutesUntil =
      daysUntilNext * 24 * 60 +
      (startMinutes - (now.getHours() * 60 + now.getMinutes()));
  }

  const hoursUntil = Math.floor(minutesUntil / 60);
  const mins = minutesUntil % 60;

  return hoursUntil > 0 ? `in ${hoursUntil}h ${mins}m` : `in ${mins}m`;
};

const formatTimeAMPM = (timeStr: string): string => {
  const [hoursStr, minutesStr] = timeStr.split(":");
  let hours = parseInt(hoursStr, 10);
  const minutes = minutesStr || "00";

  const ampm = hours >= 12 ? "PM" : "AM";
  hours = hours % 12;
  hours = hours ? hours : 12;

  return `${hours}:${minutes} ${ampm}`;
};

// Main Component
export default function ViewScheduleScreen({ route }: any) {
  const { schedule }: { schedule: Schedule } = route.params;
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();

  // State
  const [devices, setDevices] = useState<Device[]>([]);
  const [scanning, setScanning] = useState(false);
  const [userRole, setUserRole] = useState<"instructor" | "student" | null>(
    null
  );
  const [sessionStatus, setSessionStatus] = useState<
    "active" | "inactive" | "unknown"
  >("unknown");
  const [autoAttendanceMarked, setAutoAttendanceMarked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [scanCooldown, setScanCooldown] = useState(false);
  const [cooldownTimer, setCooldownTimer] = useState(0);
  const [matchedDevice, setMatchedDevice] = useState<Device | null>(null);
  const [activeSessionId, setActiveSessionId] = useState<number | null>(null);
  const [isScheduleTime, setIsScheduleTime] = useState(false);
  const [timeUntilSchedule, setTimeUntilSchedule] = useState("");
  const [isBluetoothOn, setIsBluetoothOn] = useState(true);
  const [studentBackgroundTaskRunning, setStudentBackgroundTaskRunning] =
    useState(false);
  const [activeInstructorTab, setActiveInstructorTab] = useState<
    "ble" | "students"
  >("ble");
  const [students, setStudents] = useState<Student[]>([]);
  const [loadingStudents, setLoadingStudents] = useState(false);

  // Refs
  const isMountedRef = useRef(true);
  const processedDevicesRef = useRef<Set<string>>(new Set());
const scanCooldownRef = useRef<ReturnType<typeof setTimeout> | null>(null);
const rescanTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
const secondsRef = useRef(0);
const scheduleCheckRef = useRef<ReturnType<typeof setTimeout> | null>(null);


  // Context and Hooks
  const { showAlert } = useAlertHandler();
  const {
    isConnected,
    connectedDevice,
    connectDevice: globalConnectDevice,
    disconnectDevice: globalDisconnectDevice,
    currentScheduleId,
  } = useBLEConnection();

  // Memoized Values
  const normalizedSubjectCode = useCallback((subjectCode: string): string => {
    return (subjectCode || "").replace(/[\s-]/g, "").trim().toLowerCase();
  }, []);

  const scheduleTimeInfo = useMemo(
    () => ({
      isActive: isScheduleActiveNow(schedule),
      timeUntil: getTimeUntilSchedule(schedule),
    }),
    [schedule]
  );

  // Core Functions
  const checkScheduleTime = useCallback(() => {
    setIsScheduleTime(scheduleTimeInfo.isActive);
    setTimeUntilSchedule(scheduleTimeInfo.timeUntil);
    return scheduleTimeInfo.isActive;
  }, [scheduleTimeInfo]);

  const stopScanning = useCallback(() => {
    bleUtils.stopDeviceScan();
    setScanning(false);
  }, []);

  const fetchStudentsForSchedule = useCallback(async () => {
    if (!schedule.schedule_id) return;

    setLoadingStudents(true);
    try {
      const response = await fetch(
        `${API_URL}/schedules/${schedule.schedule_id}/students`,
        {
          method: "GET",
          headers: {
            Accept: "application/json",
          },
        }
      );

      const data = await response.json();

      if (response.ok && data.success) {
        setStudents(data.data.students || []);
      } else {
        setStudents([]);
      }
    } catch (error) {
      setStudents([]);
    } finally {
      setLoadingStudents(false);
    }
  }, [schedule.schedule_id]);

  const startScanning = useCallback(async () => {
    if (studentBackgroundTaskRunning) {
      showAlert(
        "Info",
        "Auto scanning is active. Manual scanning is disabled.",
        "background-scanning-active"
      );
      return;
    }

    if (!isBluetoothOn) {
      showAlert(
        "Bluetooth Off",
        "Please enable Bluetooth to scan for devices.",
        "bluetooth-off"
      );
      return;
    }

    if (!isScheduleTime) {
      showAlert(
        "Info",
        "Scanning is only available during class hours.",
        "scan-time"
      );
      return;
    }

    if (scanCooldown) {
      showAlert(
        "Cooldown",
        `Please wait ${cooldownTimer} seconds before scanning again.`,
        "scan-cooldown"
      );
      return;
    }

    if (scanning) return;

    // Session time check for students
    if (userRole === "student") {
      try {
        const response = await fetch(
          `${API_URL}/attendance-sessions/active?schedule_id=${schedule.schedule_id}`,
          { method: "GET", headers: { Accept: "application/json" } }
        );

        if (response.ok) {
          const sessionData = await response.json();
          if (sessionData.time_expired) {
            showAlert(
              "Session Ended",
              "The attendance session time has passed. Scanning is no longer available.",
              "session-time-expired"
            );
            return;
          }
          if (!sessionData.session) {
            showAlert(
              "No Active Session",
              "There is no active attendance session for this subject.",
              "no-active-session"
            );
            return;
          }
        }
      } catch (error) {
        console.error("Error checking session:", error);
      }
    }

    try {
      const filter =
        userRole === "instructor" ? schedule.room : schedule.subject_code;
      setDevices([]);
      await bleUtils.startDeviceScan({
        filterByManufacturer: filter,
        timeout: SCAN_TIMEOUT,
        autoConnect: userRole === "instructor",
      });
      setScanning(true);
    } catch (error) {
      console.error("Failed to start scanning:", error);
      setScanning(false);
    }
  }, [
    userRole,
    schedule,
    scanCooldown,
    scanning,
    isScheduleTime,
    isBluetoothOn,
    studentBackgroundTaskRunning,
    cooldownTimer,
    showAlert,
  ]);

  const startCooldownTimer = useCallback(() => {
    if (userRole !== "student") return;

    setScanCooldown(true);
    secondsRef.current = 60;
    setCooldownTimer(secondsRef.current);

    if (scanCooldownRef.current) clearInterval(scanCooldownRef.current);
    if (rescanTimerRef.current) clearTimeout(rescanTimerRef.current);

    scanCooldownRef.current = setInterval(() => {
      if (secondsRef.current > 0) {
        secondsRef.current--;
        setCooldownTimer(secondsRef.current);
      } else if (scanCooldownRef.current) {
        clearInterval(scanCooldownRef.current);
      }
    }, 1000);

    rescanTimerRef.current = setTimeout(() => {
      setScanCooldown(false);
      setCooldownTimer(0);
      if (scanCooldownRef.current) clearInterval(scanCooldownRef.current);
      processedDevicesRef.current.clear();
      setAutoAttendanceMarked(false);
      setMatchedDevice(null);

      if (sessionStatus === "active" && isScheduleTime) {
        startScanning();
      }
    }, SCAN_COOLDOWN_DURATION);
  }, [userRole, sessionStatus, isScheduleTime, startScanning]);

  const markStudentAttendance = useCallback(
    async (manufacturerData: string, deviceId: string, rssi: number | null) => {
      if (!isScheduleTime || !activeSessionId) return;

      stopScanning();

      try {
        const userData = await AsyncStorage.getItem("user");
        if (!userData) return;

        const parsedUser = JSON.parse(userData);
        const decodedManufacturer =
          bleUtils.decodeManufacturerData(manufacturerData);

        const response = await fetch(`${API_URL}/attendance/ble-mark`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            student_id: parsedUser.id,
            subject_code: schedule.subject_code,
            session_id: activeSessionId,
            ble_manufacturer_data: decodedManufacturer,
            rssi_value: rssi,
          }),
        });

        const result = await response.json();

        if (response.ok) {
          showAlert("✅ Success", result.message, "attendance-success");
          setAutoAttendanceMarked(true);
          await startStudentScanningTask(
            schedule.subject_code,
            schedule.schedule_id,
            parsedUser.id
          );
          setStudentBackgroundTaskRunning(true);
          stopScanning();
        } else if (response.status === 409 && result.duplicate) {
          showAlert(
            "ℹ️ Info",
            "Attendance already recorded - continuing BLE monitoring",
            "attendance-duplicate"
          );
          setAutoAttendanceMarked(true);
          if (!studentBackgroundTaskRunning) {
            await startStudentScanningTask(
              schedule.subject_code,
              schedule.schedule_id,
              parsedUser.id
            );
            setStudentBackgroundTaskRunning(true);
          }
        } else {
          showAlert(
            "Error",
            result.message || "Failed to mark attendance",
            "attendance-error"
          );
        }
      } catch (error) {
        console.error("Error marking attendance:", error);
        showAlert("Error", "Failed to mark attendance", "attendance-error");
      }
    },
    [
      activeSessionId,
      schedule,
      stopScanning,
      isScheduleTime,
      studentBackgroundTaskRunning,
      showAlert,
    ]
  );

  const handleBLEDetection = useCallback(
    async (manufacturerData: string, deviceId: string, rssi: number | null) => {
      if (!isScheduleTime || !activeSessionId) return;

      stopScanning();

      navigation.navigate("FaceVerify", {
        schedule: schedule,
        onVerificationSuccess: async (verificationResult: boolean) => {
          if (verificationResult) {
            await markStudentAttendance(manufacturerData, deviceId, rssi);
          } else {
            showAlert(
              "Verification Failed",
              "Face verification failed. Please try again.",
              "face-verification-failed"
            );
            startScanning();
          }
        },
      });
    },
    [
      activeSessionId,
      schedule,
      stopScanning,
      isScheduleTime,
      markStudentAttendance,
      startScanning,
      showAlert,
      navigation,
    ]
  );

  const recordBLEDetection = useCallback(
    async (rssi: number | null) => {
      if (!isScheduleTime || !activeSessionId || !autoAttendanceMarked) return;

      try {
        const userData = await AsyncStorage.getItem("user");
        if (!userData) return;

        const parsedUser = JSON.parse(userData);
        await fetch(`${API_URL}/attendance/ble-detection`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            student_id: parsedUser.id,
            session_id: activeSessionId,
            rssi_value: rssi,
          }),
        });
      } catch (error) {
        console.error("Error recording BLE detection:", error);
      }
    },
    [activeSessionId, isScheduleTime, autoAttendanceMarked]
  );

  const connectToDevice = useCallback(
    async (device: Device) => {
      if (userRole === "student" && !isScheduleTime) {
        showAlert(
          "Info",
          "Device connection is only available during class hours.",
          "connect-hours"
        );
        return;
      }

      try {
        if (isConnected && connectedDevice?.id === device.id) return;

        if (
          isConnected &&
          connectedDevice &&
          connectedDevice.id !== device.id
        ) {
          await globalDisconnectDevice();
        }

        await bleUtils.connectToDevice(device);
      } catch (error) {
        console.error("Error connecting to device:", error);
      }
    },
    [
      userRole,
      isConnected,
      connectedDevice,
      globalDisconnectDevice,
      isScheduleTime,
      showAlert,
    ]
  );

  const handleManualRescan = useCallback(() => {
    if (studentBackgroundTaskRunning) {
      showAlert(
        "Info",
        "Auto scanning is active. Manual rescan is disabled.",
        "background-scanning-active"
      );
      return;
    }

    if (!isScheduleTime) {
      showAlert(
        "Info",
        "Scanning is only available during class hours.",
        "rescan-time"
      );
      return;
    }

    setScanCooldown(false);
    setCooldownTimer(0);
    if (scanCooldownRef.current) clearInterval(scanCooldownRef.current);
    if (rescanTimerRef.current) clearTimeout(rescanTimerRef.current);
    processedDevicesRef.current.clear();
    setAutoAttendanceMarked(false);
    setMatchedDevice(null);
    startScanning();
  }, [startScanning, isScheduleTime, studentBackgroundTaskRunning, showAlert]);

  const handleDisconnect = async (): Promise<void> => {
    try {
      await stopInstructorTask();
      await globalDisconnectDevice();
      stopScanning();
      setScanning(false);
      setMatchedDevice(null);
      setDevices([]);
    } catch (error) {
      console.error("Error during disconnect:", error);
    }
  };

  const loadUserData = useCallback(async () => {
    try {
      const userData = await AsyncStorage.getItem("user");
      if (!userData) {
        setLoading(false);
        return;
      }

      const parsedUser = JSON.parse(userData);
      setUserRole(parsedUser.role);
      bleUtils.setUserRole(parsedUser.role);

      const params = new URLSearchParams({
        schedule_id: schedule.schedule_id.toString(),
      });
      const response = await fetch(
        `${API_URL}/attendance-sessions/active?${params.toString()}`,
        {
          method: "GET",
          headers: { Accept: "application/json" },
        }
      );

      if (response.ok) {
        const data = await response.json();
        if (data.session && data.session !== null) {
          const sessionId = data.session.attendance_session_id;
          if (sessionId) {
            setSessionStatus("active");
            setActiveSessionId(sessionId);

            if (parsedUser.role === "student") {
              await checkExistingAttendanceAndStartBackground(
                parsedUser.id,
                sessionId,
                schedule
              );
            }

            if (
              parsedUser.role === "instructor" &&
              isConnected &&
              currentScheduleId === schedule.schedule_id
            ) {
              try {
                await startInstructorTask(schedule.subject_code);
              } catch (error) {
                console.error(
                  "Failed to start instructor background task:",
                  error
                );
              }
            }
          } else {
            setSessionStatus("inactive");
            setActiveSessionId(null);
          }
        } else {
          setSessionStatus("inactive");
          setActiveSessionId(null);
        }
      } else {
        setSessionStatus("unknown");
      }
    } catch (error) {
      console.error("Error loading user data:", error);
      setSessionStatus("unknown");
    } finally {
      if (isMountedRef.current) setLoading(false);
    }
  }, [schedule.schedule_id, isConnected, currentScheduleId]);

  const checkExistingAttendanceAndStartBackground = async (
    studentId: number,
    sessionId: number,
    currentSchedule: Schedule
  ) => {
    try {
      const attendanceCheck = await fetch(
        `${API_URL}/attendance/check?student_id=${studentId}&session_id=${sessionId}`
      );
      if (attendanceCheck.ok) {
        const attendanceResult = await attendanceCheck.json();
        if (attendanceResult.hasAttendance) {
          setAutoAttendanceMarked(true);
          const currentTask = await getCurrentStudentTask();
          const isRunning = await isStudentTaskRunning();

          if (
            currentTask &&
            currentTask.scheduleId === currentSchedule.schedule_id
          ) {
            setStudentBackgroundTaskRunning(true);
          } else if (!isRunning) {
            await startStudentScanningTask(
              currentSchedule.subject_code,
              currentSchedule.schedule_id,
              studentId
            );
            setStudentBackgroundTaskRunning(true);
          } else {
            setStudentBackgroundTaskRunning(true);
          }
        } else {
          setAutoAttendanceMarked(false);
        }
      } else {
        setAutoAttendanceMarked(false);
      }
    } catch (error) {
      console.error("Error checking attendance:", error);
      setAutoAttendanceMarked(false);
    }
  };

  const onDeviceConnected = useCallback(
    async (device: Device) => {
      if (userRole !== "instructor" || !isScheduleTime) return;

      try {
        await bleUtils.writeToCharacteristic(
          device.id,
          "4fafc201-1fb5-459e-8fcc-c5c9c331914b",
          "beb5483e-36e1-4688-b7f5-ea07361b26a8",
          schedule.subject_code
        );

        await globalConnectDevice(device, schedule.schedule_id);

        const userData = await AsyncStorage.getItem("user");
        if (!userData) throw new Error("No user data found");

        const parsedUser = JSON.parse(userData);
        const response = await fetch(`${API_URL}/attendance-sessions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({
            schedule_id: schedule.schedule_id,
            user_id: parsedUser.id,
            status: "ongoing",
          }),
        });

        const result = await response.json();

        if (!response.ok) {
          if (response.status === 409 && result.duplicate) {
            const sessionId =
              result.session_id || result.data?.attendance_session_id;
            setSessionStatus("active");
            setActiveSessionId(sessionId);
            showAlert(
              "Success",
              "Attendance session continued!",
              "session-continued"
            );
          } else {
            throw new Error(
              result.message || "Failed to create attendance session"
            );
          }
        } else {
          const sessionId =
            result.data?.id ||
            result.data?.attendance_session_id ||
            result.session_id;
          await startInstructorTask(schedule.subject_code);
          setSessionStatus("active");
          setActiveSessionId(sessionId);

          if (result.duplicate) {
            showAlert(
              "Success",
              "Attendance session continued!",
              "session-continued"
            );
          } else {
            showAlert(
              "Success",
              "Attendance session started successfully!",
              "session-start"
            );
          }
        }
      } catch (error) {
        console.error("Error in onDeviceConnected:", error);
        showAlert(
          "Error",
          "Failed to start attendance session",
          "session-error"
        );
      }
    },
    [userRole, schedule, globalConnectDevice, isScheduleTime, showAlert]
  );

  const onDeviceDisconnected = useCallback(() => {
    if (userRole === "instructor") {
      globalDisconnectDevice();
      setSessionStatus("inactive");
      stopInstructorTask();
    }
  }, [userRole, globalDisconnectDevice]);

  const completeSession = async (sessionId: number) => {
    try {
      const response = await fetch(`${API_URL}/attendance-sessions/complete`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ session_id: sessionId }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to complete session");
      }

      const result = await response.json();
      showAlert(
        "Success",
        "Attendance session completed successfully!",
        "session-completed"
      );
      setSessionStatus("inactive");
      setActiveSessionId(null);
      return result;
    } catch (error) {
      console.error("Error completing session:", error);
      showAlert("Error", "Failed to complete session", "session-error");
      throw error;
    }
  };

  const cancelSession = async (sessionId: number) => {
    try {
      const response = await fetch(`${API_URL}/attendance-sessions/cancel`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ session_id: sessionId }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to cancel session");
      }

      const result = await response.json();
      showAlert(
        "Success",
        "Attendance session canceled successfully!",
        "session-canceled"
      );
      setSessionStatus("inactive");
      setActiveSessionId(null);
      return result;
    } catch (error) {
      console.error("Error canceling session:", error);
      showAlert("Error", "Failed to cancel session", "session-error");
      throw error;
    }
  };

  const checkSessionTimeAndStopScanning = useCallback(async () => {
    if (userRole !== "student" || !activeSessionId || !schedule.schedule_id)
      return;

    try {
      const response = await fetch(
        `${API_URL}/attendance-sessions/active?schedule_id=${schedule.schedule_id}`,
        { method: "GET", headers: { Accept: "application/json" } }
      );

      if (response.ok) {
        const sessionData = await response.json();
        if (sessionData.time_expired) {
          if (studentBackgroundTaskRunning) {
            await stopStudentScanningTask();
            setStudentBackgroundTaskRunning(false);
          }

          stopScanning();
          setScanning(false);
          setScanCooldown(false);
          setSessionStatus("inactive");

          showAlert(
            "Session Ended",
            "The attendance session time has passed. Scanning has been stopped.",
            "session-time-expired"
          );
        }
      }
    } catch (error) {
      console.error("Error checking session time:", error);
    }
  }, [
    userRole,
    activeSessionId,
    schedule.schedule_id,
    studentBackgroundTaskRunning,
    stopScanning,
    showAlert,
  ]);

  // Effects
  useEffect(() => {
    let isSubscribed = true;

    const initializeScreen = async () => {
      try {
        await loadUserData();
        if (isSubscribed) {
          checkScheduleTime();
          scheduleCheckRef.current = setInterval(
            checkScheduleTime,
            SCHEDULE_CHECK_INTERVAL
          );
        }
      } catch (error) {
        console.error("Error initializing screen:", error);
        if (isSubscribed && isMountedRef.current) setLoading(false);
      }
    };

    initializeScreen();

    const subscription = AppState.addEventListener("change", (nextAppState) => {
      if (nextAppState === "active" && isSubscribed) {
        loadUserData();
        checkScheduleTime();
      }
    });

    return () => {
      isSubscribed = false;
      isMountedRef.current = false;
      bleUtils.stopDeviceScan();

      if (scanCooldownRef.current) clearInterval(scanCooldownRef.current);
      if (rescanTimerRef.current) clearTimeout(rescanTimerRef.current);
      if (scheduleCheckRef.current) clearInterval(scheduleCheckRef.current);

      subscription.remove();
    };
  }, []);

  // Fix: Fetch students when instructor tab is active, regardless of session status
  useEffect(() => {
    if (userRole === "instructor" && activeInstructorTab === "students") {
      fetchStudentsForSchedule();
    }
  }, [activeInstructorTab, userRole, fetchStudentsForSchedule]);

  useEffect(() => {
    const callbacks = {
      onDeviceFound: (device: Device) => {
        setDevices((prev) => {
          const idx = prev.findIndex((d) => d.id === device.id);
          if (idx >= 0) {
            const copy = [...prev];
            copy[idx] = { ...device, rssi: device.rssi } as Device;
            return copy;
          }
          return [...prev, device];
        });

        if (studentBackgroundTaskRunning) return;

        if (
          userRole === "student" &&
          sessionStatus === "active" &&
          isScheduleTime &&
          device.manufacturerData
        ) {
          const manufacturer = bleUtils.decodeManufacturerData(
            device.manufacturerData
          );
          if (manufacturer) {
            const normalizedManufacturer = normalizedSubjectCode(manufacturer);
            const normalizedStudentSubject = normalizedSubjectCode(
              schedule.subject_code
            );

            if (normalizedManufacturer === normalizedStudentSubject) {
              const deviceKey = `${device.id}-${Date.now()}`;
              if (!processedDevicesRef.current.has(deviceKey)) {
                processedDevicesRef.current.add(deviceKey);
                setTimeout(
                  () => processedDevicesRef.current.delete(deviceKey),
                  5000
                );

                setMatchedDevice(device);

                if (!autoAttendanceMarked) {
                  handleBLEDetection(
                    device.manufacturerData,
                    device.id,
                    device.rssi || null
                  );
                } else {
                  recordBLEDetection(device.rssi || null);
                }
              }
            }
          }
        }

        if (
          userRole === "instructor" &&
          isScheduleTime &&
          !isConnected &&
          sessionStatus !== "active"
        ) {
          const manufacturer = bleUtils.decodeManufacturerData(
            device.manufacturerData
          );
          if (manufacturer) {
            const normalizedManufacturer = normalizedSubjectCode(manufacturer);
            const normalizedRoom = normalizedSubjectCode(schedule.room);
            if (normalizedManufacturer === normalizedRoom) {
              setMatchedDevice(device);
              connectToDevice(device);
            }
          }
        }
      },
      onDeviceConnected,
      onDeviceDisconnected,
      onError: (error: any) => console.error("BLE Error:", error),
      onScanStarted: () => setScanning(true),
      onScanStopped: () => setScanning(false),
    };

    bleUtils.setCallbacks(callbacks);
    return () => bleUtils.setCallbacks({});
  }, [
    userRole,
    sessionStatus,
    schedule,
    handleBLEDetection,
    recordBLEDetection,
    normalizedSubjectCode,
    isScheduleTime,
    autoAttendanceMarked,
    studentBackgroundTaskRunning,
    isConnected,
    connectToDevice,
    onDeviceConnected,
    onDeviceDisconnected,
  ]);

  useEffect(() => {
    if (isConnected && connectedDevice && userRole === "instructor") {
      setSessionStatus("active");
    } else if (
      !isConnected &&
      userRole === "instructor" &&
      sessionStatus === "active"
    ) {
      setSessionStatus("inactive");
    }
  }, [
    isConnected,
    connectedDevice,
    userRole,
    sessionStatus,
    schedule.subject_code,
  ]);

  useEffect(() => {
    if (
      userRole === "student" &&
      sessionStatus === "active" &&
      isScheduleTime
    ) {
      const sessionTimeCheckInterval = setInterval(() => {
        checkSessionTimeAndStopScanning();
      }, 60000);

      return () => clearInterval(sessionTimeCheckInterval);
    }
  }, [
    userRole,
    sessionStatus,
    isScheduleTime,
    checkSessionTimeAndStopScanning,
  ]);

  useEffect(() => {
    const checkBluetoothState = async () => {
      try {
        const state = await bleManager.state();
        setIsBluetoothOn(state === State.PoweredOn);
      } catch (error) {
        console.error("Error checking Bluetooth state:", error);
        setIsBluetoothOn(false);
      }
    };

    checkBluetoothState();

    const subscription = bleManager.onStateChange((state) => {
      setIsBluetoothOn(state === State.PoweredOn);
    }, true);

    return () => subscription.remove();
  }, []);

  const DeviceListItem = useMemo(
    () =>
      ({ item }: { item: Device }) => {
        if (userRole === "student" || !isScheduleTime) return null;

        const manufacturer = bleUtils.decodeManufacturerData(
          item.manufacturerData as string
        );
        const normalizedManufacturer = normalizedSubjectCode(
          manufacturer || ""
        );
        const normalizedRoom = normalizedSubjectCode(schedule.room);
        const isMatch = normalizedManufacturer === normalizedRoom;

        return (
          <View
            className={`p-5 rounded-2xl shadow-sm mb-3 mx-4 ${
              isMatch
                ? "bg-green-50 border border-green-200"
                : "bg-white border border-gray-100"
            } ${!isScheduleTime ? "opacity-60" : ""}`}
          >
            <View className="flex-row items-center">
              <View
                className={`p-2 rounded-full mr-3 ${isMatch ? "bg-green-100" : "bg-blue-100"}`}
              >
                <Ionicons
                  name="bluetooth"
                  size={20}
                  color={isMatch ? "#10b981" : "#3b82f6"}
                />
              </View>
              <View className="flex-1">
                <Text className="font-semibold text-gray-800 text-base">
                  {item.name || "Unknown Device"}
                </Text>
                <Text className="text-xs text-gray-500 mt-1">
                  ID: {item.id}
                </Text>
                {typeof item.rssi !== "undefined" && (
                  <Text className="text-xs text-gray-500 mt-1">
                    RSSI: {item.rssi} dBm
                  </Text>
                )}
              </View>
              {isMatch && (
                <View className="bg-green-100 rounded-full p-1">
                  <Ionicons name="checkmark-circle" size={20} color="#10b981" />
                </View>
              )}
            </View>
            {manufacturer && (
              <View className="mt-3 bg-gray-50 p-2 rounded-lg">
                <Text
                  className={`text-xs ${isMatch ? "text-green-600 font-medium" : "text-blue-500"}`}
                >
                  Manufacturer: {manufacturer}
                  {isMatch && ` (Room Match)`}
                </Text>
              </View>
            )}
          </View>
        );
      },
    [isScheduleTime, userRole, schedule, normalizedSubjectCode]
  );

  // Render different content based on active tab
  if (userRole === "instructor" && activeInstructorTab === "students") {
    // Full screen student list with back tab
    return (
      <View className="flex-1 bg-gray-50">
        {/* Top Tabs */}
        <View className="bg-white p-4 shadow-sm">
          <View className="flex-row justify-between bg-gray-200 rounded-full p-2">
            <TouchableOpacity
              className="flex-1 py-2 rounded-full bg-gray-200" // Always inactive in this view
              onPress={() => setActiveInstructorTab("ble")}
            >
              <Text className="text-center font-semibold text-gray-500">
                BLE Controls
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              className="flex-1 py-2 rounded-full bg-white" // Always active in this view
            >
              <Text className="text-center font-semibold text-gray-700">
                Students
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Student List */}
        <InstructorStudentListView
          students={students}
          loading={loadingStudents}
          sessionStatus={sessionStatus}
          onRefresh={fetchStudentsForSchedule}
          refreshing={loadingStudents}
        />
      </View>
    );
  }

  // Default view with schedule details and BLE controls
  return (
    <View className="flex-1 bg-gray-50">
      {/* Top Tabs - Only show for instructors */}
      {userRole === "instructor" && (
        <View className="bg-white p-4 shadow-sm">
          <View className="flex-row justify-between bg-gray-200 rounded-full p-2">
            <TouchableOpacity
              className={`flex-1 py-2 rounded-full ${activeInstructorTab === "ble" ? "bg-white" : "bg-gray-200"}`}
              onPress={() => setActiveInstructorTab("ble")}
            >
              <Text
                className={`text-center font-semibold ${activeInstructorTab === "ble" ? "text-gray-700" : "text-gray-500"}`}
              >
                BLE Controls
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              className={`flex-1 py-2 rounded-full ${activeInstructorTab === "students" ? "bg-white" : "bg-gray-200"}`}
              onPress={() => setActiveInstructorTab("students")}
            >
              <Text
                className={`text-center font-semibold ${activeInstructorTab === "students" ? "text-gray-700" : "text-gray-500"}`}
              >
                Students
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      <FlatList
        data={
          isScheduleTime && isBluetoothOn && !isConnected && !scanCooldown
            ? devices
            : []
        }
        keyExtractor={(item) => item.id}
        renderItem={DeviceListItem}
        ListHeaderComponent={
          <>
            {/* Schedule Details Container */}
            <View className="bg-white p-6 rounded-b-3xl shadow-sm mb-4">
              <View className="flex-row items-start justify-between mb-3">
                <View className="flex-1">
                  <Text className="text-lg text-gray-700 mb-2">
                    {schedule.subject_description}
                  </Text>
                  {userRole === "student" && schedule.instructor_name && (
                    <Text className="text-gray-700 font-medium">
                      Instructor: {schedule.instructor_name}
                    </Text>
                  )}
                </View>
                <View className="bg-blue-100 p-2 rounded-full">
                  <FontAwesome5
                    name="chalkboard-teacher"
                    size={20}
                    color="#3b82f6"
                  />
                </View>
              </View>

              <View className="flex-row items-center mb-2">
                <Ionicons name="time-outline" size={16} color="#6b7280" />
                <Text className="text-sm text-gray-600 ml-2">
                  {schedule.days} • {formatTimeAMPM(schedule.start_time)} -{" "}
                  {formatTimeAMPM(schedule.end_time)}
                </Text>
              </View>

              <View className="flex-row items-center">
                <Ionicons name="location-outline" size={16} color="#6b7280" />
                <Text className="text-sm font-semibold text-blue-600 ml-2">
                  Room: {schedule.room}
                </Text>
              </View>

              <View className="flex-row items-center">
                <Ionicons
                  name={
                    schedule.schedule_type === "lecture"
                      ? "school-outline"
                      : schedule.schedule_type === "laboratory"
                        ? "flask-outline"
                        : "calendar-outline"
                  }
                  size={16}
                  color="#6b7280"
                />
                <Text className="text-gray-600 capitalize mb-1 ml-2">
                  {schedule.schedule_type}
                </Text>
              </View>

              {!isScheduleTime ? (
                <View className="mt-4 p-3 rounded-xl bg-yellow-50 border border-yellow-200 flex-row items-center">
                  <View className="bg-yellow-100 p-2 rounded-full mr-3">
                    <Ionicons name="time-outline" size={20} color="#d97706" />
                  </View>
                  <View>
                    <Text className="text-yellow-800 font-medium">
                      Class not in session
                    </Text>
                    <Text className="text-yellow-700 text-sm mt-1">
                      BLE features available {timeUntilSchedule}
                    </Text>
                  </View>
                </View>
              ) : (
                <>
                  <View className="mt-4 p-3 rounded-xl bg-green-50 border border-green-200 flex-row items-center">
                    <View className="bg-green-100 p-2 rounded-full mr-3">
                      <Ionicons
                        name="checkmark-circle"
                        size={20}
                        color="#059669"
                      />
                    </View>
                    <Text className="text-green-800 font-medium">
                      Class in session - BLE features available
                    </Text>
                  </View>

                  {sessionStatus === "active" && (
                    <View className="mt-4 p-3 rounded-xl bg-green-50 border border-green-200 flex-row items-center">
                      <View className="bg-green-100 p-2 rounded-full mr-3">
                        <Ionicons
                          name="checkmark-circle"
                          size={20}
                          color="#059669"
                        />
                      </View>
                      <View>
                        <Text className="text-green-800 font-medium">
                          Active Attendance Session
                        </Text>
                        {userRole === "student" && autoAttendanceMarked && (
                          <Text className="text-green-600 text-sm mt-1">
                            ✅ Attendance automatically recorded via BLE
                          </Text>
                        )}
                      </View>
                    </View>
                  )}

                  {sessionStatus === "inactive" && userRole === "student" && (
                    <View className="mt-4 p-3 rounded-xl bg-yellow-50 border border-yellow-200 flex-row items-center">
                      <View className="bg-yellow-100 p-2 rounded-full mr-3">
                        <Ionicons name="warning" size={20} color="#d97706" />
                      </View>
                      <Text className="text-yellow-800">
                        No active attendance session for this subject
                      </Text>
                    </View>
                  )}

                  {sessionStatus === "inactive" &&
                    userRole === "instructor" &&
                    !isConnected && (
                      <View className="mt-4 p-3 rounded-xl bg-yellow-50 border border-yellow-200 flex-row items-center">
                        <View className="bg-yellow-100 p-2 rounded-full mr-3">
                          <Ionicons name="warning" size={20} color="#d97706" />
                        </View>
                        <Text className="text-yellow-800">
                          Connect to room device to start attendance session
                        </Text>
                      </View>
                    )}
                </>
              )}
            </View>

            {/* Instructor BLE View */}
            {isScheduleTime && userRole === "instructor" && (
              <InstructorView
                isConnected={isConnected}
                connectedDevice={connectedDevice}
                sessionStatus={sessionStatus}
                scanning={scanning}
                handleDisconnect={handleDisconnect}
                onStartScan={startScanning}
                isScheduleTime={isScheduleTime}
                timeUntilSchedule={timeUntilSchedule}
                isBluetoothOn={isBluetoothOn}
                activeSessionId={activeSessionId}
                onCompleteSession={completeSession}
                onCancelSession={cancelSession}
              />
            )}

            {/* Student View */}
            {isScheduleTime && userRole === "student" && (
              <StudentView
                sessionStatus={sessionStatus}
                scanning={scanning}
                scanCooldown={scanCooldown}
                cooldownTimer={cooldownTimer}
                handleManualRescan={handleManualRescan}
                onStartScan={startScanning}
                isScheduleTime={isScheduleTime}
                timeUntilSchedule={timeUntilSchedule}
                studentBackgroundTaskRunning={studentBackgroundTaskRunning}
                autoAttendanceMarked={autoAttendanceMarked}
                isBluetoothOn={isBluetoothOn}
              />
            )}

            {/* Schedule Time Unavailable View */}
            {!isScheduleTime && (
              <View className="bg-white p-6 rounded-2xl shadow-sm mb-4 mx-4">
                <View className="items-center py-6">
                  <Ionicons name="time-outline" size={48} color="#d1d5db" />
                  <Text className="text-gray-600 text-center mt-4 text-lg font-semibold">
                    BLE Features Unavailable
                  </Text>
                  <Text className="text-gray-500 text-center mt-2">
                    Bluetooth attendance features are only available during
                    class hours
                  </Text>
                  <Text className="text-blue-600 text-center mt-2 font-medium">
                    Available {timeUntilSchedule}
                  </Text>
                </View>
              </View>
            )}
          </>
        }
        ListEmptyComponent={
          isScheduleTime && isBluetoothOn && !isConnected && !scanCooldown ? (
            <View className="py-8">
              <View className="items-center">
                <Ionicons name="bluetooth" size={48} color="#d1d5db" />
                <Text className="text-gray-500 text-center mt-4">
                  No devices found
                </Text>
                <Text className="text-gray-400 text-center mt-2">
                  Start scanning to discover nearby BLE devices
                </Text>
              </View>
            </View>
          ) : null
        }
        refreshControl={
          <RefreshControl
            refreshing={false}
            onRefresh={() => {}}
            colors={["#3b82f6"]}
            tintColor="#3b82f6"
          />
        }
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}
