import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Linking,
  Platform,
  StyleSheet,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useIsFocused } from "@react-navigation/native";
import { API_URL } from "../api/apiConfig";
import ExcuseModal from "./ExcuseModal";

// --- BLUE COLOR PALETTE ---
const BluePalette = {
  primary: "#2563EB",
  dark: "#1E3A8A",
  mid: "#3B82F6",
  pale: "#EFF6FF",
  border: "#BFDBFE",
  textHeavy: "#1E3A8A",
  textMedium: "#4B5563",
  textLight: "#93C5FD",
  success: "#0EA5E9",
  successBg: "#E0F2FE",
  successBorder: "#BAE6FD",
  successTextDark: "#0369A1",
};

// --- PURPLE COLOR PALETTE (For Excused State) ---
const PurplePalette = {
  primary: "#9333EA",
  bg: "#F3E8FF",
  border: "#E9D5FF",
  textDark: "#6B21A8",
};

interface StudentViewProps {
  sessionStatus: string;
  scanning: boolean;
  scanCooldown: boolean;
  cooldownTimer: number;
  handleManualRescan: () => void;
  onStartScan: () => void;
  isScheduleTime: boolean;
  timeUntilSchedule: string;
  studentBackgroundTaskRunning: boolean;
  autoAttendanceMarked: boolean;
  isBluetoothOn?: boolean;
  schedule: any;
  activeSessionId?: number | null;
}

interface AttendanceRecord {
  attendance_record_id: number;
  status: string;
  face_verified: boolean;
  presence_verified: boolean;
  time_in: string;
  first_detection?: { detected_at: string; rssi: number };
}

interface ExcuseData {
  excuse_id: number;
  reason: string;
  details: string;
  status: string;
}

