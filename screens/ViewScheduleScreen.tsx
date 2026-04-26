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
  PermissionsAndroid,
  Platform,
  Image,
  Alert,
  Linking,
} from "react-native";
import { Device, State } from "react-native-ble-plx";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation, NavigationProp } from "@react-navigation/native";
import { API_URL } from "../api/apiConfig";
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
import ViewScheduleSkeleton from "../components/skeleton/ViewScheduleSkeleton";

const defaultProfile = require("../assets/noProfile.webp");

// --- Types ---

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
  instructor?: {
    user_id: string;
    firstname: string;
    lastname: string;
    formatted_name: string;
    image_link: string | null;
  };
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
  program?: string;
  year?: string;
  block?: string;
}

type RootStackParamList = {
  FaceVerify: {
    schedule: Schedule;
    onVerificationSuccess: (verificationResult: boolean) => Promise<void>;
  };
};

// --- Helper Functions ---

const dayMap: Record<string, number> = {
  M: 1,
  T: 2,
  W: 3,
  Th: 4,
  F: 5,
  S: 6,
  Su: 0,
};

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

const parseTimeToMinutes = (timeStr: string) => {
  const [hours, minutes] = timeStr.split(":").map(Number);
  return hours * 60 + minutes;
};

const isScheduleActiveNow = (schedule: Schedule): boolean => {
  const now = new Date();
  const currentDay = now.getDay();
  const currentTimeMinutes = now.getHours() * 60 + now.getMinutes();
  const scheduleCodes = parseDayCodes(schedule.days || "");

  if (!scheduleCodes.some((code) => dayMap[code] === currentDay)) return false;

  const start = parseTimeToMinutes(schedule.start_time);
  const end = parseTimeToMinutes(schedule.end_time);

  return end < start
    ? currentTimeMinutes >= start || currentTimeMinutes <= end
    : currentTimeMinutes >= start && currentTimeMinutes <= end;
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
  const [h, m] = timeStr.split(":");
  let hours = parseInt(h, 10);
  const ampm = hours >= 12 ? "PM" : "AM";
  hours = hours % 12 || 12;
  return `${hours}:${m || "00"} ${ampm}`;
};

const normalizedSubjectCode = (code: string): string =>
  (code || "").replace(/[\s-]/g, "").trim().toLowerCase();

// --- Memoized Child Component ---

