import React, { useEffect, useState, useRef, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
  RefreshControl,
} from "react-native";
import { Device } from "react-native-ble-plx";
import AsyncStorage from "@react-native-async-storage/async-storage";
import API_URL from "../api/apiConfig"; 
import { bleUtils } from "../utils/bleUtils";

// Constants
const SCAN_COOLDOWN_DURATION = 60000;
const SCAN_TIMEOUT = 30000;

interface Schedule {
  id: number;
  subject: {
    subject_code: string;
    description: string;
  };
  room: string;
  days: string;
  start_time: string;
  end_time: string;
}

export default function ViewScheduleScreen({ route }: any) {
  const { schedule }: { schedule: Schedule } = route.params;
  const [devices, setDevices] = useState<Device[]>([]);
  const [scanning, setScanning] = useState(false);
  const [connectedDevice, setConnectedDevice] = useState<Device | null>(null);
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
  const [refreshing, setRefreshing] = useState(false);

  // Refs
  const attendanceMarkedRef = useRef(false);
  const isMountedRef = useRef(true);
  const processedDevicesRef = useRef<Set<string>>(new Set());
  const scanCooldownRef = useRef<NodeJS.Timeout | null>(null);
  const rescanTimerRef = useRef<NodeJS.Timeout | null>(null);
  const secondsRef = useRef(0);

  // Pull-to-refresh
  const onRefresh = async () => {
  setRefreshing(true);

  // Reload user/session data
  await loadUserData();

  // Clear previous devices and processed flags
  processedDevicesRef.current.clear();
  setMatchedDevice(null);
  attendanceMarkedRef.current = false;
  setAutoAttendanceMarked(false);

  // Restart BLE scan
  await startScanning();

  setRefreshing(false);
};

  // Normalize subject code
  const normalizeSubjectCode = useCallback((subjectCode: string): string => {
    return subjectCode.replace(/[\s-]/g, "").trim();
  }, []);

  // Start scanning for BLE devices
  const startScanning = useCallback(async () => {
    if (scanCooldown) return;
    try {
      setDevices([]);
      await bleUtils.startDeviceScan({
        filterByManufacturer:
          userRole === "instructor"
            ? schedule.room
            : schedule.subject.subject_code,
        timeout: SCAN_TIMEOUT,
        autoConnect: userRole === "instructor",
      });
    } catch (error) {
      console.error("Failed to start scanning:", error);
    }
  }, [userRole, schedule.room, schedule.subject.subject_code, scanCooldown]);

  // Cooldown timer
  const startCooldownTimer = useCallback(() => {
    setScanCooldown(true);
    secondsRef.current = 60;
    setCooldownTimer(secondsRef.current);

    if (scanCooldownRef.current) clearInterval(scanCooldownRef.current);
    if (rescanTimerRef.current) clearTimeout(rescanTimerRef.current);

    scanCooldownRef.current = setInterval(() => {
      if (secondsRef.current > 0) {
        secondsRef.current--;
        setCooldownTimer(secondsRef.current);
      } else {
        scanCooldownRef.current && clearInterval(scanCooldownRef.current);
      }
    }, 1000);

    rescanTimerRef.current = setTimeout(() => {
      setScanCooldown(false);
      setCooldownTimer(0);
      scanCooldownRef.current && clearInterval(scanCooldownRef.current);

      processedDevicesRef.current.clear();
      attendanceMarkedRef.current = false;
      setAutoAttendanceMarked(false);
      setMatchedDevice(null);

      startScanning();
    }, SCAN_COOLDOWN_DURATION);
  }, [startScanning]);

  // Mark student attendance automatically
  const markStudentAttendance = useCallback(
    async (manufacturerData: string, deviceId: string) => {
      if (processedDevicesRef.current.has(deviceId)) {
        console.log("⏩ Already processed:", deviceId);
        return;
      }

      if (!activeSessionId) {
        console.log("⚠️ No active sessionId, cannot mark attendance");
        return;
      }

      processedDevicesRef.current.add(deviceId);
      bleUtils.stopDeviceScan();
      setScanning(false);

      try {
        const userData = await AsyncStorage.getItem("user");
        if (!userData) return;

        const parsedUser = JSON.parse(userData);
        const decodedManufacturer =
          bleUtils.decodeManufacturerData(manufacturerData);

        console.log("📡 Sending BLE Auto Mark with session:", activeSessionId);

        const response = await fetch(`${API_URL}/attendance/ble-auto-mark`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({
            student_id: parsedUser.id,
            subject_code: schedule.subject.subject_code,
            session_id: activeSessionId,
            ble_manufacturer_data: decodedManufacturer,
          }),
        });

        const result = await response.json();

        if (response.ok) {
          console.log("🎉 Attendance recorded:", result);
          Alert.alert("✅ Success", result.message);

          // Refresh session / user data
          await loadUserData(); // reloads session info
          setAutoAttendanceMarked(true); // update UI
        } else {
          Alert.alert("⚠️ Failed", result.message || "Error occurred");
          console.error("❌ Attendance failed:", result);
        }
      } catch (error) {
        console.error("❌ Error marking attendance:", error);
      }
    },
    [activeSessionId, schedule.subject.subject_code]
  );

  // Load user + active session
  const loadUserData = async () => {
    try {
      const userData = await AsyncStorage.getItem("user");
      if (userData) {
        const parsedUser = JSON.parse(userData);
        setUserRole(parsedUser.role);
        bleUtils.setUserRole(parsedUser.role);

        try {
          const response = await fetch(
            `${API_URL}/attendance-sessions/active?schedule_id=${schedule.id}`
          );
          if (response.ok) {
            const data = await response.json();
            if (data.session) {
              setSessionStatus("active");
              setActiveSessionId(data.session.id);
            } else {
              setSessionStatus("inactive");
              setActiveSessionId(null);
            }
          } else setSessionStatus("unknown");
        } catch {
          setSessionStatus("unknown");
        }
      }
    } catch {
      console.error("Error loading user data");
    } finally {
      isMountedRef.current && setLoading(false);
    }
  };

  useEffect(() => {
    loadUserData();
    return () => {
      isMountedRef.current = false;
    };
  }, [schedule.id]);

  // BLE callbacks setup
  useEffect(() => {
    const callbacks = {
      onDeviceFound: (device: Device) => {
        setDevices((prev) =>
          prev.find((d) => d.id === device.id) ? prev : [...prev, device]
        );
        if (
          userRole === "student" &&
          !autoAttendanceMarked &&
          !attendanceMarkedRef.current &&
          !scanCooldown
        ) {
          const manufacturer = bleUtils.decodeManufacturerData(
            device.manufacturerData
          );
          const normalizedManufacturer = normalizeSubjectCode(manufacturer);
          const normalizedStudentSubject = normalizeSubjectCode(
            schedule.subject.subject_code
          );

          if (normalizedManufacturer === normalizedStudentSubject) {
            setMatchedDevice(device);
            if (sessionStatus === "active") {
              markStudentAttendance(device.manufacturerData || "", device.id);
            }
          }
        }
      },
      onDeviceConnected: async (device: Device) => {
        setConnectedDevice(device);
        if (userRole === "instructor") {
          await bleUtils.writeToCharacteristic(
            device.id,
            "4fafc201-1fb5-459e-8fcc-c5c9c331914b",
            "beb5483e-36e1-4688-b7f5-ea07361b26a8",
            schedule.subject.subject_code
          );
          try {
            const userData = await AsyncStorage.getItem("user");
            if (userData) {
              const parsedUser = JSON.parse(userData);
              await fetch(`${API_URL}/attendance-sessions`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  schedule_id: schedule.id,
                  user_id: parsedUser.id,
                  status: "active",
                }),
              });
              setSessionStatus("active");
            }
          } catch {}
        }
      },
      onDeviceDisconnected: () => setConnectedDevice(null),
      onError: console.error,
      onScanStarted: () => setScanning(true),
      onScanStopped: () => setScanning(false),
    };
    bleUtils.setCallbacks(callbacks);
    return () => bleUtils.setCallbacks({});
  }, [
    userRole,
    sessionStatus,
    autoAttendanceMarked,
    scanCooldown,
    schedule,
    markStudentAttendance,
    normalizeSubjectCode,
  ]);

  // Initialize BLE
  useEffect(() => {
    if (!userRole || loading || scanCooldown) return;
    const initializeBLE = async () => {
      try {
        if (userRole === "instructor") {
          const storedDevice = await bleUtils.loadConnectedDevice(schedule.id);
          if (storedDevice) {
            const isConnected = await bleUtils.checkDeviceConnection(
              storedDevice.id
            );
            setConnectedDevice(isConnected ? storedDevice : null);
          }
        }
        startScanning();
      } catch {
        startScanning();
      }
    };
    initializeBLE();
  }, [userRole, loading, schedule.id, scanCooldown, startScanning]);

  const connectToDevice = useCallback(
    async (device: Device) => {
      try {
        await bleUtils.connectToDevice(device);
      } catch {
        userRole === "instructor" &&
          Alert.alert("Connection Failed", "Could not connect to device.");
      }
    },
    [userRole]
  );

  const disconnectDevice = useCallback(async () => {
    if (connectedDevice) {
      try {
        await bleUtils.disconnectDevice(connectedDevice.id);
        setConnectedDevice(null);
      } catch {}
    }
  }, [connectedDevice]);

  const handleManualRescan = useCallback(() => {
    setScanCooldown(false);
    setCooldownTimer(0);
    scanCooldownRef.current && clearInterval(scanCooldownRef.current);
    rescanTimerRef.current && clearTimeout(rescanTimerRef.current);
    processedDevicesRef.current.clear();
    attendanceMarkedRef.current = false;
    setAutoAttendanceMarked(false);
    setMatchedDevice(null);
    startScanning();
  }, [startScanning]);

  if (loading) {
    return (
      <View className="flex-1 justify-center items-center">
        <ActivityIndicator size="large" color="#2563eb" />
        <Text className="mt-2 text-gray-600">Loading schedule...</Text>
      </View>
    );
  }

  const EmptyListComponent = () => (
    <Text className="text-gray-500 text-center mt-4">No devices found</Text>
  );

  // --- Main render using FlatList with ListHeaderComponent ---
  return (
    <FlatList
      data={!connectedDevice && !scanCooldown ? devices : []}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => {
        const manufacturer = bleUtils.decodeManufacturerData(
          item.manufacturerData
        );
        const normalizedManufacturer = normalizeSubjectCode(manufacturer);
        const normalizedStudentSubject = normalizeSubjectCode(
          schedule.subject.subject_code
        );
        const normalizedRoom = normalizeSubjectCode(schedule.room);

        const isMatch =
          userRole === "instructor"
            ? normalizedManufacturer === normalizedRoom
            : normalizedManufacturer === normalizedStudentSubject;

        return (
          <TouchableOpacity
            onPress={() => userRole === "instructor" && connectToDevice(item)}
            disabled={userRole !== "instructor"}
          >
            <View
              className={`p-4 rounded-xl shadow mb-3 ${
                isMatch ? "bg-green-50 border border-green-200" : "bg-white"
              } ${userRole !== "instructor" ? "opacity-80" : ""}`}
            >
              <Text className="font-semibold text-gray-800 text-base">
                {item.name || "Unknown Device"}
              </Text>
              <Text className="text-xs text-gray-500">{item.id}</Text>
              {manufacturer ? (
                <Text
                  className={`text-xs mt-1 ${
                    isMatch ? "text-green-600 font-medium" : "text-blue-500"
                  }`}
                >
                  Manufacturer: {manufacturer}
                  {isMatch &&
                    ` (${userRole === "instructor" ? "Room Match" : "Subject Match"})`}
                </Text>
              ) : (
                <Text className="text-xs text-gray-400 mt-1">
                  No manufacturer data
                </Text>
              )}
              {userRole !== "instructor" && (
                <Text className="text-xs text-gray-400 mt-1">
                  Students can only view devices
                </Text>
              )}
            </View>
          </TouchableOpacity>
        );
      }}
      ListEmptyComponent={!scanning ? EmptyListComponent : undefined}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
      ListHeaderComponent={
        <>
          {/* Header */}
          <View className="bg-white p-4 rounded-2xl shadow mb-4">
            <Text className="text-2xl font-bold text-blue-600">
              {schedule.subject.subject_code}
            </Text>
            <Text className="text-lg text-gray-700 mb-2">
              {schedule.subject.description}
            </Text>
            <Text className="text-sm text-gray-600">
              {schedule.days} • {schedule.start_time} - {schedule.end_time}
            </Text>
            <Text className="text-sm font-semibold text-blue-500 mt-1">
              Room: {schedule.room}
            </Text>

            {sessionStatus === "active" && (
              <View className="mt-2 p-2 rounded-lg bg-green-100">
                <Text className="text-green-800">
                  ✅ Active Attendance Session
                </Text>
                {userRole === "student" && autoAttendanceMarked && (
                  <Text className="text-green-600 text-sm mt-1">
                    ✅ Attendance automatically recorded via BLE
                  </Text>
                )}
              </View>
            )}

            {sessionStatus === "inactive" &&
              userRole === "instructor" &&
              !connectedDevice && (
                <View className="mt-2 p-2 rounded-lg bg-yellow-100">
                  <Text className="text-yellow-800">
                    ⚠️ Connect to room device to start attendance session
                  </Text>
                </View>
              )}
          </View>

          {/* Connection status */}
          {userRole === "instructor" && connectedDevice ? (
            <View className="mb-4 p-3 rounded-xl bg-green-100">
              <Text className="text-green-700 font-semibold">
                ✅ Connected to {connectedDevice.name || connectedDevice.id}
              </Text>
              <Text className="text-green-600 text-sm mt-1">
                Attendance session is{" "}
                {sessionStatus === "active" ? "active" : "ready"}
              </Text>
              <TouchableOpacity
                onPress={disconnectDevice}
                className="mt-2 bg-red-500 py-2 px-4 rounded-lg self-start"
              >
                <Text className="text-white">Disconnect</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View className="mb-4">
              <Text className="text-lg font-bold text-gray-800 mb-2">
                {userRole === "instructor"
                  ? "Nearby Devices"
                  : "Available BLE Devices"}
              </Text>

              {userRole === "student" && (
                <View className="bg-green-50 p-3 rounded-lg mb-3">
                  <Text className="text-green-700 font-semibold">
                    {sessionStatus === "active"
                      ? scanCooldown
                        ? `Scanning paused - Resumes in ${Math.floor(
                            cooldownTimer / 60
                          )}:${(cooldownTimer % 60)
                            .toString()
                            .padStart(2, "0")}`
                        : "Active Attendance Session - Scanning for your subject..."
                      : "No active session found"}
                  </Text>

                  {scanCooldown && (
                    <TouchableOpacity
                      onPress={handleManualRescan}
                      className="mt-2 bg-blue-500 py-2 px-4 rounded-lg self-start"
                    >
                      <Text className="text-white">Rescan Now</Text>
                    </TouchableOpacity>
                  )}

                  {matchedDevice && (
                    <Text className="text-green-600 text-sm mt-1">
                      Matching device found:{" "}
                      {matchedDevice.name || matchedDevice.id}
                    </Text>
                  )}
                  {autoAttendanceMarked && (
                    <Text className="text-green-600 text-sm mt-1">
                      ✅ Attendance automatically recorded!
                    </Text>
                  )}
                </View>
              )}

              {scanning && userRole === "instructor" && (
                <View className="flex-row items-center mb-2">
                  <ActivityIndicator size="small" color="#2563eb" />
                  <Text className="ml-2 text-gray-500">
                    Scanning for devices in {schedule.room}...
                  </Text>
                </View>
              )}
            </View>
          )}
        </>
      }
      contentContainerStyle={{ flexGrow: 1, padding: 16 }}
    />
  );
}
