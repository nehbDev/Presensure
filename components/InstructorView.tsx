import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  Alert,
  ActivityIndicator,
  Linking,
  Platform,
  StyleSheet,
  Dimensions,
} from "react-native";
import { Device } from "react-native-ble-plx";
import { Ionicons } from "@expo/vector-icons";
import { stopInstructorTask } from "../utils/backgroundTask";

const { width } = Dimensions.get("window");

interface InstructorViewProps {
  isConnected: boolean;
  connectedDevice: Device | null;
  sessionStatus: string;
  scanning: boolean;
  handleDisconnect: () => void;
  onStartScan: () => void;
  isScheduleTime: boolean;
  timeUntilSchedule: string;
  isBluetoothOn?: boolean;
  activeSessionId: number | null;
  onCompleteSession: (sessionId: number) => Promise<void>;
  onCancelSession: (sessionId: number) => Promise<void>;
}

const InstructorView: React.FC<InstructorViewProps> = ({
  isConnected,
  connectedDevice,
  sessionStatus,
  scanning,
  handleDisconnect,
  onStartScan,
  isScheduleTime,
  timeUntilSchedule,
  isBluetoothOn = true,
  activeSessionId,
  onCompleteSession,
  onCancelSession,
}) => {
  const [showDisconnectModal, setShowDisconnectModal] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const openBluetoothSettings = () => {
    if (Platform.OS === "android") {
      Linking.sendIntent("android.settings.BLUETOOTH_SETTINGS");
    } else {
      Linking.openSettings();
    }
  };

  const handleDisconnectPress = () => {
    if (activeSessionId) {
      setShowDisconnectModal(true);
    } else {
      handleDisconnect();
    }
  };

  const handleCompleteSession = async () => {
    if (!activeSessionId) return;
    setIsProcessing(true);
    try {
      await stopInstructorTask();
      await onCompleteSession(activeSessionId);
      setShowDisconnectModal(false);
      handleDisconnect();
    } catch (error) {
      Alert.alert("Error", "Failed to complete session");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCancelSession = async () => {
    if (!activeSessionId) return;
    setIsProcessing(true);
    try {
      await stopInstructorTask();
      await onCancelSession(activeSessionId);
      setShowDisconnectModal(false);
      handleDisconnect();
    } catch (error) {
      Alert.alert("Error", "Failed to cancel session");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCloseModal = () => {
    if (!isProcessing) {
      setShowDisconnectModal(false);
    }
  };

  // --- 1. Bluetooth Off ---
  if (!isBluetoothOn) {
    return (
      <View style={styles.container}>
        <View style={styles.card}>
          <View style={[styles.iconContainer, { backgroundColor: "#EFF6FF" }]}>
            <Ionicons name="bluetooth" size={32} color="#2563EB" />
          </View>
          <Text style={styles.title}>Bluetooth Required</Text>
          <Text style={styles.description}>
            Bluetooth must be enabled to connect to the classroom device and
            manage attendance.
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

  // --- 2. Active Session ---
  const isSessionActive = sessionStatus === "active" && activeSessionId;

  if (isSessionActive || isConnected) {
    const isLiveConnection = isConnected && connectedDevice;

    return (
      <View style={styles.container}>
        <View
          style={[
            styles.card,
            isLiveConnection ? styles.cardActive : styles.cardWarning,
          ]}
        >
          <View style={styles.row}>
            <View
              style={[
                styles.smallIcon,
                isLiveConnection ? styles.bgGreen : styles.bgOrange,
              ]}
            >
              <Ionicons
                name={isLiveConnection ? "bluetooth" : "cloud-offline-outline"}
                size={20}
                color={isLiveConnection ? "#059669" : "#D97706"}
              />
            </View>
            <View style={styles.flex1}>
              <Text style={styles.cardTitle}>
                {isLiveConnection
                  ? `Connected: ${connectedDevice?.name || "Device"}`
                  : "Session In Progress"}
              </Text>
              <Text style={styles.cardSubtext}>
                {isLiveConnection
                  ? "Broadcasting presence to students."
                  : "Bluetooth disconnected. Attendance active."}
              </Text>
            </View>
          </View>

          <TouchableOpacity
            onPress={handleDisconnectPress}
            disabled={isProcessing}
            style={[styles.actionButton, styles.bgRed]}
          >
            {isProcessing ? (
              <ActivityIndicator size="small" color="white" />
            ) : (
              <Ionicons name="power" size={18} color="white" />
            )}
            <Text style={styles.actionButtonText}>
              {isProcessing ? "Processing..." : "End Session"}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Modal */}
        <Modal
          visible={showDisconnectModal}
          transparent={true}
          animationType="fade"
          onRequestClose={handleCloseModal}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <View style={[styles.smallIcon, styles.bgBlue]}>
                  <Ionicons name="settings-sharp" size={24} color="#2563EB" />
                </View>
                <View style={styles.modalHeaderText}>
                  <Text style={styles.title}>Manage Session</Text>
                  <Text style={styles.description}>
                    Choose an action to close the class.
                  </Text>
                </View>
              </View>

              <TouchableOpacity
                onPress={handleCompleteSession}
                disabled={isProcessing}
                style={[styles.modalOption, styles.borderGreen]}
              >
                <Ionicons
                  name="checkmark-done-circle"
                  size={28}
                  color="#059669"
                />
                <View style={styles.optionTextContainer}>
                  <Text style={[styles.optionTitle, { color: "#059669" }]}>
                    Complete Session
                  </Text>
                  <Text style={styles.optionSub}>Save attendance records.</Text>
                </View>
              </TouchableOpacity>
              {/*
              <TouchableOpacity
                onPress={handleCancelSession}
                disabled={isProcessing}
                style={[styles.modalOption, styles.borderRed]}
              >
                <Ionicons name="trash-bin" size={24} color="#DC2626" />
                <View style={styles.optionTextContainer}>
                  <Text style={[styles.optionTitle, { color: "#DC2626" }]}>
                    Cancel Session
                  </Text>
                  <Text style={styles.optionSub}>Discard all data.</Text>
                </View>
              </TouchableOpacity>
              */}

              {!isProcessing && (
                <TouchableOpacity
                  onPress={handleCloseModal}
                  style={styles.closeButton}
                >
                  <Text style={styles.closeButtonText}>Go Back</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </Modal>
      </View>
    );
  }

  // --- 3. Scanning State ---
  return (
    <View style={styles.container}>
      {/* Info Card */}
      <View style={styles.infoCard}>
        <View style={styles.row}>
          <Ionicons name="information-circle" size={20} color="#2563EB" />
          <Text style={styles.infoTitle}>How to Start</Text>
        </View>
        <Text style={styles.infoText}>
          1. Tap "Scan for Devices".{"\n"}
          2. Connect to the room's ESP32.{"\n"}
          3. Attendance marking will begin automatically.
        </Text>
      </View>

      <View style={styles.headerRow}>
        <Text style={styles.sectionTitle}>Nearby Devices</Text>
        {scanning && (
          <View style={styles.row}>
            <ActivityIndicator size="small" color="#2563EB" />
            <Text style={styles.scanningText}>Scanning...</Text>
          </View>
        )}
      </View>

      {/* Main Scan Action Card */}
      <View style={styles.scanCard}>
        <View style={styles.scanIconWrapper}>
          <Ionicons
            name={scanning ? "radio" : "bluetooth"}
            size={40}
            color={isScheduleTime ? "#2563EB" : "#9CA3AF"}
          />
        </View>
        <Text style={styles.scanStatusText}>
          {scanning
            ? "Searching for devices..."
            : isScheduleTime
              ? "Ready to connect"
              : "Class not started"}
        </Text>

        {!scanning && (
          <TouchableOpacity
            onPress={onStartScan}
            disabled={!isScheduleTime}
            style={[
              styles.primaryButton,
              !isScheduleTime && styles.disabledButton,
            ]}
          >
            <Text style={styles.primaryButtonText}>
              {isScheduleTime ? "Scan for Devices" : "Scanning Disabled"}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {!isScheduleTime && (
        <Text style={styles.footerNote}>
          Available only during scheduled hours.
        </Text>
      )}
    </View>
  );
};

// --- BLUE THEME STYLESHEET ---
const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  flex1: { flex: 1 },
  row: { flexDirection: "row", alignItems: "center" },

  // Cards
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 20,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    shadowColor: "#2563EB",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 3,
  },
  cardActive: { borderColor: "#34D399", backgroundColor: "#ECFDF5" },
  cardWarning: { borderColor: "#FBBF24", backgroundColor: "#FFFBEB" },

  infoCard: {
    backgroundColor: "#EFF6FF",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#DBEAFE",
  },
  scanCard: {
    backgroundColor: "white",
    borderRadius: 20,
    padding: 24,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },

  // Text
  title: { fontSize: 18, fontWeight: "700", color: "#1E3A8A", marginBottom: 8 },
  description: {
    fontSize: 14,
    color: "#64748B",
    textAlign: "center",
    marginBottom: 20,
    lineHeight: 20,
  },
  infoTitle: {
    color: "#1E40AF",
    fontWeight: "700",
    marginLeft: 6,
    fontSize: 15,
  },
  infoText: { color: "#3B82F6", fontSize: 13, marginTop: 8, lineHeight: 20 },
  sectionTitle: { fontSize: 18, fontWeight: "700", color: "#1E293B" },
  scanningText: {
    color: "#2563EB",
    fontSize: 13,
    marginLeft: 6,
    fontWeight: "500",
  },
  scanStatusText: {
    color: "#475569",
    fontSize: 16,
    fontWeight: "500",
    marginTop: 12,
    marginBottom: 16,
  },
  footerNote: {
    textAlign: "center",
    color: "#94A3B8",
    fontSize: 12,
    marginTop: 12,
  },
  cardTitle: { fontSize: 16, fontWeight: "700", color: "#1E293B" },
  cardSubtext: { fontSize: 12, color: "#64748B", marginTop: 2 },

  // Icons
  iconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },
  scanIconWrapper: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#F1F5F9",
    justifyContent: "center",
    alignItems: "center",
  },
  smallIcon: {
    padding: 8,
    borderRadius: 20,
    marginRight: 12,
  },

  // Buttons
  primaryButton: {
    backgroundColor: "#2563EB",
    paddingVertical: 14,
    borderRadius: 12,
    width: "100%",
    alignItems: "center",
    shadowColor: "#2563EB",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 2,
  },
  disabledButton: { backgroundColor: "#94A3B8" },
  primaryButtonText: { color: "white", fontWeight: "600", fontSize: 16 },

  actionButton: {
    marginTop: 16,
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 10,
  },
  actionButtonText: { color: "white", fontWeight: "600", marginLeft: 8 },

  // Colors
  bgBlue: { backgroundColor: "#DBEAFE" },
  bgGreen: { backgroundColor: "#D1FAE5" },
  bgOrange: { backgroundColor: "#FEF3C7" },
  bgRed: { backgroundColor: "#EF4444" },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.6)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContent: {
    backgroundColor: "white",
    width: width * 0.85,
    borderRadius: 24,
    padding: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 10,
  },
  modalHeader: { flexDirection: "row", marginBottom: 20 },
  modalHeaderText: { flex: 1, marginLeft: 12 },
  modalOption: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 12,
    backgroundColor: "#FAFAFA",
  },
  borderGreen: { borderColor: "#D1FAE5", backgroundColor: "#F0FDF4" },
  borderRed: { borderColor: "#FEE2E2", backgroundColor: "#FEF2F2" },
  optionTextContainer: { marginLeft: 12, flex: 1 },
  optionTitle: { fontSize: 16, fontWeight: "700" },
  optionSub: { fontSize: 12, color: "#64748B" },
  closeButton: { marginTop: 8, padding: 12, alignItems: "center" },
  closeButtonText: { color: "#64748B", fontWeight: "600" },

  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
});

export default InstructorView;