const DeviceListItem = React.memo(
  ({
    item,
    schedule,
    userRole,
    isScheduleTime,
    isConnected,
    connectedDeviceId,
  }: {
    item: Device;
    schedule: Schedule;
    userRole: string | null;
    isScheduleTime: boolean;
    isConnected: boolean;
    connectedDeviceId: string | undefined;
  }) => {
    if (userRole === "student" || !isScheduleTime) return null;

    const manufacturer = bleUtils.decodeManufacturerData(
      item.manufacturerData as string
    );
    const normManufacturer = normalizedSubjectCode(manufacturer || "");
    const normRoom = normalizedSubjectCode(schedule.room);
    const isMatch = normManufacturer === normRoom;
    const isCurrentlyConnected = isConnected && connectedDeviceId === item.id;

    return (
      <View
        className={`p-5 rounded-2xl shadow-sm mb-3 mx-4 ${
          isCurrentlyConnected
            ? "bg-blue-50 border-2 border-blue-300"
            : isMatch
            ? "bg-green-50 border border-green-200"
            : "bg-white border border-gray-100"
        } ${!isScheduleTime ? "opacity-60" : ""}`}
      >
        <View className="flex-row items-center">
          <View
            className={`p-2 rounded-full mr-3 ${
              isCurrentlyConnected
                ? "bg-blue-100"
                : isMatch
                ? "bg-green-100"
                : "bg-gray-100"
            }`}
          >
            <Ionicons
              name="bluetooth"
              size={20}
              color={
                isCurrentlyConnected
                  ? "#3b82f6"
                  : isMatch
                  ? "#10b981"
                  : "#6b7280"
              }
            />
          </View>

          <View className="flex-1">
            <Text className="font-semibold text-gray-800 text-base">
              {item.name || "Unknown Device"}
              {isCurrentlyConnected && (
                <Text className="text-blue-600 text-sm ml-2"> • Connected</Text>
              )}
            </Text>

            <Text className="text-xs text-gray-500 mt-1">
              ID: {item.id.substring(0, 8)}...
            </Text>

            {typeof item.rssi !== "undefined" && (
              <Text className="text-xs text-gray-500 mt-1">
                RSSI: {item.rssi} dBm
              </Text>
            )}
          </View>

          <View className="flex-row items-center">
            {isCurrentlyConnected && (
              <View className="bg-blue-100 rounded-full p-1 mr-2">
                <Ionicons name="link" size={16} color="#3b82f6" />
              </View>
            )}
            {isMatch && !isCurrentlyConnected && (
              <View className="bg-green-100 rounded-full p-1">
                <Ionicons name="checkmark-circle" size={20} color="#10b981" />
              </View>
            )}
          </View>
        </View>

        {manufacturer && (
          <View className="mt-3 bg-gray-50 p-2 rounded-lg">
            <Text
              className={`text-xs ${
                isCurrentlyConnected
                  ? "text-blue-600 font-medium"
                  : isMatch
                  ? "text-green-600 font-medium"
                  : "text-blue-500"
              }`}
            >
              Manufacturer: {manufacturer}
              {isMatch && ` (Room Match)`}
              {isCurrentlyConnected && ` (Connected)`}
            </Text>
          </View>
        )}
      </View>
    );
  },
  (prev, next) => {
    return (
      prev.item.id === next.item.id &&
      prev.item.rssi === next.item.rssi &&
      prev.isConnected === next.isConnected &&
      prev.connectedDeviceId === next.connectedDeviceId
    );
  }
);

// --- Custom Hook for Schedule Logic ---

const useScheduleLogic = (schedule: Schedule) => {
  const [isScheduleTime, setIsScheduleTime] = useState(false);
  const [timeUntilSchedule, setTimeUntilSchedule] = useState("");

  const checkTime = useCallback(() => {
    const isActive = isScheduleActiveNow(schedule);
    setIsScheduleTime(isActive);
    setTimeUntilSchedule(getTimeUntilSchedule(schedule));
    return isActive;
  }, [schedule]);

  useEffect(() => {
    checkTime();
    const interval = setInterval(checkTime, 60000);
    return () => clearInterval(interval);
  }, [checkTime]);

  return { isScheduleTime, timeUntilSchedule, checkTime };
};

// --- Main Component ---

