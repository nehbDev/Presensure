import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";

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
  isBluetoothOn?: boolean; // Add this prop
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
  isBluetoothOn = true, // Default to true
}) => {
  const handleStartScan = () => {
    // ⛔️ Prevent scanning if attendance is already marked or Bluetooth is off
    if (autoAttendanceMarked || !isBluetoothOn) {
      return;
    }

    if (sessionStatus === "active" && !scanCooldown) {
      onStartScan();
    }
  };

  // Show Bluetooth off state
  if (!isBluetoothOn) {
    return (
      <View className="mx-4 mb-4 p-4 rounded-2xl bg-red-50 border border-red-200">
        <View className="flex-row items-center">
          <View className="bg-red-100 p-2 rounded-full mr-3">
            <Ionicons name="bluetooth" size={20} color="#dc2626" />
          </View>
          <View className="flex-1">
            <Text className="text-red-800 font-semibold">
              Bluetooth is Turned Off
            </Text>
            <Text className="text-red-600 text-sm mt-1">
              Please enable Bluetooth to scan for attendance devices
            </Text>
          </View>
        </View>
      </View>
    );
  }

  // ✅ If attendance is already marked, show auto-scanning mode only
  if (autoAttendanceMarked) {
    return (
      <View className="mx-4 mb-4">
        <View className="flex-row items-center justify-between mb-4">
          <Text className="text-lg font-bold text-gray-900">
            BLE Attendance Monitoring
          </Text>

          {studentBackgroundTaskRunning && (
            <View className="flex-row items-center">
              <View className="h-2 w-2 bg-green-500 rounded-full mr-1 animate-pulse" />
              <Text className="text-green-500 text-sm">Auto Scanning</Text>
            </View>
          )}
        </View>

        <View className="bg-green-50 p-4 rounded-2xl border border-green-200 mb-4">
          <View className="flex-row items-start">
            <View className="bg-green-100 p-2 rounded-full mr-3">
              <Ionicons name="checkmark-circle" size={20} color="#059669" />
            </View>
            <View className="flex-1">
              <Text className="text-green-800 font-medium">
                ✅ Attendance Recorded
              </Text>
              <Text className="text-green-700 text-sm mt-1">
                Your attendance has been successfully recorded via BLE
              </Text>
            </View>
          </View>
        </View>
      </View>
    );
  }

  // ✅ Manual scanning mode (attendance not marked yet)
  return (
    <View className="mx-4 mb-4">
      <View className="flex-row items-center justify-between mb-4">
        <Text className="text-lg font-bold text-gray-900">
          Available BLE Devices
        </Text>

        {scanning && (
          <View className="flex-row items-center">
            <View className="h-2 w-2 bg-green-500 rounded-full mr-1 animate-pulse" />
            <Text className="text-green-500 text-sm">Scanning</Text>
          </View>
        )}
      </View>

      <View className="bg-green-50 p-4 rounded-2xl border border-green-200 mb-4">
        <View className="flex-row items-start mb-2">
          <View className="bg-green-100 p-2 rounded-full mr-3">
            <Ionicons name="information-circle" size={20} color="#059669" />
          </View>
          <View className="flex-1">
            <Text className="text-green-800 font-medium">
              {sessionStatus === "active"
                ? scanCooldown
                  ? `Resumes in ${Math.floor(cooldownTimer / 60)}:${(cooldownTimer % 60).toString().padStart(2, "0")}`
                  : "Ready to scan"
                : "No active session"}
            </Text>

            {sessionStatus !== "active" && (
              <Text className="text-green-700 text-sm mt-1">
                Wait for instructor to start the attendance session
              </Text>
            )}
          </View>
        </View>

        {/* Show scan button only if no attendance marked and conditions are met */}
        {sessionStatus === "active" &&
          !scanning &&
          !scanCooldown &&
          !autoAttendanceMarked && (
            <TouchableOpacity
              onPress={handleStartScan}
              className="mt-3 bg-blue-600 py-3 px-4 rounded-xl flex-row items-center justify-center"
            >
              <Ionicons name="search" size={16} color="white" />
              <Text className="text-white ml-2 font-medium">
                Start Scanning
              </Text>
            </TouchableOpacity>
          )}

        {/* Show rescan button only if no attendance marked */}
        {scanCooldown && !autoAttendanceMarked && (
          <TouchableOpacity
            onPress={handleManualRescan}
            className="mt-3 bg-green-600 py-3 px-4 rounded-xl flex-row items-center justify-center"
          >
            <Ionicons name="refresh" size={16} color="white" />
            <Text className="text-white ml-2 font-medium">Rescan Now</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};

export default StudentView;