const StudentView: React.FC<StudentViewProps> = ({
  sessionStatus,
  scanning,
  scanCooldown,
  cooldownTimer,
  handleManualRescan,
  onStartScan,
  isScheduleTime,
  timeUntilSchedule,
  studentBackgroundTaskRunning,
  autoAttendanceMarked,
  isBluetoothOn = true,
  schedule,
  activeSessionId,
}) => {
  const isFocused = useIsFocused();
  const [attendanceRecord, setAttendanceRecord] =
    useState<AttendanceRecord | null>(null);
  const [loadingAttendance, setLoadingAttendance] = useState(false);
  const [isExcuseModalVisible, setExcuseModalVisible] = useState(false);
  const [isSubmittingExcuse, setIsSubmittingExcuse] = useState(false);

  const [existingExcuse, setExistingExcuse] = useState<ExcuseData | null>(null);
  const [loadingExcuse, setLoadingExcuse] = useState(false);

  useEffect(() => {
    if (activeSessionId && isFocused) {
      if (autoAttendanceMarked) {
        fetchAttendanceRecord();
      }
      fetchExistingExcuse();
    }
  }, [activeSessionId, autoAttendanceMarked, sessionStatus, isFocused]);

  const fetchAttendanceRecord = async () => {
    if (!activeSessionId || !isFocused) return;
    setLoadingAttendance(true);
    try {
      const userData = await AsyncStorage.getItem("user");
      if (!userData) return;
      const parsedUser = JSON.parse(userData);
      const response = await fetch(
        `${API_URL}/attendance/check?student_id=${parsedUser.id}&session_id=${activeSessionId}`,
      );
      if (response.ok) {
        const data = await response.json();
        if (isFocused && data.success && data.attendance) {
          setAttendanceRecord(data.attendance);
        }
      }
    } catch (error) {
      console.error("Error fetching attendance record:", error);
    } finally {
      if (isFocused) setLoadingAttendance(false);
    }
  };

  const fetchExistingExcuse = async () => {
    if (!activeSessionId) return;
    setLoadingExcuse(true);
    try {
      const userData = await AsyncStorage.getItem("user");
      if (!userData) return;
      const parsedUser = JSON.parse(userData);

      const response = await fetch(
        `${API_URL}/attendance/excuse/check?user_id=${parsedUser.id}&session_id=${activeSessionId}`,
      );

      if (response.ok) {
        const data = await response.json();
        if (data.success && data.data) {
          setExistingExcuse(data.data);
        } else {
          setExistingExcuse(null);
        }
      }
    } catch (error) {
      console.error("Error fetching existing excuse:", error);
    } finally {
      setLoadingExcuse(false);
    }
  };

  const openBluetoothSettings = () => {
    if (Platform.OS === "android") {
      Linking.sendIntent("android.settings.BLUETOOTH_SETTINGS");
    } else {
      Linking.openSettings();
    }
  };

  const handleStartScan = () => {
    if (autoAttendanceMarked) {
      Alert.alert("Already Marked", "Your attendance is already recorded.");
      return;
    }
    if (!isBluetoothOn) {
      Alert.alert("Bluetooth Off", "Please enable Bluetooth.");
      return;
    }
    if (sessionStatus !== "active") {
      Alert.alert("No Session", "No active attendance session found.");
      return;
    }
    if (!isScheduleTime) {
      Alert.alert("Not Time", "Scanning available during class hours only.");
      return;
    }
    onStartScan();
  };

  const handleExcuseSubmit = async (reason: string, details: string) => {
    if (!activeSessionId) {
      Alert.alert("Error", "No active session to excuse.");
      return;
    }

    setIsSubmittingExcuse(true);
    try {
      const userData = await AsyncStorage.getItem("user");
      if (!userData) return;
      const parsedUser = JSON.parse(userData);

      const payload = {
        user_id: parsedUser.id,
        session_id: activeSessionId,
        reason: reason,
        details: details,
      };

      const url = existingExcuse
        ? `${API_URL}/attendance/excuse/${existingExcuse.excuse_id}`
        : `${API_URL}/attendance/excuse`;

      const method = existingExcuse ? "PUT" : "POST";

      const response = await fetch(url, {
        method: method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        Alert.alert(
          "Success",
          existingExcuse
            ? "Your excuse request has been updated."
            : "Your excuse request has been submitted.",
        );
        setExcuseModalVisible(false);
        fetchExistingExcuse();
      } else {
        const errorData = await response.json();
        Alert.alert("Error", errorData.message || "Failed to process request.");
      }
    } catch (error) {
      Alert.alert("Error", "Network error occurred.");
    } finally {
      setIsSubmittingExcuse(false);
    }
  };

  // --- 1. ATTENDANCE MARKED / EXCUSED STATE (MOVED TO TOP TO BYPASS BT CHECK) ---
  if (autoAttendanceMarked) {
    const isExcused = attendanceRecord?.status?.toLowerCase() === "excused";

    return (
      <View style={styles.container}>
        <View
          style={[
            styles.successCard,
            isExcused && {
              borderColor: PurplePalette.border,
              shadowColor: PurplePalette.primary,
            },
          ]}
        >
          <View style={styles.successHeader}>
            <View style={styles.row}>
              <Ionicons
                name={isExcused ? "document-text" : "checkmark-circle"}
                size={24}
                color={isExcused ? PurplePalette.primary : BluePalette.success}
              />
              <Text
                style={[
                  styles.successTitle,
                  isExcused && { color: PurplePalette.textDark },
                ]}
              >
                {isExcused ? "Excuse Approved" : "Attendance Marked"}
              </Text>
            </View>
            <View
              style={[
                styles.statusBadge,
                isExcused && { backgroundColor: PurplePalette.bg },
              ]}
            >
              <Text
                style={[
                  styles.statusText,
                  isExcused && { color: PurplePalette.textDark },
                ]}
              >
                {attendanceRecord?.status || "Present"}
              </Text>
            </View>
          </View>

          {loadingAttendance ? (
            <ActivityIndicator
              size="small"
              color={isExcused ? PurplePalette.primary : BluePalette.success}
              style={{ marginVertical: 20 }}
            />
          ) : isExcused ? (
            // EXCLUSIVE EXCUSED UI
            <View
              style={{
                marginTop: 12,
                alignItems: "center",
                paddingVertical: 10,
              }}
            >
              <Text
                style={{
                  color: "#6B7280",
                  textAlign: "center",
                  lineHeight: 22,
                  fontSize: 14,
                }}
              >
                Your instructor has approved your excuse request for this
                session.{"\n"}
                <Text
                  style={{ fontWeight: "600", color: PurplePalette.textDark }}
                >
                  You do not need to scan your attendance.
                </Text>
              </Text>
            </View>
          ) : (
            // STANDARD PRESENT/LATE UI
            <View style={{ marginTop: 12 }}>
              <View style={styles.detailRow}>
                <Text style={styles.label}>Time In</Text>
                <Text style={styles.timeValue}>
                  {attendanceRecord?.time_in
                    ? new Date(attendanceRecord.time_in).toLocaleTimeString(
                        [],
                        { hour: "2-digit", minute: "2-digit" },
                      )
                    : "--:--"}
                </Text>
              </View>

              <View style={styles.divider} />

              <View style={styles.verificationContainer}>
                <View style={styles.verifyBadge}>
                  <Ionicons
                    name={
                      attendanceRecord?.face_verified
                        ? "person-circle"
                        : "alert-circle"
                    }
                    size={16}
                    color={
                      attendanceRecord?.face_verified
                        ? BluePalette.success
                        : BluePalette.textLight
                    }
                  />
                  <Text style={styles.verifyText}>
                    Face:{" "}
                    {attendanceRecord?.face_verified ? "Verified" : "Pending"}
                  </Text>
                </View>

                <View style={styles.verifyBadge}>
                  <Ionicons
                    name={
                      attendanceRecord?.presence_verified
                        ? "location"
                        : "location-outline"
                    }
                    size={16}
                    color={
                      attendanceRecord?.presence_verified
                        ? BluePalette.success
                        : BluePalette.textLight
                    }
                  />
                  <Text style={styles.verifyText}>
                    Location:{" "}
                    {attendanceRecord?.presence_verified ? "Valid" : "Check"}
                  </Text>
                </View>
              </View>

              {attendanceRecord?.first_detection && (
                <View style={styles.cardFooter}>
                  <Text style={styles.footerText}>
                    Signal: {attendanceRecord.first_detection.rssi} dBm
                  </Text>
                  <Text style={styles.footerText}>
                    ID: #{attendanceRecord.attendance_record_id}
                  </Text>
                </View>
              )}
            </View>
          )}
        </View>
      </View>
    );
  }

  // --- 2. BLUETOOTH OFF STATE (Only happens if attendance is NOT marked) ---
  if (!isBluetoothOn) {
    return (
      <View style={styles.container}>
        <View style={styles.card}>
          <View style={styles.iconContainerPill}>
            <Ionicons name="bluetooth" size={32} color={BluePalette.primary} />
          </View>
          <Text style={styles.title}>Bluetooth Required</Text>
          <Text style={styles.description}>
            Bluetooth is required to connect to devices and track attendance.
            Please enable it to continue.
          </Text>
          <TouchableOpacity
            onPress={openBluetoothSettings}
            style={styles.primaryButton}
            activeOpacity={0.8}
          >
            <Text style={styles.primaryButtonText}>Turn On Bluetooth</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (!isScheduleTime) {
    return (
      <View style={styles.container}>
        <View style={[styles.card, { alignItems: "flex-start" }]}>
          <Text style={styles.sectionTitle}>Class Not Started</Text>
          <Text style={styles.descriptionAlignLeft}>
            Attendance scanning will be available {timeUntilSchedule}.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.infoCard}>
        <View style={styles.row}>
          <Ionicons
            name="information-circle"
            size={20}
            color={BluePalette.primary}
          />
          <Text style={styles.infoTitle}>Instructions</Text>
        </View>
        <Text style={styles.infoText}>
          1. Tap "Start Scanning" below.{"\n"}
          2. The app will locate the class device.{"\n"}
          3. Complete face verification to finish.
        </Text>
      </View>

      <View style={styles.scanCard}>
        <View style={styles.scanIconWrapper}>
          <Ionicons name="scan-circle" size={48} color={BluePalette.primary} />
        </View>

        <Text style={styles.scanStatusText}>
          {scanCooldown
            ? `Please wait ${cooldownTimer}s`
            : scanning
              ? "Searching for class..."
              : "Ready to Mark Attendance"}
        </Text>

        {scanning && (
          <ActivityIndicator
            size="large"
            color={BluePalette.primary}
            style={{ marginBottom: 20 }}
          />
        )}

        {!scanning && !scanCooldown && (
          <TouchableOpacity
            onPress={handleStartScan}
            style={styles.primaryButton}
            activeOpacity={0.8}
          >
            <Text style={styles.primaryButtonText}>Start Scanning</Text>
          </TouchableOpacity>
        )}

        {!scanning && !scanCooldown && sessionStatus === "active" && (
          <TouchableOpacity
            onPress={() => {
              if (existingExcuse && existingExcuse.status !== "pending") {
                Alert.alert(
                  "Notice",
                  `Your excuse request has already been ${existingExcuse.status} and cannot be edited.`,
                );
              } else {
                setExcuseModalVisible(true);
              }
            }}
            style={{
              marginTop: 16,
              padding: 8,
              flexDirection: "row",
              alignItems: "center",
            }}
            disabled={loadingExcuse}
          >
            {loadingExcuse ? (
              <ActivityIndicator size="small" color={BluePalette.primary} />
            ) : existingExcuse ? (
              <>
                <Ionicons
                  name={
                    existingExcuse.status === "pending"
                      ? "time-outline"
                      : "checkmark-circle-outline"
                  }
                  size={16}
                  color={BluePalette.primary}
                  style={{ marginRight: 4 }}
                />
                <Text
                  style={{ color: BluePalette.textMedium, fontWeight: "600" }}
                >
                  Excuse{" "}
                  <Text
                    style={{
                      color: BluePalette.primary,
                      textTransform: "capitalize",
                    }}
                  >
                    {existingExcuse.status}
                  </Text>
                  {existingExcuse.status === "pending" ? " (Tap to Edit)" : ""}
                </Text>
              </>
            ) : (
              <Text
                style={{ color: BluePalette.textMedium, fontWeight: "600" }}
              >
                Can't attend?{" "}
                <Text style={{ color: BluePalette.primary }}>
                  Apply for Excuse
                </Text>
              </Text>
            )}
          </TouchableOpacity>
        )}

        {scanCooldown && (
          <TouchableOpacity
            onPress={handleManualRescan}
            style={[
              styles.primaryButton,
              { backgroundColor: BluePalette.success },
            ]}
            activeOpacity={0.8}
          >
            <Text style={styles.primaryButtonText}>Rescan Now</Text>
          </TouchableOpacity>
        )}
      </View>

      <ExcuseModal
        isVisible={isExcuseModalVisible}
        onClose={() => setExcuseModalVisible(false)}
        onSubmit={handleExcuseSubmit}
        isSubmitting={isSubmittingExcuse}
        existingData={existingExcuse}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { paddingHorizontal: 16, marginBottom: 16 },
  row: { flexDirection: "row", alignItems: "center" },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 24,
    alignItems: "center",
    borderWidth: 1,
    borderColor: BluePalette.border,
    shadowColor: BluePalette.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  successCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: BluePalette.successBorder,
    shadowColor: BluePalette.success,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  successHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  successTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: BluePalette.successTextDark,
    marginLeft: 8,
  },
  statusBadge: {
    backgroundColor: BluePalette.successBg,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    color: BluePalette.successTextDark,
    fontWeight: "700",
    fontSize: 12,
    textTransform: "uppercase",
  },
  detailRow: { marginBottom: 8 },
  label: {
    fontSize: 12,
    color: BluePalette.textMedium,
    textTransform: "uppercase",
    fontWeight: "600",
    marginBottom: 4,
  },
  timeValue: {
    fontSize: 24,
    fontWeight: "700",
    color: BluePalette.successTextDark,
  },
  divider: {
    height: 1,
    backgroundColor: BluePalette.border,
    marginVertical: 12,
  },
  verificationContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    backgroundColor: BluePalette.pale,
    padding: 12,
    borderRadius: 12,
  },
  verifyBadge: { flexDirection: "row", alignItems: "center" },
  verifyText: {
    fontSize: 12,
    marginLeft: 6,
    color: BluePalette.textMedium,
    fontWeight: "500",
  },
  cardFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 12,
    opacity: 0.7,
  },
  footerText: { fontSize: 10, color: BluePalette.textMedium },
  infoCard: {
    backgroundColor: BluePalette.pale,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: BluePalette.border,
  },
  infoTitle: {
    color: BluePalette.dark,
    fontWeight: "700",
    marginLeft: 6,
    fontSize: 15,
  },
  infoText: {
    color: BluePalette.mid,
    fontSize: 13,
    marginTop: 8,
    lineHeight: 20,
  },
  scanCard: {
    backgroundColor: "white",
    borderRadius: 20,
    padding: 24,
    alignItems: "center",
    borderWidth: 1,
    borderColor: BluePalette.border,
    shadowColor: BluePalette.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 3,
  },
  scanIconWrapper: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: BluePalette.pale,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 12,
  },
  scanStatusText: {
    color: BluePalette.textHeavy,
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 20,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    color: BluePalette.textHeavy,
    marginBottom: 8,
  },
  description: {
    fontSize: 14,
    color: BluePalette.textMedium,
    textAlign: "center",
    marginBottom: 20,
    lineHeight: 20,
  },
  descriptionAlignLeft: {
    fontSize: 14,
    color: BluePalette.textMedium,
    textAlign: "left",
    lineHeight: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: BluePalette.textHeavy,
    marginBottom: 4,
  },
  iconContainerPill: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: BluePalette.pale,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },
  primaryButton: {
    backgroundColor: BluePalette.primary,
    paddingVertical: 14,
    borderRadius: 12,
    width: "100%",
    alignItems: "center",
    shadowColor: BluePalette.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 4,
  },
  primaryButtonText: { color: "white", fontWeight: "600", fontSize: 16 },
});

export default StudentView;