export default function ViewScheduleScreen({ route }: any) {
  const { schedule: initialSchedule }: { schedule: Schedule } = route.params;
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const { showAlert } = useAlertHandler();

  const [schedule, setSchedule] = useState<Schedule>(initialSchedule);

  // Contexts
  const {
    isConnected,
    connectedDevice,
    connectDevice: globalConnect,
    disconnectDevice: globalDisconnect,
    currentScheduleId,
  } = useBLEConnection();

  // Hook Data
  const { isScheduleTime, timeUntilSchedule, checkTime } =
    useScheduleLogic(schedule);

  // States
  const [userRole, setUserRole] = useState<"instructor" | "student" | null>(
    null
  );
  const [sessionStatus, setSessionStatus] = useState<
    "active" | "inactive" | "unknown"
  >("unknown");
  const [activeSessionId, setActiveSessionId] = useState<number | null>(null);
  const [isBluetoothOn, setIsBluetoothOn] = useState(true);

  // UI States
  const [loading, setLoading] = useState(true);
  const [initialLoading, setInitialLoading] = useState(true);
  const [isCreatingSession, setIsCreatingSession] = useState(false);
  const [isMarkingAttendance, setIsMarkingAttendance] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // BLE & List States
  const [devices, setDevices] = useState<Device[]>([]);
  const [scanning, setScanning] = useState(false);

  // Instructor Specific
  const [activeInstructorTab, setActiveInstructorTab] = useState<
    "ble" | "students"
  >("ble");
  const [students, setStudents] = useState<Student[]>([]);
  const [loadingStudents, setLoadingStudents] = useState(false);

  // Student Specific
  const [scanCooldown, setScanCooldown] = useState(false);
  const [cooldownTimer, setCooldownTimer] = useState(0);
  const [autoAttendanceMarked, setAutoAttendanceMarked] = useState(false);
  const [matchedDevice, setMatchedDevice] = useState<Device | null>(null);
  const [studentBackgroundTaskRunning, setStudentBackgroundTaskRunning] =
    useState(false);

  // Refs
  const isMountedRef = useRef(true);
  const processedDevicesRef = useRef<Set<string>>(new Set());
  const autoAttendanceMarkedRef = useRef(autoAttendanceMarked);
  const scanCooldownRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rescanTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    autoAttendanceMarkedRef.current = autoAttendanceMarked;
  }, [autoAttendanceMarked]);

  // --- API Functions ---

  const fetchScheduleDetails = useCallback(async () => {
    if (!initialSchedule.schedule_id) return;

    if (userRole === "instructor") setLoadingStudents(true);

    try {
      const response = await fetch(
        `${API_URL}/schedules/${initialSchedule.schedule_id}/students`
      );
      const data = await response.json();

      if (response.ok && data.success) {
        setStudents(data.data.students || []);
        if (data.data.instructor) {
          setSchedule((prev) => ({
            ...prev,
            instructor: data.data.instructor,
          }));
        }
      }
    } catch (error) {
      console.error("Error fetching schedule details:", error);
    } finally {
      if (isMountedRef.current) setLoadingStudents(false);
    }
  }, [initialSchedule.schedule_id, userRole]);

  useEffect(() => {
    fetchScheduleDetails();
  }, [fetchScheduleDetails]);

  // --- Permission Helper ---

  const requestBLEPermissions = useCallback(async () => {
    if (Platform.OS === "android") {
      if (Platform.Version >= 31) {
        const result = await PermissionsAndroid.requestMultiple([
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
          PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
        ]);

        const scanGranted =
          result[PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN] ===
          PermissionsAndroid.RESULTS.GRANTED;
        const connectGranted =
          result[PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT] ===
          PermissionsAndroid.RESULTS.GRANTED;

        return scanGranted && connectGranted;
      } else {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
        );
        return granted === PermissionsAndroid.RESULTS.GRANTED;
      }
    }
    return true;
  }, []);

  const checkExistingAttendanceAndStartBackground = async (
    studentId: number,
    sessionId: number,
    currentSchedule: Schedule
  ) => {
    try {
      const response = await fetch(
        `${API_URL}/attendance/check?student_id=${studentId}&session_id=${sessionId}`
      );

      if (response.ok) {
        const result = await response.json();

        if (result.hasAttendance) {
          setAutoAttendanceMarked(true);

          // ✅ NEW: Check if the student's excuse was approved
          const isExcused = result.attendance?.status?.toLowerCase() === "excused";
          
          const currentTask = await getCurrentStudentTask();
          const isRunning = await isStudentTaskRunning();

          // ✅ NEW: If excused, actively stop and prevent any BLE scanning
          if (isExcused) {
            if (isRunning) {
              await stopStudentScanningTask();
            }
            setStudentBackgroundTaskRunning(false);
            stopScanning(); // Ensure foreground scan is also stopped
            console.log("Student is excused. BLE scanning completely disabled.");
            return; // Exit early, do not ask for permissions or start task
          }

          // Existing logic for Present/Late students
          if (
            (currentTask &&
              currentTask.scheduleId === currentSchedule.schedule_id) ||
            !isRunning
          ) {
            const hasPermissions = await requestBLEPermissions();
            if (hasPermissions) {
              await startStudentScanningTask(
                currentSchedule.subject_code,
                currentSchedule.schedule_id,
                studentId
              );
              setStudentBackgroundTaskRunning(true);
            } else {
              console.warn(
                "Permissions denied, cannot start student background task"
              );
            }
          } else {
            setStudentBackgroundTaskRunning(true);
          }
        } else {
          setAutoAttendanceMarked(false);
        }
      }
    } catch (error) {
      console.error("Error checking existing attendance:", error);
    }
  };

  const loadUserData = useCallback(async () => {
    try {
      if (!refreshing) setInitialLoading(true);

      const hasPermissions = await requestBLEPermissions();

      const userData = await AsyncStorage.getItem("user");

      if (!userData) {
        setLoading(false);
        setInitialLoading(false);
        return;
      }

      const parsedUser = JSON.parse(userData);
      setUserRole(parsedUser.role);
      bleUtils.setUserRole(parsedUser.role);

      const params = new URLSearchParams({
        schedule_id: schedule.schedule_id.toString(),
      });

      const response = await fetch(
        `${API_URL}/attendance-sessions/active?${params}`,
        { headers: { Accept: "application/json" } }
      );

      if (response.ok) {
        const data = await response.json();

        if (data.session?.attendance_session_id) {
          const sid = data.session.attendance_session_id;
          setSessionStatus("active");
          setActiveSessionId(sid);

          if (parsedUser.role === "student") {
            await checkExistingAttendanceAndStartBackground(
              parsedUser.id,
              sid,
              schedule
            );
          }

          if (
            parsedUser.role === "instructor" &&
            isConnected &&
            currentScheduleId === schedule.schedule_id
          ) {
            if (hasPermissions) {
              await startInstructorTask(
                schedule.subject_code,
                schedule.schedule_id
              );
            } else {
              console.warn("Permissions denied, cannot resume instructor task");
            }
          }
        } else {
          setSessionStatus("inactive");
          setActiveSessionId(null);
        }
      }
    } catch (error) {
      console.error("Error loading user data:", error);
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
        setInitialLoading(false);
      }
    }
  }, [
    schedule.schedule_id,
    isConnected,
    currentScheduleId,
    requestBLEPermissions,
    refreshing,
  ]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([loadUserData(), fetchScheduleDetails()]);
      checkTime();
    } catch (error) {
      console.error("Refresh failed:", error);
    } finally {
      setRefreshing(false);
    }
  }, [loadUserData, fetchScheduleDetails, checkTime]);


  const startScanning = useCallback(async () => {
    const hasPermissions = await requestBLEPermissions();
    if (!hasPermissions) {
      showAlert(
        "Permission Required",
        "Bluetooth Connect & Scan permissions are required.",
        "bluetooth-off"
      );
      return;
    }

    if (studentBackgroundTaskRunning) {
      showAlert(
        "Info",
        "Auto scanning is active.",
        "background-scanning-active"
      );
      return;
    }

    if (!isBluetoothOn) {
      showAlert("Bluetooth Off", "Please enable Bluetooth.", "bluetooth-off");
      return;
    }

    if (!isScheduleTime) {
      showAlert("Info", "Scanning only available during class.", "scan-time");
      return;
    }

    if (scanCooldown) {
      showAlert("Cooldown", `Please wait ${cooldownTimer}s.`, "scan-cooldown");
      return;
    }

    if (userRole === "student") {

      try {
        const res = await fetch(
          `${API_URL}/attendance-sessions/active?schedule_id=${schedule.schedule_id}`
        );
        const data = await res.json();

        if (data.time_expired) {
          showAlert("Session Ended", "Time has passed.", "expired");
          return;
        }

        if (!data.session) {
          showAlert("No Active Session", "No session found.", "no-session");
          return;
        }
      } catch (e) {
        console.error(e);
      }
    }

    setScanning(true);
    setDevices([]);

    try {
      await bleUtils.startDeviceScan({
        filterByManufacturer:
          userRole === "instructor" ? schedule.room : schedule.subject_code,
        timeout: 30000,
        autoConnect: userRole === "instructor",
      });
    } catch (e) {
      setScanning(false);
    }
  }, [
    studentBackgroundTaskRunning,
    isBluetoothOn,
    isScheduleTime,
    scanCooldown,
    cooldownTimer,
    userRole,
    schedule,
    requestBLEPermissions,
  ]);

  const stopScanning = useCallback(() => {
    bleUtils.stopDeviceScan();
    setScanning(false);
  }, []);

  const handleManualRescan = useCallback(() => {
    if (studentBackgroundTaskRunning)
      return showAlert("Info", "Auto scanning active.");

    if (!isScheduleTime) return showAlert("Info", "Class time only.");

    setScanCooldown(false);
    setCooldownTimer(0);
    if (scanCooldownRef.current) clearInterval(scanCooldownRef.current);
    if (rescanTimerRef.current) clearTimeout(rescanTimerRef.current);

    processedDevicesRef.current.clear();
    setAutoAttendanceMarked(false);
    setMatchedDevice(null);
    startScanning();
  }, [studentBackgroundTaskRunning, isScheduleTime, startScanning]);

  const markStudentAttendance = useCallback(
    async (manufacturerData: string, deviceId: string, rssi: number | null) => {
      if (!activeSessionId) return;

      setIsMarkingAttendance(true);
      stopScanning();

      try {
        const user = JSON.parse((await AsyncStorage.getItem("user")) || "{}");
        const decoded = bleUtils.decodeManufacturerData(manufacturerData);

        const response = await fetch(`${API_URL}/attendance/ble-mark`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            student_id: user.id,
            subject_code: schedule.subject_code,
            session_id: activeSessionId,
            ble_manufacturer_data: decoded,
            rssi_value: rssi,
          }),
        });

        const result = await response.json();

        if (response.ok) {
          showAlert("✅ Success", result.message, "attendance-success");
          setAutoAttendanceMarked(true);

          const hasPermissions = await requestBLEPermissions();
          if (hasPermissions) {
            await startStudentScanningTask(
              schedule.subject_code,
              schedule.schedule_id,
              user.id
            );
            setStudentBackgroundTaskRunning(true);
          }
        } else if (response.status !== 409) {
          showAlert("Error", result.message, "attendance-error");
        }
      } catch (e) {
        showAlert("Error", "Failed to mark attendance.");
      } finally {
        setIsMarkingAttendance(false);
      }
    },
    [activeSessionId, schedule, stopScanning, requestBLEPermissions]
  );

  const handleInstructorConnect = async (device: Device) => {
    setIsCreatingSession(true);
    stopScanning();

    try {
      const userData = await AsyncStorage.getItem("user");
      const user = userData ? JSON.parse(userData) : null;

      if (!user || !user.id) {
        throw new Error("User ID not found. Please log in again.");
      }

      await globalConnect(device, schedule.schedule_id);

      await new Promise<void>((resolve) => setTimeout(() => resolve(), 1000));

      await bleUtils.writeToCharacteristic(
        device.id,
        "4fafc201-1fb5-459e-8fcc-c5c9c331914b",
        "beb5483e-36e1-4688-b7f5-ea07361b26a8",
        "presensure"
      );

      await new Promise<void>((resolve) => setTimeout(() => resolve(), 500));

      await bleUtils.writeToCharacteristic(
        device.id,
        "4fafc201-1fb5-459e-8fcc-c5c9c331914b",
        "beb5483e-36e1-4688-b7f5-ea07361b26a8",
        schedule.subject_code
      );

      const res = await fetch(`${API_URL}/attendance-sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          schedule_id: schedule.schedule_id,
          user_id: user.id,
          device_id: device.id,
          status: "ongoing",
        }),
      });

      const data = await res.json();

      if (res.ok || (res.status === 409 && data.duplicate)) {
        const sid =
          data.session_id || data.data?.attendance_session_id || data.data?.id;
        setActiveSessionId(sid);
        setSessionStatus("active");

        const hasPermissions = await requestBLEPermissions();
        if (hasPermissions) {
          await startInstructorTask(
            schedule.subject_code,
            schedule.schedule_id
          );
          showAlert("Success", "Attendance Started", "session-start");
        } else {
          showAlert(
            "Warning",
            "Session started but background task failed (No Permission)"
          );
        }
      } else {
        throw new Error(data.message || "Failed to create session on server");
      }
    } catch (e: any) {
      console.error("Session Start Error:", e);
      globalDisconnect();
      showAlert("Connection Error", e.message || "Failed to start session.");
      startScanning();
    } finally {
      setIsCreatingSession(false);
    }
  };

  const completeSession = async (sessionId: number) => {
    try {
      const res = await fetch(`${API_URL}/attendance-sessions/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId }),
      });

      if (res.ok) {
        showAlert("Success", "Session Completed", "completed");
        setSessionStatus("inactive");
        setActiveSessionId(null);
        await stopInstructorTask();
        globalDisconnect();
      }
    } catch (e) {
      showAlert("Error", "Failed to complete session");
    }
  };

  const cancelSession = async (sessionId: number) => {
    try {
      const res = await fetch(`${API_URL}/attendance-sessions/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId }),
      });

      if (res.ok) {
        showAlert("Success", "Session Canceled", "canceled");
        setSessionStatus("inactive");
        setActiveSessionId(null);
        await stopInstructorTask();
        globalDisconnect();
      }
    } catch (e) {
      showAlert("Error", "Failed to cancel session");
    }
  };

  // --- Effects ---

  useEffect(() => {
    const init = async () => {
      await loadUserData();
      checkTime();
    };

    init();

    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        loadUserData();
        checkTime();
      }
    });

    const bleSub = bleManager.onStateChange((state) => {
      setIsBluetoothOn(state === State.PoweredOn);
    }, true);

    return () => {
      isMountedRef.current = false;
      sub.remove();
      bleSub.remove();
      bleUtils.stopDeviceScan();
      if (scanCooldownRef.current) clearInterval(scanCooldownRef.current);
      if (rescanTimerRef.current) clearTimeout(rescanTimerRef.current);
    };
  }, []);

  useEffect(() => {
    bleUtils.setCallbacks({
      onDeviceFound: (device) => {
        setDevices((prev) => {
          const index = prev.findIndex((d) => d.id === device.id);
          if (index !== -1) {
            const newDevices = [...prev];
            newDevices[index] = device;
            return newDevices;
          }
          return [...prev, device];
        });

        if (processedDevicesRef.current.has(device.id)) return;

        // Student Logic
        if (userRole === "student" && isScheduleTime && activeSessionId) {
          const manu = bleUtils.decodeManufacturerData(
            device.manufacturerData || ""
          );

          if (
            normalizedSubjectCode(manu || "") ===
            normalizedSubjectCode(schedule.subject_code)
          ) {
            processedDevicesRef.current.add(device.id);
            setMatchedDevice(device);

            if (!autoAttendanceMarkedRef.current) {
              stopScanning();
              navigation.navigate("FaceVerify", {
                schedule,
                onVerificationSuccess: async (verified: boolean) => {
                  if (verified)
                    await markStudentAttendance(
                      device.manufacturerData!,
                      device.id,
                      device.rssi!
                    );
                  else {
                    showAlert("Failed", "Verification Failed");
                    startScanning();
                  }
                },
              });
            } else {
              console.log(
                "Device found in foreground, letting background task handle record."
              );
            }
          }
        }

        // Instructor Logic
        if (
          userRole === "instructor" &&
          !isConnected &&
          sessionStatus !== "active"
        ) {
          const manu = bleUtils.decodeManufacturerData(
            device.manufacturerData || ""
          );

          if (
            normalizedSubjectCode(manu || "") ===
            normalizedSubjectCode(schedule.room)
          ) {
            processedDevicesRef.current.add(device.id);
            setMatchedDevice(device);
            handleInstructorConnect(device);
          }
        }
      },
      onScanStopped: () => setScanning(false),
    });

    return () => bleUtils.setCallbacks({});
  }, [
    userRole,
    isScheduleTime,
    activeSessionId,
    isConnected,
    sessionStatus,
    schedule,
  ]);

  // Session Time Check Interval
  useEffect(() => {
    if (!isScheduleTime || !activeSessionId || !schedule.schedule_id) return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(
          `${API_URL}/attendance-sessions/active?schedule_id=${schedule.schedule_id}`
        );
        const data = await res.json();

        if (data.time_expired) {
          showAlert("Ended", "Session time expired.", "expired");
          setSessionStatus("inactive");
          setActiveSessionId(null);
          stopScanning();

          if (userRole === "instructor") {
            await stopInstructorTask();
            globalDisconnect();
          } else if (studentBackgroundTaskRunning) {
            await stopStudentScanningTask();
            setStudentBackgroundTaskRunning(false);
          }
        }
      } catch (e) {
        console.error(e);
      }
    }, 60000);

    return () => clearInterval(interval);
  }, [
    isScheduleTime,
    activeSessionId,
    schedule.schedule_id,
    userRole,
    studentBackgroundTaskRunning,
  ]);

  // ✅ ADDED: Missing filteredDevices memo
  const filteredDevices = useMemo(() => {
    return isScheduleTime && isBluetoothOn && !scanCooldown ? devices : [];
  }, [isScheduleTime, isBluetoothOn, scanCooldown, devices]);

  // --- RENDER ---

  if (initialLoading) {
    return <ViewScheduleSkeleton />;
  }

  // Instructor Student List
  if (userRole === "instructor" && activeInstructorTab === "students") {
    return (
      <View className="flex-1 bg-gray-50">
        <View className="bg-white p-4 shadow-sm">
          <View className="flex-row justify-between bg-gray-200 rounded-full p-2">
            <TouchableOpacity
              className="flex-1 py-2 rounded-full"
              onPress={() => setActiveInstructorTab("ble")}
            >
              <Text className="text-center font-semibold text-gray-500">
                BLE Controls
              </Text>
            </TouchableOpacity>

            <TouchableOpacity className="flex-1 py-2 rounded-full bg-white">
              <Text className="text-center font-semibold text-gray-700">
                Students
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        <InstructorStudentListView
          students={students}
          loading={loadingStudents}
          sessionStatus={sessionStatus}
          onRefresh={fetchScheduleDetails}
          refreshing={loadingStudents}
          activeSessionId={activeSessionId}
          scheduleId={schedule.schedule_id}
        />
      </View>
    );
  }

  // Main Render
  return (
    <View className="flex-1 bg-gray-50">
      {/* Loading Overlays */}
      {(isMarkingAttendance || isCreatingSession) && (
        <View
          style={{ backgroundColor: "rgba(0,0,0,0.6)" }}
          className="absolute inset-0 flex-1 justify-center items-center z-50"
        >
          <View className="bg-white p-8 rounded-3xl items-center shadow-2xl">
            <ActivityIndicator
              size="large"
              color={isCreatingSession ? "#10b981" : "#3b82f6"}
            />
            <Text className="text-gray-800 text-lg font-bold mt-4 text-center">
              {isCreatingSession
                ? "Initializing Class..."
                : "Marking Attendance..."}
            </Text>
          </View>
        </View>
      )}

      {/* Instructor Tabs */}
      {userRole === "instructor" && (
        <View className="bg-white p-4 shadow-sm">
          <View className="flex-row justify-between bg-gray-200 rounded-full p-2">
            <TouchableOpacity className="flex-1 py-2 rounded-full bg-white">
              <Text className="text-center font-semibold text-gray-700">
                BLE Controls
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              className="flex-1 py-2 rounded-full"
              onPress={() => setActiveInstructorTab("students")}
            >
              <Text className="text-center font-semibold text-gray-500">
                Students
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      <FlatList
        data={filteredDevices}
        keyExtractor={(item) => item.id}
        initialNumToRender={8}
        renderItem={({ item }) => (
          <DeviceListItem
            item={item}
            schedule={schedule}
            userRole={userRole}
            isScheduleTime={isScheduleTime}
            isConnected={isConnected}
            connectedDeviceId={connectedDevice?.id}
          />
        )}
        // ✅ FIXED: Wrapped content in <View> to preserve navigation context
        ListHeaderComponent={
          <View>
            <View className="bg-white p-6 rounded-b-3xl shadow-sm mb-4">
              <Text className="text-lg text-gray-700 mb-2 font-bold">
                {schedule.subject_description}
              </Text>

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

              {/* ✅ NEW: Instructor Info for Students */}
              {userRole === "student" && schedule.instructor && (
                <View className="mt-4 pt-4 border-t border-gray-100 flex-row items-center">
                  <Image
                    source={
                      schedule.instructor.image_link
                        ? { uri: schedule.instructor.image_link }
                        : defaultProfile
                    }
                    className="w-10 h-10 rounded-full bg-gray-100"
                    resizeMode="cover"
                  />
                  <View className="ml-3">
                    <Text className="text-[10px] text-gray-500 uppercase font-bold tracking-wider">
                      Instructor
                    </Text>
                    <Text className="text-gray-800 font-medium text-sm">
                      {schedule.instructor.formatted_name ||
                        `${schedule.instructor.lastname}, ${schedule.instructor.firstname}`}
                    </Text>
                  </View>
                </View>
              )}
            </View>

            {isScheduleTime && userRole === "instructor" && (
              <InstructorView
                isConnected={isConnected}
                connectedDevice={connectedDevice}
                sessionStatus={sessionStatus}
                scanning={scanning}
                handleDisconnect={() => {
                  globalDisconnect();
                  stopInstructorTask();
                  setSessionStatus("inactive");
                }}
                onStartScan={startScanning}
                isScheduleTime={isScheduleTime}
                timeUntilSchedule={timeUntilSchedule}
                isBluetoothOn={isBluetoothOn}
                activeSessionId={activeSessionId}
                onCompleteSession={completeSession}
                onCancelSession={cancelSession}
              />
            )}

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
                schedule={schedule}
                activeSessionId={activeSessionId || undefined}
              />
            )}

            {!isScheduleTime && (
              <View className="bg-white p-6 rounded-2xl shadow-sm mb-4 mx-4 items-center">
                <Ionicons name="time-outline" size={48} color="#d1d5db" />
                <Text className="text-gray-600 text-center mt-4 text-lg font-semibold">
                  BLE Features Unavailable
                </Text>
                <Text className="text-blue-600 text-center mt-2 font-medium">
                  Available {timeUntilSchedule}
                </Text>
              </View>
            )}
          </View>
        }
        ListEmptyComponent={
          isScheduleTime &&
          isBluetoothOn &&
          !scanCooldown &&
          devices.length === 0 ? (
            <View className="py-8 items-center">
              <Ionicons name="bluetooth" size={48} color="#d1d5db" />
              <Text className="text-gray-500 text-center mt-4">
                No devices found
              </Text>
            </View>
          ) : null
        }
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={["#3b82f6"]}
            tintColor="#3b82f6"
          />
        }
      />
    </View>
  );
}