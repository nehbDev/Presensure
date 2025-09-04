import React from "react";
import { View, Text } from "react-native";
import { Device } from "react-native-ble-plx";

export interface StudentScheduleViewProps {
  sessionStatus: "active" | "inactive" | "unknown";
  matchedDevice: Device | null;
  autoAttendanceMarked: boolean;
  cooldownTimer: number;
  scanCooldown: boolean;
}

export default function StudentScheduleView({
  sessionStatus,
  matchedDevice,
  autoAttendanceMarked,
  cooldownTimer,
  scanCooldown,
}: StudentScheduleViewProps) {
  return (
    <View className="mt-4 p-4 bg-gray-100 rounded-lg shadow">
      <Text className="text-lg font-semibold mb-2">Student View</Text>
      <Text className="text-sm mb-1">Session: {sessionStatus}</Text>

      {matchedDevice ? (
        <Text className="text-sm text-green-600 mb-1">
          ✅ Device matched: {matchedDevice.name || "Unknown"}
        </Text>
      ) : (
        <Text className="text-sm text-red-500 mb-1">❌ No match yet</Text>
      )}

      {autoAttendanceMarked ? (
        <Text className="text-sm text-green-600">
          🎉 Attendance automatically marked
        </Text>
      ) : (
        <Text className="text-sm text-gray-500">Waiting for attendance...</Text>
      )}

      {scanCooldown && (
        <Text className="text-sm text-orange-500 mt-2">
          ⏸ Cooling down... rescan in {cooldownTimer}s
        </Text>
      )}
    </View>
  );
}
